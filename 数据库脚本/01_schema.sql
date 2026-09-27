-- =============================================================================
--  明账 MingZhang · 数据库结构定义
-- -----------------------------------------------------------------------------
--  目标库   : MySQL 8.0.16+  （需要 8.0.16 以上才支持 CHECK 约束强制生效）
--  字符集   : utf8mb4 / utf8mb4_0900_ai_ci
--  依据     : PRD v1.2 第 6 章「数据模型」
--             + 前端原型 23 个页面实际使用的字段
--  生成日期 : 2026-09-24
-- -----------------------------------------------------------------------------
--  设计要点（与 PRD 的对应关系）
--   1. 全表走 Ledger（账本）层 —— PRD 6.4。V1.0 单用户也走账本，
--      避免将来引入共享账本时的结构性迁移。
--   2. 转账用「单条记录 + to_account_id」—— PRD 6.3 / 附录B #6。
--   3. 账户余额不落库，由流水实时聚合 —— PRD 6.3。见 03_views.sql。
--   4. 金额一律 DECIMAL，绝不用 FLOAT/DOUBLE（浮点会丢精度）。
--   5. 删除为软删除（is_deleted）—— 附录B #7「删除可撤销」。
-- =============================================================================

DROP DATABASE IF EXISTS `mingzhang`;
CREATE DATABASE `mingzhang`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE `mingzhang`;


