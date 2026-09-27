# 明账 · 后端

Express 5 + mysql2 原生 SQL 实现的明账后端，同时**同源托管**相邻前端工程 `前端代码（前端工程师）/fronted/整理版` 下的 23 个页面。

> ⚠️ **必须通过 http 访问，不能双击 HTML 用 `file://` 打开。**
> `file://` 下页面的 origin 是 `null`，`fetch` 会被浏览器直接拦掉，表现为
> 「页面能打开，但所有数字都是空的」。请先 `npm start`，然后访问 http://localhost:3000 。

---

## 一、快速开始

### 1. 建库（如果还没建）

全新环境按相邻目录 `../数据库脚本/README.md` 执行：

```bash
mysql -u root -p < ../数据库脚本/01_schema.sql
mysql -u root -p < ../数据库脚本/02_seed.sql
mysql -u root -p < ../数据库脚本/03_views.sql
```

已有开发库不要重跑 `01_schema.sql` 或 `02_seed.sql`，它们会删除结构或清空数据。
本次后端安全修复只执行一次增量迁移：

```powershell
$env:MIGRATION_DB_USER='root'
$env:MIGRATION_DB_PASSWORD='你的迁移账号密码'
npm run migrate:backend-fixes
npm run migrate:avatar
Remove-Item Env:MIGRATION_DB_PASSWORD
```

日常使用的 `mz_app` 故意没有表结构权限，不能用来执行迁移。

### 2. 建一个专用低权限账号

后端**不需要** DDL 权限（不建表、不改表）。用最小权限账号跑，比用 root 安全：

```sql
CREATE USER IF NOT EXISTS 'mz_app'@'localhost' IDENTIFIED BY '<自定密码>';
GRANT SELECT, INSERT, UPDATE, DELETE ON `mingzhang`.* TO 'mz_app'@'localhost';
FLUSH PRIVILEGES;
```

> 注意这里**没有** `CREATE / ALTER / DROP / GRANT`。少给这几项，代码里万一写漏了
> `WHERE ledger_id = ?` 也不会把表结构搞坏。

### 3. 配置

```bash
copy .env.example .env
```

然后填两个必填项，其余可保持默认：

- `DB_PASSWORD` —— 上一步给 `mz_app` 设的密码
- `JWT_SECRET` —— 随便一个长随机串，别用占位值（启动时会校验并报错）
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

生产环境若部署在一层 Nginx/网关后，将 `TRUST_PROXY_HOPS` 设为 `1`；直连保持 `0`。
该值会影响登录与短信验证码的 IP 限流，不能在未知代理拓扑下随意设为更大数字。

### 4. 装依赖并启动

```bash
npm install          # 若拉包慢：npm config set registry https://registry.npmmirror.com
npm start            # → http://localhost:3000
```

运行依赖保持精简，密码哈希使用 `bcryptjs`（不是需要本地编译的 `bcrypt`），Windows 下无需构建工具。

### 5. 打开页面

浏览器访问 http://localhost:3000 ，用演示账号登录：

| 账号 | 密码 |
| --- | --- |
| `demo@mingzhang.app` 或 `13800001234` | `Demo123456` |

演示账号为公共只读账号：允许查看示例数据与退出登录，不允许新增、编辑、删除数据，
也不允许改密或永久注销。自动化测试可临时设置 `DEMO_ACCOUNT_PROTECTED=false`，
普通开发和生产环境请保持默认的 `true`。

**页面接线进度**（哪些页面读的是真数据）：

| 状态 | 页面 |
| --- | --- |
| 已接真数据 | 01 登录/注册/找回密码 · 04 首页 · 09/10 预算 · 11 记账 · 13 流水/导出 · 15/17 统计 · 18/19 导入 · 21 设置总览 · 22 分类管理 · 23 数据注销 |
| 仍是状态展示稿 | 02/03 引导态 · 05/06/07 首页状态 · 08 预算超支态 · 12/14 流水空态/无结果态 · 16 统计空态 · 20 导入诊断态 |

未单独接接口的 10 个页面**不是坏的**：它们是主页面在不同数据状态下的设计稿，
用于核对空态、告警态、诊断态和引导态，本身不承担独立业务入口。

