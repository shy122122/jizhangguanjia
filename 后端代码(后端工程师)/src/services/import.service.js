'use strict';

/**
 * 账单导入。PRD 4.3。
 *
 * 一条重要的架构约束：**解析在前端做，后端只收结构化结果。**
 * PRD 4.3.2 的技术说明写得很明确 —— 账单文件在浏览器端解析，不上传服务端。
 * 所以这里没有任何文本解析逻辑，也不接收文件；进来的一定已经是
 * `[{金额, 日期, 商户, 分类, 账户}]` 这样的数组。
 *
 * 三个产品规则落在这里：
 *
 *  1. **去重三条件同时满足才算重复**（PRD 4.3.3）：金额相同 AND 日期相同
 *     AND 商户相似度 > 80%。且「宁可轻微漏判也不可误判」——
 *     所以阈值卡在 80%，不做模糊放宽（见 utils/similarity.js 的说明）。
 *
 *  2. **去重是「检测」不是「拦截」。** dedup-check 只告诉前端哪些行疑似重复，
 *     由用户决定要不要勾选。后端不在写入时偷偷丢数据 ——
 *     用户点了「确认导入 35 笔」，就该进来 35 笔。
 *
 *  3. **整批撤销 10 分钟内有效**（PRD 4.3.3 第 4 点）。
 *     撤销走软删（is_deleted = 1），不做物理删除 —— 与本项目「流水永不物理删除」
 *     的规则一致。
 */

const config = require('../config');
const db = require('../db');
const money = require('../utils/money');
const validate = require('../utils/validate');
const period = require('../utils/period');
const similarity = require('../utils/similarity');
const transactionService = require('./transaction.service');
const { ApiError } = require('../middleware/errors');

const SOURCES = ['import_text', 'import_csv'];
const CHANNELS = ['alipay', 'wechat', 'other'];
const STATUS = { COMPLETED: 'completed', REVERTED: 'reverted' };

const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * 单次导入的条数上限。
 * 不是性能考虑 —— 是防止「把一整年的账单粘进来」变成一次 5000 行的写入，
 * 让用户在预览页滚到一半就放弃。超出请分批。
 */
const MAX_ITEMS = 500;

/**
 * 撤销窗口的截止时刻，'YYYY-MM-DD HH:MM:SS'（业务时区的墙上时间）。
 * 入库的时间字符串必须与 db 连接的 time_zone='+08:00' 同一口径 ——
 * 用 toISOString() 直接写会存成 UTC，撤销窗口凭空少 8 小时。
 */
function undoDeadline() {
  const wall = new Date(Date.now() + UNDO_WINDOW_MS + config.timezoneOffsetMs);
  return wall.toISOString().slice(0, 19).replace('T', ' ');
}

