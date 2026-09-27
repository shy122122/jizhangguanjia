-- =============================================================================
-- 明账 · 用户头像上传增量迁移
--
-- 适用范围：已存在的 mingzhang 数据库。脚本可重复执行，不删除已有业务数据。
-- =============================================================================

USE `mingzhang`;

CREATE TABLE IF NOT EXISTS `user_avatar` (
    `user_id`          BIGINT UNSIGNED NOT NULL,
    `public_id`        CHAR(32)        NOT NULL,
    `mime_type`        VARCHAR(32)     NOT NULL,
    `file_size`        INT UNSIGNED    NOT NULL,
    `content_sha256`   CHAR(64)        NOT NULL,
    `image_data`       MEDIUMBLOB      NOT NULL,
    `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `uk_user_avatar_public_id` (`public_id`),
    CONSTRAINT `fk_user_avatar_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
    CONSTRAINT `ck_user_avatar_size` CHECK (`file_size` > 0 AND `file_size` <= 5242880)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户自定义头像（最大 5MB）';
