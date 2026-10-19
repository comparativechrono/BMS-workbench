"""The Organ bath tab (assets/js/organbath.js): the arithmetic of the bath, the model (EC50s, a competitive
antagonist's dose ratio, a partial agonist, an irreversible antagonist), the time course (the plateau, the wash), the
clock, the results and their CSV file, the R script (run in R), pictures, keeping an experiment across a reload, the
chapter's buttons and the steps that tick themselves, and the tab in a narrow pane and on a phone.
Run:  python3 test/t_organbath.py   (screenshots in test/out/organbath-*.png)"""
import time
from h import Page, check, done

OUT = 'organbath-'


def bath_page(**kw):
    p = Page(**kw)
    p.open()
    return p


def show_bath(p):
    p.js("() => MG.app.showWorkbench('bath')")
    p.wait("() => MG.app.bath && MG.app.bath.exp && MG.OrganBath", timeout=60000)
    p.js("() => MG.app.bath.ready")
    time.sleep(0.3)


p = bath_page()
show_bath(p)
check(not p.errors, 'the tab opens without errors: ' + '; '.join(p.errors[:3]))
seed_a = p.js("() => MG.app.bath.exp.seed")
check(p.js("() => !!document.querySelector('#bathRoot .ob-svg') && !!document.querySelector('#bathRoot canvas.ob-cv')"), 'the bath is drawn, and the chart')

# ---------------------------------------------------------------- the arithmetic
r = p.js("""() => { const OB = MG.OrganBath; return {
  after: OB.bathAfter(0, 10, 1e-5, 100), cum: OB.bathAfter(OB.bathAfter(0, 10, 1e-5, 100), 10.1, 1e-5, 100),
  conc: ['1e-7', '10^-7', '3 × 10⁻⁷ M', '100 nM', '0.1 µM', '60 mM', '1x10^-6'].map((s) => OB.parseConc(s)), kcl: OB.parseConc('60', true),
  vol: ['0.1 mL', '100 µL', '250', '1 ml'].map((s) => OB.parseVol(s)),
  fmt: [OB.fmtC(9.90099e-8), OB.fmtC(1e-7), OB.fmtC(3e-6), OB.fmtC(0.0588, 'mM')] }; }""")
check(abs(r['after'] - 9.90099e-8) < 1e-12, f'100 µL of 10⁻⁵ M into 10 mL gives 9.90 × 10⁻⁸ M ({r["after"]:.5e})')
check(abs(r['cum'] - 1.96078e-7) < 1e-11, f'a second 100 µL adds to it, in the larger volume: 1.96 × 10⁻⁷ M ({r["cum"]:.5e})')
want = [1e-7, 1e-7, 3e-7, 1e-7, 1e-7, 0.06, 1e-6]
check(all(abs(a - b) < b * 1e-9 for a, b in zip(r['conc'], want)), f'concentrations are read as people write them: {r["conc"]}')
check(abs(r['kcl'] - 0.06) < 1e-12, 'a bare number for KCl is mM')
check(r['vol'] == [100, 100, 250, 1000], f'volumes are read in µL or mL: {r["vol"]}')
rc = p.js("() => { const OB = MG.OrganBath; return [OB.parseVol('0,1 mL'), OB.parseVol('1,5'), OB.parseVol('1,000 µL'), OB.parseConc('2,5e-6'), OB.parseConc('0,1 µM'), OB.parseConc('1,5 × 10⁻⁷ M')]; }")
check(rc[:3] == [100, 1.5, 1000] and abs(rc[3] - 2.5e-6) < 1e-15 and abs(rc[4] - 1e-7) < 1e-15 and abs(rc[5] - 1.5e-7) < 1e-15, f'decimal commas are read (0,1 mL; 2,5e-6; 0,1 µM), and 1,000 µL is a thousand: {rc}')
check(r['fmt'] == ['9.9 × 10⁻⁸ M', '10⁻⁷ M', '3 × 10⁻⁶ M', '58.8 mM'], f'concentrations are written as 9.9 × 10⁻⁸ M: {r["fmt"]}')

