'use strict';

/**
 * 响应封装。全站统一成两种形状，前端 api.js 只需要处理这两种：
 *
 *   成功  { ok: true,  data: {...}, meta?: {...} }
 *   失败  { ok: false, error: { code, message, details? } }
 *
 * meta 专门用来装分页信息，与 data 分开 —— 列表页要把 data 直接塞进表格，
 * meta 塞进分页控件，混在一起会让每个调用点都要拆一次。
 */

function ok(res, data, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

/** 分页 meta 的统一构造，避免每个列表接口各写一套字段名。 */
function pageMeta({ page, pageSize, total }) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/** 读取并规整分页参数。上限 100 —— 后台是内部工具，不需要无限翻页。 */
function readPaging(req, { defaultSize = 20 } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawSize = Number(req.query.pageSize) || defaultSize;
  const pageSize = [20, 50, 100].includes(rawSize) ? rawSize : defaultSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { ok, created, pageMeta, readPaging };
