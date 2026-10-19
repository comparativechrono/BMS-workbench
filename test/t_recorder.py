"""The Recorder: its recordings open and draw; zoom, scroll and play; the calipers measure the right intervals by mouse,
by clicks and by touch – one after another, each starting where the last ended; what an interval is (R–R, PR, QRS, QT,
other) and a heart rate from the R–R intervals only, in the data pad, its CSV file and its script for R (run in R); the
marker; the heart-rate channel; CSV export; pictures; the recordings' data (the AF recording, the EMG scales, the units);
the whole chapter done by hand at 1366 × 768 beside the instructions, where the panels lie over the chart; a phone.
Run:  python3 test/t_recorder.py   (screenshots in test/out/recorder-*.png)"""
import re
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


def drag(p, x0, y, x1, steps=8, y1=None):
    m = p.p.mouse
    m.move(x0, y)
    m.down()
    for k in range(1, steps + 1):
        m.move(x0 + (x1 - x0) * k / steps, y if y1 is None else y + (y1 - y) * k / steps)
    m.up()


def on_chart(p, x, y):
    """whether the chart's canvas is what is at (x, y) on the page: not a panel lying over it"""
    return bool(p.js("([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.classList.contains('rc-cv')); }", [x, y]))


def meas(p):
    return p.js(f"() => {{ const m = {RC}.measurement(); return m && {{ dt: m.dt, rate: m.rate, ch: m.channel, iv: m.interval, A: {RC}.A, B: {RC}.B }}; }}")


def bar_iv(p):
    return p.js("() => { const s = document.querySelector('.rc-mbar .rc-iv'); return s ? s.value : null; }")


def r_idle(p):
    st = ''
    for _ in range(400):
        st = p.js("() => { const R = MG.app.rstudio; return R && R.S ? R.S.state : ''; }")
        if st == 'idle':
            break
        time.sleep(0.5)
    return st


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

# R–R intervals one after another, each drag starting where the last one ended: the old cursor B is not grabbed and
# stretched – only a cursor's flag moves it; a drag anywhere else is a new measurement
go(p, 'ecg-normal@0,5')
p.js(f"() => {RC}.tool('calipers')")
bt = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 0.2 && t < 4.8)")
y = p.js(f"() => {RC}._clientY('II')")
px = 4 / p.js(f"() => {RC}._plotW()") * 5
got = []
for k in range(3):
    xa, xb = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", [bt[k], bt[k + 1]])
    drag(p, xa, y, xb)
    time.sleep(0.15)
    m = meas(p)
    got.append((round(m['A'], 3), round(m['B'], 3), round(m['dt'], 3), m['iv']))
ok = all(abs(g[0] - bt[k]) <= px and abs(g[1] - bt[k + 1]) <= px and g[3] == 'R-R' for k, g in enumerate(got))
check(ok, f'three R–R intervals in a row, each drag starting on the B of the last: each is one interval, and an R–R: {got} (beats {bt[:4]})')
ev = [e[1] for e in evs(p, 'rec:measure')][-3:]
check(all(e['kind'] == 'interval' and e['interval'] == 'R-R' and e['signal'] == 'ecg' and e['t1'] < e['t2'] and abs(e['hz'] - 1 / e['dt']) < 0.01 for e in ev), f'rec:measure says what was measured: {ev[-1]}')
band = p.js(f"() => {RC}._bandH()")
top = p.js(f"() => {RC}.cv.getBoundingClientRect().top")
A0, B0 = p.js(f"() => [{RC}.A, {RC}.B]")
xB = p.js(f"() => {RC}._clientX({RC}.B)")
drag(p, xB, top + band - 9, xB + 30)
time.sleep(0.15)
A1, B1 = p.js(f"() => [{RC}.A, {RC}.B]")
spp = p.js(f"() => {RC}.span / {RC}._plotW()")
check(abs(A1 - A0) < 1e-9 and abs((B1 - B0) - 30 * spp) < 3 * spp, f"dragging B's flag moves B (and only B): {B0:.3f} → {B1:.3f} s")
p.js(f"() => {RC}.setCursors({bt[0]}, {bt[1]}, 'II')")
x1, x2 = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", [bt[1], bt[2]])
p.p.mouse.click(x1, y)
time.sleep(0.1)
p.p.mouse.click(x2, y)
time.sleep(0.15)
m = meas(p)
check(m and abs(m['A'] - bt[1]) <= px and abs(m['B'] - bt[2]) <= px, f'two clicks, the first on the old cursor B, measure the next interval: {m}')