-- =============================================================================
--  一、账号与账本
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user —— 用户
--   PRD 6.1 : id, phone, email, password_hash, created_at
--   PRD 4.1.2: 密码 bcrypt；登录失败 5 次锁定 15 分钟
--   前端     : 设置页展示 display_name / uid
-- -----------------------------------------------------------------------------
CREATE TABLE `user` (
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uid`              VARCHAR(32)     NOT NULL                COMMENT '对外展示的账号 ID，形如 9402-8841-CLARITY',
    `phone`            VARCHAR(20)     DEFAULT NULL            COMMENT '手机号，与 email 至少填一个',
    `email`            VARCHAR(255)    DEFAULT NULL,
    `password_hash`    VARCHAR(255)    DEFAULT NULL            COMMENT 'bcrypt 哈希（60 字符，留冗余）；第三方登录为空',
    `display_name`     VARCHAR(50)     DEFAULT NULL,
    `avatar_url`       VARCHAR(500)    DEFAULT NULL,
    `status`           TINYINT         NOT NULL DEFAULT 1      COMMENT '1=正常 2=已停用 3=已注销',
    `login_fail_count` TINYINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '连续登录失败次数，达 5 次触发锁定',
    `locked_until`     DATETIME        DEFAULT NULL            COMMENT '锁定截止时间（失败 5 次锁 15 分钟）',
    `token_version`    INT UNSIGNED    NOT NULL DEFAULT 1      COMMENT 'JWT 会话版本；退出登录/改密码时递增，使旧 token 立即失效',
    `last_login_at`    DATETIME        DEFAULT NULL,
    `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_uid`   (`uid`),
    UNIQUE KEY `uk_user_phone` (`phone`),
    UNIQUE KEY `uk_user_email` (`email`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户';


-- -----------------------------------------------------------------------------
-- user_avatar —— 用户自定义头像
--   图片本体与用户主表分离，避免读取登录资料时把二进制图片一并载入。
--   public_id 是不暴露 user_id 的公开读取标识；每次更换头像都会重新生成。
-- -----------------------------------------------------------------------------
CREATE TABLE `user_avatar` (
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


-- -----------------------------------------------------------------------------
-- ledger —— 账本（V1.0 的核心前瞻设计，PRD 6.4）
--   每个新用户注册时自动创建一个 type = 'personal' 的默认账本。
--   UI 上不暴露「账本」概念，用户感知不到这一层。
-- -----------------------------------------------------------------------------
CREATE TABLE `ledger` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner_id`      BIGINT UNSIGNED NOT NULL                   COMMENT '账本所有者',
    `name`          VARCHAR(50)     NOT NULL                   COMMENT '如「日常个人账本」',
    `type`          ENUM('personal','couple','family') NOT NULL DEFAULT 'personal'
                                                               COMMENT 'V1.0 只会产生 personal',
    `currency`      CHAR(3)         NOT NULL DEFAULT 'CNY'     COMMENT '多币种已排除（PRD 待定问题 #3）',
    `is_default`    TINYINT(1)      NOT NULL DEFAULT 1         COMMENT '用户注册时的默认账本',
    `is_archived`   TINYINT(1)      NOT NULL DEFAULT 0,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ledger_owner` (`owner_id`, `is_archived`),
    CONSTRAINT `fk_ledger_owner` FOREIGN KEY (`owner_id`) REFERENCES `user` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '账本（V1.0 每用户一个 personal 账本）';


-- -----------------------------------------------------------------------------
-- ledger_member —— 账本成员 【V1.2 预留，V1.0 不写入】
--   PRD 6.4 明确要求预留此表结构（情侣/家庭共享账本的前提）。
--   V1.0 阶段可以完全不使用；保留它只是为了让 V1.4 不必做结构迁移。
--   ⚠️ 服务层必须强制校验成员身份，越权查看他人账本是高危风险（PRD 11 章）。
-- -----------------------------------------------------------------------------
CREATE TABLE `ledger_member` (
    `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`  BIGINT UNSIGNED NOT NULL,
    `user_id`    BIGINT UNSIGNED NOT NULL,
    `role`       ENUM('owner','admin','member') NOT NULL DEFAULT 'member'
                                COMMENT 'owner 用于个人账本；admin/member 为 V2.2 家庭场景准备',
    `joined_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_member_ledger_user` (`ledger_id`, `user_id`),
    CONSTRAINT `fk_member_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_member_user`   FOREIGN KEY (`user_id`)   REFERENCES `user` (`id`)   ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '【V1.2 预留】账本成员及角色';


-- =============================================================================
--  二、账户与分类
-- =============================================================================

-- -----------------------------------------------------------------------------
-- account —— 账户
--   PRD 6.1 : id, user_id, name, type, icon, initial_balance, sort_order, is_archived
--   前端新增: color / is_default / card_tail 尾号 / credit_limit 信用授信 / bill_due 待还账单
--   ⚠️ 当前余额【不存储】，由 transaction 实时聚合（PRD 6.3）。见 v_account_balance。
-- -----------------------------------------------------------------------------
CREATE TABLE `account` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`       BIGINT UNSIGNED NOT NULL,
    `name`            VARCHAR(50)     NOT NULL                 COMMENT '如「微信支付钱包」「招商银行储蓄卡」',
    `type`            ENUM('cash','wechat','alipay','bank','credit') NOT NULL,
    `icon`            VARCHAR(50)     DEFAULT NULL             COMMENT 'Material Symbols 图标名',
    `color`           CHAR(7)         DEFAULT NULL             COMMENT '十六进制色，如 #07C160',
    `initial_balance` DECIMAL(12,2)   NOT NULL DEFAULT 0.00    COMMENT '初始录入基数，余额聚合的起点。信用卡上语义为「初始已用额度」',
    `credit_limit`    DECIMAL(12,2)   DEFAULT NULL             COMMENT '信用授信额度，仅信用卡（前端「信用授信 60k」）',
    `bill_due`        DECIMAL(12,2)   DEFAULT NULL             COMMENT '当期待还账单，仅信用卡；外部事实，非聚合值',
    `card_tail`       CHAR(4)         DEFAULT NULL             COMMENT '卡号尾号，如 4108 / 8820',
    `is_default`      TINYINT(1)      NOT NULL DEFAULT 0       COMMENT '记账面板默认选中的账户',
    `sort_order`      INT             NOT NULL DEFAULT 0,
    `is_archived`     TINYINT(1)      NOT NULL DEFAULT 0       COMMENT '归档后不出现在选择器，但历史流水仍可见',
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_account_ledger` (`ledger_id`, `is_archived`, `sort_order`),
    CONSTRAINT `fk_account_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `ck_account_credit` CHECK (`type` = 'credit' OR (`credit_limit` IS NULL AND `bill_due` IS NULL))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '账户（余额由流水聚合，不落库）';


-- -----------------------------------------------------------------------------
-- category —— 分类
--   PRD 6.1 : id, user_id, name, type, icon, color, parent_id, sort_order, is_system
--   前端     : name 输入框 maxlength=12；色板固定 10 组（对应 PRD 13.6 图表色板）
--   注       : parent_id 预留二级分类。V1.0 前端只做单层，但不阻止将来分两级。
-- -----------------------------------------------------------------------------
CREATE TABLE `category` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`   BIGINT UNSIGNED NOT NULL,
    `name`        VARCHAR(20)     NOT NULL                  COMMENT '前端限制 12 字，此处留余量',
    `type`        ENUM('expense','income') NOT NULL         COMMENT '支出分类与收入分类是两套',
    `icon`        VARCHAR(50)     DEFAULT NULL              COMMENT 'Material Symbols 图标名',
    `color`       CHAR(7)         DEFAULT NULL              COMMENT '绑定分类的固定颜色（PRD 13.6 要求颜色不随排序变）',
    `parent_id`   BIGINT UNSIGNED DEFAULT NULL              COMMENT '二级分类；V1.0 均为 NULL',
    `sort_order`  INT             NOT NULL DEFAULT 0        COMMENT '九宫格排序，「置顶」即取小值',
    `is_system`   TINYINT(1)      NOT NULL DEFAULT 0        COMMENT '系统预设分类，不允许删除',
    `is_archived` TINYINT(1)      NOT NULL DEFAULT 0,
    `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_category_ledger_type_name` (`ledger_id`, `type`, `name`),
    KEY `idx_category_ledger` (`ledger_id`, `type`, `is_archived`, `sort_order`),
    KEY `idx_category_parent` (`parent_id`),
    CONSTRAINT `fk_category_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_category_parent` FOREIGN KEY (`parent_id`) REFERENCES `category` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '分类（支出/收入两套，颜色与分类绑定）';


-- =============================================================================
--  三、交易流水（核心表）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- import_batch —— 导入批次
--   PRD 4.3.4 / 6.1。先建此表，因为 transaction 要外键引用它。
--   前端     : 批次号 #IMP-20260922-01；撤销窗口 10 分钟
-- -----------------------------------------------------------------------------
CREATE TABLE `import_batch` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`       BIGINT UNSIGNED NOT NULL,
    `created_by`      BIGINT UNSIGNED NOT NULL,
    `batch_no`        VARCHAR(32)     NOT NULL              COMMENT '如 IMP-20260922-01',
    `source`          ENUM('import_text','import_csv') NOT NULL COMMENT '粘贴文本 / CSV 文件',
    `channel`         ENUM('alipay','wechat','other') NOT NULL DEFAULT 'other'
                                                            COMMENT '账单渠道，决定解析规则',
    `file_name`       VARCHAR(255)    DEFAULT NULL          COMMENT '仅 CSV 导入时有值。原始文件不上传（PRD 附录B #5）',
    `total_count`     INT UNSIGNED    NOT NULL DEFAULT 0    COMMENT '解析出的总笔数',
    `duplicate_count` INT UNSIGNED    NOT NULL DEFAULT 0    COMMENT '判定重复、自动排除的笔数',
    `imported_count`  INT UNSIGNED    NOT NULL DEFAULT 0    COMMENT '实际入账笔数',
    `skipped_count`   INT UNSIGNED    NOT NULL DEFAULT 0    COMMENT '用户手动取消勾选的笔数',
    `status`          ENUM('pending','completed','reverted') NOT NULL DEFAULT 'pending',
    `undo_expires_at` DATETIME        DEFAULT NULL          COMMENT '撤销窗口截止（创建后 10 分钟）',
    `reverted_at`     DATETIME        DEFAULT NULL,
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_batch_ledger_no` (`ledger_id`, `batch_no`),
    KEY `idx_batch_ledger` (`ledger_id`, `created_at`),
    CONSTRAINT `fk_batch_ledger` FOREIGN KEY (`ledger_id`)  REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_batch_user`   FOREIGN KEY (`created_by`) REFERENCES `user` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '账单导入批次（支持整批撤销）';


-- -----------------------------------------------------------------------------
-- transaction —— 交易流水（核心）
--   PRD 6.1 + 6.4
--   转账设计: 单条记录 + to_account_id（PRD 6.3 / 附录B #6），
--             account_id 为转出账户，to_account_id 为转入账户。
--   金额约束: PRD 4.2.5 规定金额为正数、最多 2 位小数、上限 9,999,999.99。
--             方向由 type 表达，不用正负号。
-- -----------------------------------------------------------------------------
CREATE TABLE `transaction` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`       BIGINT UNSIGNED NOT NULL,
    `created_by`      BIGINT UNSIGNED NOT NULL              COMMENT '记录人。PRD 6.1 称 user_id；引入 Ledger 后语义为「谁记的这笔」',
    `type`            ENUM('expense','income','transfer') NOT NULL,
    `amount`          DECIMAL(12,2) UNSIGNED NOT NULL       COMMENT '恒为正数，方向看 type。DECIMAL 不用浮点，避免精度丢失',
    `category_id`     BIGINT UNSIGNED DEFAULT NULL          COMMENT '转账无分类',
    `account_id`      BIGINT UNSIGNED NOT NULL              COMMENT '支出/收入的账户；转账时为【转出】账户',
    `to_account_id`   BIGINT UNSIGNED DEFAULT NULL          COMMENT '仅转账有值，为【转入】账户',
    `happened_at`     DATETIME        NOT NULL              COMMENT '交易发生时间，可跨天补记',
    `note`            VARCHAR(100)    DEFAULT NULL          COMMENT 'PRD 4.2.5：最长 100 字符',
    `merchant`        VARCHAR(100)    DEFAULT NULL          COMMENT '商户名，导入时填充；手动记账并入 note',
    `source`          ENUM('manual','import_text','import_csv') NOT NULL DEFAULT 'manual',
    `import_batch_id` BIGINT UNSIGNED DEFAULT NULL          COMMENT '导入来源批次，用于整批撤销',
    `visibility`      ENUM('shared','private') NOT NULL DEFAULT 'shared'
                                                             COMMENT '【V1.2 预留】private = 共享账本中「仅自己可见」',
    `is_deleted`      TINYINT(1)      NOT NULL DEFAULT 0    COMMENT '软删除，支撑「删除可撤销」',
    `deleted_at`      DATETIME        DEFAULT NULL          COMMENT '软删除时间；普通流水仅允许在删除后 5 秒内恢复',
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),

    -- PRD 6.2 指定的三条关键索引
    KEY `idx_txn_ledger_time`      (`ledger_id`, `happened_at` DESC)
                                                            COMMENT '流水列表、统计聚合',
    KEY `idx_txn_ledger_cat_time`  (`ledger_id`, `category_id`, `happened_at`)
                                                            COMMENT '分类统计、预算计算',
    KEY `idx_txn_ledger_amt_time`  (`ledger_id`, `amount`, `happened_at`)
                                                            COMMENT '导入去重（金额+日期+商户相似度）',

    -- 补充索引
    KEY `idx_txn_batch`            (`import_batch_id`)      COMMENT '整批撤销导入',
    KEY `idx_txn_account_time`     (`ledger_id`, `account_id`, `happened_at`)
                                                            COMMENT '账户余额聚合',
    KEY `idx_txn_to_account`       (`to_account_id`)        COMMENT '转入侧余额聚合',
    KEY `idx_txn_merchant`         (`ledger_id`, `merchant`(32))
                                                            COMMENT '商户相似度去重、关键词分类',

    CONSTRAINT `fk_txn_ledger`   FOREIGN KEY (`ledger_id`)       REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_txn_user`     FOREIGN KEY (`created_by`)      REFERENCES `user` (`id`),
    -- ⚠️ 刻意不写 ON DELETE SET NULL：
    --    1) 语义上就错了 —— 把历史流水的分类置空，会让它违反下面的 ck_txn_category，
    --       删除操作反而会在运行时报错，属于埋雷。
    --    2) MySQL 硬性规定：出现在外键【引用动作】里的列，不能同时用在 CHECK 约束中
    --       （ERROR 3823）。所以这里必须保持默认的 RESTRICT。
    --    分类不该被物理删除，要下线请用 category.is_archived 归档。
    CONSTRAINT `fk_txn_category` FOREIGN KEY (`category_id`)     REFERENCES `category` (`id`),
    CONSTRAINT `fk_txn_account`  FOREIGN KEY (`account_id`)      REFERENCES `account` (`id`),
    CONSTRAINT `fk_txn_to_acct`  FOREIGN KEY (`to_account_id`)   REFERENCES `account` (`id`),
    CONSTRAINT `fk_txn_batch`    FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch` (`id`) ON DELETE SET NULL,

    -- 金额与转账的一致性约束（MySQL 8.0.16+ 才会真正强制）
    --
    -- 注意 amount 是 UNSIGNED：负数在【类型层】就被拒了，报 ERROR 1264 Out of range，
    -- 根本走不到 CHECK。所以下面这条 CHECK 真正拦的是【金额 = 0】这一种情况。
    -- 别以为它没生效 —— 拿负数去试会误判，要拿 0 试。
    CONSTRAINT `ck_txn_amount_positive` CHECK (`amount` > 0),
    CONSTRAINT `ck_txn_amount_max`      CHECK (`amount` <= 9999999.99),
    CONSTRAINT `ck_txn_transfer`        CHECK (
        (`type` =  'transfer' AND `to_account_id` IS NOT NULL AND `to_account_id` <> `account_id`)
     OR (`type` <> 'transfer' AND `to_account_id` IS NULL)
    ),
    CONSTRAINT `ck_txn_category`        CHECK (`type` = 'transfer' OR `category_id` IS NOT NULL)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '交易流水（转账为单条记录 + 双账户）';


-- =============================================================================
--  四、预算
-- =============================================================================

-- -----------------------------------------------------------------------------
-- budget —— 月度预算
--   PRD 6.1 : id, user_id, period_type, period_value, total_amount, created_at
--   前端新增: alert_yellow_pct（滑块 50-95）/ alert_red_pct（滑块 90-120）/ safe_spend_mode
-- -----------------------------------------------------------------------------
CREATE TABLE `budget` (
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`        BIGINT UNSIGNED NOT NULL,
    `period_type`      ENUM('monthly') NOT NULL DEFAULT 'monthly'
                                                              COMMENT 'V1.0 固定自然月（PRD 4.4.1）',
    `period_value`     CHAR(7)         NOT NULL               COMMENT '格式 YYYY-MM，如 2026-09',
    `total_amount`     DECIMAL(12,2)   NOT NULL               COMMENT '月度总支出上限',
    `alert_yellow_pct` TINYINT UNSIGNED NOT NULL DEFAULT 80   COMMENT '黄色预警阈值 %，前端滑块范围 50-95',
    `alert_red_pct`    TINYINT UNSIGNED NOT NULL DEFAULT 100  COMMENT '红色预警阈值 %，前端滑块范围 90-120',
    `safe_spend_mode`  ENUM('daily_flat','exclude_fixed') NOT NULL DEFAULT 'daily_flat'
                                                              COMMENT '今日可花算法：自然日平摊 / 扣除刚需。对应 PRD 待定问题 #5',
    `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_period` (`ledger_id`, `period_type`, `period_value`),
    CONSTRAINT `fk_budget_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `ledger` (`id`) ON DELETE CASCADE,
    CONSTRAINT `ck_budget_yellow` CHECK (`alert_yellow_pct` BETWEEN 50 AND 95),
    CONSTRAINT `ck_budget_red`    CHECK (`alert_red_pct`    BETWEEN 90 AND 120)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '月度预算（一个账本一个月一条）';


-- -----------------------------------------------------------------------------
-- budget_category —— 分类预算
--   PRD 6.1 : id, budget_id, category_id, amount
--   PRD 4.4.3: 分类预算合计 > 总预算时只提示不阻断 —— 故不加相关的 CHECK 约束。
-- -----------------------------------------------------------------------------
CREATE TABLE `budget_category` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `budget_id`   BIGINT UNSIGNED NOT NULL,
    `category_id` BIGINT UNSIGNED NOT NULL,
    `amount`      DECIMAL(12,2)   NOT NULL              COMMENT '该分类当月上限',
    `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_budget_cat` (`budget_id`, `category_id`),
    KEY `idx_budget_cat_category` (`category_id`),
    CONSTRAINT `fk_budgetcat_budget` FOREIGN KEY (`budget_id`)   REFERENCES `budget` (`id`)   ON DELETE CASCADE,
    CONSTRAINT `fk_budgetcat_cat`    FOREIGN KEY (`category_id`) REFERENCES `category` (`id`) ON DELETE CASCADE,
    CONSTRAINT `ck_budgetcat_amount` CHECK (`amount` >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '分类预算（某分类的月度上限）';


-- =============================================================================
--  五、辅助表
-- =============================================================================

-- -----------------------------------------------------------------------------
-- category_rule —— 关键词自动分类规则
--   PRD 4.2.4「智能分类推荐」+ PRD 11 章风险对策「解析逻辑做成可配置规则表」
--   ledger_id 为 NULL 表示系统内置规则，所有账本共用。
-- -----------------------------------------------------------------------------
CREATE TABLE `category_rule` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `ledger_id`   BIGINT UNSIGNED DEFAULT NULL          COMMENT 'NULL = 系统内置规则，全局共用',
    `category_id` BIGINT UNSIGNED NOT NULL,
    `keyword`     VARCHAR(50)     NOT NULL              COMMENT '命中即推荐该分类，如「美团」「饿了么」',
    `match_type`  ENUM('contains','equals','regex') NOT NULL DEFAULT 'contains',
    `priority`    INT             NOT NULL DEFAULT 0    COMMENT '值越大越优先；同名关键词多规则时决出唯一',
    `is_system`   TINYINT(1)      NOT NULL DEFAULT 0    COMMENT '系统预设规则，用户改不动',
    `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_rule_scope_kw` (`ledger_id`, `keyword`),
    KEY `idx_rule_category` (`category_id`),
    CONSTRAINT `fk_rule_ledger` FOREIGN KEY (`ledger_id`)   REFERENCES `ledger` (`id`)   ON DELETE CASCADE,
    CONSTRAINT `fk_rule_cat`    FOREIGN KEY (`category_id`) REFERENCES `category` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '关键词→分类 自动匹配规则';


-- -----------------------------------------------------------------------------
-- user_preference —— 用户偏好
--   来源：前端设置页（21-settings-index.html）实际存在的开关项。
--   PRD 未定义此表，属前端驱动新增。
-- -----------------------------------------------------------------------------
CREATE TABLE `user_preference` (
    `user_id`          BIGINT UNSIGNED NOT NULL,
    `theme`            ENUM('light','dark','system') NOT NULL DEFAULT 'system' COMMENT '前端 localStorage["mz-theme"]',
    `language`         VARCHAR(10)     NOT NULL DEFAULT 'zh-CN',
    `currency`         CHAR(3)         NOT NULL DEFAULT 'CNY',
    `sound_enabled`    TINYINT(1)      NOT NULL DEFAULT 1     COMMENT '记账按键音效',
    `default_ledger_id` BIGINT UNSIGNED DEFAULT NULL,
    `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    CONSTRAINT `fk_pref_user`   FOREIGN KEY (`user_id`)           REFERENCES `user` (`id`)   ON DELETE CASCADE,
    CONSTRAINT `fk_pref_ledger` FOREIGN KEY (`default_ledger_id`) REFERENCES `ledger` (`id`) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户偏好设置';


