"""The starter practical: its chapters show, its buttons work, and its steps tick themselves when the student does them
(the chapters on the microscope, measuring and counting, molecules and R; the chapters of the Anatomy, Recorder, Organ
bath and Simulations tabs are worked through by t_anatomy.py, t_recorder.py, t_organbath.py and t_sims.py)."""
import sys, time, json
from h import Page, check, done

p = Page()
p.open()
ticked = lambda tid: bool(p.js(f"() => !!MG.tutorial.state.tasks['{tid}']"))


def chapter(cid):
    p.js(f"() => MG.app.showChapter('{cid}', true)")
    time.sleep(0.4)


def click(sel):
    p.p.locator(sel).first.click()


def wait_tiles(timeout=30):
    for _ in range(timeout * 4):
        if p.js("() => { const S = MG.app.scope; const ti = S && S._ti(); return !!ti && ti.getFullyLoaded(); }"):
            return True
        time.sleep(0.25)
    return False


def answer(qid, text):
    q = p.p.locator(f'.q[data-q="{qid}"]')
    q.locator('textarea, input[type=text]').first.fill(text)
    q.locator('button', has_text='Check').first.click()
    time.sleep(0.2)
    return p.js(f"() => (MG.tutorial.state.answers['{qid}'] || {{}}).correct === true")


def find_click(slide, key):
    """go to the first label of that key and click on it, as a student would"""
    p.js(f"""() => {{ const S = MG.app.scope, L = S.slide.info.labels.find(l => (l.key || l.id) === '{key}'); S._goTo(L, 10); }}""")
    time.sleep(1.5)
    pt = p.js(f"""() => {{ const S = MG.app.scope, L = S.slide.info.labels.find(l => (l.key || l.id) === '{key}');
        const s = S._screen(L.x, L.y), r = S.view.getBoundingClientRect(); return {{x: r.left + s.x, y: r.top + s.y}}; }}""")
    p.p.mouse.click(pt['x'], pt['y'])
    time.sleep(0.4)


# ---------------------------------------------------------------- 0 Start here
chapter('start')
CHAPTERS = ['start', 'microscope', 'measuring', 'anatomy', 'molecules', 'recordings', 'organbath', 'diagrams', 'circuits', 'simulations', 'exam', 'r']
got = p.js("() => [...document.querySelectorAll('.chapter')].map((c) => c.id + ':' + c.dataset.num)")
check(got == [f'{c}:{i}' for i, c in enumerate(CHAPTERS)], f'the practical has its twelve chapters, in the order of the tabs, numbered from 0: {got}')
check(not ticked('s-slide') and not ticked('s-files'), 'Start: no step ticks itself when the page opens on the microscope')
click('#start button[data-bench="scope"]')
p.wait("() => MG.app.scope && MG.app.scope.catalogue.slides.length > 0", timeout=30000)
check(p.js("() => MG.app.currentBench") == 'scope' and not ticked('s-slide'), 'Start: the show-me button opens the Microscope tab (and ticks nothing)')
p.js("() => MG.app.scope.open('lung', {quiet: true})")
time.sleep(1)
check(not ticked('s-slide'), 'a slide opened by the page itself (quietly) ticks nothing')
p.js("() => document.querySelector('.ms-slide[data-id=\"lung\"]').click()")
for _ in range(40):
    if ticked('s-slide'):
        break
    time.sleep(0.25)
check(ticked('s-slide'), 'Start: a click in the slide box ticks s-slide')
click('#start button[data-bench="editor"]')
time.sleep(1)
check(ticked('s-files'), 'Start: the Files tab ticks s-files')

