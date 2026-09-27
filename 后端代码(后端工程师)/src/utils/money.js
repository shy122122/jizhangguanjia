'use strict';

/**
 * 金额工具。
 *
 * 背景：mysql2 把 DECIMAL 作为 **字符串** 返回（这是对的，见 db.js 的说明），
 * 而 JS 的 number 是双精度浮点，直接对 '1280.50' 做算术会引入舍入误差 ——
 * 记账产品里一分钱的误差就是 bug。
 *
 * 所以约定：**进入运算前一律转成「分」这个整数**，算完再转回两位小数的字符串。
 * 全项目任何地方都不许对金额字符串直接做 + - * /。
 *
 *   toCents('1280.50')      → 128050
 *   toCents('-88.00')       → -8800
 *   fromCents(128050)       → '1280.50'
 *   sum('1280.50','-88')    → '1192.50'
 */

const MAX_AMOUNT_CENTS = 999_999_999; // 与 ck_txn_amount_max（9,999,999.99）对齐

/** 金额字符串 → 分。非法输入抛错，而不是静默返回 NaN。 */
function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;

  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`不是合法的金额：${JSON.stringify(value)}`);
  }

  const negative = text.startsWith('-');
  const [intPart, decPart = ''] = text.replace(/^-/, '').split('.');
  // 第三位及以后直接截断而非四舍五入：数据库列就是 DECIMAL(12,2)，
  // 传进去也会被截断，在这里就先对齐，避免出现「我算的和库里存的不一样」。
  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));

  return negative ? -cents : cents;
}

/** 分 → 两位小数字符串。用于写库与返回给前端。 */
function fromCents(cents) {
  const rounded = Math.round(Number(cents) || 0);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/**
 * 金额 → number，用于 **响应体**。
 *
 * 库里读出来是 '1280.50' 这样的字符串。字符串直接喂给前端，会让每个调用点
 * 都要 parseFloat 一次，且 '2.00' + '3.00' 会变成 '2.003.00'。
 * 所以出口统一转 number —— 但注意这条路是**单向**的：只有出站才用，
 * 入站（写库）永远走 fromCents 的字符串，不经过浮点。
 *
 * 先转分再除 100，是为了消掉 DECIMAL→float 可能带来的尾数（如 0.1+0.2 那类）。
 */
function toNumber(value) {
  return toCents(value) / 100;
}

/** 任意个金额相加，返回字符串。 */
function sum(...amounts) {
  return fromCents(amounts.reduce((acc, v) => acc + toCents(v), 0));
}

/** 比较两个金额是否相等，返回 -1 / 0 / 1。 */
function compare(a, b) {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca === cb ? 0 : ca > cb ? 1 : -1;
}

/** 金额是否落在 (0, 9,999,999.99] 内。对应数据库的 ck_txn_amount_positive / ck_txn_amount_max。 */
function isValidTransactionAmount(value) {
  let cents;
  try {
    cents = toCents(value);
  } catch {
    return false;
  }
  return cents > 0 && cents <= MAX_AMOUNT_CENTS;
}

/**
 * 展示用格式化：1234567.5 → '¥1,234,567.50'。
 * 后端只在极少数地方需要（比如拼预算提醒文案），主要供前端 api.js 参考。
 */
function formatMoney(value, { symbol = '¥', signed = false } = {}) {
  const cents = toCents(value);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = String(abs % 100).padStart(2, '0');
  const sign = negative ? '-' : signed ? '+' : '';
  return `${sign}${symbol}${int}.${dec}`;
}

module.exports = {
  toCents,
  fromCents,
  toNumber,
  sum,
  compare,
  isValidTransactionAmount,
  formatMoney,
  MAX_AMOUNT_CENTS,
};
