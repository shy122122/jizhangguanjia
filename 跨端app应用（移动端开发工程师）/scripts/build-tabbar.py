# -*- coding: utf-8 -*-
"""生成原生 tabBar 图标与品牌图。

原生 tabBar 只认 png/jpg，不认图标字体，所以这几个图标必须提前栅格化。
栅格化用的是同一套 Material Symbols 字体（经 fontTools 从 woff2 解出来的 ttf），
因此 tab 上的图形和应用内图标字体是同一份字形的两个出口，不会走样。

依赖 .tmp/mz-icons-decompressed.ttf —— 由 scripts/fetch-fonts.sh 生成。
产物已提交，改图标时才需要重跑本脚本。
"""
import os
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTF = os.path.join(ROOT, '.tmp', 'mz-icons-decompressed.ttf')

INACTIVE = (100, 116, 139, 255)   # --text-secondary  #64748B
ACTIVE = (15, 118, 110, 255)      # --mz-primary     #0F766E
BRAND_FROM = (20, 184, 166)       # #14B8A6
BRAND_TO = (6, 182, 212)          # #06B6D4

# tab 名 → Material Symbols 图标名（与 shell.js 底部 Tab 完全对应）
TABS = {
    'home': 'space_dashboard',
    'ledger': 'receipt_long',
    'record': 'add',
    'stats': 'monitoring',
    'settings': 'tune',
}

ICON_PX = 81          # 微信小程序 tabBar 推荐尺寸
GLYPH_PX = 66         # 字形略小于画布，留出视觉边距


def load_glyphs():
    """从 common/icons.js 读回「图标名 → PUA 码点」，避免两处各写一份。"""
    src = open(os.path.join(ROOT, 'common', 'icons.js'), encoding='utf-8').read()
    out = {}
    for name, hexcode in re.findall(r"^  ([a-z0-9_]+): '\\u([0-9a-f]{4})',$", src, re.M):
        out[name] = chr(int(hexcode, 16))
    return out


def gradient_rrect(size, radius, c1, c2):
    """品牌渐变圆角方块：先生成对角渐变底，再用圆角蒙版裁切。"""
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            px[x, y] = (
                round(c1[0] + (c2[0] - c1[0]) * t),
                round(c1[1] + (c2[1] - c1[1]) * t),
                round(c1[2] + (c2[2] - c1[2]) * t),
                255,
            )
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def draw_logo(size=160):
    """logo.svg 的等价像素版：品牌渐变圆角方块 + 三段递减横条。"""
    img = gradient_rrect(size, round(size * 11 / 40), BRAND_FROM, BRAND_TO)
    d = ImageDraw.Draw(img)

    def bar(y_ratio, w_ratio, alpha):
        x = size * 11 / 40
        y = size * y_ratio
        w = size * w_ratio
        h = size * 3.4 / 40
        d.rounded_rectangle([x, y, x + w, y + h], radius=h / 2, fill=(255, 255, 255, alpha))

    bar(12.5 / 40, 18 / 40, 140)
    bar(18.3 / 40, 13 / 40, 204)
    bar(24.1 / 40, 7 / 40, 255)
    return img


def draw_avatar(size=192):
    """avatar.svg 的等价像素版：浅青渐变圆底 + 深青人形。"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    c1, c2 = (204, 251, 241), (207, 250, 254)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            px[x, y] = (
                round(c1[0] + (c2[0] - c1[0]) * t),
                round(c1[1] + (c2[1] - c1[1]) * t),
                round(c1[2] + (c2[2] - c1[2]) * t),
                255,
            )
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)

    d = ImageDraw.Draw(out)
    ink = (15, 118, 110, 255)
    r = size * 10.5 / 64
    cx, cy = size / 2, size * 25 / 64
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ink)
    d.ellipse([cx - size * 21.4 / 64, size * 39 / 64, cx + size * 21.4 / 64, size * 1.45], fill=ink)
    return out


def main():
    glyphs = load_glyphs()
    font = ImageFont.truetype(TTF, GLYPH_PX)
    tabdir = os.path.join(ROOT, 'static', 'tabbar')
    imgdir = os.path.join(ROOT, 'static', 'img')
    os.makedirs(tabdir, exist_ok=True)
    os.makedirs(imgdir, exist_ok=True)

    made = []
    for key, icon in TABS.items():
        ch = glyphs.get(icon)
        if not ch:
            raise SystemExit('图标 %s 不在子集里，先把它加进 scripts/fetch-fonts.sh' % icon)
        for suffix, color in (('', INACTIVE), ('-on', ACTIVE)):
            img = Image.new('RGBA', (ICON_PX, ICON_PX), (0, 0, 0, 0))
            ImageDraw.Draw(img).text(
                (ICON_PX / 2, ICON_PX / 2), ch, font=font, fill=color, anchor='mm'
            )
            p = os.path.join(tabdir, key + suffix + '.png')
            img.save(p)
            made.append(p)

    draw_logo().save(os.path.join(imgdir, 'logo.png'))
    draw_logo(80).save(os.path.join(imgdir, 'logo-80.png'))
    draw_avatar().save(os.path.join(imgdir, 'avatar.png'))
    made += ['static/img/logo.png', 'static/img/logo-80.png', 'static/img/avatar.png']

    for p in made:
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        print('%-32s %6d B' % (rel, os.path.getsize(p)))


if __name__ == '__main__':
    main()
