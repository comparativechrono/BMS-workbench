"""The Circuits tab: building circuits with the mouse, the simulator against hand calculations (Ohm's law, series and
parallel resistance, a voltage divider, an RC circuit, diodes, an RLC circuit, the Windkessel and membrane examples),
circuits that must not break it (a short circuit, a floating part, a current source with no path, a capacitor straight
across a battery), saving and opening, pictures and tables, the events that tick the steps of a practical, the
physiology labels, and the layout at the width of a phone (360 px).
Run:  python3 t_circuit.py"""
import json, math, os, time
from h import Page, check, done, SITE

EX = os.path.join(SITE, 'examples', 'circuits')
p = Page(width=1500, height=950)
p.open()
p.js("() => { window.EV = []; MG.bus.on('*', (d, t) => { if (/^circuit:/.test(t)) window.EV.push([t, d]); }); }")
p.js("() => MG.app.showWorkbench('circuit')")
p.wait("() => MG.app.circuit && MG.app.circuit.sim", timeout=30000)
time.sleep(0.8)
check(not p.errors, 'the tab opens without errors ' + '; '.join(p.errors[:3]))
check(p.js("() => document.querySelectorAll('#circuitRoot .ck-palbtn').length") == 13, 'thirteen parts in the list')
check(p.js("() => MG.app.circuit.doc.title") == 'Ohm’s law', 'the first visit opens the Ohm’s law example')
check(p.js("() => /9.00 mA/.test(document.querySelector('#circuitRoot .ck-labels').textContent)"), 'its ammeter reads 9.00 mA without pressing Run')


def ev(name):
    return [d for t, d in p.js("() => window.EV") if t == name]


def accept_prompt(path=None):
    """the dialog of MG.promptText (Save to my files): type a path, press Save"""
    p.wait("() => document.querySelector('.modal .prompt-input')", timeout=5000)
    if path:
        p.p.fill('.modal .prompt-input', path)
    p.p.click('.modal .prompt-form button[type=submit]')
    time.sleep(0.3)


def screen(gx, gy):
    """the point on the screen of a point of the grid"""
    return p.js("""([gx, gy]) => { const A = MG.app.circuit, r = A.svg.getBoundingClientRect();
      return [r.left + A.view.x + gx * 20 * A.view.s, r.top + A.view.y + gy * 20 * A.view.s]; }""", [gx, gy])


def drag(a, b, steps=8):
    m = p.p.mouse
    m.move(*screen(*a))
    m.down()
    m.move(*screen(*b), steps=steps)
    m.up()
    time.sleep(0.15)


def click(g):
    x, y = screen(*g)
    p.p.mouse.click(x, y)
    time.sleep(0.15)


def palette(t):
    p.p.click(f'#circuitRoot .ck-palbtn[data-type="{t}"]')
    time.sleep(0.1)


def setval(text):
    sel = '#circuitRoot .ck-insp input.ck-val'
    p.p.fill(sel, text)
    p.p.press(sel, 'Enter')
    time.sleep(0.2)


def read(i, what='i'):
    return p.js(f"() => MG.app.circuit.sim.read('{i}').{what}")


def near(a, b, rel=1e-8):
    """equal to within a relative 1e-8 (the simulator puts a tiny conductance, 1e-12 S, from every point to ground)"""
    return abs(a - b) <= rel * max(abs(a), abs(b))


