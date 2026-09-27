'use strict';

/**
 * 设置。PRD 4.7。
 *
 * 覆盖四块：偏好、个人资料、密码、账本。
 *
 * 两条贯穿全文件的规则：
 *
 *  1. **删除一律是归档。** 分类、账户、账本都有 is_archived，没有一个是物理删除。
 *     账户/分类被流水引用（外键 RESTRICT，删不掉），而 is_system = 1 的预设分类
 *     被引用时更是直接抛 1451。与其让用户撞一个数据库错误，不如把「归档」
 *     做成明确的动作 —— 归档后不出现在选择器里，历史流水照常显示。
 *
 *  2. **默认账户/默认账本是单例。** 设置新的默认时，必须在同一个事务里
 *     把旧的清掉。否则会同时存在两个 is_default = 1，记账面板「默认选中哪个」
 *     就取决于 MySQL 返回行的顺序 —— 这种 bug 偶发、难查、且看起来像玄学。
 */

const db = require('../db');
const crypto = require('crypto');
const auth = require('../auth');
const money = require('../utils/money');
const validate = require('../utils/validate');
const period = require('../utils/period');
const { assertDemoAccountMutable } = require('../utils/demo-account');
const { ApiError } = require('../middleware/errors');

const THEMES = ['light', 'dark', 'system'];
const ACCOUNT_TYPES = ['cash', 'wechat', 'alipay', 'bank', 'credit'];
const CATEGORY_TYPES = ['expense', 'income'];

// ---------------------------------------------------------------------------
// 用户偏好
// ---------------------------------------------------------------------------

