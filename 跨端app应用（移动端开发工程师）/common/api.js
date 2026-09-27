/* ============================================================================
 * 明账 · API 客户端
 *
 * 从浏览器版 fronted/整理版/assets/js/api.js 逐条移植，替换掉三处浏览器专属能力：
 *   fetch            → uni.request      （小程序没有 fetch）
 *   localStorage     → uni.getStorageSync / setStorageSync
 *   location.href    → uni.reLaunch      （401 回登录页）
 * 业务语义（响应信封、401 处理、滑动续期、错误分类）与浏览器版保持一致。
 *
 * 和浏览器版一样，这里**不写任何业务方法**。
 * 同一个数据在首页、流水页、统计页的取法不一样（周期、筛选、条数都不同），
 * 在这里包一层只会变成一堆「参数转发」的空壳函数。页面直接写
 *   api.get('/transactions', { period: '2026-09' })
 * 更诚实。
 * ========================================================================== */

import { API_BASE, TOKEN_KEY, USER_KEY, LOGIN_PAGE, REQUEST_TIMEOUT, UPLOAD_TIMEOUT } from './config'

/* -------------------------------------------------------------------------
 * token 与本地身份缓存
 *
 * uni 的存储 API 在极少数情况下会抛（存储配额满、隐私模式），统一 try 包住：
 * 存不下最多是「刷新后要重新登录」，不该让整页脚本挂掉。
 * ----------------------------------------------------------------------- */
function readStore(key) {
  try {
    const v = uni.getStorageSync(key)
    return v === '' || v === undefined ? null : v
  } catch (e) {
    return null
  }
}
function writeStore(key, value) {
  try {
    if (value === null || value === undefined) uni.removeStorageSync(key)
    else uni.setStorageSync(key, value)
  } catch (e) {
    /* 存储不可用时静默降级为「仅本次会话有效」 */
  }
}

// 未勾选“记住登录”时，身份只保存在当前 JS 进程内；刷新/重启 App 后自然失效。
// 续期 token 与资料更新不会改变这个选择，只有下一次明确登录才会重新设置。
let memoryToken = null
let memorySession = null
let tokenPersistent = true

export function getToken() {
  return memoryToken || readStore(TOKEN_KEY)
}
export function setToken(token, options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'remember')) {
    tokenPersistent = options.remember !== false
  }
  memoryToken = token || null
  writeStore(TOKEN_KEY, memoryToken && tokenPersistent ? memoryToken : null)
}

/** 登录后缓存身份，仅供首屏占位使用；权威值永远以 /auth/me 为准。 */
export function setSession(data, options) {
  if (data && data.token) setToken(data.token, options)
  if (data && data.user) {
    memorySession = { user: data.user, ledger: data.ledger }
    writeStore(USER_KEY, tokenPersistent ? memorySession : null)
  }
}
export function getSession() {
  if (memorySession) return memorySession
  const raw = readStore(USER_KEY)
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }
  return raw
}
export function clearSession() {
  memoryToken = null
  memorySession = null
  tokenPersistent = true
  writeStore(TOKEN_KEY, null)
  writeStore(USER_KEY, null)
}
export function isLoggedIn() {
  return !!getToken()
}

/* -------------------------------------------------------------------------
 * 错误
 *
 * 服务端契约 { ok:false, error:{ code, message, details } }。
 * code 用来分支，message 只用来展示 —— 别拿它做判断。
 * ----------------------------------------------------------------------- */
export function ApiError(status, code, message, details) {
  this.name = 'ApiError'
  this.status = status
  this.code = code
  this.message = message
  this.details = details
}
ApiError.prototype = Object.create(Error.prototype)
ApiError.prototype.constructor = ApiError

/**
 * 网络层失败（断网、服务没起、响应不是 JSON）——与业务错误区分开。
 * 带上 status / url / method，因为这三种失败现象都是「一条红 toast」，
 * 但原因完全不同，没有这几个字段排查时只能靠猜。
 */
export function NetworkError(message, detail) {
  this.name = 'NetworkError'
  this.code = 'NETWORK_ERROR'
  this.message = message
  this.status = (detail && detail.status) || 0
  this.url = (detail && detail.url) || null
  this.method = (detail && detail.method) || null
}
NetworkError.prototype = Object.create(Error.prototype)
NetworkError.prototype.constructor = NetworkError

/**
 * 响应不是 JSON 时的文案。
 *
 * 这个分支最容易被误诊：后端所有响应都是 JSON 信封（成功失败都有），
 * 所以「拿不到 JSON」在正常跑通的后端上不可能出现 —— 它几乎总意味着
 * 请求根本没到后端，而是被另一个服务器代答了。
 * 405 是最典型的信号：静态服务器接受 GET 但拒绝 POST，于是登录（POST）报 405，
 * 而页面本身打得开 —— 看起来像「后端坏了」，其实是「压根不是这个后端」。
 */
