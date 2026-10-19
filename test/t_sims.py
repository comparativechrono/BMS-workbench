"""The Simulations tab: the library of PhET simulations (every file and picture is there, search and topics), every
simulation starts in its frame (inside the cross-origin isolated page) and asks nothing of other sites, the screens
of a simulation, back to the library and to the simulation again, the About box, full screen, pausing a simulation
that is not seen, the simulation open last time after a reload, the chapter's buttons and the steps that tick
themselves, on a phone, and under a plain web server with the service worker (as on GitHub Pages).
Run:  python3 test/t_sims.py   (screenshots in test/out/sims-*.png)"""
import json, os, socket, subprocess, sys, time
from h import Page, check, done, SITE

INDEX = json.load(open(os.path.join(SITE, 'sims', 'index.json'), encoding='utf-8'))
SIMS = INDEX['sims']
IDS = [s['id'] for s in SIMS]
EV = "() => { window.__ev = []; MG.bus.on('*', (d, t) => { if (/^sim:/.test(t)) window.__ev.push([t, d]); }); }"


def events(p, kind=None):
    ev = p.js("() => window.__ev || []")
    return [d for t, d in ev if kind is None or t == kind]


def clear(p):
    p.js("() => { window.__ev = []; }")


def until(p, code, timeout=30):
    for _ in range(int(timeout * 5)):
        if p.js(code):
            return True
        time.sleep(0.2)
    return False


# ---------------------------------------------------------------- the files
bad = []
for s in SIMS:
    f = os.path.join(SITE, 'sims', s['id'], s['id'] + '_en.html')
    if not os.path.isfile(f) or os.path.getsize(f) != s['bytes']:
        bad.append(s['id'] + ' (file)')
        continue
    head = open(f, 'rb').read(4000).decode('utf-8', 'replace')
    if 'This file is licensed under Creative Commons Attribution 4.0' not in head or 'NonCommercial' in head or s['version'] not in head:
        bad.append(s['id'] + ' (licence or version)')
    if not os.path.isfile(os.path.join(SITE, 'sims', s.get('thumb', '-'))):
        bad.append(s['id'] + ' (picture)')
check(not bad, f'the {len(SIMS)} simulations are on the site, each PhET’s CC BY 4.0 file of the version listed, with its picture: {bad}')
total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(os.path.join(SITE, 'sims')) for f in fs)
check(total < 70e6 and all(s['bytes'] < 25e6 for s in SIMS), f'sims/ is within its budget ({total / 1e6:.1f} MB)')

# ---------------------------------------------------------------- the library
p = Page(width=1366, height=820)
outside = []
p.p.on('request', lambda r: outside.append(r.url) if r.url.split(':', 1)[0] in ('http', 'https') and not r.url.startswith('https://bms.test/') else None)
p.open()
p.js(EV)
p.js("() => MG.app.showWorkbench('sims')")
p.wait("() => MG.app.sims && document.querySelectorAll('.sm-card').length > 0", timeout=60000)
n = p.js("() => document.querySelectorAll('.sm-card').length")
check(n == len(SIMS), f'the library shows every simulation ({n} of {len(SIMS)})')
# every picture loads (they load lazily: brought into view one by one)
p.js("() => document.querySelectorAll('.sm-card img').forEach((i) => (i.loading = 'eager'))")
ok = until(p, "() => [...document.querySelectorAll('.sm-card img')].every((i) => i.complete && i.naturalWidth > 100)", 30)
check(ok, 'every picture in the library loads')
p.shot('sims-library')