-- -----------------------------------------------------------------------------
-- event_log —— 埋点事件 【可选】
--   对应 PRD 第 9 章「数据埋点与指标」。若埋点走第三方（神策/GA）可整表删除。
-- -----------------------------------------------------------------------------
CREATE TABLE `event_log` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`     BIGINT UNSIGNED DEFAULT NULL,
    `event_name`  VARCHAR(50)     NOT NULL              COMMENT '如 txn_created / budget_alert_shown',
    `properties`  JSON            DEFAULT NULL          COMMENT 'PRD 9.2 表格中的「关键属性」',
    `occurred_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_event_name_time` (`event_name`, `occurred_at`),
    KEY `idx_event_user_time` (`user_id`, `occurred_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '【可选】埋点事件，不参与业务逻辑';


-- =============================================================================
--  六、V1.2 才启用的预留结构（V1.0 不要执行，留作参考）
-- =============================================================================
--
--  1) Transaction.split —— 分摊规则与分摊明细（情侣 AA）
--     将来以 JSON 列挂在 transaction 上即可：
--        ALTER TABLE `transaction`
--          ADD COLUMN `split` JSON DEFAULT NULL COMMENT '分摊明细，V1.2';
--
--  2) settlement —— 情侣场景的结算记录
--        CREATE TABLE `settlement` (
--            `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
--            `ledger_id`      BIGINT UNSIGNED NOT NULL,
--            `from_user_id`   BIGINT UNSIGNED NOT NULL,
--            `to_user_id`     BIGINT UNSIGNED NOT NULL,
--            `amount`         DECIMAL(12,2)   NOT NULL,
--            `settled_at`     DATETIME        NOT NULL,
--            PRIMARY KEY (`id`),
--            KEY `idx_settle_ledger` (`ledger_id`, `settled_at`)
--        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='【V1.2】结算记录';
--
--  3) Ledger 的固定支出与长期目标（V2.3 家庭场景，PRD 2.1.3）
--     会引入 `fixed_expense` 与 `savings_goal` 两张表，
--     并直接影响 budget.safe_spend_mode = 'exclude_fixed' 的计算。


-- =============================================================================
--  脚本结束
--  下一步：执行 02_seed.sql 灌入系统预设数据
-- =============================================================================
