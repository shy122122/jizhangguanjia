-- =============================================================================
--  明账 MingZhang · 统计视图
-- -----------------------------------------------------------------------------
--  前置 : 必须先执行 01_schema.sql、02_seed.sql
--  依据 : PRD 4.4「预算穿透」+ 4.6「统计」+ 6.3「余额不落库」
--  日期 : 2026-09-24
-- -----------------------------------------------------------------------------
--  为什么用视图而不是缓存字段：
--    PRD 6.3 明确「账户余额是计算值，不落库」。这避免了每写一笔流水都要
--    改余额、并处理并发一致性的问题 —— 代价是每次查询都要聚合。
--    在流水量级（个人记账，月均几百笔）下这个代价可以忽略。
--
--  视图一律 SQL SECURITY INVOKER：权限按【调用者】判定，而不是按创建者。
--  否则换一个数据库账号执行本脚本，视图就会带上上一任 DEFINER，反而更不安全。
-- =============================================================================

USE `mingzhang`;


-- =============================================================================
--  1. v_account_balance —— 账户当前余额
-- -----------------------------------------------------------------------------
--  余额 = 初始余额
--       + Σ 收入
--       - Σ 支出
--       - Σ 转出（type='transfer' 且 account_id 为本账户）
--       + Σ 转入（type='transfer' 且 to_account_id 为本账户）
--  所有分项均排除已软删除的流水（is_deleted = 1）。
--
--  ⚠️ 信用卡要特别小心，它的方向和其他账户【相反】：
--       其他账户：支出让 balance 变小（钱花掉了）
--       信用卡　：支出让 credit_used 变大（欠款变多了）
--     所以信用卡不要读 balance，要读 credit_used / credit_available。
--     balance 列的统一定义不变（净资产口径），信用卡上它是负值，等于 −credit_used
--     （前提是 initial_balance = 0）。
--
--     credit_used = 初始已用 + Σ支出 − Σ收入 + Σ转出 − Σ转入
--       其中「转入」是【还款】（储蓄卡 → 信用卡的转账），会减少欠款，
--       所以是减号。这个符号很容易写反，改动时请连同下面的断言一起重跑。
--     bill_due（当期待还）是银行给的【外部事实】，不是从流水推出来的，不参与本公式。
-- =============================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_account_balance` AS
SELECT
    a.`id`              AS `account_id`,
    a.`ledger_id`,
    a.`name`,
    a.`type`,
    a.`icon`,
    a.`color`,
    a.`card_tail`,
    a.`credit_limit`,
    a.`bill_due`,
    a.`is_default`,
    a.`sort_order`,
    a.`is_archived`,
    a.`initial_balance`,
    COALESCE(g.`income_sum`,   0) AS `income_sum`,
    COALESCE(g.`expense_sum`,  0) AS `expense_sum`,
    COALESCE(g.`transfer_in`,  0) AS `transfer_in`,
    COALESCE(g.`transfer_out`, 0) AS `transfer_out`,
    a.`initial_balance`
        + COALESCE(g.`income_sum`,   0)
        - COALESCE(g.`expense_sum`,  0)
        - COALESCE(g.`transfer_out`, 0)
        + COALESCE(g.`transfer_in`,  0) AS `balance`,
    -- 信用卡专用：已用额度 / 剩余可用额度。非信用卡账户这两列为 NULL。
    CASE WHEN a.`type` = 'credit'
         THEN a.`initial_balance`
              + COALESCE(g.`expense_sum`,  0)
              - COALESCE(g.`income_sum`,   0)
              + COALESCE(g.`transfer_out`, 0)
              - COALESCE(g.`transfer_in`,  0)
         ELSE NULL
    END AS `credit_used`,
    CASE WHEN a.`type` = 'credit' AND a.`credit_limit` IS NOT NULL
         THEN a.`credit_limit`
              - (a.`initial_balance`
                 + COALESCE(g.`expense_sum`,  0)
                 - COALESCE(g.`income_sum`,   0)
                 + COALESCE(g.`transfer_out`, 0)
                 - COALESCE(g.`transfer_in`,  0))
         ELSE NULL
    END AS `credit_available`
FROM `account` a
LEFT JOIN (
    SELECT
        `acct_id`,
        SUM(`income`)       AS `income_sum`,
        SUM(`expense`)      AS `expense_sum`,
        SUM(`transfer_in`)  AS `transfer_in`,
        SUM(`transfer_out`) AS `transfer_out`
    FROM (
        -- 本账户作为【转出方/收支方】的所有流水
        SELECT
            `account_id` AS `acct_id`,
            CASE WHEN `type` = 'income'  THEN `amount` ELSE 0 END AS `income`,
            CASE WHEN `type` = 'expense' THEN `amount` ELSE 0 END AS `expense`,
            0 AS `transfer_in`,
            CASE WHEN `type` = 'transfer' THEN `amount` ELSE 0 END AS `transfer_out`
        FROM `transaction`
        WHERE `is_deleted` = 0
        UNION ALL
        -- 本账户作为【转入方】的流水（仅转账）
        SELECT
            `to_account_id` AS `acct_id`,
            0, 0,
            `amount` AS `transfer_in`,
            0
        FROM `transaction`
        WHERE `is_deleted` = 0
          AND `type` = 'transfer'
          AND `to_account_id` IS NOT NULL
    ) parts
    GROUP BY `acct_id`
) g ON g.`acct_id` = a.`id`;


-- =============================================================================
--  2. v_category_month_spend —— 分类 × 月份 支出/收入汇总
-- -----------------------------------------------------------------------------
--  只包含【真实发生过】的分类，未使用的分类不出现（前端饼图/排行要的就是这个）。
--  转账不计入 —— 转账不是收支，只是钱在账户之间移动（PRD 6.3）。
-- =============================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_category_month_spend` AS
SELECT
    c.`id`          AS `category_id`,
    c.`ledger_id`,
    c.`name`        AS `category_name`,
    c.`type`        AS `category_type`,
    c.`icon`,
    c.`color`,
    c.`sort_order`,
    DATE_FORMAT(t.`happened_at`, '%Y-%m') AS `period_value`,
    SUM(t.`amount`) AS `total_amount`,
    COUNT(*)        AS `txn_count`,
    ROUND(AVG(t.`amount`), 2) AS `avg_amount`
