"""Build a COMIC post for a social page from an episode's existing scene art: 4 panels in a 2×2 grid (or 3: one large
panel + two small ones), speech bubbles with tails pointing at the speaker, yellow caption boxes, a title band, and the
channel name on every panel.

    .venv/bin/python -I tools/comic_post.py <spec.json> [--grid]

spec.json (image paths are relative to the folder holding the spec, or absolute):
{
  "out": "anh.jpg", "title": "THE NEIGHBOUR'S RICE CAKES", "kicker": "A village tale", "brand": "Your Channel Name",
  "seal": "/…/branding/avatar_seal_round_crop.png",                # channel seal, top right (optional)
  "panels": [
    {"src": ".../scene_04.png",
     "caption": "Just before New Year, we visited the neighbour…",  # caption box, bottom left (caption_at: "top" to move it up)
     "bubbles": [{"text": "These cakes stretch like thread!",   # one short line, wraps on its own
                  "box": [0.30, 0.04, 0.62],                     # x, y of the top-left corner + width, as panel fractions
                  "tail": [627, 209]}]}                          # point the tail aims at, in px of the ORIGINAL image
  ]
}
Vertical story 1080×1920: add "layout": "story" and a single panel ("focus": horizontal px to crop around a character),
"question": a question for viewers to answer, "footer": a small line under the question; writes tin.jpg by default.
--grid draws the original image's coordinate grid on every panel, to find where bubble tails should point.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = '/usr/share/fonts/truetype/noto/'
W = 1600             # post width (Facebook shows it ~500 px wide on phones, so text must be large)
GAP, BORDER = 14, 5
INK, PAPER, GOLD = (25, 20, 15), (255, 255, 255), (250, 205, 70)


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)


F_BUBBLE = font('NotoSans-Bold.ttf', 30)
F_CAPTION = font('NotoSans-BoldItalic.ttf', 27)
F_TITLE = font('NotoSerifDisplay-Bold.ttf', 66)
F_KICKER = font('NotoSans-Bold.ttf', 30)
F_BRAND = font('NotoSans-Bold.ttf', 20)


def wrap(draw, text, fnt, width):
    lines, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=fnt) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def bubble(draw, pw, ph, b, scale, off=0, fnt=F_BUBBLE):
    """Rounded speech bubble + triangular tail aimed at b['tail'] (original px → times scale, minus off when the panel is cropped sideways)."""
    x0, y0, bw = b['box'][0] * pw, b['box'][1] * ph, b['box'][2] * pw
    lines = wrap(draw, b['text'], fnt, bw - 44)
    lh = fnt.size + 6
    bh = len(lines) * lh + 30
    bw = max(draw.textlength(l, font=fnt) for l in lines) + 48
    box = (x0, y0, x0 + bw, y0 + bh)
    if b.get('tail'):
        tx, ty = b['tail'][0] * scale - off, b['tail'][1] * scale
        cx, cy = x0 + bw / 2, y0 + bh / 2
        # the tail's base sits on the bubble edge nearest the target, 34 px wide
        bx = min(max(tx, x0 + 40), x0 + bw - 40)
        by = y0 + bh - 4 if ty > cy else y0 + 4
        if abs(tx - cx) > bw / 2 and abs(ty - cy) < bh:          # target is off to one side
            bx = x0 + bw - 4 if tx > cx else x0 + 4
            by = min(max(ty, y0 + 24), y0 + bh - 24)
            base = [(bx, by - 17), (bx, by + 17)]
        else:
            base = [(bx - 17, by), (bx + 17, by)]
        # the tail stops short of the character's head so it doesn't cover the face
        dx, dy = tx - bx, ty - by
        d = max((dx * dx + dy * dy) ** 0.5, 1)
        stop = min(d * 0.75, max(d - 45, d * 0.5))
        tip = (bx + dx / d * stop, by + dy / d * stop)
    draw.rounded_rectangle(box, radius=min(40, bh / 2), fill=PAPER, outline=INK, width=4)
    if b.get('tail'):
        # paint over the bubble outline where the tail joins (base pushed 8 px inside), then draw the two tail edges
        inset = [(px + (8 if px <= cx else -8) * (base[0][0] == base[1][0]),
                  py + (8 if py <= cy else -8) * (base[0][1] == base[1][1])) for px, py in base]
        draw.polygon(inset + [tip], fill=PAPER)
        draw.line([base[0], tip, base[1]], fill=INK, width=4, joint='curve')
    y = y0 + 15
    for l in lines:
        draw.text((x0 + (bw - draw.textlength(l, font=fnt)) / 2, y), l, font=fnt, fill=INK)
        y += lh


def panel(spec_dir, p, pw, ph, brand, grid, f_bubble=F_BUBBLE, f_caption=F_CAPTION):
    src = p['src'] if os.path.isabs(p['src']) else os.path.join(spec_dir, p['src'])
    art = Image.open(src).convert('RGB')
    # fill the panel; if the panel is narrower than the art, crop sideways around p['focus'] (original horizontal px, centre by default)
    scale = max(pw / art.width, ph / art.height)
    sw = round(art.width * scale)
    off = min(max(round(p.get('focus', art.width / 2) * scale - pw / 2), 0), sw - pw)
    im = art.resize((sw, round(art.height * scale)), Image.LANCZOS).crop((off, 0, off + pw, ph))
    d = ImageDraw.Draw(im)
    if grid:
        for gx in range(0, art.width, 100):
            d.line([(gx * scale - off, 0), (gx * scale - off, ph)], fill=(255, 0, 0), width=1)
            d.text((gx * scale - off + 2, 2), str(gx), fill=(255, 0, 0), font=F_BRAND)
        for gy in range(0, art.height, 100):
            d.line([(0, gy * scale), (pw, gy * scale)], fill=(0, 0, 255), width=1)
            d.text((2, gy * scale + 2), str(gy), fill=(0, 0, 255), font=F_BRAND)
    if p.get('caption'):
        lines = wrap(d, p['caption'], f_caption, pw * 0.55)
        lh = f_caption.size + 6
        bw = max(d.textlength(l, font=f_caption) for l in lines) + 28
        ch = len(lines) * lh + 18
        y0 = ph - ch if p.get('caption_at', 'bottom') == 'bottom' else 0   # bottom by default: characters' heads are usually in the upper half
        d.rectangle((0, y0, bw, y0 + ch), fill=GOLD, outline=INK, width=3)
        for i, l in enumerate(lines):
            d.text((14, y0 + 8 + i * lh), l, font=f_caption, fill=INK)
    for b in p.get('bubbles', []):
        bubble(d, pw, ph, b, scale, off, f_bubble)
    tw = d.textlength(brand, font=F_BRAND)
    d.rectangle((pw - tw - 22, ph - 34, pw, ph), fill=(0, 0, 0))
    d.text((pw - tw - 11, ph - 31), brand, font=F_BRAND, fill=GOLD)
    return im


def seal_img(spec, spec_dir, sz):
    path = spec['seal'] if os.path.isabs(spec['seal']) else os.path.join(spec_dir, spec['seal'])
    seal = Image.open(path).convert('RGB').resize((sz, sz), Image.LANCZOS)
    mask = Image.new('L', (sz, sz), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, sz - 1, sz - 1), fill=255)
    return seal, mask


def story(spec, spec_dir, grid):
    """Vertical story 1080×1920: story title, ONE large panel with bubbles, and a question for viewers to reply to.
    Text stays within 250–1680: the top and bottom are covered by Facebook's progress bar, page name and reply box."""
    SW, SH = 1080, 1920
    page = Image.new('RGB', (SW, SH), INK)
    d = ImageDraw.Draw(page)
    brand = spec.get('brand', '')
    f_title = font('NotoSerifDisplay-Bold.ttf', 76)
    y = 250
    if spec.get('seal'):
        seal, mask = seal_img(spec, spec_dir, 96)
        page.paste(seal, (SW - 40 - 96, y - 10), mask)
    d.text((40, y), spec.get('kicker', '').upper(), font=F_KICKER, fill=GOLD)
    y += 44
    for line in wrap(d, spec['title'], f_title, SW - 80 - 110):
        d.text((40, y), line, font=f_title, fill=PAPER)
        y += f_title.size + 8
    p = spec['panels'][0]
    py = max(y + 24, 500)
    ph = 1500 - py
    page.paste(panel(spec_dir, p, SW, ph, brand, grid, font('NotoSans-Bold.ttf', 44), font('NotoSans-BoldItalic.ttf', 36)), (0, py))
    d.line([(0, py - 2), (SW, py - 2)], fill=GOLD, width=4)
    d.line([(0, py + ph + 1), (SW, py + ph + 1)], fill=GOLD, width=4)
    f_q = font('NotoSans-Bold.ttf', 46)
    y = py + ph + 40
    for line in wrap(d, spec.get('question', ''), f_q, SW - 100):
        d.text(((SW - d.textlength(line, font=f_q)) / 2, y), line, font=f_q, fill=PAPER)
        y += f_q.size + 10
    if spec.get('footer'):
        d.text(((SW - d.textlength(spec['footer'], font=F_KICKER)) / 2, y + 10), spec['footer'], font=F_KICKER, fill=GOLD)
    return page


