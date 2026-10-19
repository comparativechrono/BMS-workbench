"""The Anatomy tab (the human body in 3D, from Z-Anatomy): the models load and are drawn, the instructions' buttons and
the steps of the chapter "Anatomy in 3D" (selecting by clicking on the body, find tasks, isolating, fading, sections,
labels, pictures), the specs of go() and find(), a model that cannot be loaded, a browser without WebGL, and a phone.
Run:  python3 test/t_anatomy.py   (screenshots in test/out/anatomy-*.png)"""
import json, os, time
from h import Page, check, done, SITE

idx = json.load(open(os.path.join(SITE, 'anatomy', 'index.json'), encoding='utf-8'))
check(len(idx['structures']) > 2000 and len(idx['files']) == 12, f"the index lists {len(idx['structures'])} structures in {len(idx['files'])} models")
check(all(os.path.exists(os.path.join(SITE, 'anatomy', f['file'])) for f in idx['files']), 'every model file of the index is there')
sizes = [os.path.getsize(os.path.join(SITE, 'anatomy', f['file'])) for f in idx['files']]
check(max(sizes) < 25e6 and sum(sizes) < 80e6, f'the models are small enough ({sum(sizes) / 1e6:.1f} MB in all, the largest {max(sizes) / 1e6:.1f} MB)')
bad = [s['id'] for s in idx['structures'] if s['base'] in ('Cochlea', 'Vestibule', 'Renal pelvis') or any(k in s['base'].lower() for k in ('semicircular', 'intrarenal', 'white matter of telencephalon'))]
check(not bad, f'nothing from the models that may not be shared freely (the inner ear, the inside of the kidney, the white matter): {bad[:5]}')

p = Page(width=1500, height=950)
p.open()
A = 'MG.app.anatomy'
ticked = lambda tid: bool(p.js(f"() => !!MG.tutorial.state.tasks['{tid}']"))


def wait_ticked(tid, s=20):
    for _ in range(int(s * 4)):
        if ticked(tid):
            return True
        time.sleep(0.25)
    return False


def click(sel):
    p.p.locator(sel).first.click()


def idle():
    """the models asked for are loaded, the camera has stopped, and the view has been drawn"""
    p.wait(f"() => {A} && {A}.index && !Object.values({A}.files).some(f => f.state === 'loading') && !{A}._camAnim && !{A}._raf", timeout=120000)
    time.sleep(0.3)


def click_on(sid, touch=False):
    pt = p.js(f"(id) => {A}.testPoint(id)", sid)
    if not pt:
        return False
    if touch:
        p.p.touchscreen.tap(pt['x'], pt['y'])
    else:
        p.p.mouse.click(pt['x'], pt['y'])
    time.sleep(0.5)
    return True


# ---------------------------------------------------------------- the chapter opens the tab, and the body is drawn
p.js("() => MG.app.showChapter('anatomy', true)")
p.wait(f"() => MG.app.currentBench === 'anatomy' && {A} && {A}.index && {A}.drawn > 0", timeout=120000)
idle()
st = p.js(f"() => ({{ on: {A}._onList(), shown: {A}.nShown, ready: Object.values({A}.files).filter(f => f.state === 'ready').map(f => f.id) }})")
check(st['shown'] > 100 and 'skeleton' in st['ready'], f"the chapter opens the Anatomy tab and the body is drawn ({st['shown']} structures; models {st['ready']})")
px = p.js(f"""() => {{ const c = {A}.renderer.domElement, g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  {A}._draw(); const x = g.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, g.width, g.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (Math.abs(d[i] - 238) + Math.abs(d[i + 1] - 241) + Math.abs(d[i + 2] - 244) > 30) n++; return n / (d.length / 4 / 97); }}""")
check(px > 0.05, f'the models are drawn on the canvas ({px:.0%} of the view is not background)')
p.shot('anatomy-default')

