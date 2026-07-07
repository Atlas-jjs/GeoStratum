-- Bare-bones schema for custom imported layers (GeoJSON / Shapefile imports).
-- Run this once against your MySQL instance:
--   mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS geoportal;
USE geoportal;

CREATE TABLE IF NOT EXISTS custom_layers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  panel         ENUM('cad', 'namria') NOT NULL,
  name          VARCHAR(255) NOT NULL,
  color         VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
  fill_opacity  DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  weight        DECIMAL(3,1) NOT NULL DEFAULT 1,
  geojson       LONGTEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_panel (panel)
);
