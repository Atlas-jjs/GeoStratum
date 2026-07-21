<?php
/**
 * GeoJSON Serve Endpoint
 * ----------------------
 * Serves gzip-compressed GeoJSON assets stored in MySQL.
 *
 * Usage:
 *   GET server/geojson.php?path=data/geojson/cadastre/CAR_CAD_Boundary.geojson
 *
 * The browser receives Content-Encoding: gzip and decompresses transparently,
 * so fetch() in JavaScript sees plain JSON — no client-side changes needed.
 *
 * Table mapping:
 *   data/geojson/cadastre/ → geostratum_geojson_cadastre
 *   data/geojson/namria/   → geostratum_geojson_namria
 *   data/geojson/common/   → geostratum_geojson_common
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/db.php';

// ─── CORS headers (same-origin only in production) ───────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// ─── Request validation ───────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$rawPath = trim($_GET['path'] ?? '');

if ($rawPath === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required parameter: path']);
    exit;
}

// Block path traversal attempts
if (str_contains($rawPath, '..') || str_contains($rawPath, "\0")) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid path']);
    exit;
}

// ─── Path → table mapping ─────────────────────────────────────────────────────

/**
 * Maps a URL path segment to a MySQL table name.
 * Only the three known folders are accepted.
 *
 * @param string $path  e.g. "data/geojson/cadastre/CAR_CAD_Boundary.geojson"
 * @return array{table: string, filename: string}|null
 */
function resolve_path(string $path): ?array
{
    $folder_map = [
        'cadastre' => 'geostratum_geojson_cadastre',
        'namria'   => 'geostratum_geojson_namria',
        'common'   => 'geostratum_geojson_common',
    ];

    // Expect exactly: data/geojson/{folder}/{filename}
    $parts = explode('/', $path);
    if (count($parts) !== 4 || $parts[0] !== 'data' || $parts[1] !== 'geojson') {
        return null;
    }

    $folder   = $parts[2];
    $filename = $parts[3];

    if (!isset($folder_map[$folder])) {
        return null;
    }

    // Filename must be a valid .geojson or .json file
    if (!preg_match('/^[\w\-\.]+\.(geojson|json)$/i', $filename)) {
        return null;
    }

    return [
        'table'    => $folder_map[$folder],
        'filename' => $filename,
    ];
}

$resolved = resolve_path($rawPath);

if ($resolved === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Unrecognised path. Allowed folders: cadastre, namria, common.']);
    exit;
}

// ─── Database query ───────────────────────────────────────────────────────────

try {
    $pdo = get_pdo();

    // Table name is safe — it came from our own whitelist, not user input
    $table = $resolved['table'];
    $stmt  = $pdo->prepare("SELECT `geojson` FROM `{$table}` WHERE `filename` = ? LIMIT 1");
    $stmt->execute([$resolved['filename']]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    exit;
}

if ($row === false || $row['geojson'] === null) {
    http_response_code(404);
    echo json_encode([
        'error'    => 'GeoJSON file not found in database.',
        'filename' => $resolved['filename'],
        'hint'     => 'Run server/import-geojson.php to import files from disk.',
    ]);
    exit;
}

// ─── Stream the compressed response ──────────────────────────────────────────

$compressed = $row['geojson'];

// Disable output buffering so PHP doesn't hold the whole response in memory
if (ob_get_level()) {
    ob_end_clean();
}

header('Content-Type: application/json; charset=utf-8');
header('Content-Encoding: gzip');
header('Content-Length: ' . strlen($compressed));
header('Cache-Control: public, max-age=86400'); // Cache for 1 day
header('Vary: Accept-Encoding');

echo $compressed;
exit;