# the same, in the bath itself
p.js("() => MG.app.bath._setPaused(true)")
p.js("() => MG.app.bath.go('ileum?seed=11')")
time.sleep(0.3)
r = p.js("""async () => { const B = MG.app.bath; await B.do('add acetylcholine 100 µL 1e-5 M');
  const a = B.exp.sim.cb.acetylcholine, V1 = B.exp.sim.V; await B.do('add acetylcholine 0.1 mL 1e-5 M');
  return [a, V1, B.exp.sim.cb.acetylcholine, B.exp.sim.V, document.querySelector('#bathRoot .ob-inbath').textContent]; }""")
check(abs(r[0] - 9.90099e-8) < 1e-12 and abs(r[1] - 10.1) < 1e-9, f'in the bath: 9.90 × 10⁻⁸ M in 10.1 mL ({r[0]:.4e}, {r[1]})')
check(abs(r[2] - 1.96078e-7) < 1e-11 and abs(r[3] - 10.2) < 1e-9, f'a cumulative dose: 1.96 × 10⁻⁷ M in 10.2 mL ({r[2]:.4e}, {r[3]})')
check('10.2' in r[4] and 'ACh' in r[4], f'the side shows what is in the bath ({r[4].strip()[:60]})')
r = p.js("""async () => { const B = MG.app.bath; await B.do('wash'); B._finishWash(); await B.do('add acetylcholine 1e-7'); return [B.exp.sim.cb.acetylcholine, B.exp.events[B.exp.events.length - 1]]; }""")
check(abs(r[0] - 1e-7) < 1e-12, f'“add acetylcholine 1e-7” brings the bath to 10⁻⁷ M ({r[0]:.4e}: {r[1]["v"]:.1f} µL of {r[1]["S"]:g} M)')
r = p.js("""async () => { const B = MG.app.bath; B._finishWash(); B.selDrug.value = 'acetylcholine'; B._drugChanged(); B.selStock.value = '0.00001'; B.inVol.value = '0,1 mL'; B._preview();
  const ok = !B.addBtn.disabled; const n = B.exp.events.length; B.addFromForm(); const ev = B.exp.events[B.exp.events.length - 1];
  await B.do('add acetylcholine 0,1 mL 1e-5 M'); return [ok, B.exp.events.length - n, ev.v, B.exp.events[B.exp.events.length - 1].v]; }""")
check(r == [True, 2, 100, 100], f'a volume typed with a decimal comma (0,1 mL) is added, in the form and in a command: {r}')
r = p.js("""() => { const B = MG.app.bath; B.selDrug.value = 'acetylcholine'; B._drugChanged(); B.selStock.value = '0.01'; B.inVol.value = '3000'; B._preview();
  const bad = [B.addBtn.disabled, B.preview.textContent]; B.inVol.value = '100'; B._preview(); return bad; }""")
check(r[0] and 'overflow' in r[1], f'a volume that would overflow the bath is refused ({r[1][:60]})')

# ---------------------------------------------------------------- the model
r = p.js("""() => { const OB = MG.OrganBath, P = OB.makeParams('ileum', 11, {});
  const ec50 = (d, extra, st) => { const base = OB.steady(P, extra || {}, st), top = OB.steady(P, Object.assign({ [d]: 1 }, extra || {}), st) - base;
    let lo = -12, hi = 0; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (OB.steady(P, Object.assign({ [d]: 10 ** m }, extra || {}), st) - base < top / 2) ? (lo = m) : (hi = m); }
    return { ec: 10 ** ((lo + hi) / 2), top }; };
  const x = P.act.acetylcholine.rec.M3, n = P.n;
  const theory = x.KA / ((2 + x.tau ** n) ** (1 / n) - 1);
  const c = ec50('acetylcholine'), a = ec50('acetylcholine', { atropine: 1e-8 }), b = ec50('acetylcholine', { atropine: 1e-7 });
  const pilo = ec50('pilocarpine'), hist = ec50('histamine', { atropine: 1e-7 }), histc = ec50('histamine');
  const pap = ec50('acetylcholine', { papaverine: 1e-5 });
  return { ec: c.ec, theory, top: c.top, Em: P.Em, KB: P.act.atropine.rec.M3.KB, dr1: a.ec / c.ec, dr2: b.ec / c.ec, top1: a.top, pilo: pilo.top / P.Em,
           hist: hist.ec / histc.ec, pap: pap.top / c.top }; }""")
