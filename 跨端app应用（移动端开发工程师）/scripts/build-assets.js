/* 把 .tmp 里下载好的字体子集转成工程内的产物：
 *   1. styles/_fonts.scss   —— base64 内联 @font-face（H5 / App / 微信小程序三端通吃）
 *   2. common/icons.js      —— Material Symbols 图标名 → PUA 码点字符
 *
 * 为什么用 PUA 码点而不是 ligature（连字）：
 *   连字依赖 font-feature-settings:'liga'，微信小程序的渲染层对它支持不稳定；
 *   PUA 码点就是普通字符，三端都能直接画出来。
 *
 * 依赖 .tmp/mz-icons.woff2、.tmp/mz-manrope.woff2、.tmp/icons-map.js，
 * 这三个文件由 scripts/fetch-fonts.sh 生成。产物已提交，日常开发不用重跑。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TMP = path.join(ROOT, '.tmp')

function b64(file) {
  return fs.readFileSync(path.join(TMP, file)).toString('base64')
}

/* ------------------------------------------------------------------ fonts */
const iconsB64 = b64('mz-icons.woff2')
const manropeB64 = b64('mz-manrope.woff2')

const scss = `/* 由 scripts/build-assets.js 生成，请勿手改。
 * 字体已按「本工程真正用到的字符」做过子集裁剪（Material Symbols 196 个图标 /
 * Manrope 基本拉丁+数字）。子集由 Google Fonts 的 text= 参数生成，不含多余字形。
 *
 * 内联 base64 而不是引本地文件，是因为微信小程序的 WXSS 不支持 url() 指向包内
 * 字体文件，只有 https 与 data: 两种来源可用；data: 顺手把 H5 / App 也统一了。
 */

@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 400;
  src: url('data:font/woff2;base64,${iconsB64}') format('woff2');
}

@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 100 900;
  src: url('data:font/woff2;base64,${manropeB64}') format('woff2');
}
`

fs.writeFileSync(path.join(ROOT, 'styles', '_fonts.scss'), scss, 'utf8')
console.log('styles/_fonts.scss', (scss.length / 1024).toFixed(1) + 'KB')

/* ------------------------------------------------------------------ icons */
const map = require(path.join(TMP, 'icons-map.js'))
const alias = { auto_fix: 'auto_fix_high', magic_button: 'auto_awesome' }

const resolved = {}
Object.keys(map).forEach(function (name) {
  resolved[name] = map[name]
})
Object.keys(alias).forEach(function (name) {
  resolved[name] = map[alias[name]]
})

const names = Object.keys(resolved).sort()
const lines = names.map(function (n) {
  return `  ${n}: '\\u${resolved[n].slice(2)}',`
})

const js = `/* 由 scripts/build-assets.js 生成，请勿手改。
 *
 * Material Symbols Outlined 的「图标名 → PUA 码点」映射。
 * 只有这张表里的图标被裁进了 static 字体子集，写表外的名字会显示成空白方块。
 * 新增图标：把名字加进 scripts/fetch-fonts.sh 的 ICONS，重跑两个脚本。
 */
const GLYPHS = {
${lines.join('\n')}
}

/** 名字不在表里时退回 category（通用占位），保证永远不会渲染成空白。 */
export function glyph(name) {
  return GLYPHS[name] || GLYPHS.category || ''
}

export default GLYPHS
`

fs.writeFileSync(path.join(ROOT, 'common', 'icons.js'), js, 'utf8')
console.log('common/icons.js', names.length, 'icons')