# ---------------------------------------------------------------- 1. Ohm's law, built with the mouse
p.js("() => MG.app.circuit.newCircuit()")
time.sleep(0.3)
p.js("() => { const A = MG.app.circuit; A.view = { x: 80, y: 60, s: 1.2 }; A._applyView(); }")
check(p.js("() => MG.app.circuit.doc.elements.length") == 0, 'New gives an empty circuit')
palette('battery'); drag((2, 9), (2, 4))
palette('resistor'); drag((9, 4), (9, 9))
p.p.click('#circuitRoot .tbtn.tool[title^="Draw wires"]')
drag((2, 4), (9, 4)); drag((2, 9), (9, 9))
p.p.keyboard.press('Escape')
palette('ground'); click((2, 9))
els = p.js("() => MG.app.circuit.doc.elements.map(e => [e.id, e.type, e.x1, e.y1, e.x2, e.y2])")
check(sorted(e[1] for e in els) == ['battery', 'ground', 'resistor', 'wire', 'wire'], 'five parts placed with the mouse: ' + str(els))
# the values, typed in the panel (with SI prefixes)
click((2, 6.5))
check(p.js("() => [...MG.app.circuit.sel][0]") == 'V1', 'clicking the battery selects it')
setval('9')
click((9, 6.5))
setval('1k')
check(p.js("() => MG.app.circuit.byId('R1').value") == 1000, 'typing 1k sets 1000 Ω')
I = read('R1')
check(abs(I - 0.009) < 1e-9, f'Ohm’s law: 9 V / 1 kΩ = 9 mA (got {I})')
# a voltmeter across the resistor, with two more wires
palette('voltmeter'); drag((13, 9), (13, 4))
p.p.click('#circuitRoot .tbtn.tool[title^="Draw wires"]')
drag((9, 4), (13, 4)); drag((9, 9), (13, 9))
p.p.keyboard.press('Escape')
txt = p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"VM1\"]').textContent")
check('9.00 V' in txt, 'the voltmeter across the resistor reads 9.00 V: ' + txt)
m = [d for d in ev('circuit:measure') if d['kind'] == 'voltmeter' and d['id'] == 'VM1']
check(m and abs(m[-1]['value'] - 9) < 1e-6 and m[-1]['units'] == 'V', 'circuit:measure {kind: voltmeter, value: 9, units: V} as soon as it is wired up (no need to Run)')
check(len(ev('circuit:add')) >= 8, 'circuit:add for each part and wire')
time.sleep(0.6)
e = ev('circuit:edit')
check(e and e[-1]['components'].get('voltmeter') == 1 and e[-1]['total'] == 4 and e[-1]['resistor'] == 1 and e[-1]['capacitor'] == 0,
      'circuit:edit counts the components: ' + json.dumps(e[-1] if e else None))
# undo and redo
n0 = p.js("() => MG.app.circuit.doc.elements.length")
click((9, 6.5)); p.p.keyboard.press('Delete')
check(p.js("() => MG.app.circuit.doc.elements.length") == n0 - 1, 'Delete deletes the selected resistor')
p.p.keyboard.press('Control+z')
check(p.js("() => MG.app.circuit.doc.elements.length") == n0 and abs(read('R1') - 0.009) < 1e-9, 'Ctrl+Z brings it back, with its value')
# turning a part: R turns the resistor by 90°
click((9, 6.5)); p.p.keyboard.press('r')
r1 = p.js("() => { const e = MG.app.circuit.byId('R1'); return [e.x1, e.y1, e.x2, e.y2]; }")
check(r1[1] == r1[3], 'R turns the resistor to lie across: ' + str(r1))
p.p.keyboard.press('Control+z')
p.shot('circuit-built')

# ---------------------------------------------------------------- 2. the simulator against hand calculations
def load(doc):
    p.js("(d) => MG.app.circuit.load(d, { quiet: true })", doc)
    time.sleep(0.1)


def W(i, x1, y1, x2, y2):
    return {"id": i, "type": "wire", "x1": x1, "y1": y1, "x2": x2, "y2": y2}


def E(t, i, x1, y1, x2, y2, **k):
    d = {"id": i, "type": t, "x1": x1, "y1": y1, "x2": x2, "y2": y2}
    d.update(k)
    return d


GND = {"id": "GND1", "type": "ground", "x1": 0, "y1": 8, "x2": 0, "y2": 9}
# series: 9 V across 100 Ω + 200 Ω
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=9), E('resistor', 'R1', 0, 0, 6, 0, value=100), E('resistor', 'R2', 6, 0, 12, 0, value=200),
                   W('W1', 12, 0, 12, 8), W('W2', 12, 8, 0, 8), GND]})
