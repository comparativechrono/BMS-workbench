"""Writes anatomy/index.json (the model files, the systems shown in the tab's list, and every structure: its names,
Latin name and TA2 number, systems, groups, colour, size and the place for its label) and anatomy/definitions.json
(a short definition of each structure, from the Wikipedia text that Z-Anatomy keeps, with its link), from what
export.py wrote. Also lists the sizes of the compressed models.

    python3 -I build/anatomy/make_index.py RAW_DIR TA2.csv SITE/anatomy
"""
import csv
import json
import os
import re
import sys

RAW, TA2, OUT = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))

# ---------------------------------------------------------------- the structures of each file
files, structs = [], []
for f in cfg['files']:
    p = os.path.join(RAW, f'structures-{f["id"]}.json')
    if not os.path.exists(p):
        continue
    d = json.load(open(p, encoding='utf-8'))
    glb = os.path.join(OUT, f['id'] + '.glb')
    files.append({'id': f['id'], 'title': f['title'], 'file': f['id'] + '.glb', 'bytes': os.path.getsize(glb) if os.path.exists(glb) else 0,
                  'structures': len(d['structures']), 'triangles': sum(s['tris'] for s in d['structures'])})
    for s in d['structures']:
        s['file'] = f['id']
        structs.append(s)
by_id = {s['id']: s for s in structs}

# ---------------------------------------------------------------- Latin names and TA2 numbers (Z-Anatomy's TA2.csv)
ta = {}
with open(TA2, encoding='utf-8-sig') as fh:
    # (each line of TA2.csv is wrapped in quotes: "TA2ID;English;Latin;…")
    for line in fh:
        row = line.strip().strip('"').split(';')
        if len(row) < 3 or not row[0].isdigit():
            continue
        ta.setdefault(row[1].strip().lower(), (row[0], row[2].strip()))


def ta_of(base):
    for k in (base, re.sub(r'\s*\(.*?\)\s*', ' ', base).strip(), base.replace('(', '').replace(')', '')):
        k = k.lower().strip()
        if k in ta:
            return ta[k]
    return None


# ---------------------------------------------------------------- the systems of the list in the tab
SYSTEMS = [
    ('skeleton', 'Skeleton', ['skeleton'], []),
    ('muscles', 'Muscles', ['muscles'], ['diaphragm']),
    ('heart', 'Heart and great vessels', ['heart'], []),
    ('vessels', 'Arteries and veins', ['vessels'], []),
    ('respiratory', 'Respiratory system', ['respiratory'], ['@Laryngeal cartilages']),
    ('digestive', 'Digestive system', ['digestive'], []),
    ('urinary', 'Urinary system', ['urinary'], []),
    ('reproductive', 'Reproductive system (male)', ['reproductive'], []),
    ('endocrine', 'Endocrine glands', ['endocrine'], ['pancreas', 'testis-left', 'testis-right']),
    ('brain', 'Brain', ['brain'], ['hypothalamus']),
    ('nerves', 'Spinal cord, nerves and eyes', ['nerves'], []),
    ('lymphoid', 'Lymphoid organs', ['lymphoid'], []),
]
systems = []
for sid, title, fl, also in SYSTEMS:
    members = [s['id'] for s in structs if s['file'] in fl and not (sid == 'muscles' and False)]
    if sid == 'brain':
        members = [m for m in members]
    extra = []
    for a in also:
        if a.startswith('@'):
            extra += [s['id'] for s in structs if a[1:] in s['path']]
        elif a in by_id:
            extra.append(a)
    if sid == 'endocrine':
        members = [m for m in members]
    ids = members + [x for x in extra if x not in members]
    if not ids:
        continue
    systems.append({'id': sid, 'title': title, 'files': fl, 'structures': ids})
for s in structs:
    s['systems'] = [y['id'] for y in systems if s['id'] in y['structures']]
# (the hypothalamus is kept with the endocrine glands' file but belongs to the brain as well)

# ---------------------------------------------------------------- definitions: the start of Z-Anatomy's Wikipedia text
def summary(text):
    if not text:
        return None, None
    url = None
    m = re.findall(r'(https?://\S+)\s*$', text.strip())
    if m:
        url = m[-1]
    body = text.strip()
    if url:
        body = body[: body.rfind(url)].strip()
    paras = [p.strip() for p in re.split(r'\n\s*\n', body) if p.strip()]
    # (the first paragraph is the title, in capitals)
    if paras and paras[0] == paras[0].upper():
        paras = paras[1:]
    out = ''
    for p in paras:
        if p.startswith('=='):
            break
        p = re.sub(r'\[\d+\]', '', p)
        p = re.sub(r'\s+', ' ', p).strip()
        # (what is left of pronunciations and other parts that Z-Anatomy's copy left out: "The femur (, pl. femurs )")
        p = re.sub(r'\(\s*[,;]\s*', '(', p)
        p = re.sub(r'\s+\)', ')', p)
        p = re.sub(r'\s*\(\s*\)', '', p)
        p = re.sub(r'\s+([,.;])', r'\1', p)
        if not p:
            continue
        out = (out + ' ' + p).strip()
        if len(out) >= 280:
            break
    if len(out) > 620:
        cut = out[:620]
        k = max(cut.rfind('. '), cut.rfind('.'))
        out = cut[: k + 1] if k > 200 else cut.rstrip() + '…'
    return (out or None), url


