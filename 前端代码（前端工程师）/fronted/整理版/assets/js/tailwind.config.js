/* ============================================================================
 * 明账（MingZhang）· Tailwind 主题配置
 * 依据：PRD v1.2 第 13 章「视觉设计规范（配色系统）」
 *
 * 设计原则（PRD 决策 #13）：所有色值取自 Tailwind 默认色板，不引入自定义色值。
 *
 * 【两层结构】
 *   第一层 brand / accent / slate —— PRD 原生调色板，新代码请优先使用。
 *   第二层 语义 token 层 —— 原型沿用 Google Stitch 的 Material 3 角色命名
 *          （primary / on-surface / surface-container 等）。
 *          此处把它们的**取值**整体重映射到 PRD 调色板，
 *          从而 23 个原型页面无需改动类名即可对齐品牌色。
 *
 * 【关键约束】PRD 13.9 对比度硬性规则：
 *   · #14B8A6（brand-500）与 #F59E0B（amber-500）**永不作文字色**，仅作图填充。
 *   · 支出金额一律 #0F172A（ink），绝不标红。红色只留给超支 / 删除 / 错误。
 * ========================================================================== */

/* 语义 token 的取值存放在 assets/css/tokens.css 的 --mz-* 变量里（RGB 通道形式）。
 * 这里只做引用，好处有二：
 *   1. html.dark 一加，23 页的语义色整体翻转，无需逐页写 dark: 变体；
 *   2. 保留 Tailwind 的 /透明度 语法（bg-surface-bright/80 仍然可用）。
 * 改配色请改 tokens.css，不要在这里写死色值。 */