check(near(read('R1'), 9 / 300) and near(read('R2'), 9 / 300), f'series: 9 V / (100 + 200) Ω = 30 mA (got {read("R1")})')
# parallel: 6 V across 1 kΩ ∥ 2 kΩ
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=6), W('W1', 0, 0, 10, 0), E('resistor', 'R1', 4, 0, 4, 8, value=1000), E('resistor', 'R2', 10, 0, 10, 8, value=2000),
                   W('W2', 10, 8, 0, 8), GND]})
tot = read('V1')
check(near(tot, 6 / (1000 * 2000 / 3000)), f'parallel: 6 V / (1 kΩ ∥ 2 kΩ) = 9 mA from the battery (got {tot})')
check(near(read('R1'), 0.006) and near(read('R2'), 0.003), 'parallel: the current divides 6 mA and 3 mA')
# the wire currents add up (Kirchhoff): the wire from the battery carries the total
wc = p.js("() => { const s = MG.app.circuit.sim; const m = s.wireCurrents(); return [...m].map(([k, v]) => [s.net.pieces[k].wire.id, s.net.pieces[k].ax, s.net.pieces[k].bx, v]); }")
first = [abs(v) for w, ax, bx, v in wc if w == 'W1' and ax == 0]
check(first and near(first[0], 0.009), 'the wire next to the battery carries the 9 mA total: ' + str(wc[:3]))
# the voltage divider example
p.js("() => MG.app.circuit.open('example:voltage-divider', { force: true })")
p.wait("() => MG.app.circuit.doc.title === 'A voltage divider'")
v = -read('VM1', 'v')
check(near(v, 10 * 5000 / 15000), f'voltage divider: 10 V × 5 kΩ / 15 kΩ = 3.333 V (got {v})')
check('3.33 V' in p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"VM1\"]').textContent"), 'its voltmeter shows 3.33 V')

# RC: close the Charge switch with a click; the capacitor reaches 63.2% of 5 V after one time constant
p.js("() => MG.app.circuit.open('example:rc-circuit', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('Charging')")
time.sleep(0.5)
s1 = p.js("() => { const e = MG.app.circuit.byId('S1'); return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]; }")
click(s1)
check(p.js("() => MG.app.circuit.byId('S1').closed") is True, 'a click closes the Charge switch')
check(not p.js("() => MG.app.circuit.root.classList.contains('insp-open')"), '(and does not slide the panel of properties over the drawing)')
check(ev('circuit:switch') and ev('circuit:switch')[-1]['on'] is True and ev('circuit:switch')[-1]['label'] == 'Charge', 'circuit:switch {id: S1, label: Charge, on: true}')
tau = p.js("() => MG.app.circuit.sim.taus[0]")
check(abs(tau - 1.0) < 1e-6, f'the simulator finds the time constant RC = 1 s (got {tau})')
p.js("() => MG.app.circuit.sim.advance(1.0)")
vc = read('C1', 'v')
check(abs(vc / 5 - (1 - math.exp(-1))) < 0.01, f'after one time constant the capacitor is at {vc / 5 * 100:.2f}% of 5 V (63.2% expected)')
p.js("() => MG.app.circuit.sim.advance(9.0)")
check(abs(read('C1', 'v') - 5) < 0.01, 'after ten time constants it is fully charged')
# running it with the Run button
p.js("() => MG.app.circuit.reset()")
if not p.js("() => MG.app.circuit.byId('S1').closed"):
    click(s1)
p.p.click('#circuitRoot .tbtn.run')
time.sleep(1.6)
p.p.click('#circuitRoot .tbtn.run')
t = p.js("() => MG.app.circuit.sim.t")
check(0.8 < t < 3, f'Run runs the simulation in real time (t = {t:.2f} s after about 1.6 s)')
check(ev('circuit:run') and ev('circuit:run')[-1]['name'].startswith('Charging'), 'circuit:run')
check(p.js("() => MG.app.circuit.rec.t.length") > 50, 'the plot records the traces')
p.shot('circuit-rc')

