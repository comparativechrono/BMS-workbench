#!/usr/bin/env python3
"""Copy the labels (and the texts) of gtex-slides.json into the slides' slide.json files, without making the tiles
again. Run it after changing a slide's labels, description or "look for" list; then run build/make_page.py.

A label is {"key": "glomerulus", "text": "Renal corpuscle", "find": "a renal corpuscle", "x": 1234, "y": 2345, "r": 120}
in full-resolution pixels of the slide (the microscope shows them as pins with their text). "r" (a circle) or "poly"
(a list of [x, y] points) gives the region that counts as the structure when a practical asks students to find it
(data-scope-find="slide:key"); several labels can share a key (any of them counts). "find" is how the request names
it ("Find a renal corpuscle and click on it"); without it, the text is used.

usage:  python3 build/slides/labels.py            # every slide
        python3 build/slides/labels.py adrenal-gland
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
KEYS = ('title', 'system', 'description', 'look_for', 'labels', 'order')


def main(ids):
    entries = json.load(open(os.path.join(HERE, 'gtex-slides.json'), encoding='utf-8'))
    for e in entries:
        if ids and e['id'] not in ids:
            continue
        p = os.path.join(SITE, 'slides', e['id'], 'slide.json')
        if not os.path.exists(p):
            print('not made yet:', e['id'])
            continue
        s = json.load(open(p, encoding='utf-8'))
        for k in KEYS:
            if k in e:
                s[k] = e[k]
        W, H = s['width'], s['height']
        for L in s.get('labels', []):
            if not (0 <= L['x'] <= W and 0 <= L['y'] <= H):
                print(f"  {e['id']}: the label {L['text']!r} is outside the slide ({L['x']}, {L['y']})")
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(s, f, indent=1, ensure_ascii=False)
            f.write('\n')
        print(e['id'], len(s.get('labels', [])), 'labels')


if __name__ == '__main__':
    main(sys.argv[1:])
