-- =============================================================================
--  明账 MingZhang · 系统预设数据
-- -----------------------------------------------------------------------------
--  前置 : 必须先执行 01_schema.sql
--  目标库: MySQL 8.0.16+
--  依据 : PRD 4.7「预设分类与账户」+ 4.2.4「关键词自动分类」+ 13.6「图表色板」
--  日期 : 2026-09-24
-- -----------------------------------------------------------------------------
--  本脚本包含三部分：
--    A. 系统预设（生产环境也需要）—— 默认分类、默认账户模板、关键词规则
--    B. 演示数据（仅本地验证用）—— 演示用户 + 账本 + 预算 + 18 笔流水
--    C. 幂等重跑保护
--
--  ⚠️ B 部分是【演示数据】，上线前请整体删除（见文件末尾「清理演示数据」段落）。
-- =============================================================================

USE `mingzhang`;

-- =============================================================================
--  C. 幂等保护：按外键依赖顺序清空（子表 → 父表）
--     使本脚本可以反复执行而不报主键冲突
-- =============================================================================
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `event_log`;
TRUNCATE TABLE `budget_category`;
TRUNCATE TABLE `transaction`;
TRUNCATE TABLE `budget`;
TRUNCATE TABLE `import_batch`;
TRUNCATE TABLE `category_rule`;
TRUNCATE TABLE `category`;
TRUNCATE TABLE `account`;
TRUNCATE TABLE `user_preference`;
TRUNCATE TABLE `ledger_member`;
TRUNCATE TABLE `ledger`;
TRUNCATE TABLE `user`;
SET FOREIGN_KEY_CHECKS = 1;


-- =============================================================================
--  B. 演示用户与账本
--     ID 分配约定（供本文件内部引用）：
--       user = 1 ；ledger = 1
-- =============================================================================

-- 演示账号：手机号 13800001234 / 邮箱 demo@mingzhang.app / 密码 Demo123456
-- ⚠️ 仅为本地演示，切勿在任何真实环境沿用。
--    hash 由 bcrypt(cost=10) 生成，对应明文 "Demo123456"。
INSERT INTO `user`
    (`id`, `uid`, `phone`, `email`, `password_hash`, `display_name`, `status`, `last_login_at`)
VALUES
    (1, '9402-8841-CLARITY', '13800001234', 'demo@mingzhang.app',
     '$2b$10$3Qa4JjYrrUkqSdwz6H865.aSCsQSMgDhtcKFCFD0YlGuEnHFkVddW',
     '演示用户', 1, '2026-09-24 08:30:00');

-- 默认账本（PRD 6.4：新用户注册时自动创建一个 personal 账本，UI 不暴露此概念）
INSERT INTO `ledger`
    (`id`, `owner_id`, `name`, `type`, `currency`, `is_default`, `is_archived`)
VALUES
    (1, 1, '日常个人账本', 'personal', 'CNY', 1, 0);

-- ledger_member：V1.0 不写入，此处仅说明将来如何登记账本所有者
-- INSERT INTO `ledger_member` (`ledger_id`, `user_id`, `role`) VALUES (1, 1, 'owner');

-- 用户偏好（对应前端设置页）
INSERT INTO `user_preference`
    (`user_id`, `theme`, `language`, `currency`, `sound_enabled`, `default_ledger_id`)
VALUES
    (1, 'system', 'zh-CN', 'CNY', 1, 1);


-- =============================================================================
--  A-1. 默认账户（PRD 4.7 / 前端 accounts 页面）
--       ID 分配：1=现金 2=微信钱包 3=支付宝 4=招商银行储蓄卡 5=信用卡
--       ⚠️ 非信用卡账户的 credit_limit / bill_due 必须为 NULL（见 ck_account_credit）
-- =============================================================================
INSERT INTO `account`
    (`id`, `ledger_id`, `name`, `type`, `icon`, `color`, `initial_balance`,
     `credit_limit`, `bill_due`, `card_tail`, `is_default`, `sort_order`, `is_archived`)