/** user_preference 可能缺行（老数据 / 手工建库），缺了就返回默认值而不是 404。 */
async function getPreferences(userId) {
  const row = await db.queryOne('SELECT * FROM `user_preference` WHERE `user_id` = ?', [
    userId,
  ]);

  if (!row) {
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

async function updatePreferences(userId, body) {
  const current = await getPreferences(userId);

  const theme = validate.enumOf(body.theme, '主题', THEMES, {
    required: false,
    fallback: current.theme,
  });
  const language = validate.optionalStr(body.language, '语言', { max: 10 }) ?? current.language;
  const currency = validate.optionalStr(body.currency, '币种', { max: 3 }) ?? current.currency;
  const soundEnabled =
    body.soundEnabled === undefined
      ? current.soundEnabled
      : validate.boolOf(body.soundEnabled, '按键音效') === 1;

  let defaultLedgerId = current.defaultLedgerId;
  if (body.defaultLedgerId !== undefined) {
    if (body.defaultLedgerId === null || body.defaultLedgerId === '') {
      defaultLedgerId = null;
    } else {
      defaultLedgerId = validate.idOf(body.defaultLedgerId, '默认账本');
      const owned = await db.queryValue(
        'SELECT id FROM `ledger` WHERE id = ? AND owner_id = ? AND is_archived = 0',
        [defaultLedgerId, userId]
      );
      if (!owned) {
        throw ApiError.badRequest('账本不存在或不属于当前账号', 'INVALID_REFERENCE', {
          field: 'defaultLedgerId',
        });
      }
    }
  }

  await db.query(
    `INSERT INTO \`user_preference\`
       (\`user_id\`, \`theme\`, \`language\`, \`currency\`, \`sound_enabled\`, \`default_ledger_id\`)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        \`theme\`             = VALUES(\`theme\`),
        \`language\`          = VALUES(\`language\`),
        \`currency\`          = VALUES(\`currency\`),
        \`sound_enabled\`     = VALUES(\`sound_enabled\`),
        \`default_ledger_id\` = VALUES(\`default_ledger_id\`)`,
    [userId, theme, language, currency, soundEnabled ? 1 : 0, defaultLedgerId]
  );

  return getPreferences(userId);
}

// ---------------------------------------------------------------------------
// 个人资料 / 密码
// ---------------------------------------------------------------------------

async function getProfile(userId) {
  const row = await db.queryOne(
    `SELECT id, uid, phone, email, display_name, avatar_url, status, created_at, last_login_at
       FROM \`user\` WHERE id = ?`,
    [userId]
  );
  if (!row) throw ApiError.notFound('账号不存在', 'USER_NOT_FOUND');

  return {
    id: Number(row.id),
    uid: row.uid,
    phone: row.phone,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: Number(row.status),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/**
 * 改资料。手机号/邮箱**不在这里改** —— 换绑定要走验证码验证，
 * 否则等于把「改绑手机号」变成「谁拿到 token 谁就能改」。
 */
async function updateProfile(userId, body) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  const sets = [];
  const params = [];

  if (has('displayName')) {
    const name = validate.optionalStr(body.displayName, '昵称', { max: 50 });
    sets.push('`display_name` = ?');
    params.push(name);
  }
  if (has('avatarUrl')) {
    const url = validate.optionalStr(body.avatarUrl, '头像地址', { max: 500 });
    if (url && !/^https?:\/\//i.test(url)) {
      throw ApiError.badRequest('头像地址必须是 http(s) 链接', 'INVALID_URL', {
        field: 'avatarUrl',
      });
    }
    sets.push('`avatar_url` = ?');
    params.push(url);
  }

  if (sets.length === 0) {
    throw ApiError.badRequest('没有需要更新的字段', 'NOTHING_TO_UPDATE');
  }

  params.push(userId);
  await db.query(`UPDATE \`user\` SET ${sets.join(', ')} WHERE id = ?`, params);
  return getProfile(userId);
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** 按文件签名识别类型；SVG 可携带脚本，因此不作为头像接收。 */
function detectAvatarMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  return null;
}

async function saveAvatar(userId, file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw ApiError.badRequest('请选择一张图片', 'AVATAR_REQUIRED', { field: 'avatar' });
  }
  if (file.buffer.length > AVATAR_MAX_BYTES) {
    throw new ApiError(413, 'AVATAR_TOO_LARGE', '头像图片不能超过 5MB', { field: 'avatar' });
  }
  const mimeType = detectAvatarMime(file.buffer);
  if (!mimeType) {
    throw ApiError.badRequest('仅支持 JPG、PNG、WebP 或 GIF 图片', 'INVALID_AVATAR_TYPE', {
      field: 'avatar',
    });
  }

  const publicId = crypto.randomBytes(16).toString('hex');
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const avatarUrl = `/api/avatar/${publicId}`;

  await db.transaction(async (conn) => {
    await conn.query(
      `INSERT INTO \`user_avatar\`
         (\`user_id\`, \`public_id\`, \`mime_type\`, \`file_size\`, \`content_sha256\`, \`image_data\`)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         \`public_id\` = VALUES(\`public_id\`),
         \`mime_type\` = VALUES(\`mime_type\`),
         \`file_size\` = VALUES(\`file_size\`),
         \`content_sha256\` = VALUES(\`content_sha256\`),
         \`image_data\` = VALUES(\`image_data\`)`,
      [userId, publicId, mimeType, file.buffer.length, sha256, file.buffer]
    );
    await conn.query('UPDATE `user` SET `avatar_url` = ? WHERE `id` = ?', [avatarUrl, userId]);
  });

  return getProfile(userId);
}

async function getAvatar(publicId) {
  if (!/^[a-f0-9]{32}$/.test(String(publicId || ''))) return null;
  const row = await db.queryOne(
    `SELECT \`mime_type\`, \`file_size\`, \`content_sha256\`, \`image_data\`
       FROM \`user_avatar\` WHERE \`public_id\` = ?`,
    [publicId]
  );
  if (!row) return null;
  return {
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    sha256: row.content_sha256,
    data: row.image_data,
  };
}

async function deleteAvatar(userId) {
  await db.transaction(async (conn) => {
    await conn.query('DELETE FROM `user_avatar` WHERE `user_id` = ?', [userId]);
    await conn.query('UPDATE `user` SET `avatar_url` = NULL WHERE `id` = ?', [userId]);
  });
  return getProfile(userId);
}

/**
 * 改密码。
 *
 * 必须先验旧密码：token 可能是从一台没锁屏的设备上偷来的，
 * 改密码是「把别人踢出去」的最后一个动作，不能凭一个 token 就放行。
 *
 * 改完递增 token_version，已签发的旧 token 会在下一次请求时立即失效。
 */
async function changePassword(userId, body) {
  if (body.newPassword !== undefined && body.confirmPassword !== undefined) {
    if (String(body.newPassword) !== String(body.confirmPassword)) {
      throw ApiError.badRequest('两次输入的新密码不一致', 'PASSWORD_MISMATCH', {
        field: 'confirmPassword',
      });
    }
  }

  const oldPassword = validate.existingPasswordOf(body.oldPassword, '当前密码');
  const newPassword = validate.passwordOf(body.newPassword, '新密码');

  if (oldPassword === newPassword) {
    throw ApiError.badRequest('新密码不能与当前密码相同', 'PASSWORD_UNCHANGED', {
      field: 'newPassword',
    });
  }

  const row = await db.queryOne('SELECT `email`, `password_hash` FROM `user` WHERE `id` = ?', [userId]);
  if (!row) throw ApiError.notFound('账号不存在', 'USER_NOT_FOUND');
  assertDemoAccountMutable(row, '修改密码');

  const ok = await auth.verifyPassword(oldPassword, row.password_hash);
  if (!ok) {
    throw ApiError.badRequest('当前密码不正确', 'INVALID_OLD_PASSWORD', {
      field: 'oldPassword',
    });
  }

  const hash = await auth.hashPassword(newPassword);
  await db.query(
    'UPDATE `user` SET `password_hash` = ?, `token_version` = `token_version` + 1 WHERE `id` = ?',
    [hash, userId]
  );

  return { changed: true, allSessionsRevoked: true };
}

// ---------------------------------------------------------------------------
// 账本
// ---------------------------------------------------------------------------

async function listLedgers(userId) {
  const rows = await db.query(
    `SELECT l.id, l.name, l.type, l.currency, l.is_default, l.created_at,
            (SELECT COUNT(*) FROM \`transaction\` t
              WHERE t.ledger_id = l.id AND t.is_deleted = 0) AS txn_count
       FROM \`ledger\` l
      WHERE l.owner_id = ? AND l.is_archived = 0
      ORDER BY l.is_default DESC, l.id ASC`,
    [userId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    type: row.type,
    currency: row.currency,
    isDefault: Number(row.is_default) === 1,
    txnCount: Number(row.txn_count),
    createdAt: row.created_at,
  }));
}

async function updateLedger(userId, ledgerId, body) {
  const id = validate.idOf(ledgerId, '账本');
  const owned = await db.queryOne(
    'SELECT id FROM `ledger` WHERE id = ? AND owner_id = ? AND is_archived = 0',
    [id, userId]
  );
  if (!owned) throw ApiError.notFound('账本不存在', 'LEDGER_NOT_FOUND');

  const name = validate.str(body.name, '账本名称', { min: 1, max: 50 });
  await db.query('UPDATE `ledger` SET `name` = ? WHERE id = ? AND owner_id = ?', [
    name,
    id,
    userId,
  ]);

  return { id, name };
}

// ---------------------------------------------------------------------------
// 分类管理（PRD 4.7 P0）
// ---------------------------------------------------------------------------

function mapCategoryRow(row, txnCount) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    sortOrder: Number(row.sort_order),
    isSystem: Number(row.is_system) === 1,
    isArchived: Number(row.is_archived) === 1,
    txnCount: txnCount == null ? undefined : Number(txnCount),
  };
}