check(abs(r['ec'] / r['theory'] - 1) < 0.01, f'the EC50 of acetylcholine follows the operational model ({r["ec"]:.3e} M; KA/((2+τⁿ)^(1/n)−1) = {r["theory"]:.3e} M)')
check(6.8 < -__import__('math').log10(r['ec']) < 7.4, f'its pEC50 is about 7.1 ({-__import__("math").log10(r["ec"]):.2f})')
want1, want2 = 1 + 1e-8 / r['KB'], 1 + 1e-7 / r['KB']
check(abs(r['dr1'] / want1 - 1) < 0.02 and abs(r['dr2'] / want2 - 1) < 0.02, f'atropine shifts the curve by the Schild dose ratio 1 + [B]/KB ({r["dr1"]:.2f} for {want1:.2f}; {r["dr2"]:.1f} for {want2:.1f})')
check(abs(r['top1'] / r['top'] - 1) < 0.01, 'and the maximum stays the same (surmountable)')
check(0.4 < r['pilo'] < 0.7, f'pilocarpine is a partial agonist: its maximum is {100 * r["pilo"]:.0f}% of the tissue’s')
check(abs(r['hist'] - 1) < 0.01, f'atropine leaves the curve of histamine where it was (dose ratio {r["hist"]:.3f})')
check(r['pap'] < 0.7, f'papaverine lowers the maximum of acetylcholine (to {100 * r["pap"]:.0f}%): non-competitive')

# the irreversible antagonist (the aorta): receptors lost after phenoxybenzamine is washed out
r = p.js("""async () => { const B = MG.app.bath, OB = MG.OrganBath; await B.go('aorta?seed=5'); B._setPaused(true);
  const P = B.exp.P, max0 = OB.steady(P, { phenylephrine: 1e-4 }), half = OB.steady(P, { phenylephrine: 1e-7 });
  await B.do('add phenoxybenzamine 1e-7; wait 900; wash'); B._finishWash(); await B.do('wait 1500');
  const q = B.exp.sim.q.A1, st = { q: { A1: q } };
  return { q, max0, max1: OB.steady(P, { phenylephrine: 1e-4 }, st), half0: half, half1: OB.steady(P, { phenylephrine: 1e-7 }, st),
    na0: OB.steady(P, { noradrenaline: 1e-4 }), na1: OB.steady(P, { noradrenaline: 1e-4 }, st), left: B.exp.sim.cb.phenoxybenzamine || 0 }; }""")
check(r['q'] < 0.2, f'phenoxybenzamine (10⁻⁷ M, 15 min) inactivates most of the α1-adrenoceptors, which stay lost after washing ({100 * (1 - r["q"]):.0f}% lost)')
check(r['max1'] < 0.8 * r['max0'] and r['half1'] < 0.5 * r['half0'], f'the curve of phenylephrine shifts and its maximum falls ({r["max0"]:.2f} → {r["max1"]:.2f} g)')
check(r['na1'] / r['na0'] > r['max1'] / r['max0'], f'noradrenaline, with more receptor reserve, keeps more of its maximum ({100 * r["na1"] / r["na0"]:.0f}% against {100 * r["max1"] / r["max0"]:.0f}%)')

# ---------------------------------------------------------------- the time course: the plateau and the wash
r = p.js("""async () => { const B = MG.app.bath, OB = MG.OrganBath; await B.go('ileum?seed=11&new=1'); B._setPaused(true);
  await B.do('wait 30'); const E = B.exp, base = E.recent(3);
  await B.do('add acetylcholine 1e-6'); const t0 = E.t; const took = B.plateau(); const top = E.recent(3);
  const expect = OB.steady(E.P, { acetylcholine: E.sim.cb.acetylcholine }) - OB.steady(E.P, {});
  await B.do('wash'); B._finishWash(); await B.do('wait 90');
  const row = E.rows[E.rows.length - 1];
  return { base, top, expect, took, after: E.recent(3), row: { resp: row.ext - row.base, final: row.final, cond: row.condition } }; }""")