# what an interval is: guessed from where the cursors lie on the ECG's beats, shown (and changeable) beside Data pad
go(p, 'ecg-normal@2,4')
r, r2 = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 2.4 && t < 4.6).slice(0, 2)")
g = p.js(f"([r, r2]) => {{ const L = {RC}._lanes()[0], f = (a, b) => {RC}._guessInterval(L, a, b); return [f(r, r2), f(r - 0.2, r - 0.04), f(r - 0.05, r + 0.06), f(r - 0.04, r + 0.38), f(r + 0.1, r + 0.3), f(r - 0.4, r + 0.4)]; }}", [r, r2])
check(g == ['R-R', 'PR', 'QRS', 'QT', 'other', 'other'], f'the guess of what was measured: R-R, PR, QRS, QT, other, other: {g}')
p.js(f"() => {RC}.setCursors({r}, {r2}, 'II')")
time.sleep(0.2)
bar = p.js("() => document.querySelector('.rc-mbar').innerText")
check(bar_iv(p) == 'R-R' and '/min' in bar and 'Hz' in bar, f'an R–R interval: the menu says R–R; the rate is shown per minute and in Hz: {bar!r}')
p.js(f"() => {RC}.setCursors({r} - 0.2, {r} - 0.04, 'II')")
time.sleep(0.2)
bar = p.js("() => document.querySelector('.rc-mbar').innerText")
check(bar_iv(p) == 'PR' and '/min' not in bar, f'a PR interval: the menu says PR, and no rate is given: {bar!r}')
p.p.locator('.rc-mbar .rc-iv').select_option('other')
time.sleep(0.2)
check(p.js(f"() => {RC}.measurement().interval") == 'other' and bar_iv(p) == 'other', 'the menu can change what the interval is')
p.js(f"() => {RC}.setCursors({r} - 0.2, {r} - 0.05, 'II')")
time.sleep(0.2)
check(bar_iv(p) == 'PR', 'new cursors: a new guess')
go(p, 'eeg-alpha@40,41')
p.js(f"() => {RC}.setCursors(40.1, 40.195, 'O1')")
time.sleep(0.2)
bar = p.js("() => document.querySelector('.rc-mbar').innerText")
check(bar_iv(p) == 'other' and re.search(r'=\s*10\.5 Hz', bar), f'an interval of the EEG is other, and its rate is shown in Hz: {bar!r}')

# the data pad: three R–R intervals, a PR and a QT (as the chapter asks), each added as what it is; the heart rate comes
# from the R–R intervals only
go(p, 'ecg-normal@2,6')
p.js(f"() => {{ {RC}.st.pad = []; {RC}._save(); }}")
p.js(f"() => {RC}.showSide(null)")
bt = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 2.1 && t < 5.9)")
for k in range(3):
    p.js(f"() => {RC}.setCursors({bt[k]}, {bt[k + 1]}, 'II')")
    p.p.locator('.rc-add').click()
    time.sleep(0.15)