> ⚠️ 演示数据固定在 **2026-09**。如果「今天」不在 9 月，首页的「今日可花」和
> 「今日累计支出」会按真实当天计算 —— 想回到演示基线，在地址栏加 `?period=2026-09`。

---

## 二、常用命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动（同时托管 API 与页面） |
| `npm run dev` | 启动并监听文件变更自动重启 |
| `npm run migrate:backend-fixes` | 对已有库安全应用一次 `04_backend_fixes.sql`；会先检查迁移状态 |
| `npm run migrate:avatar` | 对已有库安全创建 `user_avatar` 头像表，可重复执行 |
| `npm run check:static` | 不启动服务、不连接数据库，检查 JS 与 23 个页面的内联脚本/DOM 引用 |
| `npm run smoke` | 不经过 HTTP，直接验「配置 → 数据库 → 视图 → 密码哈希」 |
| `npm run check` | **后端自检**：挂到随机端口跑 336 项断言，含全部写接口与静态托管 |
| `npm run check:client` | **客户端自检**：把真的 `api.js` / `ui.js` 塞进假浏览器打真接口 |
| `npm run check:page` | **页面接线自检**：脚本引用的 id / 跳转目标 + 页面真跑一遍 |

三条自检分工不同，改完东西按受影响的范围挑着跑：

| 你改了什么 | 该跑哪条 |
| --- | --- |
| 路由 / service / SQL | `npm run check` |
| `api.js` / `ui.js` | `npm run check:client`（顺带 `check:page`，页面脚本也依赖它） |
| 任何一个页面 HTML | `npm run check:page` |

`npm run check` 覆盖登录、六个视图、记账穿透、预算、统计、导入去重与撤销、
分类/账户管理、设置，并且**每一条写操作都自带清理**，跑完数据库会和跑之前完全一致
（脚本最后三行断言就是在证明这件事）。

`npm run check:client` 和 `npm run check:page` 解决的是同一类问题：前端模块和页面
是**手写**的，它们和后端之间只有一堆字符串约定（URL 路径、query 参数名、响应字段名、
DOM id）。这类地方写错了浏览器里不会抛错，只表现为「那一格一直是 —」，所以让脚本
先炸。两条都不替代浏览器实测 —— 布局、样式、交互仍需人眼看。

> 三条都占用随机端口，所以 `npm start` 开着也能跑。

---

## 三、目录结构

```
后端代码(后端工程师)/
├── src/
│   ├── server.js            入口：中间件 → 路由 → 静态托管 → 监听
│   ├── config.js            读 .env 并校验，导出冻结配置
│   ├── db.js                mysql2 连接池 + db.transaction() 封装
│   ├── auth.js              JWT 签发/校验、bcrypt、登录锁定
│   ├── middleware/
│   │   ├── auth.js          requireAuth：解 token → 注入 req.auth
│   │   └── errors.js        MySQL 错误码 → HTTP 状态 + 中文文案
│   ├── routes/              只做「取参数 → 调 service → 套信封」
│   ├── services/            所有 SQL 都在这里
│   └── utils/               money / period / validate / similarity / http
└── scripts/
    ├── migrate-backend-fixes.js  后端安全修复增量迁移
    ├── migrate-avatar.js        用户头像表增量迁移
    ├── smoke.js             配置与数据库层自检
    ├── api-check.js         后端自检（336 项）
    ├── client-check.js      客户端自检（60 项）
    └── page-check.js        页面接线自检（74 项）
```

分层只有 3 层（route / service / db），没有 repository 层 —— 这个体量多一层就是多一处翻译。

---

## 四、API 速查

所有接口挂在 `/api` 下。除登录注册与 `/api/health` 外，都需要
`Authorization: Bearer <token>`。

### 响应信封

成功：

```json
{ "ok": true, "data": ..., "meta": { "page": 1, "pageSize": 20, "total": 17, "totalPages": 1 } }
```

失败（HTTP 状态码同时反映错误类别）：

```json
{ "ok": false, "error": { "code": "CATEGORY_NAME_TAKEN", "message": "已有同名分类" } }
```

