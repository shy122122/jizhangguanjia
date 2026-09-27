/* ============================================================================
 * 明账（MingZhang）· API 客户端
 *
 * 这个文件只做三件事，**不写任何业务方法**：
 *   1. token 的存取（localStorage）
 *   2. 统一的 request()：拼 URL、带 Authorization、解析响应信封、
 *      401 自动登出、错误提示、滑动续期
 *   3. 金额 / 百分比 / 日期的时间格式化
 *
 * 为什么业务方法（如 api.listTransactions）不放在这里：
 *   同一个数据在首页、流水页、统计页的取法不一样（周期、筛选、条数都不同），
 *   在这里包一层只会变成一堆「参数转发」的空壳函数，还让调用点看不出真实请求。
 *   页面直接写 MZ_API.get('/transactions', { period: '2026-09' }) 更诚实。
 *
 * 同源部署：页面与 API 都在同一个端口上，所以这里用绝对路径 /api，
 * 页面在 /pages/xx.html 还是 / 下都不用改。
 * ========================================================================== */

(function (global) {
  'use strict';

  var BASE = '/api';
  var TOKEN_KEY = 'mz-token';
  var USER_KEY = 'mz-user';   // 当前用户 + 账本的缓存，仅用于首屏立刻渲染骨架
  var LOGIN_PAGE = '/pages/01-onboarding-landing.html';

  /* -------------------------------------------------------------------------
   * token 与本地身份缓存
   *
   * localStorage 在 file:// 或隐私模式下会抛异常，统一 try 包住：
   * 存不下最多是「刷新后要重新登录」，不该让整页脚本挂掉。
   * ----------------------------------------------------------------------- */
  function readStore(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try {
      if (value == null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, value);
    } catch (e) {}
  }

  function getToken() { return readStore(TOKEN_KEY); }
  function setToken(token) { writeStore(TOKEN_KEY, token || null); }

  /** 登录后缓存身份，仅供首屏占位使用；权威值永远以 /auth/me 为准。 */
  function setSession(data) {
    if (data && data.token) setToken(data.token);
    if (data && data.user) {
      writeStore(USER_KEY, JSON.stringify({ user: data.user, ledger: data.ledger }));
    }
  }
  function getSession() {
    var raw = readStore(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function clearSession() {
    writeStore(TOKEN_KEY, null);
    writeStore(USER_KEY, null);
  }

  /** 401 之后统一从这里回登录页 —— 带上来路，登录完能回得来。 */
  function gotoLogin() {
    // 一律走 global.location 而不是裸 location：后者靠的是「环境里恰好有个全局
    // location」，在浏览器里成立，在别的宿主（测试、worker）里就是 ReferenceError。
    // 这个文件其余地方都用 global.*，别只在这里破例。
    var loc = global.location;
    if (!loc) return;
    var here = loc.pathname + loc.search;
    if (loc.pathname.indexOf('01-onboarding-landing') !== -1) return;
    loc.href = LOGIN_PAGE + '?next=' + encodeURIComponent(here);
  }

  /* -------------------------------------------------------------------------
   * 错误
   *
   * 服务端契约 { ok:false, error:{ code, message, details } }。
   * code 用来分支，message 只用来展示 —— 别拿它做判断。
   * ----------------------------------------------------------------------- */
  function ApiError(status, code, message, details) {
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
    this.details = details;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  /**
   * 网络层失败（断网、服务没起、响应不是 JSON）——与业务错误区分开。
   *
   * 带上 status / url / method：这三种失败的现象都是「一条红 toast」，
   * 但原因完全不同。没有这几个字段，排查时只能靠猜（见下面的 unparseable()）。
   */
  function NetworkError(message, detail) {
    this.name = 'NetworkError';
    this.code = 'NETWORK_ERROR';
    this.message = message;
    this.status = (detail && detail.status) || 0;
    this.url = (detail && detail.url) || null;
    this.method = (detail && detail.method) || null;
  }
  NetworkError.prototype = Object.create(Error.prototype);
  NetworkError.prototype.constructor = NetworkError;

  /**
   * 响应不是 JSON 时的文案。
   *
   * 为什么要按状态码分开写：这个分支最容易被误诊。后端所有响应都是 JSON 信封
   * （成功 / 失败都有），所以「拿不到 JSON」这条在**正常跑通的后端上不可能出现** ——
   * 它几乎总意味着请求根本没到后端，而是被另一个服务器代答了。
   * 405 是最典型的信号：静态服务器（IDE 内置预览、Live Server、
   * serve-static 的 fallthrough:false）会接受 GET 但拒绝 POST，于是登录（POST）
   * 报 405，而页面本身打得开 —— 看起来像「后端坏了」，其实是「压根不是这个后端」。
   */
  function unparseable(method, url, status) {
    var detail = '（' + method + ' ' + url + ' → HTTP ' + status + '）';

    if (status === 405 || status === 501) {
      return '请求没有到达明账后端：' + detail + '。后端所有响应（成功与失败）都是 {ok:...} ' +
        'JSON 信封，「拿不到 JSON」只能是别的服务器在代答 —— 页面能打开、但 POST 被拒，' +
        '典型是把页面交给了 IDE 预览 / Live Server 之类的静态服务器。' +
        '请 npm start 后从 http://localhost:3000 打开页面。';
    }
    if (status === 404) {
      return '请求没有到达明账后端：' + detail + '。请确认 npm start 已启动，' +
        '且访问的是 http://localhost:3000，而不是别的端口。';
    }
    return '服务返回了无法解析的内容：' + detail +
      '。多半是被反向代理 / 网关挡了，也可能后端没起（npm start）。';
  }

  /** fetch 直接 reject：断网、DNS、被 CORS 拦、或 file:// 被浏览器拦截。 */
  function offline() {
    var loc = global.location || {};
    if (String(loc.protocol || '') === 'file:') {
      return '当前页面是用 file:// 打开的，浏览器会拦掉所有请求（页面能显示、但数据全是空）。' +
        '请先 npm start，再从 http://localhost:3000 打开。';
    }
    return '无法连接服务器，请确认后端已启动（npm start），并从 http://localhost:3000 打开页面。';
  }

  /**
   * 错误提示钩子。ui.js 加载后用 MZ_UI.toast 覆盖它；
   * 没覆盖时（例如某页没引 ui.js）退回控制台，不弹原生 alert ——
   * alert 会打断用户，是最后手段而不是默认行为。
   */
  var notify = function (err) {
    if (global.console && console.warn) console.warn('[api]', err.code, err.message);
  };

  /* -------------------------------------------------------------------------
   * 请求
   *
   * options:
   *   query  对象，值为 undefined/null/'' 的键自动跳过
   *   body   对象自动 JSON 序列化；FormData 原样发送（浏览器自动生成 multipart boundary）
   *   silent true 时不弹错误提示（调用方自己处理，例如登录页的内联报错）
   *   raw    true 时返回 { data, meta }，用于要读分页 meta 的列表页
   * ----------------------------------------------------------------------- */
  function buildUrl(path, query) {
    var url = path.charAt(0) === '/' ? BASE + path : BASE + '/' + path;
    if (!query) return url;

    var parts = [];
    Object.keys(query).forEach(function (key) {
      var v = query[key];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
    });
    return parts.length ? url + '?' + parts.join('&') : url;
  }

  function request(method, path, options) {
    var opts = options || {};
    var url = buildUrl(path, opts.query);
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var isFormData =
      opts.body !== undefined && global.FormData && opts.body instanceof global.FormData;
    if (opts.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

    return global
      .fetch(url, {
        method: method,
        headers: headers,
        body:
          opts.body === undefined
            ? undefined
            : isFormData
              ? opts.body
              : JSON.stringify(opts.body),
      })
      .then(function (res) {
        // 滑动续期：旧 token 快到期时服务端顺手下发一张新的，这里静默替换。
        // 没有 refresh_token 表，全靠这个响应头。
        var renewed = res.headers.get('X-Refreshed-Token');
        if (renewed) setToken(renewed);

        return res
          .json()
          .catch(function () {
            throw new NetworkError(unparseable(method, url, res.status), {
              status: res.status,
              url: url,
              method: method,
            });
          })
          .then(function (json) {
            if (json && json.ok) {
              return opts.raw ? { data: json.data, meta: json.meta } : json.data;
            }

            var err = json && json.error;
            var apiErr = new ApiError(
              res.status,
              (err && err.code) || 'UNKNOWN',
              (err && err.message) || '请求失败',
              err && err.details
            );

            // 登录态失效：清本地并回登录页。放在这里而不是每个调用点，
            // 是为了不出现「有的页面提示登录过期、有的页面白屏」这种不一致。
            if (res.status === 401 && opts.redirectOn401 !== false) {
              clearSession();
              gotoLogin();
            }
            throw apiErr;
          });
      })
      .catch(function (err) {
        if (!(err instanceof ApiError) && !(err instanceof NetworkError)) {
          // fetch 本身 reject：断网、DNS、被 CORS 拦、file:// 拦截。包一层好让
          // 调用方不用去分辨 TypeError 和业务错误。
          err = new NetworkError(offline(), { url: url, method: method });
        }
        if (!opts.silent) notify(err);
        throw err;
      });
  }

  /** 带登录态下载文件；用于 CSV 导出等非 JSON 响应。 */
  function download(path, filename, options) {
    var opts = options || {};
    var url = buildUrl(path, opts.query);
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return global.fetch(url, { method: 'GET', headers: headers }).then(function (res) {
      var renewed = res.headers.get('X-Refreshed-Token');
      if (renewed) setToken(renewed);
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (json) {
          var err = json && json.error;
          var apiErr = new ApiError(
            res.status,
            (err && err.code) || 'DOWNLOAD_FAILED',
            (err && err.message) || '文件下载失败',
            err && err.details
          );
          if (res.status === 401) {
            clearSession();
            gotoLogin();
          }
          throw apiErr;
        });
      }
      return res.blob().then(function (blob) {
        var objectUrl = global.URL.createObjectURL(blob);
        var link = global.document.createElement('a');
        link.href = objectUrl;
        link.download = filename || 'download';
        link.style.display = 'none';
        global.document.body.appendChild(link);
        link.click();
        link.remove();
        global.setTimeout(function () { global.URL.revokeObjectURL(objectUrl); }, 1000);
      });
    }).catch(function (err) {
      if (!(err instanceof ApiError) && !(err instanceof NetworkError)) {
        err = new NetworkError(offline(), { url: url, method: 'GET' });
      }
      if (!opts.silent) notify(err);
      throw err;
    });
  }

  var MZ_API = {
    BASE: BASE,
    ApiError: ApiError,
    NetworkError: NetworkError,

    getToken: getToken,
    setToken: setToken,
    setSession: setSession,
    getSession: getSession,
    clearSession: clearSession,
    isLoggedIn: function () { return !!getToken(); },
    gotoLogin: gotoLogin,

    /** ui.js 用它把错误显示成 toast */
    setNotifier: function (fn) { if (typeof fn === 'function') notify = fn; },

    request: request,
    download: download,
    get: function (path, query, options) {
      return request('GET', path, merge({ query: query }, options));
    },
    post: function (path, body, options) {
      return request('POST', path, merge({ body: body }, options));
    },
    upload: function (path, formData, options) {
      return request('POST', path, merge({ body: formData }, options));
    },
    put: function (path, body, options) {
      return request('PUT', path, merge({ body: body }, options));
    },
    patch: function (path, body, options) {
      return request('PATCH', path, merge({ body: body }, options));
    },
    del: function (path, body, options) {
      return request('DELETE', path, merge({ body: body }, options));
    },
  };

  function merge(a, b) {
    var out = {};
    var k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
    return out;
  }

  /* ==========================================================================
   * 格式化
   *
   * 后端一律返回 number（DECIMAL 已经在服务端用整数分算过），
   * 所以这里只负责「怎么显示」，不做任何四则运算。
   * ======================================================================== */

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** 千分位 + 固定两位小数。3500 → "3,500.00" */
  function thousands(n, digits) {
    var d = digits === undefined ? 2 : digits;
    var num = Number(n);
    if (!isFinite(num)) return '--';
    var neg = num < 0;
    var fixed = Math.abs(num).toFixed(d);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  var MZ_FMT = {
    /** 带货币符号：648.43 → "¥648.43" */
    money: function (n) { return '¥' + thousands(n, 2); },
    /** 不带符号，用于输入框回填等场景 */
    amount: function (n) { return thousands(n, 2); },
    /** 只保留整数分位不显示小数：3500 → "¥3,500"（大卡片用） */
    moneyInt: function (n) { return '¥' + thousands(n, 0); },

    /** 0~100 的百分数。62.5 → "62.5%"；整数则不显示小数位 */
    percent: function (n, digits) {
      var num = Number(n);
      if (!isFinite(num)) return '--';
      var d = digits === undefined ? 1 : digits;
      var fixed = num.toFixed(d);
      // 62.0 → 62，避免「已用 62.0%」这种别扭的显示
      if (fixed.indexOf('.') !== -1) fixed = fixed.replace(/\.?0+$/, '');
      return fixed + '%';
    },

    /** 进度条宽度用：把 0~100 夹到 0~100，返回 number */
    clampPercent: function (n) {
      var num = Number(n);
      if (!isFinite(num) || num < 0) return 0;
      return num > 100 ? 100 : num;
    },

    /** '2026-09-24 12:30:00' → '2026-09-24'（后端给的一律是 UTC+8 墙上时间字符串） */
    date: function (s) { return s ? String(s).slice(0, 10) : ''; },
    /** → '12:30' */
    time: function (s) { return s ? String(s).slice(11, 16) : ''; },
    /** → '09-24' */
    monthDay: function (s) { return s ? String(s).slice(5, 10) : ''; },

    /**
     * 流水列表用的相对日期：今天 / 昨天 / 09-24。
     * 「今天」按浏览器本地时区判断 —— 演示机与数据库同为 UTC+8，
     * 若将来跨时区部署，这里要改成用服务端下发的 today。
     */
    relDay: function (s) {
      if (!s) return '';
      var day = String(s).slice(0, 10);
      var now = new Date();
      var today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
      var y = new Date(now.getTime() - 86400000);
      var yesterday = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate());
      if (day === today) return '今天';
      if (day === yesterday) return '昨天';
      return day.slice(5);
    },

    /** '2026-09' → '2026 年 9 月' */
    period: function (p) {
      if (!p) return '';
      var m = String(p).split('-');
      return m.length === 2 ? m[0] + ' 年 ' + Number(m[1]) + ' 月' : String(p);
    },

    /** '2026-09' → 2026-08，用于「上一月」按钮 */
    prevPeriod: function (p) {
      var m = String(p || '').split('-');
      if (m.length !== 2) return p;
      var y = Number(m[0]);
      var mo = Number(m[1]) - 1;
      if (mo === 0) { y -= 1; mo = 12; }
      return y + '-' + pad2(mo);
    },
    nextPeriod: function (p) {
      var m = String(p || '').split('-');
      if (m.length !== 2) return p;
      var y = Number(m[0]);
      var mo = Number(m[1]) + 1;
      if (mo === 13) { y += 1; mo = 1; }
      return y + '-' + pad2(mo);
    },
  };

  global.MZ_API = MZ_API;
  global.MZ_FMT = MZ_FMT;

})(window);