check(5 < r['took'] < 120, f'the plateau of the ileum is reached within seconds ({r["took"]:.0f} s)')
check(abs((r['top'] - r['base']) / r['expect'] - 1) < 0.05, f'at the plateau, the contraction is what the model gives ({r["top"] - r["base"]:.3f} g against {r["expect"]:.3f} g)')
check(abs(r['after'] - r['base']) < 0.08, f'washing returns the tension to the baseline ({r["base"]:.3f} → {r["after"]:.3f} g)')
check(r['row']['final'] and abs(r['row']['resp'] - r['expect']) / r['expect'] < 0.07 and r['row']['cond'] == 'control', f'the response is measured when the bath is washed ({r["row"]})')

# ---------------------------------------------------------------- a response is read before the next drug acts on the tissue
r = p.js("""async () => { const B = MG.app.bath; await B.go('ileum?seed=3'); B._setPaused(true);
  await B.do('add acetylcholine 3e-8; plateau'); const E = B.exp, row = E.rows[E.rows.length - 1], alone = row.ext - row.base;
  await B.do('add histamine 1e-6; plateau; wash'); B._finishWash();
  const a = E.rows.find((x) => x.drug === 'acetylcholine'), h = E.rows.find((x) => x.drug === 'histamine');
  return { alone, ach: a.ext - a.base, final: a.final, hist: h ? h.ext - h.base : null, n: E.rows.length }; }""")
check(r['final'] and abs(r['ach'] - r['alone']) < 0.05, f'acetylcholine’s response is measured when histamine is added on top of it, and keeps its size ({r["alone"]:.3f} → {r["ach"]:.3f} g; it used to be recorded as the two together)')
check(r['n'] == 2 and r['hist'] is not None and r['hist'] > 0.3, f'histamine’s response is its own, from where acetylcholine had brought the tension ({r["hist"]:.3f} g)')
r = p.js("""async () => { const B = MG.app.bath; await B.go('aorta?endothelium=off&seed=5'); B._setPaused(true);
  await B.do('add phenylephrine 1e-6; plateau; add acetylcholine 1e-5; plateau'); const E = B.exp; const before = E.pct(E.rows[E.rows.length - 1]);
  await B.do('add nitroprusside 1e-7; plateau; wash'); B._finishWash();
  const a = E.rows.find((x) => x.drug === 'acetylcholine'), n = E.rows.find((x) => x.drug === 'nitroprusside'), pe = E.rows.find((x) => x.drug === 'phenylephrine');
  return { before, ach: E.pct(a), snp: E.pct(n), pe: pe.ext - pe.base, peFinal: pe.final }; }""")
check(r['ach'] < 10 and abs(r['ach'] - r['before']) < 3, f'a ring without endothelium: acetylcholine’s relaxation stays small ({r["ach"]:.0f}%) after nitroprusside relaxes the ring (it used to be recorded as 94%)')
check(r['snp'] > 50, f'and nitroprusside’s relaxation is its own ({r["snp"]:.0f}%)')
check(r['peFinal'] and r['pe'] > 0.5, f'phenylephrine’s contraction was read when acetylcholine was added ({r["pe"]:.2f} g)')

# ---------------------------------------------------------------- every student's tissues are their own
r = p.js("""async () => { const B = MG.app.bath; await B.go('ileum?new=1'); const a = [B.exp.seed, B.exp.P.act.drugX.truth, B.exp.P.Em];
  await B.go('ileum?new=1'); const b = [B.exp.seed, B.exp.P.act.drugX.truth, B.exp.P.Em];
  await B.go('ileum?seed=5'); const c = B.exp.seed; await B.go('ileum?seed=5'); const d = B.exp.seed; return [a, b, c, d]; }""")
check(r[0][0] != r[1][0] and r[0][2] != r[1][2], f'each fresh tissue has a random seed of its own, so its own values ({r[0][0]}, {r[1][0]})')
check(r[2] == 5 and r[3] == 5, 'a seed in the instructions (seed=5) gives everyone the same tissue')

# ---------------------------------------------------------------- the clock
r = p.js("() => { const B = MG.app.bath; B.setSpeed(20); return B.exp.t; }")
time.sleep(2.0)
t2 = p.js("() => MG.app.bath.exp.t")
check(25 < t2 - r < 50, f'at ×20, 2 s of real time is about 40 s of the experiment ({t2 - r:.1f} s)')
p.js("() => MG.app.bath._setPaused(true)")
r = p.js("() => MG.app.bath.exp.t")
time.sleep(0.6)
check(p.js("() => MG.app.bath.exp.t") == r, 'pausing stops the clock')