# search: the words of a simulation's title, description, purpose, topics or screens
want = [s['id'] for s in SIMS if 'absorb' in ' '.join([s['title'], s['description'], s['why'], ' '.join(s['topics']), ' '.join(s['screens'])]).lower()]
p.p.locator('.sm-search').fill('absorb')
time.sleep(1.2)
got = p.js("() => [...document.querySelectorAll('.sm-card')].map((c) => c.dataset.sim)")
check(got == want and 'beers-law-lab' in got, f'searching for “absorb” finds {got} (expected {want})')
check(any(d.get('q') == 'absorb' for d in events(p, 'sim:search')), 'a search is reported (sim:search)')
p.p.locator('.sm-search').fill('zzzz')
time.sleep(0.4)
check(p.js("() => !document.querySelector('.sm-none').hidden && document.querySelectorAll('.sm-card').length === 0"), 'a search that finds nothing says so')
p.p.locator('.sm-none .linkbtn').click()
time.sleep(0.3)
check(p.js("() => document.querySelectorAll('.sm-card').length") == len(SIMS), '“Show them all” brings every simulation back')
topic = 'Light, vision and optics'
p.p.locator('.sm-chip', has_text=topic).click()
time.sleep(0.4)
got = p.js("() => [...document.querySelectorAll('.sm-card')].map((c) => c.dataset.sim)")
want = [s['id'] for s in SIMS if topic in s['topics']]
check(got == want and len(got) >= 3, f'the topic “{topic}” shows {got}')
check(any(d.get('topic') == topic for d in events(p, 'sim:filter')), 'choosing a topic is reported (sim:filter)')
p.p.locator('.sm-chip', has_text='All').click()
time.sleep(0.3)

# ---------------------------------------------------------------- every simulation starts
STATE = """() => { const A = MG.app.sims, c = A.cur; if (!c || !c.ok) return null; const d = c.frame.contentDocument;
  return { id: c.id, screen: c.screen, drawn: !!d.querySelector('canvas, svg'), w: c.frame.clientWidth, h: c.frame.clientHeight, iso: c.frame.contentWindow.crossOriginIsolated,
           sel: A.screenSel.hidden ? null : A.screenSel.options.length, title: A.titleEl.textContent, lib: !A.lib.hidden }; }"""
slow, broken = [], []
outside.clear()
for s in SIMS:
    t0 = time.time()
    r = p.js(f"() => MG.app.sims.open('{s['id']}')")
    st = p.js(STATE)
    dt = time.time() - t0
    if not r or not st or st['id'] != s['id'] or not st['drawn'] or st['w'] < 300 or st['h'] < 300 or st['lib']:
        broken.append((s['id'], r, st))
    elif (st['sel'] or 0) != (len(s['screens']) + 1 if len(s['screens']) > 1 else 0) or st['title'] != s['title']:
        broken.append((s['id'], 'toolbar', st))
    if dt > 25:
        slow.append((s['id'], round(dt, 1)))
    if s['id'] in ('neuron', 'membrane-transport', 'gene-expression-essentials', 'geometric-optics'):
        p.shot(f'sims-{s["id"]}')
check(not broken, f'every simulation starts in its frame, drawn, with its title and its screens in the toolbar: {broken}')
check(not slow, f'every simulation starts in good time: {slow}')
check(p.js("() => MG.app.sims.cur.frame.contentWindow.crossOriginIsolated") is True, 'a simulation runs inside the cross-origin isolated page')
opened = [d['id'] for d in events(p, 'sim:open')]
check(opened == IDS, f'each start is reported (sim:open): {len(opened)}')
check(not outside, f'the simulations ask nothing of other sites (usage statistics are off): {sorted(set(outside))[:5]}')
check(p.js("() => document.querySelectorAll('.sm-stage iframe').length") == 1, 'only the simulation that is open is kept in the page')

# ---------------------------------------------------------------- screens
clear(p)
check(p.js("() => MG.app.sims.open('ph-scale:2')") and p.js("() => MG.app.sims.cur.screen") == 2, 'open("ph-scale:2") starts pH Scale on its second screen')
check(p.js("() => MG.app.sims.screenSel.value") == '2', 'the toolbar shows the screen')
p.p.locator('.sm-screen').select_option('3')
time.sleep(0.6)
check(p.js("() => MG.app.sims._screenOf(MG.app.sims.cur.sim)") == 3 and any(d.get('screen') == 3 and d.get('id') == 'ph-scale' for d in events(p, 'sim:screen')),
      'choosing a screen in the toolbar shows it in the simulation (sim:screen)')