VALUES
    (1, 1, '现金',           'cash',   'payments',               '#64748B',   500.00, NULL,     NULL,    NULL,   1, 1, 0),
    (2, 1, '微信支付钱包',   'wechat', 'chat',                   '#07C160',  1280.50, NULL,     NULL,    NULL,   0, 2, 0),
    (3, 1, '支付宝',         'alipay', 'account_balance_wallet', '#1677FF',  2360.00, NULL,     NULL,    NULL,   0, 3, 0),
    (4, 1, '招商银行储蓄卡', 'bank',   'account_balance',        '#E11D48', 18500.00, NULL,     NULL,    '8820', 0, 4, 0),
    (5, 1, '信用卡',         'credit', 'credit_card',            '#7C3AED',     0.00, 60000.00, 3245.60, '4108', 0, 5, 0);


-- =============================================================================
--  A-2. 默认分类（PRD 4.7）
--       颜色取自 PRD 13.6 图表色板，且【与分类绑定】——
--       排序变化时颜色不跟着变，否则用户对「哪块是哪类」的记忆会被打断。
--       ID 分配：1-10 = 支出，11-16 = 收入
-- =============================================================================
INSERT INTO `category`
    (`id`, `ledger_id`, `name`, `type`, `icon`, `color`, `sort_order`, `is_system`)
VALUES
    -- ---------- 支出（10 类，对应 PRD 4.7）----------
    (1,  1, '餐饮美食', 'expense', 'restaurant',         '#14B8A6', 1,  1),  -- Teal
    (2,  1, '交通出行', 'expense', 'directions_subway',  '#06B6D4', 2,  1),  -- Cyan
    (3,  1, '日用百货', 'expense', 'shopping_bag',       '#0EA5E9', 3,  1),  -- Sky
    (4,  1, '居家生活', 'expense', 'home',               '#6366F1', 4,  1),  -- Indigo
    (5,  1, '休闲娱乐', 'expense', 'sports_esports',     '#8B5CF6', 5,  1),  -- Violet
    (6,  1, '医疗保健', 'expense', 'medical_services',   '#EC4899', 6,  1),  -- Pink
    (7,  1, '学习进修', 'expense', 'menu_book',          '#F43F5E', 7,  1),  -- Rose
    (8,  1, '通讯',     'expense', 'cell_tower',         '#F59E0B', 8,  1),  -- Amber
    (9,  1, '人情往来', 'expense', 'redeem',             '#84CC16', 9,  1),  -- Lime
    (10, 1, '其他',     'expense', 'more_horiz',         '#64748B', 10, 1),  -- Slate
    -- ---------- 收入（6 类，对应 PRD 4.7）----------
    (11, 1, '工资',     'income',  'payments',           '#14B8A6', 1,  1),
    (12, 1, '奖金',     'income',  'card_giftcard',      '#06B6D4', 2,  1),
    (13, 1, '兼职',     'income',  'work',               '#0EA5E9', 3,  1),
    (14, 1, '投资收益', 'income',  'trending_up',        '#6366F1', 4,  1),
    (15, 1, '红包',     'income',  'redeem',             '#8B5CF6', 5,  1),
    (16, 1, '其他',     'income',  'more_horiz',         '#64748B', 6,  1);

-- 让后续自增 ID 从 17 开始，避免与上面的显式 ID 撞车
ALTER TABLE `category` AUTO_INCREMENT = 17;


