'use strict';

/**
 * 预算。月度总预算 + 分类预算。
 *
 * 两个产品规则落在这里，值得单独点出来：
 *
 *  1. **黄/红阈值只用于预算预警，永远不拿去染支出金额。**
 *     这是产品的硬约束（PRD 4.4.4）：记账产品里把支出标红会让用户
 *     产生「我做错事了」的负罪感，而记账本该是中性的。
 *     所以 alert_level 只在预算进度条上用，流水列表里的金额一律用中性色。
 *
 *  2. **分类预算合计超过总预算只提示、不阻断**（PRD 4.4.3）。
 *     数据库也没为它加 CHECK 约束，这里同样不拦 ——
 *     用户的预算结构是他自己的事，产品只负责把数字摆清楚。
 */

const db = require('../db');
const money = require('../utils/money');
const validate = require('../utils/validate');
const period = require('../utils/period');
const { ApiError } = require('../middleware/errors');

const SAFE_SPEND_MODES = ['daily_flat', 'exclude_fixed'];

function mapProgress(row) {
  return {
    budgetId: Number(row.budget_id),
    period: row.period_value,
    periodType: row.period_type,
    totalAmount: money.toNumber(row.total_amount),
    spent: money.toNumber(row.spent),
    remaining: money.toNumber(row.remaining),
    usedPct: row.used_pct == null ? 0 : Number(row.used_pct),
    alertLevel: row.alert_level,
    alertYellowPct: Number(row.alert_yellow_pct),
    alertRedPct: Number(row.alert_red_pct),
    safeSpendMode: row.safe_spend_mode,
    periodEndDate: row.period_end_date,
    // 非当前月为 null —— 历史月份的「剩余天数」没有意义。
    remainingDays: row.remaining_days == null ? null : Number(row.remaining_days),
  };
}

/** [视图] v_budget_progress。没设预算时 hasBudget:false，不是 404。 */
async function getProgress(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);
  const row = await db.queryOne(
    `SELECT budget_id, period_type, period_value, total_amount, alert_yellow_pct, alert_red_pct,
            safe_spend_mode, spent, remaining, used_pct, alert_level, period_end_date, remaining_days
       FROM \`v_budget_progress\`
      WHERE ledger_id = ? AND period_value = ?`,
    [ledgerId, p]
  );

  if (!row) {
    return { hasBudget: false, period: p };
  }
  return { hasBudget: true, ...mapProgress(row) };
}

/**
 * 设置（或修改）月度总预算。
 *
 * 用 ON DUPLICATE KEY UPDATE 而不是「先查后写」：
 * uk_budget_period(ledger_id, period_type, period_value) 已经保证了唯一性，
 * 交给数据库来做这件事，就没有并发下的竞态窗口（两个请求同时判定「不存在」
 * 然后都去 INSERT，一个会撞唯一键报错）。
 */
async function upsert(ledgerId, body) {
  const p = period.normalizePeriod(body.period);
  const totalAmount = validate.amountOf(body.totalAmount, '预算金额');

  // 校验范围与 ck_budget_yellow / ck_budget_red 对齐，别让用户撞数据库报错。
  const yellowPct = validate.intOf(body.alertYellowPct, '黄色预警阈值', {
    min: 50,
    max: 95,
    required: false,
    fallback: 80,
  });
  const redPct = validate.intOf(body.alertRedPct, '红色预警阈值', {
    min: 90,
    max: 120,
    required: false,
    fallback: 100,
  });
  if (redPct <= yellowPct) {
    throw ApiError.badRequest(
      `红色阈值（${redPct}%）必须大于黄色阈值（${yellowPct}%），否则红线永远不会亮`,
      'INVALID_ALERT_THRESHOLD'
    );
  }

  const mode = validate.enumOf(body.safeSpendMode, '今日可花算法', SAFE_SPEND_MODES, {
    required: false,
    fallback: 'daily_flat',
  });
  if (mode === 'exclude_fixed') {
    // 不假装支持：固定支出表要到 V2.3 才引入，现在选它等于选了 daily_flat。
    // 与其静默降级让用户以为生效了，不如明说。
    throw ApiError.badRequest(
      '「扣除刚需」模式需要固定支出数据，尚未开放，请先使用「自然日平摊」',
      'SAFE_SPEND_MODE_UNAVAILABLE'
    );
  }

  await db.query(
    `INSERT INTO \`budget\`
       (\`ledger_id\`, \`period_type\`, \`period_value\`, \`total_amount\`,
        \`alert_yellow_pct\`, \`alert_red_pct\`, \`safe_spend_mode\`)
     VALUES (?, 'monthly', ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        \`total_amount\`     = VALUES(\`total_amount\`),
        \`alert_yellow_pct\` = VALUES(\`alert_yellow_pct\`),
        \`alert_red_pct\`    = VALUES(\`alert_red_pct\`),
        \`safe_spend_mode\`  = VALUES(\`safe_spend_mode\`)`,
    [ledgerId, p, money.fromCents(money.toCents(totalAmount)), yellowPct, redPct, mode]
  );

  return getProgress(ledgerId, p);
}

