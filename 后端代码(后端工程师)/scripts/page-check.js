'use strict';

/**
 * 页面接线自检。
 *
 * 为什么需要它：把静态页接上真实数据时，页面脚本里写的是
 * `document.getElementById('home-quota')` 这种字符串，而 id 住在 HTML 里。
 * 这两边对不上的时候**不会抛错** —— getElementById 返回 null，页面脚本里的
 * `if (!el) return;` 顺手就把它咽了，浏览器里看到的现象是「那个数字一直是 —」，
 * 没有任何报错，只能一行行对 id。
 *
 * 这里做两件事：
 *   1. 静态：页面脚本引用的每个 id，页面 HTML 里必须真有；链接指向的 .html 必须存在。
 *      （对所有 23 个页面都跑，包括还没接线的）
 *   2. 运行时：把页面脚本塞进一个**只认得 HTML 里真实 id** 的假 DOM 里真跑一遍，
 *      带上真 token 打真接口。任何一次 id 未命中都记一笔并报错。
 *
 * 它**不是**浏览器测试的替代品：假的 DOM 没有布局、没有 CSS、没有事件冒泡，
 * 页面的样子和交互仍然需要人眼看。但「取错 id / 字段名写错 / 请求发错」这三类
 * 问题，这里应该先炸。
 *
 *   npm run check:page
 */

const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');
const db = require('../src/db');
const config = require('../src/config');

const PAGES_DIR = path.join(config.frontendDir, 'pages');
const JS_DIR = path.join(config.frontendDir, 'assets', 'js');

let passed = 0;
let failed = 0;
const problems = [];

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

// ---------------------------------------------------------------------------
// 静态检查
// ---------------------------------------------------------------------------

/** 剥掉注释，避免注释里的 id 被当成真实引用 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function decls(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

/** 页面脚本里 getElementById 的字面量 + UI.$('#x') / querySelector('#x') */
function referencedIds(code) {
  const ids = new Set();
  const src = stripComments(code);
  for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) ids.add(m[1]);
  for (const m of src.matchAll(/(?:\$|querySelector)\(\s*['"]#([^'"\s]+)['"]/g)) ids.add(m[1]);
  return ids;
}