# a diode lets current through one way only
for model, rev in (('silicon', False), ('silicon', True), ('ideal', False), ('ideal', True)):
    d = E('diode', 'D1', 4, 0, 0, 0, model=model) if rev else E('diode', 'D1', 0, 0, 4, 0, model=model)
    load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=5), d, W('W1', 4, 0, 8, 0), E('resistor', 'R1', 8, 0, 8, 8, value=1000), W('W2', 8, 8, 0, 8), GND]})
    i = read('R1')
    if rev:
        check(abs(i) < 1e-6, f'{model} diode, reversed: it blocks the current ({i:.2e} A)')
    else:
        lo, hi = ((5 - 0.8) / 1000, (5 - 0.5) / 1000) if model == 'silicon' else (4.99e-3, 5.0e-3)
        check(lo <= i <= hi, f'{model} diode, forwards: {i * 1000:.3f} mA')

# a capacitor straight across a battery: no error, it is charged at once
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=5), W('W1', 0, 0, 6, 0), E('capacitor', 'C1', 6, 0, 6, 8, value=1e-6), W('W2', 6, 8, 0, 8), GND]})
check(p.js("() => MG.app.circuit.sim.errors.length") == 0 and abs(read('C1', 'v') - 5) < 1e-6, f'a capacitor straight across a battery is charged at once, without an error ({read("C1", "v"):.3f} V)')
# a series RLC circuit rings at ωd = ω0 √(1 − ζ²), and overshoots to 1 + exp(−ζπ/√(1 − ζ²))
R_, L_, C_ = 10, 0.1, 1e-4
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=1), E('resistor', 'R1', 0, 0, 6, 0, value=R_), E('inductor', 'L1', 6, 0, 12, 0, value=L_),
                   E('capacitor', 'C1', 12, 0, 12, 8, value=C_), W('W2', 12, 8, 0, 8), GND]})
w0 = 1 / math.sqrt(L_ * C_)
zeta = R_ / 2 * math.sqrt(C_ / L_)
Td = 2 * math.pi / (w0 * math.sqrt(1 - zeta ** 2))
peak = 1 + math.exp(-zeta * math.pi / math.sqrt(1 - zeta ** 2))
rlc = p.js("""() => { const s = MG.app.circuit.sim, h = s.dt; const v = [], t = [];
  for (let k = 0; k < 5000; k++) { s.advance(h); v.push(s.read('C1').v); t.push(s.t); }
  const peaks = []; for (let k = 1; k + 1 < v.length; k++) if (v[k] > v[k - 1] && v[k] >= v[k + 1]) peaks.push(k);
  return { dt: h, first: v[peaks[0]], period: t[peaks[1]] - t[peaks[0]] }; }""")
check(abs(rlc['period'] / Td - 1) < 0.01 and abs(rlc['first'] / peak - 1) < 0.01, f'RLC: it rings with a period of {rlc["period"] * 1000:.2f} ms ({Td * 1000:.2f} ms expected) and overshoots to {rlc["first"]:.3f} V ({peak:.3f} V expected)')

# the Windkessel example: the aortic pressure swings between diastolic and systolic, and stays above 0
p.js("() => MG.app.circuit.open('example:windkessel', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('The Windkessel')")
check(p.js("() => MG.app.circuit.doc.mode") == 'physiology', 'the Windkessel example opens with the physiology labels')
pr = p.js("""() => { const s = MG.app.circuit.sim; s.advance(15); let lo = 1e9, hi = -1e9, neg = 0;
  for (let k = 0; k < 2400; k++) { s.advance(0.001); const v = -s.read('VM1').v; lo = Math.min(lo, v); hi = Math.max(hi, v); if (v < 0) neg++; }
  return [lo, hi, neg]; }""")
check(pr[2] == 0 and 60 <= pr[0] <= 90 and 105 <= pr[1] <= 145, f'Windkessel: diastolic {pr[0]:.1f}, systolic {pr[1]:.1f} mmHg, never below 0')
mean_in = p.js("() => { const s = MG.app.circuit.sim; let a = 0, n = 0; for (let k = 0; k < 1600; k++) { s.advance(0.001); a += s.read('I1').i; n++; } return a / n; }")
check(abs(mean_in - 400 * 0.35 * 2 / math.pi) < 3, f'the heart pumps {mean_in:.1f} mL/s on average (about 89 mL/s: 71 mL a beat at 75 a minute)')
lbl = p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"VM1\"]').textContent")
check('mmHg' in lbl, 'the gauge reads in mmHg: ' + lbl)

