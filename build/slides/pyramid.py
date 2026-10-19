"""Write a slide for the microscope: an image pyramid in one file that the browser reads in pieces.

A slide is a folder slides/<id>/ with three files:
  slide.json   what the slide is (title, size, microns per pixel, levels, source, licence, labels)
  tiles.pack   every tile of every level, one after the other (WebP images)
  tiles.idx    where each tile is in tiles.pack: two little-endian unsigned 32-bit numbers per tile (offset, length),
               level by level from the smallest, row by row
and a small picture, thumb.jpg, for the slide box.

The levels follow the Deep Zoom (DZI) layout that OpenSeadragon uses: level L is the image shrunk by 2^(maxLevel - L),
with tiles of 254 pixels and an overlap of 1 pixel. Because the tiles are in one file, the site does not need tens of
thousands of small files: the microscope asks for each tile with an HTTP range request (GitHub Pages and most web
servers answer them; serve.py does too).

Used by add_image.py (a picture or a whole-slide image of your own) and gtex.py (the GTEx slides of the workbench).
"""
import io
import json
import math
import os
import struct

import numpy as np
from PIL import Image

TILE = 254
OVERLAP = 1


def _resize_half(a, w, h):
    """area-average a level down to w x h (each new pixel is the mean of up to 2x2 old ones)"""
    import cv2
    return cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA)


def build(img, out_dir, meta, quality=70, method=4, thumb_px=360, log=print):
    """img: an RGB numpy array (H, W, 3) of the slide at full resolution; meta: what goes into slide.json
    (title, mpp – microns per pixel of img – and anything else). Writes slide.json, tiles.pack, tiles.idx, thumb.jpg."""
    os.makedirs(out_dir, exist_ok=True)
    H, W = img.shape[:2]
    max_level = int(math.ceil(math.log2(max(W, H))))
    # the levels, largest first, each from the one above (exact DZI sizes: ceil(W / 2^k))
    levels = {max_level: img}
    L = max_level
    while True:
        w, h = levels[L].shape[1], levels[L].shape[0]
        if max(w, h) <= TILE:
            break
        nw, nh = (w + 1) // 2, (h + 1) // 2
        levels[L - 1] = _resize_half(levels[L], nw, nh)
        L -= 1
    min_level = L
    index = []
    lev_info = []
    pack_path = os.path.join(out_dir, 'tiles.pack')
    pos = 0
    n_tiles = 0
    with open(pack_path, 'wb') as pack:
        for L in range(min_level, max_level + 1):
            a = levels[L]
            h, w = a.shape[:2]
            nx, ny = (w + TILE - 1) // TILE, (h + TILE - 1) // TILE
            lev_info.append({'level': L, 'width': w, 'height': h, 'cols': nx, 'rows': ny, 'first': n_tiles})
            for y in range(ny):
                for x in range(nx):
                    x0 = x * TILE - (OVERLAP if x > 0 else 0)
                    y0 = y * TILE - (OVERLAP if y > 0 else 0)
                    x1 = min(w, (x + 1) * TILE + OVERLAP)
                    y1 = min(h, (y + 1) * TILE + OVERLAP)
                    t = np.ascontiguousarray(a[y0:y1, x0:x1])
                    b = io.BytesIO()
                    Image.fromarray(t).save(b, 'WEBP', quality=quality, method=method)
                    data = b.getvalue()
                    pack.write(data)
                    index.append((pos, len(data)))
                    pos += len(data)
                    n_tiles += 1
            log(f'  level {L}: {w}x{h}, {nx * ny} tiles')
    with open(os.path.join(out_dir, 'tiles.idx'), 'wb') as f:
        f.write(b''.join(struct.pack('<II', o, n) for o, n in index))
    # the small picture for the slide box
    src = next(levels[L] for L in range(min_level, max_level + 1) if max(levels[L].shape[:2]) >= 2 * thumb_px or L == max_level)
    th = Image.fromarray(src)
    th.thumbnail((thumb_px, thumb_px), Image.LANCZOS)
    th.save(os.path.join(out_dir, 'thumb.jpg'), quality=82)
    info = dict(meta)
    info.update({
        'format': 'bms-slide-1', 'width': W, 'height': H, 'tileSize': TILE, 'overlap': OVERLAP,
        'minLevel': min_level, 'maxLevel': max_level, 'tileType': 'image/webp', 'tiles': n_tiles,
        'packBytes': pos, 'levels': lev_info
    })
    with open(os.path.join(out_dir, 'slide.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=1, ensure_ascii=False)
        f.write('\n')
    log(f'  {n_tiles} tiles, {pos / 1e6:.1f} MB')
    return info