# ---------------------------------------------------------------- 1 The microscope
chapter('microscope')
time.sleep(0.5)
click('#microscope button[data-scope="kidney-cortex"]')
p.wait("() => MG.app.scope && MG.app.scope.current() === 'kidney-cortex'", timeout=30000)
check(ticked('m-open'), 'Microscope: the button opens the kidney and ticks m-open')
p.js("() => MG.app.scope.titleEl.click()")
time.sleep(0.3)
check(ticked('m-about'), 'clicking the slide name shows About and ticks m-about')
p.js("() => document.querySelector('.ms-obj[data-mag=\"10\"]').click()")
time.sleep(1.3)
check(ticked('m-10'), 'the 10x objective ticks m-10')
p.js("() => document.querySelector('.ms-obj[data-mag=\"40\"]').click()")
time.sleep(1.3)
check(ticked('m-40'), 'the 40x objective ticks m-40')
check(p.js("() => document.querySelector('.q[data-q=\"m-q-low\"] .mcq label[data-correct]') !== null"), 'the MCQ has a right answer')

click('#microscope button[data-scope-find="kidney-cortex:glomerulus"]')
time.sleep(0.8)
check(p.js("() => !MG.app.scope.banner.hidden && MG.app.scope.banner.textContent.includes('renal corpuscle')"), 'the find banner asks for a renal corpuscle')
# a wrong click first: a corner of the slide
p.js("() => MG.app.scope.setMag(1, true)")
time.sleep(0.8)
r = p.js("() => { const r = MG.app.scope.view.getBoundingClientRect(); return {x: r.left + 30, y: r.top + 60}; }")
p.p.mouse.click(r['x'], r['y'])
time.sleep(0.3)
check(not ticked('m-glom') and 'isn’t one of the examples' in p.js("() => MG.app.scope.banner.textContent"), 'a wrong click says it isn’t one of the examples marked')
find_click('kidney-cortex', 'glomerulus')
check(ticked('m-glom'), 'a click on a renal corpuscle ticks m-glom')
# a click near (but just outside) a small labelled region still counts: within a few screen pixels
p.js("() => MG.app.scope.find('kidney-cortex', 'glomerulus')")
time.sleep(0.4)
p.js("""() => { const S = MG.app.scope, L = S.slide.info.labels.find(l => l.key === 'glomerulus'); S._goTo(L, 4); }""")
time.sleep(1.5)
pt = p.js("""() => { const S = MG.app.scope, L = S.slide.info.labels.find(l => l.key === 'glomerulus');
    const a = S._screen(L.x, L.y), b = S._screen(L.x + L.r, L.y), r = S.view.getBoundingClientRect();
    return {x: r.left + b.x + 4, y: r.top + a.y}; }""")
p.js("() => { window._fe = []; MG.bus.on('scope:find', d => window._fe.push(d)); }")
p.p.mouse.click(pt['x'], pt['y'])
time.sleep(0.4)
check(p.js("() => window._fe.length && window._fe[window._fe.length - 1].ok === true"), 'a click 4 screen pixels outside a labelled region counts')
p.js("() => MG.app.scope.setShowLabels(false)")
click('#microscope button[data-scope-tool="labels"]')
time.sleep(0.3)
check(ticked('m-labels') and p.js("() => MG.app.scope.st.showLabels"), 'the labels button shows the labels and ticks m-labels')

click('#microscope button[data-scope-tool="label"]')
time.sleep(0.3)
check(p.js("() => MG.app.scope.toolName") == 'label', 'the Label tool is chosen')
# add a label by clicking (a prompt asks for its name)
vb = p.js("() => { const r = MG.app.scope.view.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }")
p.p.mouse.click(vb['x'] + 40, vb['y'] + 40)
time.sleep(0.5)
inp = p.p.locator('input.prompt-input')
if inp.count():
    inp.first.fill('my label')
    inp.first.press('Enter')
time.sleep(0.5)
check(ticked('m-mylabel'), 'a label of my own ticks m-mylabel')
click('#microscope button[data-scope-tool="capture"]')
for _ in range(40):
    if ticked('m-picture'):
        break
    time.sleep(0.25)