async function createCategory(ledgerId, body) {
  const name = validate.str(body.name, '分类名称', { min: 1, max: 12 });
  const type = validate.enumOf(body.type, '分类类型', CATEGORY_TYPES);
  const icon = validate.optionalStr(body.icon, '图标', { max: 50 });
  const color = validate.colorOf(body.color, { required: false });
  const sortOrder = validate.intOf(body.sortOrder, '排序', {
    min: 0,
    max: 9999,
    required: false,
    fallback: 0,
  });

  // uk_category_ledger_type_name 会挡住重名，但那时报的是 1062。
  // 先查一次，换成一句「该分类已存在」——错误信息对用户才有意义。
  const dup = await db.queryValue(
    'SELECT id FROM `category` WHERE ledger_id = ? AND type = ? AND name = ?',
    [ledgerId, type, name]
  );
  if (dup) {
    throw ApiError.conflict(`「${name}」已经存在了`, 'CATEGORY_NAME_TAKEN', { field: 'name' });
  }

  const result = await db.query(
    `INSERT INTO \`category\` (\`ledger_id\`, \`name\`, \`type\`, \`icon\`, \`color\`, \`sort_order\`)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ledgerId, name, type, icon, color, sortOrder]
  );

  const row = await db.queryOne('SELECT * FROM `category` WHERE id = ? AND ledger_id = ?', [
    result.insertId,
    ledgerId,
  ]);
  return mapCategoryRow(row);
}

async function updateCategory(ledgerId, categoryId, body) {
  const id = validate.idOf(categoryId, '分类');
  const existing = await db.queryOne(
    'SELECT * FROM `category` WHERE id = ? AND ledger_id = ?',
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('分类不存在', 'CATEGORY_NOT_FOUND');

  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const sets = [];
  const params = [];

  if (has('name')) {
    const name = validate.str(body.name, '分类名称', { min: 1, max: 12 });
    // 改名前先查重（同一个「支出」/「收入」体系内不允许同名）。
    const dup = await db.queryValue(
      'SELECT id FROM `category` WHERE ledger_id = ? AND type = ? AND name = ? AND id <> ?',
      [ledgerId, existing.type, name, id]
    );
    if (dup) {
      throw ApiError.conflict(`「${name}」已经存在了`, 'CATEGORY_NAME_TAKEN', { field: 'name' });
    }
    sets.push('`name` = ?');
    params.push(name);
  }
  if (has('icon')) {
    sets.push('`icon` = ?');
    params.push(validate.optionalStr(body.icon, '图标', { max: 50 }));
  }
  if (has('color')) {
    sets.push('`color` = ?');
    params.push(validate.colorOf(body.color, { required: false }));
  }
  if (has('sortOrder')) {
    sets.push('`sort_order` = ?');
    params.push(validate.intOf(body.sortOrder, '排序', { min: 0, max: 9999 }));
  }

  if (sets.length === 0) {
    throw ApiError.badRequest('没有需要更新的字段', 'NOTHING_TO_UPDATE');
  }

  params.push(id, ledgerId);
  await db.query(
    `UPDATE \`category\` SET ${sets.join(', ')} WHERE id = ? AND ledger_id = ?`,
    params
  );

  const row = await db.queryOne('SELECT * FROM `category` WHERE id = ? AND ledger_id = ?', [
    id,
    ledgerId,
  ]);
  return mapCategoryRow(row);
}

