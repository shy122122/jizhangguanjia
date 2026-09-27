/* 前后端接口契约审计。
 *
 * 跨端 App 调用的每一个接口，后端都必须真的有 —— 页面里写错一个路径，
 * 只有点到那一页才会炸，编译期查不出来。这个脚本把两边的清单对一遍。
 *
 * 左边：本工程 pages/ 与 common/ 里所有 api.get/post/put/patch/del/upload('/xxx')
 * 右边：后端代码(后端工程师)/src/routes/*.js 里 router.<method>('/xxx')
 *      （挂载前缀从 routes/index.js 读，/auth 之外都挂在根）
 *
 * 用法：npm run check:api
 */
const fs = require('fs')
const path = require('path')

const APP = path.join(__dirname, '..')
const BACKEND = path.join(APP, '..', '后端代码(后端工程师)', 'src')

/* ---------- 1. 后端路由表 ---------- */
const indexPath = path.join(BACKEND, 'routes', 'index.js')
const indexSrc = fs.readFileSync(indexPath, 'utf8')
const MOUNTS = [...indexSrc.matchAll(/router\.use\(\s*'([^']*)'\s*,\s*require\('\.\/([\w.]+)'\)/g)].map(
  // require 里写的是 './auth.routes'（省略后缀），补上 .js
  (m) => ({ prefix: m[1] === '/' ? '' : m[1], file: /\.js$/.test(m[2]) ? m[2] : m[2] + '.js' })
)

const backend = []
MOUNTS.forEach(({ prefix, file }) => {
  const src = fs.readFileSync(path.join(BACKEND, 'routes', file), 'utf8')
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    backend.push({ method: m[1].toUpperCase(), path: prefix + m[2] })
  }
})

/* ---------- 2. 前端调用 ---------- */
function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (['node_modules', '.git', '.tmp', 'unpackage', 'static'].includes(name)) return
      walk(p, out)
    } else if (/\.(vue|js)$/.test(name)) out.push(p)
  })
  return out
}

const ALIAS = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE', upload: 'POST' }
const calls = []

;[path.join(APP, 'pages'), path.join(APP, 'common')].forEach((root) => {
  walk(root, []).forEach((file) => {
    const src = fs.readFileSync(file, 'utf8')
    const rel = path.relative(APP, file).replace(/\\/g, '/')
    // 允许 api 与 .get 之间换行
    const re = /api\s*\.\s*(get|post|put|patch|del|upload)\s*\(\s*(['"])(\/[^'"]*)\2/g
    for (const m of src.matchAll(re)) {
      calls.push({ method: ALIAS[m[1]], path: m[3], file: rel })
    }
  })
})

/* ---------- 3. 比对 ---------- */
/* 前端写法常常是 api.patch('/accounts/' + id)，字面量只到 '/accounts/' 为止 ——
 * 结尾的斜杠说明后面还拼了一段动态 id，所以这时要求后端路由**比**它多一段。
 * 不带尾斜杠的则是完整路径，段数必须严格相等。 */
function sameRoute(call, route) {
  if (call.method !== route.method) return false
  const dynTail = call.path.endsWith('/')
  const a = call.path.split('/').filter(Boolean)
  const b = route.path.split('/').filter(Boolean)
  if (dynTail) {
    if (b.length <= a.length) return false
  } else if (a.length !== b.length) {
    return false
  }
  return a.every((seg, i) => seg === b[i] || b[i].charAt(0) === ':')
}

const missing = calls.filter((c) => !backend.some((r) => sameRoute(c, r)))

console.log('后端路由：' + backend.length + ' 条')
console.log('前端调用：' + calls.length + ' 处（去重后 ' + new Set(calls.map((c) => c.method + ' ' + c.path)).size + ' 个接口）')

if (missing.length) {
  console.log('\n✗ 这些调用在后端找不到对应路由：')
  missing.forEach((c) => console.log('   ' + c.method + ' ' + c.path + '   ← ' + c.file))
  process.exit(1)
}
console.log('\n✓ 前端调用的每个接口后端都存在')
