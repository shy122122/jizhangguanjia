'use strict';

/**
 * 路由总装。挂在 /api 下，与静态页面同源 —— 前端不需要处理 CORS，
 * 也不需要配置代理。
 *
 * 每个子路由自己负责自己的鉴权粒度：
 *   auth  只在 /me、/logout 上要求登录（登录/注册当然不能要求）
 *   meta  整个 router 一个 requireAuth
 * 所以这里不做统一的鉴权中间件。
 */

const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/', require('./meta.routes'));
router.use('/', require('./home.routes'));
router.use('/', require('./transaction.routes'));
router.use('/', require('./budget.routes'));
router.use('/', require('./stats.routes'));
router.use('/', require('./import.routes'));
router.use('/', require('./settings.routes'));

module.exports = router;