`code` 是稳定的机器可读串，前端按它分支；`message` 是可直接展示的中文。
**前端不要拿 `message` 做判断**，那是给人看的。

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/sms-code` | 发验证码。`SMS_DEV_MODE=true` 时**验证码直接在响应里回显**（字段 `devCode`）；同号 60 秒内限一次 |
| POST | `/register` | 手机号 + 验证码 + 密码；事务内复制默认分类/账户 |
| POST | `/login` | **两种方式共用**：`{ phone, code }` 手机验证码登录，或 `{ account, password }` 邮箱/手机号 + 密码 → `{ token, user, ledger }`。传了 `code` 就走验证码那条路 |
| POST | `/reset-password` | `{ phone, code, newPassword }`；成功后清登录锁并吊销全部旧 token |
| GET | `/me` | 当前登录态（刷新页面时确认 token 还有效） |
| POST | `/logout` | 递增令牌版本，吊销该账号全部现有 token |
| DELETE | `/account` | 必须提交当前密码和确认词 `DELETE`，永久删除个人账本与账号 |
| POST | `/oauth/:provider` | 微信 / Apple 登录，**本期返回 501**，见第七节 |

### 元数据与字典

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/meta/bootstrap` | **一次拿全**：账户 + 分类 + 关键词规则 + 用户偏好（首页/记账面板启动用，省 4 次往返） |
| GET | `/accounts` | `?includeArchived=1` |
| GET | `/categories` | `?type=expense\|income`、`?includeArchived=1` |
| GET | `/category-rules` | 关键词 → 分类，记账面板本地预判用 |
| POST / PATCH / DELETE | `/categories[/:id]` | DELETE 是**归档**，不是物理删除 |
| POST / PATCH / DELETE | `/accounts[/:id]` | 同上 |
| PUT | `/accounts/:id/default` | 设为记账面板默认账户 |

### 首页

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/home/quota` | `[视图] v_today_quota` —— 「今日可花」大卡片 |
| GET | `/home/overview` | `?recentLimit=5` —— 收支概览 + 预算进度 + 最近流水 |

没设预算时 `/home/quota` 返回 **200 + `hasBudget:false`**，不是 404 ——
前端据此走「引导设置预算」的正常分支，而不是弹红色报错。

### 流水 `/api/transactions`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/transactions` | 分页 + 筛选（见下） |
| GET | `/transactions/summary` | `[视图] v_monthly_summary` |
| POST | `/transactions` | 新建，**响应体额外带 `penetration`** |
| GET / PATCH / DELETE | `/transactions/:id` | DELETE 是**软删**（`is_deleted=1`） |
| POST | `/transactions/:id/restore` | 撤销删除（前端 5 秒撤销条用） |

筛选参数：`period=YYYY-MM`（或 `from` / `to`）、`type`、`categoryId`、`accountId`、
`keyword`、`includeDeleted=1`、`page`、`pageSize`。

**`penetration` 是 PRD 4.2.2 的预算穿透反馈**，和「记账成功」同一次响应返回：

```json
{
  "transaction": { "...": "..." },
  "penetration": { "level": "yellow", "message": "已记录 ¥82.00 · 本月餐饮美食仅剩 ¥118.00", "todayQuotaAfter": 566.43 }
}
```

文案在服务端拼，前端只负责展示 —— 保证 Web 与将来的小程序口径一致。
非当月记账不触发穿透，`penetration` 为 `null`。

### 预算 / 统计

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / PUT | `/budget` | `[视图] v_budget_progress`；PUT 是 upsert |
| GET | `/budget/categories` | `[视图] v_budget_category_progress` |
| PUT / DELETE | `/budget/categories/:categoryId` | 设置 / 取消分类预算 |
| GET | `/stats/overview` | `[视图] v_monthly_summary` |
| GET | `/stats/category` | `[视图] v_category_month_spend`，`?type=expense\|income` |
| GET | `/stats/trend` | 按月或按日趋势，`?granularity=month\|day` |
| GET | `/stats/account` | `[视图] v_account_balance` |

### 导入 `/api/import`