/**
 * 归档分类。不是删除 —— 见文件头。
 *
 * 归档前先数一下有多少条流水在用：一条都没有的话，归档其实只是让列表变干净，
 * 直接告诉用户「这个分类没用过」比让他自己去猜更好。
 */
async function archiveCategory(ledgerId, categoryId) {
  const id = validate.idOf(categoryId, '分类');
  const existing = await db.queryOne(
    'SELECT * FROM `category` WHERE id = ? AND ledger_id = ?',
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('分类不存在', 'CATEGORY_NOT_FOUND');
  if (Number(existing.is_archived) === 1) {
    throw ApiError.conflict('该分类已经归档了', 'CATEGORY_ALREADY_ARCHIVED');
  }

  const txnCount = Number(
    await db.queryValue(
      'SELECT COUNT(*) FROM `transaction` WHERE category_id = ? AND ledger_id = ? AND is_deleted = 0',
      [id, ledgerId]
    )
  );

  // 分类预算也要一起清掉：给一个已经归档的分类留一条预算，
  // 会让分类预算合计与实际可用的分类对不上。
  await db.transaction(async (conn) => {
    await conn.query('UPDATE `category` SET `is_archived` = 1 WHERE id = ? AND ledger_id = ?', [
      id,
      ledgerId,
    ]);
    await conn.query(
      `DELETE bc FROM \`budget_category\` bc
         JOIN \`budget\` b ON b.id = bc.budget_id
        WHERE bc.category_id = ? AND b.ledger_id = ?`,
      [id, ledgerId]
    );
  });

  return { id, name: existing.name, isArchived: true, txnCount };
}

// ---------------------------------------------------------------------------
// 账户管理（PRD 4.7 P0）
// ---------------------------------------------------------------------------

function mapAccountRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    initialBalance: money.toNumber(row.initial_balance),
    creditLimit: row.credit_limit == null ? null : money.toNumber(row.credit_limit),
    billDue: row.bill_due == null ? null : money.toNumber(row.bill_due),
    cardTail: row.card_tail,
    isDefault: Number(row.is_default) === 1,
    sortOrder: Number(row.sort_order),
    isArchived: Number(row.is_archived) === 1,
  };
}

