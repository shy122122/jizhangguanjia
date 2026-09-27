/* ============================================================================
 * 明账 · 格式化
 *
 * 从浏览器版 assets/js/api.js 的 MZ_FMT 原样移植。
 *
 * 后端一律返回 number（DECIMAL 已经在服务端用整数分算过），
 * 所以这里只负责「怎么显示」，不做任何四则运算 —— 一旦在客户端做金额运算，
 * 精度归属就说不清了，而财务软件最怕这个。
 * ========================================================================== */

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

/** 千分位 + 固定两位小数。3500 → "3,500.00" */
function thousands(n, digits) {
  const d = digits === undefined ? 2 : digits
  const num = Number(n)
  if (!isFinite(num)) return '--'
  const neg = num < 0
  const fixed = Math.abs(num).toFixed(d)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + parts.join('.')
}

const fmt = {
  /** 带货币符号：648.43 → "¥648.43" */
  money(n) {
    return '¥' + thousands(n, 2)
  },
  /** 不带符号，用于输入框回填等场景 */
  amount(n) {
    return thousands(n, 2)
  },
  /** 只保留整数位：3500 → "¥3,500"（大卡片用） */
  moneyInt(n) {
    return '¥' + thousands(n, 0)
  },

  /** 0~100 的百分数。62.5 → "62.5%"；整数则不显示小数位 */
  percent(n, digits) {
    const num = Number(n)
    if (!isFinite(num)) return '--'
    const d = digits === undefined ? 1 : digits
    let fixed = num.toFixed(d)
    // 62.0 → 62，避免「已用 62.0%」这种别扭的显示
    if (fixed.indexOf('.') !== -1) fixed = fixed.replace(/\.?0+$/, '')
    return fixed + '%'
  },

  /** 进度条宽度用：把数值夹到 0~100，返回 number */
  clampPercent(n) {
    const num = Number(n)
    if (!isFinite(num) || num < 0) return 0
    return num > 100 ? 100 : num
  },

  /** '2026-09-24 12:30:00' → '2026-09-24'（后端给的一律是 UTC+8 墙上时间字符串） */
  date(s) {
    return s ? String(s).slice(0, 10) : ''
  },
  /** → '12:30' */
  time(s) {
    return s ? String(s).slice(11, 16) : ''
  },
  /** → '09-24' */
  monthDay(s) {
    return s ? String(s).slice(5, 10) : ''
  },

  /**
   * 流水列表用的相对日期：今天 / 昨天 / 09-24。
   * 「今天」按设备本地时区判断 —— 演示机与数据库同为 UTC+8；
   * 若将来跨时区部署，这里要改成用服务端下发的 today。
   */
  relDay(s) {
    if (!s) return ''
    const day = String(s).slice(0, 10)
    const now = new Date()
    const today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
    const y = new Date(now.getTime() - 86400000)
    const yesterday = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate())
    if (day === today) return '今天'
    if (day === yesterday) return '昨天'
    return day.slice(5)
  },

  /** '2026-09' → '2026 年 9 月' */
  period(p) {
    if (!p) return ''
    const m = String(p).split('-')
    return m.length === 2 ? m[0] + ' 年 ' + Number(m[1]) + ' 月' : String(p)
  },

  /** '2026-09' → '2026-08'，用于「上一月」按钮 */
  prevPeriod(p) {
    const m = String(p || '').split('-')
    if (m.length !== 2) return p
    let y = Number(m[0])
    let mo = Number(m[1]) - 1
    if (mo === 0) {
      y -= 1
      mo = 12
    }
    return y + '-' + pad2(mo)
  },
  nextPeriod(p) {
    const m = String(p || '').split('-')
    if (m.length !== 2) return p
    let y = Number(m[0])
    let mo = Number(m[1]) + 1
    if (mo === 13) {
      y += 1
      mo = 1
    }
    return y + '-' + pad2(mo)
  },

  /** 金额前加正负号（收入 +、支出 −、转账无符号） */
  signedMoney(type, amount) {
    const v = thousands(amount, 2)
    if (type === 'income') return '+¥' + v
    if (type === 'expense') return '-¥' + v
    return '¥' + v
  },

  /** 当前月份 'YYYY-MM'（设备本地时区） */
  currentPeriod() {
    const now = new Date()
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1)
  },
}

export default fmt
