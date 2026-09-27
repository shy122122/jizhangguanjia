# 明账 · 交互原型

预算穿透到每一笔记录里的记账工具。本目录是 **v1.0 交互原型**，覆盖 23 个界面、8 个功能模块。

---

## 怎么打开

**双击 `index.html` 即可。** 不需要 npm、不需要构建、不需要起服务。

- 页面之间已全部接通，从任意界面都能走到任意界面。
- 按 `Esc` 从任意页面回到导航台；按 `←` `→` 在同一模块内切换上一个 / 下一个状态。
- 导航台右上角可切换深色模式。

> 首次打开需要联网加载 Tailwind CDN 与字体；之后浏览器会缓存。字体加载失败时会回落系统字体，排版不塌陷。

---

## 目录结构

```
整理版/
├── index.html                  原型导航台（入口）
├── pages/                      23 个界面，命名 NN-模块-状态.html
│   ├── 01-onboarding-landing.html
│   ├── 02-onboarding-coldstart.html
│   └── … 23-settings-privacy.html
├── assets/
│   ├── css/
│   │   ├── tokens.css          设计令牌（CSS 变量 + 深色模式）
│   │   └── base.css            全局基线、金额语义色、品牌渐变
│   ├── js/
│   │   ├── tailwind.config.js  Tailwind 主题（PRD 13 章调色板）
│   │   ├── routes.js           路由表：模块 + 页面清单，唯一导航事实来源
│   │   └── shell.js            共用外壳注入（侧边栏 / 顶栏 / 底部 Tab / 状态切换器）
│   └── img/
│       ├── logo.svg
│       └── avatar.svg
├── docs/
│   ├── PRD-合规对照.md          界面 ↔ PRD 章节映射、合规校验、已知偏差
│   └── 原型设计规范-Stitch.md    美术设计原始规范（外部产出，存档参考）
└── preview/                    23 张界面截图（导航台缩略图用）
```

---

## 三条设计约定

### 1. 支出金额永不标红

这是本产品配色中最重要的一条（PRD 13.5.2）。用户每天要记 5 笔以上支出，全标红会让界面持续传递「你在花钱、你在犯错」的焦虑信号，与「让用户坚持记账」的产品目标直接冲突。

**红色完全保留给真正的异常**（超支、删除、错误），用稀缺性换取警示强度。

| 语义 | 色值 | 类名 |
| --- | --- | --- |
| 支出 | `#0F172A` | `.amount-expense` |
| 收入 | `#0D9488` | `.amount-income` |
| 转账 | `#64748B` | `.amount-transfer` |

### 2. `#14B8A6` 和 `#F59E0B` 永不作文字色

两者对白底的对比度仅 2.49:1 / 2.15:1，远低于 WCAG AA 的 4.5:1（PRD 13.9）。
它们只能作填充、图标、图表色。需要文字时用 `#0F766E`（teal-700，5.47:1）与 `#B45309`（amber-700，5.02:1）。

### 3. 品牌渐变集中用在「今日可花」

`linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)` 只出现在首页的今日可花大卡片上，
让品牌色与产品最核心的功能形成绑定记忆（PRD 13.7）。类名 `.bg-brand-gradient`。

---

## 改东西的时候

### 改配色 / 字阶 / 圆角

只改 `assets/js/tailwind.config.js`，23 个页面同时生效。

该配置是**两层结构**：

- 第一层 `brand` / `accent` / `canvas` / `ink` —— PRD 原生调色板，新代码优先用这层。
- 第二层语义 token 层 —— 原型沿用美术设计（Google Stitch）的 Material 3 角色命名
  （`primary` / `on-surface` / `surface-container` 等）。这里把它们的**取值**整体重映射到 PRD 调色板，
  因此 23 个页面的类名一个都没改，配色已经全部对齐品牌。

改动主题色时**必须同步** `assets/css/tokens.css` 里的同名 CSS 变量，两者取值需一致。

### 加一个页面

1. 在 `pages/` 下按 `NN-模块-状态.html` 命名新建文件；
2. 在 `assets/js/routes.js` 的 `PAGES` 里登记一行（key / file / module / title / short / prd / note）；
3. 页面 `<body>` 加 `data-page="<key>"`，并预留外壳注入点：

```html
<body data-page="home-calm">
  <div data-shell="sidebar"></div>      <!-- 桌面端左侧导航 -->
  <div class="lg:pl-72"> … 正文 … </div>
  <div data-shell="bottomnav"></div>    <!-- 移动端底部 Tab -->
  <div data-shell="switcher"></div>     <!-- 原型状态切换器 -->
  <script src="../assets/js/shell.js"></script>
</body>
```

导航台、侧边栏、底部 Tab、切换器都会自动收录这个新页面，**不需要改任何其它文件**。

> 未进入主应用的公开页（如落地页、帮助页）不用侧边栏与底部 Tab，
> 改为注入 `<div data-shell="public-topbar"></div>`。参见 `01` / `03` 两页。

### 正式开发时

- 删除 `assets/js/shell.js` 里的 `switcher()` 函数与页面中的 `[data-shell="switcher"]` 注入点。
  切换器是原型期装置，用于评审时逐屏走查，不属于产品功能。
- 把 `shell.js` 的注入逻辑交给框架的布局组件（Vue `<Layout>` / React `<Layout>`）。
- 把 `tailwind.config.js` 与 `tokens.css` 直接搬进工程，两者已是标准的 Tailwind 配置与 CSS 变量形式。
- 走查清单见 `docs/PRD-合规对照.md`。

---

## 页面命名规范

```
NN-模块-状态.html

01  onboarding-landing.html     ← 序号 · 模块 · 状态
```

- **NN** —— 两位序号，与美术设计的出图顺序一一对应，便于两套材料对照。
- **模块** —— `onboarding` / `home` / `budget` / `record` / `ledger` / `stats` / `import` / `settings`
- **状态** —— 该模块下的具体状态或子页面

同一模块内多个状态（如首页的 5 种预算健康度）是**一次设计走查的单位**，正式开发时是同一组件的不同 props。