function unparseable(method, url, status) {
  const detail = '（' + method + ' ' + url + ' → HTTP ' + status + '）'
  if (status === 405 || status === 501) {
    return (
      '请求没有到达明账后端：' + detail + '。后端所有响应（成功与失败）都是 {ok:...} ' +
      'JSON 信封，「拿不到 JSON」只能是别的服务器在代答 —— ' +
      '典型是 API 地址指向了静态服务器。请确认 common/config.js 里的 API_HOST 指向真正的后端。'
    )
  }
  if (status === 404) {
    return '请求没有到达明账后端：' + detail + '。请确认后端已启动（npm start），且 API_HOST 端口正确。'
  }
  return '服务返回了无法解析的内容：' + detail + '。多半是被反向代理 / 网关挡了，也可能后端没起。'
}

/** uni.request 的 fail 回调：断网、DNS、域名未加白名单、明文 http 被拦。 */
function offline(detail) {
  // #ifdef MP-WEIXIN
  return (
    '无法连接服务器。小程序要求 https 域名白名单，本地调试请在微信开发者工具里勾选' +
    '「详情 → 本地设置 → 不校验合法域名」，并确认 common/config.js 里的 API_HOST 正确。'
  )
  // #endif
  // #ifdef APP-PLUS
  return (
    '无法连接服务器。真机调试请把 common/config.js 里的 API_HOST 改成电脑的局域网 IP' +
    '（不是 localhost），并确认手机与电脑在同一 Wi-Fi。'
  )
  // #endif
  // #ifdef H5
  return '无法连接服务器，请确认后端已启动（npm start），且 vite 代理指向正确的端口。'
  // #endif
  return '无法连接服务器（' + (detail && detail.url ? detail.url : '') + '）。'
}

/* -------------------------------------------------------------------------
 * 401 统一出口
 * ----------------------------------------------------------------------- */
let redirecting = false

/** 401 之后统一从这里回登录页 —— 同一时刻只跳一次，避免并发请求连环 reLaunch。 */
export function gotoLogin() {
  if (redirecting) return
  redirecting = true
  clearSession()
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const current = pages.length ? '/' + pages[pages.length - 1].route : ''
  if (current.indexOf('onboarding/landing') !== -1) {
    redirecting = false
    return
  }
  uni.reLaunch({
    url: LOGIN_PAGE,
    complete() {
      setTimeout(function () {
        redirecting = false
      }, 600)
    },
  })
}

/* -------------------------------------------------------------------------
 * 请求
 *
 * options:
 *   query          对象，值为 undefined/null/'' 的键自动跳过
 *   body           对象自动 JSON 序列化
 *   silent         true 时不弹错误提示（调用方自己处理，例如登录页的内联报错）
 *   raw            true 时返回 { data, meta }，用于要读分页 meta 的列表页
 *   redirectOn401  默认 true；false 时 401 只抛错，不跳登录页
 * ----------------------------------------------------------------------- */
function buildUrl(path, query) {
  const url = path.charAt(0) === '/' ? API_BASE + path : API_BASE + '/' + path
  if (!query) return url
  const parts = []
  Object.keys(query).forEach(function (key) {
    const v = query[key]
    if (v === undefined || v === null || v === '') return
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v))
  })
  return parts.length ? url + '?' + parts.join('&') : url
}

/**
 * 响应头大小写不敏感查找。
 * 微信小程序会把响应头键名统一转小写，H5 与 App 则保留原样，
 * 所以「滑动续期」这个响应头必须两种写法都认。
 */
function headerOf(header, name) {
  if (!header) return null
  if (header[name] != null) return header[name]
  const lower = name.toLowerCase()
  const key = Object.keys(header).filter(function (k) {
    return k.toLowerCase() === lower
  })[0]
  return key ? header[key] : null
}

/** 错误提示钩子。ui.js 加载后用 toast 覆盖它；没覆盖时退回控制台。 */
let notify = function (err) {
  console.warn('[api]', err.code, err.message)
}
export function setNotifier(fn) {
  if (typeof fn === 'function') notify = fn
}