# ---------------------------------------------------------------- the endocrine glands
click('#anatomy button[data-anat="endocrine"]')
idle()
check(wait_ticked('an-open'), 'the show-me button shows the endocrine glands and ticks an-open')
on = p.js(f"() => {A}.on")
check(on.get('endocrine') == 1 and on.get('skeleton') == 'fade' and len(on) == 2, f'the endocrine glands are shown with the skeleton faint: {on}')
p.p.locator('.an-view').focus()
p.p.keyboard.press('3')
idle()
check(wait_ticked('an-turn'), 'the key 3 gives the left view and ticks an-turn')
d = p.js(f"() => {A}._viewDir()")
check(d[0] > 0.95, f'the left view looks at the body from its left ({[round(x, 2) for x in d]})')
p.p.keyboard.press('1')
idle()
ok = click_on('thyroid-gland')
check(ok and wait_ticked('an-select'), 'clicking on the thyroid gland selects it and ticks an-select')
if p.js(f"() => {A}.info.hidden"):
    chip = p.js(f"() => {A}.chip.hidden ? '' : {A}.chip.innerText")
    check('Thyroid gland' in chip, f'its name shows below the body ({chip!r}); a click on it opens the panel')
    p.p.locator('.an-chip').click()
    time.sleep(0.4)
info = p.js(f"() => {A}.infoBody.innerText")
check('Thyroid gland' in info and 'Glandula thyreoidea' in info, f'the panel names it, in English and Latin: {info[:80]!r}')
p.wait(f"() => /Wikipedia/.test({A}.infoBody.innerText)", timeout=20000)
check('endocrine gland' in p.js(f"() => {A}.infoBody.innerText"), 'and gives the start of its Wikipedia article, with the link')
p.shot('anatomy-thyroid')

click('#anatomy button[data-anat-find="suprarenal-gland"]')
idle()
ban = p.js(f"() => {A}.banner.hidden ? '' : {A}.banner.innerText")
check('suprarenal gland' in ban, f'"Find a suprarenal gland" asks for it: {ban!r}')
click_on('thyroid-gland')
ban = p.js(f"() => {A}.banner.innerText")
check('thyroid gland' in ban and 'not' in ban and not ticked('an-find'), f'a click on something else says what it is: {ban!r}')
p.p.locator('.an-banner button', has_text='Show me').click()
idle()
check(p.js(f"() => ({A}.hint || []).length") == 2, 'Show me makes both suprarenal glands glow')
p.shot('anatomy-find')
ok = click_on('suprarenal-gland-left')
check(ok and wait_ticked('an-find'), 'a click on a suprarenal gland is right and ticks an-find')
check('Yes' in p.js(f"() => {A}.banner.innerText"), 'and says so')

click('#anatomy button[data-anat="endocrine:adenohypophysis"]')
idle()
check(wait_ticked('an-pit') and p.js(f"() => {A}.sel[0]") == 'adenohypophysis', 'the pituitary button selects the adenohypophysis and ticks an-pit')

# ---------------------------------------------------------------- the heart
click('#anatomy button[data-anat="heart"]')
idle()
check(wait_ticked('an-heart'), 'the heart button shows the heart and ticks an-heart')
p.js(f"() => {A}.pick('left-ventricle')")
idle()
p.p.locator('.an-view').focus()
p.p.keyboard.press('i')
idle()
check(wait_ticked('an-iso') and p.js(f"() => {A}.nShown") == 1, 'I isolates the left ventricle (only it is shown) and ticks an-iso')
p.shot('anatomy-isolated')
p.p.locator('.an-acts button', has_text='Show the others').click()
idle()
check(p.js(f"() => {A}.nShown") > 50, 'Show the others shows them again')
click('#anatomy button[data-anat-find="pulmonary-trunk"]')
idle()
ok = click_on('pulmonary-trunk')
check(ok and wait_ticked('an-find-pt'), 'clicking on the pulmonary trunk ticks an-find-pt')
# the list: search for the aortic arch, pick it, fade the others
p.js(f"() => {A}.togglePanel(true)")
p.p.locator('.an-search').fill('aortic arch')
time.sleep(0.4)
p.p.locator('.an-row-n', has_text='Aortic arch').first.click()
idle()
check(p.js(f"() => {A}.sel[0]") == 'aortic-arch', 'the search finds the aortic arch, and a click selects it')
p.p.locator('.an-acts button', has_text='Fade the others').click()
idle()
check(wait_ticked('an-fade'), 'Fade the others ticks an-fade')
faded = p.js(f"() => Object.values({A}.S).filter(s => s.mesh && s.mesh.visible && s.mesh.material.transparent).length")
check(faded > 50, f'and the others are faint ({faded})')
p.shot('anatomy-heart')
p.p.locator('.an-search').fill('')

