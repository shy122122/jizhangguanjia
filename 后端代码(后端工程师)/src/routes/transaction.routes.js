'use strict';

/**
 * /api/transactions —— 流水列表、新增、编辑、软删、撤销。
 *
 * 注意路由顺序：`/transactions/summary` 必须写在 `/transactions/:id` 之前，
 * 否则 'summary' 会被当成 id 去解析，validate.idOf 抛 400「id 应为整数」。
 * 这类错误信息会让人以为是参数问题，实际是路由顺序问题。
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const transactionService = require('../services/transaction.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/transactions —— 分页 + 筛选 */
router.get('/transactions', requireAuth, async (req, res) => {
  const result = await transactionService.list(req.auth.ledgerId, req.query);
  http.ok(res, result.items, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
});

/** GET /api/transactions/summary —— [视图] v_monthly_summary */
router.get('/transactions/summary', requireAuth, async (req, res) => {
  const summary = await transactionService.summary(req.auth.ledgerId, req.query.period);
  http.ok(res, summary);
});

/**
 * POST /api/transactions
 * 响应体额外带 penetration —— 记账后立刻反馈「这笔花完，今日可花变成多少」。
 * 放在同一个响应里而不是让前端再发一次请求：这个反馈要和「记账成功」同时出现，
 * 分两次请求会出现「已经记好了，但卡片还停在旧数字」的中间态。
 */
router.post('/transactions', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  const result = await transactionService.create(req.auth.ledgerId, req.auth.userId, body);
  http.created(res, result);
});

/** GET /api/transactions/:id */
router.get('/transactions/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id);
  http.ok(res, await transactionService.getById(req.auth.ledgerId, id));
});

/** PATCH /api/transactions/:id —— 未传的字段保持不变 */
router.patch('/transactions/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id);
  const body = validate.objectBody(req.body);
  http.ok(res, await transactionService.update(req.auth.ledgerId, id, body));
});

/** DELETE /api/transactions/:id —— 软删（置 is_deleted = 1） */
router.delete('/transactions/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id);
  http.ok(res, await transactionService.softDelete(req.auth.ledgerId, id));
});

/** POST /api/transactions/:id/restore —— 撤销删除 */
router.post('/transactions/:id/restore', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id);
  http.ok(res, await transactionService.restore(req.auth.ledgerId, id));
});

module.exports = router;
