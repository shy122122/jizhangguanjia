/* 离线校验：把所有 .vue 的 template 用 Vue 编译器过一遍，style 用 sass 编译一遍。
 * 不依赖 HBuilderX —— 只为在写代码的当下就发现模板/样式语法错误。
 * 用法：npm run check:vue
 */
const fs = require('fs')
const path = require('path')
const { parse, compileTemplate, compileScript } = require('@vue/compiler-sfc')
const sass = require('sass')

const ROOT = path.join(__dirname, '..')

function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === '.tmp' || name === 'unpackage') return
      walk(p, out)
    } else if (name.endsWith('.vue')) out.push(p)
  })
  return out
}

// uni-app 会把 uni.scss 自动注入每个组件的 style，这里手动补上以还原真实编译环境
const UNI_SCSS = fs.readFileSync(path.join(ROOT, 'uni.scss'), 'utf8')

let errors = 0

walk(ROOT, []).forEach((file) => {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  const { descriptor, errors: parseErrs } = parse(src, { filename: file })

  if (parseErrs && parseErrs.length) {
    errors += parseErrs.length
    console.log('PARSE FAIL ' + rel)
    parseErrs.forEach((e) => console.log('   ' + e.message))
    return
  }

  // 1. 模板
  if (descriptor.template) {
    const r = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: rel,
    })
    if (r.errors && r.errors.length) {
      errors += r.errors.length
      console.log('TEMPLATE FAIL ' + rel)
      r.errors.forEach((e) => console.log('   ' + (e.message || e)))
    }
  }

  // 2. 脚本（SFC 编译，会顺带查出 setup/宏 的语法问题）
  try {
    compileScript(descriptor, { id: rel })
  } catch (e) {
    errors += 1
    console.log('SCRIPT FAIL ' + rel + '\n   ' + e.message)
  }

  // 3. 样式
  descriptor.styles.forEach((style, i) => {
    if (style.lang !== 'scss') return
    const code = (style.content || '').replace(/@import\s+'\.\.?\//g, "@import '") // 兜底，正常不会命中
    try {
      sass.compileString(UNI_SCSS + '\n' + code, {
        loadPaths: [ROOT],
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      })
    } catch (e) {
      errors += 1
      console.log('STYLE FAIL ' + rel + ' (block ' + i + ')')
      console.log('   ' + String(e.message).split('\n').slice(0, 6).join('\n   '))
    }
  })
})

console.log(errors ? '\n' + errors + ' 处错误' : '\n全部通过：template / script / style 均可编译')
process.exit(errors ? 1 : 0)
