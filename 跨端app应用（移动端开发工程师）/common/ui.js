/* ============================================================================
 * 明账 · 交互反馈
 *
 * 浏览器版这里还有 esc() / each() / html() 一整套手写模板工具 —— 那是给
 * 「没有框架、只能拼字符串」的静态页准备的。uni-app 用的是 Vue，
 * 转义、循环、条件渲染都由模板接管，所以那些函数在本工程里是多余的，
 * 只保留真正跨端要自己实现的三个：toast / confirm / loading。
 * ========================================================================== */

/**
 * 轻提示。
 * type: 'success' | 'error' | 'info'
 *
 * 用原生 uni.showToast 而不是自绘浮层，是为了在 App 上也能吃到系统的无障碍朗读
 * 与深色适配。代价是样式不可定制，但对一个「操作成功」的反馈来说够用。
 */
export function toast(message, type) {
  if (!message) return
  const t = type === 'success' || type === 'error' ? type : 'info'
  uni.showToast({
    title: String(message),
    // info 用 none：不画图标，只出一条文字气泡，语气最轻
    icon: t === 'info' ? 'none' : t,
    duration: t === 'error' ? 2600 : 1800,
    mask: false,
  })
}

/**
 * 二次确认。返回 Promise<boolean>，用法：
 *   if (!(await confirm('删除这笔记录？'))) return
 *
 * 危险操作（删除、归档、撤销导入）一律走这里 —— 这些动作不可逆，
 * 而移动端误触的概率远高于桌面端。
 */
export function confirm(message, options) {
  const opts = options || {}
  return new Promise(function (resolve) {
    uni.showModal({
      title: opts.title || '请确认',
      content: String(message || ''),
      showCancel: true,
      cancelText: opts.cancelText || '取消',
      confirmText: opts.confirmText || '确定',
      confirmColor: opts.danger ? '#E11D48' : '#0F766E',
      success(res) {
        resolve(!!res.confirm)
      },
      fail() {
        resolve(false)
      },
    })
  })
}

/** 只有一个「知道了」的提示框，用于必须让用户看到、不能一闪而过的说明 */
export function alert(message, options) {
  const opts = options || {}
  return new Promise(function (resolve) {
    uni.showModal({
      title: opts.title || '提示',
      content: String(message || ''),
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#0F766E',
      success() {
        resolve()
      },
      fail() {
        resolve()
      },
    })
  })
}

let loadingDepth = 0

/** 显示加载中。可以嵌套调用，全部 hideLoading 后才真正隐藏。 */
export function loading(title) {
  loadingDepth += 1
  if (loadingDepth === 1) {
    uni.showLoading({ title: title || '加载中', mask: true })
  }
}

export function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1)
  if (loadingDepth === 0) {
    try {
      uni.hideLoading()
    } catch (e) {
      /* 没有正在显示的 loading 时会失败，忽略 */
    }
  }
}

/** 包住一个异步动作：自动 loading + 失败 toast，成功与否都返回结果或 null */
export async function withLoading(fn, title) {
  loading(title)
  try {
    return await fn()
  } catch (e) {
    // api.js 已经在非 silent 时提示过了，这里不再重复弹
    return null
  } finally {
    hideLoading()
  }
}

/** 触感反馈：删除、超支这类「有分量」的动作在 App 上震一下 */
export function haptic(type) {
  try {
    uni.vibrateShort({ type: type || 'light' })
  } catch (e) {
    /* H5 与部分机型不支持，静默忽略 */
  }
}