/** 'YYYY-MM-DD' 的次日。用于把「包含当天」转成左闭右开的索引区间。 */
function nextDay(dateOnly) {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function mapBatch(row) {
  const canUndo =
    row.status === STATUS.COMPLETED &&
    row.undo_expires_at != null &&
    String(row.undo_expires_at) > period.nowDateTime();

  return {
    id: Number(row.id),
    batchNo: row.batch_no,
    source: row.source,
    channel: row.channel,
    fileName: row.file_name,
    totalCount: Number(row.total_count),
    duplicateCount: Number(row.duplicate_count),
    importedCount: Number(row.imported_count),
    skippedCount: Number(row.skipped_count),
    status: row.status,
    undoExpiresAt: row.undo_expires_at,
    revertedAt: row.reverted_at,
    createdAt: row.created_at,
    canUndo,
  };
}

/** IMP-20260924-01。序号按「本账本当天已有几批」递增。 */
function batchNoPrefix(dateOnly) {
  return `IMP-${dateOnly.replace(/-/g, '')}-`;
}

async function nextBatchNo(ledgerId, conn) {
  const prefix = batchNoPrefix(period.today());
  const row = await conn
    .query(
      `SELECT \`batch_no\` FROM \`import_batch\`
        WHERE \`ledger_id\` = ? AND \`batch_no\` LIKE ?
        ORDER BY \`batch_no\` DESC LIMIT 1
        FOR UPDATE`,
      [ledgerId, `${prefix}%`]
    )
    .then(([rows]) => rows[0]);

  const seq = row ? Number(String(row.batch_no).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(2, '0')}`;
}

/**
 * 解析一条导入明细 → 可直接入库的字段。
 *
 * 账户/分类字典在事务内按 ledger_id 一次性加载。既守住多租户隔离边界，也避免
 * 500 条导入产生上千次数据库查询。
 */
function parseItem(raw, index, references) {
  const where = `第 ${index + 1} 条明细`;

  if (raw == null || typeof raw !== 'object') {
    throw ApiError.badRequest(`${where}格式不正确`, 'INVALID_IMPORT_ITEM', { index });
  }

  const type = validate.enumOf(raw.type, `${where}的类型`, transactionService.TXN_TYPES, {
    required: false,
    fallback: 'expense',
  });

  const amount = validate.amountOf(raw.amount, `${where}的金额`);
  const happenedAt = period.toDateTime(raw.happenedAt);
  const note = validate.optionalStr(raw.note, `${where}的备注`, { max: 100 });
  const merchant = validate.optionalStr(raw.merchant, `${where}的商户`, { max: 100 });

  const accountId = validate.idOf(raw.accountId, `${where}的账户`);
  const account = references.accounts.get(accountId);
  if (!account) {
    throw ApiError.badRequest(`${where}的账户不存在或不属于当前账本`, 'INVALID_REFERENCE', {
      field: `${where}的账户`,
    });
  }
  if (Number(account.is_archived) === 1) {
    throw ApiError.badRequest(
      `${where}的账户「${account.name}」已归档，不能记新流水`,
      'ACCOUNT_ARCHIVED',
      { field: `${where}的账户` }
    );
  }

  let toAccountId = null;
  let categoryId = null;

  if (type === 'transfer') {
    toAccountId = validate.idOf(raw.toAccountId, `${where}的转入账户`);
    if (toAccountId === accountId) {
      throw ApiError.badRequest(`${where}的转入账户不能与转出账户相同`, 'INVALID_TRANSFER', {
        index,
      });
    }
    const toAccount = references.accounts.get(toAccountId);
    if (!toAccount) {
      throw ApiError.badRequest(
        `${where}的转入账户不存在或不属于当前账本`,
        'INVALID_REFERENCE',
        { field: `${where}的转入账户` }
      );
    }
    if (Number(toAccount.is_archived) === 1) {
      throw ApiError.badRequest(
        `${where}的转入账户「${toAccount.name}」已归档，不能记新流水`,
        'ACCOUNT_ARCHIVED',
        { field: `${where}的转入账户` }
      );
    }
  } else {
    categoryId = validate.idOf(raw.categoryId, `${where}的分类`);
    const category = references.categories.get(categoryId);
    if (!category) {
      throw ApiError.badRequest('分类不存在或不属于当前账本', 'INVALID_REFERENCE', {
        field: 'categoryId',
        index,
      });
    }
    if (Number(category.is_archived) === 1) {
      throw ApiError.badRequest(`分类「${category.name}」已归档，不能记账`, 'CATEGORY_ARCHIVED', {
        field: 'categoryId',
        index,
      });
    }
    if (category.type !== type) {
      throw ApiError.badRequest(
        `分类「${category.name}」属于${category.type === 'expense' ? '支出' : '收入'}，与当前类型不符`,
        'CATEGORY_TYPE_MISMATCH',
        { field: 'categoryId', index }
      );
    }
  }

  return {
    type,
    amount: money.fromCents(money.toCents(amount)),
    happenedAt,
    note,
    merchant,
    accountId,
    toAccountId,
    categoryId,
  };
}

async function loadImportReferences(ledgerId, conn) {
  // 同一事务连接上的命令顺序执行，避免驱动层并发排队行为因版本而异。
  const [accounts] = await conn.query(
    'SELECT id, name, is_archived FROM `account` WHERE ledger_id = ?',
    [ledgerId]
  );
  const [categories] = await conn.query(
    'SELECT id, name, type, is_archived FROM `category` WHERE ledger_id = ?',
    [ledgerId]
  );
  return {
    accounts: new Map(accounts.map((row) => [Number(row.id), row])),
    categories: new Map(categories.map((row) => [Number(row.id), row])),
  };
}

/**
 * 建批次 + 批量入账。
 *
 * 幂等：优先用前端给的 batchNo（同一个 batchNo 重放会返回已有批次，
 * 而不是又插一遍流水）。前端没给就服务端生成 —— 生成也要靠
 * uk_batch_ledger_no 兜底；同一幂等键并发时由唯一键决胜，败者回读已有批次。
 *
 * 整批包在一个事务里：47 条里有 1 条账户不属于本账本，应当一条都不进，
 * 而不是进来 46 条再报错让用户自己去找少了哪条。
 */
async function createBatch(ledgerId, userId, body) {
  const source = validate.enumOf(body.source, '导入方式', SOURCES, {
    required: false,
    fallback: 'import_text',
  });
  const channel = validate.enumOf(body.channel, '账单渠道', CHANNELS, {
    required: false,
    fallback: 'other',
  });
  const fileName = validate.optionalStr(body.fileName, '文件名', { max: 255 });

  // source='import_text' 时 file_name 必须为空（对应 schema 的语义注释）。
  if (source === 'import_text' && fileName) {
    throw ApiError.badRequest('粘贴文本导入不应带文件名', 'INVALID_IMPORT_SOURCE', {
      field: 'fileName',
    });
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('没有可导入的明细', 'MISSING_FIELD', { field: 'items' });
  }
  if (items.length > MAX_ITEMS) {
    throw ApiError.badRequest(
      `单次最多导入 ${MAX_ITEMS} 条，当前 ${items.length} 条，请分批导入`,
      'IMPORT_TOO_MANY_ITEMS',
      { field: 'items', max: MAX_ITEMS }
    );
  }

  const totalCount = validate.intOf(body.totalCount, '解析总笔数', {
    min: items.length,
    max: 100000,
    required: false,
    fallback: items.length,
  });
  const duplicateCount = validate.intOf(body.duplicateCount, '重复笔数', {
    min: 0,
    max: 100000,
    required: false,
    fallback: 0,
  });
  if (duplicateCount + items.length > totalCount) {
    throw ApiError.badRequest(
      '导入数量不一致：重复笔数与实际入账笔数之和不能超过解析总笔数',
      'IMPORT_COUNT_MISMATCH',
      { field: 'duplicateCount' }
    );
  }

  const clientBatchNo = validate.optionalStr(body.batchNo, '批次号', { max: 32 });
  if (clientBatchNo && !/^[A-Za-z0-9._-]{4,32}$/.test(clientBatchNo)) {
    throw ApiError.badRequest('批次号只能包含字母、数字、. _ -', 'INVALID_BATCH_NO', {
      field: 'batchNo',
    });
  }

  // 重放：同一个 batchNo 已经存在就直接返回它，不重复入账。
  if (clientBatchNo) {
    const existing = await db.queryOne(
      `SELECT * FROM \`import_batch\` WHERE \`ledger_id\` = ? AND \`batch_no\` = ?`,
      [ledgerId, clientBatchNo]
    );
    if (existing) return { batch: mapBatch(existing), replayed: true };
  }

  try {
    return await db.transaction(async (conn) => {
      const batchNo = clientBatchNo || (await nextBatchNo(ledgerId, conn));

      const [insertResult] = await conn.query(
        `INSERT INTO \`import_batch\`
         (\`ledger_id\`, \`created_by\`, \`batch_no\`, \`source\`, \`channel\`, \`file_name\`,
          \`total_count\`, \`duplicate_count\`, \`imported_count\`, \`skipped_count\`,
          \`status\`, \`undo_expires_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ledgerId,
          userId,
          batchNo,
          source,
          channel,
          fileName,
          totalCount,
          duplicateCount,
          items.length,
          Math.max(0, totalCount - duplicateCount - items.length),
          STATUS.COMPLETED,
          undoDeadline(),
        ]
      );

      const batchId = insertResult.insertId;
      const references = await loadImportReferences(ledgerId, conn);
      const parsed = items.map((item, index) => parseItem(item, index, references));

      const sourceType = source === 'import_csv' ? 'import_csv' : 'import_text';
      await conn.query(
        `INSERT INTO \`transaction\`
         (\`ledger_id\`, \`created_by\`, \`type\`, \`amount\`, \`category_id\`, \`account_id\`,
          \`to_account_id\`, \`happened_at\`, \`note\`, \`merchant\`, \`source\`,
          \`import_batch_id\`, \`is_deleted\`)
       VALUES ?`,
        [
          parsed.map((x) => [
            ledgerId,
            userId,
            x.type,
            x.amount,
            x.categoryId,
            x.accountId,
            x.toAccountId,
            x.happenedAt,
            x.note,
            x.merchant,
            sourceType,
            batchId,
            0,
          ]),
        ]
      );

      const [rows] = await conn.query('SELECT * FROM `import_batch` WHERE `id` = ?', [batchId]);
      return { batch: mapBatch(rows[0]), replayed: false };
    });
  } catch (err) {
    // 两个相同幂等键并发到达时，前置查询都可能看不到记录；唯一键决定胜者，
    // 败者在这里回读已提交批次，仍按幂等重放返回，而不是暴露 409。
    if (clientBatchNo && err.code === 'ER_DUP_ENTRY') {
      const existing = await db.queryOne(
        `SELECT * FROM \`import_batch\` WHERE \`ledger_id\` = ? AND \`batch_no\` = ?`,
        [ledgerId, clientBatchNo]
      );
      if (existing) return { batch: mapBatch(existing), replayed: true };
    }
    throw err;
  }
}

