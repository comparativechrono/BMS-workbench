"""The Recorder: its recordings open and draw; zoom, scroll and play; the calipers measure the right intervals by mouse,
by clicks and by touch; the heart-rate channel; the data pad and its CSV file; CSV export; the scripts for R; pictures;
the chapter's buttons and the steps that tick themselves; a phone.
Run:  python3 test/t_recorder.py   (screenshots in test/out/recorder-*.png)"""
import json
import os
import time

from h import Page, check, done, SITE

RC = 'MG.app.recorder'
IDX = json.load(open(os.path.join(SITE, 'recordings', 'index.json'), encoding='utf-8'))
EV = """() => { window.__ev = []; MG.bus.on('*', (d, t) => { if (/^(rec|rstudio):/.test(t)) window.__ev.push([t, JSON.parse(JSON.stringify(d))]); }); }"""
INK = """(sel) => { const c = document.querySelector(sel); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 120 && d[i + 1] < 160) n++; return n; }"""


def evs(p, kind=None):
    return [e for e in p.js('() => window.__ev') if kind is None or e[0] == kind]


def go(p, spec):
    p.js(f"() => {RC}.go({json.dumps(spec)})")
    p.wait(f"() => {RC}.R && !{RC}._raf", timeout=30000)
    time.sleep(0.15)


def ticked(p, tid):
    return bool(p.js(f"() => !!MG.tutorial.state.tasks['{tid}']"))


def drag(p, x0, y, x1, steps=8):
    m = p.p.mouse
    m.move(x0, y)
    m.down()
    for k in range(1, steps + 1):
        m.move(x0 + (x1 - x0) * k / steps, y)
    m.up()


# ------------------------------------------------------------------------------------------- a computer
p = Page(width=1500, height=950)
p.open()
p.js(EV)
p.js("() => MG.app.showWorkbench('recorder')")
p.wait(f"() => {RC} && {RC}.catalogue.recordings.length > 0", timeout=60000)
ids = [r['id'] for r in IDX['recordings']]
check(len(ids) >= 12 and p.js(f"() => {RC}.catalogue.recordings.length") == len(ids), f'the list has the {len(ids)} recordings')
check(p.js("() => document.querySelectorAll('.rc-item').length") == len(ids) and p.js("() => document.querySelectorAll('.rc-grp').length") == len(IDX['groups']), f'the list shows them in {len(IDX["groups"])} groups')

# every recording opens and draws its traces
bad = []
for rid in ids:
    go(p, rid)
    st = p.js(f"() => ({{ id: {RC}.R.id, n: {RC}.R.n, lanes: {RC}._lanes().length, ink: ({INK})('.rc-cv'), title: document.querySelector('.rc-title').textContent }})")
    if st['id'] != rid or st['lanes'] < 1 or st['ink'] < 200:
        bad.append((rid, st))
check(not bad, f'every recording opens, and its traces are drawn: {bad}')
opened = [e[1]['id'] for e in evs(p, 'rec:open')]
check(opened[-len(ids):] == ids, 'rec:open is sent for each recording')

# the view: go() with times, channels and the heart rate
go(p, 'ecg-normal@12,22')
v = p.js(f"() => [{RC}.t0, {RC}.span]")
check(abs(v[0] - 12) < 1e-6 and abs(v[1] - 10) < 1e-6, f"go('ecg-normal@12,22') shows 12 to 22 s: {v}")
go(p, 'rsa@0,60:Resp')
check(p.js(f"() => {RC}._lanes().map((L) => L.short)") == ['Resp'], "go('rsa@0,60:Resp') shows only the breathing")
go(p, 'rsa@0,60:ECG,Resp+hr')
lanes = p.js(f"() => {RC}._lanes().map((L) => L.short)")
check(lanes == ['ECG', 'HR', 'Resp'], f'+hr adds the heart-rate channel, under the ECG it was counted on: {lanes}')
hr = p.js(f"() => {RC}.R.hr.slice(0, 3).map((x) => [x.t, x.v, x.rr])")
check(all(abs(h[1] - 60 / h[2]) < 1e-6 for h in hr), f'the heart rate of each beat is 60 ÷ its R–R interval: {hr}')
p.shot('recorder-rsa')

