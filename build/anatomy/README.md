# The Anatomy tab's models

The Anatomy tab (`assets/js/anatomy.js`) shows the human body in 3D. Its models, in `anatomy/`, are converted from
**Z-Anatomy** (https://www.z-anatomy.com/, https://github.com/Z-Anatomy/Models-of-human-anatomy), the libre 3D atlas
of anatomy by Gauthier Kervyn and others, which is shared under the **Creative Commons Attribution-ShareAlike 4.0**
licence (CC BY-SA 4.0). Most of Z-Anatomy's models are made from **BodyParts3D**, © The Database Center for Life
Science, licensed under CC BY-SA 2.1 Japan (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/). The converted models
are shared under CC BY-SA 4.0 too.

| File | What it is |
| --- | --- |
| `anatomy/<part>.glb` | One glTF binary for each part of the body (skeleton, muscles, heart, vessels, respiratory, digestive, urinary, reproductive, endocrine, brain, nerves, lymphoid): one node per structure, named by its id, compressed with meshopt (`EXT_meshopt_compression`, `KHR_mesh_quantization`). A part is downloaded only when it is first shown. |
| `anatomy/index.json` | The files, the systems of the tab's list (a system can borrow structures from another file: the endocrine glands list the pancreas and the testes), and every structure: its id, English name and side, Latin name and TA2 number (from Z-Anatomy's `TA2.csv`), systems, group and path in Z-Anatomy's tree, colour, bounding box and a point on it for its label |
| `anatomy/definitions.json` | A short definition of each structure: the opening sentences of the Wikipedia article (CC BY-SA) that Z-Anatomy keeps for it, with its link |
| `anatomy/LICENSE.md` | The licence and the credits |

The coordinates are in metres, with Y up and the body facing +Z; the body's left is +X.

## How they are made

| Script | What it does |
| --- | --- |
| `build.sh` | Runs the three steps below |
| `export.py` | (Blender 4.2) Appends every object of `Startup.blend` without putting it in the scene, chooses the structures (`config.json`), and for each in turn: puts it in the scene, evaluates it with its modifiers (mirror, solidify, subdivision at a lower level, the tubes of curves with fewer sides), simplifies it with a Decimate modifier to the budget of its file, and writes one `.glb` per file and a list of the structures |
| `config.json` | Which structures go into which file (by Z-Anatomy's group labels, the `.g` objects that are their parents), what is left out and why, how much each file is simplified, and the colours |
| `make_index.py` | Writes `index.json` and `definitions.json` |
| `three-entry.js`, `build-three.sh` | Bundle the parts of three.js (0.186.1, MIT) that the tab uses into `assets/vendor/three/three-anatomy.min.js` |
| `list_blend.py`, `inventory.py`, `probe.py` | Look into the blend file in little memory (the names of its datablocks; every object and collection with its parent, modifiers, materials and size; one collection in detail): what was used to choose the structures |

```bash
# in a scratch folder WORK: Startup.blend (from Z-Anatomy.zip), TA2.csv, Blender 4.2 LTS for Linux, and
#   (cd WORK/npm && npm install @gltf-transform/cli@4.5.1)
sh build/anatomy/build.sh WORK
```

Opening `Startup.blend` in Blender evaluates every object of the scene (subdivision surfaces, the tubes of the curves,
thousands of text labels) and needs more than 6 GB of memory; `export.py` appends the objects instead, and evaluates
them one at a time, in under 1 GB. The whole conversion takes about three minutes. The 12 files hold 2216 structures
and 1.28 million triangles, 9 MB in all (the largest, the muscles, 1.8 MB).

## What is left out, and why

Z-Anatomy's licence file names the sources of its models besides BodyParts3D:

- **"Anatomy of the Inner Ear"**, University of Dundee School of Medicine, **CC BY-NC-SA 4.0**, and a **kidney by Lissie
  Cowley, CC BY-NC 4.0**: these do not allow commercial use, so they cannot be shared on the workbench's terms. The
  whole ear is left out (`Ear.g`), and so are the renal pelvis and the intrarenal vessels, which BodyParts3D does not
  have and which may come from that kidney. The kidneys themselves are BodyParts3D's (its left and right kidneys).
- **"Brainder"** (Brain for Blender, by Anderson M. Winkler, https://brainder.org/research/brain-for-blender/, **CC BY-SA
  3.0**): the cortex of the brain, divided into the gyri and sulci of the Destrieux atlas. Kept, with credit.
- **"White matter" from the University of Washington**, with no licence given: the white matter of the cerebral
  hemispheres and its fibre bundles (corpus callosum, commissures, fornix, stria terminalis) are left out.
- **"Cranial Nerves and Foramina"**, University of Dundee, CAHID, **CC BY 4.0**: the cranial nerves. Kept, with credit.

Also left out, to keep the models small and clear: the teeth, the joints, the fasciae, the meninges, the pleura and
the peritoneum, the bursae and tendon sheaths, the hair, the regions of the body, the segments of the liver (which
overlap the liver), Z-Anatomy's labels and the places where muscles attach. BodyParts3D was made from one man's body,
so there are no female reproductive organs.

## The definitions

Z-Anatomy keeps, for each structure, the text of its Wikipedia article (CC BY-SA, with its link at the end).
`make_index.py` keeps the opening sentences (about 300 characters), and the tab shows them with a link to the article
and the credit "From Wikipedia (CC BY-SA), as kept by Z-Anatomy".
