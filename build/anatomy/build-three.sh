#!/bin/sh
# Bundles the parts of three.js that the Anatomy tab uses (build/anatomy/three-entry.js) into
# assets/vendor/three/three-anatomy.min.js, an IIFE that sets window.THREE. Run it from a scratch folder in which
#   npm install three@0.186.1 esbuild@0.28.2
# has been run:   sh /path/to/bms-workbench/build/anatomy/build-three.sh /path/to/bms-workbench
set -e
SITE="$1"
cp "$SITE/build/anatomy/three-entry.js" ./three-entry.js
./node_modules/.bin/esbuild three-entry.js --bundle --minify --format=iife --global-name=THREE --target=es2019 \
  --legal-comments=eof \
  --banner:js="/*! three.js 0.186.1 (MIT, https://threejs.org, Copyright 2010-2026 three.js authors) with GLTFLoader, OrbitControls and the meshoptimizer decoder (MIT, Copyright Arseny Kapoulkine): bundled for the BMS workbench's Anatomy tab by build/anatomy/build-three.sh */" \
  --outfile="$SITE/assets/vendor/three/three-anatomy.min.js"
cp node_modules/three/LICENSE "$SITE/assets/vendor/three/LICENSE-three.txt"