**文件不经过后端。** 解析（GBK 解码、zip 解压、金额符号）在浏览器端完成，
这里只收结构化明细 —— 这是 PRD 4.3.2 明确划的边界。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/batches` | 建批次 + 批量入账（整批一个事务）。带客户端 `batchNo` 时**幂等**：重放返回 200 而不是再入一遍 |
| GET | `/batches` | 导入历史（带 `canUndo`） |
| POST | `/batches/:id/undo` | 10 分钟内整批撤销（软删本批次流水） |
| POST | `/dedup-check` | 金额 + 日期 + 商户相似度判重，**只报告不拦截** |

### 设置 `/api/settings`

| 方法 | 路径 |
| --- | --- |
| GET / PUT | `/preferences`（主题、语言、货币、音效） |
| GET / PUT | `/profile`（昵称、头像） |
| POST / DELETE | `/avatar`（上传自定义头像 / 恢复默认头像，multipart 字段名 `avatar`） |
| PUT | `/password`（必须先验旧密码） |
| GET | `/ledgers` · PUT `/ledgers/:id` |
| GET | `/data`（「数据管理」页的概览数字） |
| GET | `/export.csv`（当前账本全部有效流水，UTF-8 CSV） |
| GET | `/export.json`（当前用户、头像与当前账本数据的可迁移 JSON 镜像） |

设置总览页已接入个人资料和头像、账本名称、资金账户新增/编辑/归档/默认账户、
语言/货币/音效偏好、当月预算预警阈值，以及 CSV/JSON 数据导出。

---

## 五、动手前必须知道的约定

这 8 条是踩过的坑，改代码时照着走能省很多时间。

1. **每个周期接口都接受 `?period=YYYY-MM`。** 演示数据固定在 **2026-09**，
   过了 10 月 1 日后首页会「看起来坏了」—— 其实只是当月没数据。
   加 `?period=2026-09` 就能回看。这也是自检脚本能长期跑下去的原因。

2. **DECIMAL 一律是字符串。** mysql2 默认把 `DECIMAL` 转成 string 以保精度，
   我们**刻意不开** `decimalNumbers: true`。任何金额计算都先经 `utils/money.js`
   转成整数「分」，算完再转回来。直接 `+` 会精度漂移。

3. **时区固定 UTC+8。** 连接池建连时 `SET time_zone = '+08:00'`，且开
   `dateStrings: true` —— DATETIME 全程以字符串进出，不经过 JS `Date`。
   `period.js` 里的「今天」也按 +08:00 算。三层口径必须一致，否则「今日可花」会差一天。

4. **每条 SQL 的 WHERE 都要带 `ledger_id = ?`。** 视图是 `SQL SECURITY INVOKER`
   且**不过滤账本**，这个责任在 API 层。UPDATE / DELETE 同样不能漏。

5. **不做物理删除。** 流水只有软删（`is_deleted`）；账户/分类/账本用归档
   （`is_archived`）。外键是 `RESTRICT`，真删会报 1451；`is_system=1` 的预设分类更删不得。

6. **转账是单条记录 + `to_account_id`**，不是两条镜像记录。

7. **信用卡语义是反的。** `v_account_balance.balance` 对信用卡是负数（净资产视角），
   UI 要的是 `credit_used` / `credit_available`。取错列数字会全错。

8. **Express 5 的通配符陷阱。** `app.get('*', ...)` 会因 path-to-regexp v8 直接抛错，
   兜底路由要写 `app.use(...)`（`server.js` 里就是这么做的）。另外 `req.query` 是 getter，不能赋值。

### 六个视图都要有消费者

数据库里的 6 个视图是核心复用资产，一个都不能闲着：

| 视图 | 消费方 |
| --- | --- |
| `v_account_balance` | `/accounts`、`/stats/account`、归档账户时的余额返还 |
| `v_category_month_spend` | `/stats/category` |
| `v_monthly_summary` | `/transactions/summary`、`/home/overview`、`/stats/overview` |
| `v_budget_progress` | `/budget` |
| `v_budget_category_progress` | `/budget/categories` |
| `v_today_quota` | `/home/quota`、记账后的 `penetration` |

后端**不重算**视图里的口径（余额、预算进度、今日可花），只读不写 —— 这样
「接口返回值」和 `_verify.sh` 里的期望值永远对得上。

---

## 六、常见报错

| 现象 | 原因与处理 |
| --- | --- |
| 启动即报「缺少环境变量 DB_PASSWORD / JWT_SECRET」 | `.env` 没建或还是 `.env.example` 的占位值。执行 `copy .env.example .env` 并填写 |
| `[db] 连接失败： ER_ACCESS_DENIED_ERROR` | `DB_USER` / `DB_PASSWORD` 不对，或没建 `mz_app` 账号（见第一步第 2 节） |
| `DB_SCHEMA_OUTDATED` | 已有库尚未执行 `04_backend_fixes.sql`；用具备表结构权限的账号运行 `npm run migrate:backend-fixes` |
| `[db] 连接失败： ECONNREFUSED` | MySQL 没启动。Windows 下：`net start MySQL`（服务名以实际为准） |
| `[server] 端口 3000 已被占用` | 改 `.env` 里的 `PORT`，或关掉占用进程 |
| 页面能打开但**没有任何数据** | 你是用 `file://` 打开的。必须走 http://localhost:3000 |
| 首页显示「今日可花」为空 / 没有预算 | 演示数据是 2026-09。加 `?period=2026-09`，或把系统时间调到 2026-09 再演示 |
| `CHECK` 约束没生效（脏数据能写进去） | MySQL 低于 8.0.16 会**静默忽略** CHECK 约束。用 8.0.16+ 重新执行 `01_schema.sql` |
| 接口返回 `DB_UNAVAILABLE` (503) | 连接层故障：数据库挂了、密码改了、连接数打满。看服务端日志 |
| 注册时收不到验证码 | `SMS_DEV_MODE=true` 时验证码在 `/api/auth/sms-code` 的**响应体**里，不真发短信 |

