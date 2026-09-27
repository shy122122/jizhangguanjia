'use strict';

/**
 * /api/meta、/api/accounts、/api/categories、/api/category-rules
 * —— 记账面板与首页的「数据字典」。
 *
 * 这个 router 挂在 /api 根上（不是挂在某个前缀下），所以**不能**用
 * `router.use(requireAuth)` 一刀切：那样 /api/ 下任何一个拼错的路径都会
 * 先撞上鉴权、返回 401，而不是老老实实报 404。写错接口名的同学会以为
 * 是登录过期，去重登一遍 —— 一个纯粹浪费时间的方向误导。
 * 因此鉴权逐个路由显式挂。
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const metaService = require('../services/meta.service');
const settingsService = require('../services/settings.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/meta/bootstrap
 * 首页 + 记账面板一次拿全：账户、分类、关键词规则、用户偏好。
 * 替代原来的 4 次往返 —— 移动端首屏每一跳都要算进可见时间。
 */
router.get('/meta/bootstrap', requireAuth, async (req, res) => {
  const payload = await metaService.bootstrap(req.auth.ledgerId, req.auth.userId);
  http.ok(res, {
    user: req.auth.user,
    ledger: req.auth.ledger,
    ...payload,
  });
});

/** GET /api/accounts?includeArchived=1 */
router.get('/accounts', requireAuth, async (req, res) => {
  const includeArchived =
    validate.boolOf(req.query.includeArchived, 'includeArchived', {
      required: false,
      fallback: 0,
    }) === 1;
  const accounts = await metaService.listAccounts(req.auth.ledgerId, { includeArchived });
  http.ok(res, accounts, { count: accounts.length });
});

/** GET /api/categories?type=expense|income */
router.get('/categories', requireAuth, async (req, res) => {
  const type = validate.enumOf(req.query.type, 'type', ['expense', 'income'], {
    required: false,
  });
  const includeArchived =
    validate.boolOf(req.query.includeArchived, 'includeArchived', {
      required: false,
      fallback: 0,
    }) === 1;

  const categories = await metaService.listCategories(req.auth.ledgerId, { type, includeArchived });
  http.ok(res, categories, { count: categories.length });
});

/**
 * GET /api/category-rules
 * 记账面板在用户敲下商户名时本地预判分类用 —— 放在前端算，
 * 是为了每敲一个字都要发一次请求。
 */
router.get('/category-rules', requireAuth, async (req, res) => {
  const rules = await metaService.listCategoryRules(req.auth.ledgerId);
  http.ok(res, rules, { count: rules.length });
});

// ---------------------------------------------------------------------------
// 分类与账户的写接口（PRD 4.7「分类管理 / 账户管理」，P0）
//
// 放在这里而不是 settings.routes.js：/api/categories 和 /api/accounts
// 的读接口就在上面几行，读写分居两个文件会让「这个资源谁维护」变得含糊。
//
// DELETE 一律是**归档**，不是物理删除 —— 分类/账户被流水引用，外键是
// RESTRICT，真删会报 1451；而 is_system = 1 的预设分类更是删不得。
// 返回体里带 txnCount / balance，是为了让前端能说清「归档后会怎样」。
// ---------------------------------------------------------------------------

/** POST /api/categories */
router.post('/categories', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.created(res, await settingsService.createCategory(req.auth.ledgerId, body));
});

/** PATCH /api/categories/:id —— 改名 / 换图标 / 换颜色 / 排序 */
router.patch('/categories/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '分类');
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.updateCategory(req.auth.ledgerId, id, body));
});

/** DELETE /api/categories/:id —— 归档（不是删除） */
router.delete('/categories/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '分类');
  http.ok(res, await settingsService.archiveCategory(req.auth.ledgerId, id));
});

/** POST /api/accounts */
router.post('/accounts', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.created(res, await settingsService.createAccount(req.auth.ledgerId, body));
});

/** PATCH /api/accounts/:id —— 改名 / 改图标颜色 / 初始余额 / 额度 / 排序 */
router.patch('/accounts/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '账户');
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.updateAccount(req.auth.ledgerId, id, body));
});

/** DELETE /api/accounts/:id —— 归档（不是删除） */
router.delete('/accounts/:id', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '账户');
  http.ok(res, await settingsService.archiveAccount(req.auth.ledgerId, id));
});

/** PUT /api/accounts/:id/default —— 设为记账面板默认账户 */
router.put('/accounts/:id/default', requireAuth, async (req, res) => {
  const id = validate.idOf(req.params.id, '账户');
  http.ok(res, await settingsService.setDefaultAccount(req.auth.ledgerId, id));
});

module.exports = router;
