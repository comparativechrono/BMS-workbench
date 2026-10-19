#!/usr/bin/env python3
"""Make the workbench's GTEx slides: fetch a region of each slide from the NCI Imaging Data Commons and write it as a
slide for the microscope (see pyramid.py).

The slides are haematoxylin and eosin (H&E) sections of normal human tissue from the Genotype-Tissue Expression (GTEx)
project, scanned at 20x (about 0.49 micrometres per pixel). The Imaging Data Commons (IDC) keeps them as DICOM files in
a public bucket, under the Creative Commons Attribution 4.0 licence. Only the part of each slide that the workbench uses
(crop_mm in gtex-slides.json) is downloaded: the script reads the file's table of tiles and asks for just the tiles it
needs, with HTTP range requests.

usage:  python3 build/slides/gtex.py                 # every slide in gtex-slides.json that is not made yet
        python3 build/slides/gtex.py adrenal-gland   # one slide (made again)
        python3 build/slides/gtex.py --preview ID    # only a preview of the crop (build/slides/previews/ID.jpg)
Needs: numpy, pillow, opencv-python (pip install numpy pillow opencv-python-headless). Then run build/make_page.py,
which lists the slides in slides/index.json.
"""
import io
import json
import os
import struct
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import pyramid  # noqa: E402

BUCKET = 'https://idc-open-data.s3.amazonaws.com'


def get_range(url, a, b, tries=5):
    """bytes a..b (inclusive) of a file on the web"""
    last = None
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'Range': f'bytes={a}-{b}'})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) == b - a + 1:
                return data
            last = f'{len(data)} bytes instead of {b - a + 1}'
        except Exception as e:  # (a dropped connection: try again)
            last = e
        time.sleep(2 * (t + 1))
    raise RuntimeError(f'could not read bytes {a}-{b} of {url}: {last}')


class DicomWSI:
    """the full-resolution level of a whole-slide image in DICOM (tiled, JPEG), read in pieces"""

    def __init__(self, url):
        import pydicom
        self.url = url
        head = get_range(url, 0, 8 * 1024 * 1024 - 1)
        ds = pydicom.dcmread(io.BytesIO(head), stop_before_pixels=True, force=True)
        self.W, self.H = int(ds.TotalPixelMatrixColumns), int(ds.TotalPixelMatrixRows)
        self.tw, self.th = int(ds.Columns), int(ds.Rows)
        self.n = int(ds.NumberOfFrames)
        i = head.find(b'\xe0\x7f\x10\x00')  # (7FE0,0010) Pixel Data
        j = i + 12
        tag, ln = struct.unpack('<II', head[j:j + 8])
        if tag != 0xe000fffe or ln != 4 * self.n:
            raise RuntimeError('this DICOM file has no table of its tiles (basic offset table)')
        self.bot = struct.unpack('<%dI' % self.n, head[j + 8:j + 8 + ln])
        self.base = j + 8 + ln
        self.nx = (self.W + self.tw - 1) // self.tw
        self.ny = (self.H + self.th - 1) // self.th

    def read(self, x0, y0, w, h, workers=6):
        out = np.full((h, w, 3), 255, np.uint8)
        tx0, tx1 = x0 // self.tw, min(self.nx - 1, (x0 + w - 1) // self.tw)
        ty0, ty1 = y0 // self.th, min(self.ny - 1, (y0 + h - 1) // self.th)

        def row(ty):
            k0, k1 = ty * self.nx + tx0, ty * self.nx + tx1
            a = self.base + self.bot[k0]
            b = (self.base + self.bot[k1 + 1] - 1) if k1 + 1 < self.n else a + 8 * 1024 * 1024
            return ty, k0, k1, a, get_range(self.url, a, b)

        with ThreadPoolExecutor(workers) as ex:
            for ty, k0, k1, a, data in ex.map(row, range(ty0, ty1 + 1)):
                for k in range(k0, k1 + 1):
                    off = self.base + self.bot[k] - a
                    tag, ln = struct.unpack('<II', data[off:off + 8])
                    im = np.asarray(Image.open(io.BytesIO(data[off + 8:off + 8 + ln])).convert('RGB'))
                    X, Y = (k - ty * self.nx) * self.tw, ty * self.th
                    sx0, sy0 = max(X, x0), max(Y, y0)
                    sx1, sy1 = min(X + self.tw, x0 + w, self.W), min(Y + self.th, y0 + h, self.H)
                    if sx1 > sx0 and sy1 > sy0:
                        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = im[sy0 - Y:sy1 - Y, sx0 - X:sx1 - X]
        return out


