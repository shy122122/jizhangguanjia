# 明账 · 数据库设计说明

依据 `PRD/个人财务管理产品-PRD-v1.0.md` 第 6 章「数据模型」，并对照 `前端代码（前端工程师）/整理版/` 23 个页面实际使用的字段整理而成。

| 项目 | 取值 |
| --- | --- |
| 数据库 | MySQL **8.0.16 或更高** |
| 库名 | `mingzhang` |
| 字符集 / 排序规则 | `utf8mb4` / `utf8mb4_0900_ai_ci` |
| 存储引擎 | InnoDB |
| 表数量 | 13 张（业务表 12 + 可选埋点表 1） |
| 视图数量 | 6 个 |

> **为什么要求 8.0.16+**：`transaction` 表用了 `CHECK` 约束来保证「转账必须有转入账户」「金额必须为正」这类业务不变量。MySQL 在 8.0.16 之前的版本会**静默忽略** `CHECK` 约束 —— 脚本照样能建成功，但约束形同虚设。这是最容易被环境坑到的一点。
>
> **这不是理论风险，本机就踩上了，而且已经修好。** 开发机原先装的是 **MySQL 8.0.13**，实测结果：
>
> - `01_schema.sql` 执行**零报错**，13 张表全部建出来；
> - 但 `information_schema` 里 `constraint_type='CHECK'` 的记录数是 **0** —— 8 条 CHECK 不是"没生效"，是**根本没被记录**（8.0.16 之前 CHECK 子句只被解析、然后丢弃）；
> - 直接插脏数据（转出转入同一账户、非转账没分类、金额超上限……）**9 条里有 8 条真的插进去了**，只有「金额为负」被 `UNSIGNED` 类型拦下。
>
> 也就是说：在那台机器上**数据库层没有任何业务不变量保护**，全靠应用层自己兜。
>
> **2026-09-24 已升级到 8.0.46**，8 条 CHECK 全部生效，9 条脏数据全部被拦。升级过程和验证见 **12.4 节**。

> ⚠️ **一个新手容易漏掉的点**：升级 MySQL 二进制**不会**让已有的表自动获得 `CHECK` 约束。因为 8.0.13 当时是把 CHECK **丢弃**了，数据字典里压根没有这条记录，升级只是换了引擎，找不回已经丢掉的东西。**必须用新版本重新执行一次 `01_schema.sql` 重建表**，约束才会真正写进去。

---

## 一、怎么跑

按顺序执行三个脚本。`01` 会先 `DROP DATABASE IF EXISTS mingzhang`，所以**不要在已有数据的库上重复执行**。

```bash
mysql -u root -p < 01_schema.sql    # 建库 + 建表 + 索引 + 约束
mysql -u root -p < 02_seed.sql      # 系统预设分类/账户/规则 + 演示数据
mysql -u root -p < 03_views.sql     # 6 个统计视图
```