-- =============================================================================
--  A-3. 关键词 → 分类 自动匹配规则（PRD 4.2.4）
--       ledger_id = NULL 表示系统内置规则，所有账本共用。
--       priority：具体品牌（20）> 行业泛词（10），避免「美团买药」被「美团」抢走。
--       match_type：品牌与专有名词用 contains 即可；V1.0 不用 regex。
-- =============================================================================
INSERT INTO `category_rule` (`ledger_id`, `category_id`, `keyword`, `match_type`, `priority`, `is_system`) VALUES
    -- 餐饮美食 (category_id = 1)
    (NULL,  1, '美团',       'contains', 20, 1),
    (NULL,  1, '饿了么',     'contains', 20, 1),
    (NULL,  1, '肯德基',     'contains', 20, 1),
    (NULL,  1, '麦当劳',     'contains', 20, 1),
    (NULL,  1, '星巴克',     'contains', 20, 1),
    (NULL,  1, '瑞幸',       'contains', 20, 1),
    (NULL,  1, '海底捞',     'contains', 20, 1),
    (NULL,  1, '外卖',       'contains', 10, 1),
    (NULL,  1, '餐饮',       'contains', 10, 1),
    (NULL,  1, '食堂',       'contains', 10, 1),
    (NULL,  1, '咖啡',       'contains', 10, 1),

    -- 交通出行 (category_id = 2)
    (NULL,  2, '滴滴',       'contains', 20, 1),
    (NULL,  2, '高德打车',   'contains', 20, 1),
    (NULL,  2, '铁路12306',  'contains', 20, 1),
    (NULL,  2, '地铁',       'contains', 10, 1),
    (NULL,  2, '公交',       'contains', 10, 1),
    (NULL,  2, '打车',       'contains', 10, 1),
    (NULL,  2, '出租车',     'contains', 10, 1),
    (NULL,  2, '加油',       'contains', 10, 1),
    (NULL,  2, '停车',       'contains', 10, 1),
    (NULL,  2, '高速',       'contains', 10, 1),

    -- 日用百货 (category_id = 3)
    (NULL,  3, '盒马',       'contains', 20, 1),
    (NULL,  3, '永辉',       'contains', 20, 1),
    (NULL,  3, '沃尔玛',     'contains', 20, 1),
    (NULL,  3, '京东',       'contains', 20, 1),
    (NULL,  3, '淘宝',       'contains', 20, 1),
    (NULL,  3, '天猫',       'contains', 20, 1),
    (NULL,  3, '拼多多',     'contains', 20, 1),
    (NULL,  3, '超市',       'contains', 10, 1),
    (NULL,  3, '便利店',     'contains', 10, 1),
    (NULL,  3, '日用',       'contains', 10, 1),

    -- 居家生活 (category_id = 4)
    (NULL,  4, '房租',       'contains', 20, 1),
    (NULL,  4, '自如',       'contains', 20, 1),
    (NULL,  4, '链家',       'contains', 20, 1),
    (NULL,  4, '物业',       'contains', 10, 1),
    (NULL,  4, '水费',       'contains', 10, 1),
    (NULL,  4, '电费',       'contains', 10, 1),
    (NULL,  4, '燃气',       'contains', 10, 1),
    (NULL,  4, '宽带',       'contains', 10, 1),

    -- 休闲娱乐 (category_id = 5)
    (NULL,  5, '猫眼',       'contains', 20, 1),
    (NULL,  5, '淘票票',     'contains', 20, 1),
    (NULL,  5, '万达',       'contains', 20, 1),
    (NULL,  5, 'Steam',      'contains', 20, 1),
    (NULL,  5, '腾讯视频',   'contains', 20, 1),
    (NULL,  5, '爱奇艺',     'contains', 20, 1),
    (NULL,  5, '网易云',     'contains', 20, 1),
    (NULL,  5, '电影',       'contains', 10, 1),
    (NULL,  5, '健身',       'contains', 10, 1),
    (NULL,  5, '游戏',       'contains', 10, 1),

    -- 医疗保健 (category_id = 6)
    (NULL,  6, '美团买药',   'contains', 30, 1),   -- 优先级高，压过「美团」
    (NULL,  6, '医院',       'contains', 10, 1),
    (NULL,  6, '药房',       'contains', 10, 1),
    (NULL,  6, '药店',       'contains', 10, 1),
    (NULL,  6, '挂号',       'contains', 10, 1),
    (NULL,  6, '体检',       'contains', 10, 1),

    -- 学习进修 (category_id = 7)
    (NULL,  7, '当当',       'contains', 20, 1),
    (NULL,  7, '得到',       'contains', 20, 1),
    (NULL,  7, '极客时间',   'contains', 20, 1),
    (NULL,  7, '图书',       'contains', 10, 1),
    (NULL,  7, '培训',       'contains', 10, 1),
    (NULL,  7, '学费',       'contains', 10, 1),

    -- 通讯 (category_id = 8)
    (NULL,  8, '中国移动',   'contains', 20, 1),
    (NULL,  8, '中国联通',   'contains', 20, 1),
    (NULL,  8, '中国电信',   'contains', 20, 1),
    (NULL,  8, '话费',       'contains', 10, 1),
    (NULL,  8, '流量',       'contains', 10, 1),

    -- 人情往来 (category_id = 9)
    (NULL,  9, '份子钱',     'contains', 20, 1),
    (NULL,  9, '随礼',       'contains', 20, 1),
    (NULL,  9, '礼金',       'contains', 10, 1);