r = bt[1]
p.js(f"() => {RC}.setCursors({r} - 0.2, {r} - 0.04, 'II')")
p.p.locator('.rc-add').click()
time.sleep(0.15)
p.js(f"() => {RC}.setCursors({r} - 0.04, {r} + 0.40, 'II')")
p.p.locator('.rc-add').click()
time.sleep(0.9)
pad = p.js(f"() => {RC}.st.pad.map((r) => [r.kind, r.dt])")
check([k for k, _ in pad] == ['R-R', 'R-R', 'R-R', 'PR', 'QT'], f'each row of the data pad is what was measured: {pad}')
rr = [dt for k, dt in pad if k == 'R-R']
hr = 60 / (sum(rr) / len(rr))
allhr = 60 / (sum(dt for _, dt in pad) / len(pad))
p.js(f"() => {RC}.showSide('datapad')")
time.sleep(0.3)
summ = p.js("() => [...document.querySelectorAll('.rc-side-b .rc-sum')].map((e) => e.innerText).join(' | ')")
check(f'heart rate {hr:.1f} /min' in summ and f'{allhr:.0f} /min' not in summ, f'the data pad gives the heart rate from the R–R intervals only ({hr:.1f} /min, not {allhr:.0f}): {summ!r}')
check(re.search(r'PR \d+ ms', summ) and re.search(r'QT \d+ ms', summ), f'…and the PR and QT intervals apart, in ms: {summ!r}')
csv = p.js("() => { const e = MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv'); return e && e.text; }")
lines = csv.strip().splitlines()
head = lines[0].split(',')
check(head[:9] == ['recording', 'channel', 'kind', 'units', 't1_s', 't2_s', 'dt_s', 'rate_per_min', 'freq_hz'] and len(lines) == 6, f'recorder/measurements.csv has a column of what each row is: {lines[0]!r}')
rows = [dict(zip(head, l.split(','))) for l in lines[1:]]
check([x['kind'] for x in rows] == ['R-R', 'R-R', 'R-R', 'PR', 'QT'] and rows[3]['rate_per_min'] == 'NA' and rows[0]['rate_per_min'] != 'NA' and abs(float(rows[0]['freq_hz']) - 1 / float(rows[0]['dt_s'])) < 0.01, f'…with no rate for a PR or QT: {rows[3]}')
ev = evs(p, 'rec:datapad')[-1][1]
check(ev['interval'] == 'QT' and ev['n'] == 5 and (ev['n_rr'], ev['n_pr'], ev['n_qt'], ev['n_qrs'], ev['n_other']) == (3, 1, 1, 0, 0), f'rec:datapad counts the rows of each kind: {ev}')
# a row's kind changed in the data pad
p.p.locator('.rc-pad tbody tr .rc-rk').nth(3).select_option('other')
time.sleep(0.9)
csv = p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv').text")
ev = evs(p, 'rec:datapad')[-1][1]
check(csv.strip().splitlines()[4].split(',')[2] == 'other' and ev['n_pr'] == 0 and ev['n_other'] == 1, f'the kind of a row can be changed in the data pad (CSV and rec:datapad follow): {ev}')
p.p.locator('.rc-pad tbody tr .rc-rk').nth(3).select_option('PR')
time.sleep(0.3)
cm = p.p.locator('.rc-pad tbody tr .rc-cm').first
cm.fill('first beat')
cm.press('Tab')
time.sleep(0.8)
csv = p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv').text")
check(',first beat,' in csv, 'a note typed in the data pad goes into the CSV file')
p.js(f"() => {RC}.setCursors({bt[2]}, {bt[3]}, 'II')")
p.js("() => document.querySelector('.rc-chart').focus()")
p.p.keyboard.press('Enter')
time.sleep(0.3)
check(p.js(f"() => {RC}.st.pad.length") == 6 and p.js(f"() => {RC}.st.pad[5].kind") == 'R-R', 'Enter adds the measurement too')
p.shot('recorder-datapad')
p.js(f"() => {{ {RC}.st.pad.pop(); {RC}._save(); {RC}._writePad(); {RC}._renderSide(); }}")

