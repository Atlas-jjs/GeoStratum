-- Schema for GeoStratum user management and custom layers.
-- Run this once against your MySQL instance:
--   C:\xampp\mysql\bin\mysql.exe -u root < server/schema.sql

CREATE DATABASE IF NOT EXISTS denr_geostratum;
USE denr_geostratum;

CREATE TABLE IF NOT EXISTS geostratum_users (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(100) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geostratum_imported_layers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  panel         ENUM('cad', 'namria') NOT NULL,
  name          VARCHAR(255) NOT NULL,
  color         VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
  fill_opacity  DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  weight        DECIMAL(3,1) NOT NULL DEFAULT 1,
  geojson       LONGTEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_panel (panel),
  INDEX idx_user (user_id),
  CONSTRAINT fk_geostratum_imported_layers_user FOREIGN KEY (user_id) REFERENCES geostratum_users(id) ON DELETE CASCADE
);
