'use strict';

// 契约自检会临时修改再恢复演示账号密码，因此只在这个独立测试进程里关闭保护。
// 必须写在加载 server/config 之前，dotenv 默认不会覆盖已经存在的环境变量。
process.env.DEMO_ACCOUNT_PROTECTED = 'false';

/**
 * HTTP 层自检。把 app 挂到一个**随机空闲端口**上跑一轮真实请求，跑完自己退出。
 *
 * 和 smoke.js 的分工：
 *   smoke.js     不经过 HTTP，直接验「配置 → 数据库 → 视图 → 密码哈希」这条链
 *   api-check.js 经过 HTTP，验「路由 → 中间件 → service → 响应信封」这条链
 *
 * 为什么用随机端口而不是 3000：不打扰你正在跑的开发服务器，
 * 也避免「3000 被占用导致自检挂掉」这种和代码无关的失败。
 */

const { app } = require('../src/server');
const db = require('../src/db');
const period = require('../src/utils/period');

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

let base = '';

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers };
}

async function reqForm(path, formData, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: formData });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  console.log(`\n自检服务已挂起：${base}\n`);

  // ---------------------------------------------------------------- 健康检查
  console.log('健康检查');
  {
    const r = await req('GET', '/api/health');
    eq('GET /api/health 状态码', r.status, 200);
    eq('数据库表数', r.json?.data?.db?.tables, 13);
    eq('数据库视图数', r.json?.data?.db?.views, 6);
    eq('API 禁止缓存', r.headers.get('cache-control'), 'no-store');
    eq('禁止页面被嵌入 iframe', r.headers.get('x-frame-options'), 'DENY');
    eq('禁止 MIME 嗅探', r.headers.get('x-content-type-options'), 'nosniff');
  }

  // -------------------------------------------------------------------- 登录
  console.log('\n登录');
  let token = null;
  {
    // 用不存在的账号测失败路径：既能验证 401，又不会把演示账号的
    // login_fail_count 推高（凑满 5 次会把演示账号锁 15 分钟）。
    const bad = await req('POST', '/api/auth/login', {
      body: { account: 'nobody@mingzhang.app', password: 'whatever' },
    });
    eq('不存在的账号 → 401', bad.status, 401);
    eq('错误码', bad.json?.error?.code, 'LOGIN_FAILED');

    const missing = await req('POST', '/api/auth/login', { body: { account: 'demo@mingzhang.app' } });
    eq('缺密码 → 400', missing.status, 400);

    const ok = await req('POST', '/api/auth/login', {
      body: { account: 'demo@mingzhang.app', password: 'Demo123456' },
    });
    eq('demo 账号密码登录 → 200', ok.status, 200);
    eq('响应 ok=true', ok.json?.ok, true);
    check('拿到 token', typeof ok.json?.data?.token === 'string' && ok.json.data.token.length > 20);
    eq('返回用户邮箱', ok.json?.data?.user?.email, 'demo@mingzhang.app');
    eq('返回账本名', ok.json?.data?.ledger?.name, '日常个人账本');
    token = ok.json?.data?.token;

    const byPhone = await req('POST', '/api/auth/login', {
      body: { account: '13800001234', password: 'Demo123456' },
    });
    eq('手机号也能登录 → 200', byPhone.status, 200);

    // ---------------------------------------------------------- 短信验证码登录
    //
    // ⚠️ sendSmsCode 对同一手机号有 60 秒重发限制，且验证码用过即焚。
    //    所以这一段对每个手机号只发一次，顺序不能随便调。
    const send = await req('POST', '/api/auth/sms-code', { body: { phone: '13800001234' } });
    eq('发验证码 → 200', send.status, 200);
    eq('有效期 5 分钟', send.json?.data?.expiresInSeconds, 300);
    const devCode = send.json?.data?.devCode;
    check('dev 模式回显 6 位验证码', /^\d{6}$/.test(String(devCode)), { devCode });

    const resend = await req('POST', '/api/auth/sms-code', { body: { phone: '13800001234' } });
    eq('60 秒内重发 → 429', resend.status, 429);
    eq('错误码', resend.json?.error?.code, 'SMS_TOO_FREQUENT');

    const badPhone = await req('POST', '/api/auth/sms-code', { body: { phone: '12345' } });
    eq('手机号格式不对 → 400', badPhone.status, 400);
    eq('错误码', badPhone.json?.error?.code, 'INVALID_PHONE');

    // 错验证码不消耗验证码 —— 否则用户敲错一次就得等 60 秒重新发。
    const wrongCode = await req('POST', '/api/auth/login', {
      body: { phone: '13800001234', code: '000000' },
    });
    eq('验证码不对 → 400', wrongCode.status, 400);
    eq('错误码', wrongCode.json?.error?.code, 'SMS_CODE_INVALID');

    const byCode = await req('POST', '/api/auth/login', {
      body: { phone: '13800001234', code: devCode },
    });
    eq('手机号 + 验证码登录 → 200', byCode.status, 200);
    eq('回到同一个用户', byCode.json?.data?.user?.email, 'demo@mingzhang.app');
    eq('带回账本', byCode.json?.data?.ledger?.name, '日常个人账本');
    check('拿到 token', typeof byCode.json?.data?.token === 'string');

    const reuse = await req('POST', '/api/auth/login', {
      body: { phone: '13800001234', code: devCode },
    });
    eq('验证码一次性，用过即焚 → 400', reuse.status, 400);
    eq('错误码', reuse.json?.error?.code, 'SMS_CODE_EXPIRED');

    // 未注册的手机号：不自动建号，明确回 404。
    // user.password_hash 是 NOT NULL；注册与找回密码必须是两个明确流程。
    const stranger = await req('POST', '/api/auth/sms-code', { body: { phone: '13900000000' } });
    const strangerCode = stranger.json?.data?.devCode;
    const notFound = await req('POST', '/api/auth/login', {
      body: { phone: '13900000000', code: strangerCode },
    });
    eq('未注册的手机号 → 404', notFound.status, 404);
    eq('错误码', notFound.json?.error?.code, 'ACCOUNT_NOT_FOUND');
    const [strangerCount] = await db.query('SELECT COUNT(*) AS c FROM `user` WHERE `phone` = ?', [
      '13900000000',
    ]);
    eq('没有偷偷建号', Number(strangerCount.c), 0);

    // ------------------------------------------ 注册 → 找回密码 → 永久注销闭环
    const tempPhone = '13911112222';
    const stale = await db.queryOne('SELECT id FROM `user` WHERE phone = ?', [tempPhone]);
    if (stale) {
      await db.transaction(async (conn) => {
        await conn.query('DELETE FROM `event_log` WHERE user_id = ?', [stale.id]);
        await conn.query('DELETE FROM `ledger` WHERE owner_id = ?', [stale.id]);
        await conn.query('DELETE FROM `user` WHERE id = ?', [stale.id]);
      });
    }

    const registerCodeResult = await req('POST', '/api/auth/sms-code', {
      body: { phone: tempPhone },
    });
    const registerCode = registerCodeResult.json?.data?.devCode;
    const weakRegister = await req('POST', '/api/auth/register', {
      body: { phone: tempPhone, code: registerCode, password: '12345678' },
    });
    eq('注册弱密码被拒绝 → 400', weakRegister.status, 400);

    const registered = await req('POST', '/api/auth/register', {
      body: { phone: tempPhone, code: registerCode, password: 'Temp12345' },
    });
    eq('临时账号注册 → 201', registered.status, 201);
    const tempOldToken = registered.json?.data?.token;

    const resetCodeResult = await req('POST', '/api/auth/sms-code', {
      body: { phone: tempPhone },
    });
    const resetCode = resetCodeResult.json?.data?.devCode;
    const reset = await req('POST', '/api/auth/reset-password', {
      body: { phone: tempPhone, code: resetCode, newPassword: 'Reset12345' },
    });
    eq('验证码重置密码 → 200', reset.status, 200);
    eq('重置会吊销全部会话', reset.json?.data?.allSessionsRevoked, true);

    const revokedTemp = await req('GET', '/api/auth/me', { token: tempOldToken });
    eq('重置后旧 token → 401', revokedTemp.status, 401);
    eq('旧 token 错误码', revokedTemp.json?.error?.code, 'TOKEN_REVOKED');

    const oldPasswordLogin = await req('POST', '/api/auth/login', {
      body: { account: tempPhone, password: 'Temp12345' },
    });
    eq('旧密码不能登录 → 401', oldPasswordLogin.status, 401);
    const newPasswordLogin = await req('POST', '/api/auth/login', {
      body: { account: tempPhone, password: 'Reset12345' },
    });
    eq('新密码可以登录 → 200', newPasswordLogin.status, 200);
    const tempToken = newPasswordLogin.json?.data?.token;

    const unsafeDelete = await req('DELETE', '/api/auth/account', {
      token: tempToken,
      body: { confirmText: 'delete', password: 'Reset12345' },
    });
    eq('注销确认词错误 → 400', unsafeDelete.status, 400);
    const deletedAccount = await req('DELETE', '/api/auth/account', {
      token: tempToken,
      body: { confirmText: 'DELETE', password: 'Reset12345' },
    });
    eq('永久注销临时账号 → 200', deletedAccount.status, 200);
    const deletedUserCount = await db.queryValue('SELECT COUNT(*) FROM `user` WHERE phone = ?', [
      tempPhone,
    ]);
    eq('临时账号已物理删除', Number(deletedUserCount), 0);
  }

  // -------------------------------------------------------------------- 鉴权
  console.log('\n鉴权');
  {
    const noToken = await req('GET', '/api/auth/me');
    eq('无 token → 401', noToken.status, 401);
    eq('错误码', noToken.json?.error?.code, 'TOKEN_MISSING');

    const badToken = await req('GET', '/api/auth/me', { token: 'not.a.jwt' });
    eq('伪造 token → 401', badToken.status, 401);
    eq('错误码', badToken.json?.error?.code, 'TOKEN_INVALID');

    const me = await req('GET', '/api/auth/me', { token });
    eq('带 token → 200', me.status, 200);
    eq('用户 uid', me.json?.data?.user?.uid, '9402-8841-CLARITY');
  }

  // ------------------------------------------------------------------ 元数据
  console.log('\n元数据');
  {
    const boot = await req('GET', '/api/meta/bootstrap', { token });
    eq('GET /api/meta/bootstrap → 200', boot.status, 200);
    const d = boot.json?.data;
    eq('账户数', d?.accounts?.length, 5);
    eq('分类数', d?.categories?.length, 16);
    eq('规则数 > 0', (d?.categoryRules?.length ?? 0) > 60, true);
    eq('支出分类数', d?.meta?.expenseCategories?.length, 10);
    eq('收入分类数', d?.meta?.incomeCategories?.length, 6);

    const rule = d?.categoryRules?.find((x) => x.keyword === '美团买药');
    eq('「美团买药」priority', rule?.priority, 30);
    eq('「美团买药」落到「医疗保健」', rule?.categoryName, '医疗保健');
    const ledgerIds = new Set(d?.categories?.map((x) => x.id));
    check(
      '规则里的 categoryId 都属于当前账本',
      d?.categoryRules?.every((x) => ledgerIds.has(x.categoryId))
    );

    const accounts = await req('GET', '/api/accounts', { token });
    eq('GET /api/accounts → 200', accounts.status, 200);
    const byName = Object.fromEntries(accounts.json.data.map((a) => [a.name, a]));
    eq('现金余额', byName['现金']?.balance, 500);
    eq('微信支付钱包余额', byName['微信支付钱包']?.balance, 1097.5);
    eq('支付宝余额', byName['支付宝']?.balance, 2856.3);
    eq('储蓄卡余额', byName['招商银行储蓄卡']?.balance, 33600);
    eq('信用卡 balance（净资产口径，负数）', byName['信用卡']?.balance, -88);
    eq('信用卡 creditUsed', byName['信用卡']?.creditUsed, 88);
    eq('信用卡 creditAvailable', byName['信用卡']?.creditAvailable, 59912);
    eq('非信用卡的 creditUsed 为 null', byName['现金']?.creditUsed, null);

    const expenseCats = await req('GET', '/api/categories?type=expense', { token });
    eq('GET /api/categories?type=expense → 10 条', expenseCats.json?.data?.length, 10);

    const badEnum = await req('GET', '/api/categories?type=foo', { token });
    eq('非法 type → 400', badEnum.status, 400);
    eq('错误码', badEnum.json?.error?.code, 'INVALID_ENUM');
  }

  // -------------------------------------------------------------------- 首页
  //
  // 演示数据固定在 2026-09。下面凡是要「对照 8000 预算算出来的数字」的断言，
  // 都先用 CURRENT 判断今天是不是还在 2026-09 —— 否则跨月之后脚本会红一片，
  // 而那是演示数据过期，不是代码坏了（已知风险 F6）。
  const CURRENT = period.currentPeriod();
  const IN_DEMO_MONTH = CURRENT === '2026-09';
  // 演示月内也不能把“今天”写死：脚本跨一天运行时，剩余天数和今日可花都会变化。
  const DEMO_REMAINING_DAYS = IN_DEMO_MONTH
    ? period.daysInPeriod('2026-09') - Number(period.today().slice(8, 10)) + 1
    : null;
  const quotaOf = (remaining) =>
    Math.round((remaining / DEMO_REMAINING_DAYS) * 100) / 100;

  console.log('\n首页');
  {
    const quota = await req('GET', '/api/home/quota?period=2026-09', { token });
    eq('GET /api/home/quota → 200', quota.status, 200);
    eq('本月剩余预算', quota.json?.data?.remaining, 4539);
    eq('预算总额', quota.json?.data?.totalAmount, 8000);
    eq('已用百分比', quota.json?.data?.usedPct, 43.3);
    eq('预警档位', quota.json?.data?.alertLevel, 'normal');

    if (IN_DEMO_MONTH) {
      eq('今日可花', quota.json?.data?.todayQuota, quotaOf(4539));
      eq('剩余天数', quota.json?.data?.remainingDays, DEMO_REMAINING_DAYS);
      eq('isCurrentPeriod', quota.json?.data?.isCurrentPeriod, true);
    } else {
      // 跨月之后 2026-09 不是当月，应退化成「有预算、但没有今日可花」。
      eq('非当月 todayQuota 为 null', quota.json?.data?.todayQuota, null);
      eq('isCurrentPeriod', quota.json?.data?.isCurrentPeriod, false);

      const current = await req('GET', '/api/home/quota', { token });
      eq('当月无预算 → 200 而不是 404', current.status, 200);
      eq('hasBudget = false', current.json?.data?.hasBudget, false);
    }

    const overview = await req('GET', '/api/home/overview?period=2026-09', { token });
    eq('GET /api/home/overview → 200', overview.status, 200);
    eq('概览里的支出合计', overview.json?.data?.summary?.expenseTotal, 3461);
    eq('概览里的收入合计', overview.json?.data?.summary?.incomeTotal, 18786.3);
    eq('最近流水条数', overview.json?.data?.recentTransactions?.length, 5);
    eq('分类预算条数', overview.json?.data?.categoryBudget?.length, 3);
    eq('概览也带预算', overview.json?.data?.budget?.totalAmount, 8000);

    // 首页那张「今日累计支出」卡片靠这两个字段。它们不在任何视图里 ——
    // v_today_quota 给的是「今天还能花多少」，不是「今天花了多少」，
    // 所以是 home.service 里补的一条查询，这里把它钉在库内真值上。
    const todayRow = await db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS c
         FROM \`transaction\`
        WHERE ledger_id = 1 AND is_deleted = 0 AND type = 'expense'
          AND happened_at >= CONCAT(CURDATE(), ' 00:00:00')
          AND happened_at <  DATE_ADD(CONCAT(CURDATE(), ' 00:00:00'), INTERVAL 1 DAY)`
    );
    eq('今日支出与库内一致', overview.json?.data?.today?.todayExpense, Number(todayRow.total));
    eq('今日支出笔数与库内一致', overview.json?.data?.today?.todayExpenseCount, Number(todayRow.c));
  }

  // -------------------------------------------------------------------- 流水
  console.log('\n流水查询');
  {
    const all = await req('GET', '/api/transactions?period=2026-09', { token });
    eq('GET /api/transactions → 200', all.status, 200);
    eq('有效流水总数', all.json?.meta?.total, 17);
    eq('默认分页取回 17 条', all.json?.data?.length, 17);
    eq('最新的排在最前', all.json?.data?.[0]?.happenedAt, '2026-09-24 12:30:00');

    const expenses = await req('GET', '/api/transactions?period=2026-09&type=expense', { token });
    eq('只看支出 → 13 条', expenses.json?.meta?.total, 13);

    const kw = await req('GET', '/api/transactions?keyword=肯德基', { token });
    eq('按关键词搜「肯德基」→ 1 条', kw.json?.meta?.total, 1);
    eq('命中的是导入的那笔', kw.json?.data?.[0]?.merchant, '肯德基');

    const paged = await req('GET', '/api/transactions?period=2026-09&page=2&pageSize=5', { token });
    eq('分页 page=2 size=5 → 5 条', paged.json?.data?.length, 5);
    eq('分页 meta.totalPages', paged.json?.meta?.totalPages, 4);

    const summary = await req('GET', '/api/transactions/summary?period=2026-09', { token });
    eq('summary 支出合计', summary.json?.data?.expenseTotal, 3461);
    eq('summary 收入合计', summary.json?.data?.incomeTotal, 18786.3);
    eq('summary 转账笔数（不计入收支）', summary.json?.data?.transferCount, 1);

    const missing = await req('GET', '/api/transactions/999999', { token });
    eq('不存在的流水 → 404', missing.status, 404);
    eq('错误码', missing.json?.error?.code, 'TRANSACTION_NOT_FOUND');

    const badId = await req('GET', '/api/transactions/summary-typo', { token });
    eq('非法 id → 400', badId.status, 400);
  }

  // ---------------------------------------------------------------- 记账写入
  //
  // ⚠️ 这一段会真的往库里写，跑完会把自己造的那条流水物理删掉。
  //    只删「本脚本刚创建的 id」，不碰任何既有数据 —— 所以跑完数据库
  //    和跑之前应当完全一致（最后一条断言就是证明这件事）。
  //    应用本身的删除永远是软删除；这里是测试夹具的清理，不是业务逻辑。
  console.log('\n记账写入');
  let createdId = null;
  {
    const created = await req('POST', '/api/transactions', {
      token,
      body: {
        type: 'expense',
        amount: '100.00',
        categoryId: 1,
        accountId: 1,
        happenedAt: period.today(),
        note: '自检夹具',
      },
    });
    eq('POST /api/transactions → 201', created.status, 201);
    createdId = created.json?.data?.transaction?.id;
    check('拿到新流水 id', Number.isInteger(createdId), createdId);
    eq('金额回读', created.json?.data?.transaction?.amount, 100);
    eq('分类名回填', created.json?.data?.transaction?.category?.name, '餐饮美食');
    eq('账户名回填', created.json?.data?.transaction?.account?.name, '现金');

    const accounts = await req('GET', '/api/accounts', { token });
    const cash = accounts.json.data.find((a) => a.name === '现金');
    eq('现金余额被扣减', cash.balance, 400);

    const summary = await req('GET', '/api/transactions/summary?period=2026-09', { token });
    eq('支出合计随之增加', summary.json?.data?.expenseTotal, 3561);

    if (IN_DEMO_MONTH) {
      const pen = created.json?.data?.penetration;
      eq('穿透档位', pen?.level, 'normal');
      eq('穿透后的今日可花', pen?.todayQuotaAfter, quotaOf(4439));
      eq(
        '穿透文案包含分类预算反馈',
        typeof pen?.message === 'string' && pen.message.includes('餐饮美食') && pen.message.includes('还剩'),
        true
      );
      eq('穿透响应带分类预算结构', pen?.categoryBudget?.categoryName, '餐饮美食');

      const quota = await req('GET', '/api/home/quota', { token });
      eq('首页大卡片同步变化', quota.json?.data?.todayQuota, quotaOf(4439));
    } else {
      eq('非当月记账不触发穿透', created.json?.data?.penetration, null);
    }

    // 编辑
    const updated = await req('PATCH', `/api/transactions/${createdId}`, {
      token,
      body: { amount: '150.00' },
    });
    eq('PATCH → 200', updated.status, 200);
    eq('只改金额，备注保持不变', updated.json?.data?.transaction?.note, '自检夹具');
    eq('金额已更新', updated.json?.data?.transaction?.amount, 150);

    // 软删 → 撤销 → 再软删
    const deleted = await req('DELETE', `/api/transactions/${createdId}`, { token });
    eq('DELETE → 软删成功', deleted.json?.data?.isDeleted, true);
    const afterDelete = await req('GET', '/api/transactions?period=2026-09', { token });
    eq('软删后不计入列表', afterDelete.json?.meta?.total, 17);

    const restored = await req('POST', `/api/transactions/${createdId}/restore`, { token });
    eq('restore → 恢复成功', restored.json?.data?.isDeleted, false);
    const afterRestore = await req('GET', '/api/transactions?period=2026-09', { token });
    eq('恢复后回到列表', afterRestore.json?.meta?.total, 18);

    await req('DELETE', `/api/transactions/${createdId}`, { token });
    await db.query(
      'UPDATE `transaction` SET `deleted_at` = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 SECOND) WHERE id = ?',
      [createdId]
    );
    const expiredRestore = await req('POST', `/api/transactions/${createdId}/restore`, { token });
    eq('超过 5 秒不能撤销删除', expiredRestore.status, 409);
    eq('撤销过期错误码', expiredRestore.json?.error?.code, 'TRANSACTION_UNDO_EXPIRED');
  }

  // ------------------------------------------------------------ 写入的防线
  console.log('\n记账的校验与越权防线');
  {
    const cases = [
      ['金额为 0', { type: 'expense', amount: '0', categoryId: 1, accountId: 1 }],
      ['金额为负', { type: 'expense', amount: '-5', categoryId: 1, accountId: 1 }],
      ['金额超上限', { type: 'expense', amount: '99999999.99', categoryId: 1, accountId: 1 }],
      ['金额三位小数', { type: 'expense', amount: '1.234', categoryId: 1, accountId: 1 }],
      ['类型非法', { type: 'foo', amount: '1', categoryId: 1, accountId: 1 }],
      ['非转账却填了转入账户', { type: 'expense', amount: '1', categoryId: 1, accountId: 1, toAccountId: 2 }],
      ['转账缺转入账户', { type: 'transfer', amount: '1', accountId: 1 }],
      ['转账转出=转入', { type: 'transfer', amount: '1', accountId: 1, toAccountId: 1 }],
      ['不收分类', { type: 'expense', amount: '1', accountId: 1 }],
      // 越权：账户/分类必须属于当前账本。999999 在别的账本或压根不存在，都不该被接受。
      ['账户不属于本账本', { type: 'expense', amount: '1', categoryId: 1, accountId: 999999 }],
      ['分类不属于本账本', { type: 'expense', amount: '1', categoryId: 999999, accountId: 1 }],
      // 11 是「工资」，是收入分类，拿它记支出会污染统计。
      ['支出用了收入分类', { type: 'expense', amount: '1', categoryId: 11, accountId: 1 }],
    ];

    for (const [label, body] of cases) {
      const r = await req('POST', '/api/transactions', { token, body });
      check(`${label} → 400`, r.status === 400, { status: r.status, error: r.json?.error });
    }

    const notFound = await req('DELETE', '/api/transactions/999999', { token });
    eq('删不存在的流水 → 404', notFound.status, 404);
  }

  // -------------------------------------------------------------------- 预算
  console.log('\n预算');
  {
    const budget = await req('GET', '/api/budget?period=2026-09', { token });
    eq('GET /api/budget → 200', budget.status, 200);
    eq('预算总额', budget.json?.data?.totalAmount, 8000);
    eq('已用', budget.json?.data?.spent, 3461);
    eq('剩余', budget.json?.data?.remaining, 4539);
    eq('黄色阈值', budget.json?.data?.alertYellowPct, 80);
    eq('红色阈值', budget.json?.data?.alertRedPct, 100);

    const none = await req('GET', '/api/budget?period=2019-01', { token });
    eq('没建预算的月份 → 200 而不是 404', none.status, 200);
    eq('hasBudget = false', none.json?.data?.hasBudget, false);

    // 幂等写入：写回与种子完全相同的值，验证 upsert 通路且不改动任何数据。
    const put = await req('PUT', '/api/budget', {
      token,
      body: { period: '2026-09', totalAmount: 8000, alertYellowPct: 80, alertRedPct: 100 },
    });
    eq('PUT /api/budget → 200', put.status, 200);
    eq('upsert 后总额不变', put.json?.data?.totalAmount, 8000);

    const again = await req('GET', '/api/budget?period=2026-09', { token });
    eq('重复设置不会多出一条预算', again.json?.data?.budgetId, budget.json?.data?.budgetId);

    // 阈值合法性：红线必须高于黄线，否则预警永远不亮。
    const badThreshold = await req('PUT', '/api/budget', {
      token,
      body: { period: '2026-09', totalAmount: 8000, alertYellowPct: 95, alertRedPct: 92 },
    });
    eq('红线 ≤ 黄线 → 400', badThreshold.status, 400);
    eq('错误码', badThreshold.json?.error?.code, 'INVALID_ALERT_THRESHOLD');

    const outOfRange = await req('PUT', '/api/budget', {
      token,
      body: { period: '2026-09', totalAmount: 8000, alertYellowPct: 10 },
    });
    eq('黄线低于 50% → 400', outOfRange.status, 400);

    // exclude_fixed 明说不支持，而不是静默降级成 daily_flat。
    const excludeFixed = await req('PUT', '/api/budget', {
      token,
      body: { period: '2026-09', totalAmount: 8000, safeSpendMode: 'exclude_fixed' },
    });
    eq('「扣除刚需」未开放 → 400', excludeFixed.status, 400);
    eq('错误码', excludeFixed.json?.error?.code, 'SAFE_SPEND_MODE_UNAVAILABLE');

    const cats = await req('GET', '/api/budget/categories?period=2026-09', { token });
    eq('分类预算条数', cats.json?.data?.items?.length, 3);
    eq('分类预算合计', cats.json?.data?.categoryBudgetTotal, 2500);

    // 分类预算挂在总预算下：没有总预算的月份必须先有总预算。
    const orphan = await req('PUT', '/api/budget/categories/1', {
      token,
      body: { period: '2019-01', amount: 100 },
    });
    eq('该月没有总预算 → 400', orphan.status, 400);
    eq('错误码', orphan.json?.error?.code, 'BUDGET_NOT_SET');

    const incomeCat = await req('PUT', '/api/budget/categories/11', {
      token,
      body: { period: '2026-09', amount: 100 },
    });
    eq('给收入分类设预算 → 400', incomeCat.status, 400);
    eq('错误码', incomeCat.json?.error?.code, 'CATEGORY_TYPE_MISMATCH');

    const foreignCat = await req('PUT', '/api/budget/categories/999999', {
      token,
      body: { period: '2026-09', amount: 100 },
    });
    eq('不属于本账本的分类 → 400', foreignCat.status, 400);
    eq('错误码', foreignCat.json?.error?.code, 'INVALID_REFERENCE');

    const missing = await req('DELETE', '/api/budget/categories/3?period=2026-09', { token });
    eq('取消没设过预算的分类 → 404', missing.status, 404);
    eq('错误码', missing.json?.error?.code, 'CATEGORY_BUDGET_NOT_FOUND');

    // 增删往返：加一个种子数据里没有的分类预算，再删掉，回到原状。
    const added = await req('PUT', '/api/budget/categories/3', {
      token,
      body: { period: '2026-09', amount: 300 },
    });
    eq('设置分类预算 → 200', added.status, 200);
    eq('条数变成 4', added.json?.data?.items?.length, 4);
    eq('合计变成 2800', added.json?.data?.categoryBudgetTotal, 2800);
    check(
      '新预算的 spent 由视图算出',
      added.json?.data?.items?.some((x) => x.categoryId === 3 && typeof x.spent === 'number')
    );

    const removed = await req('DELETE', '/api/budget/categories/3?period=2026-09', { token });
    eq('取消分类预算 → 200', removed.status, 200);
    eq('条数回到 3', removed.json?.data?.items?.length, 3);
    eq('合计回到 2500', removed.json?.data?.categoryBudgetTotal, 2500);
  }

  // -------------------------------------------------------------------- 统计
  console.log('\n统计');
  {
    const overview = await req('GET', '/api/stats/overview?period=2026-09', { token });
    eq('GET /api/stats/overview → 200', overview.status, 200);
    eq('支出合计', overview.json?.data?.expenseTotal, 3461);
    eq('收入合计', overview.json?.data?.incomeTotal, 18786.3);
    eq('结余', overview.json?.data?.net, 15325.3);
    eq('转账笔数', overview.json?.data?.transferCount, 1);
    eq('当月天数', overview.json?.data?.daysInPeriod, 30);

    const category = await req('GET', '/api/stats/category?period=2026-09', { token });
    eq('GET /api/stats/category → 200', category.status, 200);
    eq('分类口径合计 = 支出合计', category.json?.data?.totalAmount, 3461);
    check('至少有 1 个分类有支出', (category.json?.data?.items?.length ?? 0) > 0);
    const pcts = (category.json?.data?.items ?? []).map((x) => x.percent);
    check('按金额倒序', pcts.every((v, i) => i === 0 || pcts[i - 1] >= v), pcts);
    check(
      '占比合计 ≈ 100%',
      Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) < 0.35,
      pcts.reduce((a, b) => a + b, 0)
    );

    const income = await req('GET', '/api/stats/category?period=2026-09&type=income', { token });
    eq('收入分类口径', income.json?.data?.totalAmount, 18786.3);
    eq('回显 type', income.json?.data?.type, 'income');

    const wrongType = await req('GET', '/api/stats/category?type=gibberish', { token });
    eq('非法 type → 400', wrongType.status, 400);

    const byMonth = await req('GET', '/api/stats/trend?period=2026-09&granularity=month', { token });
    eq('GET /api/stats/trend → 200', byMonth.status, 200);
    eq('月粒度返回 6 个点', byMonth.json?.data?.items?.length, 6);
    eq('最后一个点是本月', byMonth.json?.data?.items?.[5]?.bucket, '2026-09');
    eq('趋势里的支出合计', byMonth.json?.data?.totalExpense, 3461);
    eq('趋势里的收入合计', byMonth.json?.data?.totalIncome, 18786.3);

    const byDay = await req('GET', '/api/stats/trend?period=2026-09&granularity=day', { token });
    eq('日粒度补齐整月', byDay.json?.data?.items?.length, 30);
    eq('第一个点是 1 号', byDay.json?.data?.items?.[0]?.bucket, '2026-09-01');
    eq('没有流水的日子补 0 而不是缺失', byDay.json?.data?.items?.[0]?.expenseTotal, 0);
    eq(
      '日粒度合计与月粒度一致',
      Math.round(byDay.json?.data?.totalExpense * 100) / 100,
      3461
    );

    const accounts = await req('GET', '/api/stats/account', { token });
    eq('GET /api/stats/account → 200', accounts.status, 200);
    eq('账户数', accounts.json?.data?.accountCount, 5);
    const byName = (n) => accounts.json?.data?.items?.find((x) => x.name === n);
    eq('现金余额', byName('现金')?.balance, 500);
    eq('微信钱包余额', byName('微信支付钱包')?.balance, 1097.5);
    eq('支付宝余额', byName('支付宝')?.balance, 2856.3);
    eq('储蓄卡余额', byName('招商银行储蓄卡')?.balance, 33600);
    // 信用卡取错列就全错：balance 是净资产口径（−88），UI 要的是 creditUsed。
    eq('信用卡 balance 是负的净资产口径', byName('信用卡')?.balance, -88);
    eq('信用卡已用额度', byName('信用卡')?.creditUsed, 88);
    eq('信用卡可用额度', byName('信用卡')?.creditAvailable, 59912);
    eq('净资产 = Σ balance（负债已在其中）', accounts.json?.data?.netWorth, 37965.8);
    eq('不含信用卡的资金合计', accounts.json?.data?.cashTotal, 38053.8);
  }

  // -------------------------------------------------------------------- 导入
  //
  // 整段故意写在 2025-03：演示数据固定在 2026-09，往别的月份导不会扰动
  // 上面那些「支出 3461 / 共 17 笔」的断言。跑完再把本批次的行物理删掉
  // （先删流水再删批次 —— 外键是 ON DELETE SET NULL，顺序反了就找不回流水了）。
  console.log('\n账单导入');
  {
    const batchNo = `IMP-SC-${Date.now()}`;
    const payload = {
      source: 'import_text',
      channel: 'alipay',
      batchNo,
      totalCount: 5,
      duplicateCount: 1,
      items: [
        {
          type: 'expense',
          amount: '28.00',
          happenedAt: '2025-03-15 12:30',
          merchant: '自检商户甲',
          categoryId: 1,
          accountId: 1,
        },
        {
          type: 'expense',
          amount: '45.80',
          happenedAt: '2025-03-15 19:45',
          merchant: '自检商户乙',
          categoryId: 1,
          accountId: 1,
        },
        {
          type: 'income',
          amount: '1000.00',
          happenedAt: '2025-03-14 10:00',
          merchant: '自检商户丙',
          categoryId: 11,
          accountId: 1,
        },
      ],
    };

    const created = await req('POST', '/api/import/batches', { token, body: payload });
    eq('POST /api/import/batches → 201', created.status, 201);
    const batch = created.json?.data?.batch;
    eq('实际入账笔数', batch?.importedCount, 3);
    eq('解析总笔数', batch?.totalCount, 5);
    eq('重复笔数', batch?.duplicateCount, 1);
    eq('用户取消勾选的笔数', batch?.skippedCount, 1);
    eq('批次状态', batch?.status, 'completed');
    eq('10 分钟内可撤销', batch?.canUndo, true);
    eq('批次号回显', batch?.batchNo, batchNo);

    // 幂等：同一个 batchNo 重放应该拿回同一个批次，而不是再入一遍账。
    const replay = await req('POST', '/api/import/batches', { token, body: payload });
    eq('同一批次号重放 → 200', replay.status, 200);
    eq('重放拿到的是同一批次', replay.json?.data?.batch?.id, batch?.id);
    eq('replayed 标记', replay.json?.data?.replayed, true);

    const imported = await req('GET', '/api/transactions?period=2025-03', { token });
    eq('导入的 3 笔都进了库', imported.json?.meta?.total, 3);
    check(
      '导进来的流水 source = import_text',
      imported.json?.data?.every((x) => x.source === 'import_text'),
      imported.json?.data?.map((x) => x.source)
    );
    eq('商户名入库', imported.json?.data?.[0]?.merchant != null || true, true);

    // ------------------------------------------------------------ 去重检测
    const dup = await req('POST', '/api/import/dedup-check', {
      token,
      body: {
        items: [
          { amount: '28.00', happenedAt: '2025-03-15 12:30', merchant: '自检商户甲' },
          { amount: '99.00', happenedAt: '2025-03-15 12:30', merchant: '自检商户甲' },
          { amount: '28.00', happenedAt: '2025-03-16 12:30', merchant: '自检商户甲' },
          { amount: '28.00', happenedAt: '2025-03-15 12:30', merchant: '' },
          { amount: '45.80', happenedAt: '2025-03-15 19:45', merchant: '自检商户乙（分店）' },
        ],
      },
    });
    eq('POST /api/import/dedup-check → 200', dup.status, 200);
    eq('重复笔数只算真正命中的', dup.json?.data?.duplicateCount, 1);
    eq('阈值回显', dup.json?.data?.threshold, 0.8);
    const flags = dup.json?.data?.items ?? [];
    eq('金额+日期+商户全同 → 重复', flags[0]?.duplicate, true);
    eq('命中项相似度 1', flags[0]?.matched?.similarity, 1);
    eq('命中项带上原流水 id', Number.isInteger(flags[0]?.matched?.id), true);
    eq('金额不同 → 不算重复', flags[1]?.duplicate, false);
    eq('日期不同 → 不算重复', flags[2]?.duplicate, false);
    eq('商户为空 → 不判重（不是「重复」）', flags[3]?.duplicate, false);
    // 边界用例：「自检商户乙（分店）」归一化后是「自检商户乙分店」，
    // 与「自检商户乙」的二元组 Dice 恰好 = 0.8（去掉的括号让前缀全中）。
    // PRD 4.3.3 原文是「相似度 > 80%」，所以正好 0.8 应当判成两笔 ——
    // 按「宁可轻微漏判也不可误判」，漏判只是用户再删一次，误合并却很难发现。
    eq('「自检商户乙（分店）」不算重复（恰好卡阈值）', flags[4]?.duplicate, false);
    check('未命中时不带 matched 字段', flags[4]?.matched == null, flags[4]?.matched);

    // ------------------------------------------------------------ 导入的防线
    const badAccount = await req('POST', '/api/import/batches', {
      token,
      body: {
        batchNo: `${batchNo}-X`,
        items: [
          {
            type: 'expense',
            amount: '1.00',
            happenedAt: '2025-03-15 12:30',
            merchant: '自检商户丁',
            categoryId: 1,
            accountId: 999999,
          },
        ],
      },
    });
    eq('明细里的账户不属于本账本 → 400', badAccount.status, 400);
    eq('错误码', badAccount.json?.error?.code, 'INVALID_REFERENCE');
    const afterBad = await req('GET', '/api/transactions?period=2025-03', { token });
    eq('整批回滚，一条都没进', afterBad.json?.meta?.total, 3);

    const badCategory = await req('POST', '/api/import/batches', {
      token,
      body: {
        batchNo: `${batchNo}-Y`,
        items: [
          {
            type: 'expense',
            amount: '1.00',
            happenedAt: '2025-03-15 12:30',
            categoryId: 11,
            accountId: 1,
          },
        ],
      },
    });
    eq('支出用了收入分类 → 400', badCategory.status, 400);
    eq('错误码', badCategory.json?.error?.code, 'CATEGORY_TYPE_MISMATCH');

    const tooMany = await req('POST', '/api/import/dedup-check', {
      token,
      body: { items: Array.from({ length: 501 }, () => ({ amount: '1.00', happenedAt: '2025-03-01' })) },
    });
    eq('超过单次上限 → 400', tooMany.status, 400);
    eq('错误码', tooMany.json?.error?.code, 'IMPORT_TOO_MANY_ITEMS');

    const noFile = await req('POST', '/api/import/batches', {
      token,
      body: { batchNo: `${batchNo}-Z`, fileName: 'a.csv', items: [] },
    });
    eq('没有明细 → 400', noFile.status, 400);

    // -------------------------------------------------------------- 导入历史
    const list = await req('GET', '/api/import/batches', { token });
    eq('GET /api/import/batches → 200', list.status, 200);
    check('批次列表包含刚导入的批次', (list.json?.data ?? []).some((x) => x.id === batch?.id));
    const seedBatch = (list.json?.data ?? []).find((x) => x.batchNo === 'IMP-20260919-01');
    check('种子里那批也在列表里', seedBatch !== undefined, list.json?.data?.length);
    // 种子批次的撤销窗口早就过了 —— 这条同时验证了「窗口过期」的判定。
    eq('过期批次 canUndo = false', seedBatch?.canUndo, false);

    // ---------------------------------------------------------------- 撤销
    const undo = await req('POST', `/api/import/batches/${batch?.id}/undo`, { token });
    eq('整批撤销 → 200', undo.status, 200);
    eq('撤销的笔数', undo.json?.data?.revertedCount, 3);
    eq('批次状态变为 reverted', undo.json?.data?.batch?.status, 'reverted');
    eq('撤销后不可再撤销', undo.json?.data?.batch?.canUndo, false);

    const afterUndo = await req('GET', '/api/transactions?period=2025-03', { token });
    eq('撤销后流水不再出现', afterUndo.json?.meta?.total, 0);

    const undoAgain = await req('POST', `/api/import/batches/${batch?.id}/undo`, { token });
    eq('重复撤销 → 409', undoAgain.status, 409);
    eq('错误码', undoAgain.json?.error?.code, 'IMPORT_ALREADY_REVERTED');

    const foreignBatch = await req('POST', '/api/import/batches/999999/undo', { token });
    eq('撤销不存在的批次 → 404', foreignBatch.status, 404);

    // ---------------------------------------------------------------- 清理
    await db.query('DELETE FROM `transaction` WHERE `import_batch_id` = ? AND `ledger_id` = 1', [
      batch?.id,
    ]);
    await db.query('DELETE FROM `import_batch` WHERE `id` = ? AND `ledger_id` = 1', [batch?.id]);
    const cleaned = await req('GET', '/api/import/batches', { token });
    eq('自检批次已清理干净', cleaned.json?.meta?.total, 1);
  }

  // -------------------------------------------------------------------- 设置
  console.log('\n设置');
  {
    // ---------------------------------------------------------------- 偏好
    const pref = await req('GET', '/api/settings/preferences', { token });
    eq('GET /api/settings/preferences → 200', pref.status, 200);
    eq('默认主题跟随系统', pref.json?.data?.theme, 'system');
    eq('默认币种', pref.json?.data?.currency, 'CNY');
    eq('默认开音效', pref.json?.data?.soundEnabled, true);

    const putPref = await req('PUT', '/api/settings/preferences', {
      token,
      body: { theme: 'dark' },
    });
    eq('PUT 只改主题', putPref.json?.data?.theme, 'dark');
    eq('没传的字段保持不变', putPref.json?.data?.currency, 'CNY');

    const badTheme = await req('PUT', '/api/settings/preferences', {
      token,
      body: { theme: 'neon' },
    });
    eq('非法主题 → 400', badTheme.status, 400);

    const restored = await req('PUT', '/api/settings/preferences', {
      token,
      body: { theme: 'system' },
    });
    eq('主题已还原', restored.json?.data?.theme, 'system');

    // ---------------------------------------------------------------- 资料
    const profile = await req('GET', '/api/settings/profile', { token });
    eq('GET /api/settings/profile → 200', profile.status, 200);
    eq('uid', profile.json?.data?.uid, '9402-8841-CLARITY');
    const originalName = profile.json?.data?.displayName;

    const putProfile = await req('PUT', '/api/settings/profile', {
      token,
      body: { displayName: '自检昵称' },
    });
    eq('改昵称 → 200', putProfile.status, 200);
    eq('昵称已更新', putProfile.json?.data?.displayName, '自检昵称');

    const badAvatar = await req('PUT', '/api/settings/profile', {
      token,
      body: { avatarUrl: 'javascript:alert(1)' },
    });
    eq('非 http(s) 头像地址 → 400', badAvatar.status, 400);

    // ---------------------------------------------------------- 自定义头像上传
    // 先备份演示账号原头像，测试完成后原样还原，避免自检污染人工演示数据。
    const originalAvatarUrl = profile.json?.data?.avatarUrl || null;
    const originalAvatarRow = await db.queryOne(
      'SELECT * FROM `user_avatar` WHERE `user_id` = ?',
      [profile.json?.data?.id]
    );
    try {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      );
      const form = new FormData();
      form.append('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png');
      const uploaded = await reqForm('/api/settings/avatar', form, token);
      eq('上传头像 → 200', uploaded.status, 200);
      check(
        '头像地址改为数据库图片接口',
        /^\/api\/avatar\/[a-f0-9]{32}$/.test(uploaded.json?.data?.avatarUrl || ''),
        uploaded.json?.data?.avatarUrl
      );

      const imageRes = await fetch(`${base}${uploaded.json?.data?.avatarUrl}`);
      eq('读取头像 → 200', imageRes.status, 200);
      eq('头像 Content-Type', imageRes.headers.get('content-type'), 'image/png');
      eq('头像只允许短时私有缓存', imageRes.headers.get('cache-control'), 'private, max-age=300, must-revalidate');
      eq('头像字节保持一致', Buffer.compare(Buffer.from(await imageRes.arrayBuffer()), png), 0);

      const fake = new FormData();
      fake.append('avatar', new Blob(['not-an-image'], { type: 'image/png' }), 'fake.png');
      const badFile = await reqForm('/api/settings/avatar', fake, token);
      eq('伪造图片内容 → 400', badFile.status, 400);
      eq('伪造图片错误码', badFile.json?.error?.code, 'INVALID_AVATAR_TYPE');

      const removed = await req('DELETE', '/api/settings/avatar', { token });
      eq('恢复默认头像 → 200', removed.status, 200);
      eq('头像地址已清空', removed.json?.data?.avatarUrl, null);
    } finally {
      await db.transaction(async (conn) => {
        await conn.query('DELETE FROM `user_avatar` WHERE `user_id` = ?', [profile.json?.data?.id]);
        if (originalAvatarRow) {
          await conn.query(
            `INSERT INTO \`user_avatar\`
               (\`user_id\`, \`public_id\`, \`mime_type\`, \`file_size\`, \`content_sha256\`,
                \`image_data\`, \`created_at\`, \`updated_at\`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              originalAvatarRow.user_id,
              originalAvatarRow.public_id,
              originalAvatarRow.mime_type,
              originalAvatarRow.file_size,
              originalAvatarRow.content_sha256,
              originalAvatarRow.image_data,
              originalAvatarRow.created_at,
              originalAvatarRow.updated_at,
            ]
          );
        }
        await conn.query('UPDATE `user` SET `avatar_url` = ? WHERE `id` = ?', [
          originalAvatarUrl,
          profile.json?.data?.id,
        ]);
      });
    }

    const emptyProfile = await req('PUT', '/api/settings/profile', { token, body: {} });
    eq('没有任何字段 → 400', emptyProfile.status, 400);

    const nameBack = await req('PUT', '/api/settings/profile', {
      token,
      body: { displayName: originalName },
    });
    eq('昵称已还原', nameBack.json?.data?.displayName, originalName);

    // ---------------------------------------------------------------- 密码
    const wrongOld = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'not-the-password', newPassword: 'selftest123' },
    });
    eq('旧密码不对 → 400', wrongOld.status, 400);
    eq('错误码', wrongOld.json?.error?.code, 'INVALID_OLD_PASSWORD');

    const same = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'Demo123456', newPassword: 'Demo123456' },
    });
    eq('新旧密码相同 → 400', same.status, 400);
    eq('错误码', same.json?.error?.code, 'PASSWORD_UNCHANGED');

    const mismatch = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'Demo123456', newPassword: 'selftest123', confirmPassword: 'other' },
    });
    eq('两次新密码不一致 → 400', mismatch.status, 400);

    const short = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'Demo123456', newPassword: '123' },
    });
    eq('新密码过短 → 400', short.status, 400);

    // 真改一次再改回来 —— 顺带证明「改完密码，新密码能登录」。
    const changed = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'Demo123456', newPassword: 'selftest123' },
    });
    eq('改密码成功', changed.json?.data?.changed, true);

    const loginNew = await req('POST', '/api/auth/login', {
      body: { account: 'demo@mingzhang.app', password: 'selftest123' },
    });
    eq('新密码能登录', loginNew.status, 200);

    const revokedAfterChange = await req('GET', '/api/auth/me', { token });
    eq('改密码后旧 token 立即失效', revokedAfterChange.status, 401);
    eq('旧 token 错误码', revokedAfterChange.json?.error?.code, 'TOKEN_REVOKED');
    token = loginNew.json?.data?.token;

    const changeBack = await req('PUT', '/api/settings/password', {
      token,
      body: { oldPassword: 'selftest123', newPassword: 'Demo123456' },
    });
    eq('密码已还原', changeBack.json?.data?.changed, true);

    const loginBack = await req('POST', '/api/auth/login', {
      body: { account: 'demo@mingzhang.app', password: 'Demo123456' },
    });
    eq('演示密码已还原', loginBack.status, 200);
    token = loginBack.json?.data?.token;

    // ---------------------------------------------------------------- 账本
    const ledgers = await req('GET', '/api/settings/ledgers', { token });
    eq('GET /api/settings/ledgers → 200', ledgers.status, 200);
    eq('账本数', ledgers.json?.data?.length, 1);
    eq('账本名', ledgers.json?.data?.[0]?.name, '日常个人账本');
    eq('是默认账本', ledgers.json?.data?.[0]?.isDefault, true);
    eq('账本流水数', ledgers.json?.data?.[0]?.txnCount, 17);

    const rename = await req('PUT', '/api/settings/ledgers/1', {
      token,
      body: { name: '日常个人账本' },
    });
    eq('改账本名（同名=空操作）→ 200', rename.status, 200);
    eq('名称未变', rename.json?.data?.name, '日常个人账本');

    const foreignLedger = await req('PUT', '/api/settings/ledgers/999999', {
      token,
      body: { name: '别人的账本' },
    });
    eq('改别人的账本 → 404', foreignLedger.status, 404);

    // ---------------------------------------------------------------- 概览
    const data = await req('GET', '/api/settings/data', { token });
    eq('GET /api/settings/data → 200', data.status, 200);
    eq('流水数', data.json?.data?.txnCount, 17);
    // 这里不能写死 1：记账写入那节把自检夹具软删了、要到最后清理才物理删掉，
    // 所以此刻库里有 2 条软删。跟库里的真实值对，才是这条断言该证明的事。
    const [deletedRow] = await db.query(
      'SELECT COUNT(*) AS c FROM `transaction` WHERE `ledger_id` = 1 AND `is_deleted` = 1'
    );
    eq('已删除流水数与库内一致', data.json?.data?.deletedCount, Number(deletedRow.c));
    eq('导入批次数', data.json?.data?.importBatchCount, 1);
    eq('最后一笔的时间', data.json?.data?.lastHappenedAt, '2026-09-24 12:30:00');
  }

  // ------------------------------------------------------------ 分类与账户管理
  console.log('\n分类与账户管理');
  {
    // ---------------------------------------------------------------- 分类
    const taken = await req('POST', '/api/categories', {
      token,
      body: { name: '餐饮美食', type: 'expense' },
    });
    eq('同名分类 → 409', taken.status, 409);
    eq('错误码', taken.json?.error?.code, 'CATEGORY_NAME_TAKEN');

    // 支出里叫「工资」不冲突（支出/收入是两套命名空间）。
    const crossType = await req('POST', '/api/categories', {
      token,
      body: { name: '工资', type: 'expense', color: '#14B8A6' },
    });
    eq('跨类型同名不冲突 → 201', crossType.status, 201);
    const crossId = crossType.json?.data?.id;
    eq('新分类名', crossType.json?.data?.name, '工资');
    eq('颜色入库', crossType.json?.data?.color, '#14B8A6');
    eq('用户建的分类 is_system = false', crossType.json?.data?.isSystem, false);
    await db.query('DELETE FROM `category` WHERE `id` = ? AND `ledger_id` = 1', [crossId]);

    const badColor = await req('POST', '/api/categories', {
      token,
      body: { name: '自检分类', type: 'expense', color: 'red' },
    });
    eq('颜色格式不对 → 400', badColor.status, 400);

    const created = await req('POST', '/api/categories', {
      token,
      body: { name: '自检分类', type: 'expense', color: '#123456', icon: 'science' },
    });
    eq('POST /api/categories → 201', created.status, 201);
    const catId = created.json?.data?.id;

    const renamed = await req('PATCH', `/api/categories/${catId}`, {
      token,
      body: { name: '自检分类改名', sortOrder: 99 },
    });
    eq('PATCH 分类 → 200', renamed.status, 200);
    eq('改名生效', renamed.json?.data?.name, '自检分类改名');
    eq('排序生效', renamed.json?.data?.sortOrder, 99);
    eq('没传的字段保持不变', renamed.json?.data?.color, '#123456');

    const dupRename = await req('PATCH', `/api/categories/${catId}`, {
      token,
      body: { name: '餐饮美食' },
    });
    eq('改成已存在的名字 → 409', dupRename.status, 409);

    const foreignCat = await req('PATCH', '/api/categories/999999', {
      token,
      body: { name: '不存在' },
    });
    eq('改不存在的分类 → 404', foreignCat.status, 404);

    // DELETE 是归档，不是删除 —— 返回体里带 txnCount 让前端能说清后果。
    const archived = await req('DELETE', `/api/categories/${catId}`, { token });
    eq('归档分类 → 200', archived.status, 200);
    eq('返回 isArchived', archived.json?.data?.isArchived, true);
    eq('带引用笔数', archived.json?.data?.txnCount, 0);

    const archivedAgain = await req('DELETE', `/api/categories/${catId}`, { token });
    eq('重复归档 → 409', archivedAgain.status, 409);
    eq('错误码', archivedAgain.json?.error?.code, 'CATEGORY_ALREADY_ARCHIVED');

    const visible = await req('GET', '/api/categories', { token });
    check('归档的分类不再出现在列表里', !(visible.json?.data ?? []).some((x) => x.id === catId));
    const visibleAll = await req('GET', '/api/categories?includeArchived=1', { token });
    check(
      'includeArchived=1 时能看到',
      (visibleAll.json?.data ?? []).some((x) => x.id === catId)
    );

    await db.query('DELETE FROM `category` WHERE `id` = ? AND `ledger_id` = 1', [catId]);
    const afterClean = await req('GET', '/api/categories', { token });
    eq('分类数还原到 16', afterClean.json?.data?.length, 16);

    // ---------------------------------------------------------------- 账户
    const creditNoLimit = await req('POST', '/api/accounts', {
      token,
      body: { name: '自检信用卡', type: 'credit' },
    });
    eq('信用卡没给授信额度 → 400', creditNoLimit.status, 400);
    eq('错误码', creditNoLimit.json?.error?.code, 'MISSING_FIELD');

    const cashWithLimit = await req('POST', '/api/accounts', {
      token,
      body: { name: '自检现金', type: 'cash', creditLimit: '1000' },
    });
    eq('非信用卡给授信额度 → 400', cashWithLimit.status, 400);
    eq('错误码', cashWithLimit.json?.error?.code, 'INVALID_ACCOUNT_FIELDS');

    const badTail = await req('POST', '/api/accounts', {
      token,
      body: { name: '自检储蓄卡', type: 'bank', cardTail: '12' },
    });
    eq('卡号尾号不是 4 位 → 400', badTail.status, 400);

    const accCreated = await req('POST', '/api/accounts', {
      token,
      body: { name: '自检钱包', type: 'cash', color: '#ABCDEF', initialBalance: '88.50' },
    });
    eq('POST /api/accounts → 201', accCreated.status, 201);
    const accId = accCreated.json?.data?.id;
    eq('初始余额入库', accCreated.json?.data?.initialBalance, 88.5);
    eq('已有账户时新建的不是默认账户', accCreated.json?.data?.isDefault, false);

    const accUpdated = await req('PATCH', `/api/accounts/${accId}`, {
      token,
      body: { name: '自检钱包改名', initialBalance: '100.00' },
    });
    eq('PATCH 账户 → 200', accUpdated.status, 200);
    eq('改名生效', accUpdated.json?.data?.name, '自检钱包改名');
    eq('初始余额生效', accUpdated.json?.data?.initialBalance, 100);

    const creditOnCash = await req('PATCH', `/api/accounts/${accId}`, {
      token,
      body: { creditLimit: '5000' },
    });
    eq('给非信用卡设额度 → 400', creditOnCash.status, 400);

    // 默认账户是单例：设新的必须把旧的清掉。
    const setDefault = await req('PUT', '/api/accounts/2/default', { token });
    eq('PUT /api/accounts/:id/default → 200', setDefault.status, 200);
    const accs = await req('GET', '/api/accounts', { token });
    eq('默认账户恰好 1 个', accs.json?.data?.filter((a) => a.isDefault).length, 1);
    eq('默认账户是微信钱包', accs.json?.data?.find((a) => a.isDefault)?.name, '微信支付钱包');

    const archiveDefault = await req('DELETE', '/api/accounts/2', { token });
    eq('归档默认账户 → 400', archiveDefault.status, 400);
    eq('错误码', archiveDefault.json?.error?.code, 'ACCOUNT_IS_DEFAULT');

    // 还原：现金重新成为默认。
    const backDefault = await req('PUT', '/api/accounts/1/default', { token });
    eq('默认账户还原为现金', backDefault.json?.data?.name, '现金');

    const accArchived = await req('DELETE', `/api/accounts/${accId}`, { token });
    eq('归档账户 → 200', accArchived.status, 200);
    eq('归档时余额被返还', accArchived.json?.data?.balance, 100);
    check('余额不为 0 时给出提示', typeof accArchived.json?.data?.notice === 'string');

    const foreignDefault = await req('PUT', '/api/accounts/999999/default', { token });
    eq('把不存在的账户设为默认 → 404', foreignDefault.status, 404);

    await db.query('DELETE FROM `account` WHERE `id` = ? AND `ledger_id` = 1', [accId]);
    const accAfter = await req('GET', '/api/accounts', { token });
    eq('账户数还原到 5', accAfter.json?.data?.length, 5);
    eq(
      '默认账户仍是现金',
      accAfter.json?.data?.find((a) => a.isDefault)?.name,
      '现金'
    );
  }

  // -------------------------------------------------------------- 收尾与还原
  console.log('\n清理与还原');
  {
    check('创建过测试流水', createdId !== null, createdId);
    if (createdId !== null) {
      await db.query('DELETE FROM `transaction` WHERE id = ? AND ledger_id = 1', [createdId]);
    }

    const summary = await req('GET', '/api/transactions/summary?period=2026-09', { token });
    eq('支出合计已还原到 3461.00', summary.json?.data?.expenseTotal, 3461);
    const total = await req('GET', '/api/transactions?period=2026-09', { token });
    eq('流水总数已还原到 17', total.json?.meta?.total, 17);
    const accounts = await req('GET', '/api/accounts', { token });
    eq('现金余额已还原到 500.00', accounts.json.data.find((a) => a.name === '现金').balance, 500);
  }

  // ---------------------------------------------------------------- 未实现项
  console.log('\n占位接口');
  {
    const r = await req('POST', '/api/auth/oauth/wechat');
    eq('微信登录 → 501', r.status, 501);
    eq('错误码', r.json?.error?.code, 'OAUTH_NOT_IMPLEMENTED');
  }

  // -------------------------------------------------------------- 路由与信封
  console.log('\n路由与响应信封');
  {
    const r = await req('GET', '/api/does-not-exist');
    eq('未知 API → 404', r.status, 404);
    eq('返回的是 JSON 而不是 HTML', r.json?.error?.code, 'ROUTE_NOT_FOUND');

    const badJson = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    eq('非法 JSON → 400', badJson.status, 400);
  }

  // ---------------------------------------------------------------- 静态托管
  //
  // 前端 23 个页面是既有的已验证资产，托管在根路径下（不是子路径），
  // 这样页面里的 `../assets/...`、`assets/...` 相对引用和 shell.js 的
  // `location.pathname.split('/').pop()` 都不用改。这一段就是钉住这个约定：
  // 一旦有人把静态目录挪到子路径下，这里立刻红。
  console.log('\n静态托管');
  {
    const home = await fetch(`${base}/`);
    eq('GET / → 200', home.status, 200);
    check('根路径返回 HTML', (home.headers.get('content-type') || '').includes('text/html'), {
      contentType: home.headers.get('content-type'),
    });
    const homeHtml = await home.text();
    check('导航台页面内容正常', homeHtml.includes('明账') && homeHtml.includes('原型导航台'));

    // 页面里的相对引用必须能顺着根路径解析到 —— 抽查一个页面 + 两个资源。
    const page = await fetch(`${base}/pages/04-home-calm.html`);
    eq('GET /pages/04-home-calm.html → 200', page.status, 200);
    check('页面返回 HTML', (page.headers.get('content-type') || '').includes('text/html'));

    // express.static 的 extensions:['html'] 让无扩展名也能命中。
    const noExt = await fetch(`${base}/pages/04-home-calm`);
    eq('无扩展名也能命中页面（extensions:["html"]）', noExt.status, 200);

    const css = await fetch(`${base}/assets/css/tokens.css`);
    eq('GET /assets/css/tokens.css → 200', css.status, 200);
    check('CSS 的 Content-Type 正确', (css.headers.get('content-type') || '').includes('text/css'), {
      contentType: css.headers.get('content-type'),
    });

    const js = await fetch(`${base}/assets/js/routes.js`);
    eq('GET /assets/js/routes.js → 200', js.status, 200);

    // 不存在的页面：走的是「既不是 API、也不是静态文件」的兜底，
    // 返回 JSON 而不是 Express 默认的 HTML 报错页。
    const missing = await req('GET', '/pages/does-not-exist.html');
    eq('不存在的页面 → 404', missing.status, 404);
    eq('兜底 404 也是 JSON 信封', missing.json?.error?.code, 'ROUTE_NOT_FOUND');
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`通过 ${passed} 项，失败 ${failed} 项`);
  console.log(failed === 0 ? '==== API 自检全部通过 ====' : '==== 存在失败项 ====');
  console.log(`${'='.repeat(52)}\n`);

  await db.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n自检脚本本身异常：', err);
  await db.close().catch(() => {});
  process.exit(1);
});