FROM `transaction` t
JOIN `category` c ON c.`id` = t.`category_id`
WHERE t.`is_deleted` = 0
  AND t.`type` IN ('expense', 'income')
GROUP BY
    c.`id`, c.`ledger_id`, c.`name`, c.`type`, c.`icon`, c.`color`, c.`sort_order`,
    DATE_FORMAT(t.`happened_at`, '%Y-%m');


-- =============================================================================
--  3. v_monthly_summary —— 月度收支概览（统计页顶部三张卡片）
-- -----------------------------------------------------------------------------
--  结余(net) 只算收入 - 支出，不含转账。
-- =============================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_monthly_summary` AS
SELECT
    t.`ledger_id`,
    DATE_FORMAT(t.`happened_at`, '%Y-%m') AS `period_value`,
    SUM(CASE WHEN t.`type` = 'income'  THEN t.`amount` ELSE 0 END) AS `income_total`,
    SUM(CASE WHEN t.`type` = 'expense' THEN t.`amount` ELSE 0 END) AS `expense_total`,
    SUM(CASE WHEN t.`type` = 'income'  THEN t.`amount` ELSE 0 END)
      - SUM(CASE WHEN t.`type` = 'expense' THEN t.`amount` ELSE 0 END) AS `net`,
    SUM(CASE WHEN t.`type` = 'income'  THEN 1 ELSE 0 END) AS `income_count`,
    SUM(CASE WHEN t.`type` = 'expense' THEN 1 ELSE 0 END) AS `expense_count`,
    SUM(CASE WHEN t.`type` = 'transfer' THEN 1 ELSE 0 END) AS `transfer_count`
FROM `transaction` t
WHERE t.`is_deleted` = 0
GROUP BY t.`ledger_id`, DATE_FORMAT(t.`happened_at`, '%Y-%m');


-- =============================================================================
--  4. v_budget_progress —— 预算执行进度
-- -----------------------------------------------------------------------------
--  alert_level 的三档对应 PRD 4.4.4 的预警：
--     normal  < 黄线   ；yellow ≥ 黄线 ；red ≥ 红线
--  ⚠️ 产品硬约束：黄/红只用于【预算预警】，支出金额本身永不标红。
--     这个字段是给进度条和预警文案用的，不要拿去染流水列表的数字。
--
--  remaining_days 只在【当前月】有意义，历史月份的该列为 NULL。
-- =============================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_budget_progress` AS
SELECT
    b.`id`               AS `budget_id`,
    b.`ledger_id`,
    b.`period_type`,
    b.`period_value`,
    b.`total_amount`,
    b.`alert_yellow_pct`,
    b.`alert_red_pct`,
    b.`safe_spend_mode`,
    COALESCE(s.`spent`, 0)                            AS `spent`,
    b.`total_amount` - COALESCE(s.`spent`, 0)         AS `remaining`,
    ROUND(COALESCE(s.`spent`, 0) / NULLIF(b.`total_amount`, 0) * 100, 1) AS `used_pct`,
    CASE
        WHEN COALESCE(s.`spent`, 0) >= b.`total_amount` * b.`alert_red_pct`    / 100 THEN 'red'
        WHEN COALESCE(s.`spent`, 0) >= b.`total_amount` * b.`alert_yellow_pct` / 100 THEN 'yellow'
        ELSE 'normal'
    END AS `alert_level`,
    LAST_DAY(STR_TO_DATE(CONCAT(b.`period_value`, '-01'), '%Y-%m-%d')) AS `period_end_date`,
    CASE
        WHEN b.`period_value` = DATE_FORMAT(CURDATE(), '%Y-%m')
        THEN DAY(LAST_DAY(STR_TO_DATE(CONCAT(b.`period_value`, '-01'), '%Y-%m-%d')))
             - DAY(CURDATE()) + 1
        ELSE NULL
    END AS `remaining_days`