# ---------------------------------------------------------------- sections
click('#anatomy button[data-anat="digestive+urinary+skeleton+section:transverse@0.63@superior"]')
idle()
check(wait_ticked('an-cut'), 'the section button cuts through the abdomen and ticks an-cut')
sec = p.js(f"() => ({{ s: {A}.section, n: {A}.plane.normal.toArray(), c: {A}.plane.constant, bar: !{A}.secBar.hidden, dir: {A}._viewDir() }})")
check(sec['s']['axis'] == 'transverse' and sec['n'][1] < -0.99 and 0.9 < sec['c'] < 1.3 and sec['bar'] and sec['dir'][1] > 0.95,
      f"a transverse section at the level of the kidneys (y = {sec['c']:.2f} m), seen from above, with its bar")
kid = p.js(f"() => ['kidney-left', 'kidney-right'].map(id => {A}._isOnScreen(id))")
check(all(kid), 'the kidneys are in the view of the section')
p.shot('anatomy-section')
p.js(f"() => {{ const r = {A}.secRange; r.value = '400'; r.dispatchEvent(new Event('input')); }}")
check(wait_ticked('an-slide'), 'moving the slider down ticks an-slide')
click('#anatomy button[data-anat="heart+respiratory+digestive+urinary+skeleton+section:sagittal@0.5@left"]')
idle()
check(wait_ticked('an-sag') and p.js(f"() => {A}.section.axis") == 'sagittal', 'the sagittal section ticks an-sag')
p.shot('anatomy-sagittal')

# ---------------------------------------------------------------- labels and pictures
click('#anatomy button[data-anat="endocrine+labels"]')
idle()
check(wait_ticked('an-labels'), 'the labels button ticks an-labels')
check(p.js(f"() => {A}.section") is None, 'showing new systems ends the section')
labs = p.js(f"() => [...{A}.svg.querySelectorAll('.an-lab text')].map(t => t.textContent)")
check(len(labs) >= 8 and 'Thyroid gland' in labs, f'the glands are labelled ({len(labs)}: {labs[:4]}…)')
p.shot('anatomy-labels')
p.p.locator('.an-bar button[title^="Take a picture"]').click()
check(wait_ticked('an-picture'), 'the camera button keeps a picture and ticks an-picture')
pic = p.js("() => Array.from(MG.app.fs.entries.keys()).find(k => k.includes('/anatomy/') && k.endsWith('.png'))")
size = p.js("(k) => MG.app.fs.get(k).size || (MG.app.fs.get(k).blob && MG.app.fs.get(k).blob.size) || 0", pic) if pic else 0
check(bool(pic) and size > 20000, f'the picture is in Files ({pic}, {size} bytes)')
p.js(f"() => MG.app.editFile('{pic}')")
check(wait_ticked('an-files'), 'viewing the picture in Files ticks an-files')
p.js("() => MG.app.showWorkbench('anatomy')")
idle()

# ---------------------------------------------------------------- the specs
p.js(f"() => {A}.go('kidney')")
idle()
check(sorted(p.js(f"() => {A}.sel")) == ['kidney-left', 'kidney-right'], "go('kidney') selects both kidneys")
p.js(f"() => {A}.go('heart@posterior')")
idle()
d = p.js(f"() => {A}._viewDir()")
check(d[2] < -0.95 and p.js(f"() => {A}._onList()") == ['skeleton', 'heart'], f"go('heart@posterior') shows the heart from behind ({[round(x, 2) for x in d]})")
p.js(f"() => {A}.go('section:coronal@0.5')")
idle()
check(p.js(f"() => {A}.section.axis") == 'coronal' and p.js(f"() => {A}._onList()") == ['skeleton', 'heart'], "go('section:coronal@0.5') cuts without changing what is shown")
p.js(f"() => {A}.go('section:off')")
idle()
check(p.js(f"() => {A}.section") is None, "go('section:off') ends it")
p.js(f"() => {A}.find('kidney-right')")
idle()
check(p.js(f"() => {A}.on.urinary") == 1 and 'kidney' in p.js(f"() => {A}.banner.innerText"), "find() shows the system of a structure that is hidden")
click_on('kidney-left')
check('other side' in p.js(f"() => {A}.banner.innerText"), 'clicking the kidney of the other side says that the other side is asked for')
p.js(f"() => {A}.cancelFind()")
check(p.js(f"() => {A}.go('no-such-thing').then(() => 1)") == 1, 'an unknown name only warns')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))

