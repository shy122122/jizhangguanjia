'use strict';

/**
 * /api/home —— 首页大卡片与概览。
 *
 * 所有周期接口都接受 `?period=YYYY-MM`：
 *   不传 → 当前月
 *   传了 → 那个月（演示数据固定在 2026-09，用它回看历史数据）
 */

const express = require('express');
const http = require('../utils/http');
const validate = require('../utils/validate');
const homeService = require('../services/home.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/home/quota?period=2026-09 —— 「今日可花」大卡片
 *
 * 没设预算时返回 200 + hasBudget:false，**不是 404**。
 * 前端据此走「引导设置预算」的正常分支，而不是弹一个红色报错。
 */
router.get('/home/quota', requireAuth, async (req, res) => {
  http.ok(res, await homeService.quota(req.auth.ledgerId, req.query.period));
});

/** GET /api/home/overview?period=2026-09&recentLimit=5 —— 收支概览 + 预算 + 最近流水 */
router.get('/home/overview', requireAuth, async (req, res) => {
  const recentLimit = validate.intOf(req.query.recentLimit, 'recentLimit', {
    min: 1,
    max: 50,
    required: false,
    fallback: 5,
  });
  http.ok(res, await homeService.overview(req.auth.ledgerId, req.query.period, { recentLimit }));
});

module.exports = router;