check(ticked('m-picture'), 'the camera button takes a picture and ticks m-picture')
pic = p.js("() => Array.from(MG.app.fs.entries.keys()).find(k => k.includes('/microscope/pictures/') && k.endsWith('.png'))")
check(bool(pic), f'the picture is in Files ({pic})')
p.js(f"() => MG.app.editFile('{pic}')")
time.sleep(1)
check(ticked('m-files'), 'viewing the picture in Files ticks m-files')
p.js("() => MG.app.showWorkbench('scope')")
click('#microscope button[data-scope="liver"]')
p.wait("() => MG.app.scope.current() === 'liver'", timeout=30000)
time.sleep(0.5)
check(ticked('m-liver'), 'the liver button ticks m-liver')
click('#microscope button[data-scope-find="liver:central-vein"]')
time.sleep(0.5)
# a click on something else that the slide knows says what it is
find_click('liver', 'portal-tract')
bt = p.js("() => MG.app.scope.banner.textContent")
check(not ticked('m-cv') and 'You clicked on a portal tract, not a central vein' in bt, f'a click on a portal tract, when a central vein is sought, says what it is: {bt[:90]!r}')
find_click('liver', 'central-vein')
check(ticked('m-cv'), 'finding a central vein ticks m-cv')
click('#microscope button[data-scope-find="liver:portal-tract"]')
time.sleep(0.5)
check(p.js("() => MG.app.scope.findTask.labels.length") >= 8, 'the liver has several portal tracts to find')
# Show me: the microscope goes to an example and rings it, and the task goes on – a click on it ticks the step
p.js("() => [...MG.app.scope.banner.querySelectorAll('button')].find(b => b.textContent === 'Show me').click()")
time.sleep(1.8)
check(p.js("() => !!MG.app.scope.findTask && !!MG.app.scope.findTask.shown && !!MG.app.scope.svg.querySelector('.ms-hint')"), 'Show me keeps the task and rings the example in yellow')
check(not ticked('m-pt'), 'Show me alone does not tick m-pt')
pt = p.js("""() => { const S = MG.app.scope, L = S.findTask.shown; const s = S._screen(L.x, L.y), r = S.view.getBoundingClientRect(); return {x: r.left + s.x, y: r.top + s.y}; }""")
p.p.mouse.click(pt['x'], pt['y'])
time.sleep(0.4)
check(ticked('m-pt'), 'a click on the example that Show me rang ticks m-pt')
check(p.js("() => MG.app.scope.banner.hidden || MG.app.scope.banner.classList.contains('ok')"), 'the banner says yes (or has gone)')
# a new slide clears the old banner
p.js("() => MG.app.scope.open('lung')")
time.sleep(1)
check(p.js("() => MG.app.scope.banner.hidden"), 'opening another slide clears the banner')

# ---------------------------------------------------------------- 2 Measuring and counting
chapter('measuring')
click('#measuring button[data-scope="stage-micrometer@0.75,0.304,10x"]')
p.wait("() => MG.app.scope.current() === 'stage-micrometer'", timeout=30000)
wait_tiles()
time.sleep(0.6)
check(ticked('n-sm'), 'the stage micrometer opens and ticks n-sm')
m = p.js("() => MG.app.scope.mag()")
check(abs(m - 10) < 0.1, f'at 10x ({m:.2f})')
click('#measuring button[data-scope-tool="eyepiece:on"]')
time.sleep(0.6)
check(ticked('n-eye') and p.js("() => MG.app.scope.st.eyepiece"), 'the eyepiece button switches it on and ticks n-eye')
click('#measuring button[data-scope-tool="eyepiece:on"]')
time.sleep(0.4)
check(p.js("() => MG.app.scope.st.eyepiece"), 'pressing "eyepiece:on" again leaves it on')
# the calibration really is 4 µm per division at 10x: 100 divisions of the graticule = 400 screen px = 400 µm
gr = p.js("() => { const S = MG.app.scope; const d = S.grat.querySelector('path').getAttribute('d'); const m = /^M([\\d.]+) ([\\d.]+)h([\\d.]+)/.exec(d); return {len: +m[3], umPerPx: 10 / S.mag() }; }")
check(abs(gr['len'] * gr['umPerPx'] / 100 - 4) < 0.05, f"one division of the graticule is 4 µm at 10x ({gr['len'] * gr['umPerPx'] / 100:.3f})")
p.shot('practical-graticule-10x')
check(answer('n-q-10', '4 µm'), 'n-q-10: 4 µm is right')
check(not answer('n-q-10', '10'), 'n-q-10: 10 is wrong')
answer('n-q-10', '4')
p.js("() => document.querySelector('.ms-obj[data-mag=\"40\"]').click()")
time.sleep(1.3)
check(ticked('n-40'), 'the 40x objective ticks n-40')
gr = p.js("() => { const S = MG.app.scope; const d = S.grat.querySelector('path').getAttribute('d'); const m = /^M([\\d.]+) ([\\d.]+)h([\\d.]+)/.exec(d); return {len: +m[3], umPerPx: 10 / S.mag() }; }")
check(abs(gr['len'] * gr['umPerPx'] / 100 - 1) < 0.03, f"one division of the graticule is 1 µm at 40x ({gr['len'] * gr['umPerPx'] / 100:.3f})")
check(answer('n-q-40', '1.0'), 'n-q-40: 1.0 is right')

