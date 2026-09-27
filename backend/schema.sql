-- Database creation
CREATE DATABASE IF NOT EXISTS `restaurant_cash_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `restaurant_cash_db`;

-- Create Database User & Grant Privileges
CREATE USER IF NOT EXISTS 'cash_admin'@'localhost' IDENTIFIED BY 'CashManager#2026';
CREATE USER IF NOT EXISTS 'cash_admin'@'127.0.0.1' IDENTIFIED BY 'CashManager#2026';
CREATE USER IF NOT EXISTS 'cash_admin'@'%' IDENTIFIED BY 'CashManager#2026';

GRANT ALL PRIVILEGES ON restaurant_cash_db.* TO 'cash_admin'@'localhost';
GRANT ALL PRIVILEGES ON restaurant_cash_db.* TO 'cash_admin'@'127.0.0.1';
GRANT ALL PRIVILEGES ON restaurant_cash_db.* TO 'cash_admin'@'%';
FLUSH PRIVILEGES;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `username` VARCHAR(80) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `issuperadmin` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Bills Table
CREATE TABLE IF NOT EXISTS `bills` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `bill_number` INT NOT NULL,
  `bill_date` DATE NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'open',
  `amount` DECIMAL(10, 2) NULL,
  `parcel_type` VARCHAR(20) NULL,
  `created_by` INT UNSIGNED NULL,
  `paid_at` TIMESTAMP NULL,
  `parcel_sent_at` TIMESTAMP NULL,
  `parcel_paid_at` TIMESTAMP NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Notes Table
CREATE TABLE IF NOT EXISTS `notes` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `note_date` DATE NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY `unique_user_note_date` (`user_id`, `note_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Initial Seed Data
-- Default Superadmin User (Username: admin, Password: admin123)
INSERT INTO `users` (`id`, `name`, `username`, `password_hash`, `issuperadmin`, `is_active`)
VALUES (1, 'System Superadmin', 'admin', '$2a$10$k1w1wZ.zS0zCg5eK.Z.Q.e2dF2.4f7n/Z9W5u/M3J5C/W.U9u', 1, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Ahmed Superadmin User (Username: ahmed, Password: 1980)
INSERT INTO `users` (`name`, `username`, `password_hash`, `issuperadmin`, `is_active`)
VALUES ('Ahmed', 'ahmed', '$2b$10$gZhJtvjHxyNJGHh.WcSsDeCUv6Oj3twb3bvZYkrs8UshnLB34D.7.', 1, 1)
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`), `issuperadmin` = 1, `is_active` = 1;