# the marker
go(p, 'ecg-normal@0,4')
xa, xb = p.js(f"() => [{RC}._clientX(1), {RC}._clientX(2)]")
y = p.js(f"() => {RC}._clientY('II')")
p.js(f"() => {RC}.tool('marker')")
p.p.mouse.click(xa, y)
p.p.mouse.move(xb, y)
time.sleep(0.2)
tip = p.js("() => document.querySelector('.rc-tip').textContent")
check(p.js(f"() => {RC}.M") is not None and 'from M' in tip, f'the marker: the readout measures from it: {tip!r}')
ev = evs(p, 'rec:measure')[-1][1]
check(ev['kind'] == 'point' and ev['channel'] == 'II' and abs(ev['t'] - p.js(f"() => {RC}.M")) < 1e-3 and 'value' in ev, f'the marker sends rec:measure, a point: {ev}')
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

# the recordings' data: the AF recording holds what its text says (measured), the EMGs share a scale, the units
go(p, 'ecg-af')
af = p.js(f"""() => {{ const R = {RC}.R, t = R.beats.t, rr = (a, b) => {{ const v = []; for (let i = 1; i < t.length; i++) if (t[i - 1] >= a && t[i] <= b) v.push(t[i] - t[i - 1]); return v; }};
  const cv = (v) => {{ const m = v.reduce((x, y) => x + y, 0) / v.length; return [v.length, m, Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / (v.length - 1)) / m]; }};
  const af = R.rhythms.find((x) => x.code === 'AFIB');
  return {{ rh: R.rhythms.map((x) => [x.text, x.t0, x.t1]), sinus: cv(rr(0, af.t0)), af: cv(rr(af.t0, R.duration)), db: R.source.database, lic: R.source.licence }}; }}""")
check([x[0] for x in af['rh']] == ['Sinus rhythm', 'Atrial fibrillation'] and 26 < af['rh'][1][1] < 30, f'the AF recording: sinus rhythm, then atrial fibrillation from about 28 s: {af["rh"]}')
check(af['sinus'][2] < 0.05 and af['af'][2] > 0.3 and af['sinus'][0] > 20 and af['af'][0] > 20, f"…its R–R intervals: nearly equal in sinus rhythm (CV {af['sinus'][2]:.3f}), irregular in AF (CV {af['af'][2]:.2f}); heart rate {60 / af['sinus'][1]:.0f} → {60 / af['af'][1]:.0f} /min")
check(af['db'] == 'MIT-BIH Atrial Fibrillation Database' and 'Open Data Commons Attribution' in af['lic'], 'its source is the MIT-BIH Atrial Fibrillation Database (ODC-By)')
emg = []
for rid in ['emg-healthy', 'emg-myopathy', 'emg-neuropathy']:
    go(p, rid)
    emg.append(p.js(f"() => {RC}._range({RC}._lanes()[0])"))
check(emg[0] == emg[1] == emg[2] == [-3.5, 3.5], f'the three EMG recordings open on one scale: {emg}')
go(p, 'heart-sounds')
check(p.js(f"() => {RC}.R.channels.map((c) => c.units)") == ['a.u.', 'a.u.'], 'the heart sounds and their ECG, which the database does not calibrate, are in arbitrary units')
go(p, 'ecg-ectopic@8,18')
lg = p.js(f"() => {RC}.R.beats.legend.N")
check('normally conducted' in lg, f'the beats labelled N are described as normally conducted: {lg!r}')
check(p.js(f"() => {RC}.R.beats.code.split('').filter((c, i) => c === 'V' && {RC}.R.beats.t[i] > {RC}.t0 && {RC}.R.beats.t[i] < {RC}.t0 + {RC}.span).length") >= 3, 'the ectopic beats open with ectopic beats in view')

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
V1 = """# Measurements from the Recorder's data pad
# (each row is one measurement that you added to the data pad; the Recorder keeps this file up to date)
m <- read.csv("~/recorder/measurements.csv")
head(m)

# how many measurements of each recording and channel
table(m$recording, m$channel)

# the intervals (dt_s, in seconds) and the rates they correspond to (60 / dt_s, per minute)
summary(m$dt_s)
round(tapply(m$dt_s, m$recording, mean), 3)
round(tapply(m$rate_per_min, m$recording, mean), 1)

# a heart rate from the mean R-R interval of a recording: 60 divided by the mean interval
round(60 / tapply(m$dt_s, m$recording, mean), 1)

# the intervals of each recording, as a strip chart
stripchart(dt_s ~ recording, data = m, vertical = TRUE, method = "jitter", pch = 19,
           col = "steelblue", ylab = "Interval (s)", las = 2)
"""
p.js("(t) => { MG.app.fs.mkdirp(MG.app.HOME + '/recorder'); MG.app.fs.writeText(MG.app.HOME + '/recorder/recorder-measurements.R', t); }", V1)
pad = p.js(f"() => {RC}.st.pad.map((r) => [r.kind, r.dt])")
p.js(f"() => {RC}.toR('measurements')")
p.wait("() => window.__ev.some((e) => e[0] === 'rstudio:doc' && e[1].name === 'recorder-measurements.R')", timeout=90000)
script = p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/recorder-measurements.R').text")
check(script.startswith('# Measurements from the Recorder') and 'kind == "R-R"' in script, 'toR(measurements) opens the script for the data pad in RStudio (one left as the first version wrote it is brought up to date)')
st = r_idle(p)
check(st == 'idle', f'R starts ({st})')
p.js("() => MG.app.rstudio.consoleRun('source(\"~/recorder/recorder-measurements.R\", echo = TRUE)')")
out = ''
for _ in range(240):
    out = p.js("() => document.querySelector('#rsRoot').innerText")
    tail = out[out.rfind('source('):]
    if 'stripchart' in tail and 'freq_hz' in tail[tail.find('other <-'):]:
        break
    time.sleep(0.5)