# the resting potential: the membrane settles at the conductance-weighted average of the reversal potentials
doc = json.load(open(os.path.join(EX, 'resting-potential.circuit.json')))
val = {e['id']: e.get('value') for e in doc['elements']}
gK, gNa = 1 / val['RK'], 1 / val['RNa']
expect = (gK * val['EK'] + gNa * val['ENa']) / (gK + gNa)
p.js("() => MG.app.circuit.open('example:resting-potential', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('The resting')")
vm = p.js("() => { const s = MG.app.circuit.sim; s.advance(0.2); return -s.read('VM1').v; }")
check(abs(vm - expect) < 2e-4, f'resting potential {vm * 1000:.2f} mV = (gK·EK + gNa·ENa)/(gK + gNa) = {expect * 1000:.2f} mV')
# open more Na+ channels: towards E(Na)
p.js("() => MG.app.circuit.toggleSwitch(MG.app.circuit.byId('S1'))")
gNa2 = gNa + 1 / val['RNa2']
expect2 = (gK * val['EK'] + gNa2 * val['ENa']) / (gK + gNa2)
vm2 = p.js("() => { const s = MG.app.circuit.sim; s.advance(0.2); return -s.read('VM1').v; }")
check(abs(vm2 - expect2) < 2e-4, f'with more Na⁺ channels open: {vm2 * 1000:.1f} mV (expected {expect2 * 1000:.1f} mV)')
# the membrane RC example: the time constant is Rm × Cm = 10 ms
p.js("() => MG.app.circuit.open('example:membrane-rc', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('The membrane')")
tau = p.js("() => MG.app.circuit.sim.taus[0]")
check(abs(tau - 0.01) < 1e-6, f'the membrane’s time constant is 10 ms (got {tau * 1000:.3f} ms)')
v63 = p.js("""() => { const s = MG.app.circuit.sim; s.advance(0.05); const v0 = -s.read('VM1').v; s.advance(0.01); return [v0, -s.read('VM1').v]; }""")
check(abs(v63[0] + 0.07) < 1e-4 and abs((v63[1] - v63[0]) / 0.010 - 0.632) < 0.02, f'from rest ({v63[0] * 1000:.1f} mV) the pulse takes it {(v63[1] - v63[0]) * 1000:.2f} mV in one τ (6.32 expected)')

# ---------------------------------------------------------------- 3. errors that must not break it
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=5), W('W1', 0, 0, 0, 8), GND]})
msg = p.js("() => document.querySelector('#circuitRoot .ck-msg.error') && document.querySelector('#circuitRoot .ck-msg.error').textContent")
check(msg and 'short-circuit' in msg, 'a wire across a battery: the short circuit is reported: ' + str(msg))
check(p.js("() => MG.app.circuit.sim.x.every(Number.isFinite)"), 'no NaN in the answer')
p.p.click('#circuitRoot .tbtn.run')
check(p.js("() => MG.app.circuit.running") is False, 'it will not run with a short circuit')
p.js("() => { const A = MG.app.circuit; A.sel = new Set(['W1']); A.deleteSel(); }")
check(not p.js("() => document.querySelector('#circuitRoot .ck-msg.error')"), 'deleting the wire clears the message')
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=5), E('resistor', 'R1', 0, 0, 6, 0, value=10), W('W1', 6, 0, 6, 8), W('W2', 6, 8, 0, 8), GND,
                   E('resistor', 'R9', 20, 0, 26, 0, value=10)]})
msg = p.js("() => [...document.querySelectorAll('#circuitRoot .ck-msg.warn')].map(m => m.textContent).join(' ')")
check('not connected' in msg, 'a resistor on its own: the part that is not connected is reported')
check(abs(read('R1') - 0.5) < 1e-9 and abs(read('R9')) < 1e-9, 'and the rest of the circuit still works (0.5 A)')
load({"elements": [E('battery', 'V1', 0, 8, 0, 0, value=5), E('battery', 'V2', 4, 8, 4, 0, value=3), W('W1', 0, 0, 4, 0), W('W2', 0, 8, 4, 8), GND]})
check(p.js("() => MG.app.circuit.sim.errors.length") > 0, 'two batteries side by side are reported, not solved')
# a current source with an open switch in its path: no path for its current, so it is switched off (not 10⁹ V)
load({"elements": [E('isource', 'I1', 0, 8, 0, 0, value=0.001), E('switch', 'S1', 0, 0, 4, 0), E('resistor', 'R1', 4, 0, 4, 8, value=1000),
                   W('W1', 4, 8, 0, 8), GND]})