/** [批次列表] 导入历史。倒序，带 canUndo 让前端决定「撤销」按钮亮不亮。 */
async function listBatches(ledgerId, query = {}) {
  const { page, pageSize, offset } = validate.pagination(query);

  const total = await db.queryValue(
    'SELECT COUNT(*) FROM `import_batch` WHERE `ledger_id` = ?',
    [ledgerId]
  );

  const rows = await db.query(
    `SELECT * FROM \`import_batch\`
      WHERE \`ledger_id\` = ?
      ORDER BY \`created_at\` DESC, \`id\` DESC
      LIMIT ? OFFSET ?`,
    [ledgerId, pageSize, offset]
  );

  return {
    items: rows.map(mapBatch),
    page,
    pageSize,
    total: Number(total),
    totalPages: Math.ceil(Number(total) / pageSize),
  };
}

/**
 * 整批撤销（PRD 4.3.3）。
 *
 * 三层防护，缺一不可：
 *   1. 批次必须属于当前账本（WHERE 带 ledger_id）
 *   2. 状态必须是 completed —— 撤销过的不能再撤销，pending 的没有流水可撤
 *   3. 必须在 10 分钟窗口内
 *
 * 撤销 = 把本批次插入的流水置 is_deleted = 1。
 * **不是物理删除**：外键是 SET NULL，删掉批次行会让流水的 import_batch_id
 * 变成 NULL，之后再也说不清这笔是从哪来的了。
 */
