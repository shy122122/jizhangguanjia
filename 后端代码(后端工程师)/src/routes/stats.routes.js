'use strict';

/**
 * /api/stats —— 统计页。
 *
 * 四个接口都只读，没有写操作。
 * 周期一律用 `?period=YYYY-MM` 覆盖（缺省当前月），方便回看历史。
 */

const express = require('express');
const http = require('../utils/http');
const statsService = require('../services/stats.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/stats/overview?period=2026-09 —— [视图] v_monthly_summary */
router.get('/stats/overview', requireAuth, async (req, res) => {
  http.ok(res, await statsService.overview(req.auth.ledgerId, req.query.period));
});

/** GET /api/stats/category?period=2026-09&type=expense —— [视图] v_category_month_spend */
router.get('/stats/category', requireAuth, async (req, res) => {
  http.ok(
    res,
    await statsService.categoryBreakdown(req.auth.ledgerId, req.query.period, {
      type: req.query.type,
    })
  );
});

/** GET /api/stats/trend?period=2026-09&granularity=month|day —— [聚合] */
router.get('/stats/trend', requireAuth, async (req, res) => {
  http.ok(
    res,
    await statsService.trend(req.auth.ledgerId, req.query.period, {
      granularity: req.query.granularity,
    })
  );
});

/** GET /api/stats/account —— [视图] v_account_balance（账户分布，不带周期） */
router.get('/stats/account', requireAuth, async (req, res) => {
  http.ok(res, await statsService.accountDistribution(req.auth.ledgerId));
});

module.exports = router;
