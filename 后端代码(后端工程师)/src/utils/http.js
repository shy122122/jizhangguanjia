'use strict';

/**
 * 响应封装。全站统一成两种形状，前端 api.js 只需要处理这两种：
 *
 *   成功  { ok: true,  data: {...}, meta?: {...} }
 *   失败  { ok: false, error: { code, message, details? } }
 *
 * 为什么不直接返回裸数据：前端的统一错误处理需要一个稳定的判据。
 * 没有信封的话，「返回的对象里恰好有个 error 字段」和「请求失败」
 * 会混在一起，只能在每个调用点写特判。
 */

function ok(res, data, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

module.exports = { ok, created };