# ---------------------------------------------------------------- the chapter, as a student does it
ticked = lambda tid: bool(p.js(f"() => !!MG.tutorial.state.tasks['{tid}']"))


def click(sel):
    p.p.locator(sel).first.click()
    time.sleep(0.5)


def answer(qid, text):
    q = p.p.locator(f'.q[data-q="{qid}"]')
    q.locator('textarea, input[type=text]').first.fill(text)
    q.locator('button', has_text='Check').first.click()
    time.sleep(0.2)
    return p.js(f"() => (MG.tutorial.state.answers['{qid}'] || {{}}).correct === true")


p.js("() => MG.app.showChapter('organbath', true)")
time.sleep(0.5)
check(p.js("() => !document.querySelector('#organbath').hidden"), 'the chapter shows')
click('#organbath button[data-bath="ileum"]')
check(ticked('ob-tissue'), 'set it up ticks ob-tissue')
click('#organbath button[data-bath-do="speed 5"]')
check(ticked('ob-speed'), 'the faster clock ticks ob-speed')
p.js("() => MG.app.bath._setPaused(true)")
# a fresh tissue for the curves (the student would carry on with the one set up)
p.js("() => MG.app.bath.go('ileum?new=1&seed=21')")
time.sleep(0.3)
click('#organbath button[data-bath-do="add acetylcholine 1e-8"]')
check(ticked('ob-first'), 'adding acetylcholine ticks ob-first')
click('#organbath button[data-bath-do="plateau"]')
click('#organbath button[data-bath-do="wash"]')
check(ticked('ob-plat'), 'the plateau and the wash measure a response, which ticks ob-plat')
# the rest of the curve, by the form (as the student does it)
for stock, vol in [('1e-06', '300'), ('1e-05', '100'), ('1e-05', '300'), ('0.0001', '100'), ('0.0001', '300')]:
    p.js("async () => { const B = MG.app.bath; B._finishWash(); await B.do('wait 60'); }")
    p.js(f"() => {{ const B = MG.app.bath; B.selDrug.value = 'acetylcholine'; B._drugChanged(); B.selStock.value = String(Number('{stock}')); B.inVol.value = '{vol}'; B._preview(); }}")
    click('#bathRoot .ob-addbtn')
    p.js("() => MG.app.bath.plateau()")
    click('#bathRoot .ob-b-wash')
check(ticked('ob-more'), 'five responses in control tick ob-more')
r = p.js("() => MG.app.bath.exp.rows.filter(r => r.drug === 'acetylcholine').map(r => [r.conc, r.ext - r.base])")
resp = [x[1] for x in r]
check(len(r) == 6 and all(b > a - 0.05 for a, b in zip(resp, resp[1:])), f'the responses grow with the concentration: {[round(x, 2) for x in resp]}')
check(not answer('ob-q-dil', '1e-7'), 'ob-q-dil: 10⁻⁷ M (leaving out the volume added) is marked wrong')
check(p.js("() => /10\\.1 mL/.test(document.querySelector('.q[data-q=ob-q-dil] .q-feedback').textContent)"), 'and the hint says that the bath holds 10.1 mL')
check(answer('ob-q-dil', '99 nM'), 'ob-q-dil: 99 nM')
check(answer('ob-q-dil', '0.099 µM'), 'ob-q-dil: 0.099 µM')
check(answer('ob-q-dil', '9.9 x 10-8'), 'ob-q-dil: 9.9 x 10-8 (typed without superscripts)')
check(answer('ob-q-dil', '9.9 × 10^-8 M'), 'ob-q-dil: 9.9 × 10⁻⁸ M')
click('#organbath button[data-bath-do="antagonist atropine 1e-8"]')
check(ticked('ob-atr'), 'atropine in the washing solution ticks ob-atr')
click('#organbath button[data-bath-do="wait 600"]')
check(ticked('ob-eq'), '10 minutes in atropine tick ob-eq')
for c in ['1e-7', '3e-7', '1e-6', '3e-6', '1e-5', '3e-5', '1e-4']:
    p.js(f"async () => {{ const B = MG.app.bath; B._finishWash(); await B.do('add acetylcholine {c}; plateau; wash'); B._finishWash(); await B.do('wait 60'); }}")