async function createAccount(ledgerId, body) {
  const name = validate.str(body.name, '账户名称', { min: 1, max: 50 });
  const type = validate.enumOf(body.type, '账户类型', ACCOUNT_TYPES);
  const icon = validate.optionalStr(body.icon, '图标', { max: 50 });
  const color = validate.colorOf(body.color, { required: false });
  const cardTail = validate.optionalStr(body.cardTail, '卡号尾号', { max: 4 });
  if (cardTail && !/^\d{4}$/.test(cardTail)) {
    throw ApiError.badRequest('卡号尾号应为 4 位数字', 'INVALID_CARD_TAIL', {
      field: 'cardTail',
    });
  }

  // 初始余额可以是负数吗？不行 —— 对应 DECIMAL(12,2) NOT NULL DEFAULT 0.00
  // 且「信用卡的初始余额」语义是「初始已用额度」，用正数表达。
  const initialBalance =
    body.initialBalance === undefined
      ? '0.00'
      : validate.nonNegativeAmountOf(body.initialBalance, '初始余额');

  // 信用卡必须有授信额度，其他账户必须没有（对应 ck_account_credit）。
  let creditLimit = null;
  let billDue = null;
  if (type === 'credit') {
    creditLimit = validate.amountOf(body.creditLimit, '信用授信额度');
    if (body.billDue !== undefined && body.billDue !== null && body.billDue !== '') {
      billDue = validate.nonNegativeAmountOf(body.billDue, '当期待还');
    }
  } else if (body.creditLimit != null || body.billDue != null) {
    throw ApiError.badRequest(
      '只有信用卡才能设置授信额度与待还账单',
      'INVALID_ACCOUNT_FIELDS',
      { field: 'creditLimit' }
    );
  }

  const sortOrder = validate.intOf(body.sortOrder, '排序', {
    min: 0,
    max: 9999,
    required: false,
    fallback: 0,
  });

  // 本账本第一个账户自动成为默认账户，否则记账面板里一个都没选中。
  const existingCount = Number(
    await db.queryValue(
      'SELECT COUNT(*) FROM `account` WHERE ledger_id = ? AND is_archived = 0',
      [ledgerId]
    )
  );
  const isDefault = existingCount === 0 ? 1 : validate.boolOf(body.isDefault, '默认账户', {
    required: false,
    fallback: 0,
  });

  const result = await db.transaction(async (conn) => {
    if (isDefault === 1) {
      await conn.query('UPDATE `account` SET `is_default` = 0 WHERE `ledger_id` = ?', [ledgerId]);
    }
    const [inserted] = await conn.query(
      `INSERT INTO \`account\`
         (\`ledger_id\`, \`name\`, \`type\`, \`icon\`, \`color\`, \`initial_balance\`,
          \`credit_limit\`, \`bill_due\`, \`card_tail\`, \`is_default\`, \`sort_order\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ledgerId,
        name,
        type,
        icon,
        color,
        money.fromCents(money.toCents(initialBalance)),
        creditLimit == null ? null : money.fromCents(money.toCents(creditLimit)),
        billDue == null ? null : money.fromCents(money.toCents(billDue)),
        cardTail,
        isDefault,
        sortOrder,
      ]
    );
    return inserted;
  });

  const row = await db.queryOne('SELECT * FROM `account` WHERE id = ? AND ledger_id = ?', [
    result.insertId,
    ledgerId,
  ]);
  return mapAccountRow(row);
}

async function updateAccount(ledgerId, accountId, body) {
  const id = validate.idOf(accountId, '账户');
  const existing = await db.queryOne(
    'SELECT * FROM `account` WHERE id = ? AND ledger_id = ?',
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('账户不存在', 'ACCOUNT_NOT_FOUND');

  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const sets = [];
  const params = [];

  if (has('name')) {
    sets.push('`name` = ?');
    params.push(validate.str(body.name, '账户名称', { min: 1, max: 50 }));
  }
  if (has('icon')) {
    sets.push('`icon` = ?');
    params.push(validate.optionalStr(body.icon, '图标', { max: 50 }));
  }
  if (has('color')) {
    sets.push('`color` = ?');
    params.push(validate.colorOf(body.color, { required: false }));
  }
  if (has('cardTail')) {
    const tail = validate.optionalStr(body.cardTail, '卡号尾号', { max: 4 });
    if (tail && !/^\d{4}$/.test(tail)) {
      throw ApiError.badRequest('卡号尾号应为 4 位数字', 'INVALID_CARD_TAIL', {
        field: 'cardTail',
      });
    }
    sets.push('`card_tail` = ?');
    params.push(tail);
  }
  if (has('initialBalance')) {
    // 改初始余额会整体平移账户余额，是危险操作 ——
    // 但它是「修正录错的基础数据」，不是改历史流水，所以允许。
    sets.push('`initial_balance` = ?');
    params.push(
      money.fromCents(money.toCents(validate.nonNegativeAmountOf(body.initialBalance, '初始余额')))
    );
  }
  if (has('billDue')) {
    if (existing.type !== 'credit') {
      throw ApiError.badRequest('只有信用卡才能设置待还账单', 'INVALID_ACCOUNT_FIELDS', {
        field: 'billDue',
      });
    }
    sets.push('`bill_due` = ?');
    params.push(
      body.billDue == null || body.billDue === ''
        ? null
        : money.fromCents(money.toCents(validate.nonNegativeAmountOf(body.billDue, '当期待还')))
    );
  }
  if (has('creditLimit')) {
    if (body.creditLimit == null || body.creditLimit === '') {
      if (existing.type === 'credit') {
        throw ApiError.badRequest('信用卡必须保留授信额度', 'INVALID_ACCOUNT_FIELDS', {
          field: 'creditLimit',
        });
      }
      sets.push('`credit_limit` = ?');
      params.push(null);
    } else {
      if (existing.type !== 'credit') {
        throw ApiError.badRequest('只有信用卡才能设置授信额度', 'INVALID_ACCOUNT_FIELDS', {
          field: 'creditLimit',
        });
      }
      sets.push('`credit_limit` = ?');
      params.push(money.fromCents(money.toCents(validate.amountOf(body.creditLimit, '授信额度'))));
    }
  }
  if (has('sortOrder')) {
    sets.push('`sort_order` = ?');
    params.push(validate.intOf(body.sortOrder, '排序', { min: 0, max: 9999 }));
  }

  const makeDefault = has('isDefault') && validate.boolOf(body.isDefault, '默认账户') === 1;
  if (makeDefault && Number(existing.is_archived) === 1) {
    throw ApiError.badRequest('已归档的账户不能设为默认', 'ACCOUNT_ARCHIVED', {
      field: 'isDefault',
    });
  }

  if (sets.length === 0 && !makeDefault) {
    throw ApiError.badRequest('没有需要更新的字段', 'NOTHING_TO_UPDATE');
  }

  await db.transaction(async (conn) => {
    if (makeDefault) {
      await conn.query('UPDATE `account` SET `is_default` = 0 WHERE `ledger_id` = ?', [ledgerId]);
      await conn.query('UPDATE `account` SET `is_default` = 1 WHERE `id` = ? AND `ledger_id` = ?', [
        id,
        ledgerId,
      ]);
    }
    if (sets.length > 0) {
      await conn.query(
        `UPDATE \`account\` SET ${sets.join(', ')} WHERE id = ? AND ledger_id = ?`,
        [...params, id, ledgerId]
      );
    }
  });

  const row = await db.queryOne('SELECT * FROM `account` WHERE id = ? AND ledger_id = ?', [
    id,
    ledgerId,
  ]);
  return mapAccountRow(row);
}

