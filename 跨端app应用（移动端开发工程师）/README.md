# 明账 · 跨端 App（uni-app）

浏览器版「明账」的 uni-app 移植版。一份代码同时产出 **iOS / Android / 微信小程序**，
业务逻辑、数据口径、交互流程与浏览器版
（`前端代码（前端工程师）/fronted/整理版`）保持一致。

- 框架：uni-app（Vue 3 **选项式 API**）
- 项目形态：**HBuilderX 工程** —— 用 HBuilderX 直接打开即可运行；根目录
  `package.json` 只服务于离线质量检查，不参与 App / 小程序打包
- 单位：`750rpx = 屏幕宽度`，设计稿按 375pt 出图（1px@2x = 2rpx）
- 主题色：青 `#14B8A6` + 青蓝 `#06B6D4`，中性色 Slate，**支出金额不标红**

---

## 一、怎么跑起来

### 0. 先起后端

所有页面都要连后端才有数据（本工程没有 mock 兜底）。后端在
`后端代码(后端工程师)/`，默认监听 `http://localhost:3000`：

```bash
cd "后端代码(后端工程师)" && npm start
```

### 1. 微信小程序

1. HBuilderX 打开本目录
2. 「运行 → 运行到小程序模拟器 → 微信开发者工具」
3. 首次运行需在微信开发者工具里勾选
   **详情 → 本地设置 → 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
   —— 否则 `localhost` 会被域名白名单拦掉

### 2. Android / iOS

1. HBuilderX 打开本目录
2. 「运行 → 运行到手机或模拟器 → 运行到 Android App 基座 / iOS App 基座」
3. **真机必须改地址**：把 `common/config.js` 里的 `API_HOST` 从 `localhost`
   改成电脑的**局域网 IP**（如 `http://192.168.1.8:3000`），并确认手机与电脑同一 Wi-Fi。
   手机上的 `localhost` 指向手机自己，连不到电脑。
4. iOS 默认禁止明文 http，需要在 `manifest.json` 里开 ATS 例外，
   或改用「自定义基座」并勾选允许 http。

### 3. H5（可选，用于快速预览）

H5 走的是**同源**方案：`common/config.js` 在 H5 平台下返回相对路径 `/api`，
所以需要后端来托管前端产物 ——

```bash
# HBuilderX「发行 → 网站-PC Web 或手机 H5」产出 unpackage/dist/build/web
# 然后把后端的 FRONTEND_DIR 指向该目录，访问 http://localhost:3000
```

若想在 H5 下用 HBuilderX 自带的热调试（端口 5173），需要自己加一个
`vite.config.js` 做代理（默认不带，因为它只对 H5 有意义）：

```js
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
```

---

## 二、后端地址只有一处要改

`common/config.js` 的 `API_HOST`：`App` 与小程序用绝对地址，H5 用相对路径。
三种宿主的差异、以及各自的排查方法（小程序白名单、真机局域网 IP、iOS ATS）
都写在该文件的注释里。请求层已经把这三类失败映射成人话提示，
连不上时看 toast 文案即可定位，不必翻代码
（见 [common/api.js](common/api.js) 的 `offline()` / `unparseable()`）。

---

## 三、目录结构

```
├── main.js / App.vue / pages.json      # 入口、全局生命周期、路由与 tabBar
├── manifest.json                       # 各平台打包配置（appid 待填）
├── uni.scss                            # 全局 SCSS 变量（tabbar 高度等）
├── common/                             # 与界面无关的基础设施
│   ├── config.js                       # ★ 唯一需要改的文件（API_HOST）
│   ├── api.js                          # 请求层：token、401、滑动续期、上传
│   ├── store.js                        # 会话 + /meta/bootstrap 缓存
│   ├── fmt.js                          # 金额 / 日期 / 百分比格式化
│   ├── ui.js                           # toast / confirm / alert / loading / 震动
│   ├── theme.js                        # 明暗主题
│   └── icons.js                        # 图标字体的 PUA 码位表（203 个）
├── components/
│   ├── mz-page/                        # 页面外壳：状态栏、导航栏、tabbar 安全区
│   ├── mz-navbar/                      # 自定义导航栏
│   ├── mz-icon/                        # 图标（图标字体，非 SVG）
│   └── mz-amount-dialog/               # 金额输入弹窗
├── styles/
│   ├── tokens.scss                     # 设计令牌（颜色 / 阴影 / 渐变）
│   ├── base.scss                       # 工具类（.row / .mz-card / .mz-btn …）
│   └── _fonts.scss                     # 图标字体与 Manrope 的 @font-face
├── pages/                              # 20 个页面路由，覆盖浏览器版 01–23 的全部编号
│   ├── onboarding/  landing · coldstart · help        （01 / 02 / 03）
│   ├── home/        index                             （04，含 05–08 状态）
│   ├── budget/      setup · overview                  （09 / 10）
│   ├── record/      sheet                             （11）
│   ├── ledger/      list                              （13，含 12 / 14 空态）
│   ├── stats/       overview · category               （15 / 17，含 16 空态）
│   ├── import/      main · success · diagnose         （18 / 19 / 20）
│   └── settings/    index · categories · privacy ·    （21 / 22 / 23 + 四个子页）
│                    profile · ledger · accounts · preferences
└── scripts/                            # 一次性工具：图标表、字体子集、tabbar 图
```

