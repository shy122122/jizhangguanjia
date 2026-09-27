/* ============================================================================
 * 明账 · 会话与元数据缓存
 *
 * 两件事：
 *   1. 当前用户 / 账本的响应式副本（导航栏、设置页要显示）
 *   2. /meta/bootstrap 的进程内缓存 —— 账户 + 分类 + 分类规则 + 账本 + 偏好
 *
 * 为什么缓存 bootstrap：它在首页、记账面板、流水筛选、预算页都要用，
 * 一次会话里几乎不会变。浏览器版每次进页面都重新拉（页面会整页刷新，无所谓），
 * 但 App / 小程序是同一个 JS 进程跑到底，不缓存就是白白的 N 次往返。
 * 改动分类、账户、偏好后记得调 invalidateMeta() —— 这是唯一的失效入口。
 * ========================================================================== */

import { reactive } from 'vue'
import api from './api'
import fmt from './fmt'

/** 当前会话（登录后由 setSession / /auth/me 填充） */
export const session = reactive({
  user: null,
  ledger: null,
})

export function applySession(payload) {
  if (!payload) return
  if (payload.user) session.user = payload.user
  if (payload.ledger) session.ledger = payload.ledger
}

let metaPromise = null
let metaToken = null

/**
 * 取元数据。并发调用只会发一次请求。
 *
 * 缓存必须跟当前 token 绑定：App / 小程序不会在退出登录时重启 JS 进程，
 * 如果只缓存一个全局 Promise，切换账号后会把上一个账号的账本继续展示出来。
 * 失败的 Promise 也不能永久缓存，否则一次断网会让本次进程之后都无法重试。
 */
export function meta(force) {
  const token = api.getToken()
  if (force || token !== metaToken) {
    metaPromise = null
    metaToken = token
  }
  if (!metaPromise) {
    let pending = null
    pending = api
      .get('/meta/bootstrap')
      .then(function (data) {
        applySession(data)
        return data
      })
      .catch(function (err) {
        if (metaPromise === pending) metaPromise = null
        throw err
      })
    metaPromise = pending
  }
  return metaPromise
}

export function invalidateMeta() {
  metaPromise = null
  metaToken = null
}

/**
 * 当前查看的周期。
 * 优先级：页面参数 ?period=YYYY-MM > 已记住的周期 > 当月。
 *
 * 记忆这一步是移动端特有的：手机上没有地址栏，从首页点进预算页再返回时
 * 参数就丢了，不记住的话用户每次都要重新翻月份。
 */
const PERIOD_KEY = 'mz-period'

export function rememberPeriod(period) {
  if (!period) return
  try {
    uni.setStorageSync(PERIOD_KEY, period)
  } catch (e) {
    /* 忽略 */
  }
}

export function currentPeriod(query) {
  if (query && query.period) {
    rememberPeriod(query.period)
    return query.period
  }
  try {
    const saved = uni.getStorageSync(PERIOD_KEY)
    if (saved) return saved
  } catch (e) {
    /* 忽略 */
  }
  return fmt.currentPeriod()
}

/** 分类 id → 分类对象，列表页要按 id 找图标和名字 */
export function indexBy(list, key) {
  const out = {}
  ;(list || []).forEach(function (item) {
    out[item[key || 'id']] = item
  })
  return out
}
