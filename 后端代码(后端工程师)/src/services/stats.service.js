'use strict';

/**
 * 统计。统计页的四块图。
 *
 * 三个走现成视图，一个必须自己聚合：
 *
 *   overview  → v_monthly_summary
 *   category  → v_category_month_spend
 *   account   → v_account_balance
 *   trend     → 没有对应视图（视图是「月 × 分类」和「月」两个粒度，
 *               而趋势图既要按月也要按日），所以这里直接聚合 transaction。
 *
 * ⚠️ 视图是 SQL SECURITY INVOKER 且**不带 ledger 过滤** —— 视图把「算什么」
 * 定义好了，「算谁的」必须由调用方补。每一条 SQL 都带 ledger_id = ?。
 */

const db = require('../db');
const money = require('../utils/money');
const validate = require('../utils/validate');
const period = require('../utils/period');
const transactionService = require('./transaction.service');

const GRANULARITIES = ['month', 'day'];
const BREAKDOWN_TYPES = ['expense', 'income'];

const TREND_MONTHS = 6;

/**
 * 以 period 结尾的连续 N 个账期，升序。
 *
 * period.js 里有个 recentPeriods()，但它写死以「当前月」结尾。
 * 趋势图要支持 ?period=2026-06 这种回看，所以这里自己算。
 */
function periodsEndingAt(periodValue, count) {
  const [year, month] = periodValue.split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** 该月的每一天，'YYYY-MM-DD'。 */
function daysOfPeriod(periodValue) {
  const total = period.daysInPeriod(periodValue);
  return Array.from(
    { length: total },
    (_, i) => `${periodValue}-${String(i + 1).padStart(2, '0')}`
  );
}

/**
 * [视图] v_monthly_summary —— 统计页顶部三张卡片。
 * 直接复用流水模块的 summary()，避免同一个视图被两处解释出不同口径。
 */
async function overview(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);
  const summary = await transactionService.summary(ledgerId, p);

  // 日均支出：图的横轴信息，不是新口径 —— 就是 expense_total ÷ 当月天数。
  const days = period.daysInPeriod(p);
  const avgExpensePerDay = days === 0 ? 0 : money.toNumber(summary.expenseTotal) / days;

  return {
    ...summary,
    daysInPeriod: days,
    avgExpensePerDay: Math.round(avgExpensePerDay * 100) / 100,
    isCurrentPeriod: period.isCurrentPeriod(p),
  };
}

/**
 * [视图] v_category_month_spend —— 分类占比 / 排行。
 *
 * 视图只返回「真实发生过」的分类（未使用的分类不出现），这正是图表要的。
 * 占比在这里算，而不是让前端各算一遍：口径分散到前端就会出现
 * 饼图的百分比加起来不等于 100% 这种事。
 */
async function categoryBreakdown(ledgerId, periodInput, { type = 'expense' } = {}) {
  const p = period.normalizePeriod(periodInput);
  const categoryType = validate.enumOf(type, '分类类型', BREAKDOWN_TYPES, {
    required: false,
    fallback: 'expense',
  });

  const rows = await db.query(
    `SELECT category_id, category_name, category_type, icon, color,
            total_amount, txn_count, avg_amount
       FROM \`v_category_month_spend\`
      WHERE ledger_id = ? AND period_value = ? AND category_type = ?
      ORDER BY total_amount DESC, category_id ASC`,
    [ledgerId, p, categoryType]
  );

  const totalCents = rows.reduce((acc, row) => acc + money.toCents(row.total_amount), 0);

  const items = rows.map((row) => {
    const cents = money.toCents(row.total_amount);
    return {
      categoryId: Number(row.category_id),
      categoryName: row.category_name,
      icon: row.icon,
      color: row.color,
      totalAmount: money.toNumber(row.total_amount),
      txnCount: Number(row.txn_count),
      avgAmount: money.toNumber(row.avg_amount),
      // 总数为 0 时占比无意义，直接给 0 而不是 NaN。
      percent: totalCents === 0 ? 0 : Math.round((cents / totalCents) * 1000) / 10,
    };
  });

  return {
    period: p,
    type: categoryType,
    totalAmount: totalCents / 100,
    txnCount: items.reduce((acc, x) => acc + x.txnCount, 0),
    items,
  };
}

/**
 * 趋势。按月或按日。
 *
 * 直接聚合 transaction 而不是查视图，原因见文件头。
 *
 * **按日时要补齐空格子**：视图不会凭空产生没有流水的日期，
 * 但如果只返回有数据的那几天，折线图会把 9-01 和 9-20 连成一条直线，
 * 视觉上等于「这几天都在花这么多钱」，是错的。所以日粒度一律返回满月。
 * 月粒度同理补满 6 个月。
 *
 * 转账不计入 —— 与 v_monthly_summary 保持一致（转账不是收支）。
 */