# the student changes the screen inside the simulation (its navigation bar)
p.js("() => { const s = MG.app.sims.cur.sim; s.selectedScreenProperty.value = s.simScreens[0]; }")
time.sleep(0.5)
check(p.js("() => MG.app.sims.screenSel.value") == '1' and any(d.get('screen') == 1 for d in events(p, 'sim:screen')), 'a screen chosen inside the simulation shows in the toolbar too')
frame0 = p.js("() => { window.__f = MG.app.sims.cur.frame; return true; }")
check(p.js("() => MG.app.sims.open('ph-scale:home')") and p.js("() => MG.app.sims.cur.screen") == 0 and p.js("() => window.__f === MG.app.sims.cur.frame"),
      'open("ph-scale:home") shows its home screen, without starting it again')
# an older simulation (another version of PhET's code)
check(p.js("() => MG.app.sims.open('capacitor-lab-basics:2')") and p.js("() => MG.app.sims.cur.screen") == 2, 'an older simulation opens on its second screen too')
p.p.locator('.sm-screen').select_option('1')
time.sleep(0.6)
check(p.js("() => MG.app.sims._screenOf(MG.app.sims.cur.sim)") == 1, '… and changes screen from the toolbar')
check(p.js("() => MG.app.sims.open('no-such-sim')") is False and p.js("() => !MG.app.sims.lib.hidden"), 'an unknown simulation leaves the library shown, with a message')

# ---------------------------------------------------------------- back to the library, and to the simulation
p.js("() => MG.app.sims.open('neuron')")
p.js("() => { window.__f = MG.app.sims.cur.frame; }")
clear(p)
p.p.locator('.sm-back').click()
time.sleep(0.4)
check(p.js("() => !MG.app.sims.lib.hidden && MG.app.sims.player.hidden") and events(p, 'sim:library'), 'the Library button goes back to the library (sim:library)')
check(p.js("() => MG.app.sims.cur.sim.activeProperty.value") is False, 'the simulation is paused while the library is shown')
check(p.js("() => !document.querySelector('.sm-cont').hidden && /Neuron/.test(document.querySelector('.sm-cont').textContent)"), 'the library offers to go back to Neuron')
p.shot('sims-library-back')
p.p.locator('.sm-cont-b').click()
time.sleep(0.4)
check(p.js("() => !MG.app.sims.player.hidden && window.__f === MG.app.sims.cur.frame && MG.app.sims.cur.sim.activeProperty.value === true"), '… which shows it again as it was, running')
# pausing when another tab is shown
p.js("() => MG.app.showWorkbench('editor')")
time.sleep(0.5)
check(p.js("() => MG.app.sims.cur.sim.activeProperty.value") is False, 'a simulation is paused while another tab is shown')
p.js("() => MG.app.showWorkbench('sims')")
time.sleep(0.5)
check(p.js("() => MG.app.sims.cur.sim.activeProperty.value") is True, '… and runs again when its tab is shown')

# ---------------------------------------------------------------- About, full screen, a tab of its own
clear(p)
p.p.locator('.sm-bar .sm-ib[title^="About"]').click()
time.sleep(0.4)
txt = p.js("() => document.querySelector('.modal') ? document.querySelector('.modal').innerText : ''")
check('PhET Interactive Simulations' in txt and 'CC BY 4.0' in txt and '1.1.34' in txt and 'Noah Podolefsky' in txt and 'nothing to PhET' in txt,
      'the About box gives the credit, the licence, the version, the authors and the privacy note')
check(events(p, 'sim:about'), 'opening the About box is reported (sim:about)')
p.shot('sims-about')
p.p.keyboard.press('Escape')
time.sleep(0.3)
if p.js("() => document.fullscreenEnabled"):
    p.p.locator('.sm-bar .sm-ib[title^="Full screen"]').click()
    time.sleep(0.6)
    on = p.js("() => document.fullscreenElement === MG.app.sims.player")
    check(on and any(d.get('on') is True for d in events(p, 'sim:fullscreen')), 'full screen shows the simulation and its toolbar (sim:fullscreen)')
    p.js("() => document.exitFullscreen()")
    time.sleep(0.5)
    check(not p.js("() => !!document.fullscreenElement") and any(d.get('on') is False for d in events(p, 'sim:fullscreen')), '… and Esc (or the button) leaves it')
with p.ctx.expect_page(timeout=15000) as pop:
    p.p.locator('.sm-bar .sm-ib[title^="Open the simulation"]').click()