def fetch(entry):
    idc = entry['idc']
    url = f"{BUCKET}/{idc['crdc_series_uuid']}/{idc['crdc_instance_uuid']}.dcm"
    mpp = idc['mpp']
    x0, y0, x1, y1 = entry['crop_mm']
    px = lambda mm: int(round(mm * 1000 / mpp))  # noqa: E731
    wsi = DicomWSI(url)
    X0, Y0 = max(0, px(x0)), max(0, px(y0))
    X1, Y1 = min(wsi.W, px(x1)), min(wsi.H, px(y1))
    return wsi.read(X0, Y0, X1 - X0, Y1 - Y0), mpp, (X0, Y0, X1 - X0, Y1 - Y0)


def meta_of(entry, region):
    keep = ('title', 'subtitle', 'system', 'organ', 'description', 'look_for', 'labels', 'tasks')
    m = {k: entry[k] for k in keep if k in entry}
    m.update({
        'id': entry['id'], 'stain': 'H&E (haematoxylin and eosin)', 'species': 'Human', 'mpp': entry['idc']['mpp'],
        'scan': '20x (Aperio scanner)',
        'source': {
            'name': 'GTEx (Genotype-Tissue Expression) project',
            'sample': entry['sample'],
            'tissue_site': entry.get('gtex_site', ''),
            'pathology_note': entry.get('gtex_note', ''),
            'via': 'NCI Imaging Data Commons (IDC), collection gtex',
            'series_uid': entry['idc']['series_uid'],
            'url': 'https://portal.imaging.datacommons.cancer.gov/explore/filters/?collection_id=gtex',
            'region': {'x': region[0], 'y': region[1], 'width': region[2], 'height': region[3]},
            'changes': 'A region of the slide was cut out and re-encoded as a WebP image pyramid; nothing else was changed.',
            'licence': 'CC BY 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
            'credit': f"Image: the GTEx Consortium (sample {entry['sample']}), via the NCI Imaging Data Commons. CC BY 4.0.",
        },
    })
    return m


def main(argv):
    entries = json.load(open(os.path.join(HERE, 'gtex-slides.json'), encoding='utf-8'))
    preview = '--preview' in argv
    ids = [a for a in argv if not a.startswith('--')]
    todo = [e for e in entries if e['id'] in ids] if ids else entries
    for e in todo:
        out = os.path.join(SITE, 'slides', e['id'])
        if not ids and not preview and os.path.exists(os.path.join(out, 'slide.json')):
            continue
        t = time.time()
        print(f"{e['id']}: {e['sample']} {e['crop_mm']} mm", flush=True)
        img, mpp, region = fetch(e)
        print(f'  read {img.shape[1]}x{img.shape[0]} px in {time.time() - t:.0f} s', flush=True)
        if preview:
            os.makedirs(os.path.join(HERE, 'previews'), exist_ok=True)
            p = Image.fromarray(img)
            p.thumbnail((1600, 1600), Image.LANCZOS)
            p.save(os.path.join(HERE, 'previews', e['id'] + '.jpg'), quality=85)
            continue
        pyramid.build(img, out, meta_of(e, region))
        print(f'  done in {time.time() - t:.0f} s', flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