time.sleep(2)
out = p.js("() => document.querySelector('#rsRoot').innerText")
out = out[out.rfind('source('):]
rr = [dt for k, dt in pad if k == 'R-R']
want = 60 / (sum(rr) / len(rr))
i = out.find('round(60 / tapply(rr$dt_s')
got = re.findall(r'ecg-normal\s+([0-9.]+)', out[i:i + 400]) if i >= 0 else []
check('Error' not in out and got and abs(float(got[0]) - want) < 0.06, f'the script, run in R, gives the heart rate from the R–R intervals only: {got[:1]} (want {want:.1f})' + ('' if 'Error' not in out else ': ' + out[out.find('Error'):][:300]))
j = out.find('round(tapply(ecg$dt_s')
check(j >= 0 and re.search(r'PR', out[j:j + 300]) and re.search(r'QT', out[j:j + 300]), 'and the PR and QT intervals of each recording, in ms')
p.shot('recorder-r-pad')
p.js(f"() => {RC}.toR('rsa')")
p.wait("() => window.__ev.some((e) => e[0] === 'rstudio:doc' && e[1].name === 'rsa.R')", timeout=60000)
check(p.js("() => ['rsa.csv', 'rsa-beats.csv', 'rsa.R'].every((f) => MG.app.fs.exists(MG.app.HOME + '/recorder/' + f))"), "toR('rsa') saves the recording and its beats, and opens a script that plots them")
p.shot('recorder-rstudio')

p.shot('recorder-desktop-end')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ------------------------------------------------------------------------------------------- the chapter, at 1366 × 768
# Beside the instructions the Recorder is narrow: its list and side panel lie over the chart. Every step is done as a
# student would, with the chapter's buttons and real drags on the chart – which must not be covered when they are needed.
p = Page(width=1366, height=768)
p.open()
p.js(EV)
p.js("() => MG.app.showChapter('recordings', true)")
p.wait(f"() => MG.app.currentBench === 'recorder' && {RC} && {RC}.catalogue.recordings.length > 0", timeout=60000)
time.sleep(0.5)
W = p.js(f"() => {RC}.root.clientWidth")
check(W < 860, f'1366 × 768 beside the instructions: the Recorder is {W} px wide, so its panels lie over the chart')
sz = p.js("() => ({ chart: document.querySelector('.rc-chart').getBoundingClientRect().height, axis: document.querySelector('.rc-axis').getBoundingClientRect().height, ov: document.querySelector('.rc-ov').getBoundingClientRect().height })")
check(sz['chart'] > 300 and sz['axis'] == 24 and sz['ov'] == 36, f'1366 × 768: the chart fills the tab above its time axis and overview: {sz}')
TASKS = p.js("() => [...document.querySelectorAll('.chapter#recordings [data-task]')].map((li) => li.dataset.task)")


