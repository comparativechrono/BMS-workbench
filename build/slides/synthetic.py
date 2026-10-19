#!/usr/bin/env python3
"""Make the two drawn slides of the microscope's slide box (they are drawings, not photographs):

  stage-micrometer   a stage micrometer: a scale 1 mm long in 100 divisions of 0.01 mm (10 µm), for calibrating the
                     eyepiece graticule at each objective
  haemocytometer     an improved Neubauer counting chamber (depth 0.1 mm) with a suspension of cells stained with
                     trypan blue: unstained (living) cells and blue (dead) cells, to count and to work out the number
                     of cells per millilitre and the proportion alive. The true counts are kept in slide.json
                     ("counts"), for checking students' answers.

usage:  python3 build/slides/synthetic.py [stage-micrometer|haemocytometer]     (then python3 build/make_page.py)
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import pyramid  # noqa: E402

FONT = None
for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f):
        FONT = f


def font(px):
    return ImageFont.truetype(FONT, px) if FONT else ImageFont.load_default()


def glass(w, h, seed, base=(232, 235, 236), vignette=0.07):
    """a bright-field background: slightly uneven light, a little grain"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2
    r = np.sqrt(((xx - cx) / w) ** 2 + ((yy - cy) / h) ** 2)
    light = 1 - vignette * (r / r.max()) ** 2
    img = np.empty((h, w, 3), np.float32)
    for k in range(3):
        img[..., k] = base[k] * light
    img += rng.normal(0, 1.6, (h, w, 1)).astype(np.float32)
    return img


def micrometer():
    mpp = 0.25  # µm per pixel
    um = lambda v: int(round(v / mpp))  # noqa: E731
    W, H = um(1500), um(520)
    img = glass(W, H, 1)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    x0, y0 = um(250), um(300)  # the start of the scale and its base line
    ink = (24, 24, 28)
    d.rectangle([x0 - um(1), y0, x0 + um(1000) + um(1), y0 + um(2.5)], fill=ink)
    for k in range(101):
        x = x0 + um(10 * k)
        t = 90 if k % 10 == 0 else 60 if k % 5 == 0 else 40
        d.rectangle([x - um(1.1), y0 - um(t), x + um(1.1), y0 + um(2.5)], fill=ink)
        if k % 10 == 0:
            s = str(k)
            f = font(um(26))
            tw = d.textlength(s, font=f)
            d.text((x - tw / 2, y0 - um(t) - um(40)), s, font=f, fill=ink)
    # (centred under the middle of the scale, where the microscope opens it: at 10× the caption is inside the eyepiece)
    f = font(um(22))
    for k, s in enumerate(['1 division = 0.01 mm (10 µm)', 'the whole scale: 1 mm = 100 divisions']):
        tw = d.textlength(s, font=f)
        d.text((x0 + um(500) - tw / 2, y0 + um(36) + k * um(30)), s, font=f, fill=ink)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    meta = {
        'id': 'stage-micrometer', 'title': 'Stage micrometer', 'system': 'Measuring', 'order': 1,
        'description': 'A stage micrometer: a scale 1 mm long, divided into 100 divisions of 0.01 mm (10 µm). Use it to calibrate the eyepiece graticule at each objective.',
        'look_for': ['The scale: 100 divisions, with longer lines every 5 and every 10 divisions',
                     'At each objective, line up the eyepiece graticule (eyepiece view) with the scale and count how many micrometres one division of the graticule covers'],
        'stain': 'none (a drawing of an etched glass scale)', 'species': '–', 'mpp': mpp, 'scan': 'drawn for the workbench',
        'labels': [{'key': 'zero', 'text': '0', 'find': 'the start of the scale (0)', 'x': x0, 'y': y0 - um(45), 'r': um(25)},
                   {'key': 'one-mm', 'text': '1 mm (100 divisions)', 'find': 'the end of the scale (1 mm)', 'x': x0 + um(1000), 'y': y0 - um(45), 'r': um(25)}],
        'source': {'name': 'Drawn for the BMS workbench (build/slides/synthetic.py)', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                   'credit': 'A drawing made for the BMS workbench (not a photograph). CC0.', 'changes': ''}
    }
    return np.asarray(im), meta