# zoom and scroll with keys, the wheel and the overview
go(p, 'ecg-normal@10,20')
p.js("() => document.querySelector('.rc-chart').focus()")
p.p.keyboard.press('+')
time.sleep(0.2)
v1 = p.js(f"() => [{RC}.t0, {RC}.span]")
check(abs(v1[1] - 5) < 1e-6 and abs(v1[0] + v1[1] / 2 - 15) < 1e-6, f'+ zooms in about the middle of the view: {v1}')
p.p.keyboard.press('ArrowRight')
time.sleep(0.2)
v2 = p.js(f"() => [{RC}.t0, {RC}.span]")
check(abs(v2[0] - v1[0] - 0.5) < 1e-6, f'→ moves on a tenth of the screen: {v2}')
p.p.keyboard.press('-')
time.sleep(0.2)
check(abs(p.js(f"() => {RC}.span") - 10) < 1e-6, '− zooms out')
box = p.js("() => { const r = document.querySelector('.rc-cv').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
p.p.mouse.move(box[0] + box[2] / 2, box[1] + 120)
p.p.keyboard.down('Control')
p.p.mouse.wheel(0, -300)
p.p.keyboard.up('Control')
time.sleep(0.3)
check(p.js(f"() => {RC}.span") < 10, 'Ctrl + the wheel zooms in')
t0 = p.js(f"() => {RC}.t0")
drag(p, box[0] + box[2] * 0.7, box[1] + 150, box[0] + box[2] * 0.4)
time.sleep(0.3)
check(p.js(f"() => {RC}.t0") > t0, 'dragging the trace to the left moves on in time')
ov = p.js("() => { const r = document.querySelector('.rc-ov').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
p.p.mouse.click(ov[0] + 54 + (ov[2] - 64) * 0.9, ov[1] + ov[3] / 2)
time.sleep(0.3)
mid = p.js(f"() => {RC}.t0 + {RC}.span / 2")
check(abs(mid - 0.9 * 60) < 3, f'a click on the overview moves the view there ({mid:.1f} s)')
time.sleep(0.5)
check(any(e[1]['id'] == 'ecg-normal' for e in evs(p, 'rec:view')), 'rec:view is sent when the view settles')

# the calipers, by dragging from one R wave to the next
go(p, 'ecg-normal@0,4')
p.js(f"() => {RC}.tool('calipers')")
beats = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 0.5 && t < 3.5)")
y = p.js(f"() => {RC}._clientY('II')")
xa, xb = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", beats)
drag(p, xa, y, xb)
time.sleep(0.2)
m = p.js(f"() => {{ const m = {RC}.measurement(); return m && {{ dt: m.dt, rate: m.rate, ch: m.channel }}; }}")
want = beats[1] - beats[0]
px = 4 / p.js(f"() => {RC}._plotW()")
check(m and abs(m['dt'] - want) <= 2 * px and abs(m['rate'] - 60 / m['dt']) < 1e-6 and m['ch'] == 'II', f'the calipers measure an R–R interval by dragging: {m}, the beats are {want:.3f} s apart')
ev = evs(p, 'rec:measure')[-1][1]
check(ev['id'] == 'ecg-normal' and abs(ev['dt'] - m['dt']) < 1e-3 and ev['channel'] == 'II', f'rec:measure is sent: {ev}')
bar = p.js("() => document.querySelector('.rc-mbar').innerText")
check('Δt' in bar and '/min' in bar, f'the bar shows the interval and the rate: {bar[:80]!r}')
# …and by two clicks
p.js(f"() => {RC}.clearCursors()")
xc = p.js(f"(b) => {RC}._clientX(b)", beats[2] if len(beats) > 2 else beats[1] + 0.8)
p.p.mouse.click(xb, y)
p.p.mouse.click(xc, y)
time.sleep(0.2)
m2 = p.js(f"() => {RC}.measurement() && {RC}.measurement().dt")
want2 = (beats[2] if len(beats) > 2 else beats[1] + 0.8) - beats[1]
check(m2 is not None and abs(m2 - want2) <= 2 * px, f'two clicks measure too: {m2} (want {want2:.3f})')
p.shot('recorder-calipers')

# the data pad
p.js(f"() => {{ {RC}.st.pad = []; }}")
p.p.locator('.rc-add').click()
time.sleep(0.8)
rows = p.js(f"() => {RC}.st.pad.length")
csv = p.js("() => { const e = MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv'); return e && e.text; }")
check(rows == 1 and csv and csv.splitlines()[0].startswith('recording,channel,units,t1_s,t2_s,dt_s,rate_per_min') and 'ecg-normal,II,mV' in csv, f'Add puts the measurement in the data pad, and in recorder/measurements.csv: {csv!r}')
check(evs(p, 'rec:datapad')[-1][1]['n'] == 1, 'rec:datapad is sent')
p.js("() => document.querySelector('.rc-chart').focus()")
p.p.keyboard.press('Enter')
time.sleep(0.2)
check(p.js(f"() => {RC}.st.pad.length") == 2, 'Enter adds the measurement too')
p.js(f"() => {RC}.showSide('datapad')")
time.sleep(0.3)
check(p.js("() => document.querySelectorAll('.rc-pad tbody tr').length") == 2, 'the data pad lists the rows')
cm = p.p.locator('.rc-pad tbody tr .rc-cm').first
cm.fill('R-R')
cm.press('Tab')
time.sleep(0.8)
csv = p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv').text")
check(',R-R,' in csv, 'a note typed in the data pad goes into the CSV file')
p.shot('recorder-datapad')

# the marker
p.js(f"() => {RC}.tool('marker')")
p.p.mouse.click(xa, y)
p.p.mouse.move(xb, y)
time.sleep(0.2)
tip = p.js("() => document.querySelector('.rc-tip').textContent")
check(p.js(f"() => {RC}.M") is not None and 'from M' in tip, f'the marker: the readout measures from it: {tip!r}')
p.js(f"() => {RC}.tool('pan')")

# the heart-rate channel, and a scale
go(p, 'ecg-ectopic')
p.js(f"() => {RC}.tool('hr')")
time.sleep(0.2)
check(p.js(f"() => {RC}._lanes().some((L) => L.key === 'hr')") and evs(p, 'rec:hr')[-1][1] == {'id': 'ecg-ectopic', 'on': True}, 'the Heart rate button adds the channel (rec:hr)')
r0 = p.js(f"() => {RC}._range({RC}._lanes()[0])")
p.js(f"() => {RC}.autoscale()")
r1 = p.js(f"() => {RC}._range({RC}._lanes()[0])")
check(r1 != r0 and r1[0] < r1[1], f'autoscale fits the scale to the screen: {r0} → {r1}')
p.js(f"() => {RC}.tool('hr:off')")

# playing
go(p, 'ecg-normal@0,10')
p.js(f"() => {RC}.setSpeed(2)")
p.js(f"() => {RC}.tool('play')")
time.sleep(1.5)
pl = p.js(f"() => {RC}.playing && {RC}.playing.t")
check(pl is not None and 2.2 < pl < 4.5, f'Play replays the recording (×2: {pl} s after 1.5 s)')
p.shot('recorder-playing')
p.js("() => document.querySelector('.rc-chart').focus()")
p.p.keyboard.press(' ')
time.sleep(0.2)
pe = evs(p, 'rec:play')
check(not p.js(f"() => !!{RC}.playing") and pe[-2][1]['on'] is True and pe[-1][1]['on'] is False, 'space stops it (rec:play on, then off)')
p.js(f"() => {RC}.setSpeed(1)")

# sound (the recordings that have it)
go(p, 'heart-sounds')
check(p.js(f"() => !{RC}.listenBtn.hidden"), 'the heart sounds have a Sound button')
p.js(f"() => {RC}.setListen(true)")
check(evs(p, 'rec:listen')[-1][1] == {'id': 'heart-sounds', 'on': True}, 'Sound can be switched on')
p.js(f"() => {RC}.setListen(false)")
go(p, 'ecg-normal')
check(p.js(f"() => {RC}.listenBtn.hidden"), 'a recording with no sound has no Sound button')

# export, R and pictures
go(p, 'ecg-normal@0,10')
path = p.js(f"() => {RC}.exportRange(0, 2, 'test-export', {{ quiet: true }})")
text = p.js("(p) => MG.app.fs.get(p).text", path)
lines = text.strip().splitlines()
check(lines[0] == 'time_s,ii_mV,v5_mV' and len(lines) == 2 * 360 + 2, f'a CSV file of the samples: {lines[0]!r}, {len(lines) - 1} rows')
check(p.js("() => MG.app.fs.exists(MG.app.HOME + '/recorder/test-export-beats.csv')"), '…and of the beats')
check(evs(p, 'rec:export')[-1][1]['path'].endswith('/recorder/test-export.csv'), 'rec:export is sent')
p.js(f"() => {RC}.setCursors(1, 3, 'II')")
p.js(f"() => {RC}.tool('export')")
time.sleep(0.3)
check(p.js("() => !!document.querySelector('.modal .rc-exp input[value=cursors]:checked')"), 'the export dialog offers the part between the cursors')
p.p.locator('.modal .rc-exp input[name=name]').fill('between-cursors')
p.p.locator('.modal .rc-exp button[type=submit]').click()
time.sleep(0.4)
t2 = p.js("() => { const e = MG.app.fs.get(MG.app.HOME + '/recorder/between-cursors.csv'); return e && e.text; }")
check(t2 and len(t2.strip().splitlines()) == 2 * 360 + 2, f'…and saves it ({len(t2.strip().splitlines()) - 1 if t2 else 0} rows)')
p.js(f"() => {RC}.credits()")
time.sleep(0.2)
cr = p.js("() => document.querySelector('.modal').innerText")
check('MIT-BIH Arrhythmia Database' in cr and 'Open Data Commons Attribution' in cr and 'Goldberger' in cr, 'the credits list the databases, their licence and the citation of PhysioNet')
p.p.keyboard.press('Escape')
p.js(f"() => {RC}.showSide('about')")
time.sleep(0.2)
ab = p.js("() => document.querySelector('.rc-side-b').innerText")
check('Open Data Commons Attribution License v1.0' in ab and 'PLEASE CITE' in ab.upper() and 'MIT-BIH Arrhythmia Database' in ab, 'About gives the source, licence and citations')
go(p, 'heart-sounds@0,4')
p.js(f"() => {{ {RC}.setListen(true); {RC}.play(); }}")
time.sleep(0.8)
snd = p.js(f"() => !!{RC}._asrc && !!{RC}.playing")
p.js(f"() => {{ {RC}.stop(); {RC}.setListen(false); }}")
check(snd and not p.js(f"() => !!{RC}._asrc"), 'with Sound on, the heart sounds play while the recording plays, and stop with it')
go(p, 'ecg-normal@0,10')
cap = p.js(f"() => {RC}.capture()")
check(cap and cap.endswith('.png') and p.js("(p) => MG.app.fs.exists(p)", cap) and evs(p, 'rec:capture'), f'the camera saves a picture: {cap}')
p.js(f"() => {RC}.toR('measurements')")
p.wait("() => window.__ev.some((e) => e[0] === 'rstudio:doc' && e[1].name === 'recorder-measurements.R')", timeout=90000)
check(p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/recorder-measurements.R').text").startswith('# Measurements from the Recorder'), 'toR(measurements) opens the script for the data pad in RStudio')
p.js(f"() => {RC}.toR('rsa')")
p.wait("() => window.__ev.some((e) => e[0] === 'rstudio:doc' && e[1].name === 'rsa.R')", timeout=60000)
check(p.js("() => ['rsa.csv', 'rsa-beats.csv', 'rsa.R'].every((f) => MG.app.fs.exists(MG.app.HOME + '/recorder/' + f))"), "toR('rsa') saves the recording and its beats, and opens a script that plots them")
p.shot('recorder-rstudio')

# ------------------------------------------------------------------------------------------- the chapter
p.js("() => MG.app.showWorkbench('recorder')")
time.sleep(0.5)
p.js(f"() => {{ {RC}.st.pad = []; {RC}._save(); }}")
p.js("() => MG.app.showChapter('recordings', true)")
time.sleep(0.5)


def btn(sel):
    p.p.locator(f'.chapter#recordings {sel}').first.click()
    time.sleep(0.6)


btn('[data-rec="ecg-normal"]')
check(ticked(p, 'rec-open'), 'chapter: the sinus rhythm opens and its step ticks')
btn('[data-rec="ecg-normal@2,4"]')
check(ticked(p, 'rec-zoom'), 'chapter: zooming in to 2 s ticks')
btn('[data-rec-tool="calipers"]')
check(p.js(f"() => {RC}.toolName") == 'calipers', 'chapter: show me chooses the calipers')
p.js(f"() => {RC}.clearCursors()")
beats = p.js(f"() => {RC}.R.beats.t.filter((t) => t > {p.js(f'() => {RC}.t0')} + 0.1 && t < {p.js(f'() => {RC}.t0 + {RC}.span')} - 0.1)")
y = p.js(f"() => {RC}._clientY('II')")
xa, xb = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", beats)
drag(p, xa, y, xb)
time.sleep(0.3)
check(ticked(p, 'rec-calipers'), 'chapter: measuring an R–R interval ticks')
for k in range(3):
    p.js(f"() => {RC}.addToPad()")
time.sleep(0.3)
check(ticked(p, 'rec-pad'), 'chapter: three rows in the data pad tick')
p.js(f"(b) => {RC}.setCursors(b - 0.16, b - 0.02, 'II')", beats[0])
check(ticked(p, 'rec-pr'), 'chapter: a PR interval ticks')
btn('[data-rec="ecg-ectopic"]')
p.js(f"() => {RC}.setCursors(10, 11, 'II')")
btn('[data-rec="ecg-af"]')
check(ticked(p, 'rec-ectopic') and ticked(p, 'rec-pause') and ticked(p, 'rec-af'), 'chapter: the arrhythmias tick')
btn('[data-rec="rsa"]')
btn('[data-rec-tool="hr"]')
btn('[data-rec="rsa@0,90"]')
btn('[data-rec-tool="play"]')
time.sleep(0.5)
p.js(f"() => {RC}.stop()")
check(all(ticked(p, t) for t in ['rec-rsa', 'rec-hr', 'rec-all', 'rec-play']), 'chapter: heart rate and breathing tick')
btn('[data-rec="eeg-alpha"]')
btn('[data-rec="eeg-alpha@40,41"]')
p.js(f"() => {RC}.setCursors(40.1, 41.05, 'O1')")
check(ticked(p, 'rec-eeg') and ticked(p, 'rec-alpha'), 'chapter: the EEG steps tick')
btn('[data-rec-tool="datapad"]')
check(ticked(p, 'rec-padview'), 'chapter: the data pad step ticks')
btn('[data-rec-r="measurements"]')
p.wait("() => MG.tutorial.state.tasks['rec-script']", timeout=60000)
btn('[data-rec-r="rsa"]')
p.wait("() => MG.tutorial.state.tasks['rec-plot']", timeout=60000)
check(True, 'chapter: the R steps tick')
tasks = p.js("() => [...document.querySelectorAll('.chapter#recordings [data-task]')].map((li) => [li.dataset.task, !!MG.tutorial.state.tasks[li.dataset.task]])")
check(all(t[1] for t in tasks), f'chapter: every step has ticked: {[t for t in tasks if not t[1]]}')


def answer(qid, text):
    q = p.p.locator(f'.q[data-q="{qid}"]')
    q.locator('textarea, input[type=text]').first.fill(text)
    q.locator('button', has_text='Check').first.click()
    time.sleep(0.2)
    return q.inner_text()


check('Correct' in answer('rec-q-rate', '75 bpm'), 'chapter: the heart rate question accepts 75')
check('Correct' in answer('rec-q-alpha', '10.5 Hz'), 'chapter: the alpha question accepts 10.5')
p.js("() => MG.app.showWorkbench('recorder')")
time.sleep(0.4)
p.shot('recorder-chapter')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ------------------------------------------------------------------------------------------- a laptop
# (beside the instructions the chart is short: the time axis and the overview must not squeeze it out)
p = Page(width=1366, height=768)
p.open()
p.js("() => MG.app.showWorkbench('recorder')")
p.wait(f"() => {RC} && {RC}.catalogue.recordings.length > 0", timeout=60000)
go(p, 'bp-standing')
sz = p.js("() => ({ chart: document.querySelector('.rc-chart').getBoundingClientRect().height, axis: document.querySelector('.rc-axis').getBoundingClientRect().height, ov: document.querySelector('.rc-ov').getBoundingClientRect().height })")
check(sz['chart'] > 300 and sz['axis'] == 24 and sz['ov'] == 36, f'1366 × 768: the chart fills the tab above its time axis and overview: {sz}')
check(p.js(f"({INK})", '.rc-cv') > 200, '1366 × 768: the traces are drawn')
p.shot('recorder-laptop')
p.close()

# ------------------------------------------------------------------------------------------- a phone
p = Page(width=390, height=844, mobile=True)
p.open()
p.js(EV)
p.p.locator('.bench-fab').click()
time.sleep(0.4)
p.p.locator('.wb-tab[data-wb="recorder"]').tap()
p.wait(f"() => {RC} && {RC}.catalogue.recordings.length > 0", timeout=60000)
time.sleep(0.4)
check(p.js("() => !document.querySelector('.rc-list').hidden"), 'phone: the list of recordings opens first')
p.shot('recorder-phone-list')
p.p.locator('.rc-item[data-id="ecg-normal"]').tap()
p.wait(f"() => {RC}.R && {RC}.R.id === 'ecg-normal'", timeout=30000)
time.sleep(0.5)
ov = p.js("""() => { const r = document.querySelector('.rc-app'); return { doc: document.documentElement.scrollWidth - innerWidth, app: r.scrollWidth - r.clientWidth,
  bar: [...document.querySelectorAll('.rc-bar > *')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().right <= innerWidth + 0.5),
  chart: document.querySelector('.rc-chart').getBoundingClientRect().height, list: document.querySelector('.rc-list').hidden }; }""")
check(ov['doc'] <= 0 and ov['app'] <= 0 and ov['bar'], f'phone: nothing is wider than the screen: {ov}')
check(ov['chart'] > 250 and ov['list'], f'phone: the list closes and the chart has room: {ov["chart"]:.0f} px')
p.js(f"() => {RC}.tool('calipers')")
go(p, 'ecg-normal@0,4')
beats = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 0.4 && t < 3.6)")
y = p.js(f"() => {RC}._clientY('II')")
xa, xb = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", beats)
p.p.touchscreen.tap(xa, y)
time.sleep(0.2)
p.p.touchscreen.tap(xb, y)
time.sleep(0.3)
m = p.js(f"() => {RC}.measurement() && {RC}.measurement().dt")
pw = p.js(f"() => {RC}._plotW()")
check(m is not None and abs(m - (beats[1] - beats[0])) <= 3 * 4 / pw, f'phone: two taps measure an R–R interval: {m} (want {beats[1] - beats[0]:.3f})')
p.shot('recorder-phone')
p.js(f"() => {RC}.showSide('datapad')")
time.sleep(0.3)
sd = p.js("() => { const r = document.querySelector('.rc-side').getBoundingClientRect(); return [r.left, r.right, innerWidth]; }")
check(sd[0] >= -0.5 and sd[1] <= sd[2] + 0.5, f'phone: the data pad fits on the screen: {sd}')
p.shot('recorder-phone-pad')
check(not p.errors, 'phone: no page errors: ' + '; '.join(p.errors[:3]))
p.close()
done()
