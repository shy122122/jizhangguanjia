'use strict';

/**
 * 金额工具。与 C 端 utils/money.js **同构**（PRD 第 9 章要求后台必须复用这套算法）。
 *
 * 背景：mysql2 把 DECIMAL 作为**字符串**返回（这是对的），而 JS 的 number 是
 * 双精度浮点，直接对 '1280.50' 做算术会引入舍入误差 —— 记账产品里一分钱的误差
 * 就是 bug。所以约定：**进入运算前一律转成「分」这个整数**。
 *
 * 为什么不 import C 端那份：两个项目是独立部署的目录，跨目录 import 会让
 * 「后台能不能单独拷走」这件事变得不确定。这份文件 100 行，重复得起。
 *
 *   toCents('1280.50')  → 128050
 *   fromCents(128050)   → '1280.50'
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
  // 第三位及以后截断而非四舍五入：DECIMAL(12,2) 存进去也会截断，先对齐避免
  // 出现「我算的和库里存的不一样」。
  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
  return negative ? -cents : cents;
}

/** 分 → 两位小数字符串。用于写库。 */
function fromCents(cents) {
  const rounded = Math.round(Number(cents) || 0);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/**
 * 金额 → number，**只用于出站响应**。
 * 库里读出来是 '1280.50'，字符串直接喂前端会让每个调用点都要 parseFloat 一次，
 * 且 '2.00' + '3.00' 会变成 '2.003.00'。入站（写库）永远走 fromCents 的字符串。
 */
function toNumber(value) {
  return toCents(value) / 100;
}

/** 任意个金额相加，返回字符串。 */
function sum(...amounts) {
  return fromCents(amounts.reduce((acc, v) => acc + toCents(v), 0));
}

/** 展示用格式化：1234567.5 → '¥1,234,567.50'。 */
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
  formatMoney,
  MAX_AMOUNT_CENTS,
};