def haemocytometer():
    mpp = 0.5
    um = lambda v: v / mpp  # noqa: E731
    rng = np.random.default_rng(20261019)
    side = 3400.0  # µm shown: the 3 x 3 mm ruled area and a margin
    W = H = int(round(um(side)))
    img = glass(W, H, 2, base=(226, 230, 228), vignette=0.05)
    o = um(200)  # the ruled area starts here (µm 200 from the top left)

    # --- the cells: positions first (so the lines can be drawn over them, as the chamber's rulings are) ---
    # a suspension of about 7.5 x 10^5 cells per mL: 75 cells per 1 mm² large square on average (depth 0.1 mm)
    cells = []
    for _ in range(int(rng.poisson(75 * 9 * 1.12))):
        cx, cy = rng.uniform(-150, 3150), rng.uniform(-150, 3150)  # µm, relative to the ruled area's corner
        r = rng.normal(6.5, 0.8)  # µm (cells about 13 µm across)
        dead = rng.random() < 0.13
        cells.append((cx, cy, max(4.5, r), dead))
    # (cells do not overlap much in a good suspension: drop those that would lie on top of another)
    kept = []
    for c in cells:
        if all((c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 > (c[2] + k[2] + 1) ** 2 for k in kept[-400:]):
            kept.append(c)
    cells = kept

    # draw the cells (a living cell: clear, with a bright centre and a dark rim; a dead cell: blue all through)
    yy, xx = np.mgrid[-30:31, -30:31].astype(np.float32)
    for cx, cy, r, dead in cells:
        px, py = o + um(cx), o + um(cy)
        R = um(r)
        x0i, y0i = int(px) - 30, int(py) - 30
        if x0i < 0 or y0i < 0 or x0i + 61 > W or y0i + 61 > H:
            continue
        dx, dy = xx - (px - int(px)), yy - (py - int(py))
        d = np.sqrt(dx * dx + dy * dy) / R
        patch = img[y0i:y0i + 61, x0i:x0i + 61]
        if dead:
            body = np.clip(1.15 - d, 0, 1)[..., None] * np.array([-120, -80, -20], np.float32) * (d < 1)[..., None]
            rim = np.exp(-((d - 1.0) / 0.10) ** 2)[..., None] * np.array([-90, -80, -40], np.float32)
            patch += body + rim
        else:
            rim = np.exp(-((d - 1.0) / 0.11) ** 2)[..., None] * np.array([-110, -105, -95], np.float32)
            halo = np.exp(-((d - 1.18) / 0.12) ** 2)[..., None] * np.array([18, 18, 18], np.float32)
            centre = (np.clip(0.85 - d, 0, 1) * (d < 0.9))[..., None] * np.array([22, 24, 22], np.float32)
            nucleus = np.exp(-(((dx + R * 0.15) ** 2 + (dy - R * 0.1) ** 2) / (0.35 * R) ** 2))[..., None] * np.array([-14, -12, -10], np.float32)
            patch += rim + halo + centre + nucleus
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    line = (70, 72, 74)

    def L(x1, y1, x2, y2, w=1.5):
        dr.line([(o + um(x1), o + um(y1)), (o + um(x2), o + um(y2))], fill=line, width=max(1, int(round(um(w)))))

    # the 9 large squares (1 mm)
    for k in range(4):
        L(0, k * 1000, 3000, k * 1000, 2.5)
        L(k * 1000, 0, k * 1000, 3000, 2.5)
    # the four corner squares: 16 squares of 0.25 mm
    for (ox, oy) in ((0, 0), (2000, 0), (0, 2000), (2000, 2000)):
        for k in range(1, 4):
            L(ox, oy + k * 250, ox + 1000, oy + k * 250)
            L(ox + k * 250, oy, ox + k * 250, oy + 1000)
    # the central square: 25 squares of 0.2 mm, bounded by triple lines, each of 16 small squares of 0.05 mm
    c0 = 1000
    for k in range(6):
        for dd in (-6, 0, 6):  # triple lines
            L(c0, c0 + k * 200 + dd, c0 + 1000, c0 + k * 200 + dd, 1.2)
            L(c0 + k * 200 + dd, c0, c0 + k * 200 + dd, c0 + 1000, 1.2)
    for k in range(20):
        if k % 4:
            L(c0, c0 + k * 50, c0 + 1000, c0 + k * 50, 0.9)
            L(c0 + k * 50, c0, c0 + k * 50, c0 + 1000, 0.9)
    im = im.filter(ImageFilter.GaussianBlur(0.5))

    # --- the true counts, by the usual rule: a cell touching the top or left line of a square is counted, one touching
    # the bottom or right line is not ---
    def count(x0, y0, size):
        live = dead = 0
        for cx, cy, r, de in cells:
            inside = x0 <= cx < x0 + size and y0 <= cy < y0 + size
            touches_bottom_right = (abs(cy - (y0 + size)) < r and x0 - r < cx < x0 + size + r) or (abs(cx - (x0 + size)) < r and y0 - r < cy < y0 + size + r)
            touches_top_left = (abs(cy - y0) < r and x0 - r < cx < x0 + size) or (abs(cx - x0) < r and y0 - r < cy < y0 + size)
            if (inside and not touches_bottom_right) or (not inside and touches_top_left and not touches_bottom_right):
                if de:
                    dead += 1
                else:
                    live += 1
        return {'live': live, 'dead': dead}
    squares = {
        'top-left': count(0, 0, 1000), 'top-right': count(2000, 0, 1000),
        'bottom-left': count(0, 2000, 1000), 'bottom-right': count(2000, 2000, 1000), 'centre': count(1000, 1000, 1000)
    }
    corners = [squares[k] for k in ('top-left', 'top-right', 'bottom-left', 'bottom-right')]
    live4 = sum(s['live'] for s in corners)
    dead4 = sum(s['dead'] for s in corners)
    P = lambda x, y: (int(round(o + um(x))), int(round(o + um(y))))  # noqa: E731
    labels = []
    for k, (x, y) in {'top-left': (500, 500), 'top-right': (2500, 500), 'bottom-left': (500, 2500), 'bottom-right': (2500, 2500)}.items():
        px, py = P(x, y)
        labels.append({'key': 'corner-square', 'text': f'Large square ({k.replace("-", " ")}): 1 mm × 1 mm', 'find': 'one of the four large corner squares', 'x': px, 'y': py, 'r': int(um(450))})
    px, py = P(1500, 1500)
    labels.append({'key': 'central-square', 'text': 'Central large square: 25 squares of 0.2 mm', 'find': 'the central large square', 'x': px, 'y': py, 'r': int(um(450))})
    px, py = P(1100, 1100)
    labels.append({'key': 'small-square', 'text': '0.2 mm square (16 small squares of 0.05 mm)', 'find': 'one of the 0.2 mm squares of the central square', 'x': px, 'y': py, 'r': int(um(80))})
    meta = {
        'id': 'haemocytometer', 'title': 'Haemocytometer (cell count)', 'system': 'Measuring', 'order': 2,
        'description': 'An improved Neubauer haemocytometer (chamber depth 0.1 mm) holding a suspension of cultured cells mixed 1:1 with trypan blue. Living cells keep the dye out and look clear; dead cells take it up and look blue.',
        'look_for': ['The ruled area: nine large squares, each 1 mm × 1 mm; the volume over one large square is 1 mm × 1 mm × 0.1 mm = 0.1 mm³ = 0.1 µL',
                     'The four corner squares (16 squares of 0.25 mm) and the central square (25 squares of 0.2 mm, each of 16 small squares)',
                     'Clear (living) cells and blue (dead) cells',
                     'The counting rule: count a cell that touches the top or left line of a square, but not one that touches the bottom or right line'],
        'stain': 'trypan blue (a drawing)', 'species': '–', 'mpp': mpp, 'scan': 'drawn for the workbench',
        'labels': labels,
        'counts': {'rule': 'cells touching the top or left line counted, the bottom or right line not', 'squares': squares,
                   'corner_squares_live': live4, 'corner_squares_dead': dead4,
                   'dilution_with_trypan_blue': 2, 'depth_mm': 0.1,
                   'live_cells_per_mL': live4 / 4 * 2 * 1e4, 'viability_percent': round(100 * live4 / (live4 + dead4), 1)},
        'source': {'name': 'Drawn for the BMS workbench (build/slides/synthetic.py)', 'licence': 'CC0 1.0', 'licence_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                   'credit': 'A drawing made for the BMS workbench (not a photograph). CC0.', 'changes': ''}
    }
    return np.asarray(im), meta


def main(ids):
    for make in (micrometer, haemocytometer):
        if ids and {micrometer: 'stage-micrometer', haemocytometer: 'haemocytometer'}[make] not in ids:
            continue
        img, meta = make()
        print(meta['id'], img.shape)
        pyramid.build(img, os.path.join(SITE, 'slides', meta['id']), meta, quality=80)
        if 'counts' in meta:
            print(json.dumps(meta['counts'], indent=1))


if __name__ == '__main__':
    main(sys.argv[1:])