msg = p.js("() => [...document.querySelectorAll('#circuitRoot .ck-msg.warn')].map(m => m.textContent).join(' ')")
vs = p.js("() => { const s = MG.app.circuit.sim; return Math.max(...Array.from(s.x).map(Math.abs)); }")
check('no complete path' in msg and vs < 1, f'a current source with an open switch: reported, and no huge voltages (largest {vs:.3g} V)')
p.js("() => MG.app.circuit.toggleSwitch(MG.app.circuit.byId('S1'))")
check(near(read('R1'), 0.001) and not p.js("() => document.querySelector('#circuitRoot .ck-msg.warn')"), 'closing the switch: 1 mA flows through the resistor')

# ---------------------------------------------------------------- 4. files: save, open, pictures, a table
p.js("() => MG.app.circuit.open('example:rc-circuit', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('Charging')")
p.js("() => { MG.app.circuit.save(); }")
accept_prompt('~/circuits/my-rc.circuit.json')
check(p.js("() => MG.app.fs.exists('/home/user/circuits/my-rc.circuit.json')"), 'Save keeps the circuit in ~/circuits')
saved = json.loads(p.js("() => MG.app.fs.get('/home/user/circuits/my-rc.circuit.json').text"))
check(saved['format'] == 'bms-circuit-1' and len(saved['elements']) == 13, 'the file holds the circuit (13 parts)')
check(ev('circuit:save') and ev('circuit:save')[-1]['path'] == '~/circuits/my-rc.circuit.json', 'circuit:save {path}')
p.js("() => MG.app.circuit.newCircuit()")
p.js("() => MG.app.circuit.open('~/circuits/my-rc.circuit.json')")
time.sleep(0.3)
check(p.js("() => MG.app.circuit.doc.elements.length") == 13 and p.js("() => MG.app.circuit.path") == '/home/user/circuits/my-rc.circuit.json', 'it opens again from the file')
check(ev('circuit:open') and ev('circuit:open')[-1]['path'] == '~/circuits/my-rc.circuit.json', 'circuit:open {path}')
# a picture, as PNG and as SVG
p.js("() => { MG.app.circuit.exportPicture('png', true); }")
accept_prompt()
png = p.js("async () => { const b = await MG.app.fs.readBytes('/home/user/circuits/charging-and-discharging-a-capacitor.png'); return Array.from(b.slice(0, 8)); }")
check(png[:4] == [137, 80, 78, 71], 'the PNG picture is saved in ~/circuits')
p.js("() => { MG.app.circuit.exportPicture('svg', true); }")
accept_prompt()
svg = p.js("() => MG.app.fs.get('/home/user/circuits/charging-and-discharging-a-capacitor.svg').blob.text()")
check(svg.startswith('<svg') and 'C1' in svg and 'Charge' in svg, 'the SVG drawing is saved, with the names of the parts')
# a table of the traces (for R)
p.js("() => { const A = MG.app.circuit; A.toggleSwitch(A.byId('S1')); A.sim.advance(2); }")
p.js("() => { MG.app.circuit.exportCSV(); }")
accept_prompt()
csv = p.js("() => MG.app.fs.get('/home/user/circuits/charging-and-discharging-a-capacitor-run.csv').text")
lines = csv.strip().split('\n')
check(lines[0].startswith('"time_s","Voltage across C1 (V)"') and len(lines) > 100, f'the CSV has time and one column per trace ({len(lines)} lines): {lines[0][:80]}')
last = [float(x) for x in lines[-1].split(',')[:2]]
check(abs(last[1] - 5 * (1 - math.exp(-last[0]))) < 0.05, f'its last row agrees with 5(1 − e^(−t/τ)): t = {last[0]:.2f}, V = {last[1]:.3f}')
fmts = sorted(set(d['format'] for d in ev('circuit:export')))
check(fmts == ['csv', 'png', 'svg'], 'circuit:export for png, svg and csv: ' + str(fmts))
# traces from the Plot tool: click a part, choose from the menu
p.js("() => MG.app.circuit.open('example:ohms-law', { force: true })")
p.wait("() => MG.app.circuit.doc.title === 'Ohm’s law'")
time.sleep(0.4)
p.p.click('#circuitRoot .tbtn.tool[title^="Click a component"]')
r1 = p.js("() => { const e = MG.app.circuit.byId('R1'); return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]; }")
click(r1)
p.wait("() => document.querySelector('.popmenu')", timeout=3000)
p.p.click('.popmenu button:nth-child(2)')
time.sleep(0.2)
check(p.js("() => MG.app.circuit.doc.traces.map(t => t.kind + ':' + t.id).join()") == 'i:R1', 'the Plot tool adds the current through R1')
m = [d for d in ev('circuit:measure') if d['kind'] == 'trace']
check(m and abs(m[-1]['value'] - 0.009) < 1e-9 and m[-1]['units'] == 'A', 'circuit:measure {kind: trace, value: 0.009, units: A}')
p.p.keyboard.press('Escape')
p.js("() => MG.app.circuit.run()")
time.sleep(1.2)
p.js("() => MG.app.circuit.pause()")
m = [d for d in ev('circuit:measure') if d['kind'] == 'ammeter']
check(m and abs(m[-1]['value'] - 0.009) < 1e-9, 'circuit:measure from the ammeter while it runs')