def btn(sel):
    p.p.locator(f'.chapter#recordings {sel}').first.click()
    m = re.match(r'\[data-rec="([a-z0-9-]+)', sel)
    if m:
        # (a recording opens when it has been fetched: on a busy computer that can take a moment)
        p.wait(f"() => {RC}.R && {RC}.R.id === '{m.group(1)}' && !{RC}._raf", timeout=30000)
    time.sleep(0.7)


def covered():
    """whether a panel lies over the chart (the side panel or the list)"""
    return p.js(f"() => !{RC}.side.hidden || !{RC}.list.hidden")


def mdrag(t1, t2, lane):
    """a drag on the chart from t1 to t2 (s) along a lane, checking first that the chart is what is there"""
    y = p.js(f"(s) => {RC}._clientY(s)", lane)
    x1, x2 = p.js(f"(b) => [{RC}._clientX(b[0]), {RC}._clientX(b[1])]", [t1, t2])
    free = on_chart(p, x1, y) and on_chart(p, x2, y)
    drag(p, x1, y, x2)
    time.sleep(0.35)
    return free, meas(p)


def add():
    p.p.locator('.rc-mbar .rc-add').click()
    time.sleep(0.3)


btn('[data-rec="ecg-normal"]')
check(ticked(p, 'rec-open') and not covered(), 'step: the sinus rhythm opens (and the list closes)')
btn('[data-rec="ecg-normal@2,4"]')
check(ticked(p, 'rec-zoom'), 'step: zooming in to 2 s ticks')
btn('[data-rec-tool="calipers"]')
p.p.locator('.rc-zoom .rc-ib').first.click()   # (−: 4 s across, for three R–R intervals in a row)
time.sleep(0.5)
bt = p.js(f"() => {RC}.R.beats.t.filter((t) => t > {RC}.t0 + 0.05 && t < {RC}.t0 + {RC}.span - 0.05)")
px = 5 * 4 / p.js(f"() => {RC}._plotW()")
res = []
for k in range(3):
    free, m = mdrag(bt[k], bt[k + 1], 'II')
    res.append((free, bool(m and abs(m['dt'] - (bt[k + 1] - bt[k])) <= px), bar_iv(p)))
    if k == 0:
        check(ticked(p, 'rec-calipers'), 'step: measuring an R–R interval by dragging ticks')
    add()
check(all(r[0] and r[1] and r[2] == 'R-R' for r in res), f'step: three R–R intervals in a row (each starting where the last ended), each measured right and added as an R–R: {res}')
check(ticked(p, 'rec-pad'), 'step: three R–R intervals in the data pad tick')
btn('[data-rec-tool="datapad"]')
check(not ticked(p, 'rec-padview'), 'showing the data pad (step 4) does not tick the step about its file (step 17)')
geo = p.js(f"() => {{ const s = {RC}.side.getBoundingClientRect(), b = {RC}.mbar.getBoundingClientRect(); return {{ side: [s.left, s.top, s.right], bar: [b.top, b.bottom, b.right] }}; }}")
check(not p.js(f"() => {RC}.side.hidden") and geo['side'][1] >= geo['bar'][1] - 1, f'the data pad lies over the chart below the readout bar, which stays in sight: {geo}')
summ = p.js("() => [...document.querySelectorAll('.rc-side-b .rc-sum')].map((e) => e.innerText).join(' | ')")
pad = p.js(f"() => {RC}.st.pad.map((r) => r.dt)")
check(f'heart rate {60 / (sum(pad) / len(pad)):.1f} /min' in summ, f'the data pad gives the heart rate of the three R–R intervals: {summ!r}')
p.shot('recorder-1366-pad')
# PR and QT, about 1 s across the screen: zooming is going back to the chart, so the panel closes
p.p.locator('.rc-span').select_option('1')
time.sleep(0.5)
check(not covered(), 'zooming closes the panel that lay over the chart')
r = p.js(f"() => {RC}.R.beats.t.find((t) => t - 0.3 > {RC}.t0 && t + 0.45 < {RC}.t0 + {RC}.span)")
if r is None:
    t0 = p.js(f"() => {RC}.R.beats.t.find((t) => t > 2.5)")
    p.js(f"() => {RC}.show({t0} - 0.35, {t0} + 0.65)")
    time.sleep(0.4)
    r = t0