---

## 七、本期未做的部分

### 第三方登录（微信 / Apple）

`POST /api/auth/oauth/:provider` 返回 501。当前没有微信/Apple 开放平台凭据与回调验签配置，
`user` 表也没有 `wechat_openid` / `apple_sub` 列；在账号绑定规则明确前不返回假的授权成功。

真要接的时候先执行：

```sql
ALTER TABLE `user`
  ADD COLUMN `wechat_openid` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `apple_sub`     VARCHAR(64) DEFAULT NULL,
  ADD UNIQUE KEY `uk_user_wechat` (`wechat_openid`),
  ADD UNIQUE KEY `uk_user_apple`  (`apple_sub`);
```

### 其他已知取舍

| 项 | 现状 | 说明 |
| --- | --- | --- |
| Token 存放 | **localStorage** | 本地演示够用、实现最简。若要防 XSS 需改 httpOnly Cookie 并加 CSRF 防护 |
| Token 续期 | 响应头 `X-Refreshed-Token` | 滑动续期，**没有 refresh_token 表**。前端收到该头就静默替换本地 token |
| 短信验证码 | dev 模式**在响应里回显** | 生产必须 `SMS_DEV_MODE=false` 并接真实网关 |
| 登录锁定 | 连错 5 次锁 15 分钟（**423**） | 用 423 而不是 401，避免前端把「被锁」误当成「token 失效」而清登录态。验证码登录不看锁、也不计失败次数 —— 能收到验证码就证明手机在本人手里 |
| 验证码登录 | **不会自动注册** | `password_hash` 是 NOT NULL，登录不能绕过明确的注册确认流程。未注册手机号回 404 `ACCOUNT_NOT_FOUND`；已注册用户可通过验证码重置密码 |
| 验证码存储 | 进程内存（Map） | 重启即失效、多进程不共享、只按手机号限流（没按 IP）。本地演示够用，接真实网关时替换 `sendSmsCode` 的下半段即可 |
| 登录接口的响应耗时 | 账号不存在也走一次假 bcrypt | 防止用响应时间探测某个手机号是否注册过 |
| 去重阈值 | 相似度**严格大于** 80% | PRD 原文「> 80%」。刚好 0.8 的判成两笔 —— 按「宁可轻微漏判也不可误判」 |
| 删除接口的语义 | 全部是归档 / 软删 | 见约定第 5 条 |