w = pop.value
w.wait_for_load_state()
check('sims/neuron/neuron_en.html?yotta=false' in w.url, f'the simulation opens in a browser tab of its own, without usage statistics ({w.url[-50:]})')
w.close()

# ---------------------------------------------------------------- the simulation open last time, after a reload
p.js("() => MG.app.sims.open('beers-law-lab:2')")
time.sleep(0.6)
p.p.reload()
p.wait("() => window.MG_READY === true", timeout=60000)
p.js(EV)
p.js("() => MG.app.showWorkbench('sims')")
ok = until(p, "() => MG.app.sims && MG.app.sims.cur && MG.app.sims.cur.ok", 60)
check(ok and p.js("() => MG.app.sims.cur.id") == 'beers-law-lab' and p.js("() => MG.app.sims.cur.screen") == 2, 'after a reload, the tab opens the simulation (and screen) open last time')
check(events(p, 'sim:restore') and not events(p, 'sim:open'), '… reported as sim:restore, not as a new sim:open')
p.p.locator('.sm-back').click()
time.sleep(0.6)
p.p.reload()
p.wait("() => window.MG_READY === true", timeout=60000)
p.js("() => MG.app.showWorkbench('sims')")
until(p, "() => MG.app.sims && document.querySelectorAll('.sm-card').length > 0", 30)
time.sleep(0.5)
check(p.js("() => !MG.app.sims.lib.hidden && !MG.app.sims.cur"), 'after a reload from the library, the library is shown')

# ---------------------------------------------------------------- the chapter
p.js(EV)
p.js("() => MG.app.showChapter('simulations', true)")
time.sleep(0.6)
ticked = lambda tid: bool(p.js(f"() => !!MG.tutorial.state.tasks['{tid}']"))
check(p.js("() => !document.querySelector('#simulations').hidden && MG.app.currentBench === 'sims'"), 'the chapter shows, with the Simulations tab')
p.p.locator('.sm-chip', has_text='Membranes and nerves').click()
time.sleep(0.4)
check(ticked('sim-lib'), 'choosing the topic ticks “look through the library”')
p.p.locator('#simulations [data-sim="neuron"]').click()
until(p, "() => MG.app.sims.cur && MG.app.sims.cur.ok && MG.app.sims.cur.id === 'neuron'", 60)
time.sleep(0.4)
check(ticked('sim-neuron'), 'the show-me button opens Neuron, and ticks its step')
NM = "MG.app.sims.cur.sim.screens[0].model.model"
p.js(f"() => {NM}.initiateStimulusPulse()")
time.sleep(0.4)
check(ticked('sim-stim'), 'stimulating the neuron ticks its step')
p.js(f"() => {NM}.setPotentialChartVisible(true)")
time.sleep(0.4)
check(ticked('sim-chart'), 'showing the potential chart ticks its step')
p.js(f"() => {NM}.setConcentrationReadoutVisible(true)")
time.sleep(0.4)
check(ticked('sim-conc'), 'showing the concentrations ticks its step')
p.shot('sims-neuron-chapter')
# Beer's law
p.p.locator('#simulations [data-sim="beers-law-lab:2"]').click()
until(p, "() => MG.app.sims.cur && MG.app.sims.cur.ok && MG.app.sims.cur.id === 'beers-law-lab'", 60)
time.sleep(0.4)
check(ticked('sim-beer') and p.js("() => MG.app.sims.cur.screen") == 2, 'the show-me button opens Beer’s Law Lab on its Beer’s Law screen, and ticks its step')
BM = "MG.app.sims.cur.sim.simScreens[1].model"
p.js(f"""() => {{ const m = {BM}; m.light.isOnProperty.value = true; const V = m.detector.probe.positionProperty.value.constructor;
  m.detector.probe.positionProperty.value = new V(6.3, m.light.position.y); }}""")