click('#measuring button[data-scope="kidney-cortex@1.4,2.95,10x"]')
p.wait("() => MG.app.scope.current() === 'kidney-cortex'", timeout=30000)
click('#measuring button[data-scope-tool="eyepiece:off"]')
time.sleep(1)
check(ticked('n-kidney') and not p.js("() => MG.app.scope.st.eyepiece"), 'back to the kidney with the eyepiece off (n-kidney)')
click('#measuring button[data-scope-tool="measure:renal corpuscle"]')
time.sleep(0.4)
check(p.js("() => MG.app.scope.toolName") == 'measure' and p.js("() => MG.app.scope.st.mlabel") == 'renal corpuscle', 'the Measure button labels the measurements that follow')
vb = p.js("() => { const r = MG.app.scope.view.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }")
for k in range(5):
    x0, y0 = vb['x'] + 80 + 40 * k, vb['y'] + 120 + 50 * k
    p.p.mouse.move(x0, y0)
    p.p.mouse.down()
    for s in range(1, 8):
        p.p.mouse.move(x0 + 20 * s, y0, steps=1)
    p.p.mouse.up()
    time.sleep(0.3)
check(ticked('n-measure'), 'five measurements tick n-measure')
labs = p.js("() => MG.app.scope.st.measures.filter(m => m.slide === 'kidney-cortex').map(m => m.label)")
check(len(labs) >= 5 and all(l == 'renal corpuscle' for l in labs[-5:]), f'they are labelled renal corpuscle ({labs[-5:]})')
check(answer('n-q-mean', '140 µm'), 'n-q-mean: 140 µm is in the range')
check(answer('n-q-mag', 'x400'), 'n-q-mag: x400')
check(answer('n-q-real', '22.5 µm'), 'n-q-real: 22.5 µm')

