#!/usr/bin/env node
'use strict';

/**
 * 采集指定区间的 git 提交，输出结构化 JSON 供写周报使用。
 *
 * 为什么不让模型自己敲 git log 再肉眼解析：numstat 的输出里全是坑 —— 重命名
 * 路径会写成 `a/{old => new}/b`、二进制文件的行数是 `-`、本仓库的目录名全中文
 * 默认会被转义成八进制。每次现场解析，迟早解析错一个，而错的那条正好进了周报。
 *
 * 用法：
 *   node collect-commits.js --since "2026-09-21 00:00:00" --until "2026-09-27 23:59:59"
 *
 * 输出字段：
 *   commits[]      每个提交：hash / author / date / subject / type / scope /
 *                  files / insertions / deletions / primaryModule / modules / topFiles
 *   summary        提交数、涉及文件数、新增删除行、作者
 *   byModule       按 5 个方向聚合
 *   byDay          按天聚合
 *   byType         按 conventional commit 前缀聚合
 *   source         local / remote / none —— 提交是从哪读到的
 *   workingTree    未提交的改动（按模块分组），用于「本周无提交」时兜底
 *   lastCommit     全仓库最近一次提交，用于空周报的参照
 */

const { execFileSync } = require('node:child_process');

const RS = '\x1e'; // 记录分隔符
const FS = '\x1f'; // 字段分隔符

// 按改动文件路径归类。本仓库是多角色单仓，路径比 commit message 更能说明
// 「这周的时间花在哪个方向上」。顺序即优先级，先匹配先归属。
const MODULES = [
  { key: 'PRD', label: '需求与设计 · PRD', test: (p) => p.startsWith('PRD/') },
  { key: 'UI', label: '需求与设计 · UI 原型', test: (p) => p.startsWith('UI原型') },
  { key: 'frontend', label: '前端开发', test: (p) => p.startsWith('前端代码') },
  { key: 'admin', label: '后台管理系统（运营端）', test: (p) => p.startsWith('后台管理系统') },
  { key: 'backend', label: '后端服务（Java）', test: (p) => p.startsWith('后端代码') },
  { key: 'database', label: '数据库', test: (p) => p.startsWith('数据库脚本') },
  { key: 'docs', label: '其他', test: () => true },
];

// 不算「工作产出」的路径段。按**路径段**匹配而非前缀，因为这些东西可能出现在
// 任意层级（本仓库的 npm 缓存就埋在 后台管理系统/backend/.npm-cache/ 下）。
//   周报汇总    输出目录，统计进去会自我循环
//   .claude     工具配置（本 skill 的脚本就住这儿），不是项目成果
//   node_modules / .npm-cache / .git   依赖与缓存，动辄数百条，会把真实改动淹掉
const EXCLUDED_SEGMENTS = new Set([
  '周报汇总',
  '.claude',
  'node_modules',
  '.npm-cache',
  '.git',
]);

// 未跟踪文件的展开上限。仓库若漏配 .gitignore，node_modules 会被展开成几万条，
// 这些内容既无用又会挤爆下游的上下文。超限就截断并在 note 里说明。
const MAX_UNTRACKED = 5000;

const MODULE_LABEL = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

// ---------------------------------------------------------------- 参数

const argv = process.argv.slice(2);

function argValue(name) {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return null;
}

const since = argValue('since');
const until = argValue('until');
const remoteBranch = argValue('remote') || 'origin/main';

if (!since || !until) {
  console.error(
    '缺少参数。用法：\n' +
      '  node collect-commits.js --since "2026-09-21 00:00:00" --until "2026-09-27 23:59:59"'
  );
  process.exit(1);
}

// ---------------------------------------------------------------- git