check(ticked('ob-curve2'), 'the curve in atropine ticks ob-curve2')
r = p.js("() => MG.app.bath.exp.rows.filter(r => /atropine/.test(r.condition)).map(r => r.condition)")
check(len(r) == 7 and all(c == 'atropine 1e-8 M' for c in r), f'its responses are marked “atropine 1e-8 M” ({r[:2]})')
p.p.locator('.q[data-q="ob-q-shift"] .mcq label[data-correct] input').first.check()
time.sleep(0.2)
check(p.js("() => (MG.tutorial.state.answers['ob-q-shift'] || {}).correct === true"), 'ob-q-shift: a competitive antagonist')
check(answer('ob-q-pa2', '9.0'), 'ob-q-pa2: 9.0')
p.shot(OUT + 'desktop')

# the results: the CSV file, kept up to date, and saved
csv = p.js("() => { const fs = MG.app.fs, p = MG.app.HOME + '/organbath/' + MG.app.bath.exp.id + '.csv'; return fs.exists(p) ? fs.get(p).text : ''; }")
lines = [l for l in csv.strip().split('\n') if l]
check(lines and lines[0].startswith('experiment,tissue,time_s,drug,role,kind,stock_M,volume_uL,bath_M,log_bath_M,condition,antagonist,antagonist_M'), 'the results are kept in ~/organbath/<tissue>.csv, with a header for R')
check(len(lines) == 14, f'one row for each response (13): {len(lines) - 1}')
check(any(',atropine 1e-8 M,atropine,1e-8,' in l for l in lines), 'the rows in atropine name it and give its concentration')
p.js("() => { window._ev = []; MG.bus.on('bath:export', (d) => window._ev.push(d)); MG.bus.on('bath:capture', (d) => window._ev.push(d)); }")
p.js("() => MG.app.bath.save()")
time.sleep(0.5)
p.js("() => MG.app.bath.capture()")
time.sleep(1.0)
ev = p.js("() => window._ev")
check(any(e.get('format') == 'csv' for e in ev), f'Save CSV saves the file and says so ({ev[:1]})')
png = p.js("() => MG.app.fs.list(MG.app.HOME + '/organbath').map((e) => (typeof e === 'string' ? e : e.name)).filter((n) => /\\.png$/.test(n))")
check(any(e.get('format') == 'png' for e in ev) and png, f'a picture of the chart is saved in ~/organbath ({png})')

