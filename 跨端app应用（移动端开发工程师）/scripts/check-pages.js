/* 页面注册审计：pages.json 里注册的路径，与 pages/ 下真实存在的 .vue 是否一一对应。
 *
 * HBuilderX 不会因为「漏注册一个页面」而报错，只会在跳到那一页时白屏。
 * 用法：npm run check:pages
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf8'))
const listed = cfg.pages.map((p) => p.path)

function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (['node_modules', '.git', '.tmp', 'unpackage'].includes(name)) return
      walk(p, out)
    } else if (name.endsWith('.vue')) {
      out.push(path.relative(ROOT, p).replace(/\\/g, '/').replace(/\.vue$/, ''))
    }
  })
  return out
}

const onDisk = walk(path.join(ROOT, 'pages'), [])
const missing = onDisk.filter((p) => !listed.includes(p))
const ghost = listed.filter((p) => !onDisk.includes(p))

console.log('pages.json 注册：' + listed.length + ' 个页面')
console.log('磁盘实际：' + onDisk.length + ' 个')

if (missing.length) console.log('\n✗ 未注册（跳转会白屏）：\n   ' + missing.join('\n   '))
if (ghost.length) console.log('\n✗ 注册了但文件不存在：\n   ' + ghost.join('\n   '))

if (cfg.tabBar) {
  const tabPaths = cfg.tabBar.list.map((i) => i.pagePath)
  const badTab = tabPaths.filter((p) => !listed.includes(p))
  console.log('\ntabBar：' + cfg.tabBar.list.map((i) => i.text + ' → ' + i.pagePath).join(' | '))
  if (badTab.length) console.log('✗ tabBar 指向未注册的页面：' + badTab.join(', '))
}

if (missing.length || ghost.length) process.exit(1)
console.log('\n✓ 页面注册与文件一一对应')
