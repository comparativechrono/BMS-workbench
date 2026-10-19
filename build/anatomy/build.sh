#!/bin/sh
# Makes the Anatomy tab's models (anatomy/*.glb, anatomy/index.json, anatomy/definitions.json) from Z-Anatomy.
#
#   sh build/anatomy/build.sh WORK
#
# WORK is a scratch folder (several GB free) holding:
#   WORK/Z-Anatomy/Startup.blend   from Z-Anatomy.zip of https://github.com/Z-Anatomy/Models-of-human-anatomy
#   WORK/TA2.csv                   from the same repository
#   WORK/blender/blender           Blender 4.2 LTS for Linux (https://download.blender.org/release/Blender4.2/)
#   WORK/npm/                      a folder in which `npm install @gltf-transform/cli@4.5.1` has been run
# It needs about 1 GB of memory and a few minutes.
set -e
SITE="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$1"
[ -n "$WORK" ] || { echo "usage: sh build/anatomy/build.sh WORK"; exit 1; }
mkdir -p "$WORK/raw" "$SITE/anatomy"
# 1. Blender: each structure evaluated (modifiers, tubes of curves), simplified and written as glTF, one file per part
"$WORK/blender/blender" -b --factory-startup --python "$SITE/build/anatomy/export.py" -- \
  "$WORK/Z-Anatomy/Startup.blend" "$SITE/build/anatomy/config.json" "$WORK/raw"
# 2. gltf-transform: positions and normals quantized and compressed (EXT_meshopt_compression)
for f in "$WORK"/raw/*.glb; do
  "$WORK/npm/node_modules/.bin/gltf-transform" meshopt "$f" "$SITE/anatomy/$(basename "$f")" --level high
done
# 3. the index of the structures, their Latin names and their definitions
python3 -I "$SITE/build/anatomy/make_index.py" "$WORK/raw" "$WORK/TA2.csv" "$SITE/anatomy"