async function trend(ledgerId, periodInput, { granularity = 'month' } = {}) {
  const p = period.normalizePeriod(periodInput);
  const grain = validate.enumOf(granularity, '趋势粒度', GRANULARITIES, {
    required: false,
    fallback: 'month',
  });

  const buckets =
    grain === 'month' ? periodsEndingAt(p, TREND_MONTHS) : daysOfPeriod(p);

  const range = period.periodRange(p);
  const start = grain === 'month' ? `${buckets[0]}-01 00:00:00` : range.start;
  const fmt = grain === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const rows = await db.query(
    `SELECT DATE_FORMAT(\`happened_at\`, ?) AS \`bucket\`,
            SUM(CASE WHEN \`type\` = 'income'  THEN \`amount\` ELSE 0 END) AS \`income_total\`,
            SUM(CASE WHEN \`type\` = 'expense' THEN \`amount\` ELSE 0 END) AS \`expense_total\`,
            COUNT(*) AS \`txn_count\`
       FROM \`transaction\`
      WHERE \`ledger_id\` = ?
        AND \`is_deleted\` = 0
        AND \`type\` IN ('expense', 'income')
        AND \`happened_at\` >= ?
        AND \`happened_at\` <  ?
      GROUP BY \`bucket\``,
    [fmt, ledgerId, start, range.end]
  );

  const byBucket = new Map(rows.map((row) => [row.bucket, row]));

  const items = buckets.map((bucket) => {
    const row = byBucket.get(bucket);
    const income = money.toNumber(row?.income_total ?? 0);
    const expense = money.toNumber(row?.expense_total ?? 0);
    return {
      bucket,
      incomeTotal: income,
      expenseTotal: expense,
      net: Math.round((income - expense) * 100) / 100,
      txnCount: Number(row?.txn_count ?? 0),
    };
  });

  return {
    period: p,
    granularity: grain,
    items,
    totalIncome: money.toNumber(money.sum(...items.map((x) => x.incomeTotal))),
    totalExpense: money.toNumber(money.sum(...items.map((x) => x.expenseTotal))),
  };
}

/**
 * [视图] v_account_balance —— 账户分布。
 *
 * ⚠️ 信用卡这一列要格外小心：视图里 balance 是净资产口径，信用卡上它是**负数**
 * （−credit_used）。把它当「余额」展示出来，用户会看到自己的信用卡显示「−88」，
 * 而他想看的是「已用 88 / 可用 59912」。所以信用卡一律给 creditUsed /
 * creditAvailable，balance 只用于净资产合计。
 */
async function accountDistribution(ledgerId) {
  const rows = await db.query(
    `SELECT account_id, name, type, icon, color, card_tail, is_default, sort_order,
            initial_balance, balance, credit_limit, bill_due, credit_used, credit_available
       FROM \`v_account_balance\`
      WHERE ledger_id = ? AND is_archived = 0
      ORDER BY sort_order ASC, account_id ASC`,
    [ledgerId]
  );

  const items = rows.map((row) => ({
    accountId: Number(row.account_id),
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    cardTail: row.card_tail,
    isDefault: Number(row.is_default) === 1,
    // 净资产口径，信用卡为负值 —— 仅用于合计，不要直接当「余额」展示。
    balance: money.toNumber(row.balance),
    creditLimit: row.credit_limit == null ? null : money.toNumber(row.credit_limit),
    billDue: row.bill_due == null ? null : money.toNumber(row.bill_due),
    creditUsed: row.credit_used == null ? null : money.toNumber(row.credit_used),
    creditAvailable:
      row.credit_available == null ? null : money.toNumber(row.credit_available),
  }));

  // 净资产 = Σ balance。信用卡的负债已经以负值形式在里面了，
  // 所以这里是加总，不是「加总再减信用卡」。
  const netWorth = money.toNumber(money.sum(...items.map((x) => x.balance)));
  const cashTotal = money.toNumber(
    money.sum(...items.filter((x) => x.type !== 'credit').map((x) => x.balance))
  );
  const creditUsedTotal = money.toNumber(
    money.sum(...items.map((x) => x.creditUsed ?? 0))
  );

  return {
    items,
    netWorth,
    cashTotal,
    creditUsedTotal,
    accountCount: items.length,
  };
}

module.exports = {
  overview,
  categoryBreakdown,
  trend,
  accountDistribution,
  GRANULARITIES,
  BREAKDOWN_TYPES,
};
