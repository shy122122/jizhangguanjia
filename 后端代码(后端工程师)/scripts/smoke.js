'use strict';

/**
 * 后端冒烟自检 —— 不启动 HTTP 服务，直接验证「配置 → 数据库 → 视图 → 密码哈希」这条链路。
 *
 *   node scripts/smoke.js
 *
 * 固定业务合计来自 数据库脚本/README.md 的手算核对表；涉及 CURDATE() 的
 * 「剩余天数 / 今日可花」则按当前日期独立计算，避免跨天后正确结果被误报。
 */

const bcrypt = require('bcryptjs');
const config = require('../src/config');
const db = require('../src/db');
const period = require('../src/utils/period');

// bcryptjs v3 同时提供 ESM 与 CJS 出口，统一取一次方便后面调用。
const compare = bcrypt.compare || (bcrypt.default && bcrypt.default.compare);

let failures = 0;

function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}：期望 ${expected}，实际 ${actual}`);
}

function mask(secret) {
  if (!secret) return '(空)';
  return secret.slice(0, 3) + '*'.repeat(Math.max(0, secret.length - 3));
}

(async () => {
  console.log('=== 1. 配置 ===');
  console.log(`  数据库   : ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);
  console.log(`  密码     : ${mask(config.db.password)}`);
  console.log(`  JWT 密钥 : ${mask(config.jwt.secret)}`);
  console.log(`  时区     : ${config.timezone}`);
  console.log(`  前端目录 : ${config.frontendDir}`);

  console.log('\n=== 2. 连接与结构 ===');
  const info = await db.ping();
  console.log(`  MySQL 版本 : ${info.version}`);
  check('基础表数量', info.tables, 13);
  check('视图数量', info.views, 6);
  check('CHECK 约束数量', info.checks, 9);

  console.log('\n=== 3. 演示账号密码哈希 ===');
  const user = await db.queryOne(
    'SELECT id, uid, email, phone, password_hash FROM `user` WHERE id = 1'
  );
  if (!user) {
    console.log(' FAIL  找不到演示用户 id=1，请先执行 02_seed.sql');
    failures += 1;
  } else {
    const matched = await compare('Demo123456', user.password_hash);
    check('bcrypt("Demo123456") 与种子哈希匹配', matched, true);
    console.log(`  演示账号邮箱 : ${user.email}`);
    console.log(`  演示账号 UID : ${user.uid}`);
  }

  console.log('\n=== 4. v_today_quota（今日可花）===');
  const quota = await db.queryOne('SELECT * FROM v_today_quota WHERE ledger_id = 1');
  if (!quota) {
    console.log(' FAIL  v_today_quota 无数据（当前月没建预算？）');
    failures += 1;
  } else {
    console.log(`  计算日期 : ${quota.calc_date}（周期 ${quota.period_value}）`);
    const today = period.today();
    const day = Number(today.slice(8, 10));
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const expectedDays = daysInMonth - day + 1;
    const expectedQuota = (4539 / expectedDays).toFixed(2);
    check('计算日期', quota.calc_date, today);
    check('今日可花', quota.today_quota, expectedQuota);
    check('剩余天数', quota.remaining_days, expectedDays);
    check('剩余预算', quota.remaining, '4539.00');
    check('预警档位', quota.alert_level, 'normal');
  }

  console.log('\n=== 5. v_account_balance（账户余额，含信用卡反向语义）===');
  const accounts = await db.query(
    'SELECT name, balance, credit_used, credit_available FROM v_account_balance WHERE ledger_id = 1 ORDER BY sort_order'
  );
  const byName = Object.fromEntries(accounts.map((a) => [a.name, a]));
  check('现金 balance', byName['现金'] && byName['现金'].balance, '500.00');
  check('微信支付钱包 balance', byName['微信支付钱包'] && byName['微信支付钱包'].balance, '1097.50');
  check('支付宝 balance', byName['支付宝'] && byName['支付宝'].balance, '2856.30');
  check('招商银行储蓄卡 balance', byName['招商银行储蓄卡'] && byName['招商银行储蓄卡'].balance, '33600.00');
  check('信用卡 credit_used', byName['信用卡'] && byName['信用卡'].credit_used, '88.00');
  check('信用卡 credit_available', byName['信用卡'] && byName['信用卡'].credit_available, '59912.00');
  check('非信用卡无授信列（现金 credit_used）', byName['现金'] && byName['现金'].credit_used, null);

  console.log('\n=== 6. v_monthly_summary（2026-09 收支）===');
  const summary = await db.queryOne(
    "SELECT * FROM v_monthly_summary WHERE ledger_id = 1 AND period_value = '2026-09'"
  );
  check('支出合计', summary && summary.expense_total, '3461.00');
  check('收入合计', summary && summary.income_total, '18786.30');
  check('转账笔数', summary && summary.transfer_count, 1);

  console.log('\n=== 7. 软删除必须被排除（已撤销的 300 元）===');
  const alive = await db.queryValue(
    'SELECT COUNT(*) FROM `transaction` WHERE ledger_id = 1 AND is_deleted = 0'
  );
  check('有效流水数', alive, 17);

  await db.close();

  console.log('');
  if (failures === 0) {
    console.log('==== 冒烟自检全部通过 ====');
    process.exit(0);
  } else {
    console.log(`==== 有 ${failures} 项未通过 ====`);
    process.exit(1);
  }
})().catch(async (err) => {
  console.error('\n冒烟自检异常终止：', err.message);
  if (err.code) console.error('  错误码：', err.code);
  try {
    await db.close();
  } catch {
    /* 已断开则忽略 */
  }
  process.exit(1);
});
