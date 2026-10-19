"""The Microscope tab: slides open and draw, objectives, measuring, counting, labels, pictures, the eyepiece, finding
structures, pictures from Files, and the CSV files that R reads."""
import sys, time, json, math
from h import Page, check, done

p = Page()
p.open()
p.js("() => MG.app.showWorkbench('scope')")
p.wait("() => MG.app.scope && MG.app.scope.catalogue && MG.app.scope.catalogue.slides.length > 0", timeout=30000)
n = p.js("() => MG.app.scope.catalogue.slides.length")
check(n >= 25, f'the slide box lists the slides ({n})')
ev = p.js("""() => { window._ev = []; MG.bus.on('*', (d, t) => { if (/^(scope|file):/.test(t)) window._ev.push([t, d]); }); return true; }""")

def events(t):
    return [d for (k, d) in p.js("() => window._ev") if k == t]

def view_box():
    return p.js("() => { const r = MG.app.scope.view.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }")

def wait_tiles(timeout=30):
    for _ in range(timeout * 4):
        if p.js("() => { const ti = MG.app.scope._ti(); return !!ti && ti.getFullyLoaded(); }"):
            return True
        time.sleep(0.25)
    return False

# open a slide at a place and an objective
p.js("() => MG.app.scope.go('kidney-cortex@1.5,2.0,10x')")
check(wait_tiles(), 'the kidney slide draws completely at 10x')
mag = p.js("() => MG.app.scope.mag()")
check(abs(mag - 10) < 0.05, f'the 10x objective gives 10x ({mag:.3f})')
c = p.js("""() => { const S = MG.app.scope, ti = S._ti(), c = ti.viewportToImageCoordinates(S.viewer.viewport.getCenter(true)); return {x: c.x * S.slide.mpp / 1000, y: c.y * S.slide.mpp / 1000}; }""")
check(abs(c['x'] - 1.5) < 0.02 and abs(c['y'] - 2.0) < 0.02, f"go() centres the view on 1.5, 2.0 mm ({c['x']:.3f}, {c['y']:.3f})")
check(any(e['slide'] == 'kidney-cortex' for e in events('scope:open')), 'scope:open fired')
scale = p.js("() => MG.app.scope.scaleBar.querySelector('span').textContent")
bar = p.js("() => parseFloat(MG.app.scope.scaleBar.querySelector('i').style.width)")
check(scale.endswith('µm') and abs(float(scale.split()[0]) / bar - 1.0) < 0.02, f'the scale bar is right at 10x ({scale} over {bar} px)')

# objectives by button and key
p.js("() => document.querySelector('.ms-obj[data-mag=\"40\"]').click()")
time.sleep(1.2)
check(abs(p.js("() => MG.app.scope.mag()") - 40) < 0.5, '40x objective button')
p.js("() => MG.app.scope.view.focus()")
p.p.keyboard.press('4')
time.sleep(1.2)
check(abs(p.js("() => MG.app.scope.mag()") - 10) < 0.3, 'key 4 chooses the 10x objective')
check(any(e['mag'] == 10 for e in events('scope:mag')), 'scope:mag fired with 10')
# OpenSeadragon's own keys are off: r would turn the slide, f mirror it, w a s d move it
p.js("() => MG.app.scope.view.focus()")
c0 = p.js("() => { const c = MG.app.scope.viewer.viewport.getCenter(true); return [c.x, c.y]; }")
for k in ['r', 'f', 'w', 'd']:
    p.p.keyboard.press(k)
time.sleep(0.8)
vp = p.js("() => { const v = MG.app.scope.viewer.viewport, c = v.getCenter(true); return [v.getRotation(), v.getFlip(), c.x, c.y]; }")
check(vp[0] == 0 and vp[1] is False and abs(vp[2] - c0[0]) < 1e-6 and abs(vp[3] - c0[1]) < 1e-6, f'the keys r, f, w and d do nothing to the slide: {vp}')
# the teaching labels are hidden at first
check(p.js("() => MG.app.scope.st.showLabels") is False and not p.js("() => MG.app.scope.svg.querySelector('.ms-tlabel')"), 'the slide’s labels are hidden at first')
# the side panel shows all four of its tabs
for w in [1366, 1920]:
    p.p.set_viewport_size({'width': w, 'height': 900})
    time.sleep(0.5)
    p.js("() => MG.app.scope.showSide('about')")
    time.sleep(0.3)
    t = p.js("""() => { const T = document.querySelector('.ms-side-tabs'), L = MG.app.scope.sideTabs.labels.getBoundingClientRect(), R = T.getBoundingClientRect();
        return [T.scrollWidth <= T.clientWidth + 1, L.right <= R.right + 1]; }""")
    check(all(t), f'at {w} px the side panel’s four tabs are all in sight: {t}')
