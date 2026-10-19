"""Writes an inventory of Z-Anatomy's Startup.blend (JSON): the tree of collections and the objects in each, each object's
kind, parent, modifiers, materials, size (triangles or curve points), the materials' colours, the texts (definitions)
and the label objects. Everything is appended without being put in a scene, so nothing is evaluated (loading the file
itself evaluates every object and needs more than 6 GB of memory).
    blender -b --factory-startup --python build/anatomy/inventory.py -- Startup.blend inventory.json
"""
import bpy, json, sys, resource

args = sys.argv[sys.argv.index('--') + 1:]
path, out = args[0], args[1]
with bpy.data.libraries.load(path, link=False) as (src, dst):
    dst.collections = list(src.collections)
    dst.objects = list(src.objects)
    dst.texts = list(src.texts)
print('appended; maxrss MB', resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, flush=True)


def color_of(m):
    """the colour a material shows: the Base Color of its Principled BSDF or of a group input, else its viewport colour"""
    if m is None:
        return None
    col = list(m.diffuse_color)
    try:
        if m.use_nodes and m.node_tree:
            for n in m.node_tree.nodes:
                for name in ('Base Color', 'Color', 'Base color', 'Colour'):
                    s = n.inputs.get(name) if hasattr(n, 'inputs') else None
                    if s is not None and not s.is_linked and hasattr(s, 'default_value') and len(s.default_value) >= 3:
                        return {'viewport': col, 'node': list(s.default_value)[:4], 'node_type': n.bl_idname, 'node_name': n.name}
    except Exception as e:
        return {'viewport': col, 'err': str(e)}
    return {'viewport': col}


objs = {}
for o in bpy.data.objects:
    d = {'type': o.type, 'parent': o.parent.name if o.parent else None, 'data': o.data.name if o.data else None,
         'mods': [[m.type, m.name] + ([m.levels, m.render_levels] if m.type == 'SUBSURF' else []) for m in o.modifiers],
         'mats': [s.material.name if s.material else None for s in o.material_slots],
         'colls': [c.name for c in o.users_collection], 'hide_render': o.hide_render, 'hide_viewport': o.hide_viewport,
         'loc': [round(v, 4) for v in o.matrix_world.translation], 'dims': [round(v, 4) for v in o.dimensions],
         'color': list(o.color)}
    if o.type == 'MESH':
        me = o.data
        d['tris'] = sum(len(p.vertices) - 2 for p in me.polygons)
        d['verts'] = len(me.vertices)
        d['edges'] = len(me.edges)
    elif o.type == 'CURVE':
        cu = o.data
        d['curve'] = {'splines': len(cu.splines), 'points': sum(len(s.points) + len(s.bezier_points) for s in cu.splines),
                      'bevel_depth': cu.bevel_depth, 'bevel_res': cu.bevel_resolution, 'res_u': cu.resolution_u,
                      'bevel_object': cu.bevel_object.name if cu.bevel_object else None, 'extrude': cu.extrude,
                      'taper': cu.taper_object.name if cu.taper_object else None}
    # (a text's body is not read: reading it from a text that has never been evaluated crashes Blender 4.2; the labels'
    # texts are their objects' names)
    for k in o.keys():
        v = o[k]
        if isinstance(v, (int, float, str)):
            d.setdefault('props', {})[k] = v
    objs[o.name] = d

cols = {}
for c in bpy.data.collections:
    cols[c.name] = {'children': [k.name for k in c.children], 'objects': [o.name for o in c.objects],
                    'hide_render': c.hide_render, 'hide_viewport': c.hide_viewport, 'color_tag': c.color_tag}
mats = {m.name: color_of(m) for m in bpy.data.materials}
texts = {t.name: t.as_string() for t in bpy.data.texts}
res = {'objects': objs, 'collections': cols, 'materials': mats, 'texts': texts,
       'maxrss_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024}
json.dump(res, open(out, 'w'))
print('done; maxrss MB', res['maxrss_mb'])
