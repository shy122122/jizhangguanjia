/* 全工程图标名审计：把静态写死的图标名和 common/icons.js 的码位表对一遍。
 *
 * 为什么需要：图标是字体子集，用到子集里没有的名字会渲染成**空白方块** ——
 * 既不报错也不警告，只有肉眼盯到才发现。这个脚本专抓这种静默错误。
 *
 * 只审计能静态判定的名字：
 *   name="add"               → 审计
 *   :name="cond ? 'a' : 'b'" → 审计里面的字符串字面量
 *   :name="c.icon || 'x'"    → 同样审计 'x'（兜底名最容易漏）
 *   :name="someVar"          → 跳过（运行时才知道）
 * 只看 <mz-icon> 标签，避免把 <slot name="..."> 之类误判成图标名。
 *
 * 用法：npm run check:icons
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const iconsSrc = fs.readFileSync(path.join(ROOT, 'common', 'icons.js'), 'utf8')
const known = new Set([...iconsSrc.matchAll(/([a-z_0-9]+):\s*'\\u/g)].map((m) => m[1]))

function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (['node_modules', '.git', '.tmp', 'unpackage'].includes(name)) return
      walk(p, out)
    } else if (name.endsWith('.vue')) out.push(p)
  })
  return out
}

const TAG = /<mz-icon\b[^>]*>/g
const NAME_ATTR = /\s(name|:name)\s*=\s*"([^"]*)"/g
const LITERAL = /'([a-zA-Z][a-zA-Z_0-9]*)'/g

const used = new Map()

walk(ROOT, []).forEach((file) => {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const add = (n) => {
    if (!used.has(n)) used.set(n, new Set())
    used.get(n).add(rel)
  }
  for (const tag of src.matchAll(TAG)) {
    for (const attr of tag[0].matchAll(NAME_ATTR)) {
      const isBound = attr[1] === ':name'
      const value = attr[2]
      if (!isBound) {
        add(value.trim())
        continue
      }
      // 绑定表达式：把里面的字符串字面量都算作候选名。
      // 先摘掉比较运算里的字符串（x === 'reverted' 里的 'reverted' 是状态值不是图标名）。
      const expr = value.replace(/[!=]==?\s*'[^']*'/g, '')
      let hit = false
      for (const lit of expr.matchAll(LITERAL)) {
        add(lit[1])
        hit = true
      }
      // :name="'add'" 这种整体就是字面量的情况，上面已覆盖
      if (!hit && /^[a-zA-Z][a-zA-Z_0-9]*$/.test(value.trim())) {
        console.log('   （跳过变量）' + rel + '  :name="' + value.trim() + '"')
      }
    }
  }
})

const missing = [...used.keys()]
  .filter((n) => !known.has(n))
  .sort()

console.log('静态可判定的图标名：' + used.size + ' 个')
console.log('字体子集收录：' + known.size + ' 个')
if (missing.length) {
  console.log('\n✗ 子集里没有这些名字（会渲染成空白方块）：')
  missing.forEach((n) => console.log('   ' + n + '   ← ' + [...used.get(n)].join(', ')))
  process.exit(1)
}
console.log('\n✓ 所有静态写死的图标名都在子集里')
