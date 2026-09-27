'use strict';

/**
 * /api/budget —— 月度总预算 + 分类预算。
 *
 * 总预算用 PUT（幂等 upsert：设两次和设一次结果相同，符合 PUT 语义），
 * 分类预算也是 PUT，因为路径 /budget/categories/:categoryId 已经指明了资源。
 * 用 POST 会让人以为「设两次会多出一条」。
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const budgetService = require('../services/budget.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/budget?period=2026-09 —— [视图] v_budget_progress */
router.get('/budget', requireAuth, async (req, res) => {
  http.ok(res, await budgetService.getProgress(req.auth.ledgerId, req.query.period));
});

/** PUT /api/budget —— 设置/修改月度总预算与黄红阈值 */
router.put('/budget', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await budgetService.upsert(req.auth.ledgerId, body));
});

/** GET /api/budget/categories?period=2026-09 —— [视图] v_budget_category_progress */
router.get('/budget/categories', requireAuth, async (req, res) => {
  http.ok(
    res,
    await budgetService.listCategoryBudgets(req.auth.ledgerId, req.query.period)
  );
});

/** PUT /api/budget/categories/:categoryId —— 设置某分类的月度预算 */
router.put('/budget/categories/:categoryId', requireAuth, async (req, res) => {
  const categoryId = validate.idOf(req.params.categoryId, '分类');
  const body = validate.objectBody(req.body);
  http.ok(
    res,
    await budgetService.setCategoryBudget(req.auth.ledgerId, { ...body, categoryId })
  );
});

/**
 * DELETE /api/budget/categories/:categoryId —— 取消分类预算。
 * 这里是物理删除：budget_category 存的是「额度配置」而不是财务记录，
 * 且该表没有软删字段（见 01_schema.sql）。
 */
router.delete('/budget/categories/:categoryId', requireAuth, async (req, res) => {
  const categoryId = validate.idOf(req.params.categoryId, '分类');
  http.ok(
    res,
    await budgetService.removeCategoryBudget(
      req.auth.ledgerId,
      req.query.period,
      categoryId
    )
  );
});

module.exports = router;