time.sleep(0.6)
check(ticked('sim-detect'), 'the detector in the beam ticks its step')
p.js(f"() => {{ {BM}.solutionProperty.value.concentrationProperty.value = 0.05; }}")
time.sleep(0.7)
check(ticked('sim-bconc'), 'changing the concentration ticks its step')
p.js(f"() => {{ {BM}.cuvette.widthProperty.value = 2; }}")
time.sleep(0.7)
check(ticked('sim-path'), 'changing the path length ticks its step')
a = p.js(f"() => {BM}.detector.absorbanceProperty.value")
check(abs(a - 0.506) < 0.005, f'the simulation agrees with the model answer: 50 mM in 2.00 cm absorbs as 100 mM in 1.00 cm (A = {a})')
p.js(f"() => {{ {BM}.solutionProperty.value.concentrationProperty.value = 0.1; {BM}.cuvette.widthProperty.value = 1; }}")
time.sleep(0.3)
check(abs(p.js(f"() => {BM}.detector.absorbanceProperty.value") - 0.506) < 0.005, '… and 100 mM in 1.00 cm gives the 0.51 of the question')
p.shot('sims-beers-law')
# pH
p.p.locator('#simulations [data-sim="ph-scale:2"]').click()
until(p, "() => MG.app.sims.cur && MG.app.sims.cur.ok && MG.app.sims.cur.id === 'ph-scale'", 60)
time.sleep(0.4)
check(ticked('sim-ph') and p.js("() => MG.app.sims.cur.screen") == 2, 'the show-me button opens pH Scale on its Micro screen, and ticks its step')
PM = "MG.app.sims.cur.sim.simScreens[1].model"
p.js(f"() => {{ const m = {PM}; m.solution.soluteProperty.value = m.solutes.find((s) => /blood/i.test(s.nameProperty.value)); }}")
time.sleep(1.5)
check(ticked('sim-blood'), 'choosing blood ticks its step')
h3o = p.js(f"() => [{PM}.solution.pHProperty.value, {PM}.solution.derivedProperties.concentrationH3OProperty.value]")
check(abs(h3o[0] - 7.4) < 0.01 and abs(h3o[1] * 1e9 - 40) < 1, f'the simulation agrees with the model answer: blood at pH {h3o[0]} has {h3o[1] * 1e9:.1f} nmol/L of H₃O⁺')
p.js(f"() => {{ {PM}.waterFaucet.flowRateProperty.value = 0.25; }}")
time.sleep(1.2)
p.js(f"() => {{ {PM}.waterFaucet.flowRateProperty.value = 0; }}")
time.sleep(0.8)
check(ticked('sim-water'), 'adding water ticks its step')
check(p.js(f"() => {PM}.solution.pHProperty.value") < 7.39, 'diluted, the “blood” of the simulation moves towards pH 7 (as the chapter’s warning says)')
p.shot('sims-ph')
nums = p.js("() => [MG.tutorial_numOk('0.51±0.02', '0.51'), MG.tutorial_numOk('0.51±0.02', '0.506'), MG.tutorial_numOk('40±2', '40 nM'), MG.tutorial_numOk('40±2', '39.8 nmol/L'), MG.tutorial_numOk('40±2', '4.0 × 10^-8')]")
check(nums[:4] == [True, True, True, True], f'the numeric questions accept the answers as students write them: {nums}')
mcq = p.js("() => { const q = document.querySelector('.q[data-q=\"sim-q-first\"]'); return q ? q.querySelectorAll('label[data-correct]').length : -1; }")
check(mcq == 1, 'the multiple-choice question has one right answer')
p.shot('sims-chapter')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ---------------------------------------------------------------- a narrow workbench, beside the instructions
p = Page(width=1100, height=760)
p.open()
p.js("() => MG.app.showWorkbench('sims')")
p.wait("() => MG.app.sims && document.querySelectorAll('.sm-card').length > 0", timeout=60000)
time.sleep(0.6)
st = p.js("() => { const r = MG.app.sims.root; const l = MG.app.sims.lib; return { w: r.clientWidth, over: l.scrollWidth > l.clientWidth + 1, cols: getComputedStyle(document.querySelector('.sm-grid')).gridTemplateColumns.split(' ').length }; }")
check(not st['over'] and st['cols'] >= 2, f'beside the instructions ({st["w"]} px): the library fits, in {st["cols"]} columns')
p.js("() => MG.app.sims.open('gas-properties:1')")
st = p.js("() => { const b = MG.app.sims.bar; return { over: b.scrollWidth > b.clientWidth + 1, fw: MG.app.sims.cur.frame.clientWidth, w: MG.app.sims.root.clientWidth }; }")
check(not st['over'] and st['fw'] >= st['w'] - 2, f'… and a simulation fills the tab, with its toolbar on one line ({st})')
p.shot('sims-narrow')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ---------------------------------------------------------------- a phone
p = Page(width=390, height=844, mobile=True)
p.open()
p.p.locator('.bench-fab').click()
time.sleep(0.5)
p.p.locator('.wb-tab[data-wb="sims"]').tap()
p.wait("() => MG.app.sims && document.querySelectorAll('.sm-card').length > 0", timeout=60000)
time.sleep(0.8)
st = p.js("""() => { const l = MG.app.sims.lib, g = document.querySelector('.sm-grid'), c = document.querySelector('.sm-card').getBoundingClientRect();
  return { page: document.documentElement.scrollWidth <= innerWidth, over: l.scrollWidth > l.clientWidth + 1, cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, cw: c.width, gw: g.clientWidth }; }""")