p.p.set_viewport_size({'width': 1500, 'height': 950})
time.sleep(0.5)
# choosing a tool does not change the height of the toolbar (its name used to appear, and the bar to wrap)
h0 = p.js("() => document.querySelector('.ms-bar').getBoundingClientRect().height")
p.js("() => MG.app.scope.tool('measure')")
time.sleep(0.2)
h1 = p.js("() => document.querySelector('.ms-bar').getBoundingClientRect().height")
p.js("() => MG.app.scope.tool('pan')")
check(h0 == h1, f'choosing a tool does not change the height of the toolbar ({h0} → {h1})')
# tiles that cannot be loaded: a notice stays until they load, with a button to try again
p.js("() => MG.app.scope._tileFailed()")
check(p.js("() => !MG.app.scope.netNote.hidden"), 'a tile that fails to load puts up a notice')
p.js("() => [...MG.app.scope.netNote.querySelectorAll('button')].find(b => b.textContent === 'Try again').click()")
check(p.js("() => MG.app.scope.netNote.hidden"), 'Try again takes the notice down (and loads the tiles again)')

# measure a length by dragging: at 10x one screen pixel is 1 µm
p.js("() => MG.app.scope.tool('measure')")
vb = view_box()
x0, y0 = vb['x'] + vb['w'] * 0.3, vb['y'] + vb['h'] * 0.5
p.p.mouse.move(x0, y0)
p.p.mouse.down()
for k in range(1, 11):
    p.p.mouse.move(x0 + 20 * k, y0, steps=1)
p.p.mouse.up()
time.sleep(0.5)
ms = p.js("() => MG.app.scope.st.measures.filter(m => m.slide === 'kidney-cortex')")
check(len(ms) == 1 and abs(ms[0]['value'] - 200) < 3, f"a 200-pixel drag at 10x measures 200 µm ({ms[0]['value'] if ms else None})")
check(events('scope:measure') and events('scope:measure')[-1]['unit'] == 'µm', 'scope:measure fired in µm')
# a second measurement by two clicks
p.p.mouse.click(x0, y0 + 60)
p.p.mouse.move(x0 + 50, y0 + 60, steps=5)
p.p.mouse.move(x0 + 100, y0 + 60, steps=5)
p.p.mouse.click(x0 + 100, y0 + 60)
time.sleep(0.5)
ms = p.js("() => MG.app.scope.st.measures.filter(m => m.slide === 'kidney-cortex')")
check(len(ms) == 2 and abs(ms[1]['value'] - 100) < 3, f"click, click measures 100 µm ({ms[-1]['value'] if ms else None})")
time.sleep(1)
csv = p.js("() => MG.app.fs.get('/home/user/microscope/measurements.csv') ? MG.app.fs.get('/home/user/microscope/measurements.csv').text : ''")
check(csv.startswith('slide,kind,label,value,unit') and csv.count('\n') == 3 and 'kidney-cortex,length' in csv, 'measurements.csv has a header and the two lengths')
# an area: a square of 100 x 100 screen pixels = 10,000 µm²
p.js("() => MG.app.scope.tool('area')")
pts = [(x0, y0 + 120), (x0 + 100, y0 + 120), (x0 + 100, y0 + 220), (x0, y0 + 220)]
for (x, y) in pts:
    p.p.mouse.click(x, y)
    time.sleep(0.15)
p.p.mouse.click(*pts[0])
time.sleep(0.5)
ar = p.js("() => MG.app.scope.st.measures.filter(m => m.kind === 'area')")
check(len(ar) == 1 and abs(ar[0]['value'] - 10000) < 300, f"a 100 x 100 px square at 10x has an area of 10,000 µm² ({ar[0]['value'] if ar else None})")

# counting
p.js("() => MG.app.scope.tool('count')")
for k in range(3):
    p.p.mouse.click(x0 + 40 * k, y0 - 80)
    time.sleep(0.15)
cn = p.js("() => MG.app.scope.st.counts.filter(c => c.slide === 'kidney-cortex').length")
check(cn == 3, f'three clicks count three ({cn})')
p.p.mouse.click(x0 + 40, y0 - 80)
time.sleep(0.3)
cn = p.js("() => MG.app.scope.st.counts.filter(c => c.slide === 'kidney-cortex').length")
check(cn == 2, f'a click on a mark removes it ({cn})')
check(events('scope:count') and events('scope:count')[-1]['total'] == 3, 'scope:count fired')
time.sleep(1)
check(p.js("() => MG.app.fs.exists('/home/user/microscope/counts.csv')"), 'counts.csv written')

