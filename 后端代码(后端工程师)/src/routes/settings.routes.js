'use strict';

/**
 * /api/settings —— 设置页（PRD 4.7）。
 *
 * 分类管理与账户管理的**写**接口在 meta.routes.js 里，和它们的 GET
 * 放在一起 —— 资源路径归谁维护就放在谁那里，避免 /api/categories 的读写
 * 分居两个文件。
 */

const express = require('express');
const multer = require('multer');
const http = require('../utils/http');
const validate = require('../utils/validate');
const settingsService = require('../services/settings.service');
const { requireAuth } = require('../middleware/auth');
const { ApiError } = require('../middleware/errors');

const router = express.Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/** GET /api/avatar/:publicId —— 供 img 标签直接加载的不可猜测公开地址。 */
router.get('/avatar/:publicId', async (req, res) => {
  const avatar = await settingsService.getAvatar(req.params.publicId);
  if (!avatar) throw ApiError.notFound('头像不存在', 'AVATAR_NOT_FOUND');
  const etag = `"${avatar.sha256}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set('Content-Type', avatar.mimeType);
  res.set('Content-Length', String(avatar.fileSize));
  res.set('ETag', etag);
  // 头像可以随时替换或删除，不能交给公共缓存长期保存。
  res.set('Cache-Control', 'private, max-age=300, must-revalidate');
  return res.send(avatar.data);
});

/** GET /api/settings/preferences */
router.get('/settings/preferences', requireAuth, async (req, res) => {
  http.ok(res, await settingsService.getPreferences(req.auth.userId));
});

/** PUT /api/settings/preferences —— 未传的字段保持不变 */
router.put('/settings/preferences', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.updatePreferences(req.auth.userId, body));
});

/** GET /api/settings/profile */
router.get('/settings/profile', requireAuth, async (req, res) => {
  http.ok(res, await settingsService.getProfile(req.auth.userId));
});

/** PUT /api/settings/profile —— 昵称 / 头像 */
router.put('/settings/profile', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.updateProfile(req.auth.userId, body));
});

/** POST /api/settings/avatar —— multipart/form-data，字段名 avatar。 */
router.post(
  '/settings/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  async (req, res) => {
    http.ok(res, await settingsService.saveAvatar(req.auth.userId, req.file));
  }
);

/** DELETE /api/settings/avatar —— 删除自定义图片并恢复默认头像。 */
router.delete('/settings/avatar', requireAuth, async (req, res) => {
  http.ok(res, await settingsService.deleteAvatar(req.auth.userId));
});

/** PUT /api/settings/password —— 必须先验旧密码 */
router.put('/settings/password', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.changePassword(req.auth.userId, body));
});

/** GET /api/settings/ledgers */
router.get('/settings/ledgers', requireAuth, async (req, res) => {
  http.ok(res, await settingsService.listLedgers(req.auth.userId));
});

/** PUT /api/settings/ledgers/:id */
router.put('/settings/ledgers/:id', requireAuth, async (req, res) => {
  const body = validate.objectBody(req.body);
  http.ok(res, await settingsService.updateLedger(req.auth.userId, req.params.id, body));
});

/** GET /api/settings/data —— 「数据管理」要的概览数字 */
router.get('/settings/data', requireAuth, async (req, res) => {
  http.ok(res, await settingsService.getDataSummary(req.auth.ledgerId));
});

/** GET /api/settings/export.csv —— UTF-8 BOM CSV，可直接用 Excel/WPS 打开。 */
router.get('/settings/export.csv', requireAuth, async (req, res) => {
  const csv = await settingsService.exportTransactionsCsv(req.auth.ledgerId);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="mingzhang-${Date.now()}.csv"`);
  res.send(csv);
});

/** GET /api/settings/export.json —— 当前用户与当前账本的可迁移完整镜像。 */
router.get('/settings/export.json', requireAuth, async (req, res) => {
  const payload = await settingsService.exportDataJson(req.auth.userId, req.auth.ledgerId);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="mingzhang-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

module.exports = router;
