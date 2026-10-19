#!/usr/bin/env python3
"""Draw a slide (or a part of it) from its pyramid, with a grid in full-resolution pixels and the slide's labels:
for checking a slide and for placing its labels.

usage:  python3 build/slides/render.py SLIDE OUT.jpg [--down 8] [--box x0,y0,x1,y1] [--grid 1000] [--labels]
  --down   how many full-resolution pixels make one pixel of the picture (a power of 2: 1, 2, 4, 8, 16 …)
  --box    the part of the slide, in full-resolution pixels (default: all of it)
  --grid   the spacing of the grid lines, in full-resolution pixels (0: no grid)
  --labels draw the slide's labels (slide.json) and their regions
"""
import io, json, math, os, struct, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))


def level_image(sid, down, box=None):
    d = os.path.join(SITE, 'slides', sid)
    info = json.load(open(os.path.join(d, 'slide.json')))
    idx = open(os.path.join(d, 'tiles.idx'), 'rb').read()
    pack = open(os.path.join(d, 'tiles.pack'), 'rb')
    k = int(round(math.log2(down)))
    L = info['maxLevel'] - k
    lev = next(x for x in info['levels'] if x['level'] == L)
    T, O = info['tileSize'], info['overlap']
    W, H = lev['width'], lev['height']
    if box:
        x0, y0, x1, y1 = [int(v / down) for v in box]
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    x1, y1 = min(x1, W), min(y1, H)
    out = Image.new('RGB', (x1 - x0, y1 - y0), 'white')
    for ty in range(y0 // T, (y1 - 1) // T + 1):
        for tx in range(x0 // T, (x1 - 1) // T + 1):
            n = lev['first'] + ty * lev['cols'] + tx
            off, ln = struct.unpack_from('<II', idx, 8 * n)
            pack.seek(off)
            im = Image.open(io.BytesIO(pack.read(ln))).convert('RGB')
            ox = tx * T - (O if tx > 0 else 0)
            oy = ty * T - (O if ty > 0 else 0)
            out.paste(im, (ox - x0, oy - y0))
    return out, info, (x0 * down, y0 * down)


def main(a):
    sid, outp = a[0], a[1]
    opt = {a[i]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--') and not a[i + 1].startswith('--')}
    down = int(opt.get('--down', 8))
    box = [int(float(v)) for v in opt['--box'].split(',')] if '--box' in opt else None
    grid = int(opt.get('--grid', 1000))
    im, info, (ox, oy) = level_image(sid, down, box)
    d = ImageDraw.Draw(im)
    if grid:
        gx = (ox // grid + 1) * grid
        while (gx - ox) / down < im.width:
            X = (gx - ox) / down
            d.line([(X, 0), (X, im.height)], fill=(0, 150, 0))
            d.text((X + 2, 2), str(gx), fill=(0, 0, 0))
            gx += grid
        gy = (oy // grid + 1) * grid
        while (gy - oy) / down < im.height:
            Y = (gy - oy) / down
            d.line([(0, Y), (im.width, Y)], fill=(0, 150, 0))
            d.text((2, Y + 2), str(gy), fill=(0, 0, 0))
            gy += grid
    if '--labels' in a:
        for L in info.get('labels', []):
            X, Y = (L['x'] - ox) / down, (L['y'] - oy) / down
            if L.get('poly'):
                d.line([((x - ox) / down, (y - oy) / down) for x, y in L['poly'] + [L['poly'][0]]], fill=(30, 90, 255), width=2)
            elif L.get('r'):
                r = L['r'] / down
                d.ellipse([X - r, Y - r, X + r, Y + r], outline=(30, 90, 255), width=2)
            d.ellipse([X - 4, Y - 4, X + 4, Y + 4], fill=(30, 90, 255))
            d.text((X + 6, Y - 6), L['text'], fill=(0, 0, 160))
    im.save(outp, quality=88)
    print(outp, im.size, 'mpp of the picture', round(info['mpp'] * down, 3), 'µm')


if __name__ == '__main__':
    main(sys.argv[1:])
