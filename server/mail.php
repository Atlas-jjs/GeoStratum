<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/PHPMailer/src/Exception.php';
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';

/**
 * Sends a password reset OTP using Gmail SMTP via PHPMailer.
 *
 * @param string $to_email The recipient email address.
 * @param string $otp The 6-digit OTP code.
 * @return bool True on success, throws an Exception on failure.
 */
function send_otp_email(string $to_email, string $otp): bool
{
    $config = require __DIR__ . '/config.php';

    $smtp_host = $config['smtp_host'] ?? 'smtp.gmail.com';
    $smtp_port = (int)($config['smtp_port'] ?? 587);
    $smtp_user = $config['smtp_user'] ?? '';
    $smtp_password = $config['smtp_password'] ?? '';

    if (empty($smtp_user) || empty($smtp_password) || $smtp_user === 'your-gmail@gmail.com') {
        throw new Exception("Gmail SMTP credentials are not configured. Please set 'smtp_user' and 'smtp_password' in server/config.php");
    }

    $mail = new PHPMailer(true);

    try {
        // Server settings
        $mail->isSMTP();
        $mail->Host       = $smtp_host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtp_user;
        $mail->Password   = $smtp_password;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $smtp_port;

        // Recipients
        $mail->setFrom($smtp_user, 'GeoStratum Security');
        $mail->addAddress($to_email);

        // Content
        $mail->isHTML(true);
        $mail->Subject = 'GeoStratum Password Reset OTP';
        $mail->Body    = "
            <div style=\"font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;\">
                <h2 style=\"color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;\">GeoStratum Security</h2>
                <p>Hello,</p>
                <p>We received a request to reset your password. Use the following One-Time Password (OTP) to complete the process:</p>
                <div style=\"background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #3b82f6; border-radius: 6px; margin: 20px 0;\">
                    {$otp}
                </div>
                <p>This OTP is valid for <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email and your password will remain unchanged.</p>
                <br>
                <hr style=\"border: none; border-top: 1px solid #e5e7eb;\">
                <p style=\"font-size: 12px; color: #9ca3af; text-align: center;\">This is an automated message. Please do not reply directly to this email.</p>
            </div>
        ";
        $mail->AltBody = "Your GeoStratum Password Reset OTP is: {$otp}. It is valid for 10 minutes.";

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log("PHPMailer Exception: " . $mail->ErrorInfo);
        throw new Exception("Failed to send email. Mailer Error: " . $mail->ErrorInfo);
    }
}