def main():
    spec_path = sys.argv[1]
    grid = '--grid' in sys.argv
    spec = json.load(open(spec_path, encoding='utf-8'))
    spec_dir = os.path.dirname(os.path.abspath(spec_path))
    if spec.get('layout') == 'story':
        page = story(spec, spec_dir, grid)
        out = os.path.join(spec_dir, spec.get('out', 'tin.jpg'))
        if grid:
            out = out.replace('.jpg', '.grid.jpg')
        page.save(out, quality=92)
        print(out, page.size)
        return
    panels = spec['panels']
    brand = spec.get('brand', '')
    head = 150
    if len(panels) == 3:      # one large panel on top, two small ones below
        big_w = W - 2 * GAP
        small_w = (W - 3 * GAP) // 2
        big_h, small_h = round(big_w * 9 / 16), round(small_w * 9 / 16)
        cells = [(GAP, head, big_w, big_h), (GAP, head + big_h + GAP, small_w, small_h),
                 (2 * GAP + small_w, head + big_h + GAP, small_w, small_h)]
    elif len(panels) == 4:    # 2×2 grid
        cw = (W - 3 * GAP) // 2
        ch = round(cw * 9 / 16)
        cells = [(GAP + (i % 2) * (cw + GAP), head + (i // 2) * (ch + GAP), cw, ch) for i in range(4)]
    else:
        raise SystemExit('Need 3 or 4 panels')
    H = max(y + h for _, y, _, h in cells) + GAP
    page = Image.new('RGB', (W, H), INK)
    d = ImageDraw.Draw(page)
    d.text((GAP + 4, 18), spec.get('kicker', '').upper(), font=F_KICKER, fill=GOLD)
    d.text((GAP + 2, 52), spec['title'], font=F_TITLE, fill=PAPER)
    if spec.get('seal'):     # round channel seal at the right end of the title band
        sz = head - 2 * GAP - 10
        seal, mask = seal_img(spec, spec_dir, sz)
        page.paste(seal, (W - GAP - sz, GAP + 5), mask)
        tw = d.textlength(brand, font=F_KICKER)
        d.text((W - GAP - sz - 16 - tw, head // 2 - 18), brand, font=F_KICKER, fill=GOLD)
    for (x, y, w, h), p in zip(cells, panels):
        page.paste(panel(spec_dir, p, w, h, brand, grid), (x, y))
        d.rectangle((x - 1, y - 1, x + w, y + h), outline=PAPER, width=BORDER // 2)
    out = os.path.join(spec_dir, spec.get('out', 'anh.jpg'))
    if grid:
        out = out.replace('.jpg', '.grid.jpg')
    page.save(out, quality=92)
    print(out, page.size)


if __name__ == '__main__':
    main()