free1, m1 = mdrag(r - 0.2, r - 0.04, 'II')
iv1 = bar_iv(p)
add()
free2, m2 = mdrag(r - 0.04, r + 0.38, 'II')
iv2 = bar_iv(p)
add()
check(free1 and free2 and iv1 == 'PR' and iv2 == 'QT', f'step: a PR and a QT interval, measured by dragging, are guessed as such: {iv1}, {iv2}')
check(ticked(p, 'rec-pr'), 'step: a PR and a QT in the data pad tick')
p.shot('recorder-1366-qt')
# opening another recording closes a panel that lay over the chart
p.p.locator('.rc-bar .rc-ib[title^="The data pad"]').click()
time.sleep(0.4)
check(covered(), '(the data pad is open again)')
btn('[data-rec="ecg-ectopic"]')
check(ticked(p, 'rec-ectopic') and not covered(), 'step: the ectopic beats open, and the panel over the chart closes')
vb = p.js(f"""() => {{ const B = {RC}.R.beats, out = []; for (let i = 1; i < B.t.length - 1; i++) if (B.code[i] === 'V' && B.t[i - 1] > {RC}.t0 && B.t[i + 1] < {RC}.t0 + {RC}.span) out.push([B.t[i - 1], B.t[i], B.t[i + 1]]); return out; }}""")
y = p.js(f"() => {RC}._clientY('II')")
seen = [on_chart(p, p.js(f"(t) => {RC}._clientX(t)", v[1]), y) for v in vb]
check(len(vb) >= 2 and all(seen), f'the ectopic beats are in view, and nothing lies over them: {len(vb)}')
p.shot('recorder-1366-ectopic')
free1, m1 = mdrag(vb[0][0], vb[0][1], 'II')
free2, m2 = mdrag(vb[0][1], vb[0][2], 'II')
check(free1 and free2 and m2['dt'] > m1['dt'] and ticked(p, 'rec-pause'), f'step: the R–R intervals before and after an ectopic beat (the pause after it is longer): {m1["dt"]:.3f}, {m2["dt"]:.3f} s')
btn('[data-rec="ecg-af"]')
check(not ticked(p, 'rec-af'), '(opening the AF does not yet tick its step: it asks for measurements)')
rh = p.js(f"() => {RC}.R.rhythms.map((x) => [x.text, x.t0])")
afb = p.js(f"() => {RC}.R.beats.t.filter((t) => t > 29 && t < {RC}.t0 + {RC}.span - 0.05)")
sib = p.js(f"() => {RC}.R.beats.t.filter((t) => t > {RC}.t0 + 0.05 && t < 27.5)")
free1, m1 = mdrag(sib[0], sib[1], 'ECG1')
free2, m2 = mdrag(afb[0], afb[1], 'ECG1')
check(free1 and free2 and ticked(p, 'rec-af'), f'step: R–R intervals in the sinus rhythm and in the fibrillation (both in view) tick: {rh}')
p.shot('recorder-1366-af')
p.p.locator('.q[data-q="rec-q-af"] .mcq label[data-correct] input').first.check()
time.sleep(0.2)
check(p.js("() => (MG.tutorial.state.answers['rec-q-af'] || {}).correct === true"), 'the AF question: no P waves, and R–R intervals that vary without any pattern')
btn('[data-rec="rsa"]')
btn('[data-rec-tool="hr"]')
btn('[data-rec="rsa@0,90"]')
btn('[data-rec-tool="play"]')
time.sleep(0.6)
p.p.locator('.rc-bar .rc-play').click()
time.sleep(0.3)
check(all(ticked(p, t) for t in ['rec-rsa', 'rec-hr', 'rec-all', 'rec-play']) and not p.js(f"() => !!{RC}.playing"), 'steps: heart rate and breathing, played and stopped')
btn('[data-rec="eeg-alpha"]')
br = p.js(f"() => {RC}.R.blocks[1].start / {RC}.R.fs")
check(ticked(p, 'rec-eeg') and not covered() and p.js(f"() => {RC}.t0") < br < p.js(f"() => {RC}.t0 + {RC}.span"), 'step: the EEG opens with the change from eyes open to eyes closed in view')
btn('[data-rec="eeg-alpha@40,41"]')
free, m = mdrag(40.05, 40.95, 'O1')
bar = p.js("() => document.querySelector('.rc-mbar').innerText")
check(free and ticked(p, 'rec-alpha') and 'Hz' in bar, f'step: the alpha waves of O1 measured with the calipers, 1 s across the screen ({m["dt"]:.2f} s; {bar[:60]!r})')
p.shot('recorder-1366-alpha')
check(not ticked(p, 'rec-padview'), '(the step about the data pad’s file has not ticked by itself)')
btn('[data-rec-tool="padfile"]')
p.wait("() => MG.tutorial.state.tasks['rec-padview']", timeout=20000)
csv = p.js("() => MG.app.fs.get(MG.app.HOME + '/recorder/measurements.csv').text")
kinds = [l.split(',')[2] for l in csv.strip().splitlines()[1:]]
check(kinds[:5] == ['R-R', 'R-R', 'R-R', 'PR', 'QT'], f'step: the data pad’s file opens in Files (and ticks), with what each row is: {kinds}')
btn('[data-rec-r="measurements"]')
p.wait("() => MG.tutorial.state.tasks['rec-script']", timeout=90000)
btn('[data-rec-r="rsa"]')
p.wait("() => MG.tutorial.state.tasks['rec-plot']", timeout=90000)
check(True, 'steps: the scripts for R open in RStudio')


