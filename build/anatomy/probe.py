"""Appends one collection of a .blend file (with what it holds) into an empty Blender and describes it: its tree of
collections, the kinds of object, triangles, modifiers, materials, custom properties, parents, and the memory used.
    blender -b --factory-startup --python build/anatomy/probe.py -- Startup.blend "Urinary system" out.json
"""
import bpy, json, sys, resource
from collections import Counter

args = sys.argv[sys.argv.index('--') + 1:]
path, name, out = args[0], args[1], args[2]
with bpy.data.libraries.load(path, link=False) as (src, dst):
    dst.collections = [name]
col = dst.collections[0]


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == 'MESH' else 0


def walk(c):
    objs = list(c.objects)
    return {'name': c.name, 'n': len(objs), 'kinds': dict(Counter(o.type for o in objs)), 'tris': sum(tris(o) for o in objs),
            'objs': [{'name': o.name, 'type': o.type, 'tris': tris(o), 'mods': [(m.type, m.name) for m in o.modifiers],
                      'mats': [s.material.name if s.material else None for s in o.material_slots],
                      'parent': o.parent.name if o.parent else None, 'props': {k: str(o[k])[:120] for k in o.keys()},
                      'body': o.data.body[:120] if o.type == 'FONT' else None,
                      'hide': [o.hide_viewport, o.hide_render, o.hide_get() if False else None]} for o in objs],
            'children': [walk(k) for k in c.children]}


res = walk(col)
res['maxrss_mb'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
res['n_objects'] = len(bpy.data.objects)
res['n_texts'] = len(bpy.data.texts)
res['texts'] = [t.name for t in bpy.data.texts][:50]
json.dump(res, open(out, 'w'), indent=1)
print('maxrss MB', res['maxrss_mb'], 'objects', len(bpy.data.objects), 'meshes', len(bpy.data.meshes))
