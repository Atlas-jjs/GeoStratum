<?php

return [
    'host'     => getenv('DB_HOST') ?: 'localhost',
    'port'     => getenv('DB_PORT') ?: '3306',
    'database' => getenv('DB_NAME') ?: 'denr_geostratum',
    'user'     => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    // SMTP settings for Gmail OTP delivery (PHPMailer)
    'smtp_host'     => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
    'smtp_port'     => getenv('SMTP_PORT') ?: 587,
    'smtp_user'     => getenv('SMTP_USER') ?: 'denr.ojt.geostratum@gmail.com',
    'smtp_password' => getenv('SMTP_PASS') ?: 'lfdmrqjyzdlsnstu
',
];
