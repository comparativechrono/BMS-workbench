"""Lists the names of the datablocks in a .blend file without loading them (bpy.data.libraries.load), so that a big
file can be looked at in little memory. Run with Blender, from an empty file:
    blender -b --factory-startup --python build/anatomy/list_blend.py -- Startup.blend out.json
"""
import bpy, json, sys

args = sys.argv[sys.argv.index('--') + 1:]
path, out = args[0], args[1]
with bpy.data.libraries.load(path, link=False) as (src, dst):
    res = {k: list(getattr(src, k)) for k in ('collections', 'objects', 'meshes', 'materials', 'texts', 'curves', 'fonts',
                                               'node_groups', 'images', 'scenes', 'cameras', 'lights', 'actions', 'worlds')}
json.dump(res, open(out, 'w'), indent=0)
print({k: len(v) for k, v in res.items()})