export function request(method, path, options) {
  const opts = options || {}
  const url = buildUrl(path, opts.query)
  const header = {}
  const token = getToken()
  if (token) header.Authorization = 'Bearer ' + token
  if (opts.body !== undefined) header['Content-Type'] = 'application/json'

  return new Promise(function (resolve, reject) {
    uni.request({
      url: url,
      method: method,
      header: header,
      data: opts.body === undefined ? undefined : opts.body,
      timeout: opts.timeout || REQUEST_TIMEOUT,
      success(res) {
        // 滑动续期：旧 token 快到期时服务端顺手下发一张新的，这里静默替换。
        // 没有 refresh_token 表，全靠这个响应头。
        const renewed = headerOf(res.header, 'X-Refreshed-Token')
        if (renewed) setToken(renewed)

        const json = res.data
        if (json && typeof json === 'object' && json.ok) {
          resolve(opts.raw ? { data: json.data, meta: json.meta } : json.data)
          return
        }

        // 响应不是 JSON 信封（字符串 / HTML）——多半没打在后端上
        if (!json || typeof json !== 'object') {
          reject(
            new NetworkError(unparseable(method, url, res.statusCode), {
              status: res.statusCode,
              url: url,
              method: method,
            })
          )
          return
        }

        const err = json.error
        const apiErr = new ApiError(
          res.statusCode,
          (err && err.code) || 'UNKNOWN',
          (err && err.message) || '请求失败',
          err && err.details
        )
        // 登录态失效：清本地并回登录页。放在这里而不是每个调用点，
        // 是为了不出现「有的页面提示登录过期、有的页面白屏」这种不一致。
        if (res.statusCode === 401 && opts.redirectOn401 !== false) {
          gotoLogin()
        }
        reject(apiErr)
      },
      fail(err) {
        reject(
          new NetworkError(offline({ url: url }), {
            status: 0,
            url: url,
            method: method,
          })
        )
      },
    })
  }).catch(function (err) {
    if (!(err instanceof ApiError) && !(err instanceof NetworkError)) {
      err = new NetworkError(offline({ url: url }), { url: url, method: method })
    }
    if (!opts.silent) notify(err)
    throw err
  })
}

/* -------------------------------------------------------------------------
 * 文件上传
 *
 * uni 没有 fetch 也没有 FormData，multipart 只能走 uni.uploadFile ——
 * 它和 uni.request 是两套 API（回调字段名都不同），所以单独包一层。
 * 响应信封、错误分类、401 出口与 request 完全一致，调用方感觉不到差别。
 *
 * 浏览器版的头像上传就是 multipart，少了这个能力「换头像」就没法对齐功能。
 * ----------------------------------------------------------------------- */
export function upload(path, filePath, options) {
  const opts = options || {}
  const url = buildUrl(path, opts.query)
  const header = {}
  const token = getToken()
  if (token) header.Authorization = 'Bearer ' + token

  return new Promise(function (resolve, reject) {
    uni.uploadFile({
      url: url,
      filePath: filePath,
      name: opts.name || 'file',
      header: header,
      formData: opts.formData || {},
      timeout: opts.timeout || UPLOAD_TIMEOUT,
      success(res) {
        // uploadFile 不会像 request 那样把 JSON 解析好，data 是原始字符串
        let json = null
        try {
          json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch (e) {
          json = null
        }
        if (json && typeof json === 'object' && json.ok) {
          resolve(opts.raw ? { data: json.data, meta: json.meta } : json.data)
          return
        }
        if (!json || typeof json !== 'object') {
          reject(
            new NetworkError(unparseable('POST', url, res.statusCode), {
              status: res.statusCode,
              url: url,
              method: 'POST',
            })
          )
          return
        }
        const err = json.error
        const apiErr = new ApiError(
          res.statusCode,
          (err && err.code) || 'UNKNOWN',
          (err && err.message) || '上传失败',
          err && err.details
        )
        if (res.statusCode === 401 && opts.redirectOn401 !== false) gotoLogin()
        reject(apiErr)
      },
      fail() {
        reject(
          new NetworkError(offline({ url: url }), {
            status: 0,
            url: url,
            method: 'POST',
          })
        )
      },
    })
  }).catch(function (err) {
    if (!(err instanceof ApiError) && !(err instanceof NetworkError)) {
      err = new NetworkError(offline({ url: url }), { url: url, method: 'POST' })
    }
    if (!opts.silent) notify(err)
    throw err
  })
}

/* -------------------------------------------------------------------------
 * 便捷方法
 * ----------------------------------------------------------------------- */
function merge(a, b) {
  const out = {}
  let k
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k]
  for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k]
  return out
}

export const api = {
  BASE: API_BASE,
  ApiError,
  NetworkError,

  getToken,
  setToken,
  setSession,
  getSession,
  clearSession,
  isLoggedIn,
  gotoLogin,
  setNotifier,

  request,
  upload,
  get(path, query, options) {
    return request('GET', path, merge({ query: query }, options))
  },
  post(path, body, options) {
    return request('POST', path, merge({ body: body }, options))
  },
  put(path, body, options) {
    return request('PUT', path, merge({ body: body }, options))
  },
  patch(path, body, options) {
    return request('PATCH', path, merge({ body: body }, options))
  },
  del(path, body, options) {
    return request('DELETE', path, merge({ body: body }, options))
  },
}

export default api