Windows 下若 `mysql` 不在 PATH：

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < 01_schema.sql
```

`03_views.sql` 可以安全重复执行。`02_seed.sql` 虽然技术上可重复执行，但会先
`TRUNCATE` 全部业务表，只允许用于空白的本地演示库，**严禁在已有用户数据的环境执行**。

已有开发库需要保留数据并升级后端安全修复时，执行：

```bash
mysql -u root -p < 04_backend_fixes.sql
mysql -u root -p < 05_user_avatar.sql
```

`04` 会增加 JWT 会话版本、流水删除时间，修复导入批次唯一键及今日可花下限；
`05` 只新增用户头像表，可重复执行且不会清除已有业务数据。

---

## 二、表关系

```
                    ┌──────────────────────┐
                    │  user  用户          │
                    └───┬──────────────┬───┘
              1──1      │              │      1──N
        ┌───────────────┘              └──────────────┐
        ▼                                             ▼
  user_preference                              event_log 【可选】
                                                       │
                    ┌──────────────────────────────────┘
                    │ 1──N
                    ▼
            ┌───────────────┐          ┌──────────────────┐
            │ ledger  账本  │──N──N────│ ledger_member    │
            └───┬───────────┘          │ 【V1.2 预留】    │
                │                      └──────────────────┘
                │ 1──N
      ┌─────────┼───────────┬──────────────┬─────────────┐
      ▼         ▼           ▼              ▼             ▼
 ┌─────────┐ ┌─────────┐ ┌────────────┐ ┌────────┐ ┌────────────┐
 │ account │ │category │ │transaction │ │budget  │ │import_batch│
 │  账户   │ │  分类   │ │  流水      │ │ 预算   │ │ 导入批次   │
 └─────────┘ └────┬────┘ └────────────┘ └───┬────┘ └────────────┘
                   │                         │
                   │ parent_id（二级分类）    │ 1──N
                   │                         ▼
                   │                  ┌─────────────────┐
                   │                  │ budget_category │
                   │                  └─────────────────┘
                   │
              ┌────┴─────────┐
              │ category_rule│  关键词 → 分类
              └──────────────┘

  引用关系：transaction.category_id  → category
            transaction.account_id   → account（转出方 /
                                          收支所属账户）
            transaction.to_account_id→ account（转入方，仅转账）
            transaction.import_batch_id → import_batch