-- =============================================================================
--  B-2. 演示预算（2026-09）
--       总预算 8000，黄线 80% / 红线 100%，今日可花按自然日平摊。
-- =============================================================================
INSERT INTO `budget`
    (`id`, `ledger_id`, `period_type`, `period_value`, `total_amount`,
     `alert_yellow_pct`, `alert_red_pct`, `safe_spend_mode`)
VALUES
    (1, 1, 'monthly', '2026-09', 8000.00, 80, 100, 'daily_flat');

-- 分类预算（PRD 4.4.3：分类预算合计超过总预算时只提示、不阻断，故此处允许超额）
INSERT INTO `budget_category` (`id`, `budget_id`, `category_id`, `amount`) VALUES
    (1, 1,  1, 1500.00),   -- 餐饮美食
    (2, 1,  2,  400.00),   -- 交通出行
    (3, 1,  5,  600.00);   -- 休闲娱乐


-- =============================================================================
--  B-3. 演示导入批次（PRD 4.3.4）
--       批次号格式 #IMP-YYYYMMDD-NN；撤销窗口 = 创建后 10 分钟。
-- =============================================================================
INSERT INTO `import_batch`
    (`id`, `ledger_id`, `created_by`, `batch_no`, `source`, `channel`, `file_name`,
     `total_count`, `duplicate_count`, `imported_count`, `skipped_count`,
     `status`, `undo_expires_at`, `created_at`)
VALUES
    (1, 1, 1, 'IMP-20260919-01', 'import_text', 'alipay', NULL,
     5, 1, 3, 1,
     'completed', '2026-09-19 21:05:00', '2026-09-19 20:55:00');


-- =============================================================================
--  B-4. 演示流水（2026-09）
--       覆盖：手动支出 / 手动收入 / 转账 / 导入入账 / 已撤销（软删除）
--       ⚠️ 金额恒为正数，方向由 type 表达（见 ck_txn_amount_positive）
-- =============================================================================
INSERT INTO `transaction`
    (`ledger_id`, `created_by`, `type`, `amount`, `category_id`, `account_id`, `to_account_id`,
     `happened_at`, `note`, `merchant`, `source`, `import_batch_id`, `is_deleted`)
