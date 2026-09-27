'use strict';

/**
 * /api/import —— 账单导入（PRD 4.3）。
 *
 * 注意：文件**不经过这里**。解析在浏览器端完成，这里只收结构化明细。
 * 这条边界是 PRD 4.3.2 明确要求的，也让后端不需要处理 GBK 解码、
 * zip 解压、金额符号这类前端更擅长的事。
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const importService = require('../services/import.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** POST /api/import/batches —— 建批次 + 批量入账（整批一个事务） */
router.post('/import/batches', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  const result = await importService.createBatch(req.auth.ledgerId, req.auth.userId, body);
  // 幂等重放返回 200，新批次才返回 201 —— 前端据此知道该不该弹「导入成功」。
  if (result.replayed) return http.ok(res, result);
  return http.created(res, result);
});

/** GET /api/import/batches —— 导入历史（带 canUndo） */
router.get('/import/batches', requireAuth, async (req, res) => {
  const result = await importService.listBatches(req.auth.ledgerId, req.query);
  http.ok(res, result.items, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
});

/** POST /api/import/batches/:id/undo —— 10 分钟内整批撤销 */
router.post('/import/batches/:id/undo', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '批次');
  http.ok(res, await importService.undoBatch(req.auth.ledgerId, id));
});

/** POST /api/import/dedup-check —— 金额 + 日期 + 商户相似度 > 80% 判重 */
router.post('/import/dedup-check', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await importService.dedupCheck(req.auth.ledgerId, body));
});

module.exports = router;
