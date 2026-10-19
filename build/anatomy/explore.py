"""Lists what is in Z-Anatomy's Startup.blend: its collections (as a tree, with the number of objects and triangles of
each), the kinds of object, the custom properties, the materials, the texts. Run with Blender:
    blender -b Startup.blend --python build/anatomy/explore.py -- out.json
"""
import bpy, json, sys
from collections import Counter

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else None


def tris(o):
    if o.type != 'MESH':
        return 0
    m = o.data
    return sum(len(p.vertices) - 2 for p in m.polygons)


def walk(c, depth=0):
    objs = list(c.objects)
    kinds = Counter(o.type for o in objs)
    t = sum(tris(o) for o in objs)
    node = {'name': c.name, 'n': len(objs), 'kinds': dict(kinds), 'tris': t, 'hide': c.hide_viewport, 'hide_render': c.hide_render,
            'children': [walk(k, depth + 1) for k in c.children], 'sample': [o.name for o in objs[:6]]}
    return node


scene = bpy.context.scene
tree = walk(scene.collection)
kinds = Counter(o.type for o in bpy.data.objects)
props = Counter()
for o in bpy.data.objects:
    for k in o.keys():
        props[k] += 1
mats = [{'name': m.name, 'users': m.users, 'color': list(m.diffuse_color)} for m in bpy.data.materials][:400]
texts = [{'name': t.name, 'lines': len(t.lines), 'first': t.as_string()[:300]} for t in bpy.data.texts][:200]
fonts = [o for o in bpy.data.objects if o.type == 'FONT']
font_samples = [{'name': o.name, 'body': o.data.body[:200], 'parent': o.parent.name if o.parent else None, 'colls': [c.name for c in o.users_collection]} for o in fonts[:40]]
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
mesh_samples = [{'name': o.name, 'tris': tris(o), 'mods': [m.type for m in o.modifiers], 'mats': [s.material.name if s.material else None for s in o.material_slots],
                 'colls': [c.name for c in o.users_collection], 'parent': o.parent.name if o.parent else None, 'props': {k: str(o[k])[:200] for k in o.keys()}} for o in meshes[:60]]
res = {'kinds': dict(kinds), 'props': dict(props.most_common(40)), 'n_mats': len(bpy.data.materials), 'mats': mats, 'texts': texts,
       'fonts': font_samples, 'meshes': mesh_samples, 'tree': tree, 'total_tris': sum(tris(o) for o in meshes),
       'scenes': [s.name for s in bpy.data.scenes]}
if out:
    json.dump(res, open(out, 'w'), indent=1)
print('kinds', dict(kinds), 'tris', res['total_tris'])