/**
 * 归档账户。两个前置条件，都是有理由的：
 *
 *  - 不能归档默认账户：归档后记账面板没有默认项可选。
 *  - 余额不为 0 时要提醒：账户里还有钱就归档，等于把钱「弄丢了」。
 *    这里不阻断（钱可能确实不用了），但把余额回给前端让它提示。
 */
async function archiveAccount(ledgerId, accountId) {
  const id = validate.idOf(accountId, '账户');
  const existing = await db.queryOne(
    'SELECT * FROM `account` WHERE id = ? AND ledger_id = ?',
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('账户不存在', 'ACCOUNT_NOT_FOUND');
  if (Number(existing.is_archived) === 1) {
    throw ApiError.conflict('该账户已经归档了', 'ACCOUNT_ALREADY_ARCHIVED');
  }
  if (Number(existing.is_default) === 1) {
    throw ApiError.badRequest(
      '不能归档默认账户，请先把其他账户设为默认',
      'ACCOUNT_IS_DEFAULT',
      { field: 'accountId' }
    );
  }

  const balance = money.toNumber(
    await db.queryValue(
      'SELECT `balance` FROM `v_account_balance` WHERE `account_id` = ? AND `ledger_id` = ?',
      [id, ledgerId]
    )
  );

  await db.query('UPDATE `account` SET `is_archived` = 1 WHERE id = ? AND ledger_id = ?', [
    id,
    ledgerId,
  ]);

  return {
    id,
    name: existing.name,
    isArchived: true,
    balance,
    notice: balance === 0 ? null : `该账户归档时余额为 ${money.formatMoney(balance)}`,
  };
}

/** 设置默认账户（记账面板默认选中的那个）。 */
async function setDefaultAccount(ledgerId, accountId) {
  const id = validate.idOf(accountId, '账户');
  const existing = await db.queryOne(
    'SELECT id, name, is_archived FROM `account` WHERE id = ? AND ledger_id = ?',
    [id, ledgerId]
  );
  if (!existing) throw ApiError.notFound('账户不存在', 'ACCOUNT_NOT_FOUND');
  if (Number(existing.is_archived) === 1) {
    throw ApiError.badRequest('已归档的账户不能设为默认', 'ACCOUNT_ARCHIVED', {
      field: 'accountId',
    });
  }

  await db.transaction(async (conn) => {
    await conn.query('UPDATE `account` SET `is_default` = 0 WHERE `ledger_id` = ?', [ledgerId]);
    await conn.query('UPDATE `account` SET `is_default` = 1 WHERE `id` = ? AND `ledger_id` = ?', [
      id,
      ledgerId,
    ]);
  });

  return { id, name: existing.name, isDefault: true };
}

// ---------------------------------------------------------------------------
// 数据管理
// ---------------------------------------------------------------------------

/**
 * 概览数字：设置页「数据管理」要显示的「你有 N 笔流水 / 共 M 个月」。
 * 顺带算一下账本创建时间，让用户知道这份数据的起点在哪。
 */
async function getDataSummary(ledgerId) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS txn_count,
            MIN(\`happened_at\`) AS first_at,
            MAX(\`happened_at\`) AS last_at
       FROM \`transaction\`
      WHERE \`ledger_id\` = ? AND \`is_deleted\` = 0`,
    [ledgerId]
  );
  const deleted = Number(
    await db.queryValue(
      'SELECT COUNT(*) FROM `transaction` WHERE `ledger_id` = ? AND `is_deleted` = 1',
      [ledgerId]
    )
  );
  const batches = Number(
    await db.queryValue('SELECT COUNT(*) FROM `import_batch` WHERE `ledger_id` = ?', [ledgerId])
  );

  return {
    txnCount: Number(row?.txn_count ?? 0),
    deletedCount: deleted,
    importBatchCount: batches,
    firstHappenedAt: row?.first_at ?? null,
    lastHappenedAt: row?.last_at ?? null,
    // 今天，方便前端算「记账天数」这类派生指标时有一个统一的服务端基准。
    serverDate: period.today(),
  };
}

