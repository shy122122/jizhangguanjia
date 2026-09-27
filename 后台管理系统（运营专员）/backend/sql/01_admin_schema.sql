-- 明账后台管理系统专属表。
-- 硬约束：只 CREATE 后台自己的表，不修改 C 端任何表、视图、索引或约束。

CREATE TABLE IF NOT EXISTS `admin_user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(50) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 2=停用',
  `token_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `login_fail_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME DEFAULT NULL,
  `last_login_at` DATETIME DEFAULT NULL,
  `last_login_ip` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_username` (`username`),
  CONSTRAINT `ck_admin_status` CHECK (`status` IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台管理账号';

CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id` BIGINT UNSIGNED NOT NULL,
  `admin_label` VARCHAR(100) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` VARCHAR(64) DEFAULT NULL,
  `target_label` VARCHAR(255) NOT NULL,
  `before_json` JSON DEFAULT NULL,
  `after_json` JSON DEFAULT NULL,
  `reason` VARCHAR(200) NOT NULL,
  `ip` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created` (`created_at` DESC),
  KEY `idx_audit_admin` (`admin_id`, `created_at` DESC),
  KEY `idx_audit_action` (`action`, `created_at` DESC),
  KEY `idx_audit_target` (`target_type`, `target_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台操作审计，只追加不修改';

CREATE TABLE IF NOT EXISTS `user_daily_active` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `active_date` DATE NOT NULL,
  `request_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `active_date`),
  KEY `idx_daily_active_date` (`active_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='按日去重的用户活跃聚合';

CREATE TABLE IF NOT EXISTS `category_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(20) NOT NULL,
  `type` ENUM('expense','income') NOT NULL,
  `icon` VARCHAR(50) DEFAULT NULL,
  `color` CHAR(7) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_category_template_type_name` (`type`, `name`),
  KEY `idx_category_template_enabled` (`type`, `is_enabled`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='新用户默认分类模板';

CREATE TABLE IF NOT EXISTS `account_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `type` ENUM('cash','wechat','alipay','bank','credit') NOT NULL,
  `icon` VARCHAR(50) DEFAULT NULL,
  `color` CHAR(7) DEFAULT NULL,
  `initial_balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `credit_limit` DECIMAL(12,2) DEFAULT NULL,
  `bill_due` DECIMAL(12,2) DEFAULT NULL,
  `card_tail` CHAR(4) DEFAULT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_template_type_name` (`type`, `name`),
  KEY `idx_account_template_enabled` (`is_enabled`, `sort_order`),
  CONSTRAINT `ck_account_template_credit` CHECK (
    `type` = 'credit' OR (`credit_limit` IS NULL AND `bill_due` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='新用户默认账户模板';