# a picture
path = p.js("() => MG.app.scope.capture()")
check(path and path.endswith('.png') and p.js(f"() => MG.app.fs.exists('{path}')"), f'a picture saved in Files ({path})')
sz = p.js(f"() => MG.app.fs.size(MG.app.fs.get('{path}'))")
check(sz > 20000, f'the picture is not empty ({sz} bytes)')
check(events('scope:capture'), 'scope:capture fired')

# the eyepiece: objectives click from one to the next
p.js("() => MG.app.scope.setEyepiece(true)")
time.sleep(1)
check(p.js("() => !MG.app.scope.eye.hidden && MG.app.scope.grat.innerHTML.includes('path')"), 'the eyepiece and its graticule are drawn')
check(p.js("() => MG.app.scope.eyeNote.hidden"), 'in a large view the whole graticule fits the field: no note')
vb = view_box()
p.js("() => MG.app.scope.tool('pan')")
p.p.mouse.move(vb['x'] + vb['w'] / 2, vb['y'] + vb['h'] / 2)
p.p.mouse.wheel(0, -200)
time.sleep(1.2)
m = p.js("() => MG.app.scope.mag()")
check(abs(m - 20) < 0.5, f'in the eyepiece view the wheel moves to the next objective (20x: {m:.2f})')
p.shot('scope-eyepiece')
# a picture in the eyepiece view has the graticule on it
pe = p.js("() => MG.app.scope.capture()")
check(bool(pe), 'a picture is taken in the eyepiece view')
# a wide view that is not tall (a phone on its side): the field is as wide as the graticule, cut off at the top and bottom
p.p.set_viewport_size({'width': 1500, 'height': 420})
time.sleep(0.8)
eh = p.js("() => [MG.app.scope.view.clientHeight, MG.app.scope._eyeR(), MG.app.scope.eyeNote.hidden]")
check(eh[1] * 2 >= 406 and eh[2], f'in a view {eh[0]} px tall the field is still as wide as the graticule (radius {eh[1]}), and there is no note')
p.p.set_viewport_size({'width': 1500, 'height': 950})
time.sleep(0.6)
p.js("() => MG.app.scope.setEyepiece(false)")

# a picture from Files as a slide, with a scale
p.js(f"() => MG.app.scope.openImage('{path}')")
time.sleep(1.5)
check(p.js("() => MG.app.scope.current()") == 'file:' + path, 'a picture opens as a slide')
ro = p.js("() => MG.app.scope.readout.textContent")
check('(no scale)' not in ro and p.js(f"() => MG.app.scope.st.scales['{path}'] > 0"), f'a picture taken with the microscope keeps its scale: {ro}')
# a picture of one's own has no scale at first
own = p.js("""async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#d9a3c4'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#5a2a6a'; g.beginPath(); g.arc(200, 150, 60, 0, 7); g.fill();
    const b = await new Promise((r) => c.toBlob(r, 'image/png')); return MG.app.saveToFiles('my-own.png', b, { folder: '~/microscope/pictures', ask: false, quiet: true }); }""")
p.js(f"() => MG.app.scope.openImage('{own}')")
time.sleep(1.5)
check('(no scale)' in p.js("() => MG.app.scope.readout.textContent"), 'a picture of my own has no scale at first')
# a small picture cannot be shown at 1×: the microscope says so
p.js("() => document.querySelector('.ms-obj[data-mag=\"1\"]').click()")
time.sleep(0.4)
check(p.js("() => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('too small to see at 1×'))"), 'an objective that a small picture cannot be shown at gives a message')
p.js("() => { MG.app.scope.slide.mpp = 0.5; MG.app.scope._redraw(); }")
check('(no scale)' not in p.js("() => MG.app.scope.readout.textContent"), 'with a scale the readout gives a magnification')

# state is kept across a reload
p.js("() => MG.app.scope.open('pancreas')")
time.sleep(1)
p.p.reload()
p.wait("window.MG_READY === true")
p.js("() => MG.app.showWorkbench('scope')")
p.wait("() => MG.app.scope && MG.app.scope.slide", timeout=30000)
check(p.js("() => MG.app.scope.current()") == 'pancreas', 'the open slide is kept across a reload')
check(p.js("() => MG.app.scope.st.measures.length") == 3, 'the measurements are kept across a reload')

# phone width
p.p.set_viewport_size({'width': 390, 'height': 800})
p.js("() => document.body.classList.add('bench-open')")
time.sleep(1.5)
p.shot('scope-phone')
w = p.js("() => document.querySelector('.ms-bar').scrollWidth <= document.querySelector('.ms-bar').clientWidth + 2")
check(w, 'the toolbar fits a phone')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()
done()