// core.quotepath=false 是关键：否则中文目录名会被转义成 \345\211\215...
// 那样 MODULES 里的前缀一条都匹配不上，所有提交都会掉进「其他」。
function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFail) return null;
    const detail = (err.stderr || err.message || '').toString().trim();
    console.error(`git ${args.join(' ')} 执行失败：${detail}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 路径与归类

/** `dir/{old => new}/f` → `dir/new/f`；`old.md => new.md` → `new.md` */
function normalizeRename(p) {
  if (!p.includes(' => ')) return p;
  const expanded = p.replace(/\{([^{}]*?) => ([^{}]*?)\}/g, (_, __, to) => to);
  return expanded.replace(/^.*? => /, '');
}

function isExcluded(p) {
  return String(p)
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function classify(rawPath) {
  const p = normalizeRename(String(rawPath).replace(/\\/g, '/'));
  const hit = MODULES.find((m) => m.test(p));
  return hit ? hit.key : 'docs';
}

/** `feat(scope)!: subject` → { type:'feat', scope:'scope' } */
function parseSubject(subject) {
  const m = String(subject || '').match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.*)$/);
  if (!m) return { type: null, scope: null, text: String(subject || '').trim() };
  return { type: m[1].toLowerCase(), scope: m[2] || null, text: m[3].trim() };
}

// ---------------------------------------------------------------- 解析 git log

const LOG_FORMAT = `%x1e%H${FS}%h${FS}%an${FS}%ae${FS}%ad${FS}%s${FS}%b`;

function parseLog(raw) {
  const NUMSTAT = /^(\d+|-)\t(\d+|-)\t/;
  const records = raw.split(RS).filter((r) => r.trim());

  return records.map((rec) => {
    const parts = rec.split(FS);
    const [hash, short, author, email, date, subject] = parts;
    const tail = (parts[6] || '').split('\n');

    const numstatLines = tail.filter((l) => NUMSTAT.test(l));
    const body = tail
      .filter((l) => l.trim() && !NUMSTAT.test(l))
      .join('\n')
      .trim();

    let files = 0;
    let insertions = 0;
    let deletions = 0;
    const moduleCount = {};
    const topFiles = [];

    for (const line of numstatLines) {
      const cells = line.split('\t');
      const ins = cells[0];
      const del = cells[1];
      const filePath = cells.slice(2).join('\t');
      if (!filePath || isExcluded(filePath)) continue;

      files += 1;
      if (ins !== '-') insertions += Number(ins);
      if (del !== '-') deletions += Number(del);

      const key = classify(filePath);
      moduleCount[key] = (moduleCount[key] || 0) + 1;

      if (topFiles.length < 15) topFiles.push(normalizeRename(filePath));
    }

    // 改动文件最多的方向即主方向；并列时按 MODULES 顺序取先者，保证结果稳定。
    let primaryModule = null;
    let best = -1;
    for (const m of MODULES) {
      const n = moduleCount[m.key] || 0;
      if (n > best) {
        best = n;
        primaryModule = m.key;
      }
    }

    const parsed = parseSubject(subject);

    return {
      hash: (hash || '').trim(),
      short: (short || '').trim(),
      author: (author || '').trim(),
      email: (email || '').trim(),
      date: (date || '').trim(),
      day: (date || '').trim().slice(0, 10),
      subject: (subject || '').trim(),
      body,
      type: parsed.type,
      scope: parsed.scope,
      text: parsed.text,
      files,
      insertions,
      deletions,
      primaryModule,
      primaryLabel: MODULE_LABEL[primaryModule] || '其他',
      modules: moduleCount,
      topFiles,
    };
  });
}

function logInRange(rangeArgs) {
  const args = [
    'log',
    ...rangeArgs,
    `--since=${since}`,
    `--until=${until}`,
    `--date=format:%Y-%m-%d %H:%M:%S`,
    '--no-merges',
    `--pretty=format:${LOG_FORMAT}`,
    '--numstat',
  ];
  const raw = git(args, { allowFail: true });
  return raw ? parseLog(raw) : [];
}

// ---------------------------------------------------------------- 聚合

function aggregate(commits) {
  const byModule = {};
  const byDay = {};
  const byType = {};

  for (const c of commits) {
    const mod = byModule[c.primaryModule] || (byModule[c.primaryModule] = {
      key: c.primaryModule,
      label: c.primaryLabel,
      commits: 0,
      files: 0,
      insertions: 0,
      deletions: 0,
    });
    mod.commits += 1;
    mod.files += c.files;
    mod.insertions += c.insertions;
    mod.deletions += c.deletions;

    const day = byDay[c.day] || (byDay[c.day] = { date: c.day, commits: 0, subjects: [] });
    day.commits += 1;
    if (day.subjects.length < 10) day.subjects.push(c.subject);

    const type = c.type || 'other';
    byType[type] = (byType[type] || 0) + 1;
  }

  const summary = {
    commitCount: commits.length,
    files: commits.reduce((a, c) => a + c.files, 0),
    insertions: commits.reduce((a, c) => a + c.insertions, 0),
    deletions: commits.reduce((a, c) => a + c.deletions, 0),
    authors: [...new Set(commits.map((c) => c.author))].filter(Boolean),
  };

  return { byModule, byDay, byType, summary };
}

// ---------------------------------------------------------------- 未提交改动

/**
 * 本周没有提交时，工作区里往往正躺着这一周真正在写的东西（本仓库就是这样：
 * 只有一个「初始化存档」提交，其余全是未提交的改动）。把这块带出来，
 * 周报才不至于交一张白纸。行数只统计已跟踪文件，未跟踪目录无法算行数。
 */
function readWorkingTree() {
  // -uall 让未跟踪的目录展开成逐个文件。默认模式下 git 把整个目录折叠成一条
  // （本仓库会从 600+ 条塌成 80 多条），周报里的"改了多少文件"就完全不准了。
  const porcelain = git(['status', '--porcelain', '-uall'], { allowFail: true });
  if (porcelain === null) return null;
  if (!porcelain.trim()) return { clean: true, totalFiles: 0, modules: [] };

  const entries = [];
  let truncated = false;
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue;
    if (entries.length >= MAX_UNTRACKED) {
      truncated = true;
      break;
    }
    const code = line.slice(0, 2).trim();
    let p = line.slice(3).trim();
    if (p.includes(' -> ')) p = p.split(' -> ').pop();
    if (isExcluded(p)) continue;
    entries.push({ code, path: p.replace(/"/g, '') });
  }

  // 已跟踪文件的行数增减（含暂存区）。
  const lineCount = {};
  for (const args of [['diff', '--numstat'], ['diff', '--cached', '--numstat']]) {
    const raw = git(args, { allowFail: true });
    if (!raw) continue;
    for (const line of raw.split('\n')) {
      const cells = line.split('\t');
      if (cells.length < 3) continue;
      const filePath = normalizeRename(cells.slice(2).join('\t'));
      const cur = lineCount[filePath] || (lineCount[filePath] = { insertions: 0, deletions: 0 });
      if (cells[0] !== '-') cur.insertions += Number(cells[0]);
      if (cells[1] !== '-') cur.deletions += Number(cells[1]);
    }
  }

  const modules = {};
  for (const e of entries) {
    const key = classify(e.path);
    const mod = modules[key] || (modules[key] = {
      key,
      label: MODULE_LABEL[key],
      files: 0,
      insertions: 0,
      deletions: 0,
      samplePaths: [],
    });
    mod.files += 1;
    const lc = lineCount[e.path];
    if (lc) {
      mod.insertions += lc.insertions;
      mod.deletions += lc.deletions;
    }
    if (mod.samplePaths.length < 12) mod.samplePaths.push(e.path);
  }

  const byCode = {};
  for (const e of entries) byCode[e.code] = (byCode[e.code] || 0) + 1;

  return {
    clean: false,
    totalFiles: entries.length,
    truncated,
    byCode,
    modules: Object.values(modules).sort((a, b) => b.files - a.files),
  };
}

// ---------------------------------------------------------------- 最近一次提交

function readLastCommit() {
  const raw = git(
    ['log', '-1', '--date=format:%Y-%m-%d %H:%M:%S', `--pretty=format:%h${FS}%ad${FS}%s`],
    { allowFail: true }
  );
  if (!raw || !raw.trim()) return null;
  const [short, date, subject] = raw.split(FS);
  return { short, date, subject };
}

// ---------------------------------------------------------------- 主流程

const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }) || 'HEAD').trim();
let commits = logInRange([]);
let source = commits.length > 0 ? 'local' : 'none';
let note = null;

// 本地这一周没提交，不代表远端没有（可能别人提交了、也可能本地没 fetch 过）。
if (commits.length === 0) {
  const fetched = git(['fetch', '--quiet', 'origin'], { allowFail: true });
  if (fetched === null) {
    note = '本地本周无提交；尝试 git fetch 失败（可能无网络或无权限），未统计远端。';
  } else {
    commits = logInRange([remoteBranch]);
    if (commits.length > 0) {
      source = 'remote';
      note = `本地本周无提交，以下是远端 ${remoteBranch} 上本周的提交。`;
    } else {
      note = `本地与远端 ${remoteBranch} 本周均无提交。`;
    }
  }
}

const agg = aggregate(commits);

process.stdout.write(
  JSON.stringify(
    {
      range: { since, until },
      repo: { branch, remote: remoteBranch },
      source,
      note,
      commits,
      ...agg,
      workingTree: readWorkingTree(),
      lastCommit: readLastCommit(),
      moduleLabels: MODULE_LABEL,
    },
    null,
    2
  ) + '\n'
);
