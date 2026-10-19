"""The 3D viewer: the library of the BMS workbench (bundled proteins and small molecules), a PDB entry by command, a
structure file from Files."""
import time
from h import Page, check, done
p = Page()
p.open()
p.js("() => MG.app.showWorkbench('viewer')")
p.wait("() => MG.app.vui && MG.app.viewer && MG.app.viewer.loadPDB", timeout=60000)
check(p.js("() => !!document.querySelector('#viewerRoot .v-load .btn span') && document.querySelector('#viewerRoot .v-load').textContent.includes('Library')"), 'the viewer has a Library button')
p.js("() => MG.app.molLibrary.open()")
time.sleep(0.5)
n = p.js("() => document.querySelectorAll('.lib-item').length")
check(n >= 30, f'the library lists the molecules ({n})')
reqs = []
p.p.on('request', lambda r: reqs.append(r.url))
p.js("() => document.querySelector('.lib-item[data-id=\"4HHB\"]').click()")
p.wait("() => MG.app.viewer.structures.length === 1", timeout=60000)
check(any('molecules/4HHB.bcif' in u for u in reqs) and not any('rcsb.org' in u for u in reqs), 'haemoglobin opens from the bundled copy, not from the PDB')
p.js("() => MG.app.vui.run('molecule cortisol; color element')")
p.wait("() => MG.app.viewer.structures.length === 2", timeout=30000)
check(p.js("() => MG.app.viewer.structures[1].name") == 'Cortisol', 'the cortisol molecule opens with the molecule command')
time.sleep(1)
p.shot('viewer-library')
# a structure file from Files
p.js("""async () => { const r = await fetch('molecules/HCY.sdf'); MG.app.fs.mkdirp('/home/user/structures'); MG.app.fs.writeText('/home/user/structures/cortisol.sdf', await r.text()); }""")
p.js("() => MG.app.openFile('/home/user/structures/cortisol.sdf')")
p.wait("() => MG.app.viewer.structures.length === 3", timeout=30000)
check(True, 'a .sdf file in Files opens in the 3D viewer')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()
done()
