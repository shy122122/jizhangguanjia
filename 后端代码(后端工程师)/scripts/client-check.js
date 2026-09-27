'use strict';

/**
 * 前端客户端自检。
 *
 * 为什么需要它：api.js / ui.js 是**手写的前端模块**，它们和后端之间只有一堆
 * 字符串约定（URL 路径、query 参数名、响应字段名）。这类地方写错了，
 * 在浏览器里的表现往往只是「页面一片空白」或者「数字都是 0」，很难定位。
 * 这里把 api.js 原样加载进一个假的浏览器环境（localStorage / location / fetch
 * 都是桩），真的发一遍请求，字段名对不上就会直接报出来。
 *
 * 和 api-check.js 的分工：
 *   api-check.js    验后端：路由 → 中间件 → service → 响应信封
 *   client-check.js 验前端：api.js 的取 token / 拼 URL / 信封解析 / 401 处理
 *
 * 它**不是**浏览器测试的替代品：页面上的 DOM 绑定、布局、交互仍需人眼看。
 * 但凡是「前后端约定对不上」的问题，这里应该先炸。
 */

const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');
const db = require('../src/db');
const config = require('../src/config');

const JS_DIR = path.join(config.frontendDir, 'assets', 'js');

let passed = 0;
let failed = 0;