---

## 四、与浏览器版的一致性

### 数据口径完全照搬

- 金额一律由服务端算好（DECIMAL 已在后端转成 number），前端**只格式化不运算**
- 信用卡语义反转为 UI 口径：展示 `creditUsed` / `creditAvailable`，
  绝不用 `v_ 账户余额` 里的负数 `balance`
- 6 个数据库视图各有对应接口，页面直接消费，不在客户端重算
- 分类图标的历史别名（`school` / `card_giftcard` / `work`）在设置页保存时
  自动迁移成可用图标，只修一次

### 有意为之的差异（都是移动端适配，不是功能缺失）

| 项 | 浏览器版 | 本工程 | 原因 |
|---|---|---|---|
| 编辑表单 | 模态框 | 独立页面或底部抽屉 | 手机屏放不下模态框，且键盘弹起会遮挡 |
| 设置首页 | 12 栏桌面仪表盘 | 单列仪表盘 + 分页入口 | 窄屏无法双栏 |
| 阈值调节 | `<input type=range>` | `<slider>` | 触屏原生手感 |
| 下拉选择 | `<select>` | `<picker>` | 小程序没有 `<select>` |
| 删除确认短语 | 输入框 `text-transform:uppercase` | 去掉自动大写 | 小程序原生输入框不支持该 CSS，保留会造成「看着是 DELETE 却校验不过」的陷阱；严格匹配规则不变 |
| 数据导出 | 导出 CSV / JSON | 提示「本 App 不提供导出功能」 | 按交付要求：**导出功能不做** |

### 图标说明

图标是**字体子集**，不是 SVG。子集里目前 203 个字形，
若用到不存在的名字会渲染成空白方块。已知缺失并已做替代的：
`school → history_edu`、`card_giftcard → redeem`、`work → account_balance`、
`delete → delete_outline`、`help → help_outline`、`settings → tune`、
`filter_list → filter_alt`、`inbox → inventory_2`。

新增图标要重新生成字体子集，步骤见 [scripts/](scripts/)：

```bash
bash scripts/fetch-fonts.sh      # 拉 Material Symbols 源字体
node scripts/build-assets.js     # 按 scripts/icons.txt 里的名单切子集
```

---

## 五、离线自检

HBuilderX 的编译器不方便在命令行跑，所以工程里带了一个纯 Node 的校验脚本，
只检查**语法**（模板编译 + SFC 编译 + SCSS 编译），不依赖 HBuilderX：

```bash
npm install --registry=https://registry.npmmirror.com
npm run check
# 期望：全部通过：template / script / style 均可编译
```

改完任何 `.vue` 都建议先跑一次 —— 它能抓住 90% 的低级错误
（标签没闭合、SCSS 变量拼错、模板里用了不存在的方法），
比重开 HBuilderX 快得多。

`check-vue.js` 只管**能不能编译**，管不了「能编译但一跑就坏」。所以还有三个审计脚本，
专抓编译期查不出、只在点到那一页才炸的静默错误：

```bash
npm run check:icons   # 图标名审计
npm run check:api     # 前后端接口契约审计
npm run check:pages   # 页面注册审计
```

| 脚本 | 抓什么 | 为什么必须单独查 |
|---|---|---|
| `check-usage.js` | `<mz-icon name="...">` 里静态写死的名字是否在字体子集（203 个字形）里 | 用到子集外的名字会渲染成**空白方块**，不报错也不告警 |
| `check-api.js` | `api.get/post/…('/xxx')` 是否都能在后端 `src/routes/*.js` 里找到对应路由 | 路径写错时只有点到那一页才会 404，编译期无从发现 |
| `check-pages.js` | `pages.json` 注册的路径与 `pages/` 下真实文件是否一一对应 | 漏注册页面不会报错，跳转时白屏 |

改完 `.vue` 建议四个都跑一遍，全绿再开 HBuilderX。

---

## 六、已知限制

1. **本工程不含导出功能**（交付要求）。设置页里原来的「导出 CSV / 导出 JSON」
   按钮保留位置但只给提示，后端若日后开放下载接口，把提示换成 `uni.downloadFile` 即可。
2. **微信 / Apple 登录未实现**。`user` 表没有 `wechat_openid` / `apple_sub` 列，
   需要先走数据库迁移；登录页只保留邮箱 / 手机号 + 密码。
3. **短信验证码是开发模式**：验证码直接由接口回显，未接短信网关。
   注册与找回密码流程因此可以完整走通，但不可直接上生产。
4. **头像上传已完整实现**（`uni.chooseImage` + `uni.uploadFile`，
   见 [common/api.js](common/api.js) 的 `upload()`）。
   一处差异：浏览器版会校验 mime 类型，三端拿不到可靠的 mime 信息，
   所以只校验体积（≤ 5MB），类型交给服务端把关。
5. **多账本是只读的**：设置页能改当前账本名称，但「切换账本 / 新建账本」
   未开放（与浏览器版一致，按钮是提示态）。