```

---

## 三、表清单

| # | 表名 | 中文 | 说明 | PRD 出处 |
| --- | --- | --- | --- | --- |
| 1 | `user` | 用户 | 登录凭据、登录失败锁定 | 6.1 / 4.1.2 |
| 2 | `user_avatar` | 用户头像 | 图片本体、类型、哈希与公开读取标识 | 设置页 |
| 3 | `ledger` | 账本 | 个人/情侣/家庭账本的容器 | 6.4 |
| 4 | `ledger_member` | 账本成员 | 【V1.2 预留】V1.0 不写入 | 6.4 |
| 5 | `account` | 账户 | 现金/微信/支付宝/银行/信用卡 | 6.1 / 4.7 |
| 6 | `category` | 分类 | 支出与收入两套，共 16 个预设 | 6.1 / 4.7 |
| 7 | `import_batch` | 导入批次 | 账单导入与整批撤销 | 4.3.4 / 6.1 |
| 8 | `transaction` | 交易流水 | **核心表** | 6.1 / 6.2 / 6.3 |
| 9 | `budget` | 月度预算 | 含预警阈值与今日可花算法选择 | 6.1 / 4.4 |
| 10 | `budget_category` | 分类预算 | 某分类的月度上限 | 6.1 / 4.4.3 |
| 11 | `category_rule` | 关键词规则 | 商户名 → 分类自动匹配 | 4.2.4 / 11 |
| 12 | `user_preference` | 用户偏好 | 主题/语言/币种/音效 | 前端驱动 |
| 13 | `event_log` | 埋点事件 | 【可选】不参与业务逻辑 | 9.2 |

---

## 四、五个关键设计决策

这五条会影响到后续所有功能开发，单独拎出来说清楚。

### 1. 所有业务数据都挂在 `ledger`（账本）下，而不是直接挂 `user`

PRD 6.4 把这一层称为「本项目中唯一一处『为未来设计』的地方」。

`account` / `category` / `transaction` / `budget` 的**外键全部指向 `ledger_id`**，没有一张表直接挂 `user_id`。V1.0 每个用户注册时自动创建一个 `type='personal'` 的默认账本，`user` 与 `ledger` 是一对一，**UI 上完全不暴露账本概念**，用户感知不到这一层存在。

**代价**是每张表多一个字段、每个查询多一层关联；**收益**是 V1.4 做情侣共享账本时，只需要新增 `ledger_member` 记录，不必重构已有的 5 张表和数据迁移。

`transaction.created_by` 保留了「谁记的这笔」—— 个人账本里它等于账本所有者，共享账本里它区分成员。PRD 6.1 原称 `user_id`，改为 `created_by` 是为了让语义在共享场景下依然成立。

### 2. 账户余额**不落库**，实时聚合

PRD 6.3 明确「账户余额是计算值，不存储」。

`account` 表里只有 `initial_balance`（用户录入的起始基数），当前余额由 `v_account_balance` 视图从流水实时算出：

```
余额 = initial_balance + Σ收入 − Σ支出 − Σ转出 + Σ转入
```

**为什么不存**：存了就要保证「写一笔流水」和「改一次余额」在同一个事务里、还要处理并发写同一张卡的竞争。对个人记账（月均几百笔）来说这个复杂度换不来任何可感知的性能收益。

`account.credit_limit`（授信额度）和 `bill_due`（当期待还）是**外部事实**，不是从流水推出来的，所以它们是实打实的存储字段 —— 银行告诉你欠多少就是多少，不能由系统算。

> **信用卡的方向和其他账户是反的，这里踩过一次坑。** 普通账户支出让余额变小，信用卡支出让欠款变大。所以信用卡不要读 `balance`，要读视图里单独的 `credit_used` / `credit_available`：
>
> ```
> credit_used      = 初始已用 + Σ支出 − Σ收入 + Σ转出 − Σ转入
> credit_available = credit_limit − credit_used
> ```
>
> 「转入」是**还款**（储蓄卡 → 信用卡的转账），会减少欠款，所以是减号 —— 这个符号很容易写反。演示数据里信用卡消费 88 元，正确的是可用 `59912`，写成加号就会得到 `60088`（超过授信额度，一眼假）。

### 3. 转账是**一条记录 + 两个账户字段**，不是两条记录

PRD 6.3 / 附录 B #6 的决定。`account_id` 是转出方，`to_account_id` 是转入方。

**为什么不拆成「转出 + 转入」两条**：两条记录天然会出现不一致（改了一边忘了另一边、撤销只撤了一半），而一条记录的一致性由数据库约束直接保证：

```sql
CONSTRAINT `ck_txn_transfer` CHECK (
    (type =  'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
 OR (type <> 'transfer' AND to_account_id IS NULL)
)
```

**转账不计入预算、不计入收支**。它只是钱在账户之间移动，不是消费也不是收入。`v_monthly_summary` 和预算视图都只统计 `expense` / `income`。

### 4. 金额一律 `DECIMAL(12,2)`，绝不用 `FLOAT` / `DOUBLE`

浮点数存不下 0.1 这样的十进制小数（`0.1 + 0.2 != 0.3`）。记账产品里一分钱的误差就是 bug。

- `amount` 用 `DECIMAL(12,2) UNSIGNED`，**恒为正数**，方向由 `type` 表达，不用正负号。
- 上限 9,999,999.99 由 `CHECK` 约束守住（PRD 4.2.5 的规定）。

### 5. 删除是软删除

PRD 4.5.3 / 附录 B #7 要求「删除可撤销」。`transaction.is_deleted = 1` 表示已撤销。

**所有视图和统计查询都必须带 `WHERE is_deleted = 0`** —— 这是最容易漏掉、漏掉后又最难发现的一类 bug（删掉的记录悄悄回到统计里）。

---

## 五、核心表 `transaction` 详解

```sql
`id`              BIGINT UNSIGNED  主键
`ledger_id`       → ledger         所属账本
`created_by`      → user           记录人
`type`            ENUM              expense / income / transfer
`amount`          DECIMAL(12,2)     恒正，≤ 9,999,999.99
`category_id`     → category        转账时为 NULL
`account_id`      → account         转出方 / 收支所属账户
`to_account_id`   → account         仅转账有值，转入方
`happened_at`     DATETIME          发生时间，可跨天补记
`note`            VARCHAR(100)      备注（PRD 4.2.5 限制 100 字符）
`merchant`        VARCHAR(100)      商户名，导入时填充
`source`          ENUM              manual / import_text / import_csv
`import_batch_id` → import_batch    用于整批撤销
`visibility`      ENUM              【V1.2 预留】shared / private
`is_deleted`      TINYINT(1)        软删除
```

### 索引

PRD 6.2 指定了三条关键索引，全部落地：

| 索引 | 覆盖场景 |
| --- | --- |
| `idx_txn_ledger_time (ledger_id, happened_at DESC)` | 流水列表、统计聚合 |
| `idx_txn_ledger_cat_time (ledger_id, category_id, happened_at)` | 分类统计、预算计算 |
| `idx_txn_ledger_amt_time (ledger_id, amount, happened_at)` | 导入去重（金额 + 日期 + 商户相似度） |

**为什么第一条要 `DESC`**：流水列表默认按时间倒序展示（最新的在最上面）。MySQL 8.0 才真正支持降序索引 —— 这也是选 MySQL 8 而非 5.7 的实际理由之一。

另外补充了四条：`idx_txn_batch`（整批撤销）、`idx_txn_account_time`（余额聚合）、`idx_txn_to_account`（转入侧聚合）、`idx_txn_merchant`（取商户名前 32 字符做前缀索引）。

### CHECK 约束

| 约束 | 保证 | 实测错误码 |
| --- | --- | --- |
| `ck_txn_amount_positive` | 金额 **≠ 0**（负数由类型拦，见下） | 3819 |
| `ck_txn_amount_max` | 金额 ≤ 9,999,999.99 | 3819 |
| `ck_txn_transfer` | 转账必有转入账户且不与转出账户相同；非转账必然没有转入账户 | 3819 |
| `ck_txn_category` | 非转账必须有分类 | 3819 |
| `ck_account_credit` | 非信用卡账户不得填授信/待还 | 3819 |
| `ck_budget_yellow` / `ck_budget_red` | 预警阈值在 50–95 / 90–120 内 | 3819 |
| `ck_budgetcat_amount` | 分类预算 ≥ 0 | 3819 |

这些约束是**最后一道防线**。应用层该校验的还是要校验（要给出友好的错误提示），但即使应用层漏了，脏数据也进不来。

> **一个容易误判的点**：`amount` 是 `UNSIGNED`，负数在**类型层**就被拒了，报的是 `ERROR 1264 Out of range value`，根本走不到 `ck_txn_amount_positive`。所以拿负数去测这条 CHECK 会以为它没生效 —— 它真正拦的是**金额 = 0**。要验它，请拿 `0.00` 去测。

### 两条实现时的坑（都已修复，记下来避免重踩）

1. **`ERROR 3823`：外键引用动作与 CHECK 冲突。** `fk_txn_category` 原本写的是 `ON DELETE SET NULL`，而 `category_id` 又被 `ck_txn_category` 引用 —— MySQL 硬性规定这两者不能共存。而且 `SET NULL` 在语义上本来就错：把历史流水的分类置空会让它违反 `ck_txn_category`，删除操作反而在运行时报错。现在保持默认的 `RESTRICT`，分类要下线请用 `category.is_archived` 归档。

2. **MySQL 会为外键自动补索引。** `transaction` 上显式建了 7 条索引，实际存在 10 条 —— 多出来的 3 条是 `fk_txn_user` / `fk_txn_category` / `fk_txn_account` 的自动索引，因为它们的外键列不是任何复合索引的首列。这是正常行为，不是重复索引。

---

## 六、统计视图

| 视图 | 用途 |
| --- | --- |
| `v_account_balance` | 每个账户的当前余额、转入转出明细、信用卡可用额度 |
| `v_category_month_spend` | 分类 × 月份 的支出/收入汇总（饼图、排行） |
| `v_monthly_summary` | 月度收入/支出/结余（统计页顶部卡片） |
| `v_budget_progress` | 预算执行进度 + 预警档位 |
| `v_today_quota` | **今日可花**（产品核心差异化） |
| `v_budget_category_progress` | 分类预算进度（预算页列表） |

### 今日可花的算法

```
今日可花 = 本月剩余预算 ÷ 本月剩余天数
```

实现在 `v_today_quota`。月末最后一天 `remaining_days = 1`，公式自然等于「一次性放出全部余额」，不需要额外分支。

```sql
SELECT today_quota, remaining, remaining_days, alert_level
  FROM v_today_quota
 WHERE ledger_id = 1;
```

⚠️ 这个视图**只返回当前月**。如果当前月没建预算，它返回 0 行 —— 这是正确的产品行为（前端应引导用户去建预算），不是脚本错误。

查询任意历史月份时，直接查 `v_budget_progress WHERE period_value = '2026-09'`（该视图的 `remaining_days` 列在非当前月为 `NULL`）。

### 关于 `alert_level` 与「支出不标红」

`v_budget_progress.alert_level` 返回 `normal` / `yellow` / `red`，三档对应 PRD 4.4.4 的预警阈值。

**这个字段只用于预算进度条和预警文案。** 产品有一条硬约束：**支出金额本身永不标红** —— 一天要记 5 笔以上支出，全标红会让界面充满惩罚感，破坏记账习惯。红色只留给真正的例外（预算超支、删除、错误）。

不要把这个字段的红色扩散到流水列表的数字上。

---

## 七、相对 PRD 的补充

PRD 第 6 章是数据模型的权威来源，但前端原型里出现了一些 PRD 没定义的字段，已一并纳入：

| 表 | 字段 | 来源 |
| --- | --- | --- |
| `account` | `color` / `is_default` | 前端账户列表的色点与默认选中 |
| `account` | `card_tail` | 前端显示「尾号 4108 / 8820」 |
| `account` | `credit_limit` / `bill_due` | 前端信用卡的「信用授信 60k」「待还账单」 |
| `budget` | `alert_yellow_pct` / `alert_red_pct` | 前端设置页的滑块（黄线 50–95，红线 90–120） |
| `budget` | `safe_spend_mode` | PRD 待定问题 #5「自然日平摊 / 扣除刚需」 |
| `user` | `display_name` / `avatar_url` / `uid` | 设置页展示，`uid` 形如 `9402-8841-CLARITY` |
| `user_avatar` | `public_id` / `mime_type` / `image_data` | 自定义头像图片本体与公开读取标识，单图最大 5MB |
| `user_preference` | 整表 | PRD 未定义，前端设置页的开关项驱动 |
| `category_rule` | 整表 | PRD 4.2.4 提到关键词分类，11 章要求「做成可配置规则表」 |

---

## 八、预留结构（V1.0 不启用）

PRD 6.4 要求预留、但 V1.0 用不到的：

| 结构 | 位置 | 何时启用 |
| --- | --- | --- |
| `ledger_member` 表 | 已建表，不写入 | V1.4 情侣共享账本 |
| `transaction.visibility` 列 | 已建列，恒为 `shared` | V1.4 共享账本中「仅自己可见」 |
| `category.parent_id` 二级分类 | 已建列，恒为 `NULL` | 后续版本 |
| `transaction.split` | 脚本内注释，JSON 列 | V1.2 情侣 AA 分摊 |
| `settlement` 表 | 脚本内注释 | V1.2 情侣结算 |
| `fixed_expense` / `savings_goal` | 未定义 | V2.3 家庭场景 |

**关于 `safe_spend_mode = 'exclude_fixed'`**：这个模式要扣除「刚需支出」后再平摊，但固定支出表要到 V2.3 才引入。在此之前 `v_today_quota` 一律按自然日平摊计算，即等价于 `daily_flat`。字段先留着，是为了不让「用户改过这个开关」的事实丢失。

---

## 九、预设数据（`02_seed.sql`）

### 默认分类（16 个，PRD 4.7）

颜色取自 PRD 13.6 的 10 色图表色板，**颜色与分类绑定，不随排序变化** —— 否则用户对「哪块是哪类」的颜色记忆会被打断。

| 支出（10） | 颜色 | | 收入（6） | 颜色 |
| --- | --- | --- | --- | --- |
| 餐饮美食 | `#14B8A6` Teal | | 工资 | `#14B8A6` Teal |
| 交通出行 | `#06B6D4` Cyan | | 奖金 | `#06B6D4` Cyan |
| 日用百货 | `#0EA5E9` Sky | | 兼职 | `#0EA5E9` Sky |
| 居家生活 | `#6366F1` Indigo | | 投资收益 | `#6366F1` Indigo |
| 休闲娱乐 | `#8B5CF6` Violet | | 红包 | `#8B5CF6` Violet |
| 医疗保健 | `#EC4899` Pink | | 其他 | `#64748B` Slate |
| 学习进修 | `#F43F5E` Rose | | | |
| 通讯 | `#F59E0B` Amber | | | |
| 人情往来 | `#84CC16` Lime | | | |
| 其他 | `#64748B` Slate | | | |

### 默认账户（5 个，PRD 4.7）

现金、微信支付钱包、支付宝、招商银行储蓄卡、信用卡。

### 关键词规则（`category_rule`）

按 `priority` 排序取最高分：**具体品牌（20–30）> 行业泛词（10）**。

例如「美团买药」的规则优先级是 30，高于「美团」的 20 —— 否则买药的记录会被归到餐饮。

`ledger_id = NULL` 表示这是**系统内置规则，所有账本共用**。用户自建的规则带自己的 `ledger_id`。

---

## 十、演示数据（`02_seed.sql` B 部分）

`02_seed.sql` 里包含一套完整的演示数据，用于本地验证：

- 演示用户 `13800001234` / `demo@mingzhang.app`，密码 `Demo123456`（bcrypt cost=10 的真实哈希）
- 一个 `personal` 账本
- 2026-09 的月度预算 8000 元 + 3 条分类预算
- 1 个导入批次 + 18 笔流水（含 1 笔转账、1 笔已撤销）

预期核对值：

| 指标 | 期望值 |
| --- | --- |
| 有效流水数（`is_deleted = 0`） | 17 |
| 2026-09 支出合计 | 3461.00 |
| 2026-09 剩余预算 | 4539.00 |
| 今日可花（2026-09-24，剩 7 天） | 648.43 |

账户余额（`v_account_balance`）手算核对值 —— 这组数字是手算出来的，能直接验出聚合方向写错：

| 账户 | `balance` | 备注 |
| --- | --- | --- |
| 现金 | 500.00 | 无流水，等于初始值 |
| 微信支付钱包 | 1097.50 | `1280.50 + 200 − 383`（383 不含那笔已撤销的 300） |
| 支付宝 | 2856.30 | `2360 + 86.30 − 590 + 1000`（1000 是转账转入） |
| 招商银行储蓄卡 | 33600.00 | `18500 + 18500 − 2400 − 1000`（−1000 是转账转出） |
| 信用卡 | −88.00 | 净负债口径；应改读 `credit_used = 88.00`、`credit_available = 59912.00` |

已撤销的那笔 300 元**必须不出现在任何统计里** —— 这是软删除最容易漏的地方。

⚠️ **上线前必须删除演示数据** —— 脚本末尾附了清理语句。

> 注意：PRD 4.7 的默认分类与账户应当在**用户注册时**按模板复制到该用户的账本，而不是依赖本脚本的全局数据 —— 因为 `category` 和 `account` 都是 ledger 级的，每个账本需要自己的一份。本脚本灌的这份既是给演示用户用的，也是给后续「注册时复制模板」提供源数据的。

---

## 十一、前端对接提示

前端是纯静态原型（file:// 可跑，`window.MZ` 命名空间，无构建步骤），目前数据存在浏览器里：

| 前端现状 | 对应到数据库 |
| --- | --- |
| `localStorage['mz-theme']` | `user_preference.theme` |
| `sessionStorage['mz-return']` | 无对应，纯前端导航态 |
| 账户列表（含尾号/授信/待还） | `account` + `v_account_balance` |
| 首页「今日可花」大卡片 | `v_today_quota.today_quota` |
| 预算页进度条 | `v_budget_progress` / `v_budget_category_progress` |
| 流水分页列表 | `transaction` 按 `(ledger_id, happened_at DESC)` 查 |
| 统计页图表 | `v_category_month_spend` + `v_monthly_summary` |

⚠️ 另外记一笔与数据库无关、但会影响联调的前端问题：**25 个页面依赖 `cdn.tailwindcss.com` 和 Google Fonts CDN，`assets/css/` 下没有本地 Tailwind 产物**。断网（file://）打开会退化成浏览器默认样式，与「双击 index.html 直接跑」的硬约束冲突。接后端前建议先解决这一项。

---

## 十二、验证记录

### 12.1 容器验证（全部通过）

三个脚本已在 **MySQL 8.0.46**（一次性 Docker 容器，端口 13306，与任何现有数据库隔离）上实跑通过，全部断言绿灯：

```bash
bash _verify.sh          # 起容器 → 跑脚本 → 断言 → 删容器
```

### 12.2 本机验证 —— 升级**前**（8.0.13，结构/数据通过，约束失败）

> 这一节记录的是升级前的历史状态，留作对照。升级后的结果见 **12.4 节**。

```bash
export MYSQL_PWD='<你的 root 密码>'
bash _verify.sh local    # 在本机已装的 MySQL 上跑同一套断言
```

本机（8.0.13）结果：

| 断言组 | 结果 |
| --- | --- |
| 三个脚本执行 + 重复执行幂等 | ✅ 全部无报错 |
| 基础表 12 / 视图 6 / `transaction` 索引 10 | ✅ |
| 数据断言（支出 3461.00、今日可花 648.43、五个账户余额…） | ✅ 逐项一致 |
| **CHECK 约束数量** | ❌ 期望 8，**实际 0** |
| **9 条脏数据应被拒** | ❌ **8 条被插进去了**，只有「金额为负」被 `UNSIGNED` 拦下 |

**结论：这个库在本机可以正常用 —— 表、视图、索引、聚合计算全部正确；唯独数据库层的业务不变量保护是缺失的，因为服务器版本太老。**

跑 `local` 模式时脚本会往库里插测试数据，所以收尾时它会自动重跑一遍 `02_seed.sql` 把演示数据还原干净。

### 12.3 自检脚本做了什么

`_verify.sh` 是配套的自检脚本，容器模式和本机模式跑**同一套断言**：

1. 按顺序执行 `01` / `02` / `03`，并**重复执行 `02` / `03` 验证幂等**；
2. 断言结构：13 张表 / 6 个视图 / 9 条 CHECK 约束 / `transaction` 上 10 条索引；
3. 断言数据：对照上面「演示数据」的手算期望值逐项核对；
4. 冒烟测试 9 条**必须被拒**的脏数据 + 5 条**必须通过**的正常数据（防止约束写得太严）；
5. 收尾 —— 容器模式删容器；本机模式重跑 `02_seed.sql` 还原演示数据。

容器模式的通过项摘要：

| 类别 | 结果 |
| --- | --- |
| `01_schema.sql` / `02_seed.sql` / `03_views.sql` | 均无报错 |
| 重复执行 `02` / `03` | 幂等，无报错 |
| 结构（表/视图/约束/索引） | 12 / 6 / 8 / 10，全部符合 |
| 今日可花 | `648.43`（剩余 4539.00 ÷ 剩 7 天） |
| 五个账户余额 | 与手算值逐个一致，含信用卡 `credit_available = 59912.00` |
| 9 条脏数据 | 全部被拦（8 条 `ERROR 3819` + 1 条 `ERROR 1264`） |
| 5 条正常数据 | 全部通过 |

> 本次验证真的抓出了两个问题，都已在 `01_schema.sql` 里修掉：`ERROR 3823` 外键-约束冲突（见上），以及信用卡可用额度算反了（原本会得到超过授信额度的 `60088`）。**手算期望值这一步不能省** —— 只看「脚本没报错」是发现不了第二类问题的。
>
> 顺带一提，升级前本机跑出来的 `CHECK 约束数量 = 0` 也是同一个道理：如果只检查「脚本有没有报错」，那台 8.0.13 会被完全误判成"一切正常"。

### 12.4 本机 MySQL 升级记录（8.0.13 → 8.0.46）

2026-09-24 完成，目标是把 `CHECK` 约束真正跑起来。选 **8.0.46** 而不是 8.4 LTS 的原因：同属 8.0 线，属补丁级升级，不用改 `my.ini`、不动密码插件，风险最低；且与 12.1 容器验证所用版本**完全一致**，两边结果可直接对照。

**升级动作**

| 步骤 | 做法 |
| --- | --- |
| 备份 | `mysqldump --all-databases`（5 个库）+ datadir 物理拷贝 + 8.0.13 basedir 拷贝 |
| 基线 | 逐库逐表记录行数，升级后比对 |
| 取包 | 官方 `mysql-8.0.46-winx64.zip`，MD5 校验通过（`003f527d5df61b663ff191038cd676bd`） |
| 换二进制 | 停 `MySQL80` 服务 → 用 8.0.46 覆盖 basedir 的 `bin`/`lib`/`share`/`include`/`docs` → 启动 |

**为什么用「换二进制」而不是 MSI 升级**：8.0.46 官方**没有提供 MSI 包**（只有 ZIP）；而且不改服务定义意味着 `binPath` 全程不变，回滚时连服务配置都不用碰。

**服务端升级日志**（`Data/SHYLZ.err`）

```
[System] Data dictionary upgrading from version '80013' to '80023'.
[System] Data dictionary upgrade from version '80013' to '80023' completed.
[System] Server upgrade from '80013' to '80046' started.
[System] Server upgrade from '80013' to '80046' completed.
```

零错误。**本机除 `mingzhang` 外还有 `123`、`shy`、`资料库学习` 三个库（共 8 张表）**，升级后逐表行数与基线完全一致，中文数据抽查正常。

**升级后重跑自检**

```bash
export MYSQL_PWD='<你的 root 密码>'
bash _verify.sh local
# server version: 8.0.46
```

| 断言组 | 升级前 | 升级后 |
| --- | --- | --- |
| 基础表 12 / 视图 6 / `transaction` 索引 10 | ✅ | ✅ |
| 数据断言（今日可花 648.43、五账户余额…） | ✅ | ✅ |
| **CHECK 约束数量** | ❌ 0 | ✅ **8** |
| **9 条脏数据应被拒** | ❌ 8 条漏网 | ✅ **全部拦截** |
| **5 条正常数据应通过** | ✅ | ✅ |

**关键点**：升级二进制**不会**自动补回已丢弃的 `CHECK` 约束 —— 必须用新版本重新执行 `01_schema.sql` 重建表。这是本次最容易踩空的一步。

**遗留**：`my.ini` 里有几项在 8.0.46 已弃用，启动时会有告警，但**不影响功能**，本次未改动（改动 `my.ini` 有引入新问题的风险）：

- `default_authentication_plugin` —— 已弃用，**8.4 起被移除**，将来若升级到 8.4 必须先改成 `authentication_policy`
- `sync_master_info` / `sync_relay_log_info` —— 建议改用 `sync_source_info`
- `innodb_log_file_size` —— 建议改用 `innodb_redo_log_capacity`
- `mysql_native_password` —— 已弃用，建议迁到 `caching_sha2_password`
