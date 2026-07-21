<?php
/**
 * GeoJSON Import Utility
 * ----------------------
 * Reads GeoJSON files from the data/geojson/ folders on disk,
 * gzip-compresses them, and upserts them into MySQL.
 *
 * Usage (CLI):
 *   php server/import-geojson.php
 *
 * Usage (browser):
 *   http://localhost/GeoStratum/server/import-geojson.php
 *
 * It is safe to re-run: existing rows are updated (upsert via ON DUPLICATE KEY).
 *
 * ⚠ Remove or restrict access to this script in production once data is imported.
 */

declare(strict_types=1);

// Raise limits for large file processing (import is a one-time admin operation)
ini_set('memory_limit', '-1');
ini_set('max_execution_time', '0'); // Unlimited for batch import

require_once __DIR__ . '/../core/db.php';

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB hard cap

// Map each disk folder to its MySQL table
const FOLDER_MAP = [
    'cadastre' => 'geostratum_geojson_cadastre',
    'namria'   => 'geostratum_geojson_namria',
    'common'   => 'geostratum_geojson_common',
];

// Project root is one level above /server/
$project_root = dirname(__DIR__);

// ─── Helper: format bytes as human-readable string ───────────────────────────

function format_bytes(int $bytes): string
{
    if ($bytes >= 1_073_741_824) return round($bytes / 1_073_741_824, 2) . ' GB';
    if ($bytes >= 1_048_576)     return round($bytes / 1_048_576, 2) . ' MB';
    if ($bytes >= 1_024)         return round($bytes / 1_024, 2) . ' KB';
    return $bytes . ' B';
}

// ─── Helper: upsert a single file into the database ──────────────────────────

function import_file(PDO $pdo, string $table, string $filename, string $filepath): array
{
    $original_size = filesize($filepath);

    if ($original_size === false) {
        return ['status' => 'error', 'message' => 'Cannot stat file'];
    }

    if ($original_size > MAX_FILE_BYTES) {
        return [
            'status'  => 'error',
            'message' => 'File exceeds 200 MB limit (' . format_bytes($original_size) . ')',
        ];
    }

    $raw = file_get_contents($filepath);
    if ($raw === false) {
        return ['status' => 'error', 'message' => 'Cannot read file'];
    }

    // Quick validation without parsing the whole AST into memory
    if (function_exists('json_validate')) {
        if (!json_validate($raw)) {
            unset($raw);
            return ['status' => 'error', 'message' => 'Invalid JSON structure'];
        }
    } else {
        $firstChar = substr(ltrim($raw), 0, 1);
        if ($firstChar !== '{' && $firstChar !== '[') {
            unset($raw);
            return ['status' => 'error', 'message' => 'Invalid JSON (must start with { or [)'];
        }
    }

    // gzip compress at level 6 (good balance of speed vs size)
    $compressed = gzencode($raw, 6);
    unset($raw); // Immediately free raw JSON memory!

    if ($compressed === false) {
        return ['status' => 'error', 'message' => 'gzip compression failed'];
    }

    $compressed_size = strlen($compressed);

    // Upsert: insert new row or update geojson + file_size if filename already exists
    $sql = "
        INSERT INTO `{$table}` (filename, geojson, file_size)
        VALUES (:filename, :geojson, :file_size)
        ON DUPLICATE KEY UPDATE
            geojson    = VALUES(geojson),
            file_size  = VALUES(file_size),
            updated_at = CURRENT_TIMESTAMP
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':filename',  $filename,        PDO::PARAM_STR);
    $stmt->bindValue(':geojson',   $compressed,      PDO::PARAM_LOB);
    $stmt->bindValue(':file_size', $original_size,   PDO::PARAM_INT);
    $stmt->execute();

    unset($compressed);
    gc_collect_cycles();

    $ratio = $original_size > 0
        ? round((1 - $compressed_size / $original_size) * 100, 1)
        : 0;

    return [
        'status'          => 'ok',
        'original_size'   => format_bytes($original_size),
        'compressed_size' => format_bytes($compressed_size),
        'reduction'       => "{$ratio}%",
    ];
}

// ─── Collect all GeoJSON files from the three folders ────────────────────────

$jobs = []; // [ [table, filename, filepath], ... ]

foreach (FOLDER_MAP as $folder => $table) {
    $dir = "{$project_root}/data/geojson/{$folder}";

    if (!is_dir($dir)) {
        $jobs[] = ['table' => $table, 'filename' => null, 'filepath' => null, 'dir' => $dir, 'missing' => true];
        continue;
    }

    foreach (glob("{$dir}/*.{geojson,json}", GLOB_BRACE) as $filepath) {
        $jobs[] = [
            'table'    => $table,
            'filename' => basename($filepath),
            'filepath' => $filepath,
            'dir'      => $dir,
            'missing'  => false,
        ];
    }
}

// ─── Run imports and collect results ─────────────────────────────────────────

$is_cli    = PHP_SAPI === 'cli';
$results   = [];
$pdo       = null;
$pdo_error = null;

try {
    $pdo = get_pdo();
} catch (PDOException $e) {
    $pdo_error = $e->getMessage();
}