function check(name, ok, extra) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${extra === undefined ? '' : `  →  ${JSON.stringify(extra)}`}`);
  }
}

function eq(name, actual, expected) {
  check(`${name} = ${JSON.stringify(expected)}`, actual === expected, { actual, expected });
}

/** 造一个够 api.js 跑起来的假 window。少了哪个全局，api.js 会立刻报出来。 */
function fakeWindow(base, store) {
  const win = {
    console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { pathname: '/pages/04-home-calm.html', search: '', href: '' },
    fetch: (url, init) => fetch(url.startsWith('http') ? url : base + url, init),
    setTimeout,
    clearTimeout,
    addEventListener() {},
    document: { readyState: 'complete', querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  };
  win.window = win;
  return win;
}

/** 真的去读那个文件，不复制粘贴一份 —— 否则测的是副本，不是交付物。 */
function load(win, file) {
  const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  new Function('window', code)(win);
}

async function main() {
  let base = '';
  await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const store = new Map();
  const win = fakeWindow(base, store);
  load(win, 'api.js');
  load(win, 'ui.js');

  const API = win.MZ_API;
  const FMT = win.MZ_FMT;
  const UI = win.MZ_UI;

  console.log('\n--- 模块装配 ---');
  check('api.js 挂上了 MZ_API', !!API);
  check('api.js 挂上了 MZ_FMT', !!FMT);
  check('ui.js 挂上了 MZ_UI', !!UI);
  check('ui.js 把 api.js 的错误提示接管了（不是默认的 console.warn）', typeof UI.toast === 'function');
  eq('未登录时 isLoggedIn()', API.isLoggedIn(), false);

  console.log('\n--- 登录与身份 ---');
  const session = await API.post('/auth/login', { account: 'demo@mingzhang.app', password: 'Demo123456' });
  check('返回 token', typeof session.token === 'string' && session.token.length > 20, session.token);
  eq('user.displayName', session.user.displayName, '演示用户');
  eq('ledger.name', session.ledger.name, '日常个人账本');

  API.setSession(session);
  eq('setSession 后 isLoggedIn()', API.isLoggedIn(), true);
  eq('getSession() 能从 localStorage 读回用户', API.getSession().user.displayName, '演示用户');

  console.log('\n--- 带 token 取核心视图 ---');
  const quota = await API.get('/home/quota', { period: '2026-09' });
  eq('todayQuota', quota.todayQuota, 648.43);
  eq('hasBudget', quota.hasBudget, true);
  eq('alertLevel', quota.alertLevel, 'normal');
  eq('remaining', quota.remaining, 4539);
  eq('remainingDays', quota.remainingDays, 7);

  const overview = await API.get('/home/overview', { period: '2026-09', recentLimit: 3 });
  eq('overview.summary.expenseTotal', overview.summary.expenseTotal, 3461);
  eq('overview.summary.incomeTotal', overview.summary.incomeTotal, 18786.3);
  eq('recentTransactions 条数', overview.recentTransactions.length, 3);
  eq('today.todayExpense', overview.today.todayExpense, 75.5);
  eq('today.todayExpenseCount', overview.today.todayExpenseCount, 3);
  check('最近流水带 category / account 子对象',
    !!(overview.recentTransactions[0].category && overview.recentTransactions[0].account),
    overview.recentTransactions[0]);

  console.log('\n--- raw 模式（列表页要读分页 meta）---');
  const page = await API.get('/transactions', { period: '2026-09', page: 1, pageSize: 5 }, { raw: true });
  check('raw 模式返回 { data, meta }', Array.isArray(page.data) && !!page.meta, Object.keys(page));
  eq('meta.total', page.meta.total, 17);
  eq('meta.totalPages', page.meta.totalPages, 4);
  eq('一页条数 = pageSize', page.data.length, 5);

  console.log('\n--- query 参数拼装 ---');
  const filtered = await API.get('/transactions', { period: '2026-09', type: 'expense', pageSize: 100 });
  check('type=expense 过滤生效', filtered.every((t) => t.type === 'expense'), filtered.map((t) => t.type));
  const skipped = await API.get('/transactions', { period: '2026-09', page: 1, categoryId: undefined, keyword: '' });
  check('值为 undefined / 空串的参数被跳过', Array.isArray(skipped), skipped);

  console.log('\n--- bootstrap ---');
  const boot = await API.get('/meta/bootstrap');
  eq('accounts 条数', boot.accounts.length, 5);
  eq('categories 条数', boot.categories.length, 16);
  eq('转账/信用卡账户带 creditAvailable 字段',
    Object.prototype.hasOwnProperty.call(boot.accounts[4], 'creditAvailable'), true);
  check('preference.theme 存在', !!boot.preference.theme, boot.preference);

  console.log('\n--- 401 自动登出 ---');
  const realToken = API.getToken();
  API.setToken('not-a-real-token');
  let caught = null;
  try { await API.get('/home/quota', { period: '2026-09' }, { silent: true }); } catch (e) { caught = e; }
  eq('401 抛的是 ApiError', caught && caught.name, 'ApiError');
  eq('401 后本地 token 已清空', API.getToken(), null);
  check('401 后跳到登录页并带上 next',
    win.location.href.indexOf('/pages/01-onboarding-landing.html?next=') === 0, win.location.href);
  API.setToken(realToken);

  console.log('\n--- 错误分层 ---');
  const deadWin = fakeWindow(base, new Map());
  deadWin.fetch = () => Promise.reject(new TypeError('failed'));
  load(deadWin, 'api.js');
  let netErr = null;
  try { await deadWin.MZ_API.get('/home/quota', null, { silent: true }); } catch (e) { netErr = e; }
  eq('断网 → NetworkError', netErr && netErr.name, 'NetworkError');
  eq('NetworkError.code', netErr && netErr.code, 'NETWORK_ERROR');

  let bizErr = null;
  try { await API.post('/auth/login', { account: 'demo@mingzhang.app', password: 'wrong' }, { silent: true }); }
  catch (e) { bizErr = e; }
  eq('密码错误 → LOGIN_FAILED', bizErr && bizErr.code, 'LOGIN_FAILED');
  eq('HTTP 状态 401', bizErr && bizErr.status, 401);
  check('message 是可直接展示的中文', /不正确/.test(bizErr.message), bizErr.message);

  // 「响应不是 JSON」这条只在请求没到后端时才可能出现。真机上踩过一次：
  // 页面被 IDE 预览的静态服务器代答，POST 登录返回 405，而原文案只说
  // 「服务返回了无法解析的内容」，看不出该往哪查。这里把诊断钉住。
  console.log('\n--- 405：页面不是本后端托管（回归）---');
  const staticWin = fakeWindow(base, new Map());
  staticWin.fetch = () => Promise.resolve({
    status: 405,
    headers: { get: () => null },
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
  });
  load(staticWin, 'api.js');
  let m405 = null;
  try { await staticWin.MZ_API.post('/auth/login', { account: 'x', password: 'y' }, { silent: true }); }
  catch (e) { m405 = e; }
  eq('405 → NetworkError', m405 && m405.name, 'NetworkError');
  eq('status 保留真实的 405（不是一律 0）', m405 && m405.status, 405);
  eq('url 被记下来', m405 && m405.url, '/api/auth/login');
  eq('method 被记下来', m405 && m405.method, 'POST');
  check('文案点名「请求没有到达后端」并给出正确入口',
    /请求没有到达明账后端/.test(m405.message) && /http:\/\/localhost:3000/.test(m405.message),
    m405 && m405.message);
  check('文案带上是哪个请求触发的',
    m405.message.indexOf('POST /api/auth/login → HTTP 405') !== -1, m405 && m405.message);

  // file:// 是另一条独立的死法：fetch 直接被浏览器拦成 TypeError，压根没有状态码。
  const fileWin = fakeWindow(base, new Map());
  fileWin.location.protocol = 'file:';
  fileWin.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  load(fileWin, 'api.js');
  let mFile = null;
  try { await fileWin.MZ_API.get('/home/quota', null, { silent: true }); } catch (e) { mFile = e; }
  check('file:// 的文案直说是 file:// 而不是「服务没起」',
    /file:\/\//.test(mFile.message) && /localhost:3000/.test(mFile.message), mFile && mFile.message);

  console.log('\n--- 金额与日期格式化 ---');
  eq('money(648.43)', FMT.money(648.43), '¥648.43');
  eq('money(3461) 带千分位', FMT.money(3461), '¥3,461.00');
  eq('moneyInt(18786.3)', FMT.moneyInt(18786.3), '¥18,786');
  eq('money 接字符串 DECIMAL', FMT.money('2400.00'), '¥2,400.00');
  eq('percent(43.3)', FMT.percent(43.3), '43.3%');
  eq('percent(62.0) 去掉多余的 .0', FMT.percent(62.0), '62%');
  eq('date', FMT.date('2026-09-24 12:30:00'), '2026-09-24');
  eq('time', FMT.time('2026-09-24 12:30:00'), '12:30');
  eq('monthDay', FMT.monthDay('2026-09-24 12:30:00'), '09-24');
  eq('period', FMT.period('2026-09'), '2026 年 9 月');
  eq('prevPeriod 跨年', FMT.prevPeriod('2026-01'), '2025-12');
  eq('nextPeriod 跨年', FMT.nextPeriod('2026-12'), '2027-01');
  eq('clampPercent 上限夹到 100', FMT.clampPercent(130), 100);

  console.log('\n--- 工具函数 ---');
  eq('esc 转义尖括号', UI.esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
  eq('esc 转义引号', UI.esc('a"b\'c'), 'a&quot;b&#39;c');
  eq('esc(null)', UI.esc(null), '');
  eq('each 拼接', UI.each([1, 2, 3], (n) => `<i>${n}</i>`), '<i>1</i><i>2</i><i>3</i>');
  eq('each(空数组)', UI.each([], () => 'x'), '');
  eq('alertClass 未知档位兜底 normal', UI.alertClass('???').text, 'text-primary');
  eq('signedMoney 收入带 +', UI.signedMoney('income', 1000), '+¥1,000.00');
  eq('signedMoney 支出不带符号（PRD 禁止标红）', UI.signedMoney('expense', 1000), '¥1,000.00');

  console.log(`\n==== 客户端自检：${passed} 通过 / ${failed} 失败 ====`);
  await db.close();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