VALUES
    -- ---- 支出：手动记账 ----
    (1, 1, 'expense',   28.50,  1, 2, NULL, '2026-09-24 09:15:00', '早餐 包子豆浆', NULL, 'manual', NULL, 0),
    (1, 1, 'expense',   42.00,  1, 3, NULL, '2026-09-24 12:30:00', '公司楼下快餐', NULL, 'manual', NULL, 0),
    (1, 1, 'expense',    5.00,  2, 2, NULL, '2026-09-24 08:00:00', '地铁通勤',     NULL, 'manual', NULL, 0),
    (1, 1, 'expense',  168.00,  3, 3, NULL, '2026-09-23 19:20:00', '周末采购',     NULL, 'manual', NULL, 0),
    (1, 1, 'expense',   88.00,  5, 5, NULL, '2026-09-23 21:00:00', '电影票',       NULL, 'manual', NULL, 0),
    (1, 1, 'expense',  129.00,  8, 3, NULL, '2026-09-22 10:00:00', '手机话费',     NULL, 'manual', NULL, 0),
    (1, 1, 'expense',  236.50,  6, 2, NULL, '2026-09-20 14:00:00', '感冒药',       NULL, 'manual', NULL, 0),
    (1, 1, 'expense',   65.00,  1, 2, NULL, '2026-09-18 12:00:00', '同事聚餐',     NULL, 'manual', NULL, 0),
    (1, 1, 'expense',  199.00,  7, 3, NULL, '2026-09-15 20:00:00', '技术书籍两本', NULL, 'manual', NULL, 0),
    (1, 1, 'expense', 2400.00,  4, 4, NULL, '2026-09-10 09:00:00', '9 月房租',     NULL, 'manual', NULL, 0),

    -- ---- 支出：从导入批次 1 入账 ----
    (1, 1, 'expense',   35.00,  1, 2, NULL, '2026-09-19 12:30:00', NULL, '肯德基',   'import_text', 1, 0),
    (1, 1, 'expense',   52.00,  1, 3, NULL, '2026-09-19 18:45:00', NULL, '饿了么',   'import_text', 1, 0),
    (1, 1, 'expense',   13.00,  2, 2, NULL, '2026-09-19 08:10:00', NULL, '滴滴出行', 'import_text', 1, 0),

    -- ---- 收入 ----
    (1, 1, 'income', 18500.00, 11, 4, NULL, '2026-09-05 10:00:00', '9 月工资', NULL, 'manual', NULL, 0),
    (1, 1, 'income',   200.00, 15, 2, NULL, '2026-09-12 15:00:00', '朋友生日红包', NULL, 'manual', NULL, 0),
    (1, 1, 'income',    86.30, 14, 3, NULL, '2026-09-20 10:00:00', '基金收益', NULL, 'manual', NULL, 0),

    -- ---- 转账：单条记录 + 双账户，不计入预算（PRD 6.3）----
    (1, 1, 'transfer', 1000.00, NULL, 4, 3, '2026-09-21 09:00:00', '储蓄卡转入支付宝', NULL, 'manual', NULL, 0),

    -- ---- 已撤销：软删除，任何统计都不应计入 ----
    (1, 1, 'expense',  300.00,  5, 2, NULL, '2026-09-22 22:00:00', '误记，已撤销', NULL, 'manual', NULL, 1);


-- =============================================================================
--  验证：执行下面两条查询，应与注释中的期望值一致
-- =============================================================================
--
--  1) 有效流水数（不含已撤销）—— 期望 17
--     SELECT COUNT(*) FROM `transaction` WHERE `is_deleted` = 0;
--
--  2) 2026-09 分类支出合计 —— 期望 3461.00（转账与已撤销均不计入）
--     SELECT SUM(`amount`) FROM `transaction`
--      WHERE `type` = 'expense' AND `is_deleted` = 0
--        AND `happened_at` >= '2026-09-01' AND `happened_at` < '2026-10-01';


-- =============================================================================
--  上线前：删除全部演示数据（保留 A 部分的系统预设）
-- =============================================================================
--  DELETE FROM `transaction`   WHERE `ledger_id` = 1;
--  DELETE FROM `import_batch`  WHERE `ledger_id` = 1;
--  DELETE FROM `budget_category`;
--  DELETE FROM `budget`;
--  DELETE FROM `account`;
--  DELETE FROM `category`;
--  DELETE FROM `category_rule` WHERE `is_system` = 1;   -- 视产品决策决定是否保留内置规则
--  DELETE FROM `user_preference`;
--  DELETE FROM `ledger`;
--  DELETE FROM `user`;
--
--  注意：删除后 category / account 等表需要为新用户重新灌入默认数据。
--        PRD 4.7 的默认分类与账户应当在【用户注册时】按模板复制，
--        而不是依赖本脚本的全局数据 —— 因为分类与账户都是 ledger 级的。


-- =============================================================================
--  脚本结束
--  下一步：执行 03_views.sql 建立统计视图
-- =============================================================================