click('#measuring button[data-scope="haemocytometer@0.7,0.7,4x"]')
p.wait("() => MG.app.scope.current() === 'haemocytometer'", timeout=30000)
time.sleep(0.6)
check(ticked('n-haemo'), 'the haemocytometer opens (n-haemo)')
click('#measuring button[data-scope-tool="count:Living cells,Dead cells"]')
time.sleep(0.4)
cats = p.js("() => MG.app.scope.st.cats")
check(cats[:2] == ['Living cells', 'Dead cells'], f'the Count button names the categories ({cats})')
p.js("() => MG.app.scope.setMag(10, true)")
time.sleep(0.8)
for k in range(21):
    p.p.mouse.click(vb['x'] + 60 + (k % 7) * 30, vb['y'] + 100 + (k // 7) * 30)
    time.sleep(0.05)
time.sleep(1.2)
check(ticked('n-count'), 'twenty counts tick n-count')
csv = p.js("() => MG.app.fs.get(MG.app.HOME + '/microscope/counts.csv') && MG.app.fs.get(MG.app.HOME + '/microscope/counts.csv').text")
check(bool(csv) and 'haemocytometer,Living cells' in csv, 'counts.csv has the haemocytometer counts')
check(answer('n-q-count', '60'), 'n-q-count: 60')
check(answer('n-q-conc', '1.145 x 10^6 cells per mL'), 'n-q-conc: 1.145 × 10^6')
check(answer('n-q-conc', '1.1×10⁶'), 'n-q-conc: 1.1×10⁶ (rounded) is accepted')
check(not answer('n-q-conc', '1.2×10⁶'), 'n-q-conc: 1.2×10⁶ is not')
check(not answer('n-q-conc', '5.7 x 10^5'), 'n-q-conc: forgetting the dilution is wrong')
check(answer('n-q-viab', '89.8%'), 'n-q-viab: 89.8%')

# ---------------------------------------------------------------- 3 Diagrams
def accept_prompt(path=None):
    p.wait("() => document.querySelector('.modal .prompt-input')", timeout=5000)
    if path:
        p.p.fill('.modal .prompt-input', path)
    p.p.click('.modal .prompt-form button[type=submit]')
    time.sleep(0.4)


def confirm_if_asked():
    time.sleep(0.4)
    b = p.p.locator('.modal button.btn.primary, .modal button.danger')
    if b.count():
        b.first.click()
        time.sleep(0.4)


chapter('diagrams')
click('#diagrams button[data-flow="example:delay-oscillation"]')
p.wait("() => MG.app.flow && MG.app.flow.D && /delay/i.test(MG.app.flow.D.title)", timeout=30000)
time.sleep(0.4)
check(ticked('f-open'), 'Diagrams: the example opens (f-open)')
click('#diagrams button[data-flow-run="1"]')
time.sleep(0.6)
check(ticked('f-run') and not ticked('f-short') and not ticked('f-long'), 'the first run ticks f-run only')
p.js("() => { const F = MG.app.flow; F.setEdge('e2', {delay: 0.5}); F.run(); }")
time.sleep(0.5)
check(ticked('f-short') and not ticked('f-long'), 'a short delay settles (f-short)')
p.js("() => { const F = MG.app.flow; F.setEdge('e2', {delay: 4}); F.run(); }")
time.sleep(0.5)
check(ticked('f-long'), 'a long delay grows (f-long)')
click('#diagrams button[data-flow="example:blank"]')
confirm_if_asked()
p.wait("() => MG.app.flow.D && MG.app.flow.D.nodes.length === 0", timeout=10000)
check(ticked('f-new'), 'a blank diagram (f-new)')
ids = p.js("""() => { const F = MG.app.flow; F.D.title = 'My loop'; F._changed();
  const push = F.addNode({role: 'stimulus', text: 'Push'}), level = F.addNode({text: 'Level'}), resp = F.addNode({text: 'Response'});
  F.addEdge(push.id, level.id, {sign: '+'}); F.addEdge(level.id, resp.id, {sign: '+'});
  const back = F.addEdge(resp.id, level.id, {sign: '-'});
  return {level: level.id, back: back.id}; }""")
time.sleep(0.8)
check(ticked('f-boxes') and ticked('f-plus') and ticked('f-minus'), 'boxes and arrows tick f-boxes, f-plus and f-minus')
p.js("() => MG.app.flow.run()")
time.sleep(0.5)
check(ticked('f-run2'), 'running my loop ticks f-run2')
lv = p.js(f"() => {{ const s = MG.app.flow.result.series['{ids['level']}']; return s[s.length - 1]; }}")
check(abs(lv - 1.5) < 0.02, f'with the loop, Level ends at 1.5 ({lv:.3f}), as the model answer says')
p.js(f"() => {{ const F = MG.app.flow; F.setEdge('{ids['back']}', {{blocked: true}}); F.run(); }}")
time.sleep(0.5)
lv2 = p.js(f"() => {{ const s = MG.app.flow.result.series['{ids['level']}']; return s[s.length - 1]; }}")
check(ticked('f-block') and abs(lv2 - 2) < 0.02, f'blocked, Level ends at 2 ({lv2:.3f}) and f-block ticks')
p.js("() => { MG.app.flow.save(); }")
accept_prompt()
check(p.js("() => MG.app.fs.exists(MG.app.HOME + '/diagrams/my-loop.flow.json')"), 'the diagram is saved as diagrams/my-loop.flow.json')
p.js("() => MG.app.flow.exportCSV(true)")
time.sleep(0.6)
check(ticked('f-save'), 'saving the results ticks f-save')
check(p.js("() => MG.app.fs.exists(MG.app.HOME + '/diagrams/my-loop-run.csv')"), 'the results are in diagrams/my-loop-run.csv')

# ---------------------------------------------------------------- 4 Circuits
chapter('circuits')
click('#circuits button[data-circuit="example:ohms-law"]')
p.wait("() => MG.app.circuit && MG.app.circuit.doc && /Ohm/.test(MG.app.circuit.doc.title)", timeout=30000)
time.sleep(0.5)
check(ticked('c-open'), 'Circuits: Ohm’s law opens (c-open)')
click('#circuits button[data-circuit-run="1"]')
time.sleep(0.8)
check(ticked('c-run'), 'Run ticks c-run')
amm = p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"AM1\"]').textContent")
check('9.00 mA' in amm, f'the ammeter reads 9.00 mA ({amm})')
check(answer('c-q-9', '9 mA'), 'c-q-9: 9 mA')
p.js("() => { const A = MG.app.circuit; A.setProp(A.byId('R1'), 'value', 2200); }")
time.sleep(1.2)
amm = p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"AM1\"]').textContent")
check(ticked('c-r') and '4.09 mA' in amm, f'2.2 kΩ: the ammeter reads 4.09 mA ({amm}) and c-r ticks')
check(answer('c-q-22', '4.09 mA'), 'c-q-22: 4.09 mA')
click('#circuits button[data-circuit="example:rc-circuit"]')
confirm_if_asked()
p.wait("() => /capacitor/i.test(MG.app.circuit.doc.title)", timeout=10000)
time.sleep(0.4)
check(ticked('c-rc'), 'the RC example opens (c-rc)')
v = p.js("() => { const A = MG.app.circuit; A.run(); A.toggleSwitch(A.byId('S1')); const t0 = A.sim.time; A.sim.advance(t0 + 1); return A.sim.read('C1'); }")
time.sleep(0.4)
check(ticked('c-close'), 'closing the Charge switch ticks c-close')
vc = v.get('v') if isinstance(v, dict) else v
print('   capacitor after 1 s:', v)
check(answer('c-q-tau', '1 s'), 'c-q-tau: 1 s')
p.js("() => MG.app.circuit.setMode('physiology')")
time.sleep(0.4)
check(ticked('c-mode'), 'Physiology mode ticks c-mode')
click('#circuits button[data-circuit="example:windkessel"]')
confirm_if_asked()
p.wait("() => /Windkessel/i.test(MG.app.circuit.doc.title)", timeout=10000)
check(ticked('c-wk'), 'the Windkessel example opens (c-wk)')
p.js("() => { MG.app.circuit.save(); }")
accept_prompt()
time.sleep(0.4)
check(ticked('c-save'), 'saving the circuit ticks c-save')

