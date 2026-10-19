"""Converts Z-Anatomy's Startup.blend into the model files of the Anatomy tab: one glTF binary (.glb) for each file of
config.json, with one node (and one mesh) for each structure, and a list of the structures (structures-<file>.json:
names, groups, colours, sizes, the place for a label, and Z-Anatomy's definition).

Run with Blender 4.2 (in the background, from an empty file):
    blender -b --factory-startup --python build/anatomy/export.py -- Startup.blend build/anatomy/config.json OUT [file ids]

How it keeps within a few GB of memory: loading Startup.blend itself evaluates every object of the scene (the
subdivision surfaces, the curves' tubes and the thousands of labels) and needs more than 6 GB. Here every object is
appended without being put into the scene, so nothing is evaluated; then each structure in turn is put into the scene,
evaluated (with its modifiers: mirror, solidify, subdivision – at a lower level – and the tubes of curves, with fewer
sides), simplified with a Decimate modifier when it has more triangles than its file allows, read, and taken out again.

The models are converted from Blender's axes (Z up, the body facing −Y) to glTF's (Y up, the body facing +Z), in metres.
"""
import bpy
import json
import math
import os
import re
import resource
import struct
import sys
import time

import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
BLEND, CFG, OUT = args[0], args[1], args[2]
ONLY = set(args[3:])
cfg = json.load(open(CFG, encoding='utf-8'))
os.makedirs(OUT, exist_ok=True)
t0 = time.time()


def log(*a):
    print(f'[{time.time() - t0:7.1f}s {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024:6.0f} MB]', *a, flush=True)


with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
    dst.collections = list(src.collections)  # (so that each object knows its collections; none is put in the scene)
    dst.objects = list(src.objects)
    dst.texts = list(src.texts)
log('appended', len(bpy.data.objects), 'objects')

# ---------------------------------------------------------------- which objects are structures, and where they go
KEEP_COLLECTIONS = {'1: Skeletal system', '4: Muscular system', '5: Cardiovascular system', '6: Lymphoid organs',
                    '7: Nervous system & Sense organs', '8: Visceral systems'}
# Z-Anatomy's own objects that are not structures: group labels (.g), labels (.t, .s, .st), their leader lines (.j, .i)
# and the places where muscles are attached (.ol, .or, .el, .er, .o1l…)
NOT_STRUCTURE = re.compile(r'\.(j|g|i|t|s|st|[oe]\d*[lr])$')
EXCL_GROUPS = set(cfg['exclude']['groups'])
EXCL_NAMES = [re.compile(p) for p in cfg['exclude']['names']]
FILES = [f for f in cfg['files'] if not ONLY or f['id'] in ONLY]


def ancestors(o):
    out = []
    p = o.parent
    while p is not None:
        out.append(p.name)
        p = p.parent
    return out  # nearest first


def file_for(o, anc):
    for f in FILES:
        if o.name in f.get('objects', []):
            return f
    for f in FILES:
        if any(a in f.get('groups', []) for a in anc):
            return f
    return None


chosen = {f['id']: [] for f in FILES}
left_out = []
for o in bpy.data.objects:
    if o.type not in ('MESH', 'CURVE') or NOT_STRUCTURE.search(o.name):
        continue
    if not any(c.name in KEEP_COLLECTIONS for c in o.users_collection):
        continue
    if o.type == 'MESH' and len(o.data.polygons) == 0:
        continue
    anc = ancestors(o)
    if any(a in EXCL_GROUPS for a in anc) or any(p.search(o.name) for p in EXCL_NAMES):
        left_out.append(o.name)
        continue
    f = file_for(o, anc)
    if f:
        chosen[f['id']].append(o)
log('chosen', {k: len(v) for k, v in chosen.items()}, 'left out', len(left_out))

# ---------------------------------------------------------------- names, colours
SIDE = {'l': 'left', 'r': 'right'}


def split_name(n):
    """'Kidney.l' → ('Kidney', 'left'); 'Thyroid gland' → ('Thyroid gland', None)"""
    m = re.match(r'^(.*)\.([lr])$', n)
    return (m.group(1), SIDE[m.group(2)]) if m else (n, None)


RENAME = {
    'Lat_Fis-ant-Vertical': 'Anterior vertical ramus of lateral sulcus',
    'Lat_Fis-ant-Horizont': 'Anterior horizontal ramus of lateral sulcus',
    'Lat_Fis-post': 'Posterior ramus of lateral sulcus',
    'Sulcus interm_prim-Jensen': 'Intermediate sulcus of Jensen',
}