function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  // 防止用 Excel/WPS 打开时把备注或商户当成公式执行。
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** 导出当前账本全部有效流水。金额直接使用 DECIMAL 字符串，避免浮点改写。 */
async function exportTransactionsCsv(ledgerId) {
  const rows = await db.query(
    `SELECT t.id, t.type, t.amount, c.name AS category_name,
            a.name AS account_name, ta.name AS to_account_name,
            t.happened_at, t.note, t.merchant, t.source
       FROM \`transaction\` t
       LEFT JOIN \`category\` c ON c.id = t.category_id
       JOIN \`account\` a ON a.id = t.account_id
       LEFT JOIN \`account\` ta ON ta.id = t.to_account_id
      WHERE t.ledger_id = ? AND t.is_deleted = 0
      ORDER BY t.happened_at DESC, t.id DESC`,
    [ledgerId]
  );
  const header = ['流水ID', '类型', '金额', '分类', '账户', '转入账户', '发生时间', '备注', '商户', '来源'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.type,
        row.amount,
        row.category_name,
        row.account_name,
        row.to_account_name,
        row.happened_at,
        row.note,
        row.merchant,
        row.source,
      ].map(csvCell).join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * 导出当前用户与当前账本的可迁移 JSON 镜像。
 * 明确排除 password_hash、token_version、登录锁等认证机密；头像以 base64 附带。
 */
async function exportDataJson(userId, ledgerId) {
  const [profile, ledger, preference, avatar, accounts, categories, rules, transactions, budgets, categoryBudgets, importBatches] =
    await Promise.all([
      getProfile(userId),
      db.queryOne(
        `SELECT id, name, type, currency, is_default, is_archived, created_at, updated_at
           FROM \`ledger\` WHERE id = ? AND owner_id = ?`,
        [ledgerId, userId]
      ),
      getPreferences(userId),
      db.queryOne(
        `SELECT mime_type, file_size, content_sha256, image_data, created_at, updated_at
           FROM \`user_avatar\` WHERE user_id = ?`,
        [userId]
      ),
      db.query('SELECT * FROM `account` WHERE ledger_id = ? ORDER BY sort_order, id', [ledgerId]),
      db.query('SELECT * FROM `category` WHERE ledger_id = ? ORDER BY type, sort_order, id', [ledgerId]),
      db.query(
        `SELECT id, ledger_id, category_id, keyword, match_type, priority, is_system, created_at
           FROM \`category_rule\` WHERE ledger_id = ? ORDER BY priority DESC, id`,
        [ledgerId]
      ),
      db.query('SELECT * FROM `transaction` WHERE ledger_id = ? ORDER BY happened_at, id', [ledgerId]),
      db.query('SELECT * FROM `budget` WHERE ledger_id = ? ORDER BY period_value, id', [ledgerId]),
      db.query(
        `SELECT bc.* FROM \`budget_category\` bc
           JOIN \`budget\` b ON b.id = bc.budget_id
          WHERE b.ledger_id = ? ORDER BY bc.budget_id, bc.category_id`,
        [ledgerId]
      ),
      db.query('SELECT * FROM `import_batch` WHERE ledger_id = ? ORDER BY created_at, id', [ledgerId]),
    ]);

  if (!ledger) throw ApiError.notFound('账本不存在', 'LEDGER_NOT_FOUND');
  return {
    format: 'mingzhang-json-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    preference,
    avatar: avatar
      ? {
          mimeType: avatar.mime_type,
          fileSize: Number(avatar.file_size),
          sha256: avatar.content_sha256,
          dataBase64: avatar.image_data.toString('base64'),
          createdAt: avatar.created_at,
          updatedAt: avatar.updated_at,
        }
      : null,
    ledger,
    data: {
      accounts,
      categories,
      categoryRules: rules,
      transactions,
      budgets,
      categoryBudgets,
      importBatches,
    },
  };
}

module.exports = {
  getPreferences,
  updatePreferences,
  getProfile,
  updateProfile,
  saveAvatar,
  getAvatar,
  deleteAvatar,
  changePassword,
  listLedgers,
  updateLedger,
  createCategory,
  updateCategory,
  archiveCategory,
  createAccount,
  updateAccount,
  archiveAccount,
  setDefaultAccount,
  getDataSummary,
  exportTransactionsCsv,
  exportDataJson,
  THEMES,
  ACCOUNT_TYPES,
  CATEGORY_TYPES,
};