# a cursor measurement, by clicking the chart twice
box = p.js("() => { const r = document.querySelector('#bathRoot .ob-chartbody').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
p.js("() => { MG.app.bath.view.end = null; MG.app.bath._drawChart(); }")
p.p.mouse.click(box[0] + box[2] * 0.55, box[1] + box[3] * 0.4)
time.sleep(0.2)
p.p.mouse.click(box[0] + box[2] * 0.75, box[1] + box[3] * 0.4)
time.sleep(0.3)
check(p.js("() => MG.app.bath.cursors.length === 2 && !document.querySelector('#bathRoot .ob-readout').hidden"), 'two clicks on the chart place the cursors and show the change between them')
n0 = p.js("() => MG.app.bath.exp.rows.length")
p.p.locator('#bathRoot .ob-readout button[data-act="keep"]').click()
time.sleep(0.3)
check(p.js("() => MG.app.bath.exp.rows.length") == n0 + 1, 'Add to the results keeps the measurement')

# ---------------------------------------------------------------- R
click('#organbath button[data-bath-r="responses"]')
p.wait("() => MG.app.rstudio && MG.app.rstudio.cur && /organbath/.test(MG.app.rstudio.cur.path || '')", timeout=60000)
check(ticked('ob-script'), 'the script opens in RStudio (ob-script)')
st = ''
for _ in range(360):
    st = p.js("() => { const R = MG.app.rstudio; return R && R.S ? R.S.state : ''; }")
    if st == 'idle':
        break
    time.sleep(0.5)
check(st == 'idle', f'R starts ({st})')
path = p.js("() => MG.app.fs.pretty(MG.app.rstudio.cur.path)")
p.js(f"() => MG.app.rstudio.consoleRun('source(\"{path}\", echo = TRUE)')")
out = ''
for _ in range(240):
    out = p.js("() => document.querySelector('#rsRoot').innerText")
    if 'pA2' in out and ticked('ob-run'):
        break
    time.sleep(0.5)
time.sleep(1)
out = p.js("() => document.querySelector('#rsRoot').innerText")
check('Error' not in out, 'the script runs without errors' + ('' if 'Error' not in out else ': ' + out[out.find('Error'):][:300]))
check(ticked('ob-run'), 'its plots tick ob-run')
import re
m = re.findall(r'atropine\s+1e-08\s+(\d+\.?\d*)\s+(\d+\.\d+)', out)
check(m, 'R works out the dose ratio and the pA2 of atropine')
if m:
    dr, pa2 = float(m[-1][0]), float(m[-1][1])
    KB = p.js("() => MG.app.bath.exp.P.act.atropine.rec.M3.KB")
    check(abs(pa2 + __import__('math').log10(KB)) < 0.25, f'the pA2 from R ({pa2:.2f}) is close to the tissue’s pKB ({-__import__("math").log10(KB):.2f}); dose ratio {dr:.1f}')
p.shot(OUT + 'r')

# ---------------------------------------------------------------- kept across a reload, exactly
p.js("() => MG.app.showWorkbench('bath')")
time.sleep(0.5)
before = p.js("() => { const E = MG.app.bath.exp; return { id: E.id, rows: E.rows.length, n: E.n, t: [E.tr[100], E.tr[E.n - 50], E.tr[E.n - 1]] }; }")
p.js("() => MG.app.bath._persist()")
p.p.reload()
p.wait("window.MG_READY === true", timeout=60000)
show_bath(p)
p.js("() => MG.app.bath._setPaused(true)")
after = p.js(f"() => {{ const E = MG.app.bath.exp; return {{ id: E.id, rows: E.rows.length, n: E.n, t: [E.tr[100], E.tr[{before['n']} - 50], E.tr[{before['n']} - 1]] }}; }}")
check(after['id'] == before['id'] and after['rows'] == before['rows'], f'after a reload the tissue and its results are back ({after["id"]}, {after["rows"]} responses)')
check(after['n'] >= before['n'] and all(abs(a - b) < 1e-6 for a, b in zip(after['t'], before['t'])), 'and its trace is replayed exactly')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ---------------------------------------------------------------- a narrow pane, and the aorta
p = bath_page(width=1100, height=800)
show_bath(p)
p.js("async () => { const B = MG.app.bath; await B.go('aorta?seed=3'); B._setPaused(true); await B.do('add phenylephrine 1e-6; plateau; add acetylcholine 1e-8; plateau; add acetylcholine 1e-7; plateau; add acetylcholine 1e-6; plateau'); }")
time.sleep(0.5)
r = p.js("() => { const top = document.querySelector('#bathRoot .ob-top'), root = document.querySelector('#bathRoot'); return [top.getBoundingClientRect().height, root.scrollWidth, root.clientWidth]; }")
check(r[0] < 46, f'beside the instructions, the toolbar keeps to one row ({r[0]:.0f} px)')
check(r[1] <= r[2] + 1, 'and nothing overflows the pane')
rel = p.js("() => MG.app.bath.exp.rows.filter(r => r.kind === 'relaxation').map(r => Math.round(MG.app.bath.exp.pct(r)))")
check(len(rel) == 3 and rel[0] < rel[1] < rel[2] and rel[2] > 60, f'acetylcholine relaxes a ring with its endothelium: {rel}% of the tone')
p.shot(OUT + 'narrow-aorta')
r = p.js("async () => { const B = MG.app.bath; await B.go('aorta?endothelium=off&seed=3'); B._setPaused(true); await B.do('add phenylephrine 1e-6; plateau; add acetylcholine 1e-6; plateau'); const E = B.exp; return [E.title, E.rows.filter(r => r.kind === 'relaxation').map(r => E.pct(r))]; }")
check('no endothelium' in r[0] and r[1] and r[1][0] < 10, f'without the endothelium it hardly relaxes ({r[1][0]:.0f}%)')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()

# ---------------------------------------------------------------- 1366 × 768 beside the instructions
p = bath_page(width=1366, height=768)
show_bath(p)
check(p.js("() => MG.app.bath.exp.seed") != seed_a, 'another browser starts with another tissue (another seed)')
p.js("async () => { const B = MG.app.bath; B._setPaused(true); await B.do('add acetylcholine 1e-7; plateau; antagonist atropine 1e-8'); B._finishWash(); await B.do('wait 600; add acetylcholine 1e-6; plateau'); }")
time.sleep(0.5)
r = p.js("""() => { const b = document.querySelector('#bathRoot .ob-addbtn').getBoundingClientRect(), s = document.querySelector('#bathRoot .ob-side').getBoundingClientRect();
  return [b.top, b.bottom, s.top, s.bottom, innerHeight]; }""")
check(r[0] >= r[2] and r[1] <= min(r[3], r[4]) + 1, f'at 1366 × 768 beside the instructions, with an antagonist in use, Add to the bath is in view ({r[1]:.0f} ≤ {min(r[3], r[4]):.0f})')
p.shot(OUT + '1366')
p.close()

# ---------------------------------------------------------------- a phone
p = bath_page(width=390, height=844, mobile=True)
p.p.locator('.bench-fab').click()
time.sleep(0.5)
show_bath(p)
p.js("() => MG.app.bath._setPaused(true)")
r = p.js("() => { const root = document.querySelector('#bathRoot'); return [root.scrollWidth, root.clientWidth, document.documentElement.scrollWidth, innerWidth]; }")
check(r[0] <= r[1] + 1 and r[2] <= r[3] + 1, f'on a phone nothing is wider than the screen ({r})')
add = p.p.locator('#bathRoot .ob-addbtn')
add.scroll_into_view_if_needed()
add.tap()
time.sleep(0.4)
check(p.js("() => MG.app.bath.exp.events.filter(e => e.type === 'add').length") == 1, 'tapping Add to the bath adds the drug')
p.p.locator('#bathRoot .ob-b-wash').tap()
time.sleep(0.3)
check(p.js("() => !!MG.app.bath.exp.sim.wash"), 'and tapping Wash washes the bath')
p.p.locator('#bathRoot .ob-chartbody').scroll_into_view_if_needed()
time.sleep(0.2)
box = p.js("() => { const r = document.querySelector('#bathRoot .ob-chartbody').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
check(box[3] >= 220, f'the chart has room ({box[3]:.0f} px high)')
p.p.touchscreen.tap(box[0] + box[2] * 0.4, box[1] + box[3] * 0.4)
time.sleep(0.3)
check(p.js("() => MG.app.bath.cursors.length") == 1, 'a tap on the chart places a cursor')
r = p.js("() => ['.ob-b-help', '.ob-b-about'].map((c) => document.querySelector('#bathRoot ' + c).offsetWidth)")
check(all(w > 0 for w in r), f'on a phone the Help and About buttons are there ({r})')
p.p.locator('#bathRoot .ob-b-help').tap()
time.sleep(0.3)
check(p.js("() => (document.querySelector('.modal h3') || {}).textContent") == 'The organ bath', 'Help opens')
p.p.keyboard.press('Escape')
time.sleep(0.2)
p.p.locator('#bathRoot .ob-b-about').tap()
time.sleep(0.3)
check(p.js("() => (document.querySelector('.modal h3') || {}).textContent") == 'About the organ bath', 'and so does About')
p.p.keyboard.press('Escape')
time.sleep(0.2)
p.p.locator('#bathRoot .ob-b-exp').tap()
time.sleep(0.3)
items = p.js("() => [...document.querySelectorAll('.popmenu button')].map((b) => b.textContent)")
check('How to use the organ bath' in items and 'About the model' in items, 'the Tissue menu has Help and About as well')
p.p.keyboard.press('Escape')
p.js("() => document.querySelector('#bathRoot').scrollTo(0, 0)")
p.shot(OUT + 'phone')
check(not p.errors, 'no page errors: ' + '; '.join(p.errors[:3]))
p.close()
done()
