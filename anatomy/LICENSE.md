# The models of the Anatomy tab

The files in this folder (`*.glb`, `index.json`, `definitions.json`) are adapted from **Z-Anatomy – the libre 3D atlas
of anatomy** (https://www.z-anatomy.com/, by Gauthier Kervyn, Marcin Zieliński, Lluis Vinent and others), which is
licensed under the **Creative Commons Attribution-ShareAlike 4.0 International** licence
(https://creativecommons.org/licenses/by-sa/4.0/). They are shared under the same licence.

Credits, as Z-Anatomy asks, and where each source's material is:

- **BodyParts3D**, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan
  (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/): most of the models, in every file.
- **Z-Anatomy – The libre 3D atlas of anatomy – CC BY-SA 4.0**: the models as Z-Anatomy adapted and completed them, in
  every file, and the names, groups and Latin names of `index.json`.
- **Brain for Blender**, by Anderson M. Winkler (https://brainder.org/research/brain-for-blender/), CC BY-SA 3.0: the
  cerebral cortex (its gyri and sulci) and the deep nuclei, in `brain.glb`.
- **Cranial Nerves and Foramina**, University of Dundee, Centre for Anatomy and Human Identification (CAHID), CC BY 4.0:
  the cranial nerves, in `nerves.glb`.
- **Wikipedia**, CC BY-SA: the definitions (`definitions.json`), each with a link to its article.

Each `.glb` file names its sources in its `asset.copyright` field. `index.json` lists the sources (`sources`) and gives
each structure that comes from Brain for Blender or from Dundee its source (`src`), so that the tab credits the sources
of what is shown under each picture it saves and in its About panel.

The models were simplified and converted for the BMS workbench by `build/anatomy` (see its README). The parts of
Z-Anatomy whose licences do not allow sharing on these terms are not included: the inner ear (University of Dundee,
CC BY-NC-SA), the inside of the kidney (Lissie Cowley, CC BY-NC) and the white matter of the cerebral hemispheres
(University of Washington, no licence given).