/** [视图] v_budget_category_progress */
async function listCategoryBudgets(ledgerId, periodInput) {
  const p = period.normalizePeriod(periodInput);
  const rows = await db.query(
    `SELECT budget_category_id, period_value, category_id, category_name, icon, color,
            sort_order, budget_amount, spent, remaining, used_pct
       FROM \`v_budget_category_progress\`
      WHERE ledger_id = ? AND period_value = ?
      ORDER BY sort_order ASC, category_id ASC`,
    [ledgerId, p]
  );

  const list = rows.map((row) => ({
    budgetCategoryId: Number(row.budget_category_id),
    categoryId: Number(row.category_id),
    categoryName: row.category_name,
    icon: row.icon,
    color: row.color,
    budgetAmount: money.toNumber(row.budget_amount),
    spent: money.toNumber(row.spent),
    remaining: money.toNumber(row.remaining),
    usedPct: row.used_pct == null ? 0 : Number(row.used_pct),
  }));

  const totalBudget = money.sum(...list.map((x) => x.budgetAmount));
  return {
    period: p,
    items: list,
    categoryBudgetTotal: money.toNumber(totalBudget),
  };
}

/** 取该账本该月的 budget 行 id。分类预算是挂在它下面的。 */
async function findBudgetId(ledgerId, p) {
  const row = await db.queryOne(
    `SELECT id FROM \`budget\`
      WHERE ledger_id = ? AND period_type = 'monthly' AND period_value = ?`,
    [ledgerId, p]
  );
  return row ? Number(row.id) : null;
}

/** 设置某个分类的月度预算。 */
async function setCategoryBudget(ledgerId, body) {
  const p = period.normalizePeriod(body.period);
  const categoryId = validate.idOf(body.categoryId, '分类');
  const amount = validate.nonNegativeAmountOf(body.amount, '分类预算');

  const budgetId = await findBudgetId(ledgerId, p);
  if (!budgetId) {
    // 分类预算是总预算的下属概念，没有总预算就无处可挂。
    // 这里创建一条 total_amount = 0 的预算行是行不通的 ——
    // v_budget_progress 里 0 预算会算出 used_pct = NULL、alert_level = 'red'，
    // 首页立刻显示「超支」，比报错更让人困惑。
    throw ApiError.badRequest(
      `${p} 还没有设置总预算，请先设置月度总预算`,
      'BUDGET_NOT_SET',
      { field: 'period' }
    );
  }

  // 分类必须是本账本的、且是支出分类 —— 给收入设「预算」没有业务含义。
  const category = await db.queryOne(
    'SELECT id, name, type, is_archived FROM `category` WHERE id = ? AND ledger_id = ?',
    [categoryId, ledgerId]
  );
  if (!category) {
    throw ApiError.badRequest('分类不存在或不属于当前账本', 'INVALID_REFERENCE', {
      field: 'categoryId',
    });
  }
  if (category.type !== 'expense') {
    throw ApiError.badRequest('只能为支出分类设置预算', 'CATEGORY_TYPE_MISMATCH', {
      field: 'categoryId',
    });
  }
  if (Number(category.is_archived) === 1) {
    throw ApiError.badRequest(`分类「${category.name}」已归档`, 'CATEGORY_ARCHIVED', {
      field: 'categoryId',
    });
  }

  await db.query(
    `INSERT INTO \`budget_category\` (\`budget_id\`, \`category_id\`, \`amount\`)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE \`amount\` = VALUES(\`amount\`)`,
    [budgetId, categoryId, money.fromCents(money.toCents(amount))]
  );

  return listCategoryBudgets(ledgerId, p);
}

/**
 * 取消分类预算。
 * 这张表没有软删字段（见 01_schema.sql），所以这里是**物理删除** ——
 * 删的是一条「额度配置」，不是财务记录，删掉不损失历史数据。
 */
async function removeCategoryBudget(ledgerId, periodInput, categoryId) {
  const p = period.normalizePeriod(periodInput);
  const budgetId = await findBudgetId(ledgerId, p);
  if (!budgetId) throw ApiError.notFound('该月没有预算', 'BUDGET_NOT_SET');

  const result = await db.query(
    'DELETE FROM `budget_category` WHERE budget_id = ? AND category_id = ?',
    [budgetId, categoryId]
  );
  if (result.affectedRows === 0) {
    throw ApiError.notFound('该分类没有设置预算', 'CATEGORY_BUDGET_NOT_FOUND');
  }

  return listCategoryBudgets(ledgerId, p);
}

module.exports = {
  getProgress,
  upsert,
  listCategoryBudgets,
  setCategoryBudget,
  removeCategoryBudget,
  SAFE_SPEND_MODES,
};
