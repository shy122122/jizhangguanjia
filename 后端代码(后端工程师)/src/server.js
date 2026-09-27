'use strict';

/**
 * 入口：装配中间件 → 挂 API → 托管前端静态页 → 监听端口。
 *
 * 一个刻意的决定：**API 和静态页同源**。
 *   前端页面里全是 `../assets/xxx.js` 这样的相对引用，shell.js 还会用
 *   `location.pathname.split('/').pop()` 判断当前页。如果静态目录挂在
 *   `/整理版/` 这类子路径下，这些相对引用就全断了 —— 而页面是已验证资产，
 *   不该为了后端方便去改。所以静态目录直接挂在根路径。
 *
 * 另一个决定：**必须经 http 访问**。
 *   页面在 file:// 下打开时，fetch 会被浏览器按 CORS 拦掉（origin 是 null），
 *   表现为「页面能打开，但所有数据都是空的」。README 第一行就强调这点。
 */

const fs = require('fs');
const express = require('express');

const config = require('./config');
const db = require('./db');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');
if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops);

// 不引入额外依赖也能覆盖的基础浏览器安全头。暂不强推 CSP：现有原型依赖
// Tailwind CDN 与内联脚本，贸然加严格 CSP 会让全部页面失效，应在前端构建化后单独收口。
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) {
    // 流水、余额、用户资料不应落入浏览器/代理共享缓存。
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
  }
  next();
});

// 请求日志。生产环境交给反代/日志系统，这里只在开发期打。
if (config.env !== 'production') {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

// 2mb：导入接口一次可能提交几百笔明细，默认的 100kb 不够。
app.use(express.json({ limit: '2mb' }));

/** 健康检查。不带鉴权 —— 部署探针要用，且不泄露任何业务数据。 */
app.get('/api/health', async (req, res) => {
  try {
    const info = await db.ping();
    res.json({
      ok: true,
      data: {
        status: 'up',
        env: config.env,
        db:
          config.env === 'production'
            ? { status: 'up' }
            : { status: 'up', version: info.version, tables: info.tables, views: info.views },
      },
    });
  } catch (err) {
    console.error('[health] 数据库不可用：', err.message);
    res.status(503).json({
      ok: false,
      error: {
        code: err.code === 'DB_SCHEMA_OUTDATED' ? err.code : 'DB_UNAVAILABLE',
        message:
          err.code === 'DB_SCHEMA_OUTDATED'
            ? '数据库结构尚未升级，请管理员执行后端增量迁移'
            : '数据库连接失败',
      },
    });
  }
});

app.use('/api', apiRoutes);

// /api 下没被任何子路由接住的请求，返回 JSON 404 而不是被下面的静态页兜成 HTML。
// 前端 api.js 统一按 { ok:false, error } 解析，收到 HTML 会解析失败、报错难懂。
app.use('/api', notFoundHandler);

// ---------------------------------------------------------------------------
// 静态托管
// ---------------------------------------------------------------------------

if (fs.existsSync(config.frontendDir)) {
  app.use(
    express.static(config.frontendDir, {
      extensions: ['html'], // /pages/01-login → 01-login.html
      index: 'index.html',
      etag: true,
      maxAge: config.env === 'production' ? '1h' : 0,
    })
  );
  console.log(`[static] 托管前端目录：${config.frontendDir}`);
} else {
  console.warn(`[static] ⚠️ 前端目录不存在，页面将无法访问：${config.frontendDir}`);
  console.warn('[static]    请检查 .env 里的 FRONTEND_DIR。');
}

// 既不是 API、也不是静态文件的路径。用 app.use 而不是 app.get('*') ——
// Express 5 换了 path-to-regexp v8，裸 '*' 会直接抛 TypeError。
app.use(notFoundHandler);

// 错误处理必须最后注册，且必须是 4 个参数（Express 靠这个识别）。
app.use(errorHandler);

// ---------------------------------------------------------------------------

async function start() {
  try {
    const info = await db.ping();
    console.log(
      `[db] 已连接 MySQL ${info.version} · ${info.tables} 张表 · ${info.views} 个视图`
    );
  } catch (err) {
    console.error('[db] 连接失败：', err.message);
    console.error('[db] 请确认 MySQL 已启动，且 .env 里的 DB_* 正确。');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log('');
    console.log(`  明账后端已启动  http://localhost:${config.port}`);
    console.log(`  健康检查        http://localhost:${config.port}/api/health`);
    console.log(`  前端页面        http://localhost:${config.port}/  （必须走 http，不要用 file://）`);
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] 端口 ${config.port} 已被占用。改 .env 里的 PORT，或先关掉占用它的进程。`);
    } else {
      console.error('[server] 启动失败：', err);
    }
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] 收到 ${signal}，正在关闭…`);
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    // 兜底：10 秒内没关干净就强退，避免挂着不退的僵进程。
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
