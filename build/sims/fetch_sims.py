"""The simulations of the Simulations tab: PhET Interactive Simulations (University of Colorado Boulder), in the
versions that PhET published under the Creative Commons Attribution 4.0 licence (CC BY 4.0).

PhET re-licensed its simulations in 2026: versions published from 29 March 2026 are CC BY-NC 4.0 (no commercial use),
which this site cannot use. Versions published before then ("historical PhET simulations") stay under CC BY 4.0, which
allows them to be copied and hosted with attribution (https://phet.colorado.edu/en/licensing/html). So each simulation
here is pinned to a version whose own file says "This file is licensed under Creative Commons Attribution 4.0" – the
script checks that in every file it downloads, and refuses any other.

    python3 build/sims/fetch_sims.py --find      # look for the newest CC BY 4.0 version of each simulation in sims.json
                                                 # (asks PhET's site; writes the versions into sims.json)
    python3 build/sims/fetch_sims.py             # download the pinned versions into sims/ and write sims/index.json
    python3 build/sims/fetch_sims.py neuron      # only one

Each simulation becomes sims/<id>/<id>_en.html (PhET's English single-file build, unchanged) and sims/<id>/thumb.jpg
(PhET's 600-pixel screenshot of it, made smaller). Needs curl (and the internet) and Pillow."""
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
LIST = os.path.join(HERE, 'sims.json')
OUT = os.path.join(SITE, 'sims')
BASE = 'https://phet.colorado.edu/sims/html'
CC_BY = 'This file is licensed under Creative Commons Attribution 4.0'


def head_of(url, n=4000):
    """the first n bytes of a file on PhET's site (its header: version, build date, licence) – PhET's server does not
    answer range requests, so the download is cut short instead"""
    p = subprocess.run(f'curl -sS --max-time 60 "{url}" | head -c {n}', shell=True, capture_output=True)
    return p.stdout.decode('utf-8', 'replace')


def info(text):
    """the version, build date and licence in a simulation's header (None if it isn't one)"""
    # (the version is in the comment at the top – "Neuron 1.1.34" – and, in older builds, near it in phet.chipper)
    v = re.search(r"<!--\s*\n[^\n]*?\s(\d+\.\d+\.\d+)\s*\n", text) or re.search(r"phet\.chipper\.version\s*=\s*'([^']+)'", text)
    t = re.search(r"phet\.chipper\.buildTimestamp\s*=\s*'([^']+)'", text)
    if not v or 'Regents of the University of Colorado' not in text:
        return None
    lic = 'CC BY 4.0' if CC_BY in text and 'NonCommercial' not in text else ('CC BY-NC 4.0' if 'NonCommercial' in text else 'other')
    return {'version': v.group(1), 'built': t.group(1) if t else '', 'licence': lic}


def url_of(sim, version):
    return f'{BASE}/{sim}/{version}/{sim}_en.html'


def find(sim):
    """the newest version of a simulation whose file is CC BY 4.0"""
    latest = info(head_of(url_of(sim, 'latest')))
    if not latest:
        return None, 'no HTML5 version'
    if latest['licence'] == 'CC BY 4.0':
        return latest, 'latest'
    M, m, p = (int(x) for x in re.match(r'(\d+)\.(\d+)\.(\d+)', latest['version']).groups())
    tried = []
    # the earlier patches of the same minor version, then the earlier minor versions (newest patch first)
    cands = [(M, m, q) for q in range(p - 1, -1, -1)]
    for mm in range(m - 1, -1, -1):
        found, misses, q = [], 0, 0
        while misses < 3 and q < 80:
            i = info(head_of(url_of(sim, f'{M}.{mm}.{q}'), 2600))
            if i:
                found.append((M, mm, q))
                misses = 0
            else:
                misses += 1
            q += 1
        cands += sorted(found, reverse=True)
    if M > 1 and m == 0:
        cands += [(M - 1, mm, q) for mm in range(9, -1, -1) for q in range(30, -1, -1)]
    for c in cands:
        v = '.'.join(map(str, c))
        i = info(head_of(url_of(sim, v), 2600))
        tried.append(v)
        if i and i['licence'] == 'CC BY 4.0':
            return i, f'{len(tried)} versions back from {latest["version"]} (CC BY-NC)'
    return None, f'no CC BY 4.0 version found (tried {", ".join(tried[:12])}…)'