def clean(base):
    """the name shown: Z-Anatomy's name without its marks ('*' after the names of the Destrieux atlas, '(…)' round a
    structure that is not always there), and a few names of the atlas written out"""
    b = RENAME.get(base.strip(), base.strip())
    b = b.replace('*', '').replace('  ', ' ').strip()
    if b.startswith('(') and b.endswith(')') and b.count('(') == 1:
        b = b[1:-1]
    return b[0].upper() + b[1:] if b else b


def slug(s):
    s = s.lower().replace('&', 'and')
    s = re.sub(r"[’'()*,./]", ' ', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


COL = cfg['colours']
NAME_COL = [(re.compile(p, re.I), c) for p, c in COL['name']]


def colour_of(o, base):
    for p, c in NAME_COL:
        if p.search(base):
            return c
    for s in o.material_slots:
        m = s.material.name if s.material else None
        if not m:
            continue
        if m in COL['muscle_like']:
            return COL['material']['muscle_like']
        if m in COL['material']:
            return COL['material'][m]
        root = re.sub(r"[-'\s]*\d*'*$", '', m)  # Bone-3 → Bone, Lung-base → Lung, Nerve-6 → Nerve
        root = re.sub(r'-base$', '', root)
        if root in COL['material']:
            return COL['material'][root]
    return COL['fallback']


def srgb_to_linear(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


# ---------------------------------------------------------------- evaluating one structure
scene = bpy.context.scene
TMP = bpy.data.collections.new('export-tmp')
scene.collection.children.link(TMP)


def evaluated_mesh(o, f):
    """the object with its modifiers applied, as a new mesh (and its matrix)"""
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.levels = min(m.levels, f.get('subsurf', 1))
        elif m.type == 'MULTIRES':
            m.levels = 0
    if o.type == 'CURVE':
        cu = o.data
        cu.bevel_resolution = min(cu.bevel_resolution, f.get('bevel', 1))
        cu.resolution_u = min(cu.resolution_u, f.get('resu', 3))
    TMP.objects.link(o)
    try:
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        oe = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=False, depsgraph=dg)
        M = np.array(oe.matrix_world, dtype=np.float64)
    finally:
        TMP.objects.unlink(o)
    return me, M


def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def decimated(me, target):
    """the mesh simplified to about `target` triangles (Blender's Decimate modifier, collapse)"""
    n = tri_count(me)
    if target <= 0 or n <= target:
        return me
    ob = bpy.data.objects.new('export-decimate', me)
    TMP.objects.link(ob)
    try:
        mod = ob.modifiers.new('d', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = max(0.01, target / n)
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    finally:
        TMP.objects.unlink(ob)
        bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return me2


def arrays(me, M):
    """positions (world, Y up), smooth normals and triangles of a mesh"""
    me.calc_loop_triangles()
    nv = len(me.vertices)
    nt = len(me.loop_triangles)
    if nv == 0 or nt == 0:
        return None
    co = np.empty(nv * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3).astype(np.float64)
    tri = np.empty(nt * 3, dtype=np.int32)
    me.loop_triangles.foreach_get('vertices', tri)
    tri = tri.reshape(-1, 3)
    co = co @ M[:3, :3].T + M[:3, 3]
    if np.linalg.det(M[:3, :3]) < 0:
        tri = tri[:, ::-1]
    # (only the vertices of triangles: loose vertices and edges dropped)
    used = np.unique(tri)
    remap = -np.ones(nv, dtype=np.int64)
    remap[used] = np.arange(len(used))
    co = co[used]
    tri = remap[tri]
    # Blender (x, y, z), Z up, body facing −Y → glTF (x, z, −y), Y up, body facing +Z
    co = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    v0, v1, v2 = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    nrm = np.zeros_like(co)
    for k in range(3):
        np.add.at(nrm, tri[:, k], fn)
    ln = np.linalg.norm(nrm, axis=1)
    ln[ln == 0] = 1
    nrm /= ln[:, None]
    return co.astype(np.float32), nrm.astype(np.float32), tri.astype(np.uint32)


# ---------------------------------------------------------------- glTF binary
def write_glb(path, items):
    """items: [{id, name, colour, pos, nrm, tri}] → one node and mesh each; materials shared by colour"""
    bin_parts = []
    offset = 0
    views, accessors, meshes, nodes, materials = [], [], [], [], []
    mat_of = {}

    def add_view(data, target):
        nonlocal offset
        b = data.tobytes()
        pad = (-len(b)) % 4
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(b), 'target': target})
        bin_parts.append(b + b'\0' * pad)
        offset += len(b) + pad
        return len(views) - 1

    for it in items:
        pos, nrm, tri = it['pos'], it['nrm'], it['tri']
        iv = add_view(pos, 34962)
        accessors.append({'bufferView': iv, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3',
                          'min': pos.min(axis=0).tolist(), 'max': pos.max(axis=0).tolist()})
        a_pos = len(accessors) - 1
        iv = add_view(nrm, 34962)
        accessors.append({'bufferView': iv, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'})
        a_nrm = len(accessors) - 1
        small = len(pos) < 65536
        idx = tri.reshape(-1).astype(np.uint16 if small else np.uint32)
        iv = add_view(idx, 34963)
        accessors.append({'bufferView': iv, 'componentType': 5123 if small else 5125, 'count': len(idx), 'type': 'SCALAR'})
        a_idx = len(accessors) - 1
        c = it['colour']
        if c not in mat_of:
            mat_of[c] = len(materials)
            materials.append({'name': c, 'pbrMetallicRoughness': {'baseColorFactor': srgb_to_linear(c) + [1.0],
                                                                  'metallicFactor': 0.0, 'roughnessFactor': 0.75}})
        meshes.append({'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm}, 'indices': a_idx,
                                       'material': mat_of[c], 'mode': 4}]})
        nodes.append({'name': it['id'], 'mesh': len(meshes) - 1, 'extras': {'id': it['id']}})
    gltf = {'asset': {'version': '2.0', 'generator': 'BMS workbench build/anatomy/export.py (from Z-Anatomy, CC BY-SA 4.0)',
                      'copyright': 'Z-Anatomy (Gauthier Kervyn) and BodyParts3D (The Database Center for Life Science), CC BY-SA 4.0'},
            'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
            'materials': materials, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': offset}]}
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((-len(js)) % 4)
    binary = b''.join(bin_parts)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(struct.pack('<II', len(binary), 0x004E4942))
        fh.write(binary)


# ---------------------------------------------------------------- the definitions (Z-Anatomy's texts, from Wikipedia)
def definition(base):
    for k in (base, clean(base), base.replace('(', '').replace(')', '').strip()):
        t = bpy.data.texts.get(k)
        if t is not None:
            return t.as_string()
    return None


# ---------------------------------------------------------------- each file
for f in FILES:
    items, info = [], []
    ids = set()
    for o in sorted(chosen[f['id']], key=lambda x: x.name):
        try:
            me, M = evaluated_mesh(o, f)
        except Exception as e:
            log('  could not evaluate', o.name, e)
            continue
        n0 = tri_count(me)
        target = int(round(n0 * f.get('ratio', 1.0)))
        target = max(min(target, f.get('max', 10 ** 9)), min(n0, f.get('min', 0)))
        me = decimated(me, target)
        a = arrays(me, M)
        bpy.data.meshes.remove(me)
        if a is None:
            log('  empty', o.name)
            continue
        pos, nrm, tri = a
        base, side = split_name(o.name)
        name = clean(base)
        sid = slug(name) + ('-' + side if side else '')
        while sid in ids:
            sid += '-2'
        ids.add(sid)
        col = colour_of(o, name)
        anc = ancestors(o)
        path = [clean(split_name(re.sub(r'\.g$', '', x))[0]) for x in reversed(anc)]
        lo, hi = pos.min(axis=0), pos.max(axis=0)
        centre = (lo + hi) / 2
        anchor = pos[np.argmin(((pos - pos.mean(axis=0)) ** 2).sum(axis=1))]
        items.append({'id': sid, 'name': name, 'colour': col, 'pos': pos, 'nrm': nrm, 'tri': tri})
        info.append({'id': sid, 'name': name + (f' ({side})' if side else ''), 'base': name, 'side': side, 'blender': o.name,
                     'path': path, 'colour': col, 'tris': int(len(tri)), 'tris_source': int(n0), 'kind': o.type.lower(),
                     'min': [round(float(x), 4) for x in lo], 'max': [round(float(x), 4) for x in hi],
                     'centre': [round(float(x), 4) for x in centre], 'anchor': [round(float(x), 4) for x in anchor],
                     'material': o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else None,
                     'definition': definition(base)})
    write_glb(os.path.join(OUT, f['id'] + '.glb'), items)
    json.dump({'file': f['id'], 'title': f['title'], 'structures': info}, open(os.path.join(OUT, f'structures-{f["id"]}.json'), 'w'),
              ensure_ascii=False, indent=0)
    log(f"{f['id']}: {len(items)} structures, {sum(len(i['tri']) for i in items)} triangles, "
        f"{os.path.getsize(os.path.join(OUT, f['id'] + '.glb')) / 1e6:.1f} MB")
json.dump(sorted(left_out), open(os.path.join(OUT, 'left-out.json'), 'w'), indent=0)
log('done')