foreach ($jobs as $job) {
    if ($job['missing']) {
        $results[] = array_merge($job, ['status' => 'error', 'message' => "Directory not found: {$job['dir']}"]);
        continue;
    }

    if ($pdo === null) {
        $results[] = array_merge($job, ['status' => 'error', 'message' => "DB connection failed: {$pdo_error}"]);
        continue;
    }

    try {
        $outcome = import_file($pdo, $job['table'], $job['filename'], $job['filepath']);
    } catch (JsonException $e) {
        $outcome = ['status' => 'error', 'message' => 'Invalid JSON: ' . $e->getMessage()];
    } catch (PDOException $e) {
        $outcome = ['status' => 'error', 'message' => 'DB error: ' . $e->getMessage()];
    }

    $results[] = array_merge($job, $outcome);
}

// ─── Output ───────────────────────────────────────────────────────────────────

if ($is_cli) {
    // ── CLI output ──
    $pass = 0;
    $fail = 0;

    echo "\nGeoStratum — GeoJSON Import\n";
    echo str_repeat('─', 80) . "\n";

    $current_table = null;
    foreach ($results as $r) {
        if ($r['table'] !== $current_table) {
            $current_table = $r['table'];
            echo "\n[{$current_table}]\n";
        }

        if ($r['missing']) {
            echo "  ⚠  Directory not found: {$r['dir']}\n";
            $fail++;
            continue;
        }

        $icon = $r['status'] === 'ok' ? '✓' : '✗';
        if ($r['status'] === 'ok') {
            echo "  {$icon}  {$r['filename']}  |  {$r['original_size']} → {$r['compressed_size']}  ({$r['reduction']} smaller)\n";
            $pass++;
        } else {
            echo "  {$icon}  {$r['filename']}  |  ERROR: {$r['message']}\n";
            $fail++;
        }
    }

    echo "\n" . str_repeat('─', 80) . "\n";
    echo "Done.  Imported: {$pass}   Failed: {$fail}\n\n";
} else {
    // ── Browser output ──
    $total   = count(array_filter($results, fn($r) => !$r['missing'] && isset($r['filename'])));
    $ok      = count(array_filter($results, fn($r) => $r['status'] === 'ok'));
    $errors  = $total - $ok;
    ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>GeoStratum — GeoJSON Import</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0b0e14; color: #f4f7fa; padding: 2rem; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    .subtitle { color: #6e7786; font-size: 0.9rem; margin-bottom: 2rem; }
    .summary { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
    .badge { padding: 0.4rem 0.9rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; }
    .badge-ok  { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
    .badge-err { background: rgba(239,68,68,0.15);  color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); color: #6e7786; font-weight: 500; }
    td { padding: 0.55rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
    tr:hover td { background: rgba(255,255,255,0.03); }
    .ok   { color: #10b981; }
    .err  { color: #ef4444; }
    .group-row td { background: rgba(37,99,235,0.07); color: #60a5fa; font-weight: 600; padding: 0.4rem 0.75rem; font-size: 0.78rem; letter-spacing: 0.05em; text-transform: uppercase; }
    .warn { color: #f59e0b; }
  </style>
</head>
<body>
  <h1>GeoStratum — GeoJSON Import</h1>
  <p class="subtitle">Reads GeoJSON files from <code>data/geojson/</code> and upserts them into MySQL with gzip compression.</p>

  <div class="summary">
    <span class="badge badge-ok">✓ Imported: <?= $ok ?></span>
    <?php if ($errors > 0): ?>
    <span class="badge badge-err">✗ Failed: <?= $errors ?></span>
    <?php endif; ?>
  </div>

  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Table</th>
        <th>Original</th>
        <th>Compressed</th>
        <th>Reduction</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <?php
      $current_table = null;
      foreach ($results as $r):
        if ($r['table'] !== $current_table):
          $current_table = $r['table'];
      ?>
      <tr class="group-row"><td colspan="6"><?= htmlspecialchars($current_table) ?></td></tr>
      <?php endif; ?>
      <tr>
        <?php if ($r['missing']): ?>
          <td colspan="5" class="warn">Directory not found: <?= htmlspecialchars($r['dir']) ?></td>
          <td class="err">✗ Missing</td>
        <?php elseif ($r['status'] === 'ok'): ?>
          <td><?= htmlspecialchars($r['filename']) ?></td>
          <td style="color:#6e7786"><?= htmlspecialchars($r['table']) ?></td>
          <td><?= htmlspecialchars($r['original_size']) ?></td>
          <td><?= htmlspecialchars($r['compressed_size']) ?></td>
          <td class="ok"><?= htmlspecialchars($r['reduction']) ?> smaller</td>
          <td class="ok">✓ OK</td>
        <?php else: ?>
          <td><?= htmlspecialchars($r['filename'] ?? '—') ?></td>
          <td style="color:#6e7786"><?= htmlspecialchars($r['table']) ?></td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td class="err">✗ <?= htmlspecialchars($r['message']) ?></td>
        <?php endif; ?>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <p style="margin-top:1.5rem; color:#6e7786; font-size:0.8rem;">
    ⚠ Remove or restrict access to this file once all data has been imported.
  </p>
</body>
</html>
<?php } ?>