FROM `budget` b
LEFT JOIN (
    SELECT
        `ledger_id`,
        DATE_FORMAT(`happened_at`, '%Y-%m') AS `period_value`,
        SUM(`amount`) AS `spent`
    FROM `transaction`
    WHERE `is_deleted` = 0
      AND `type` = 'expense'
    GROUP BY `ledger_id`, DATE_FORMAT(`happened_at`, '%Y-%m')
) s ON s.`ledger_id` = b.`ledger_id` AND s.`period_value` = b.`period_value`;


-- =============================================================================
--  5. v_today_quota —— 今日可花（产品的核心差异化，PRD 4.4.2）
-- -----------------------------------------------------------------------------
--  今日可花 = 本月剩余预算 ÷ 本月剩余天数
--  月度最后一天 remaining_days = 1，公式自然等于"一次性放出全部余额"，
--  不需要额外分支。
--
--  本视图【只返回当前月】。若当前月没有建预算，返回 0 行 ——
--  这是正确的产品行为（前端应引导用户去建预算），不是脚本错误。
--
--  ⚠️ 与 safe_spend_mode='exclude_fixed' 的关系：
--     该模式要扣除"刚需支出"后再平摊，但固定支出表要到 V2.3 才引入
--     （见 01_schema.sql 第六节）。在此之前本视图一律按自然日平摊计算，
--     即等价于 daily_flat。
-- =============================================================================
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
    -- PRD 4.4.2：预算耗尽或超支后「今日可花」最低为 0，不能展示负数。
    ROUND(GREATEST(p.`remaining`, 0) / p.`remaining_days`, 2) AS `today_quota`,
    CURDATE() AS `calc_date`
FROM `v_budget_progress` p
WHERE p.`period_value` = DATE_FORMAT(CURDATE(), '%Y-%m')
  AND p.`remaining_days` IS NOT NULL
  AND p.`remaining_days` > 0;


-- =============================================================================
--  6. v_budget_category_progress —— 分类预算进度
-- -----------------------------------------------------------------------------
--  对应前端「预算 → 分类预算」列表。
--  PRD 4.4.3：分类预算合计超过总预算只提示不阻断，故此处不设额外约束。
-- =============================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v_budget_category_progress` AS
SELECT
    bc.`id`         AS `budget_category_id`,
    b.`ledger_id`,
    b.`period_value`,
    c.`id`          AS `category_id`,
    c.`name`        AS `category_name`,
    c.`icon`,
    c.`color`,
    c.`sort_order`,
    bc.`amount`                              AS `budget_amount`,
    COALESCE(s.`spent`, 0)                   AS `spent`,
    bc.`amount` - COALESCE(s.`spent`, 0)     AS `remaining`,
    ROUND(COALESCE(s.`spent`, 0) / NULLIF(bc.`amount`, 0) * 100, 1) AS `used_pct`
FROM `budget_category` bc
JOIN `budget`   b ON b.`id` = bc.`budget_id`
JOIN `category` c ON c.`id` = bc.`category_id`
LEFT JOIN (
    SELECT
        `category_id`,
        `ledger_id`,
        DATE_FORMAT(`happened_at`, '%Y-%m') AS `period_value`,
        SUM(`amount`) AS `spent`
    FROM `transaction`
    WHERE `is_deleted` = 0
      AND `type` = 'expense'
    GROUP BY `category_id`, `ledger_id`, DATE_FORMAT(`happened_at`, '%Y-%m')
) s ON s.`category_id` = bc.`category_id`
   AND s.`ledger_id`   = b.`ledger_id`
   AND s.`period_value` = b.`period_value`;


-- =============================================================================
--  自检查询（执行完可以跑一遍，确认视图都建起来了）
-- =============================================================================
--  SHOW FULL TABLES WHERE Table_type = 'VIEW';


-- =============================================================================
--  脚本结束
-- =============================================================================