check(st['page'] and not st['over'] and st['cols'] == 1 and st['cw'] >= st['gw'] - 2, f'on a phone the library is one column and nothing is wider than the screen ({st})')
p.shot('sims-phone-library')
p.p.locator('.sm-card[data-sim="neuron"]').tap()
until(p, "() => MG.app.sims.cur && MG.app.sims.cur.ok", 60)
time.sleep(0.8)
st = p.js("""() => { const A = MG.app.sims, b = A.bar, f = A.cur.frame.getBoundingClientRect();
  return { page: document.documentElement.scrollWidth <= innerWidth, bar: b.scrollWidth <= b.clientWidth + 1, fw: f.width, fh: f.height, W: innerWidth, foot: A.foot.getBoundingClientRect().bottom <= innerHeight + 1 }; }""")
check(st['page'] and st['bar'] and st['fw'] >= st['W'] - 2 and st['fh'] > 400 and st['foot'], f'on a phone a simulation fills the screen, under a toolbar that fits, with PhET’s credit below it ({st})')
foot = p.js("() => { const f = MG.app.sims.foot; return { full: /University of Colorado Boulder, licensed under CC BY 4\\.0/.test(f.textContent), cut: f.scrollWidth > f.clientWidth + 1 || f.scrollHeight > f.clientHeight + 1 }; }")
check(foot['full'] and not foot['cut'], f'on a phone PhET’s credit is shown in full ({foot})')
check(p.js("() => !MG.app.sims.turn.hidden"), 'a phone held upright is told that turning it sideways makes the simulation bigger')
p.shot('sims-phone-neuron')
p.p.set_viewport_size({'width': 844, 'height': 390})
time.sleep(0.8)
check(p.js("() => MG.app.sims.turn.hidden"), '… and the note goes when the phone is turned')
p.shot('sims-phone-sideways')
p.p.set_viewport_size({'width': 390, 'height': 844})
time.sleep(0.5)
p.p.locator('.sm-back').tap()
time.sleep(0.4)
check(p.js("() => !MG.app.sims.lib.hidden"), 'on a phone the Library button goes back')
check(not p.errors, 'no page errors on a phone: ' + '; '.join(p.errors[:3]))
p.close()


# ---------------------------------------------------------------- a plain web server with the service worker (GitHub Pages)
def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


port = free_port()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    p = Page(base=f'http://localhost:{port}/', service_workers='allow')
    p.open()
    iso = False
    for _ in range(80):
        try:
            iso = p.js("() => window.crossOriginIsolated && window.MG_READY === true")
        except Exception:
            iso = False
        if iso:
            break
        time.sleep(0.25)
    check(iso, 'under a plain web server, the service worker makes the page cross-origin isolated')
    p.js("() => MG.app.showWorkbench('sims')")
    p.wait("() => MG.app.sims && MG.app.sims.list.length > 0", timeout=60000)
    r = p.js("() => MG.app.sims.open('molarity')")
    st = p.js(STATE)
    check(r and st and st['drawn'] and st['iso'] is True, f'… and a simulation starts in its frame, isolated too ({st})')
    check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
    p.close()
finally:
    srv.terminate()
    srv.wait(timeout=10)
done()
