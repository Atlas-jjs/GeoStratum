<?php
// Session configuration for security
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
session_start();

require __DIR__ . '/db.php';
require __DIR__ . '/mail.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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

function normalize_answer(string $answer): string
{
    return strtolower(trim($answer));
}

$action = $_GET['action'] ?? '';
$pdo = get_pdo();

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if ($action === 'status') {
                if (isset($_SESSION['user_id'])) {
                    send_json([
                        'loggedIn' => true,
                        'user' => [
                            'id' => (int)$_SESSION['user_id'],
                            'email' => $_SESSION['email'] ?? ''
                        ]
                    ]);
                } else {
                    send_json(['loggedIn' => false]);
                }
            } elseif ($action === 'send_otp') {
                $email = trim($_GET['email'] ?? '');
                if (empty($email)) {
                    send_json(['error' => 'Email address is required'], 400);
                }

                $stmt = $pdo->prepare('SELECT * FROM geostratum_users WHERE email = ?');
                $stmt->execute([$email]);
                $user = $stmt->fetch();

                if (!$user) {
                    send_json(['error' => 'User not found'], 404);
                }

                // Generate 6-digit OTP
                $otp = sprintf('%06d', random_int(0, 999999));

                // Save OTP to session
                $_SESSION['reset_otp'] = $otp;
                $_SESSION['reset_email'] = $user['email'];
                $_SESSION['reset_time'] = time();

                // Send email
                try {
                    send_otp_email($user['email'], $otp);
                    send_json(['ok' => true, 'message' => 'OTP sent successfully to registered email']);
                } catch (Throwable $mailEx) {
                    send_json(['error' => 'Failed to send email: ' . $mailEx->getMessage()], 500);
                }
            } else {
                send_json(['error' => 'Invalid action'], 400);
            }
            break;

        case 'POST':
            $body = json_decode(file_get_contents('php://input'), true) ?? [];

            if ($action === 'register') {
                $email = trim($body['email'] ?? '');
                $password = $body['password'] ?? '';

                if (empty($email) || empty($password)) {
                    send_json(['error' => 'All fields are required'], 400);
                }

                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    send_json(['error' => 'Invalid email address'], 400);
                }

                // Check email uniqueness
                $stmt = $pdo->prepare('SELECT id FROM geostratum_users WHERE email = ?');
                $stmt->execute([$email]);
                if ($stmt->fetch()) {
                    send_json(['error' => 'Email already exists'], 400);
                }

                // Insert user
                $passwordHash = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare(
                    'INSERT INTO geostratum_users (email, password_hash)
                     VALUES (?, ?)'
                );
                $stmt->execute([
                    $email,
                    $passwordHash
                ]);

                $userId = (int)$pdo->lastInsertId();

                // Log in the user immediately
                $_SESSION['user_id'] = $userId;
                $_SESSION['email'] = $email;

                send_json([
                    'loggedIn' => true,
                    'user' => [
                        'id' => $userId,
                        'email' => $email
                    ]
                ], 201);
            } elseif ($action === 'login') {
                $email = trim($body['email'] ?? '');
                $password = $body['password'] ?? '';

                if (empty($email) || empty($password)) {
                    send_json(['error' => 'Email and password are required'], 400);
                }

                $stmt = $pdo->prepare('SELECT * FROM geostratum_users WHERE email = ?');
                $stmt->execute([$email]);
                $user = $stmt->fetch();

                if (!$user || !password_verify($password, $user['password_hash'])) {
                    send_json(['error' => 'Invalid email or password'], 401);
                }

                $_SESSION['user_id'] = (int)$user['id'];
                $_SESSION['email'] = $user['email'];

                send_json([
                    'loggedIn' => true,
                    'user' => [
                        'id' => (int)$user['id'],
                        'email' => $user['email']
                    ]
                ]);
            } elseif ($action === 'logout') {
                $_SESSION = [];
                if (ini_get("session.use_cookies")) {
                    $params = session_get_cookie_params();
                    setcookie(session_name(), '', time() - 42000,
                        $params["path"], $params["domain"],
                        $params["secure"], $params["httponly"]
                    );
                }
                session_destroy();
                send_json(['ok' => true]);
            } elseif ($action === 'reset_password') {
                $email = trim($body['email'] ?? '');
                $otp = trim($body['otp'] ?? '');
                $newPassword = $body['new_password'] ?? '';

                if (empty($email) || empty($otp) || empty($newPassword)) {
                    send_json(['error' => 'All fields are required'], 400);
                }

                $stmt = $pdo->prepare('SELECT * FROM geostratum_users WHERE email = ?');
                $stmt->execute([$email]);
                $user = $stmt->fetch();

                if (!$user) {
                    send_json(['error' => 'User not found'], 404);
                }

                // Verify OTP
                if (!isset($_SESSION['reset_otp']) || !isset($_SESSION['reset_email']) || !isset($_SESSION['reset_time'])) {
                    send_json(['error' => 'No active password reset request found. Please request a new OTP.'], 400);
                }

                if (time() - $_SESSION['reset_time'] > 600) { // 10 minutes expiry
                    unset($_SESSION['reset_otp'], $_SESSION['reset_email'], $_SESSION['reset_time']);
                    send_json(['error' => 'OTP has expired. Please request a new one.'], 400);
                }

                if (trim($_SESSION['reset_otp']) !== $otp) {
                    send_json(['error' => 'Invalid OTP'], 400);
                }

                if (strtolower($_SESSION['reset_email']) !== strtolower($user['email'])) {
                    send_json(['error' => 'Email mismatch'], 400);
                }

                // Update password
                $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare('UPDATE geostratum_users SET password_hash = ? WHERE id = ?');
                $stmt->execute([$newHash, $user['id']]);

                // Clear session OTP variables
                unset($_SESSION['reset_otp'], $_SESSION['reset_email'], $_SESSION['reset_time']);

                send_json(['ok' => true]);
            } else {
                send_json(['error' => 'Invalid action'], 400);
            }
            break;

        default:
            send_json(['error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    send_json(['error' => 'Server error: ' . $e->getMessage()], 500);
}