function mz(name) {
  return 'rgb(var(--mz-' + name + ') / <alpha-value>)';
}

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {

      /* ---------------------------------------------------------------
       * 颜色
       * ------------------------------------------------------------- */
      colors: {
        /* ── PRD 13.2 品牌主色：青（Teal）── */
        brand: {
          50:  '#F0FDFA', 100: '#CCFBF1', 200: '#99F6E4', 300: '#5EEAD4',
          400: '#2DD4BF', 500: '#14B8A6', 600: '#0D9488', 700: '#0F766E',
          800: '#115E59', 900: '#134E4A',
        },

        /* ── PRD 13.3 辅助色：青蓝（Cyan）── */
        accent: {
          50:  '#ECFEFF', 100: '#CFFAFE', 200: '#A5F3FC', 300: '#67E8F9',
          400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2', 700: '#0E7490',
          800: '#155E75', 900: '#164E63',
        },

        /* ── PRD 13.4 / 13.5 中性色与语义色（快捷别名）──
         * brand / accent 数字梯度保持为字面色板引用（选 brand-500 就是 #14B8A6，
         * 不随主题变），语义别名则跟随主题翻转。 */
        canvas: mz('canvas'),    // 页面背景
        ink:    mz('ink'),       // 主要文字 / 支出金额
        warn:   mz('warn'),      // 预算接近上限（仅图标 / 底色）
        warnInk:mz('warn-ink'),  // 预警文字（AA 可用）
        danger: mz('danger'),    // 预算超支 / 删除 / 错误

        /* ── 语义 token 层：Material 3 角色名 → tokens.css 变量 ── */

        /* 表面 / 背景 */
        background:                  mz('background'),
        surface:                     mz('surface'),
        'surface-bright':            mz('surface-bright'),
        'surface-container-lowest':  mz('surface-container-lowest'),
        'surface-container-low':     mz('surface-container-low'),
        'surface-container':         mz('surface-container'),
        'surface-container-high':    mz('surface-container-high'),
        'surface-container-highest': mz('surface-container-highest'),
        'surface-variant':           mz('surface-variant'),
        'surface-dim':               mz('surface-dim'),
        'surface-tint':              mz('surface-tint'),

        /* 前景 / 文字 */
        'on-surface':                mz('on-surface'),
        'on-surface-variant':        mz('on-surface-variant'),
        'on-background':             mz('on-background'),
        'inverse-surface':           mz('inverse-surface'),
        'inverse-on-surface':        mz('inverse-on-surface'),

        /* 描边 */
        outline:                     mz('outline'),
        'outline-variant':           mz('outline-variant'),

        /* 主色角色（青） */
        primary:                     mz('primary'),
        'on-primary':                mz('on-primary'),
        'primary-container':         mz('primary-container'),
        'on-primary-container':      mz('on-primary-container'),
        'inverse-primary':           mz('inverse-primary'),
        'primary-fixed':             mz('primary-fixed'),
        'primary-fixed-dim':         mz('primary-fixed-dim'),
        'on-primary-fixed':          mz('on-primary-fixed'),
        'on-primary-fixed-variant':  mz('on-primary-fixed-variant'),

        /* 辅色角色（青蓝） */
        secondary:                   mz('secondary'),
        'on-secondary':              mz('on-secondary'),
        'secondary-container':       mz('secondary-container'),
        'on-secondary-container':    mz('on-secondary-container'),
        'secondary-fixed':           mz('secondary-fixed'),
        'secondary-fixed-dim':       mz('secondary-fixed-dim'),
        'on-secondary-fixed':        mz('on-secondary-fixed'),
        'on-secondary-fixed-variant':mz('on-secondary-fixed-variant'),

        /* 错误角色（仅超支 / 删除 / 错误） */
        error:                       mz('error'),
        'on-error':                  mz('on-error'),
        'error-container':           mz('error-container'),
        'on-error-container':        mz('on-error-container'),

        /* 第三色角色 */
        tertiary:                    mz('tertiary'),
        'tertiary-container':        mz('tertiary-container'),
        'on-tertiary':               mz('on-tertiary'),
        'on-tertiary-container':     mz('on-tertiary-container'),
        'tertiary-fixed':            mz('tertiary-fixed'),
        'tertiary-fixed-dim':        mz('tertiary-fixed-dim'),
        'on-tertiary-fixed':         mz('on-tertiary-fixed'),
        'on-tertiary-fixed-variant': mz('on-tertiary-fixed-variant'),
      },

      /* ---------------------------------------------------------------
       * 渐变（PRD 13.7）
       * ------------------------------------------------------------- */
      backgroundImage: {
        'brand-gradient':      'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #F0FDFA 0%, #ECFEFF 100%)',
        'brand-gradient-dark': 'linear-gradient(135deg, #0D9488 0%, #0E7490 100%)',
      },

      /* ---------------------------------------------------------------
       * 字体
       * Manrope 为原型既定字体；数字统一启用等宽数位（tnum），
       * 保证流水、表格中的金额纵向对齐。
       * ------------------------------------------------------------- */
      fontFamily: {
        sans: ['Manrope', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        'display-lg':        ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'display-lg-mobile': ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'headline-lg':       ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'headline-lg-mobile':['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'headline-md':       ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'headline-sm':       ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'body-lg':           ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'body-md':           ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'body-sm':           ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'label-lg':          ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'label-md':          ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'label-sm':          ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'numeric-hero':      ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
        'numeric-data':      ['Manrope', 'PingFang SC', 'system-ui', 'sans-serif'],
      },

      /* ---------------------------------------------------------------
       * 字阶（沿用原型既有刻度）
       * ------------------------------------------------------------- */
      fontSize: {
        'display-lg':        ['3rem',     { lineHeight: '3.5rem',  letterSpacing: '-0.03em',  fontWeight: '700' }],
        'display-lg-mobile': ['2.25rem',  { lineHeight: '2.75rem', letterSpacing: '-0.025em', fontWeight: '700' }],
        'headline-lg':       ['2rem',     { lineHeight: '2.5rem',  letterSpacing: '-0.02em',  fontWeight: '700' }],
        'headline-lg-mobile':['1.5rem',   { lineHeight: '2rem',    letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-md':       ['1.25rem',  { lineHeight: '1.75rem', letterSpacing: '-0.01em',  fontWeight: '600' }],
        'headline-sm':       ['1.125rem', { lineHeight: '1.5rem',  fontWeight: '600' }],
        'body-lg':           ['1rem',     { lineHeight: '1.5rem',  fontWeight: '400' }],
        'body-md':           ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'body-sm':           ['0.75rem',  { lineHeight: '1rem',    fontWeight: '400' }],
        'label-lg':          ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.01em',  fontWeight: '600' }],
        'label-md':          ['0.75rem',  { lineHeight: '1rem',    letterSpacing: '0.02em',  fontWeight: '600' }],
        'label-sm':          ['0.6875rem',{ lineHeight: '0.875rem',letterSpacing: '0.025em', fontWeight: '500' }],
        'numeric-hero':      ['2.25rem',  { lineHeight: '2.5rem',  letterSpacing: '-0.02em',  fontWeight: '700' }],
        'numeric-data':      ['1.125rem', { lineHeight: '1.5rem',  letterSpacing: '-0.01em',  fontWeight: '600' }],
      },

      /* ---------------------------------------------------------------
       * 间距与圆角（沿用原型刻度；PRD 未规定，保持视觉一致性）
       * ------------------------------------------------------------- */
      spacing: {
        'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '1rem',
        'space-lg': '1.5rem',  'space-xl': '2rem',
        'margin': '1rem', 'margin-md': '1.5rem', 'margin-lg': '2rem',
        'gutter': '1rem', 'gutter-lg': '1.5rem',
      },
      borderRadius: {
        DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', full: '9999px',
      },

      /* ---------------------------------------------------------------
       * 动效（PRD 7.2 关键微交互）
       * ------------------------------------------------------------- */
      transitionTimingFunction: {
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        /* PRD 7.2：预算超支进度条轻微抖动，1 次不循环 */
        'shake-once': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-3px)' },
          '40%':      { transform: 'translateX(3px)' },
          '60%':      { transform: 'translateX(-2px)' },
          '80%':      { transform: 'translateX(2px)' },
        },
      },
      animation: {
        'sheet-in':   'sheet-in 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in':    'fade-in 240ms ease-out both',
        'shake-once': 'shake-once 400ms ease-in-out 1',
      },
    },
  },
};
