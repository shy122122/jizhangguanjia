-- =============================================================================
-- 明账 · 已有开发库增量修复
--
-- 适用范围：已经执行过 01_schema.sql、且需要保留现有数据的数据库。
-- 新建数据库直接执行最新的 01_schema.sql，不需要再执行本文件。
-- 本脚本不删除业务数据，但属于一次性迁移：同一数据库只执行一次。
-- =============================================================================

USE `mingzhang`;

-- 1. 让改密码、退出登录可以立即吊销旧 JWT。
ALTER TABLE `user`
    ADD COLUMN `token_version` INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'JWT 会话版本；退出登录/改密码时递增，使旧 token 立即失效'
    AFTER `locked_until`;

-- 2. 批次号只需在账本内唯一。旧的全库唯一键会导致不同用户同日导入冲突。
ALTER TABLE `import_batch`
    DROP INDEX `uk_batch_no`,
    ADD UNIQUE KEY `uk_batch_ledger_no` (`ledger_id`, `batch_no`);

-- 3. 服务端强制普通流水删除后只有 5 秒撤销窗口。
ALTER TABLE `transaction`
    ADD COLUMN `deleted_at` DATETIME DEFAULT NULL
    COMMENT '软删除时间；普通流水仅允许在删除后 5 秒内恢复'
    AFTER `is_deleted`;

-- 仅升级内置演示账号；真实用户密码不受影响。
UPDATE `user`
   SET `password_hash` = '$2b$10$3Qa4JjYrrUkqSdwz6H865.aSCsQSMgDhtcKFCFD0YlGuEnHFkVddW'
 WHERE `email` = 'demo@mingzhang.app'
   AND `password_hash` = '$2b$10$uuvE7o.QEmWWm/xvqV3fW.qqjth2KhdhcCceBxuZwxLY4ejTb4rkC';

-- 4. 超支后今日可花最低为 0。
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_today_quota` AS
SELECT
    p.`ledger_id`,
    p.`period_value`,
    p.`total_amount`,
    p.`spent`,
    p.`remaining`,
    p.`used_pct`,
    p.`alert_level`,
    p.`safe_spend_mode`,
    p.`period_end_date`,
    p.`remaining_days`,
    ROUND(GREATEST(p.`remaining`, 0) / p.`remaining_days`, 2) AS `today_quota`,
    CURDATE() AS `calc_date`
FROM `v_budget_progress` p
WHERE p.`period_value` = DATE_FORMAT(CURDATE(), '%Y-%m')
  AND p.`remaining_days` IS NOT NULL
  AND p.`remaining_days` > 0;