# ---------------------------------------------------------------- 5 Exam practice
chapter('exam')
click('#exam button[data-exam="tour"]')
p.wait("() => MG.app.exam && [...document.querySelectorAll('#examRoot button')].some(b => b.textContent.trim() === 'Start')", timeout=30000)
check(ticked('e-open'), 'Exam practice: the tour paper opens (e-open)')
p.p.locator('#examRoot button', has_text='Start').first.click()
p.wait("() => document.querySelector('#examRoot .ex-fab.next')", timeout=10000)
time.sleep(0.4)
check(ticked('e-start'), 'Start ticks e-start')
p.p.click('#examRoot .ex-fab.next')
p.wait("() => document.querySelector('#examRoot .ex-area')", timeout=10000)
p.p.click('#examRoot .ex-area')
words = ('The lung is made of thin walled alveoli with capillaries in their walls, so that gases have only a short way to diffuse '
         'between the air and the blood. The bronchiole has smooth muscle in its wall and a folded epithelium, and a branch of the '
         'pulmonary artery runs beside it. The large surface area and the thin barrier suit the lung to gas exchange very well indeed. ')
p.p.keyboard.type(words)
for _ in range(40):
    if ticked('e-write'):
        break
    time.sleep(0.25)
wc = p.js("() => document.querySelector('#examRoot .ex-wc').textContent")
check(ticked('e-write'), f'60 words tick e-write ({wc})')
p.p.click('#examRoot .ex-tb [data-cmd="special"]')
time.sleep(0.4)
p.p.locator('.modal button', has_text='µ').first.click()
time.sleep(0.4)
check(ticked('e-format') and 'µ' in p.js("() => document.querySelector('#examRoot .ex-area').textContent"), 'a special character is inserted (e-format)')
# a paste of something copied outside the exam (these instructions) is refused, and ticks e-paste
p.js("""() => { const A = document.querySelector('#examRoot .ex-area'); A.focus(); const dt = new DataTransfer(); dt.setData('text/plain', 'Copy a sentence of these instructions');
    A.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
time.sleep(0.3)
check(ticked('e-paste') and 'Copy a sentence' not in p.js("() => document.querySelector('#examRoot .ex-area').textContent"), 'text copied from the instructions is not pasted into the answer (e-paste)')
p.p.click('#examRoot .ex-flag')
time.sleep(0.3)
check(ticked('e-flag'), 'the flag ticks e-flag')
p.p.click('#examRoot .ex-fab.next')
p.wait("() => document.querySelector('#examRoot .ex-num')", timeout=10000)
p.p.locator('#examRoot button', has_text='Calculator').first.click()
time.sleep(0.4)
p.p.fill('.calc-in', '3.0 * 1000 / (20 * 1000 / 50)')
p.p.press('.calc-in', 'Enter')
time.sleep(0.4)
check(ticked('e-calc'), 'the calculator ticks e-calc')
p.p.keyboard.press('Escape')
p.p.fill('#examRoot .ex-num', '7.5')
p.p.click('#examRoot .ex-fab.next')
p.wait("() => document.querySelector('#examRoot .ex-mcq')", timeout=10000)
p.p.click('#examRoot .ex-opt >> nth=1')
time.sleep(0.2)
p.p.click('#examRoot .ex-tile.review')
p.wait("() => document.querySelector('#examRoot .ex-submit')", timeout=10000)
p.p.click('#examRoot .ex-submit')
time.sleep(0.3)
p.p.click('.modal button:has-text("Submit now")')
p.wait("() => document.querySelector('#examRoot .ex-receipt')", timeout=10000)
check(ticked('e-submit'), 'submitting ticks e-submit')
p.p.click('#examRoot .ex-recacts .btn.primary')
time.sleep(0.2)
with p.p.expect_download() as d:
    p.p.click('.popmenu button:has-text("Word document")')
import zipfile, io as _io
docx = zipfile.ZipFile(d.value.path())
doc = docx.read('word/document.xml').decode('utf-8')
check(ticked('e-word') and 'alveoli' in doc and 'µ' in doc, 'the Word document downloads, with the essay in it (e-word)')
p.shot('practical-exam')

# ---------------------------------------------------------------- 6 3D molecules
chapter('molecules')
click('#molecules button[data-pdb="4HHB"]')
p.wait("() => MG.app.viewer && MG.app.viewer.structures && MG.app.viewer.structures.length > 0", timeout=60000)
time.sleep(1)
check(ticked('v-load'), 'haemoglobin loads and ticks v-load')
click('#molecules button[data-viewer="color chain"]')
time.sleep(0.8)
check(ticked('v-chain'), 'colour by chain ticks v-chain')
click('#molecules button[data-viewer="show spheres HEM"]')
time.sleep(0.8)
check(ticked('v-haem'), 'the haem groups as spheres tick v-haem')
check(answer('v-q-chains', '4 chains'), 'v-q-chains: 4')
lib = p.p.locator('#viewerRoot button', has_text='Library')
lib.first.click()
time.sleep(0.5)
check(ticked('v-library'), 'the Library button ticks v-library')
p.p.keyboard.press('Escape')
time.sleep(0.3)
click('#molecules button[data-viewer="clear; molecule glucose; only ballstick; color cpk"]')
for _ in range(60):
    if ticked('v-glucose'):
        break
    time.sleep(0.25)
check(ticked('v-glucose'), 'glucose opens and ticks v-glucose')
click('#molecules button[data-viewer="clear; molecule atp; only ballstick; color cpk"]')
for _ in range(60):
    if ticked('v-atp'):
        break
    time.sleep(0.25)
check(ticked('v-atp'), 'ATP opens and ticks v-atp')
p.shot('practical-atp')

# ---------------------------------------------------------------- 7 Data in R
chapter('r')
click('#r button[data-edit="microscope/measurements.csv"]')
time.sleep(1)
check(ticked('r-csv'), 'measurements.csv opens in Files (r-csv)')
click('#r button[data-scope-r="measurements"]')
p.wait("() => MG.app.rstudio && MG.app.rstudio.cur && /microscope-measurements/.test(MG.app.rstudio.cur.path || '')", timeout=60000)
time.sleep(0.5)
check(ticked('r-script'), 'the script opens in RStudio (r-script)')
# run the whole script (the student runs it line by line; this is the same R)
for _ in range(240):
    st = p.js("() => { const R = MG.app.rstudio; return R && R.S ? R.S.state : ''; }")
    if st == 'idle':
        break
    time.sleep(0.5)
check(st == 'idle', f'R starts in RStudio ({st})')
p.js("() => MG.app.rstudio.consoleRun('source(\"~/scripts/microscope-measurements.R\", echo = TRUE)')")
for _ in range(240):
    if ticked('r-plot'):
        break
    time.sleep(0.5)
out = p.js("() => document.querySelector('#rsRoot') ? document.querySelector('#rsRoot').innerText : ''")
check(ticked('r-run'), 'running the script ticks r-run')
check(ticked('r-plot'), 'the box plot ticks r-plot')
check('renal corpuscle' in out, 'R groups the lengths by their label (renal corpuscle)')
check('Error' not in out, 'the script runs without errors')
click('#r button[data-file-create="scripts/haemocytometer.R"]')
time.sleep(1.5)
check(ticked('r-make'), 'Create this file ticks r-make')
p.js("() => MG.app.rstudio.consoleRun('source(\"~/scripts/haemocytometer.R\", echo = TRUE)')")
for _ in range(120):
    out = p.js("() => document.querySelector('#rsRoot').innerText")
    if '89.8' in out:
        break
    time.sleep(0.5)
check('1145000' in out.replace(' ', '') or '1.145e+06' in out, 'R works out 1 145 000 cells per mL')
check('89.8' in out, 'and a viability of 89.8%')
check(ticked('r-source'), 'running it ticks r-source')
p.js("() => { const fs = MG.app.fs, p = MG.app.HOME + '/scripts/haemocytometer.R'; fs.writeText(p, fs.get(p).text.replace('live <- c(60, 64, 60, 45)', 'live <- c(48, 52, 50, 46)')); MG.bus.emit('rstudio:saved', {path: p}); }")
time.sleep(0.5)
check(ticked('r-change'), 'the changed counts in the script tick r-change')
check(answer('r-q-new', '980000'), 'r-q-new: 980 000')
p.shot('practical-r')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
print('\n'.join(l for l in p.logs if '[error]' in l)[:2000])
p.close()
done()
