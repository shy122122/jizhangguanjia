/* 运行时配置。
 *
 * 【API_HOST 是唯一需要改的地方】
 * 后端（后端代码(后端工程师)）默认跑在 http://localhost:3000。
 * 三种宿主对「后端地址」的要求完全不同，所以这里按平台分开处理：
 *
 *   H5       —— 用相对路径 /api。开发时由 vite.config.js 代理到 3000 端口，
 *               上线时把 H5 产物交给后端静态托管即可，天然同源、无跨域。
 *   App      —— 必须是绝对地址。真机调试时把 localhost 换成电脑的局域网 IP
 *               （手机与电脑同一个 Wi-Fi），例如 http://192.168.1.8:3000。
 *               iOS 默认禁止明文 http，需在 manifest.json 里开 ATS 例外；
 *               开发阶段最省事的做法是用「自定义基座」并勾选允许 http。
 *   小程序   —— 必须是绝对地址，且微信要求 https 域名白名单。
 *               本地开发请在小程序开发者工具里勾选
 *               「详情 → 本地设置 → 不校验合法域名、web-view、TLS 版本」。
 */

export const API_HOST = 'http://localhost:3000'

export const API_BASE = (function () {
  // #ifdef H5
  return '/api'
  // #endif
  // #ifndef H5
  return API_HOST + '/api'
  // #endif
})()

/** 登录页路由；401 后统一回到这里。 */
export const LOGIN_PAGE = '/pages/onboarding/landing'

/** 演示账号与演示数据所在月份（后端种子数据固定在 2026-09）。 */
export const DEMO_PERIOD = '2026-09'

export const TOKEN_KEY = 'mz-token'
export const USER_KEY = 'mz-user'
export const THEME_KEY = 'mz-theme'
/** 流水列表跳转到 tabBar 记账页时，用一次性存储传递待编辑流水 ID。 */
export const EDIT_TRANSACTION_KEY = 'mz-edit-transaction-id'

export const REQUEST_TIMEOUT = 15000

/** 上传单独放宽：5MB 头像在弱网下 15 秒不够，超时太短会被误判成「服务不可用」。 */
export const UPLOAD_TIMEOUT = 60000