async function undoBatch(ledgerId, batchId) {
  const batch = await db.queryOne(
    'SELECT * FROM `import_batch` WHERE `id` = ? AND `ledger_id` = ?',
    [batchId, ledgerId]
  );
  if (!batch) throw ApiError.notFound('导入批次不存在', 'IMPORT_BATCH_NOT_FOUND');

  if (batch.status === STATUS.REVERTED) {
    throw ApiError.conflict('该批次已经撤销过了', 'IMPORT_ALREADY_REVERTED');
  }
  if (batch.status !== STATUS.COMPLETED) {
    throw ApiError.conflict(
      `该批次状态为「${batch.status}」，不能撤销`,
      'IMPORT_NOT_UNDOABLE'
    );
  }
  if (
    batch.undo_expires_at != null &&
    String(batch.undo_expires_at) < period.nowDateTime()
  ) {
    throw ApiError.conflict(
      '撤销窗口已过（导入后 10 分钟内可撤销），如需删除请到流水列表逐条删',
      'IMPORT_UNDO_EXPIRED'
    );
  }

  return db.transaction(async (conn) => {
    const [deleted] = await conn.query(
      `UPDATE \`transaction\` SET \`is_deleted\` = 1, \`deleted_at\` = ?
        WHERE \`ledger_id\` = ? AND \`import_batch_id\` = ? AND \`is_deleted\` = 0`,
      [period.nowDateTime(), ledgerId, batchId]
    );

    await conn.query(
      `UPDATE \`import_batch\` SET \`status\` = ?, \`reverted_at\` = ?
        WHERE \`id\` = ? AND \`ledger_id\` = ?`,
      [STATUS.REVERTED, period.nowDateTime(), batchId, ledgerId]
    );

    const [rows] = await conn.query('SELECT * FROM `import_batch` WHERE `id` = ?', [batchId]);
    return { batch: mapBatch(rows[0]), revertedCount: deleted.affectedRows };
  });
}

