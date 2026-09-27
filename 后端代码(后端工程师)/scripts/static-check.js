'use strict';

/** 不启动 HTTP 服务、不连接数据库的静态语法与页面 DOM 引用检查。 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env'), quiet: true });
const frontendRoot = path.resolve(
  backendRoot,
  process.env.FRONTEND_DIR || '../前端代码（前端工程师）/fronted/整理版'
);
const jsFiles = [];

function collectJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
  }
}

collectJs(path.join(backendRoot, 'src'));
collectJs(path.join(backendRoot, 'scripts'));
jsFiles.push(path.join(frontendRoot, 'assets', 'js', 'api.js'));
jsFiles.push(path.join(frontendRoot, 'assets', 'js', 'ui.js'));

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `语法检查失败：${file}\n`);
    process.exit(1);
  }
}

const pageDir = path.join(frontendRoot, 'pages');
const pages = fs.readdirSync(pageDir).filter((name) => name.endsWith('.html'));
for (const name of pages) {
  const html = fs.readFileSync(path.join(pageDir, name), 'utf8');
  const ids = new Set(
    Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), (match) => match[1])
  );
  const inlineScripts = Array.from(
    html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1]
  ).filter((source) => source.trim());

  inlineScripts.forEach((source, index) => {
    try {
      // 只编译，不执行；浏览器全局变量不会在这里被访问。
      new Function(source); // eslint-disable-line no-new-func
    } catch (error) {
      throw new Error(`${name} 的第 ${index + 1} 段内联脚本语法错误：${error.message}`);
    }
  });

  const referencedIds = Array.from(
    html.matchAll(/getElementById\(["']([^"']+)["']\)/g),
    (match) => match[1]
  );
  const missing = [...new Set(referencedIds.filter((id) => !ids.has(id)))];
  if (missing.length > 0) {
    throw new Error(`${name} 引用了不存在的 DOM id：${missing.join(', ')}`);
  }
}

console.log(`静态检查通过：${jsFiles.length} 个 JS 文件，${pages.length} 个页面。`);
