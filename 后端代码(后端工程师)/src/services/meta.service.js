'use strict';

/**
 * 元数据：账户、分类、关键词规则、用户偏好。
 *
 * 这些数据在用户的一次会话里几乎不变，前端启动时一次性拉走
 * （GET /api/meta/bootstrap），之后本地缓存 —— 所以这里不做分页，
 * 也不做增量，一次性给全量。个人账本的分类/账户量级是几十条，
 * 传输成本可以忽略。
 */

const db = require('../db');
const money = require('../utils/money');

/** 把 v_account_balance 的一行转成前端契约。 */
function mapAccount(row) {
  return {
    id: Number(row.account_id),
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    cardTail: row.card_tail,
    isDefault: Number(row.is_default) === 1,
    isArchived: Number(row.is_archived) === 1,
    sortOrder: Number(row.sort_order),

    // ⚠️ 信用卡的 balance 是【净资产口径】，等于 −creditUsed，直接当「余额」展示会看到负数。
    //    信用卡请改用 creditUsed / creditAvailable。非信用卡账户这两个字段为 null。
    balance: money.toNumber(row.balance),
    initialBalance: money.toNumber(row.initial_balance),
    creditLimit: row.credit_limit == null ? null : money.toNumber(row.credit_limit),
    billDue: row.bill_due == null ? null : money.toNumber(row.bill_due),
    creditUsed: row.credit_used == null ? null : money.toNumber(row.credit_used),
    creditAvailable: row.credit_available == null ? null : money.toNumber(row.credit_available),

    flows: {
      income: money.toNumber(row.income_sum),
      expense: money.toNumber(row.expense_sum),
      transferIn: money.toNumber(row.transfer_in),
      transferOut: money.toNumber(row.transfer_out),
    },
  };
}

function mapCategory(row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    sortOrder: Number(row.sort_order),
    isSystem: Number(row.is_system) === 1,
    isArchived: Number(row.is_archived) === 1,
  };
}

async function listAccounts(ledgerId, { includeArchived = false } = {}) {
  const rows = await db.query(
    `SELECT account_id, name, type, icon, color, card_tail, credit_limit, bill_due,
            is_default, sort_order, is_archived, initial_balance,
            income_sum, expense_sum, transfer_in, transfer_out,
            balance, credit_used, credit_available
       FROM \`v_account_balance\`
      WHERE ledger_id = ?
        ${includeArchived ? '' : 'AND is_archived = 0'}
      ORDER BY sort_order ASC, account_id ASC`,
    [ledgerId]
  );
  return rows.map(mapAccount);
}

async function listCategories(ledgerId, { type, includeArchived = false } = {}) {
  const params = [ledgerId];
  let sql = `SELECT id, name, type, icon, color, parent_id, sort_order, is_system, is_archived
               FROM \`category\`
              WHERE ledger_id = ?`;

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (!includeArchived) sql += ' AND is_archived = 0';
  sql += ' ORDER BY type ASC, sort_order ASC, id ASC';

  const rows = await db.query(sql, params);
  return rows.map(mapCategory);
}

/**
 * 关键词 → 分类 的匹配规则。
 *
 * 这里有一个 schema 带来的绕路，值得写清楚：
 * `category_rule.category_id` 指向的是 category 表的主键，而 category 是
 * **ledger 级** 的。种子里的系统规则（ledger_id = NULL）指的是演示账本的
 * 分类 id，新注册用户的分类是另一批 id —— 直接把它们发出去，前端拿到的
 * category_id 在自己的账本里根本不存在。
 *
 * 所以这里按「同类型 + 同名」把规则映射到**当前账本自己的**分类上。
 * 用户改了分类名，对应规则就不再生效 —— 这是可接受的：他既然改了名，
 * 说明想要一套自己的分类，硬把老规则套上去反而更意外。
 */
async function listCategoryRules(ledgerId) {
  const rows = await db.query(
    `SELECT r.id, r.keyword, r.match_type, r.priority, r.ledger_id,
            mine.id AS category_id, mine.name AS category_name,
            mine.type AS category_type, mine.icon, mine.color
       FROM \`category_rule\` r
       JOIN \`category\` tpl
         ON tpl.id = r.category_id
       JOIN \`category\` mine
         ON mine.ledger_id = ?
        AND mine.type = tpl.type
        AND mine.name = tpl.name
        AND mine.is_archived = 0
      WHERE r.ledger_id IS NULL OR r.ledger_id = ?`,
    [ledgerId, ledgerId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    keyword: row.keyword,
    matchType: row.match_type,
    priority: Number(row.priority),
    categoryId: Number(row.category_id),
    categoryName: row.category_name,
    categoryType: row.category_type,
    icon: row.icon,
    color: row.color,
    isCustom: row.ledger_id != null,
  }));
}

async function getPreference(userId) {
  const row = await db.queryOne(
    `SELECT user_id, theme, language, currency, sound_enabled, default_ledger_id
       FROM \`user_preference\` WHERE user_id = ?`,
    [userId]
  );
  if (!row) {
    // 早期手工插入的用户可能没有偏好行，给一份默认值而不是 404 ——
    // 设置页拿不到数据时会整页空白，比默认值难排查得多。
    return {
      theme: 'system',
      language: 'zh-CN',
      currency: 'CNY',
      soundEnabled: true,
      defaultLedgerId: null,
    };
  }
  return {
    theme: row.theme,
    language: row.language,
    currency: row.currency,
    soundEnabled: Number(row.sound_enabled) === 1,
    defaultLedgerId: row.default_ledger_id == null ? null : Number(row.default_ledger_id),
  };
}

/**
 * 启动包：首页与记账面板需要的一切，一次往返拿全。
 * 首页原本要发 4 个请求（账户 / 分类 / 规则 / 偏好），合并成一个。
 */
async function bootstrap(ledgerId, userId) {
  const [accounts, categories, categoryRules, preference] = await Promise.all([
    listAccounts(ledgerId),
    listCategories(ledgerId),
    listCategoryRules(ledgerId),
    getPreference(userId),
  ]);

  return {
    accounts,
    categories,
    categoryRules,
    preference,
    meta: {
      expenseCategories: categories.filter((c) => c.type === 'expense'),
      incomeCategories: categories.filter((c) => c.type === 'income'),
    },
  };
}

module.exports = {
  listAccounts,
  listCategories,
  listCategoryRules,
  getPreference,
  bootstrap,
  mapAccount,
  mapCategory,
};
