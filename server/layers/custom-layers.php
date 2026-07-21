<?php
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
session_start();

require __DIR__ . '/../core/db.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function send_json($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Enforce authentication
if (!isset($_SESSION['user_id'])) {
    send_json(['error' => 'Unauthorized. Please sign in.'], 401);
}

$userId = (int)$_SESSION['user_id'];

function row_to_api(array $row): array
{
    return [
        'id'          => (int) $row['id'],
        'panel'       => $row['panel'],
        'name'        => $row['name'],
        'color'       => $row['color'],
        'fillOpacity' => (float) $row['fill_opacity'],
        'weight'      => (float) $row['weight'],
        'geojson'     => json_decode($row['geojson'], true),
        'createdAt'   => $row['created_at'],
        'updatedAt'   => $row['updated_at'],
    ];
}

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    $pdo = get_pdo();

    switch ($method) {
        case 'GET':
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM geostratum_imported_layers WHERE id = ? AND user_id = ?');
                $stmt->execute([$id, $userId]);
                $row = $stmt->fetch();
                if (!$row) {
                    send_json(['error' => 'Not found'], 404);
                }
                send_json(row_to_api($row));
            }

            $panel = $_GET['panel'] ?? null;
            if ($panel) {
                $stmt = $pdo->prepare(
                    'SELECT * FROM geostratum_imported_layers WHERE user_id = ? AND panel = ? ORDER BY created_at DESC'
                );
                $stmt->execute([$userId, $panel]);
            } else {
                $stmt = $pdo->prepare('SELECT * FROM geostratum_imported_layers WHERE user_id = ? ORDER BY created_at DESC');
                $stmt->execute([$userId]);
            }
            send_json(array_map('row_to_api', $stmt->fetchAll()));
            break;

        case 'POST':
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            if (empty($body['panel']) || empty($body['name']) || empty($body['geojson'])) {
                send_json(['error' => 'panel, name, and geojson are required'], 400);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO geostratum_imported_layers (user_id, panel, name, color, fill_opacity, weight, geojson)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId,
                $body['panel'],
                $body['name'],
                $body['color'] ?? '#3b82f6',
                $body['fillOpacity'] ?? 0.5,
                $body['weight'] ?? 1,
                json_encode($body['geojson']),
            ]);

            send_json(['id' => (int) $pdo->lastInsertId()], 201);
            break;

        case 'PUT':
            if (!$id) {
                send_json(['error' => 'id is required'], 400);
            }
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            // Verify ownership first
            $stmt = $pdo->prepare('SELECT id FROM geostratum_imported_layers WHERE id = ? AND user_id = ?');
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetch()) {
                send_json(['error' => 'Forbidden'], 403);
            }

            $stmt = $pdo->prepare(
                'UPDATE geostratum_imported_layers
                 SET name = ?, color = ?, fill_opacity = ?, weight = ?, geojson = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([
                $body['name'] ?? '',
                $body['color'] ?? '#3b82f6',
                $body['fillOpacity'] ?? 0.5,
                $body['weight'] ?? 1,
                json_encode($body['geojson'] ?? null),
                $id,
                $userId
            ]);

            send_json(['ok' => true]);
            break;

        case 'DELETE':
            if (!$id) {
                send_json(['error' => 'id is required'], 400);
            }

            // Verify ownership first
            $stmt = $pdo->prepare('SELECT id FROM geostratum_imported_layers WHERE id = ? AND user_id = ?');
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetch()) {
                send_json(['error' => 'Forbidden'], 403);
            }

            $stmt = $pdo->prepare('DELETE FROM geostratum_imported_layers WHERE id = ? AND user_id = ?');
            $stmt->execute([$id, $userId]);
            send_json(['ok' => true]);
            break;

        default:
            send_json(['error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    send_json(['error' => 'Server error: ' . $e->getMessage()], 500);
}