defs = {}
for s in structs:
    t = s.pop('definition', None)
    if s['base'] in defs:
        continue
    txt, url = summary(t)
    if txt:
        defs[s['base']] = {'text': txt, 'url': url}

# ---------------------------------------------------------------- the groups of the list (a level of each structure's path)
DEPTH = {'skeleton': 1, 'muscles': 1, 'vessels': 2, 'nerves': 2, 'lymphoid': 2, 'heart': 1, 'digestive': 2, 'respiratory': 2,
         'urinary': 1, 'reproductive': 2, 'endocrine': 1}
BRAIN = ['Frontal lobe', 'Parietal lobe', 'Temporal lobe', 'Occipital lobe', 'Limbic lobe', 'Insula', 'Interlobar sulci',
         'Basal forebrain', 'Corpus striatum', 'Diencephalon', 'Midbrain', 'Pons', 'Medulla oblongata', 'Cerebellum', 'Brainstem',
         'Telencephalon']
DROP = ('Visceral systems', 'Nervous system & Sense organs', 'Arterial system', 'Venous system')


def group_of(s):
    path = [p for p in s['path'] if p not in DROP]
    if s['file'] == 'brain':
        for p in reversed(path):
            if p in BRAIN:
                return p
        return 'Brain'
    if s['id'] == 'hypothalamus':
        return 'Hypothalamus'
    if s['id'] == 'diaphragm':
        return 'Muscles of breathing'
    d = DEPTH.get(s['file'], 1)
    return path[d] if len(path) > d else (path[-1] if path else '')


# ---------------------------------------------------------------- write
paths, path_ix = [], {}
out_structs = []
r3 = lambda v: [round(x, 3) for x in v]
for s in structs:
    t = ta_of(s['base'])
    path = [p for p in s['path'] if p not in DROP]
    key = '\t'.join(path)
    if key not in path_ix:
        path_ix[key] = len(paths)
        paths.append(path)
    # (the name shown is base + ' (left)' or ' (right)': the tab writes it)
    rec = {'id': s['id'], 'base': s['base'], 'side': s['side'], 'file': s['file'], 'systems': s['systems'],
           'group': group_of(s), 'path': path_ix[key], 'colour': s['colour'], 'min': r3(s['min']), 'max': r3(s['max']),
           'anchor': r3(s['anchor'])}
    if t:
        rec['ta2'] = t[0]
        rec['latin'] = t[1]
    out_structs.append({k: v for k, v in rec.items() if v is not None})
index = {
    'format': 'bms-anatomy-1',
    'about': 'The models of the Anatomy tab, converted from Z-Anatomy (build/anatomy). Coordinates in metres, Y up, the body facing +Z; the patient\'s left is +X.',
    'credit': {
        'models': 'Z-Anatomy – the libre 3D atlas of anatomy, by Gauthier Kervyn and others (CC BY-SA 4.0), largely made from BodyParts3D, © The Database Center for Life Science (CC BY-SA 2.1 Japan); the brain\'s surface from "Brain for Blender" by Anderson M. Winkler (CC BY-SA 3.0); the cranial nerves after "Cranial Nerves and Foramina", University of Dundee, CAHID (CC BY 4.0). Simplified and converted for the BMS workbench (CC BY-SA 4.0).',
        'definitions': 'The definitions are the opening sentences of Wikipedia\'s articles (CC BY-SA), as kept in Z-Anatomy; each links to its article.',
        'licence': 'CC BY-SA 4.0', 'licenceUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'links': {'Z-Anatomy': 'https://www.z-anatomy.com/', 'Z-Anatomy (GitHub)': 'https://github.com/Z-Anatomy/Models-of-human-anatomy',
                  'BodyParts3D': 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/', 'Brain for Blender': 'https://brainder.org/research/brain-for-blender/'}
    },
    'paths': paths, 'files': files, 'systems': [{k: v for k, v in y.items() if k != 'structures'} | {'n': len(y['structures']), 'structures': y['structures']} for y in systems],
    'structures': out_structs,
}
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(defs, open(os.path.join(OUT, 'definitions.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out_structs), 'structures;', sum(1 for s in out_structs if 'latin' in s), 'with Latin names;', len(defs), 'definitions')
for f in files:
    print(f"  {f['id']:13s} {f['structures']:4d} structures {f['triangles']:7d} triangles {f['bytes'] / 1e6:6.2f} MB")
print('index.json', os.path.getsize(os.path.join(OUT, 'index.json')) // 1000, 'kB; definitions.json',
      os.path.getsize(os.path.join(OUT, 'definitions.json')) // 1000, 'kB')
