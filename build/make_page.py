"""Write ../index.html: the page shell (template.html) with the chapters of the practical (chapters.py) in it, and the
list of the files that a new user finds in their home folder (everything in ../starter: starter/data/x.csv becomes
~/data/x.csv). It also writes the lists that the tabs read: slides/index.json (the microscope's slide box, from each
slides/*/slide.json), exams/index.json (the papers of exam practice) and examples/index.json (the diagrams and circuits).
Run:  python3 build/make_page.py"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import chapters  # noqa: E402

# the starter files: starter/ of the site → ~/ of the user. Increase STARTERS_VERSION when you add a starter file after
# students have started, so that they receive it (files they already have are left alone).
STARTERS_VERSION = 1
starters = []
for root, dirs, files in os.walk(os.path.join(SITE, 'starter')):
    dirs.sort()
    for f in sorted(files):
        rel = os.path.relpath(os.path.join(root, f), os.path.join(SITE, 'starter')).replace(os.sep, '/')
        if f in ('README.md', '.DS_Store'):
            continue
        starters.append({'p': rel, 's': os.path.getsize(os.path.join(root, f))})


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')


# the slide box: one entry for each slide folder, in the order of the systems
SYSTEMS = ['Endocrine', 'Cardiovascular', 'Respiratory', 'Urinary', 'Digestive', 'Muscle', 'Nervous', 'Lymphoid', 'Skin',
           'Reproductive', 'Measuring', 'Other']
slides = []
sdir = os.path.join(SITE, 'slides')
if os.path.isdir(sdir):
    for d in sorted(os.listdir(sdir)):
        p = os.path.join(sdir, d, 'slide.json')
        if not os.path.exists(p):
            continue
        s = json.load(open(p, encoding='utf-8'))
        src = s.get('source', {})
        slides.append({
            'id': s['id'], 'title': s['title'], 'system': s.get('system', 'Other'), 'description': s.get('description', ''),
            'stain': s.get('stain', ''), 'width': s['width'], 'height': s['height'], 'mpp': s['mpp'],
            'credit': src.get('credit', ''), 'bytes': s.get('packBytes', 0), 'labels': len(s.get('labels', [])),
            'order': s.get('order', 0)
        })
    slides.sort(key=lambda x: (SYSTEMS.index(x['system']) if x['system'] in SYSTEMS else 99, x['order'], x['title']))
    write_json(os.path.join(sdir, 'index.json'), {'format': 'bms-slides-1', 'systems': SYSTEMS, 'slides': slides})


# the papers of exam practice: exams/*.json (but index.json)
papers = []
edir = os.path.join(SITE, 'exams')
if os.path.isdir(edir):
    for f in sorted(os.listdir(edir)):
        if not f.endswith('.json') or f == 'index.json':
            continue
        e = json.load(open(os.path.join(edir, f), encoding='utf-8'))
        papers.append({'id': e['id'], 'file': f, 'title': e['title'], 'kind': e.get('kind', 'practice'),
                       'minutes': e.get('minutes'), 'questions': len([q for q in e.get('questions', []) if q.get('type') != 'info']),
                       'description': e.get('description', ''), 'order': e.get('order', 0)})
    papers.sort(key=lambda x: (x['order'], x['title']))
    write_json(os.path.join(edir, 'index.json'), {'format': 'bms-exams-1', 'papers': papers})


# the examples of the Diagrams and Circuits tabs: examples/diagrams/*.flow.json, examples/circuits/*.circuit.json
examples = {}
for kind, folder, ext in (('diagrams', 'diagrams', '.flow.json'), ('circuits', 'circuits', '.circuit.json')):
    d = os.path.join(SITE, 'examples', folder)
    out = []
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if not f.endswith(ext):
                continue
            e = json.load(open(os.path.join(d, f), encoding='utf-8'))
            out.append({'id': f[:-len(ext)], 'file': folder + '/' + f, 'title': e.get('title', f), 'description': e.get('description', ''),
                        'group': e.get('group', ''), 'order': e.get('order', 0)})
    out.sort(key=lambda x: (x['order'], x['title']))
    examples[kind] = out
if any(examples.values()):
    write_json(os.path.join(SITE, 'examples', 'index.json'), {'format': 'bms-examples-1', **examples})


html = '\n'.join(chapters.ALL())
# the first chapter is visible when the page loads
html = html.replace(' hidden>', '>', 1)
shell = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
a = shell.index('<!--CHAPTERS-->') + len('<!--CHAPTERS-->')
b = shell.index('<!--/CHAPTERS-->')
page = shell[:a] + '\n' + html + shell[b:]
page = page.replace('<!--STARTERS-->', '<script>window.BMS_STARTERS = ' + json.dumps(starters, separators=(',', ':')) +
                    f';\nwindow.BMS_STARTERS_VERSION = {STARTERS_VERSION};</script>')
tmp = os.path.join(SITE, f'.index.html.{os.getpid()}')
open(tmp, 'w', encoding='utf-8').write(page)
os.replace(tmp, os.path.join(SITE, 'index.html'))
# every task and question needs its own name
bad = False
for what, pat in (('task', r'data-task="([^"]+)"'), ('question', r'data-q="([^"]+)"'), ('heading', r'<h2 id="([^"]+)"')):
    ids = re.findall(pat, html)
    dup = sorted({x for x in ids if ids.count(x) > 1})
    print(f'{len(ids)} {what}s' + (f' – used twice: {dup}' if dup else ''))
    bad = bad or bool(dup)
print(len(html), 'bytes of chapters;', len(starters), 'starter files;', len(slides), 'slides;', len(papers), 'papers;',
      sum(len(v) for v in examples.values()), 'examples')
sys.exit(1 if bad else 0)
