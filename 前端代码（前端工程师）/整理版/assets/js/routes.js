/* ============================================================================
 * 明账（MingZhang）· 原型路由表
 *
 * 本文件是整个原型的**唯一导航事实来源**，被三处消费：
 *   1. assets/js/shell.js    —— 渲染侧边栏 / 顶栏 / 底部 Tab，并判定当前激活项
 *   2. assets/js/shell.js    —— 渲染页面右侧的「状态切换器」浮层
 *   3. index.html            —— 渲染原型导航台的分组卡片
 *
 * 页面文件命名规范：NN-<模块>-<状态>.html
 *   · NN  —— 两位序号，与「UI原型（美术设计）」中的导出顺序一一对应
 *   · 模块 —— onboarding / home / budget / record / ledger / stats / import / settings
 *   · 状态 —— 该模块下的具体状态或子页面
 *
 * 新增页面只需在本表登记，导航、切换器、导航台会自动包含它。
 * ========================================================================== */

(function (global) {
  'use strict';

  /* -------------------------------------------------------------------------
   * 模块定义
   * 顺序即导航台中的展示顺序，也决定了「状态切换器」里的上下页关系。
   * ----------------------------------------------------------------------- */
  var MODULES = [
    {
      key: 'onboarding',
      name: '引导与账号',
      icon: 'waving_hand',
      desc: '冷启动破冰链路：落地页 → 首次进入 → 找回密码与帮助。对应 PRD 4.1 账号体系。',
      prd: '4.1 / 2.3',
    },
    {
      key: 'home',
      name: '首页（预算穿透状态矩阵）',
      icon: 'space_dashboard',
      desc: '同一个首页在四种预算健康度下的表现：平稳 → 配额 → 告急 → 穿透，以及总预算赤字态。' +
           '这是产品差异化的主战场，对应 PRD 4.4.2「今日可花」与 4.4.4「超支预警」。',
      prd: '4.4.2 / 4.4.4 / 4.6.1',
    },
    {
      key: 'budget',
      name: '预算管控',
      icon: 'pie_chart',
      desc: '未设预算时的配置向导，与已设预算后的总预算看板。对应 PRD 4.4.1 / 4.4.3。',
      prd: '4.4',
    },
    {
      key: 'record',
      name: '记账面板',
      icon: 'edit_note',
      desc: '底部抽屉浮层，数字键盘常驻、支持四则运算与连续记账。全产品的生命线，' +
           '目标单笔 ≤ 8 秒。对应 PRD 4.2。',
      prd: '4.2 / 7.2',
    },
    {
      key: 'ledger',
      name: '流水明细',
      icon: 'receipt_long',
      desc: '新账本空态 → 列表与筛选 → 筛选无结果。对应 PRD 4.5 与 7.3 空状态设计。',
      prd: '4.5 / 7.3',
    },
    {
      key: 'stats',
      name: '消费洞察',
      icon: 'monitoring',
      desc: '概览看板 → 待激活空态 → 分类下钻。对应 PRD 4.6 数据统计与洞察。',
      prd: '4.6',
    },
    {
      key: 'import',
      name: '账单导入',
      icon: 'file_upload',
      desc: '导入主页面 → 成功与撤销 → 异常诊断。解决冷启动无数据问题。对应 PRD 4.3。',
      prd: '4.3',
    },
    {
      key: 'settings',
      name: '个人与设置',
      icon: 'tune',
      desc: '设置目录总览 → 分类管理 → 数据与隐私。对应 PRD 4.7。',
      prd: '4.7',
    },
  ];

  /* -------------------------------------------------------------------------
   * 页面清单
   *   key      —— 唯一标识，用于页面间跳转（如 href="?p=..." 或 data-goto）
   *   title    —— 导航台卡片标题
   *   short    —— 状态切换器里的短标签
   *   module   —— 所属模块 key
   *   prd      —— 对应的 PRD 章节，便于评审时对照
   *   note     —— 一句话说明该状态的设计意图
   * ----------------------------------------------------------------------- */
  var PAGES = [
    /* ── 引导与账号 ─────────────────────────────────────────────── */
    { key: 'onboarding-landing',  file: '01-onboarding-landing.html',  module: 'onboarding',
      title: '落地页与登录注册', short: '落地页', prd: '4.1.2',
      note: '产品价值主张 + 注册登录入口。首屏不强制登录，保留免登录试用通道。' },
    { key: 'onboarding-coldstart', file: '02-onboarding-coldstart.html', module: 'onboarding',
      title: '首次进入冷启动', short: '冷启动', prd: '2.3 / 4.3.1',
      note: '注册后最大流失点。用「导入历史账单」替代空白图表，当天就能看到消费画像。' },
    { key: 'onboarding-help',     file: '03-onboarding-help.html',     module: 'onboarding',
      title: '找回密码与帮助', short: '帮助', prd: '4.1.2',
      note: '密码重置与常见问题排查，降低账号环节的流失。' },

    /* ── 首页：预算穿透状态矩阵 ─────────────────────────────────── */
    { key: 'home-calm',      file: '04-home-calm.html',      module: 'home',
      title: '首页 · 平稳态', short: '平稳', prd: '4.6.1',
      note: '预算消耗率在安全线内。今日可花正常显示，无任何预警色。' },
    { key: 'home-quota',     file: '05-home-quota.html',     module: 'home',
      title: '首页 · 今日安全配额', short: '配额', prd: '4.4.2',
      note: '聚焦「今日可花」大卡片本身：剩余预算 ÷ 剩余天数 的完整演算过程。' },
    { key: 'home-alert',     file: '06-home-alert.html',     module: 'home',
      title: '首页 · 告急态', short: '告急', prd: '4.4.4',
      note: '总预算剩余 < 20%。首页顶部出现黄色内联提示条——注意不是弹窗。' },
    { key: 'home-critical',  file: '07-home-critical.html',  module: 'home',
      title: '首页 · 濒临穿透', short: '穿透', prd: '4.4.2 / 4.4.4',
      note: '剩余预算接近 0。今日可花逼近下限，预警升级但仍不打断记账。' },
    { key: 'home-overspent', file: '08-budget-overspent.html', module: 'home',
      title: '首页 · 总预算赤字', short: '赤字', prd: '4.4.4',
      note: '已超支。这是全站少数允许出现红色的场景之一，今日可花归零。' },

    /* ── 预算管控 ─────────────────────────────────────────────── */
    { key: 'budget-setup',    file: '09-budget-setup.html',    module: 'budget',
      title: '冷启动配置向导', short: '配置向导', prd: '4.4.3 / 7.3',
      note: '未设预算时的引导。空状态必须给出下一步动作与智能推荐额度。' },
    { key: 'budget-overview', file: '10-budget-overview.html', module: 'budget',
      title: '总预算看板', short: '总预算看板', prd: '4.4.3',
      note: '总预算 + 分类预算的完整管控视图，含分类合计校验提示。' },

    /* ── 记账面板 ─────────────────────────────────────────────── */
    { key: 'record-sheet',    file: '11-record-sheet.html',    module: 'record',
      title: '记账面板', short: '记账面板', prd: '4.2 / 7.2',
      note: '数字键盘常驻、金额四则运算、分类九宫格常用前置、连续记账开关。' },

    /* ── 流水明细 ─────────────────────────────────────────────── */
    { key: 'ledger-empty',    file: '12-ledger-empty.html',    module: 'ledger',
      title: '新账本空态', short: '空态', prd: '7.3',
      note: '空状态提供明确的下一步动作，绝不出现「暂无数据」这类无信息占位。' },
    { key: 'ledger-list',     file: '13-ledger-list.html',     module: 'ledger',
      title: '列表与筛选', short: '列表筛选', prd: '4.5.1 / 4.5.2',
      note: '按日期分组，每笔显示分类图标、备注、金额、账户。含筛选与搜索。' },
    { key: 'ledger-noresult', file: '14-ledger-noresult.html', module: 'ledger',
      title: '筛选结果空态', short: '无结果', prd: '4.5.2',
      note: '筛选无命中时提供清除条件的出口，而不是死路。' },

    /* ── 消费洞察 ─────────────────────────────────────────────── */
    { key: 'stats-overview',  file: '15-stats-overview.html',  module: 'stats',
      title: '概览看板', short: '概览', prd: '4.6.2',
      note: '概览 / 分类 / 趋势 三 Tab，含消费日历热力图。' },
    { key: 'stats-empty',     file: '16-stats-empty.html',     module: 'stats',
      title: '待激活空态', short: '空态', prd: '7.3',
      note: '「记录满 3 天后，这里会出现你的消费洞察」——给出明确预期而非空白。' },
    { key: 'stats-category',  file: '17-stats-category.html',  module: 'stats',
      title: '餐饮分类下钻', short: '分类下钻', prd: '4.6.2',
      note: '从分类排行下钻到该分类的多月趋势与穿透流水明细。' },

    /* ── 账单导入 ─────────────────────────────────────────────── */
    { key: 'import-main',     file: '18-import-main.html',     module: 'import',
      title: '导入主页面', short: '主页面', prd: '4.3.2',
      note: '粘贴文本 + CSV 上传双通道，账单文件浏览器端解析不上传。' },
    { key: 'import-success',  file: '19-import-success.html',  module: 'import',
      title: '成功与撤销', short: '成功撤销', prd: '4.3.3 / 4.3.4',
      note: '导入后可整批撤销，有效期 10 分钟；同时展示导入批次历史。' },
    { key: 'import-diagnose', file: '20-import-diagnose.html', module: 'import',
      title: '异常诊断', short: '异常诊断', prd: '4.3.2 / 11',
      note: '针对性处理微信加密账单、年份缺失、字段错位等解析失败场景。' },

    /* ── 个人与设置 ───────────────────────────────────────────── */
    { key: 'settings-index',      file: '21-settings-index.html',      module: 'settings',
      title: '目录总览', short: '目录总览', prd: '4.7',
      note: '账号、账本、分类、账户、数据、关于的集散页。' },
    { key: 'settings-categories', file: '22-settings-categories.html', module: 'settings',
      title: '分类管理', short: '分类管理', prd: '4.7',
      note: '增删改分类、图标与颜色自定义、排序。' },
    { key: 'settings-privacy',    file: '23-settings-privacy.html',    module: 'settings',
      title: '数据与隐私', short: '数据隐私', prd: '4.7 / 8',
      note: '本地金钥存储库、全量镜像冷备份、一键导出与彻底删除。' },
  ];

  /* -------------------------------------------------------------------------
   * 主导航（PRD 5.1 站点地图 / 5.2 移动端底部 Tab）
   * 每一项指向该模块的「默认落地页」。
   * ----------------------------------------------------------------------- */
  var NAV = [
    { key: 'dashboard',    label: '首页概览', icon: 'space_dashboard', module: 'home',     page: 'home-calm' },
    { key: 'transactions', label: '流水明细', icon: 'receipt_long',    module: 'ledger',   page: 'ledger-list' },
    { key: 'budgets',      label: '预算管控', icon: 'pie_chart',       module: 'budget',   page: 'budget-overview' },
    { key: 'analytics',    label: '消费洞察', icon: 'monitoring',      module: 'stats',    page: 'stats-overview' },
    { key: 'bill-import',  label: '账单导入', icon: 'file_upload',     module: 'import',   page: 'import-main' },
    { key: 'settings',     label: '个人与设置', icon: 'tune',          module: 'settings', page: 'settings-index' },
  ];

  /* -------------------------------------------------------------------------
   * 工具方法
   * ----------------------------------------------------------------------- */
  var byKey = {};
  var byFile = {};
  PAGES.forEach(function (p) {
    byKey[p.key] = p;
    byFile[p.file] = p;
  });

  var api = {
    MODULES: MODULES,
    PAGES: PAGES,
    NAV: NAV,

    module: function (key) {
      for (var i = 0; i < MODULES.length; i++) if (MODULES[i].key === key) return MODULES[i];
      return null;
    },
    page: function (key) { return byKey[key] || null; },
    fromFile: function (file) { return byFile[file] || null; },
    pagesOf: function (moduleKey) {
      return PAGES.filter(function (p) { return p.module === moduleKey; });
    },
    /** 该页面所属模块内的前一个 / 后一个页面，用于状态切换器 */
    siblings: function (key) {
      var p = byKey[key];
      if (!p) return { prev: null, next: null, index: -1, total: 0 };
      var list = api.pagesOf(p.module);
      var i = list.findIndex(function (x) { return x.key === key; });
      return { prev: i > 0 ? list[i - 1] : null, next: i < list.length - 1 ? list[i + 1] : null, index: i, total: list.length };
    },
    /** 生成从当前页面到目标页面的相对链接 */
    href: function (key) {
      var p = byKey[key];
      return p ? p.file : '#';
    },
  };

  global.MZ_ROUTES = api;

  /* 兼容旧原型：把导航项绑定到真实页面，替代原先的 href="#" */
  global.MZ_NAV_HREF = {};
  NAV.forEach(function (n) { global.MZ_NAV_HREF[n.key] = byKey[n.page].file; });

})(window);