def answer(qid, text):
    q = p.p.locator(f'.q[data-q="{qid}"]')
    q.locator('textarea, input[type=text]').first.fill(text)
    q.locator('button', has_text='Check').first.click()
    time.sleep(0.2)
    return q.inner_text()


check('Correct' in answer('rec-q-rate', '75 bpm'), 'the heart rate question accepts 75')
check('Correct' in answer('rec-q-alpha', '10.5 Hz'), 'the alpha question accepts 10.5')
tasks = [(t, ticked(p, t)) for t in TASKS]
check(len(tasks) == 17 and all(t[1] for t in tasks), f'every step of the chapter has been done at 1366 × 768: {[t for t in tasks if not t[1]]}')
p.js("() => MG.app.showWorkbench('recorder')")
time.sleep(0.4)
p.shot('recorder-chapter')
check(not p.errors, '1366 × 768: no page errors: ' + '; '.join(p.errors[:3]))
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
sd = p.js("() => { const r = document.querySelector('.rc-side').getBoundingClientRect(), b = document.querySelector('.rc-mbar').getBoundingClientRect(); return [r.left, r.right, innerWidth, r.top, b.bottom]; }")
check(sd[0] >= -0.5 and sd[1] <= sd[2] + 0.5 and sd[3] >= sd[4] - 1, f'phone: the data pad fits on the screen, below the readout bar: {sd}')
p.shot('recorder-phone-pad')
cvr = p.js("() => document.querySelector('.rc-cv').getBoundingClientRect().left + 30")
p.p.touchscreen.tap(cvr, y)
time.sleep(0.4)
check(p.js(f"() => {RC}.side.hidden"), 'phone: a tap on the chart closes the data pad that lay over it')
check(not p.errors, 'phone: no page errors: ' + '; '.join(p.errors[:3]))
p.close()
done()