def credits_of(html):
    """the credits the simulation shows in its About box: {leadDesign: …, softwareDevelopment: …, …}"""
    m = re.search(r'credits\s*:\s*\{\s*(leadDesign|softwareDevelopment)\s*:', html)
    if not m:
        return {}
    i = m.end() - len(m.group(1)) - 1
    # read the object's "key: string" pairs
    out = {}
    for k, v in re.findall(r'(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"', html[i:i + 4000].split('}')[0]):
        out[k] = json.loads('"' + v + '"').replace('\n', ' ')
    return out


def fetch(entry):
    sim, version = entry['id'], entry['version']
    d = os.path.join(OUT, sim)
    os.makedirs(d, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        f = os.path.join(tmp, 'sim.html')
        subprocess.run(['curl', '-sS', '--fail', '--max-time', '300', '-o', f, url_of(sim, version)], check=True)
        data = open(f, 'rb').read()
        text = data.decode('utf-8', 'replace')
        i = info(text[:6000])
        if not i or i['version'] != version or i['licence'] != 'CC BY 4.0':
            raise SystemExit(f'{sim} {version}: not the CC BY 4.0 file expected ({i})')
        open(os.path.join(d, f'{sim}_en.html'), 'wb').write(data)
        entry['built'] = i['built']
        entry['bytes'] = len(data)
        entry['sha256'] = hashlib.sha256(data).hexdigest()
        entry['credits'] = credits_of(text)
        # the picture: PhET's screenshot, 600 pixels wide, as a smaller JPEG
        png = os.path.join(tmp, 'thumb.png')
        r = subprocess.run(['curl', '-sS', '--fail', '--max-time', '60', '-o', png, f'{BASE}/{sim}/{version}/{sim}-600.png'])
        if r.returncode == 0:
            from PIL import Image
            im = Image.open(png).convert('RGB')
            im.thumbnail((480, 320))
            im.save(os.path.join(d, 'thumb.jpg'), quality=82, optimize=True, progressive=True)
            entry['thumb'] = f'{sim}/thumb.jpg'
            entry['thumbSize'] = list(im.size)
        else:
            print(f'  ({sim}: no picture)')
    print(f'{sim} {version} ({entry["built"]}): {entry["bytes"] / 1e6:.1f} MB')


def main(args):
    sims = json.load(open(LIST, encoding='utf-8'))
    only = [a for a in args if not a.startswith('-')]
    todo = [s for s in sims['sims'] if not only or s['id'] in only]
    if '--find' in args:
        for s in todo:
            i, how = find(s['id'])
            if i:
                print(f'{s["id"]}: {i["version"]} built {i["built"]} – {how}')
                s['version'] = i['version']
            else:
                print(f'{s["id"]}: {how}')
        json.dump(sims, open(LIST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        open(LIST, 'a').write('\n')
        return
    for s in todo:
        fetch(s)
    # the list the tab reads (everything but the hash)
    index = {'format': 'bms-sims-1', 'credit': sims['credit'], 'licence': sims['licence'], 'licenceUrl': sims['licenceUrl'],
             'topics': sims['topics'], 'sims': []}
    for s in sims['sims']:
        if not os.path.exists(os.path.join(OUT, s['id'], f'{s["id"]}_en.html')):
            continue
        index['sims'].append({k: v for k, v in s.items() if k != 'sha256'})
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    open(os.path.join(OUT, 'index.json'), 'a').write('\n')
    json.dump(sims, open(LIST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    open(LIST, 'a').write('\n')
    total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs)
    print(f'{len(index["sims"])} simulations, {total / 1e6:.1f} MB in sims/')


if __name__ == '__main__':
    main(sys.argv[1:])
