#!/usr/bin/env python3
"""Add a slide of your own to the microscope's slide box: a picture (JPEG, PNG or TIFF), or a whole-slide image from a
slide scanner (SVS, NDPI, MRXS, SCN, BIF, VMS… – these need OpenSlide: pip install openslide-python openslide-bin).

The picture becomes slides/<ID>/ (an image pyramid, see pyramid.py). Give its scale with --mpp, the size of one pixel in
micrometres: for a scanned slide it is in the scanner's file (OpenSlide reads it); for a photograph through a
microscope, photograph a stage micrometer at the same settings and divide the length of its scale by its length in
pixels. Without a scale the microscope cannot measure, so --mpp is needed for a picture.

usage:
  python3 build/slides/add_image.py PICTURE ID --title "Thyroid (my slide)" --mpp 0.5 [options]

options:
  --system NAME        the group in the slide box: Endocrine, Cardiovascular, Respiratory, Urinary, Digestive, Muscle,
                       Nervous, Lymphoid, Skin, Reproductive, Measuring or Other (default Other)
  --stain TEXT         e.g. "H&E (haematoxylin and eosin)"
  --species TEXT       e.g. Human, Rat
  --description TEXT   a sentence or two about the slide (shown under "About")
  --look-for TEXT      something to look for (repeat for a list)
  --credit TEXT        who made the slide or the picture, as it should appear under each picture students take
  --licence TEXT       e.g. "CC BY 4.0", or "All rights reserved; used with permission"
  --licence-url URL
  --source TEXT        where it comes from (a collection, a web page)
  --crop X0,Y0,X1,Y1   only this part of the picture, in millimetres from its top left corner
  --down N             shrink the picture N times (2: half the width) before making the slide; the scale is adjusted
  --quality Q          the WebP quality of the tiles (default 70: about 15 MB for a slide of 4 × 4 mm at 0.5 µm/pixel)
  --order N            the slide's place within its group in the slide box
  --labels FILE        a JSON file with the slide's labels, in pixels of the finished slide (see labels.py)

Then run python3 build/make_page.py, which adds the slide to slides/index.json, and check it with
python3 build/slides/render.py ID check.jpg --down 8 --grid 1000 (handy for placing labels, too).
Make sure that you may publish the picture: anything in slides/ is public on the site.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import pyramid  # noqa: E402

Image.MAX_IMAGE_PIXELS = None  # (slides are big pictures)
SYSTEMS = ['Endocrine', 'Cardiovascular', 'Respiratory', 'Urinary', 'Digestive', 'Muscle', 'Nervous', 'Lymphoid', 'Skin',
           'Reproductive', 'Measuring', 'Other']
WSI = ('.svs', '.ndpi', '.mrxs', '.scn', '.bif', '.vms', '.vmu', '.svslide', '.tif', '.tiff')


def read_wsi(path, crop_mm, down):
    """a region of a whole-slide image, with OpenSlide → (RGB array, µm per pixel) – or None if OpenSlide cannot read it"""
    try:
        import openslide
    except ImportError:
        return None
    try:
        s = openslide.OpenSlide(path)
    except Exception:
        return None
    mpp = float(s.properties.get(openslide.PROPERTY_NAME_MPP_X, 0) or 0)
    W, H = s.dimensions
    if crop_mm and mpp:
        x0, y0, x1, y1 = [int(round(v * 1000 / mpp)) for v in crop_mm]
    else:
        x0, y0, x1, y1 = 0, 0, W, H
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    level = s.get_best_level_for_downsample(down) if down > 1 else 0
    ds = s.level_downsamples[level]
    w, h = int((x1 - x0) / ds), int((y1 - y0) / ds)
    if w * h > 30000 * 30000:
        sys.exit(f'The region is very big ({w} x {h} pixels): use --crop or --down.')
    img = np.asarray(s.read_region((x0, y0), level, (w, h)).convert('RGB'))
    if down > ds * 1.01:  # the rest of the shrinking
        im = Image.fromarray(img)
        im = im.resize((max(1, int(w * ds / down)), max(1, int(h * ds / down))), Image.LANCZOS)
        img = np.asarray(im)
    return img, (mpp * down if mpp else 0)


def main():
    ap = argparse.ArgumentParser(description='Add a picture or a whole-slide image to the microscope\'s slide box.')
    ap.add_argument('picture')
    ap.add_argument('id', help='a short name: lower-case letters, digits and hyphens (thyroid-mine)')
    ap.add_argument('--title', required=True)
    ap.add_argument('--mpp', type=float, default=0, help='micrometres per pixel of the picture')
    ap.add_argument('--system', default='Other')
    ap.add_argument('--stain', default='')
    ap.add_argument('--species', default='')
    ap.add_argument('--description', default='')
    ap.add_argument('--look-for', action='append', default=[])
    ap.add_argument('--credit', default='')
    ap.add_argument('--licence', default='')
    ap.add_argument('--licence-url', default='')
    ap.add_argument('--source', default='')
    ap.add_argument('--crop', default='')
    ap.add_argument('--down', type=float, default=1)
    ap.add_argument('--quality', type=int, default=70)
    ap.add_argument('--order', type=int, default=0)
    ap.add_argument('--labels', default='')
    a = ap.parse_args()

    if not all(c.isalnum() and c.lower() == c or c == '-' for c in a.id):
        sys.exit('The ID should be lower-case letters, digits and hyphens, e.g. thyroid-mine.')
    if a.system not in SYSTEMS:
        print(f'Note: “{a.system}” is not one of the groups of the slide box ({", ".join(SYSTEMS)}); it goes at the end.')
    crop = [float(v) for v in a.crop.split(',')] if a.crop else None
    if crop and len(crop) != 4:
        sys.exit('--crop needs four numbers: X0,Y0,X1,Y1 (millimetres).')

    got = read_wsi(a.picture, crop, a.down) if a.picture.lower().endswith(WSI) else None
    if got:
        img, mpp = got
        if a.mpp:
            mpp = a.mpp * a.down
    else:
        im = Image.open(a.picture).convert('RGB')
        mpp = a.mpp
        if crop:
            if not mpp:
                sys.exit('--crop is in millimetres, so it needs --mpp.')
            x0, y0, x1, y1 = [int(round(v * 1000 / mpp)) for v in crop]
            im = im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1)))
        if a.down > 1:
            im = im.resize((max(1, int(im.width / a.down)), max(1, int(im.height / a.down))), Image.LANCZOS)
            mpp = mpp * a.down
        img = np.asarray(im)
    if not mpp:
        sys.exit('The scale is not known: give --mpp (micrometres per pixel of the picture).')

    meta = {
        'id': a.id, 'title': a.title, 'system': a.system, 'order': a.order, 'description': a.description,
        'look_for': a.look_for, 'stain': a.stain, 'species': a.species, 'mpp': round(mpp, 5), 'scan': '',
        'source': {'name': a.source or 'Added to the BMS workbench', 'licence': a.licence, 'licence_url': a.licence_url,
                   'credit': a.credit or a.source or a.title, 'changes': 'Re-encoded as a WebP image pyramid.'},
        'labels': json.load(open(a.labels, encoding='utf-8')) if a.labels else [],
    }
    out = os.path.join(SITE, 'slides', a.id)
    print(f'{a.id}: {img.shape[1]} x {img.shape[0]} pixels, {mpp:.4f} µm per pixel '
          f'({img.shape[1] * mpp / 1000:.2f} x {img.shape[0] * mpp / 1000:.2f} mm)')
    pyramid.build(img, out, meta, quality=a.quality)
    print('Now run: python3 build/make_page.py')


if __name__ == '__main__':
    main()