# ---------------------------------------------------------------- a model that cannot be loaded
p.p.route('**/anatomy/lymphoid.glb', lambda r: r.fulfill(status=404, body='not found'))
p.js(f"() => {A}.go('lymphoid')")
p.wait(f"() => {A}.files.lymphoid.state === 'failed'", timeout=30000)
time.sleep(0.5)
row = p.js(f"() => document.querySelector('.an-sys[data-sys=lymphoid]').innerText")
check('not loaded' in row and 'Try again' in row, f'a model that cannot be loaded says so, with Try again: {row!r}')
p.p.unroute('**/anatomy/lymphoid.glb')
p.p.locator('.an-sys[data-sys=lymphoid] .linkbtn').click()
p.wait(f"() => {A}.files.lymphoid.state === 'ready'", timeout=60000)
check(True, 'and Try again loads it')
p.close()

# ---------------------------------------------------------------- no WebGL
p = Page(width=1200, height=800)
p.p.add_init_script("""(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? null : g.call(this, t, o); }; })();""")
p.open()
p.js("() => MG.app.showWorkbench('anatomy')")
p.wait("() => !!document.querySelector('.an-fail')", timeout=60000)
msg = p.js("() => document.querySelector('.an-fail').innerText")
check('WebGL' in msg, f'without WebGL, the tab explains what to do: {msg[:70]!r}')
r = p.js("() => MG.app.anatomy.go('heart').then(() => 'ok')")
check(r == 'ok' and not p.errors, 'and the buttons of the instructions do nothing harmful: ' + '; '.join(p.errors[:2]))
p.close()

# ---------------------------------------------------------------- beside the instructions, and on a phone
p = Page(width=1100, height=760)
p.open()
p.js("() => MG.app.showWorkbench('anatomy')")
p.wait(f"() => {A} && {A}.drawn > 0", timeout=120000)
idle()
w = p.js(f"() => ({{ root: {A}.root.clientWidth, sw: {A}.root.scrollWidth, bar: {A}.bar.scrollWidth <= {A}.bar.clientWidth + 1, view: {A}.view.clientWidth }})")
check(w['sw'] <= w['root'] + 1 and w['bar'] and w['view'] > 250, f'beside the instructions the tab fits ({w})')
p.shot('anatomy-narrow')
p.close()

p = Page(width=390, height=844, mobile=True)
p.open()
p.p.locator('.bench-fab').click()
time.sleep(0.5)
p.p.locator('.wb-tab[data-wb="anatomy"]').tap()
p.wait(f"() => {A} && {A}.drawn > 0", timeout=120000)
idle()
lay = p.js(f"""() => ({{ W: innerWidth, doc: document.documentElement.scrollWidth, root: {A}.root.scrollWidth, panel: {A}.panel.hidden, info: {A}.info.hidden,
  view: {A}.view.getBoundingClientRect().height, bar: {A}.bar.getBoundingClientRect().height }})""")
check(lay['doc'] <= lay['W'] + 1 and lay['root'] <= lay['W'] + 1, f'on a phone nothing is wider than the screen ({lay})')
check(lay['panel'] and lay['info'] and lay['view'] > 450, 'on a phone the list and the panel start closed, and the view has the room')
p.shot('anatomy-phone')
p.js(f"() => {A}.go('endocrine')")
idle()
ok = click_on('thyroid-gland', touch=True)
chip = p.js(f"() => {A}.chip.hidden ? '' : {A}.chip.innerText")
check(ok and 'Thyroid gland' in chip, f'a tap selects the thyroid gland, and its name shows at the bottom ({chip!r})')
p.p.locator('.an-chip').tap()
time.sleep(0.5)
check(not p.js(f"() => {A}.info.hidden") and 'Glandula' in p.js(f"() => {A}.infoBody.innerText"), 'tapping its name opens the panel about it')
p.shot('anatomy-phone-info')
p.p.locator('.an-bar .an-ib[title="Systems and structures"]').tap()
time.sleep(0.4)
pw = p.js(f"() => {{ const r = {A}.panel.getBoundingClientRect(); return [r.left, r.right, innerWidth]; }}")
check(not p.js(f"() => {A}.panel.hidden") and pw[1] <= pw[2] + 1, f'the list opens as a drawer over the view ({pw})')
p.shot('anatomy-phone-list')
check(not p.errors, 'no page errors on the phone: ' + '; '.join(p.errors[:3]))
p.close()
done()