/** 页面里写死的 *.html 跳转目标 */
function linkTargets(html) {
  const out = new Set();
  const src = stripComments(html);
  for (const m of src.matchAll(/href="([^"#?]*\.html)["#?]/g)) out.add(m[1]);
  for (const m of src.matchAll(/location\.href\s*=\s*['"]([^'"?]*\.html)['"?]/g)) out.add(m[1]);
  return out;
}

function staticCheck(file, html) {
  const ids = decls(html);
  const code = inlineScripts(html).join('\n');

  const missing = [...referencedIds(code)].filter((id) => !ids.has(id));
  check(`${file} · 脚本引用的 id 都在 HTML 里`, missing.length === 0, missing);

  const badLinks = [...linkTargets(html)]
    .map((href) => path.resolve(PAGES_DIR, href.replace(/^.*\//, '')))
    .filter((p) => !fs.existsSync(p));
  check(`${file} · 跳转目标都存在`, badLinks.length === 0, badLinks.map((p) => path.basename(p)));

  return { ids, code };
}

// ---------------------------------------------------------------------------
// 假 DOM：只认得 HTML 里声明过的 id
// ---------------------------------------------------------------------------

function fakeElement(id) {
  const el = {
    id,
    tagName: 'DIV',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    children: [],
    classList: {
      add() {}, remove() {}, contains() { return false; },
      toggle() {},
    },
    setAttribute() {}, getAttribute() { return null; },
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); return child; },
    insertAdjacentHTML() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'lastChild', { get: () => el.children[el.children.length - 1] || null });
  return el;
}

/**
 * @param html 页面源码 —— 用它抽出「合法 id 全集」
 * @param misses 未命中的 id 会被推进来（这就是要抓的东西）
 */
function fakeDocument(html, misses) {
  const known = decls(html);
  const els = new Map();

  const doc = {
    readyState: 'loading',
    listeners: {},
    body: fakeElement('body'),
    getElementById(id) {
      if (!known.has(id)) {
        // 真浏览器里这里是 null，页面脚本的 `if (el)` 会把它吞掉 —— 所以要记账
        if (!misses.includes(id)) misses.push(id);
        return null;
      }
      if (!els.has(id)) els.set(id, fakeElement(id));
      return els.get(id);
    },
    createElement: () => fakeElement('created'),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      (doc.listeners[type] = doc.listeners[type] || []).push(fn);
    },
    dispatch(type) {
      (doc.listeners[type] || []).forEach((fn) => fn({ type }));
    },
  };
  // 页面脚本里既可能用 document，也可能用 window.document
  doc.els = els;
  return doc;
}

function fakeWindow(base, doc, store) {
  const win = {
    console,
    document: doc,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { pathname: '/pages/04-home-calm.html', search: '', href: '' },
    // 页面脚本里的 fetch 走真服务：假的是 DOM，不是网络
    fetch: (url, init) => fetch(url.startsWith('http') ? url : base + url, init),
    setTimeout,
    clearTimeout,
    URLSearchParams,
    addEventListener() {},
  };
  win.window = win;
  return win;
}

function loadInto(win, file) {
  const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  new Function('window', 'document', code)(win, win.document);
}

/**
 * 页面脚本在浏览器里是拿**裸全局名**用这些模块的（写的是 `MZ_UI.boot(...)`，
 * 不是 `window.MZ_UI.boot(...)`）。在 Node 里裸名会去查 Node 的全局作用域，
 * 查不到就 ReferenceError。所以把这些挂载点作为形参传进去，等价于浏览器的全局。
 *
 * 只列已存在的：漏列一个新全局，这里会直接抛 ReferenceError，不会静默。
 */
const GLOBALS = ['MZ_API', 'MZ_UI', 'MZ_FMT', 'MZ_ROUTES', 'MZ_THEME', 'MZ_SHELL'];

function loadPageScript(win, code) {
  const names = GLOBALS.filter((g) => win[g] !== undefined);
  const fn = new Function('window', 'document', ...names, code);
  fn(win, win.document, ...names.map((n) => win[n]));
}

// ---------------------------------------------------------------------------
// 已接线页面的运行时检查
// ---------------------------------------------------------------------------

const PAGES = [
  {
    file: '04-home-calm.html',
    period: '2026-09',
    // 就绪判据：列表容器不再是骨架态。成功 / 空态 / 失败都会离开骨架，
    // 所以这个条件不会把「渲染挂了」误判成「还在加载」。
    ready: { id: 'home-recent-list', notHtml: 'animate-pulse' },
    // 期望值全部来自 数据库脚本/_verify.sh 的已知基线（演示账本 2026-09）
    expect: {
      'home-greeting': /^演示用户，周[日一二三四五六]好！$/,
      'home-quota': /^\d+(?:\.\d{2})$/,
      'home-health': '节奏平稳',
      'home-pace-text': /^本月剩余 \d+ 天 · 节奏平稳$/,
      'home-used-pct': /^\d+(?:\.\d+)?%$/,
      'home-spent-total': /^已用 ¥[\d,]+\.\d{2} \/ ¥[\d,]+\.\d{2}$/,
      'home-remaining': /^剩余 ¥-?[\d,]+\.\d{2}$/,
      'card-today-amount': /^¥[\d,]+\.\d{2}$/,
      'card-today-count': /^今日已入账 \d+ 笔流水$/,
      'card-month-expense': /^¥[\d,]+\.\d{2}$/,
      'card-month-expense-sub': /^日均 ¥[\d,]+\.\d{2}$/,
      'card-month-expense-tag': /^\d+ 笔支出$/,
      'card-month-income': '+¥18,786.30',
      'card-month-income-sub': '3 笔入账',
      'card-risk-count': 0,
      'card-risk-detail': '各分类都在预算内',
    },
    lists: [
      {
        id: 'home-recent-list',
        minLen: 200,
        count: { re: /rounded-xl hover:bg-surface-container-low/g, n: 5 },
      },
      {
        id: 'home-catbudget-list',
        minLen: 200,
        // 演示账本的 2026-09 只有 3 条分类预算，且都在 75% 以下 ——
        // 首页落在「平稳态」，超支态是 08 那一页的事。
        count: { re: /flex flex-col gap-1\.5/g, n: 3 },
        contains: ['餐饮美食', '交通出行', '休闲娱乐'],
        absent: ['text-error'],
      },
    ],
  },
  {
    file: '11-record-sheet.html',
    period: '2026-09',
    // 就绪判据用穿透条的百分比、而不是分类网格：网格在 bootstrap 回来时就画好了，
    // 而穿透条要等 /budget/categories 回来才有数字。拿网格当判据会读到 mid-flight 的状态。
    ready: { id: 'penetration-pct', text: /^已用/ },
    expect: {
      'entry-label': '记录第 1 笔金额',
      'cat-title': '选择消费类目',
      // 面板刚打开时表达式是空的：显示 0，且**不能**是红色（红色只留给真的输错）
      'amount-expr': '0',
      'amount-res': '= 0.00',
      // 默认账户是 isDefault=1 的「现金」
      'acct-name': '现金',
      'acct-label': '支出账户',
      'time-name': /^(今天|昨天|\d{2}-\d{2}) \d{2}:\d{2}$/,
      // 餐饮美食 本月 1500 已用 222.5 → 14.833…% ；此笔还没输入，所以是基线值
      'penetration-pct': /^已用 \d+(?:\.\d+)?%$/,
      'queue-count': '0 笔',
      'queue-total': '¥0.00',
    },
    lists: [
      {
        id: 'cat-grid',
        minLen: 200,
        count: { re: /data-cat-id="/g, n: 10 },   // 演示账本 10 个支出分类
        contains: ['餐饮美食', '交通出行', '休闲娱乐', '人情往来'],
      },
      {
        id: 'acct-select',
        minLen: 100,
        count: { re: /<option value="/g, n: 5 },
        contains: ['现金', '信用卡'],
      },
      {
        id: 'chip-row',
        minLen: 100,
        contains: ['美团'],
      },
      {
        // 初始就是空态：面板不预置示例数据，清单里只会有本次真的写进库的笔
        id: 'queue-list',
        contains: ['本次还没有记账'],
      },
    ],
  },
  {
    file: '13-ledger-list.html',
    period: '2026-09',
    // 列表容器在 HTML 里就是空的，没有骨架可等 —— 判据是「真的出现了行」。
    ready: { id: 'txn-groups', hasHtml: 'data-id="' },
    expect: {
      // 顶部汇总来自 v_monthly_summary（与 _verify.sh 的基线一致）
      'sum-expense': /^¥[\d,]+\.\d{2}$/,
      'sum-income': '¥18,786.30',
      // 结余是负数才带 '-'，正数一律补 '+'（PRD 禁止支出标红，但收入要能一眼看出）
      'sum-net': /^[+-]?¥[\d,]+\.\d{2}$/,
      // 演示账本 2026-09 共 17 笔，默认每页 50 → 一页装得下
      'resultCount': /^\d+$/,
    },
    lists: [
      {
        id: 'txn-groups',
        minLen: 2000,
        countAtLeast: { re: /data-id="/g, n: 1 },
        // 「账户转账」是转账行的分类名（转账没有 category）；预算渗透列的三条分支
        // 都要在演示数据里现出原形：设了预算的（餐饮美食）、没设的（居家生活）、
        // 不参与预算的（收入/转账）。
        contains: ['day-group', '餐饮美食', '交通出行', '休闲娱乐', '居家生活',
          '账户转账', '未设预算', '不计入预算'],
        absent: ['animate-pulse'],
      },
      {
        // 17 笔 / 每页 50 → 只有 1 页，翻页器上应当只有「1」这一个页码按钮
        id: 'pageBtns',
        minLen: 50,
        count: { re: /data-page="[0-9]+"/g, n: 1 },
        contains: ['data-page="1"'],
      },
      {
        // 默认时间范围是「本月」，且它恒在，所以筛选条上至少要有这一个 chip
        id: 'chipRow',
        minLen: 10,
        contains: ['本月'],
      },
    ],
  },
  {
    file: '21-settings-index.html',
    period: '2026-09',
    externalScripts: ['settings-page.js'],
    checkJsonExport: true,
    ready: { id: 'settings-preferences-status', text: /已同步到服务端|通用偏好可保存/ },
    expect: {
      'settings-user-name': '演示用户',
      'settings-user-account': 'demo@mingzhang.app',
      'settings-user-uid': /^UID: .+$/,
      'settings-ledger-summary': /^创建于 \d{4}-\d{2}-\d{2} · 拥有 \d+ 条有效流水$/,
      'settings-net-worth': /^¥-?[\d,]+\.\d{2}$/,
      'settings-liquid-total': /^¥-?[\d,]+\.\d{2}$/,
      'settings-credit-used': /^¥[\d,]+\.\d{2}$/,
      'settings-preferences-status': /已同步到服务端|通用偏好可保存/,
    },
    values: {
      'settings-ledger-name': /.+/,
      'settings-language': /^(zh-CN|en-US|zh-TW)$/,
      'settings-currency': /^(CNY|USD|EUR|HKD)$/,
    },
    lists: [
      {
        id: 'settings-account-list',
        minLen: 200,
        countAtLeast: { re: /data-account-id="/g, n: 1 },
        contains: ['现金', '默认账户'],
      },
    ],
  },
];

/** 页面是否已经渲染到「可以断言」的状态 */
function isReady(spec, doc) {
  const el = doc.els.get(spec.id);
  if (!el) return false;
  if (spec.notHtml) return el.innerHTML.indexOf(spec.notHtml) === -1;
  // 容器初始就是空的页面（列表/图表）没法用 notHtml 判就绪 —— 空的时候
  // 也「不含骨架」，会立刻假就绪。这种就用「已出现真实内容」当判据。
  if (spec.hasHtml) return el.innerHTML.indexOf(spec.hasHtml) !== -1;
  if (spec.text) return spec.text.test(el.textContent);
  return true;
}

async function runtimeCheck(page, base) {
  const html = fs.readFileSync(path.join(PAGES_DIR, page.file), 'utf8');
  const misses = [];
  const doc = fakeDocument(html, misses);
  const store = new Map();
  const win = fakeWindow(base, doc, store);

  loadInto(win, 'api.js');
  loadInto(win, 'ui.js');

  // 先登录：页面脚本 boot() 的第一件事就是 requireLogin()，没 token 会直接跳走
  const session = await win.MZ_API.post('/auth/login', {
    account: 'demo@mingzhang.app',
    password: 'Demo123456',
  });
  win.MZ_API.setSession(session);
  win.location.search = '?period=' + page.period;

  const blocks = inlineScripts(html);
  check(`${page.file} · 内联脚本 ${blocks.length} 段`, blocks.length > 0);
  blocks.forEach((code) => {
    try {
      loadPageScript(win, code);
    } catch (e) {
      check(`${page.file} · 脚本装载`, false, e.message);
    }
  });
  (page.externalScripts || []).forEach((file) => loadInto(win, file));

  doc.dispatch('DOMContentLoaded');

  // 首屏要等 bootstrap（+ 页面自己那几条请求）都回来。用轮询而不是固定 sleep：
  // 固定 sleep 要么在慢机器上偶发失败，要么在快机器上白等。
  const rendered = await until(() => isReady(page.ready, doc));
  check(`${page.file} · 首屏渲染在超时前完成`, rendered);

  check(`${page.file} · 脚本没有引用不存在的 id`, misses.length === 0, misses);

  if (page.checkJsonExport) {
    const response = await win.fetch('/api/settings/export.json', {
      headers: { Authorization: `Bearer ${win.MZ_API.getToken()}` },
    });
    check(`${page.file} · JSON 数据镜像接口 → 200`, response.status === 200, response.status);
    check(`${page.file} · JSON 数据镜像作为附件下载`,
      /attachment/.test(response.headers.get('content-disposition') || ''),
      response.headers.get('content-disposition'));
    const backup = await response.json();
    eq(`${page.file} · JSON 数据镜像格式`, backup.format, 'mingzhang-json-export');
    eq(`${page.file} · JSON 数据镜像版本`, backup.version, 1);
    check(`${page.file} · JSON 数据镜像包含流水数组`, Array.isArray(backup.data?.transactions));
    check(`${page.file} · JSON 数据镜像不含密码散列`,
      JSON.stringify(backup).indexOf('password_hash') === -1);
  }

  Object.keys(page.expect).forEach((id) => {
    const el = doc.els.get(id);
    const want = page.expect[id];
    if (!el) {
      check(`${page.file} · #${id} 被页面脚本填了值`, false, '元素从未被写入');
      return;
    }
    if (want instanceof RegExp) {
      check(`${page.file} · #${id}`, want.test(el.textContent), { actual: el.textContent, want: String(want) });
    } else {
      eq(`${page.file} · #${id}`, el.textContent, want);
    }
  });

  Object.keys(page.values || {}).forEach((id) => {
    const el = doc.els.get(id);
    const want = page.values[id];
    if (!el) {
      check(`${page.file} · #${id} 被页面脚本填了 value`, false, '元素从未被写入');
      return;
    }
    check(`${page.file} · #${id}.value`, want.test(String(el.value || '')),
      { actual: el.value, want: String(want) });
  });

  (page.lists || []).forEach((spec) => {
    const el = doc.els.get(spec.id);
    if (!el) {
      check(`${page.file} · #${spec.id} 已渲染`, false, '元素从未被写入');
      return;
    }
    const h = el.innerHTML;
    check(`${page.file} · #${spec.id} 已渲染`, h.length > (spec.minLen || 1),
      { len: h.length, skeleton: h.indexOf('animate-pulse') !== -1 });
    if (spec.count) {
      eq(`${page.file} · #${spec.id} 条数`, (h.match(spec.count.re) || []).length, spec.count.n);
    }
    if (spec.countAtLeast) {
      const actual = (h.match(spec.countAtLeast.re) || []).length;
      check(`${page.file} · #${spec.id} 条数不少于 ${spec.countAtLeast.n}`,
        actual >= spec.countAtLeast.n, { actual, minimum: spec.countAtLeast.n });
    }
    (spec.contains || []).forEach((name) => {
      check(`${page.file} · #${spec.id} 含「${name}」`, h.indexOf(name) !== -1);
    });
    (spec.absent || []).forEach((name) => {
      check(`${page.file} · #${spec.id} 不含「${name}」`, h.indexOf(name) === -1);
    });
  });
}

/** 轮询直到条件成立，超时返回 false。比固定 sleep 稳，也不浪费时间。 */
async function until(predicate, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

// ---------------------------------------------------------------------------

async function main() {
  let base = '';
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${s.address().port}`;
      resolve(s);
    });
  });

  console.log('\n--- 静态：id 引用与跳转目标（全部 23 页）---');
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort();
  eq('页面文件数', files.length, 23);
  files.forEach((file) => staticCheck(file, fs.readFileSync(path.join(PAGES_DIR, file), 'utf8')));

  console.log('\n--- 运行时：已接线的页面真跑一遍 ---');
  for (const page of PAGES) {
    await runtimeCheck(page, base);
  }

  console.log(`\n==== 页面接线自检：${passed} 通过 / ${failed} 失败 ====`);

  // 有序收尾：先关连接池，再关监听并掐掉 keep-alive 连接。
  // 用 process.exit() 硬退会撞上 libuv 的 UV_HANDLE_CLOSING 断言（退出期噪音），
  // 或者让监听句柄把进程吊住 —— 走「设置 exitCode 后自然退出」这条路最干净。
  await db.close();
  server.closeAllConnections?.();
  server.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
