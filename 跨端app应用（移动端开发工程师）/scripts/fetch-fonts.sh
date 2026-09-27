#!/usr/bin/env bash
# 从 Google Fonts 拉取「按需子集」的字体，落到 .tmp/ 供 build-assets.js / build-tabbar.py 消费。
#
# 为什么非得做子集：微信小程序主包上限 2MB，完整的 Material Symbols 可变字体约 3.5MB，
# 直接塞进去必然超限。这里只请求工程真正用到的 200 个图标 + 基本拉丁字符，
# 结果不到 40KB —— 顺带也避免了 CDN 在小程序里不可用（需要域名白名单）的问题。
#
# 用法：bash scripts/fetch-fonts.sh        （需要联网；产物已提交，平时不用跑）
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p .tmp

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
GF='https://fonts.googleapis.com'
GF_META='https://fonts.google.com'

# ── 1. 图标名 → PUA 码点（Material Symbols 官方元数据，6MB JSON）──────────────
# 注意元数据在 fonts.google.com，字体文件在 fonts.googleapis.com，两个域名别弄混。
curl -s -m 180 -A "$UA" "$GF_META/metadata/icons?incomplete=true&key=material_symbols" -o .tmp/meta.json
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('.tmp/meta.json','utf8').replace(/^\)\]\}'\s*/,''));
const map = {};
j.icons.forEach(i => { map[i.name] = i.codepoint; });
// 原型里有两个写错的图标名，落到最接近的官方图标上（见 build-assets.js 的同名 alias）
const alias = { auto_fix: 'auto_fix_high', magic_button: 'auto_awesome' };
const resolve = n => map[alias[n]] || map[n];
const names = fs.readFileSync('scripts/icons.txt','utf8').split(/\s+/).filter(Boolean);
const missing = names.filter(n => !resolve(n));
if (missing.length) throw new Error('元数据里没有这些图标: ' + missing.join(' '));
fs.writeFileSync('.tmp/pua.txt', names.map(n => String.fromCodePoint(resolve(n))).join(''), 'utf8');
const out = {};
names.forEach(n => { out[n] = '\\\\u' + resolve(n).toString(16).padStart(4,'0'); });
fs.writeFileSync('.tmp/icons-map.js', 'module.exports = ' + JSON.stringify(out, null, 2) + ';\n', 'utf8');
console.log('icons resolved:', names.length);
"

# ── 2. 图标字体子集（PUA 形式，不用连字 —— 小程序对 liga 支持不稳）──────────
PUA=$(node -e "console.log(encodeURIComponent(require('fs').readFileSync('.tmp/pua.txt','utf8')))")
curl -s -m 60 -A "$UA" "$GF/css2?family=Material+Symbols+Outlined&text=$PUA" -o .tmp/ms-pua.css
curl -s -m 60 -o .tmp/mz-icons.woff2 "$(grep -oE 'https://fonts.gstatic.com/[^)]+' .tmp/ms-pua.css | head -1)"

# ── 3. Manrope 子集（数字与拉丁字母；中文由系统字体兜底）─────────────────────
CHARS=' !"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_abcdefghijklmnopqrstuvwxyz{|}~¥—·、：（）'
ENC=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$CHARS")
curl -s -m 60 -A "$UA" "$GF/css2?family=Manrope:wght@400;500;600;700;800&text=$ENC" -o .tmp/manrope.css
curl -s -m 60 -o .tmp/mz-manrope.woff2 "$(grep -oE 'https://fonts.gstatic.com/[^)]+' .tmp/manrope.css | head -1)"

# ── 4. woff2 → ttf：只有栅格化 tabBar 图标才需要（Pillow 读不了 woff2）──────
python - <<'PY'
from fontTools.ttLib import TTFont
f = TTFont('.tmp/mz-icons.woff2'); f.flavor = None
f.save('.tmp/mz-icons-decompressed.ttf')
print('ttf ready:', f['name'].getDebugName(1))
PY

ls -la .tmp/*.woff2 .tmp/*.ttf
echo "OK. 接着跑： node scripts/build-assets.js && python scripts/build-tabbar.py"