# ---------------------------------------------------------------- 5. the physiology labels
p.p.click('#circuitRoot .ck-seg button[data-mode="physiology"]')
time.sleep(0.2)
pal = p.js("() => [...document.querySelectorAll('#circuitRoot .ck-palbtn span')].map(s => s.textContent)")
check('Pressure source' in pal and 'Valve' in pal and 'Compliance' in pal and 'Flowmeter' in pal, 'Physiology: the parts are renamed: ' + ', '.join(pal[:6]))
check('mL/s' in p.js("() => document.querySelector('#circuitRoot .ck-labels [data-id=\"AM1\"]').textContent"), 'the ammeter becomes a flowmeter in mL/s')
check(ev('circuit:mode') and ev('circuit:mode')[-1]['mode'] == 'physiology', 'circuit:mode')
check(abs(read('R1') - 0.009) < 1e-9, 'the numbers stay the same (only the names and units change)')
p.shot('circuit-physiology')
p.p.click('#circuitRoot .ck-seg button[data-mode="electrical"]')

# ---------------------------------------------------------------- 6. replacing a circuit
# an example with only a value changed is replaced without a question (it can be opened again)…
p.js("() => MG.app.circuit.open('example:voltage-divider', { force: true })")
p.wait("() => MG.app.circuit.doc.title === 'A voltage divider'")
p.js("() => MG.app.circuit.setProp(MG.app.circuit.byId('R2'), 'value', 2000)")
p.js("() => { MG.app.circuit.open('example:ohms-law'); }")
for _ in range(40):  # (the example is fetched: wait for it, or for a question)
    if p.js("() => !!document.querySelector('.modal') || MG.app.circuit.doc.title === 'Ohm’s law'"):
        break
    time.sleep(0.15)
time.sleep(0.2)
check(not p.js("() => !!document.querySelector('.modal')") and p.js("() => MG.app.circuit.doc.title") == 'Ohm’s law', 'an example with a value changed is replaced without asking')
# …but parts added to it are the student's work: asked first, and Cancel keeps it
n = p.js("() => MG.app.circuit.doc.elements.length")
p.js("() => MG.app.circuit.place('resistor', 30, 2, 30, 8)")
p.js("() => { MG.app.circuit.open('example:voltage-divider'); }")
p.wait("() => document.querySelector('.modal [data-x=\"no\"]')", timeout=3000)
check('Replace this circuit?' in p.js("() => document.querySelector('.modal').textContent"), 'with a part added, opening another circuit asks first')
p.p.click('.modal [data-x="no"]')
time.sleep(0.3)
check(p.js("() => MG.app.circuit.doc.title") == 'Ohm’s law' and p.js("() => MG.app.circuit.doc.elements.length") == n + 1, 'Cancel keeps the circuit as it was')