/**
 * 去重检测。PRD 4.3.3 的三条件。
 *
 * 先按「金额 + 当天」把候选从库里捞出来，再对候选逐条算商户相似度 ——
 * 顺序不能反：相似度是 CPU 操作，金额+日期能走索引，先用便宜的筛一遍。
 *
 * 只查 is_deleted = 0 的流水：已经删掉的记录再提示「疑似重复」会让人困惑。
 *
 * 返回的每项都带 index，前端据此把预览列表里对应的行标灰/取消勾选。
 */
async function dedupCheck(ledgerId, body) {
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('没有待检测的明细', 'MISSING_FIELD', { field: 'items' });
  }
  if (items.length > MAX_ITEMS) {
    throw ApiError.badRequest(
      `单次最多检测 ${MAX_ITEMS} 条，当前 ${items.length} 条`,
      'IMPORT_TOO_MANY_ITEMS',
      { field: 'items' }
    );
  }

  const results = [];

  for (let index = 0; index < items.length; index += 1) {
    const raw = items[index];
    if (raw == null || typeof raw !== 'object') {
      throw ApiError.badRequest(`第 ${index + 1} 条明细格式不正确`, 'INVALID_IMPORT_ITEM', {
        index,
      });
    }

    const amount = validate.amountOf(raw.amount, `第 ${index + 1} 条的金额`);
    const day = period.toDateOnly(raw.happenedAt);
    const merchant = validate.optionalStr(raw.merchant, `第 ${index + 1} 条的商户`, {
      max: 100,
    });

    // 用左闭右开的一天做范围，而不是 DATE(happened_at) = ? ——
    // 后者会让 idx_txn_date 索引失效，变成全表扫。
    const candidates = await db.query(
      `SELECT \`id\`, \`amount\`, \`happened_at\`, \`merchant\`, \`note\`, \`type\`
         FROM \`transaction\`
        WHERE \`ledger_id\` = ?
          AND \`is_deleted\` = 0
          AND \`amount\` = ?
          AND \`happened_at\` >= ?
          AND \`happened_at\` <  ?`,
      [ledgerId, money.fromCents(money.toCents(amount)), `${day} 00:00:00`, `${nextDay(day)} 00:00:00`]
    );

    // 商户名为空时不参与相似度比较 —— 空串对任何商户的相似度都是 0，
    // 让它进入比较只会得到「不重复」，与「没商户名可比」是同一结果，
    // 但显式跳过能让下面的 matched 语义更清楚。
    let matched = null;
    if (merchant) {
      for (const row of candidates) {
        // 判定（含阈值方向）交给 similarity 模块，别在这里自己写比较符 ——
        // 阈值是 > 还是 >= 属于产品规则，只应有一个出处。
        if (!similarity.isSimilar(merchant, row.merchant)) continue;

        const score = similarity.similarity(merchant, row.merchant);
        matched = {
          id: Number(row.id),
          amount: money.toNumber(row.amount),
          happenedAt: row.happened_at,
          merchant: row.merchant,
          note: row.note,
          type: row.type,
          similarity: Math.round(score * 100) / 100,
        };
        break;
      }
    }

    results.push({ index, duplicate: matched !== null, matched });
  }

  return {
    items: results,
    duplicateCount: results.filter((x) => x.duplicate).length,
    threshold: similarity.DUPLICATE_THRESHOLD,
  };
}

module.exports = {
  createBatch,
  listBatches,
  undoBatch,
  dedupCheck,
  mapBatch,
  MAX_ITEMS,
  UNDO_WINDOW_MS,
};