# ---------------------------------------------------------------- 7. kept across a reload
p.js("() => MG.app.circuit.open('example:windkessel', { force: true })")
p.wait("() => MG.app.circuit.doc.title.startsWith('The Windkessel')")
time.sleep(0.6)
p.p.reload()
p.wait("() => window.MG_READY === true", timeout=60000)
p.js("() => MG.app.showWorkbench('circuit')")
p.wait("() => MG.app.circuit && MG.app.circuit.doc", timeout=20000)
check(p.js("() => MG.app.circuit.doc.title").startswith('The Windkessel'), 'after a reload the tab opens the circuit it had')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ---------------------------------------------------------------- 8. a phone
q = Page(width=360, height=740)
q.open()
q.js("() => MG.app.showWorkbench('circuit')")
q.wait("() => MG.app.circuit && MG.app.circuit.sim", timeout=30000)
q.js("() => document.body.classList.add('bench-open')")
time.sleep(1.0)
q.js("() => MG.app.circuit.fit()")
time.sleep(0.3)
w = q.js("() => { const R = document.querySelector('#circuitRoot'); return [R.scrollWidth, R.getBoundingClientRect().right]; }")
check(w[0] <= 360 and w[1] <= 360, f'phone (360 px): nothing in the tab sticks out sideways ({w[0]} px wide)')
lay = q.js("""() => { const r = (s) => document.querySelector(s).getBoundingClientRect();
  const pal = r('#circuitRoot .ck-pal'), st = r('#circuitRoot .ck-stage'), run = r('#circuitRoot .tbtn.run');
  return { palW: pal.width, palH: pal.height, stageW: st.width, stageH: st.height, runVisible: run.width > 0 && run.right <= 360 }; }""")
check(lay['palH'] < 110 and lay['stageW'] > 340 and lay['stageH'] > 180 and lay['runVisible'], 'phone: the parts in a strip, the drawing full width, Run visible: ' + json.dumps(lay))
q.shot('circuit-phone')
# a tap on the resistor: its panel slides in over the drawing
xy = q.js("""() => { const A = MG.app.circuit, e = A.byId('R1'), r = A.svg.getBoundingClientRect();
  return [r.left + A.view.x + (e.x1 + e.x2) / 2 * 20 * A.view.s, r.top + A.view.y + (e.y1 + e.y2) / 2 * 20 * A.view.s]; }""")
q.p.mouse.click(*xy)
time.sleep(0.5)
ins = q.js("() => { const r = document.querySelector('#circuitRoot .ck-insp').getBoundingClientRect(); return [r.left, r.right, r.width]; }")
check(q.js("() => [...MG.app.circuit.sel].join()") == 'R1' and ins[1] <= 361 and ins[0] >= 0 and ins[2] > 200, 'phone: a tap on a part slides its panel in over the drawing: ' + str(ins))
q.shot('circuit-phone-panel')
q.p.click('#circuitRoot .ck-inspx')
time.sleep(0.4)
check(q.js("() => document.querySelector('#circuitRoot .ck-insp').getBoundingClientRect().left") >= 360, 'phone: × closes the panel')
# the zoom buttons
s0 = q.js("() => MG.app.circuit.view.s")
q.p.click('#circuitRoot .ck-zoombox button[title="Zoom in"]')
s1 = q.js("() => MG.app.circuit.view.s")
q.p.click('#circuitRoot .ck-zoombox button[title^="Fit"]')
s2 = q.js("() => MG.app.circuit.view.s")
check(s1 > s0 * 1.2 and abs(s2 - s0) < 0.02, f'phone: + zooms in ({s0:.2f} → {s1:.2f}) and Fit fits it again ({s2:.2f})')
check(not q.errors, 'phone: no page errors ' + '; '.join(q.errors[:3]))
q.close()
done()
