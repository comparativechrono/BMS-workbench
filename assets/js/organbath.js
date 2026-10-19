/* =====================================================================
   The Organ bath tab: the pharmacology of isolated tissues. A length of
   guinea-pig ileum, or a ring of rat aorta, hangs in warm, aerated
   physiological salt solution, tied to a force transducer. Drugs are added
   to the bath by volume from stock solutions; the tension that the tissue
   develops is drawn on a chart; the bath is washed out; the responses are
   measured and kept in a table, which R analyses (concentration–response
   curves, EC50, dose ratios, Schild plots).

   It is a teaching simulation, not data from real tissues. The responses
   come from the operational model of agonism (Black & Leff 1983), with the
   ligands of a receptor competing for it (competitive antagonism: Gaddum,
   Schild), receptors lost to an irreversible antagonist (Furchgott), partial
   agonists, antagonism beyond the receptors (a relaxant, a Ca²⁺-channel
   blocker), the endothelium's nitric oxide, first-order kinetics of onset
   and offset, noise and drift, and small differences between tissues (made
   from a seed, so that a tissue is the same each time it is replayed).
   build/organbath/README.md gives the model and where its values come from.

   new MG.OrganBathApp(root, { fs })   built by page.js when the tab is first shown
     .ready             a promise: the tab has set up the tissue it had last time (or a guinea-pig ileum)
     .shown(opts)       the tab is shown (or resized)
     .go(spec)          set up a tissue:
                          'ileum'                  the guinea-pig ileum you were working on (a fresh one if none)
                          'aorta'                  the same, for a ring of rat aorta
                          'aorta?endothelium=off'  a ring whose endothelium was rubbed off
                          'ileum?new=1'            always a fresh tissue
                          'ileum?seed=3'           a fresh tissue made from this seed (the same for everyone)
                          'ileum?volume=20'        the bath's volume, in mL (10 or 20; 10 if not given)
     .do(cmd)           commands, several separated by ';':
                          'add acetylcholine 1e-7'          add what brings the bath to 10⁻⁷ M (a suitable stock and
                                                            volume are chosen, as a demonstrator would)
                          'add acetylcholine 0.1 mL 1e-5 M' add 0.1 mL (or '100 µL') of a 10⁻⁵ M stock
                          'add kcl 60 mM'                   (KCl is given in mM)
                          'antagonist atropine 1e-8'        put the antagonist in the solution used for washing, and
                                                            wash the bath with it three times ('antagonist none':
                                                            plain solution again)
                          'wash'  'wash 2'                  wash the bath out (3 times if no number is given)
                          'speed 1|5|20'  'pause'  'play'   the clock
                          'wait 60'                         let 60 s of the experiment go by at once
                          'plateau'                         run on until the response settles
                          'fresh'                           a fresh tissue of the same kind
                          'results'  'save'  'capture'      show the results; save them (CSV); save a picture
                          'zoom 600'  'units g|mN'          600 s of the chart at a time; the units of tension
     .toR(what)         'responses': save the results and open, in RStudio, a script that analyses them
   MG.OrganBath         the model on its own, for tests: { TISSUES, DRUGS, makeParams, model, steady, Sim, Experiment,
                        fmtC, parseConc, parseVol, bathAfter, rScript }

   Events on MG.bus (for the steps of a practical that tick themselves):
     bath:setup      {tissue, id, endothelium, volume, seed}
     bath:add        {drug, name, conc, logc, volume, stock, bath, role, kind, condition}
                     conc: the drug's concentration in the bath afterwards (M); volume: what was added (µL); stock (M);
                     bath: the bath's volume (mL); role: 'agonist' or 'modulator'; kind: 'contraction' or 'relaxation'
     bath:wash       {n, solution}
     bath:antagonist {drug, conc}                 the washing solution holds this antagonist now ('none': plain)
     bath:response   {drug, conc, logc, response, pct, kind, condition, n, id}
                     an agonist's response was measured (when the bath is washed, or the next dose of the same drug is
                     added): response in g; pct: as a % of the largest contraction so far (for a relaxation: the % of
                     the tone that relaxed); condition: 'control', or the antagonists in the bath ('atropine 1e-8 M');
                     n: how many responses to this drug have been measured in this condition
     bath:speed      {x}          bath:plateau {t}          bath:wait {s}          bath:measure {dt, dy}   (the cursors)
     bath:equilibrated {drug, conc, minutes}      an antagonist (or other drug that is not an agonist) has been in the
                                                  bath for 10 minutes
     bath:export     {path, format}               the results (csv) or a picture (png) saved in the user's files
     bath:capture    {path}                       a picture of the chart saved
     bath:r          {path}                       the R script opened in RStudio
   For example, in a chapter: data-auto="bath:response drug=acetylcholine condition=control n>4".
   ===================================================================== */
(function () {
  'use strict';
  const MG = (window.MG = window.MG || {});
  const { h, esc, bus, toast, store } = MG;
  const HOME = () => (MG.app && MG.app.HOME) || '/home/user';

  const H = 0.05; // the simulation's step (s)
  const REC = 2; // a sample of the tension every REC steps
  const DT = H * REC; // the time between two samples (s): 10 samples a second
  const GF = 9.80665; // mN in a gram-force
  const RESID = 0.02; // the part of the bath's fluid left behind when it is drained
  const SPARE = 3; // mL: how much the bath can take above its volume before it overflows

  const OWN_ICONS = {
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    drop: '<path d="M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z"/><path d="M9.6 14.4a2.6 2.6 0 0 0 2.3 2.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    cursor: '<path d="M7 4v16M17 4v16"/><path d="M7 12h10"/>'
  };
  const ic = (n) => (OWN_ICONS[n] ? `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${OWN_ICONS[n]}</svg>` : MG.icon(n));

  /* =================================================================
     Numbers and words
     ================================================================= */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const UNSUP = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const sup = (n) => String(n).replace(/[-0-9]/g, (ch) => SUP[ch]);
  /** a concentration: '9.9 × 10⁻⁸ M', '10⁻⁷ M' (unit 'mM', for KCl: '58.8 mM'); compact: '3×10⁻⁷' */
  function fmtC(c, unit = 'M', compact = false) {
    if (!(c > 0)) return '0' + (compact ? '' : ' ' + unit);
    if (unit === 'mM') {
      const mm = c * 1000;
      return (mm >= 100 ? mm.toFixed(0) : mm >= 10 ? mm.toFixed(1) : mm.toPrecision(2)) + (compact ? '' : ' mM');
    }
    let e = Math.floor(Math.log10(c) + 1e-9);
    let m = c / Math.pow(10, e);
    if (m >= 9.95) {
      m /= 10;
      e += 1;
    }
    const whole = Math.abs(m - Math.round(m)) < 0.005;
    const ms = whole && Math.round(m) === 1 ? '' : (whole ? String(Math.round(m)) : m.toFixed(1)) + (compact ? '×' : ' × ');
    return ms + '10' + sup(e) + (compact ? '' : ' M');
  }
  /** a concentration typed by a person: '1e-7', '10^-7', '3 × 10⁻⁷ M', '100 nM', '0.1 µM', '60 mM' → M. A bare number
      is taken as mM when mM is true (KCl). NaN if it can't be read. */
  function parseConc(text, mM) {
    let s = String(text == null ? '' : text).trim().toLowerCase();
    s = s.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + [...m].map((ch) => UNSUP[ch]).join(''));
    s = s.replace(/[×*]/g, 'x').replace(/[µμ]/g, 'u').replace(/\s+/g, '').replace(/−/g, '-');
    s = s.replace(/^10\^/, '1x10^').replace(/molar$|mol\/l$|mol\/litre$/, 'm');
    const m = /^(\d*\.?\d+(?:e[-+]?\d+)?)(?:x10\^?([-+]?\d+))?(pm|nm|um|mm|m)?$/.exec(s);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    if (m[2] != null) v *= Math.pow(10, parseInt(m[2], 10));
    const u = m[3];
    if (u) v *= { pm: 1e-12, nm: 1e-9, um: 1e-6, mm: 1e-3, m: 1 }[u];
    else if (mM && m[2] == null && !/e/.test(m[1])) v *= 1e-3;
    return v;
  }
  /** a volume typed by a person: '100', '100 µL', '0.1 mL' → µL (NaN if it can't be read) */
  function parseVol(text) {
    const s = String(text == null ? '' : text).trim().toLowerCase().replace(/[µμ]/g, 'u').replace(/\s+/g, '');
    const m = /^(\d*\.?\d+)(ul|ml|l)?$/.exec(s);
    if (!m) return NaN;
    const v = parseFloat(m[1]);
    return m[2] === 'ml' ? v * 1000 : m[2] === 'l' ? v * 1e6 : v;
  }
  /** the concentration in the bath after adding vUL µL of a stock S (M) to V mL that held cur (M) */
  const bathAfter = (cur, V, S, vUL) => (cur * V + S * (vUL / 1000)) / (V + vUL / 1000);
  const fmtV = (uL) => (uL >= 1000 ? (uL / 1000).toFixed(uL % 100 ? 2 : 1).replace(/\.?0+$/, '') + ' mL' : (Math.abs(uL - Math.round(uL)) < 0.05 ? String(Math.round(uL)) : uL.toFixed(1)) + ' µL');
  function fmtT(s, tenths) {
    const neg = s < 0;
    s = Math.abs(s);
    const whole = Math.floor(s + 1e-6);
    const hh = Math.floor(whole / 3600), mm = Math.floor((whole % 3600) / 60), ss = whole % 60;
    const tail = tenths ? '.' + Math.floor((s - whole) * 10 + 1e-6) : '';
    return (neg ? '−' : '') + (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0') + tail;
  }
  const rnum = (x, p = 4) => (Number.isFinite(x) ? String(Number(x.toPrecision(p))) : 'NA');
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fracOf = (c, k, nh = 1) => (c > 0 ? 1 / (1 + Math.pow(k / c, nh)) : 0);

  /* a seeded random number generator (mulberry32), a normal deviate and a hash of a string */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  function hash(s) {
    let x = 2166136261;
    for (const ch of String(s)) {
      x ^= ch.charCodeAt(0);
      x = Math.imul(x, 16777619);
    }
    return x >>> 0;
  }

  /* =================================================================
     The drugs and the tissues
     ================================================================= */
  const DRUGS = {
    acetylcholine: { name: 'Acetylcholine', short: 'ACh', what: 'the transmitter of parasympathetic nerves: an agonist at muscarinic (and nicotinic) receptors. Cholinesterase in the tissue breaks it down.' },
    carbachol: { name: 'Carbachol', short: 'CCh', what: 'a muscarinic agonist that cholinesterase does not break down.' },
    histamine: { name: 'Histamine', short: 'Hist', what: 'an agonist at histamine receptors: H1 receptors contract the ileum.' },
    pilocarpine: { name: 'Pilocarpine', short: 'Pilo', what: 'an agonist at muscarinic receptors – a partial agonist in the ileum.' },
    nicotine: { name: 'Nicotine', short: 'Nic', what: 'an agonist at nicotinic receptors. In the ileum it excites the neurones of the enteric ganglia, which release acetylcholine onto the muscle. Its receptors desensitise: leave about 10 minutes between doses.' },
    kcl: { name: 'Potassium chloride', short: 'KCl', unit: 'mM', what: 'raises the K⁺ of the bath: the muscle depolarises, its voltage-gated Ca²⁺ channels open, and it contracts – without any receptor.' },
    atropine: { name: 'Atropine', short: 'Atr', what: 'a competitive antagonist at muscarinic receptors.' },
    mepyramine: { name: 'Mepyramine', short: 'Mep', what: 'a competitive antagonist at histamine H1 receptors (an antihistamine).' },
    hexamethonium: { name: 'Hexamethonium', short: 'Hex', what: 'blocks the nicotinic receptors of autonomic ganglia.' },
    papaverine: { name: 'Papaverine', short: 'Pap', what: 'relaxes smooth muscle whatever makes it contract (it inhibits phosphodiesterases).' },
    neostigmine: { name: 'Neostigmine', short: 'Neo', what: 'inhibits cholinesterase, the enzyme that breaks down acetylcholine.' },
    drugX: { name: 'Drug X', short: 'X', unknown: true, what: 'an unknown drug. Find out what it does, and where.' },
    drugY: { name: 'Drug Y', short: 'Y', unknown: true, what: 'another unknown drug. Find out what it does, and where.' },
    phenylephrine: { name: 'Phenylephrine', short: 'PE', what: 'an agonist at α1-adrenoceptors.' },
    noradrenaline: { name: 'Noradrenaline', short: 'NA', what: 'the transmitter of sympathetic nerves: an agonist at α1-adrenoceptors of the aorta (and at others).' },
    nitroprusside: { name: 'Sodium nitroprusside', short: 'SNP', what: 'releases nitric oxide (NO), which relaxes the smooth muscle directly, with or without the endothelium.' },
    prazosin: { name: 'Prazosin', short: 'Praz', what: 'a competitive antagonist at α1-adrenoceptors.' },
    phenoxybenzamine: { name: 'Phenoxybenzamine', short: 'PBZ', what: 'binds α-adrenoceptors covalently: an irreversible antagonist. The receptors it inactivates stay lost after it is washed out.' },
    lname: { name: 'L-NAME', short: 'L-NAME', what: 'inhibits nitric oxide synthase, so that the endothelium cannot make NO.' },
    nifedipine: { name: 'Nifedipine', short: 'Nif', what: 'blocks L-type voltage-gated Ca²⁺ channels.' }
  };
  const ALIAS = {};
  for (const [id, d] of Object.entries(DRUGS)) {
    ALIAS[id.toLowerCase()] = id;
    ALIAS[d.name.toLowerCase()] = id;
    ALIAS[d.short.toLowerCase()] = id;
  }
  Object.assign(ALIAS, { 'drug x': 'drugX', 'unknown x': 'drugX', x: 'drugX', 'drug y': 'drugY', 'unknown y': 'drugY', y: 'drugY', 'nitroprusside': 'nitroprusside', norepinephrine: 'noradrenaline', ne: 'noradrenaline', pyrilamine: 'mepyramine', 'c6': 'hexamethonium', k: 'kcl', 'potassium': 'kcl', 'l-name': 'lname' });
  const unitOf = (d) => (DRUGS[d] && DRUGS[d].unit) || 'M';
  /** a drug's name as it goes into a sentence, a condition or the CSV: 'atropine', 'L-NAME', 'drug X' */
  const lc = (d) => (d === 'lname' ? 'L-NAME' : DRUGS[d].unknown ? DRUGS[d].name.replace(/^Drug/, 'drug') : DRUGS[d].name.toLowerCase());

  /* the stock solutions on the bench */
  const STOCKS_M = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8];
  const STOCKS_KCL = [4, 3, 2, 1, 0.5];
  const stocksFor = (d) => (unitOf(d) === 'mM' ? STOCKS_KCL : STOCKS_M);
  const fmtStock = (S, d) => (unitOf(d) === 'mM' ? String(S) + ' M' : fmtC(S));

  /* The tissues. For each drug: kind (an agonist's response: 'contraction' or 'relaxation'; drugs without one are
     antagonists or other modulators); rec: what it does at each receptor (pKA and tau, the operational model's affinity
     and efficacy, for an agonist; pKB for an antagonist); kOn, kOff: how fast it reaches and leaves the receptors (1/s);
     and its other actions (che: broken down by cholinesterase; kcl: depolarisation; relax: a relaxant beyond the
     receptors; ache: an anticholinesterase; irrev: inactivates the receptors it occupies (1/s); no: an NO donor; nos: an
     inhibitor of NO synthase; ccb: a Ca²⁺-channel blocker; nblock: blocks the channels of the neurones' nicotinic
     receptors, which no amount of agonist overcomes). stock: the stock first offered. The values are typical
     ones for these tissues, rounded (build/organbath/README.md). */
  const TISSUES = {
    ileum: {
      name: 'Guinea-pig ileum', short: 'Ileum', prep: 'a 2 cm length of guinea-pig ileum, hung from a force transducer under a resting tension of about 1 g',
      solution: 'Tyrode’s solution', gas: 'air', temp: 37,
      volume: 10, rest: 1.0, Em: 3.0, n: 1.2,
      kOn: 1 / 3, kOff: 1 / 7, tauUp: 2.2, tauDown: 4.5, artefact: 0.04,
      spont: 0.035, noise: 0.004, drift: 0.0012, driftTau: 300, relaxTo: 0.88, relaxTau: 1500, smooth: 3.2,
      basal: 1e-9, releaseMax: 2e-7, desens: { kd: 0.08, kr: 1 / 240 },
      span: 240, maxSkip: 600, speed: 1, first: 'acetylcholine',
      recs: { M3: 'contract', H1: 'contract', Nn: 'neural' },
      recNames: { M3: 'muscarinic (M3) receptors of the muscle', H1: 'histamine H1 receptors of the muscle', Nn: 'nicotinic receptors of the enteric neurones' },
      act: {
        acetylcholine: { kind: 'contraction', che: true, rec: { M3: { pKA: 5.5, tau: 40 } }, stock: 1e-6 },
        carbachol: { kind: 'contraction', rec: { M3: { pKA: 5.3, tau: 30 } }, stock: 1e-6 },
        histamine: { kind: 'contraction', rec: { H1: { pKA: 5.0, tau: 40 } }, stock: 1e-5 },
        pilocarpine: { kind: 'contraction', rec: { M3: { pKA: 5.6, tau: 1.2 } }, stock: 1e-4 },
        nicotine: { kind: 'contraction', rec: { Nn: { pKA: 4.7, tau: 3 } }, kOn: 1 / 2, kOff: 1 / 5, stock: 1e-3 },
        kcl: { kind: 'contraction', kcl: { ec50: 0.032, nH: 4, max: 0.85, k0: 0.0027 }, stock: 2 },
        atropine: { rec: { M3: { pKB: 9.0 } }, kOn: 1 / 90, kOff: 1 / 500, stock: 1e-6 },
        mepyramine: { rec: { H1: { pKB: 9.3 } }, kOn: 1 / 90, kOff: 1 / 400, stock: 1e-6 },
        hexamethonium: { nblock: { pIC50: 5.0 }, kOn: 1 / 20, kOff: 1 / 30, stock: 1e-2 },
        papaverine: { relax: { pIC50: 5.0, h: 1.2, imax: 1 }, kOn: 1 / 30, kOff: 1 / 60, stock: 1e-3 },
        neostigmine: { ache: { pIC50: 7.5, gmax: 8 }, kOn: 1 / 30, kOff: 1 / 120, stock: 1e-5 },
        drugX: { unknown: 'X', stock: 1e-5 },
        drugY: { unknown: 'Y', stock: 1e-4 }
      }
    },
    aorta: {
      name: 'Rat aorta', short: 'Aorta', prep: 'a 3 mm ring of rat thoracic aorta, hung on two wire hooks under a resting tension of about 2 g',
      solution: 'Krebs–Henseleit solution', gas: '95% O₂ + 5% CO₂', temp: 37,
      volume: 10, rest: 2.0, Em: 1.8, n: 1.3,
      kOn: 1 / 45, kOff: 1 / 240, tauUp: 30, tauDown: 60, artefact: 0.02,
      spont: 0, noise: 0.0025, drift: 0.0008, driftTau: 600, relaxTo: 0.9, relaxTau: 3000, smooth: 2,
      rmax: 0.9,
      span: 1800, maxSkip: 2400, speed: 20, first: 'phenylephrine',
      recs: { A1: 'contract', M3s: 'contract', M3e: 'endothelium' },
      recNames: { A1: 'α1-adrenoceptors of the muscle', M3s: 'muscarinic receptors of the muscle', M3e: 'muscarinic receptors of the endothelium' },
      act: {
        phenylephrine: { kind: 'contraction', rec: { A1: { pKA: 5.7, tau: 20 } }, stock: 1e-5 },
        noradrenaline: { kind: 'contraction', rec: { A1: { pKA: 6.0, tau: 60 } }, stock: 1e-6 },
        kcl: { kind: 'contraction', kcl: { ec50: 0.028, nH: 4, max: 0.95, k0: 0.0059 }, stock: 2 },
        acetylcholine: { kind: 'relaxation', rec: { M3e: { pKA: 6.3, tau: 10 }, M3s: { pKA: 5.5, tau: 0.6 } }, stock: 1e-5 },
        nitroprusside: { kind: 'relaxation', no: { pEC50: 8.0, h: 1, max: 1 }, kOn: 1 / 30, kOff: 1 / 120, stock: 1e-6 },
        prazosin: { rec: { A1: { pKB: 9.8 } }, kOn: 1 / 120, kOff: 1 / 900, stock: 1e-7 },
        phenoxybenzamine: { rec: { A1: { pKB: 7.5 } }, irrev: { A1: 0.004 }, kOn: 1 / 60, kOff: 1 / 180, stock: 1e-5 },
        atropine: { rec: { M3e: { pKB: 9.0 }, M3s: { pKB: 9.0 } }, kOn: 1 / 90, kOff: 1 / 500, stock: 1e-6 },
        lname: { nos: { pIC50: 5.5 }, kOn: 1 / 120, kOff: 1 / 900, stock: 1e-2 },
        nifedipine: { ccb: { pIC50: 8.5, h: 1, imaxK: 0.95, imaxR: 0.35 }, kOn: 1 / 60, kOff: 1 / 600, stock: 1e-5 }
      }
    }
  };

  /* the unknown drugs of the ileum: what they are depends on the tissue's seed */
  function unknowns(seed) {
    const r = rng(hash('unknowns:' + seed));
    const xRec = r() < 0.6 ? 'M3' : 'H1';
    const xp = Math.round((7.8 + 1.6 * r()) * 10) / 10;
    const X = { rec: { [xRec]: { pKB: xp } }, kOn: 1 / 90, kOff: 1 / 400, stock: 1e-5,
      truth: xRec === 'M3' ? `a competitive antagonist at muscarinic receptors (pK<sub>B</sub> ${xp.toFixed(1)}), like atropine: it shifts the curves of acetylcholine and carbachol to the right, in parallel, but not those of histamine` : `a competitive antagonist at histamine H1 receptors (pK<sub>B</sub> ${xp.toFixed(1)}), like mepyramine: it shifts the curve of histamine to the right, in parallel, but not those of acetylcholine` };
    const kinds = ['relaxant', 'ganglion', 'agonistH1', 'partialM3'];
    const yk = kinds[Math.floor(r() * kinds.length)];
    let Y;
    if (yk === 'relaxant') {
      const p = Math.round((4.8 + 0.8 * r()) * 10) / 10;
      Y = { relax: { pIC50: p, h: 1.2, imax: 1 }, kOn: 1 / 30, kOff: 1 / 60, truth: `a relaxant that acts beyond the receptors, like papaverine (pIC<sub>50</sub> ${p.toFixed(1)}): it lowers the maximum of every curve, whatever the agonist – non-competitive (functional) antagonism` };
    } else if (yk === 'ganglion') {
      const p = Math.round((4.8 + 0.8 * r()) * 10) / 10;
      Y = { nblock: { pIC50: p }, kOn: 1 / 20, kOff: 1 / 30, truth: `a blocker of the nicotinic receptors of the ganglia, like hexamethonium (pK<sub>B</sub> ${p.toFixed(1)}): it blocks the responses to nicotine, but not those to acetylcholine or histamine` };
    } else if (yk === 'agonistH1') {
      const p = Math.round((4.6 + 0.8 * r()) * 10) / 10;
      Y = { kind: 'contraction', rec: { H1: { pKA: p, tau: 30 } }, truth: `an agonist at histamine H1 receptors, like histamine: it contracts the ileum; mepyramine blocks it and atropine doesn't` };
    } else {
      Y = { kind: 'contraction', rec: { M3: { pKA: 5.4, tau: 1.0 + r() } }, truth: 'a partial agonist at muscarinic receptors, like pilocarpine: its largest response is smaller than acetylcholine’s; atropine blocks it and mepyramine doesn’t' };
    }
    Y.stock = 1e-4;
    Y.unknownKind = yk;
    return { drugX: X, drugY: Y };
  }

  /** the parameters of one tissue: the tissue's typical values, varied a little (from its seed) */
  function makeParams(type, seed, opts = {}) {
    const T = TISSUES[type];
    if (!T) throw new Error('There is no tissue called ' + type + '.');
    const r = rng(hash(type + ':' + seed));
    const lv = (sd) => Math.exp(sd * gauss(r));
    const P = {
      type, seed, name: T.name, volume: Number(opts.volume) > 0 ? Number(opts.volume) : T.volume,
      Em: T.Em * lv(0.15), rest: T.rest * lv(0.06), n: T.n, kOn: T.kOn, kOff: T.kOff, tauUp: T.tauUp, tauDown: T.tauDown,
      artefact: T.artefact, spont: T.spont * lv(0.3), noise: T.noise, drift: T.drift, driftTau: T.driftTau, relaxTo: T.relaxTo,
      relaxTau: T.relaxTau, smooth: T.smooth, basal: T.basal || 0, releaseMax: (T.releaseMax || 0) * lv(0.15),
      desens: T.desens || null, recs: T.recs, rmax: T.rmax || 0, endoF: opts.endothelium === false ? 0.003 : 1, act: {}
    };
    for (const [d, a0] of Object.entries(T.act)) {
      if (a0.unknown) continue;
      const a = JSON.parse(JSON.stringify(a0));
      if (a.rec) for (const x of Object.values(a.rec)) {
        if (x.pKA != null) {
          x.pKA += 0.04 * gauss(r);
          x.tau *= lv(0.2);
        }
        if (x.pKB != null) x.pKB += 0.04 * gauss(r);
      }
      P.act[d] = a;
    }
    if (T.act.drugX) Object.assign(P.act, unknowns(seed));
    for (const a of Object.values(P.act)) {
      if (a.rec) for (const x of Object.values(a.rec)) {
        if (x.pKA != null) x.KA = Math.pow(10, -x.pKA);
        if (x.pKB != null) x.KB = Math.pow(10, -x.pKB);
      }
      for (const k of ['relax', 'ache', 'nos', 'ccb', 'nblock']) if (a[k]) a[k].ic50 = Math.pow(10, -a[k].pIC50);
      if (a.no) a.no.ec50 = Math.pow(10, -a.no.pEC50);
    }
    return P;
  }

  /* =================================================================
     The model: from the concentrations at the receptors to the tension
     ================================================================= */
  /** P: a tissue's parameters; c: drug → its concentration at the receptors (M); st: the tissue's state (q: the part of
      each receptor's population that is left; D: how far the nicotinic receptors are desensitised).
      → { active (the active tension, g), inact (receptor → rate at which it is lost, 1/s), occNic, f, S, spont } */
  function model(P, c, st) {
    const A = P.act;
    const C = (d) => c[d] || 0;
    // an anticholinesterase lets more of the acetylcholine reach the receptors
    let g = 1;
    for (const d in A) if (A[d].ache) g *= 1 + (A[d].ache.gmax - 1) * fracOf(C(d), A[d].ache.ic50);
    /* the operational model at one receptor: the ligands compete for it (each with x = [L]/K); the stimulus is the
       sum of each agonist's efficacy × its share of the receptors, times the part of the receptors that is left */
    const at = (rec, release) => {
      let sx = 0, stim = 0;
      const occ = [];
      for (const d in A) {
        const x = A[d].rec && A[d].rec[rec];
        if (!x) continue;
        let cc = C(d);
        if (d === 'acetylcholine' && release) cc += release;
        if (A[d].che) cc *= g;
        if (!(cc > 0)) continue;
        const xi = cc / (x.KA != null ? x.KA : x.KB);
        sx += xi;
        if (x.tau) stim += x.tau * xi;
        occ.push([d, xi]);
      }
      const q = st && st.q && st.q[rec] != null ? st.q[rec] : 1;
      return { S: (q * stim) / (1 + sx), occ: occ.map(([d, xi]) => [d, xi / (1 + sx)]) };
    };
    const out = { inact: {}, occNic: 0 };
    const lose = (rec, r) => {
      for (const [d, o] of r.occ) {
        const k = A[d].irrev && A[d].irrev[rec];
        if (k) out.inact[rec] = (out.inact[rec] || 0) + k * o;
      }
    };
    // the ganglia (the ileum): the neurones' nicotinic receptors make them release acetylcholine onto the muscle
    let release = P.basal || 0;
    if (P.recs.Nn) {
      const nn = at('Nn');
      const s = nn.S * (1 - (st && st.D ? st.D : 0));
      // (a ganglion blocker such as hexamethonium blocks the receptors' channels: more nicotine doesn't overcome it)
      let open = 1;
      for (const d in A) if (A[d].nblock) open *= 1 - fracOf(C(d), A[d].nblock.ic50);
      release += P.releaseMax * (s / (1 + s)) * open;
      out.occNic = nn.occ.filter(([d]) => A[d].rec.Nn.tau).reduce((a, [, o]) => a + o, 0);
      lose('Nn', nn);
    }
    let S = 0, Se = 0;
    for (const [rec, role] of Object.entries(P.recs)) {
      if (role === 'neural') continue;
      const r = at(rec, release);
      if (role === 'contract') S += r.S;
      else if (role === 'endothelium') Se += r.S;
      lose(rec, r);
    }
    // K⁺ (KCl): depolarisation, a stimulus that bypasses the receptors
    let SK = 0;
    for (const d in A) if (A[d].kcl) {
      const z = A[d].kcl;
      const f = z.max * fracOf(z.k0 + C(d), z.ec50, z.nH);
      SK += Math.pow(f / (1 - f), 1 / P.n);
    }
    // a Ca²⁺-channel blocker cuts the entry of Ca²⁺: nearly all of the K⁺ contraction, part of the receptors'
    for (const d in A) if (A[d].ccb) {
      const z = A[d].ccb, b = fracOf(C(d), z.ic50, z.h);
      SK *= 1 - z.imaxK * b;
      S *= 1 - z.imaxR * b;
    }
    S += SK;
    // the stimulus → the response (the operational model's transducer)
    const f = S > 0 ? Math.pow(S, P.n) / (1 + Math.pow(S, P.n)) : 0;
    // relaxants that act beyond the receptors (functional antagonism)
    let m = 1;
    for (const d in A) if (A[d].relax) m *= 1 - A[d].relax.imax * fracOf(C(d), A[d].relax.ic50, A[d].relax.h);
    // nitric oxide: made by the endothelium (acetylcholine), unless NO synthase is blocked; or released by a donor
    let nos = 1;
    for (const d in A) if (A[d].nos) nos *= 1 - fracOf(C(d), A[d].nos.ic50);
    const se = Se * (P.endoF == null ? 1 : P.endoF) * nos;
    let R = P.rmax ? (P.rmax * se) / (1 + se) : 0;
    for (const d in A) if (A[d].no) {
      const z = A[d].no;
      R = 1 - (1 - R) * (1 - z.max * fracOf(C(d), z.ec50, z.h));
    }
    out.S = S;
    out.f = f;
    out.active = P.Em * f * m * (1 - R);
    out.spont = m * (1 - R) * (1 - 0.6 * f);
    return out;
  }
  /** the active tension (g) at equilibrium with these concentrations in the bath (st: the receptors left, as in model) */
  const steady = (P, c, st) => model(P, c, st || {}).active;

  /* =================================================================
     A tissue in its bath, step by step
     ================================================================= */
  class Sim {
    constructor(P, seed) {
      this.P = P;
      this.r = rng(hash('noise:' + seed));
      this.k = 0;
      this.V0 = P.volume;
      this.V = P.volume;
      this.cb = {}; // the bath: drug → concentration (M)
      this.ce = {}; // at the receptors
      this.res = {}; // the solution used for washing (its reservoir)
      this.q = {};
      for (const rec of Object.keys(P.recs)) this.q[rec] = 1;
      this.D = 0;
      this.drift = 0;
      this.level = 1;
      this.art = 0;
      this.wash = null;
      this.washDone = 0;
      this.spx = 0; // the ileum's own small movements (a lightly damped oscillator, driven by noise)
      this.spv = 0;
      this.out = model(P, {}, this);
      this.active = this.out.active;
      this.spMod = this.out.spont;
    }
    get t() {
      return this.k * H;
    }
    /** add vUL µL of a stock S (M) of drug d → the drug's concentration in the bath afterwards */
    add(d, S, vUL) {
      const v = vUL / 1000, V = this.V;
      for (const k of Object.keys(this.cb)) this.cb[k] *= V / (V + v);
      this.cb[d] = (this.cb[d] || 0) + (S * v) / (V + v);
      this.V = V + v;
      return this.cb[d];
    }
    startWash(n) {
      this.wash = { n: Math.max(1, n | 0), i: 0, ph: 'drain', t: 0 };
    }
    _washStep() {
      const w = this.wash, DRAIN = 2.5, FILL = 3.5, P = this.P;
      w.t += H;
      if (w.ph === 'drain') {
        const u = Math.min(1, w.t / DRAIN);
        this.level = Math.max(0.04, 1 - u);
        this.art = P.artefact * u;
        if (w.t >= DRAIN) {
          for (const k of Object.keys(this.cb)) this.cb[k] *= RESID;
          w.ph = 'fill';
          w.t = 0;
        }
      } else {
        const u = Math.min(1, w.t / FILL);
        this.level = Math.min(1, 0.04 + u * 0.96);
        this.art = P.artefact * (1 - u);
        if (w.t >= FILL) {
          for (const [k, c] of Object.entries(this.res)) this.cb[k] = (this.cb[k] || 0) + c * (1 - RESID);
          this.V = this.V0;
          this.level = 1;
          this.art = 0;
          w.i++;
          w.t = 0;
          w.ph = 'drain';
          if (w.i >= w.n) {
            this.wash = null;
            this.washDone++;
          }
        }
      }
    }
    step() {
      const P = this.P;
      if (this.wash) this._washStep();
      // the drugs reach (and leave) the receptors at their own rates
      for (const d of new Set(Object.keys(this.cb).concat(Object.keys(this.ce)))) {
        const cb = this.cb[d] || 0, ce = this.ce[d] || 0;
        if (cb < 1e-18 && ce < 1e-18) {
          delete this.cb[d];
          delete this.ce[d];
          continue;
        }
        const a = P.act[d] || {};
        const k = cb > ce ? a.kOn || P.kOn : a.kOff || P.kOff;
        this.ce[d] = ce + (cb - ce) * (1 - Math.exp(-k * H));
      }
      const o = (this.out = model(P, this.ce, this));
      for (const [rec, k] of Object.entries(o.inact)) this.q[rec] *= Math.exp(-k * H);
      if (P.desens) {
        const z = P.desens;
        this.D = clamp(this.D + (z.kd * o.occNic * (1 - this.D) - z.kr * this.D) * H, 0, 1);
      }
      // the muscle follows (contracting faster than it relaxes)
      const tau = o.active > this.active ? P.tauUp : P.tauDown;
      this.active += (o.active - this.active) * (1 - Math.exp(-H / tau));
      this.spMod += (o.spont - this.spMod) * (1 - Math.exp(-H / 5));
      this.drift += (-this.drift / P.driftTau) * H + P.drift * Math.sqrt(H) * gauss(this.r);
      if (P.spont) {
        // (about 0.3 Hz, irregular; its RMS is spont / √2)
        const w = 6.2832 * 0.3, z = 0.12;
        const sig = (P.spont / Math.SQRT2) * Math.sqrt(4 * z * w * w * w);
        this.spv += (-2 * z * w * this.spv - w * w * this.spx) * H + sig * Math.sqrt(H) * gauss(this.r);
        this.spx += this.spv * H;
      }
      this.k++;
    }
    /** the tension that the transducer measures now (g): the resting tension (which falls a little as the tissue
        relaxes after it was stretched), drift, the active tension, the ileum's own small movements, the wash's
        artefact, and noise. (Called once for each sample: it draws on the tissue's random numbers.) */
    tension() {
      const P = this.P, t = this.t;
      const rest = P.rest * (P.relaxTo + (1 - P.relaxTo) * Math.exp(-t / P.relaxTau));
      return rest + this.drift + this.active + this.spx * this.spMod + this.art + P.noise * gauss(this.r);
    }
    /** has the response settled (the plateau)? */
    settled() {
      const P = this.P, o = this.out;
      if (this.wash) return false;
      if (Math.abs(o.active - this.active) > 0.003 * P.Em) return false;
      if (Math.abs(steady(P, this.cb, this) - o.active) > 0.003 * P.Em) return false;
      if (P.desens && Math.abs(P.desens.kd * o.occNic * (1 - this.D) - P.desens.kr * this.D) > 2e-4) return false;
      return true;
    }
  }

  /* =================================================================
     An experiment: a tissue, what was done to it (a log, which can be
     replayed exactly), its trace and its responses
     ================================================================= */
  class Experiment {
    constructor(def) {
      this.def = def;
      this.id = def.id;
      this.type = def.type;
      this.opts = def.opts || {};
      this.seed = def.seed;
      def.events = def.events || [];
      def.notes = def.notes || {};
      def.excl = def.excl || {};
      this.events = def.events;
      this.notes = def.notes;
      this.excl = def.excl;
      this.T = TISSUES[this.type];
      this.P = makeParams(this.type, this.seed, this.opts);
      this.sim = new Sim(this.P, this.seed);
      this.tr = new Float32Array(1 << 14);
      this.n = 0;
      this.rows = [];
      this.open = {}; // drug → its row whose response is being measured
      this.series = {}; // drug → the start of its curve since the last wash (cumulative doses share a baseline)
      this.marks = []; // additions, washes, changes of the washing solution, for the chart
      this.bands = []; // when each antagonist was in the bath (closed ones)
      this.mods = {}; // the antagonists (and other modulators) in the bath now: drug → { c: nominal, t0 }
      this.lastAdd = null;
      this.lastWash = null;
      this.washSeen = 0;
      this.ei = 0;
      this.onEvent = null;
      this.box = Math.max(3, Math.round(this.P.smooth / DT)); // samples averaged to read a response
      this._sample();
    }
    get t() {
      return this.sim.t;
    }
    get title() {
      const num = (/-(\d+)$/.exec(this.id) || [])[1];
      return `${this.T.name}${num ? ' ' + num : ''}${this.type === 'aorta' && this.opts.endothelium === false ? ' (no endothelium)' : ''}`;
    }
    /** replay the log up to step K (when a kept experiment is opened again) */
    replay(K) {
      this._due();
      while (this.sim.k < K) {
        this._step();
        this._due();
      }
    }
    _due() {
      while (this.ei < this.events.length && this.events[this.ei].k <= this.sim.k) {
        const i = this.ei++;
        this._apply(this.events[i], i, false);
      }
    }
    /** let n steps go by (live) */
    advance(n) {
      for (let i = 0; i < n; i++) this._step();
    }
    _step() {
      this.sim.step();
      if (this.sim.k % REC === 0) this._sample();
      if (this.sim.washDone !== this.washSeen) {
        this.washSeen = this.sim.washDone;
        this._washed();
      }
    }
    _sample() {
      if (this.n >= this.tr.length) {
        const b = new Float32Array(this.tr.length * 2);
        b.set(this.tr);
        this.tr = b;
      }
      this.tr[this.n++] = this.sim.tension();
      // the responses being measured: their largest change so far (on the trace averaged over a few seconds)
      const keys = Object.keys(this.open);
      if (keys.length) {
        const v = this.recent(this.box * DT);
        for (const d of keys) {
          const row = this.open[d];
          if (row.kind === 'contraction') row.ext = Math.max(row.ext, v);
          else row.ext = Math.min(row.ext, v);
        }
      }
    }
    /** the mean tension over the last s seconds */
    recent(s) {
      const k = Math.max(1, Math.min(this.n, Math.round(s / DT)));
      let a = 0;
      for (let i = this.n - k; i < this.n; i++) a += this.tr[i];
      return a / k;
    }
    /** the tension at time t (from the trace) */
    at(t) {
      const i = clamp(Math.round(t / DT), 0, this.n - 1);
      return this.tr[i];
    }
    /** something done now: kept in the log, and done */
    act(ev) {
      this._due();
      ev.k = this.sim.k;
      this.events.push(ev);
      const i = this.events.length - 1;
      this.ei = this.events.length;
      this._apply(ev, i, true);
      return i;
    }
    _apply(ev, i, live) {
      const S = this.sim, t = S.t;
      if (ev.type === 'add') {
        const a = this.P.act[ev.d] || {};
        const conc = S.add(ev.d, ev.S, ev.v);
        this.lastAdd = t;
        if (a.kind) this._openRow(i, ev, conc, live);
        else this._modulator(ev.d, conc, t);
        this.marks.push({ t, type: 'add', d: ev.d, c: conc, S: ev.S, v: ev.v, i });
      } else if (ev.type === 'wash') {
        for (const d of Object.keys(this.open)) this._close(d, live);
        this.series = {};
        S.startWash(ev.n);
        this.lastWash = t;
        this.marks.push({ t, type: 'wash', n: ev.n });
      } else if (ev.type === 'res') {
        if (ev.d === 'none') S.res = {};
        else if (ev.c > 0) S.res[ev.d] = ev.c;
        else delete S.res[ev.d];
        this.marks.push({ t, type: 'res', d: ev.d, c: ev.c });
      } else if (ev.type === 'manual') {
        this.rows.push({ id: i, kind: 'manual', drug: 'manual', t: ev.t1, t2: ev.t2, y1: ev.y1, y2: ev.y2, ext: ev.y2, base: ev.y1, final: true, condition: this._modInfo().label, ant: '', antM: NaN });
      }
    }
    /* the antagonists in the bath: the condition of each response */
    _modulator(d, conc, t) {
      const nominal = Number(conc.toPrecision(3));
      const m = this.mods[d];
      if (m && m.c === nominal) return;
      if (m) this.bands.push({ d, c: m.c, t0: m.t0, t1: t });
      this.mods[d] = { c: nominal, t0: t };
    }
    _washed() {
      const t = this.sim.t, res = this.sim.res;
      for (const d of Object.keys(this.mods)) {
        const m = this.mods[d];
        const keep = res[d] > 0 ? Number(res[d].toPrecision(3)) : null;
        if (keep === m.c) continue;
        this.bands.push({ d, c: m.c, t0: m.t0, t1: t });
        if (keep) this.mods[d] = { c: keep, t0: t };
        else delete this.mods[d];
      }
      for (const [d, c] of Object.entries(res)) if (!this.mods[d] && !(this.P.act[d] || {}).kind) this.mods[d] = { c: Number(c.toPrecision(3)), t0: t };
      if (this.onEvent) this.onEvent('washed', {});
    }
    _modInfo() {
      const ds = Object.keys(this.mods).sort();
      if (!ds.length) return { label: 'control', name: '', c: NaN };
      const label = ds.map((d) => `${lc(d)} ${Number(this.mods[d].c.toPrecision(2)).toExponential().replace('e+', 'e')} M`).join(' + ');
      return { label, name: ds.map((d) => lc(d)).join(' + '), c: ds.length === 1 ? this.mods[ds[0]].c : NaN };
    }
    _openRow(i, ev, conc, live) {
      const d = ev.d, a = this.P.act[d];
      const now = this.recent(this.box * DT);
      if (this.open[d]) this._close(d, live); // the previous step of a cumulative curve
      let ser = this.series[d];
      if (!ser) {
        // a relaxation is measured from the tone just before it, as a % of the tone above the resting tension
        let rest = NaN;
        if (a.kind === 'relaxation') {
          const bases = Object.values(this.series).filter((s) => s.kind === 'contraction').map((s) => s.base);
          rest = bases.length ? Math.min(...bases) : NaN;
        }
        ser = this.series[d] = { base: now, rest, kind: a.kind };
      }
      const mod = this._modInfo();
      const row = { id: i, t: this.sim.t, drug: d, kind: a.kind, S: ev.S, v: ev.v, conc, condition: mod.label, ant: mod.name, antM: mod.c, base: ser.base, rest: ser.rest, ext: now, final: false };
      this.rows.push(row);
      this.open[d] = row;
      if (live && this.onEvent) this.onEvent('row', row);
    }
    _close(d, live) {
      const row = this.open[d];
      if (!row) return;
      delete this.open[d];
      row.final = true;
      if (live && this.onEvent) this.onEvent('response', row);
    }
    /** a row's response: the rise in tension (contraction), the fall (relaxation) or the difference (manual), in g */
    static response(r) {
      return r.kind === 'relaxation' ? r.base - r.ext : r.ext - r.base;
    }
    /** the largest contraction among the responses that are used */
    refMax() {
      let m = 0;
      for (const r of this.rows) if (r.kind === 'contraction' && !this.excl[r.id]) m = Math.max(m, Experiment.response(r));
      return m;
    }
    pct(r) {
      const resp = Experiment.response(r);
      if (r.kind === 'contraction') {
        const m = this.refMax();
        return m > 0 ? (100 * resp) / Math.max(m, resp) : NaN;
      }
      if (r.kind === 'relaxation') return r.base - r.rest > 0.02 ? (100 * resp) / (r.base - r.rest) : NaN;
      return NaN;
    }
    /** let time go by until the response settles, at most maxS seconds → the seconds it took */
    skip(maxS) {
      const max = Math.round(maxS / H);
      let n = 0;
      while (n < max) {
        this._step();
        n++;
        if (n % 20 === 0 && this.sim.settled()) break;
      }
      return n * H;
    }
  }

  /* =================================================================
     The drawing of the bath (SVG)
     ================================================================= */
  function bathSVG(type) {
    const ring = type === 'aorta';
    const bubbles = [0, 1, 2, 3, 4, 5].map((i) => `<circle class="ob-bub" cx="${86 + (i % 3) * 3}" cy="262" r="${1.6 + (i % 2) * 0.7}" style="animation-delay:${(i * 0.42).toFixed(2)}s"/>`).join('');
    const tissue = ring
      ? `<g class="ob-ring"><path class="ob-hook" d="M95 252v-16m-6 0h12"/><path class="ob-hook ob-hooktop" d="M95 196v10m-6-2h12"/><ellipse class="ob-tis" cx="95" cy="216" rx="11" ry="15"/><ellipse class="ob-tisin" cx="95" cy="216" rx="6.5" ry="10.5"/><path class="ob-tie" d="M95 252q-2 8-4 14"/></g>`
      : `<g class="ob-strip"><rect class="ob-tis" x="89" y="170" width="12" height="80" rx="6"/><path class="ob-tisline" d="M91 180h8"/><path class="ob-tie" d="M95 250q-1 8-3 16"/></g>`;
    return `<svg class="ob-svg" viewBox="0 0 232 330" role="img" aria-label="The organ bath: the tissue hangs in the warm, aerated solution, tied by a thread to the force transducer above it">
  <defs><linearGradient id="obGlass" x1="0" x2="1"><stop offset="0" stop-color="#eef7fc"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#e6f2fa"/></linearGradient>
  <linearGradient id="obFluid" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4ecf8"/><stop offset="1" stop-color="#bfe0f2"/></linearGradient></defs>
  <rect class="ob-stand" x="10" y="8" width="7" height="314" rx="2"/><rect class="ob-stand" x="2" y="318" width="64" height="7" rx="2"/>
  <path class="ob-arm" d="M17 27h47"/>
  <g class="ob-trans"><rect x="63" y="12" width="64" height="30" rx="5"/><text x="95" y="25" class="ob-transt">TRANSDUCER</text><text x="95" y="37" class="ob-read">0.00 g</text></g>
  <path class="ob-cable" d="M127 22c18 0 24-10 46-10h58"/>
  <line class="ob-thread" x1="95" y1="42" x2="95" y2="170"/>
  <g class="ob-jacket"><rect x="42" y="74" width="106" height="232" rx="16"/><path class="ob-water" d="M148 96h14M42 286h-14"/></g>
  <rect class="ob-glass" x="55" y="84" width="80" height="212" rx="10" fill="url(#obGlass)"/>
  <rect class="ob-fluid" x="57" y="98" width="76" height="196" rx="8" fill="url(#obFluid)"/>
  <path class="ob-tube" d="M68 48v206q0 12 12 12h12"/>
  <g class="ob-bubbles">${bubbles}</g>
  ${tissue}
  <path class="ob-drain" d="M95 296v14"/><rect class="ob-tap" x="85" y="306" width="20" height="8" rx="2"/>
  <g class="ob-pip"><path class="ob-pipbody" d="M166 28l6 4-40 54-6-4z"/><path class="ob-piptip" d="M126 82l-6 12 9-8z"/><circle class="ob-dropc" cx="119" cy="98" r="2.6"/></g>
  <g class="ob-labels">
    <path class="ob-lead" d="M101 ${ring ? 216 : 210}H152"/><text x="155" y="${ring ? 214 : 208}" class="ob-tlabel">${ring ? 'aortic ring' : 'ileum'}</text><text x="155" y="${ring ? 224 : 218}">tissue</text>
    <text x="155" y="118">water jacket</text><text x="155" y="128">37 °C</text>
    <path class="ob-lead" d="M71 60H96"/><text x="99" y="63" class="ob-gas">air in</text>
    <text x="155" y="160" class="ob-soln">solution</text>
    <path class="ob-lead" d="M134 164H152"/>
    <text x="110" y="317">drain</text>
  </g>
</svg>`;
  }

  /* =================================================================
     The tab
     ================================================================= */
  const SPEEDS = [1, 5, 20];
  const WAITS = [[60, '1 minute'], [300, '5 minutes'], [600, '10 minutes'], [1200, '20 minutes'], [1800, '30 minutes']];

  class OrganBathApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || (MG.app && MG.app.fs);
      const kept = store.get('bath', null) || {};
      this.units = kept.units === 'mN' ? 'mN' : 'g';
      this.speeds = Object.assign({ ileum: TISSUES.ileum.speed, aorta: TISSUES.aorta.speed }, kept.speeds || {});
      this.paused = false;
      this.exps = [];
      this.exp = null;
      this.view = { span: 240, end: null, yfit: false };
      this.cursors = [];
      this.lastStock = {};
      this._acc = 0;
      this._build();
      this._wire();
      this.ready = this._start(kept);
      MG.app = MG.app || {};
      MG.app.bath = this;
    }
    async _start(kept) {
      const defs = Array.isArray(kept.exps) ? kept.exps.filter((d) => d && TISSUES[d.type] && d.id) : [];
      this.exps = defs;
      const cur = defs.find((d) => d.id === kept.cur) || defs[defs.length - 1];
      try {
        if (cur) this._load(cur);
        else this._new('ileum', {}, true);
      } catch (e) {
        console.error(e);
        this.exps = [];
        this._new('ileum', {}, true);
      }
    }

    /* ================= the page ================= */
    _build() {
      const r = this.root;
      r.classList.add('ob');
      r.innerHTML = '';
      const tb = (icon, label, title, cls) => h('button.tbtn' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, html: ic(icon) + (label ? `<span>${esc(label)}</span>` : '') });
      this.btn = {
        exp: tb('flask', 'Tissue', 'Set up a fresh tissue, go back to another one, save the results', 'ob-b-exp'),
        wash: tb('drop', 'Wash', 'Wash the bath out: drain it and fill it with fresh solution, three times (W)', 'ob-b-wash'),
        play: tb('pause', 'Pause', 'Pause the clock, or start it again (Space)', 'ob-b-play'),
        plateau: tb('fastforward', 'Plateau', 'Let time run on until the response settles (P)', 'ob-b-plat'),
        wait: tb('clock', 'Wait', 'Let some minutes go by at once', 'ob-b-wait'),
        results: tb('table', 'Results', 'Show or hide the table of responses', 'ob-b-res'),
        r: tb('r', 'Analyse in R', 'Save the results, and open a script that analyses them in RStudio', 'ob-b-r'),
        cap: tb('camera', '', 'Save a picture of the chart in your files', 'ob-b-cap'),
        about: tb('info', '', 'About the model behind the organ bath', 'ob-b-about'),
        help: tb('help', '', 'How to use the organ bath', 'ob-b-help')
      };
      this.speedSeg = h('div.ob-seg', { role: 'group', 'aria-label': 'How fast the clock runs' },
        SPEEDS.map((x) => h('button', { type: 'button', 'data-x': String(x), title: x === 1 ? 'Real time' : `${x} times faster than real time` }, '×' + x)));
      this.clock = h('span.ob-clock', { title: 'The time since the tissue was set up' }, '0:00');
      const B = this.btn;
      this.top = h('div.ob-top', B.exp, h('span.ob-sep'), B.wash, h('span.ob-sep'), B.play, this.speedSeg, B.plateau, B.wait, this.clock,
        h('span.grow'), B.results, B.r, B.cap, B.about, B.help);
      // the side: the bath, what is in it, and the additions
      this.bathBox = h('div.ob-bathbox');
      this.contents = h('div.ob-contents');
      this.since = h('div.ob-since');
      this.selDrug = h('select.ob-in.ob-drug', { 'aria-label': 'The drug to add' });
      this.selStock = h('select.ob-in.ob-stock', { 'aria-label': 'The stock solution' });
      this.inVol = h('input.ob-in.ob-vol', { type: 'text', inputmode: 'decimal', value: '100', 'aria-label': 'The volume to add, in microlitres', autocomplete: 'off', spellcheck: 'false' });
      this.preview = h('div.ob-preview', { 'aria-live': 'polite' });
      this.keep = h('input', { type: 'checkbox' });
      this.keepRow = h('label.ob-keep', this.keep, h('span', 'Put it in the washing solution too, so that it stays after each wash'));
      this.addBtn = h('button.btn.primary.ob-addbtn', { type: 'button', html: ic('plus') + '<span>Add to the bath</span>' });
      this.what = h('div.ob-what');
      const vb = (dv, label) => h('button.ob-vbtn', { type: 'button', 'data-v': String(dv), title: `${label} µL` }, label);
      this.form = h('div.ob-form',
        h('div.ob-formh', 'Add a drug'),
        h('label.ob-field', h('span', 'Drug'), this.selDrug),
        h('div.ob-row2', h('label.ob-field', h('span', 'Stock'), this.selStock),
          h('label.ob-field', h('span', 'Volume (µL)'), this.inVol)),
        h('div.ob-vbtns', [10, 20, 50, 100, 200, 500].map((v) => vb(v, String(v)))),
        this.preview, this.keepRow, this.addBtn, this.what);
      this.side = h('div.ob-side', h('div.ob-sidetop', this.bathBox, h('div.ob-sideinfo', this.contents, this.since)), this.form);
      // the chart
      this.unitSeg = h('div.ob-seg.small', { role: 'group', 'aria-label': 'Units of tension' }, h('button', { type: 'button', 'data-u': 'g', title: 'Grams (gram-force), as most organ bath records are kept' }, 'g'), h('button', { type: 'button', 'data-u': 'mN', title: 'Millinewtons (1 g = 9.81 mN)' }, 'mN'));
      const cb = (icon, title, cls) => h('button.ob-cbtn' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, html: ic(icon) });
      this.cbtn = {
        fit: cb('maximize', 'Scale the tension to fit what is in view (or back to the whole range)', 'fitbtn'),
        zoomOut: cb('minus', 'Show more time (zoom out)'),
        zoomIn: cb('plus', 'Show less time (zoom in)'),
        live: h('button.ob-live', { type: 'button', title: 'Follow the trace as it is drawn', html: '<span>Now</span>' + ic('arrowR') })
      };
      this.spanLbl = h('span.ob-span');
      this.chartHead = h('div.ob-charthead', h('b', 'Tension'), this.unitSeg, this.cbtn.fit, h('span.grow'), this.cbtn.zoomOut, this.spanLbl, this.cbtn.zoomIn, this.cbtn.live);
      this.cv = h('canvas.ob-cv', { 'aria-hidden': 'true' });
      this.readout = h('div.ob-readout', { hidden: true });
      this.tip = h('div.ob-tip', { hidden: true, role: 'status' });
      this.chartBody = h('div.ob-chartbody', { tabindex: '0', role: 'img', 'aria-label': 'The chart of the tension against time. Drag (or the arrow keys) to look back; the mouse wheel, + and − to zoom; click to place a cursor and measure.' }, this.cv, this.readout, this.tip);
      this.chart = h('div.ob-chart', this.chartHead, this.chartBody);
      this.mid = h('div.ob-mid', this.side, this.chart);
      // the results
      this.resToggle = h('button.ob-restog', { type: 'button', 'aria-expanded': 'true', html: MG.icon('chevD') + '<b>Results</b><span class="ob-rescount"></span>' });
      this.resCsv = h('button.tbtn', { type: 'button', title: 'Save the results as a table (CSV) in your files, for R', html: MG.icon('download') + '<span>Save CSV</span>' });
      this.resR = h('button.tbtn', { type: 'button', title: 'Save the results and open a script that analyses them in RStudio', html: MG.icon('r') + '<span>Analyse in R</span>' });
      this.resHint = h('span.ob-reshint', 'A response is measured when you wash, or add the next dose of the same drug.');
      this.resHead = h('div.ob-reshead', this.resToggle, this.resHint, h('span.grow'), this.resCsv, this.resR);
      this.resBody = h('div.ob-resbody');
      this.res = h('div.ob-res', this.resHead, this.resBody);
      this.say = h('div.sr-only', { 'aria-live': 'polite' });
      r.append(this.top, this.mid, this.res, this.say);
    }
    _wire() {
      const B = this.btn;
      B.exp.addEventListener('click', () => this._menu(B.exp));
      B.wash.addEventListener('click', () => this.wash(3));
      B.play.addEventListener('click', () => this._setPaused(!this.paused));
      B.plateau.addEventListener('click', () => this.plateau());
      B.wait.addEventListener('click', () => MG.popmenu(B.wait, WAITS.map(([s, l]) => ['clock', 'Wait ' + l, () => this.wait(s)])));
      B.results.addEventListener('click', () => this._toggleResults());
      B.r.addEventListener('click', () => this.toR('responses'));
      B.cap.addEventListener('click', () => this.capture());
      B.about.addEventListener('click', () => this.about());
      B.help.addEventListener('click', () => this.help());
      this.speedSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-x]');
        if (b) this.setSpeed(Number(b.dataset.x));
      });
      this.unitSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-u]');
        if (b) this.setUnits(b.dataset.u);
      });
      this.cbtn.fit.addEventListener('click', () => {
        this.view.yfit = !this.view.yfit;
        this.cbtn.fit.classList.toggle('on', this.view.yfit);
        this._drawChart();
      });
      this.cbtn.zoomIn.addEventListener('click', () => this.zoom(0.5));
      this.cbtn.zoomOut.addEventListener('click', () => this.zoom(2));
      this.cbtn.live.addEventListener('click', () => {
        this.view.end = null;
        this._drawChart();
      });
      // the form
      this.selDrug.addEventListener('change', () => this._drugChanged());
      this.selStock.addEventListener('change', () => {
        this.lastStock[this.selDrug.value] = Number(this.selStock.value);
        this._preview();
      });
      this.inVol.addEventListener('input', () => this._preview());
      this.inVol.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addFromForm();
        }
      });
      this.form.querySelector('.ob-vbtns').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        this.inVol.value = b.dataset.v;
        this._preview();
      });
      this.addBtn.addEventListener('click', () => this.addFromForm());
      // the results
      this.resToggle.addEventListener('click', () => this._toggleResults());
      this.resCsv.addEventListener('click', () => this.save());
      this.resR.addEventListener('click', () => this.toR('responses'));
      this.resBody.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const id = Number(b.dataset.id);
        if (b.dataset.act === 'excl') this._exclude(id);
        else if (b.dataset.act === 'note') this._note(id);
      });
      // the chart
      const cv = this.chartBody;
      cv.addEventListener('pointerdown', (e) => this._down(e));
      cv.addEventListener('pointermove', (e) => this._move(e));
      cv.addEventListener('pointerup', (e) => this._up(e));
      cv.addEventListener('pointercancel', (e) => this._up(e, true));
      cv.addEventListener('pointerleave', () => (this.tip.hidden = true));
      cv.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
      cv.addEventListener('keydown', (e) => this._chartKey(e));
      this.readout.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        if (b.dataset.act === 'keep') this._keepMeasure();
        else this._clearCursors();
      });
      // the tab's keys
      this.root.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
        if (e.key === ' ' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          this._setPaused(!this.paused);
        } else if (e.key === 'w' || e.key === 'W') this.wash(3);
        else if (e.key === 'p' || e.key === 'P') this.plateau();
      });
      if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(this.root);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this._persist();
      });
      window.addEventListener('pagehide', () => this._persist());
      this._persistSoon = MG.debounce(() => this._persist(), 800);
      this._writeCsvSoon = MG.debounce(() => this._writeCsv(), 500);
    }
    _visible() {
      if (!this.root.offsetParent) return false;
      if (document.visibilityState === 'hidden') return false;
      // (on a phone or a tablet the workbench slides over the instructions: hidden, it doesn't run)
      if (window.matchMedia('(max-width: 1000px)').matches && !document.body.classList.contains('bench-open')) return false;
      return true;
    }
    shown() {
      this._resize();
      this._ensureLoop();
    }
    _resize() {
      this._fitTop();
      this._drawChart();
    }
    /** the toolbar in one row if it can be: names and the less needed buttons are hidden a step at a time */
    _fitTop() {
      const top = this.top;
      if (!top.offsetWidth) return;
      const wraps = () => {
        const kids = [...top.children].filter((c) => c.offsetWidth > 0 && c.offsetHeight > 0);
        if (!kids.length) return false;
        const first = kids[0].getBoundingClientRect().bottom;
        return kids.some((c) => {
          const r = c.getBoundingClientRect();
          return (r.top + r.bottom) / 2 > first;
        });
      };
      for (let i = 1; i <= 6; i++) top.classList.remove('fit' + i);
      for (let i = 1; i <= 6 && wraps(); i++) top.classList.add('fit' + i);
    }

    /* ================= experiments ================= */
    _new(type, opts = {}, quiet) {
      const T = TISSUES[type];
      const nums = this.exps.filter((d) => d.type === type).map((d) => Number((/-(\d+)$/.exec(d.id) || [])[1]) || 0);
      const num = (nums.length ? Math.max(...nums) : 0) + 1;
      const id = `${type}-${num}`;
      const o = {};
      if (opts.volume) o.volume = Number(opts.volume) === 20 ? 20 : 10;
      if (type === 'aorta' && opts.endothelium === false) o.endothelium = false;
      const seed = opts.seed != null && opts.seed !== '' && Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : hash(MG.user.name() + ':' + id) % 100000;
      const def = { id, type, opts: o, seed, events: [], steps: 0, notes: {}, excl: {} };
      this.exps.push(def);
      // (keep the twelve latest)
      while (this.exps.length > 12) this.exps.shift();
      this._load(def);
      if (!quiet) this._say(`Set up ${this.exp.title}: ${T.prep}, in ${this.exp.P.volume} mL of ${T.solution} at ${T.temp} °C.`);
      this._persistSoon();
      return this.exp;
    }
    _load(def) {
      if (this.exp && this.exp.def !== def) this._keepSteps();
      const E = new Experiment(def);
      E.replay(def.steps || 0);
      E.onEvent = (type, row) => this._onExp(type, row);
      const changed = !this.exp || this.exp.type !== E.type;
      this.exp = E;
      this.cursors = [];
      if (changed) this.view = { span: E.T.span, end: null, yfit: false };
      else this.view.end = null;
      this.cbtn.fit.classList.toggle('on', this.view.yfit);
      this.btn.exp.querySelector('span').textContent = E.title;
      this.btn.exp.title = `${E.title}: ${E.T.prep}. Set up a fresh tissue, go back to another one, save the results`;
      this.bathBox.innerHTML = bathSVG(E.type);
      this.svg = this.bathBox.querySelector('svg');
      this.svg.querySelector('.ob-gas').textContent = E.type === 'aorta' ? 'O₂/CO₂ in' : 'air in';
      this.svg.querySelector('.ob-soln').textContent = E.type === 'aorta' ? 'Krebs' : 'Tyrode';
      this._checkEquil(true);
      this._fillDrugs();
      this._speedButtons();
      this._unitButtons();
      this._renderTable();
      this._drawAll();
      this._ensureLoop();
    }
    _keepSteps() {
      if (this.exp) this.exp.def.steps = this.exp.sim.k;
    }
    _switch(id) {
      const def = this.exps.find((d) => d.id === id);
      if (!def || (this.exp && this.exp.id === id)) return;
      this._load(def);
      this._persistSoon();
    }
    _persist() {
      if (!this.exp) return;
      this._keepSteps();
      store.set('bath', { v: 1, cur: this.exp.id, exps: this.exps, units: this.units, speeds: this.speeds });
    }
    dirty() {
      return false;
    }

    /* ================= the instructions' buttons ================= */
    async go(spec) {
      await this.ready;
      const s = String(spec || '').trim();
      const [name, query] = s.split('?');
      const type = (name || '').trim().toLowerCase();
      if (!type) return this._drawAll();
      if (!TISSUES[type]) throw new Error(`There is no tissue called “${type}”: try ileum or aorta.`);
      const opts = {};
      for (const kv of (query || '').split('&')) {
        const [k, v] = kv.split('=');
        if (!k) continue;
        if (k === 'endothelium') opts.endothelium = !/^(off|no|0|false|removed|denuded)$/i.test(v || '');
        else if (k === 'new' || k === 'fresh') opts.new = v !== '0';
        else if (k === 'seed') opts.seed = v;
        else if (k === 'volume') opts.volume = Number(v);
      }
      let def = null;
      if (!opts.new && opts.seed == null) {
        def = [...this.exps].reverse().find((d) => d.type === type && (type !== 'aorta' || (d.opts.endothelium !== false) === (opts.endothelium !== false)) && (!opts.volume || (d.opts.volume || 10) === opts.volume));
      }
      if (def) {
        if (!this.exp || this.exp.id !== def.id) this._switch(def.id);
      } else this._new(type, opts);
      const E = this.exp;
      bus.emit('bath:setup', { tissue: E.type, id: E.id, endothelium: E.type === 'aorta' ? E.opts.endothelium !== false : null, volume: E.P.volume, seed: E.seed });
      this._drawAll(true);
    }
    async do(cmdText) {
      await this.ready;
      for (const raw of String(cmdText || '').split(';')) {
        const cmd = raw.trim();
        if (!cmd) continue;
        const [w, ...rest] = cmd.split(/\s+/);
        const arg = rest.join(' ');
        const word = w.toLowerCase();
        if (word === 'add') this._cmdAdd(arg);
        else if (word === 'antagonist' || word === 'solution') this._cmdAntagonist(arg);
        else if (word === 'wash') {
          this._finishWash();
          this.wash(arg ? Number(arg) || 3 : 3);
        } else if (word === 'speed') this.setSpeed(Number(arg.replace(/^[x×]/, '')));
        else if (word === 'pause') this._setPaused(true);
        else if (word === 'play' || word === 'run') this._setPaused(false);
        else if (word === 'wait') this.wait(Number(arg) || 60);
        else if (word === 'plateau') this.plateau();
        else if (word === 'fresh' || word === 'new') await this.go(this.exp.type + '?new=1' + (this.exp.opts.endothelium === false ? '&endothelium=off' : ''));
        else if (word === 'results') this._toggleResults(true);
        else if (word === 'save') await this.save();
        else if (word === 'capture' || word === 'picture') await this.capture();
        else if (word === 'zoom') this.setSpan(Number(arg) || this.view.span);
        else if (word === 'units') this.setUnits(arg);
        else if (word === 'reveal') this.about(true);
        else throw new Error(`The organ bath doesn’t know “${cmd}”.`);
      }
      this._drawAll(true);
    }
    _drug(text) {
      const s = String(text || '').trim().toLowerCase();
      const names = Object.keys(ALIAS).sort((a, b) => b.length - a.length);
      for (const n of names) if (s === n || s.startsWith(n + ' ')) return { d: ALIAS[n], rest: s.slice(n.length).trim() };
      return { d: null, rest: s };
    }
    _cmdAdd(arg) {
      const { d, rest } = this._drug(arg);
      const E = this.exp;
      if (!d || !E.P.act[d]) throw new Error(`The ${E.T.name.toLowerCase()} has no drug called “${arg}”.`);
      this._finishWash();
      // 'add ACh 0.1 mL 1e-5 M': a volume and a stock
      const m = /^([\d.]+\s*(?:ml|µl|ul|μl))\s+(.+)$/i.exec(rest);
      if (m) {
        const v = parseVol(m[1]);
        const S = parseConc(m[2], false);
        if (!(v > 0) || !(S > 0)) throw new Error(`“${rest}” is not a volume and a stock (100 µL 1e-5 M).`);
        this.addDrug(d, S, v);
        return;
      }
      // 'add ACh 1e-7': a concentration to reach
      const target = parseConc(rest, unitOf(d) === 'mM');
      if (!(target > 0)) throw new Error(`“${rest}” is not a concentration.`);
      const plan = this._plan(d, target);
      if (!plan) throw new Error(`No stock and volume give ${fmtC(target, unitOf(d))} of ${lc(d)} from what is in the bath now: wash it first.`);
      this.addDrug(d, plan.S, plan.v);
    }
    /** a stock and a volume that bring the bath from its concentration of d to target */
    _plan(d, target) {
      const sim = this.exp.sim, cur = sim.cb[d] || 0, V = sim.V;
      if (!(target > cur * 1.0001)) return null;
      let best = null;
      for (const S of stocksFor(d)) {
        if (S <= target) continue;
        const vUL = (((target - cur) * V) / (S - target)) * 1000;
        if (vUL < 5 || vUL > 2000) continue;
        const score = Math.abs(Math.log10(vUL / 100)) + (vUL > 1000 ? 2 : 0);
        if (!best || score < best.score) best = { S, v: vUL, score };
      }
      return best;
    }
    _cmdAntagonist(arg) {
      const a = arg.trim().toLowerCase();
      if (!a || a === 'none' || a === 'plain' || a === 'off') return this.setSolution('none', 0);
      const { d, rest } = this._drug(arg);
      if (!d || !this.exp.P.act[d]) throw new Error(`The ${this.exp.T.name.toLowerCase()} has no drug called “${arg}”.`);
      const c = parseConc(rest, unitOf(d) === 'mM');
      if (!(c > 0)) throw new Error(`“${rest}” is not a concentration.`);
      this.setSolution(d, c);
    }
    _finishWash() {
      const E = this.exp;
      let n = 0;
      while (E.sim.wash && n < 4000) {
        E._step();
        n++;
      }
    }

    /* ================= what the student does ================= */
    addFromForm() {
      const d = this.selDrug.value;
      const S = Number(this.selStock.value);
      const v = parseVol(this.inVol.value);
      if (!(v > 0)) {
        toast('Type the volume to add, in µL (for example 100).', 'warn');
        this.inVol.focus();
        return false;
      }
      return this.addDrug(d, S, v, { keep: this.keep.checked && !this.keepRow.hidden });
    }
    /** add vUL µL of a stock S (M) of drug d to the bath (o.keep: and to the washing solution) */
    addDrug(d, S, vUL, o = {}) {
      const E = this.exp, sim = E.sim;
      const a = E.P.act[d];
      if (!a) {
        toast(`There is no ${esc(d)} for this tissue.`, 'warn');
        return false;
      }
      if (sim.wash) {
        toast('Wait for the wash to finish before you add a drug.', 'warn');
        return false;
      }
      if (sim.V + vUL / 1000 > sim.V0 + SPARE + 1e-9) {
        toast(`The bath would overflow: it holds ${fmtV(sim.V * 1000)} already. Wash it first, or add a smaller volume of a stronger stock.`, 'warn', 6000);
        return false;
      }
      const i = E.act({ type: 'add', d, S, v: vUL });
      const conc = sim.cb[d];
      const u = unitOf(d);
      const info = E._modInfo();
      bus.emit('bath:add', { drug: d, name: DRUGS[d].name, conc, logc: Number(Math.log10(conc).toFixed(3)), volume: vUL, stock: S, bath: Number(sim.V.toFixed(3)), role: a.kind ? 'agonist' : 'modulator', kind: a.kind || '', condition: info.label });
      if (o.keep && !a.kind) {
        E.act({ type: 'res', d, c: conc });
        bus.emit('bath:antagonist', { drug: d, conc });
      }
      this._pipette();
      this._say(`Added ${fmtV(vUL)} of ${fmtStock(S, d)} ${lc(d)}: ${fmtC(conc, u)} in the bath.`);
      this._persistSoon();
      this._renderTable();
      this._drawAll(true);
      return i;
    }
    /** wash the bath out n times with the washing solution */
    wash(n = 3) {
      const E = this.exp;
      if (E.sim.wash) return false;
      E.act({ type: 'wash', n });
      const sol = Object.keys(E.sim.res).length ? E.T.solution + ' + ' + Object.entries(E.sim.res).map(([d, c]) => `${lc(d)} ${fmtC(c, unitOf(d))}`).join(' + ') : E.T.solution;
      bus.emit('bath:wash', { n, solution: sol });
      this._say(`Washing the bath (${n} ${n === 1 ? 'time' : 'times'}).`);
      this._persistSoon();
      this._renderTable();
      this._drawAll(true);
      this._writeCsvSoon();
      return true;
    }
    /** the washing solution: with drug d at c (M), or plain ('none'); the bath is washed three times with it */
    setSolution(d, c) {
      const E = this.exp;
      this._finishWash();
      E.act({ type: 'res', d, c });
      bus.emit('bath:antagonist', { drug: d, conc: c });
      this.wash(3);
      if (d !== 'none') this._say(`The washing solution now holds ${lc(d)} at ${fmtC(c, unitOf(d))}. Let it equilibrate with the tissue before you add an agonist.`);
    }
    setSpeed(x) {
      if (!SPEEDS.includes(x)) return;
      this.speeds[this.exp.type] = x;
      this._speedButtons();
      this._setPaused(false);
      bus.emit('bath:speed', { x });
      this._persistSoon();
    }
    _speedButtons() {
      const x = this.speeds[this.exp.type];
      this.speedSeg.querySelectorAll('button').forEach((b) => {
        const on = Number(b.dataset.x) === x;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    _setPaused(p) {
      this.paused = !!p;
      this.btn.play.innerHTML = ic(this.paused ? 'play' : 'pause') + `<span>${this.paused ? 'Run' : 'Pause'}</span>`;
      this.btn.play.classList.toggle('on', this.paused);
      this.root.classList.toggle('ob-paused', this.paused);
      this._ensureLoop();
      this._fitTop();
    }
    /** let s seconds of the experiment go by at once */
    wait(s) {
      const E = this.exp;
      E.advance(Math.round(s / H));
      bus.emit('bath:wait', { s });
      this._persistSoon();
      this._renderTable();
      this._drawAll();
      this._say(`${fmtT(s)} went by.`);
    }
    /** run on until the response settles */
    plateau() {
      const E = this.exp;
      const took = E.skip(E.T.maxSkip);
      bus.emit('bath:plateau', { t: Number(E.t.toFixed(1)) });
      this._persistSoon();
      this._renderTable();
      this._drawAll();
      this._say(took < 1.5 ? 'The response has settled already.' : `${fmtT(took)} later, the response has settled.`);
      return took;
    }
    zoom(f) {
      this.setSpan(this.view.span * f);
    }
    _maxSpan() {
      return Math.max(600, this.exp.T.span, this.exp.t * 1.1);
    }
    setSpan(s) {
      this.view.span = clamp(s, 10, this._maxSpan());
      this._drawChart();
    }
    setUnits(u) {
      this.units = String(u).toLowerCase() === 'mn' ? 'mN' : 'g';
      this._unitButtons();
      this._renderTable();
      this._drawAll();
      this._persistSoon();
    }
    _unitButtons() {
      this.unitSeg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.u === this.units;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    _toggleResults(open) {
      const closed = open == null ? !this.root.classList.contains('res-closed') : !open;
      this.root.classList.toggle('res-closed', closed);
      this.resToggle.setAttribute('aria-expanded', closed ? 'false' : 'true');
      this.btn.results.classList.toggle('on', !closed);
      this._drawChart();
    }

    /* ================= the experiment tells the tab ================= */
    _onExp(type, row) {
      if (type === 'response') {
        const E = this.exp;
        const n = E.rows.filter((r) => r.final && r.drug === row.drug && r.condition === row.condition && !E.excl[r.id]).length;
        const resp = Experiment.response(row);
        const pct = E.pct(row);
        bus.emit('bath:response', { drug: row.drug, conc: row.conc, logc: Number(Math.log10(row.conc).toFixed(3)), response: Number(resp.toFixed(4)), pct: Number.isFinite(pct) ? Number(pct.toFixed(1)) : null, kind: row.kind, condition: row.condition, n, id: row.id });
        this._renderTable();
        this._writeCsvSoon();
      } else if (type === 'washed') {
        this._updateSide();
      }
    }

    /* ================= the clock ================= */
    _running() {
      return !this.paused && this._visible();
    }
    _ensureLoop() {
      if (this._raf || !this._running()) return;
      this._last = performance.now();
      const tick = (now) => {
        this._raf = null;
        if (!this._running()) return;
        const dt = Math.min(0.25, Math.max(0, (now - this._last) / 1000));
        this._last = now;
        this._acc += dt * (this.speeds[this.exp.type] || 1);
        const n = Math.floor(this._acc / H);
        this._acc -= n * H;
        if (n > 0) {
          const before = this.exp.rows.length;
          this.exp.advance(n);
          this._drawAll(before !== this.exp.rows.length);
          if (++this._tickN % 300 === 0) this._persistSoon();
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._tickN = 0;
      this._raf = requestAnimationFrame(tick);
    }

    /* ================= drawing ================= */
    _drawAll(rows) {
      if (!this.exp) return;
      this._drawBath();
      this._drawChart();
      // (what is in the bath, the times and the live responses: at most four times a second, and once more after the
      // last change)
      const now = performance.now();
      const side = () => {
        this._sideAt = performance.now();
        this._sideT = null;
        this._updateSide();
        this._updateLive();
      };
      if (rows === true || !this._sideAt || now - this._sideAt > 250) side();
      else if (!this._sideT) this._sideT = setTimeout(side, 260);
      this.clock.textContent = fmtT(this.exp.t);
      this._checkEquil();
    }
    /** an antagonist that has been in the bath for 10 minutes has (nearly) equilibrated with the tissue: say so, once */
    _checkEquil(quiet) {
      const E = this.exp;
      this._eqDone = this._eqDone || new Set();
      for (const [d, m] of Object.entries(E.mods)) {
        const key = E.id + ':' + d + ':' + m.t0;
        if (E.t - m.t0 < 570 || this._eqDone.has(key)) continue;
        this._eqDone.add(key);
        if (!quiet) bus.emit('bath:equilibrated', { drug: d, conc: m.c, minutes: Math.round((E.t - m.t0) / 60) });
      }
    }
    _drawBath() {
      const svg = this.svg, E = this.exp, S = E.sim;
      if (!svg) return;
      const top = 98, full = 196;
      const lev = S.level;
      const fl = svg.querySelector('.ob-fluid');
      fl.setAttribute('y', (top + (1 - lev) * full).toFixed(1));
      fl.setAttribute('height', Math.max(0, lev * full).toFixed(1));
      svg.classList.toggle('ob-drained', lev < 0.6);
      const a = clamp(S.active / E.P.Em, 0, 1.2);
      if (E.type === 'aorta') {
        const ry = 15 * (1 - 0.12 * a), cy = 236 - ry;
        const tis = svg.querySelector('.ob-tis'), tin = svg.querySelector('.ob-tisin');
        tis.setAttribute('cy', cy.toFixed(1));
        tis.setAttribute('ry', ry.toFixed(1));
        tin.setAttribute('cy', cy.toFixed(1));
        tin.setAttribute('ry', (ry - 4.5).toFixed(1));
        const yTop = cy - ry + 3;
        svg.querySelector('.ob-hooktop').setAttribute('d', `M95 ${(yTop - 10).toFixed(1)}v10m-6-2h12`);
        svg.querySelector('.ob-thread').setAttribute('y2', (yTop - 10).toFixed(1));
      } else {
        const L = 80 * (1 - 0.24 * a), y = 250 - L, w = 12 + 3 * a;
        const tis = svg.querySelector('.ob-tis');
        tis.setAttribute('y', y.toFixed(1));
        tis.setAttribute('height', L.toFixed(1));
        tis.setAttribute('width', w.toFixed(1));
        tis.setAttribute('x', (95 - w / 2).toFixed(1));
        let d = '';
        for (let k = 1; k <= 6; k++) d += `M${(95 - w / 2 + 2).toFixed(1)} ${(y + (k * L) / 7).toFixed(1)}h${(w - 4).toFixed(1)}`;
        svg.querySelector('.ob-tisline').setAttribute('d', d);
        svg.querySelector('.ob-thread').setAttribute('y2', y.toFixed(1));
      }
      svg.querySelector('.ob-read').textContent = this._fmtTension(E.n ? E.tr[E.n - 1] : 0, 2) + ' ' + this.units;
    }
    _fmtTension(v, d = 2) {
      return (this.units === 'mN' ? v * GF : v).toFixed(this.units === 'mN' ? Math.max(0, d - 1) : d);
    }
    _pipette() {
      const svg = this.svg;
      if (!svg) return;
      svg.classList.remove('ob-adding');
      void svg.getBoundingClientRect();
      svg.classList.add('ob-adding');
      clearTimeout(this._pipT);
      this._pipT = setTimeout(() => svg.classList.remove('ob-adding'), 1400);
    }
    _say(text) {
      this.say.textContent = text;
    }

    /* the side: what is in the bath, the washing solution, the times */
    _updateSide() {
      const E = this.exp, S = E.sim;
      if (!E) return;
      const items = [];
      for (const [d, c] of Object.entries(S.cb)) {
        const u = unitOf(d);
        if (c < (u === 'mM' ? 1e-5 : 1e-10)) continue;
        items.push(`<span class="ob-chip${(E.P.act[d] || {}).kind ? '' : ' mod'}" title="${esc(DRUGS[d].name)}">${esc(DRUGS[d].short)} ${esc(fmtC(c, u))}</span>`);
      }
      const res = Object.entries(S.res).filter(([, c]) => c > 0);
      const sol = res.length ? `${esc(E.T.solution)} + ${res.map(([d, c]) => `<b>${esc(lc(d))} ${esc(fmtC(c, unitOf(d)))}</b>`).join(' + ')}` : esc(E.T.solution);
      const since = [];
      if (E.lastAdd != null) since.push(`last addition ${fmtT(E.t - E.lastAdd)} ago`);
      if (E.lastWash != null) since.push(`last wash ${fmtT(E.t - E.lastWash)} ago`);
      const key = items.join('') + '|' + sol + '|' + S.V.toFixed(3);
      if (key !== this._sideKey) {
        this._sideKey = key;
        this.contents.innerHTML = `<div class="ob-inbath"><span class="ob-k">In the bath (${esc(fmtV(S.V * 1000))})</span>${items.length ? items.join('') : '<span class="ob-none">no drugs</span>'}</div>
<div class="ob-sol"><span class="ob-k">Washing solution</span>${sol}${res.length ? ' <button class="linkbtn ob-plain" type="button">plain again</button>' : ''}</div>`;
        const pb = this.contents.querySelector('.ob-plain');
        if (pb) pb.addEventListener('click', () => this.setSolution('none', 0));
      }
      this.since.innerHTML = (S.wash ? '<b>Washing…</b> ' : '') + esc(since.join(' · '));
      this.addBtn.disabled = !!S.wash || this._previewBad;
      this.btn.wash.disabled = !!S.wash;
      this.addBtn.querySelector('span').textContent = S.wash ? 'Washing…' : 'Add to the bath';
    }

    /* the form */
    _fillDrugs() {
      const E = this.exp;
      const groups = [['Agonists', (d, a) => a.kind === 'contraction' && !DRUGS[d].unknown], ['Relaxants', (d, a) => a.kind === 'relaxation'], ['Antagonists and other drugs', (d, a) => !a.kind && !DRUGS[d].unknown], ['Unknowns', (d) => DRUGS[d].unknown]];
      const prev = this.selDrug.value;
      this.selDrug.innerHTML = '';
      for (const [label, test] of groups) {
        const ds = Object.keys(E.P.act).filter((d) => test(d, E.P.act[d]));
        if (!ds.length) continue;
        this.selDrug.appendChild(h('optgroup', { label }, ds.map((d) => h('option', { value: d }, `${DRUGS[d].name}${DRUGS[d].unknown ? '' : ' (' + DRUGS[d].short + ')'}`))));
      }
      this.selDrug.value = E.P.act[prev] ? prev : E.T.first;
      this._drugChanged();
    }
    _drugChanged() {
      const d = this.selDrug.value, a = this.exp.P.act[d] || {};
      const S0 = this.lastStock[d] || a.stock || 1e-5;
      this.selStock.innerHTML = '';
      for (const S of stocksFor(d)) this.selStock.appendChild(h('option', { value: String(S), selected: Math.abs(S - S0) < S0 * 1e-6 ? '' : null }, fmtStock(S, d)));
      this.keepRow.hidden = !!a.kind;
      this.keep.checked = false;
      this.what.innerHTML = `<b>${esc(DRUGS[d].name)}</b> – ${esc(DRUGS[d].what)}`;
      this._preview();
    }
    _preview() {
      const E = this.exp, sim = E.sim;
      const d = this.selDrug.value, S = Number(this.selStock.value), v = parseVol(this.inVol.value);
      const u = unitOf(d);
      let html = '', bad = false;
      if (!(v > 0)) {
        html = 'Type the volume to add, in µL.';
        bad = true;
      } else if (sim.V + v / 1000 > sim.V0 + SPARE + 1e-9) {
        html = `Too much: the bath would overflow (it holds ${esc(fmtV(sim.V * 1000))} now). Use a smaller volume of a stronger stock, or wash first.`;
        bad = true;
      } else {
        const cur = sim.cb[d] || 0;
        const c = bathAfter(cur, sim.V, S, v);
        html = `→ <b>${esc(fmtC(c, u))}</b> in the bath <span class="ob-log">(log ${Math.log10(c).toFixed(2)})</span>`;
        if (cur > (u === 'mM' ? 1e-5 : 1e-10)) html += `<span class="ob-cum">There is ${esc(fmtC(cur, u))} in the bath already: this adds to it.</span>`;
        if (v > 1000) html += '<span class="ob-cum">That is a large volume: a stronger stock would change the bath less.</span>';
      }
      this._previewBad = bad;
      this.preview.innerHTML = html;
      this.preview.classList.toggle('bad', bad);
      this.addBtn.disabled = bad || !!sim.wash;
    }

    /* the results */
    _rowCells(r) {
      const E = this.exp;
      const resp = Experiment.response(r);
      const pct = E.pct(r);
      return { resp: (this.units === 'mN' ? resp * GF : resp).toFixed(this.units === 'mN' ? 1 : 3), pct: Number.isFinite(pct) ? pct.toFixed(0) + '%' : '–' };
    }
    _renderTable() {
      const E = this.exp;
      if (!E) return;
      const rows = E.rows;
      const used = rows.filter((r) => !E.excl[r.id]).length;
      this.resToggle.querySelector('.ob-rescount').textContent = rows.length ? ` (${used})` : '';
      this.btn.results.querySelector('span') && (this.btn.results.querySelector('span').textContent = rows.length ? `Results (${used})` : 'Results');
      this._live = new Map();
      if (!rows.length) {
        this.resBody.innerHTML = `<div class="ob-empty">No responses yet. Add an agonist: when its response has reached its plateau, wash the bath (or add the next dose), and the response is measured and kept here.</div>`;
        return;
      }
      const u = this.units;
      const head = h('tr', h('th', '#'), h('th.ob-c-time', 'Time'), h('th', 'Drug'), h('th.ob-c-add', 'Added'), h('th', 'In the bath'), h('th.ob-c-log', 'log M'), h('th.ob-c-with', 'With'), h('th.ob-c-resp', `Response (${u})`), h('th.ob-c-pct', '%'), h('th.ob-c-act', h('span.sr-only', 'Actions')));
      const body = h('tbody');
      rows.forEach((r, k) => {
        const ex = !!E.excl[r.id];
        const cells = this._rowCells(r);
        const drug = r.kind === 'manual' ? 'Cursors' : DRUGS[r.drug].short;
        const unit = unitOf(r.drug);
        const respCell = h('td.ob-c-resp', cells.resp + (r.final ? '' : ' …'));
        const pctCell = h('td.ob-c-pct', cells.pct);
        const note = E.notes[r.id];
        const tr = h('tr' + (ex ? '.ex' : '') + (r.final ? '' : '.open'),
          h('td', String(k + 1)),
          h('td.ob-c-time', fmtT(r.t)),
          h('td', { title: r.kind === 'manual' ? 'Measured with the cursors' : DRUGS[r.drug].name }, drug, note ? h('span.ob-note', { title: note }, ' ✎') : null),
          h('td.ob-c-add', r.kind === 'manual' ? `${fmtT(r.t)}–${fmtT(r.t2)}` : `${fmtV(r.v)} of ${fmtStock(r.S, r.drug)}`),
          h('td', r.kind === 'manual' ? '–' : fmtC(r.conc, unit)),
          h('td.ob-c-log', r.kind === 'manual' ? '–' : Math.log10(r.conc).toFixed(2)),
          h('td.ob-c-with', { title: r.condition }, r.condition === 'control' ? '–' : r.condition),
          respCell, pctCell,
          h('td.ob-c-act',
            h('button.ob-rbtn', { type: 'button', 'data-act': 'note', 'data-id': String(r.id), title: note ? 'Note: ' + note : 'Add a note', 'aria-label': 'Note', html: MG.icon('pencil') }),
            h('button.ob-rbtn', { type: 'button', 'data-act': 'excl', 'data-id': String(r.id), title: ex ? 'Use this response again' : 'Leave this response out of the analysis', 'aria-label': ex ? 'Use it' : 'Leave it out', html: MG.icon(ex ? 'eyeOff' : 'eye') })));
        if (!r.final) this._live.set(r, [respCell, pctCell]);
        body.appendChild(tr);
      });
      const tbl = h('table.ob-table', h('thead', head), body);
      const atEnd = this.resBody.scrollHeight - this.resBody.scrollTop - this.resBody.clientHeight < 30;
      this.resBody.replaceChildren(tbl);
      if (atEnd) this.resBody.scrollTop = this.resBody.scrollHeight;
    }
    _updateLive() {
      if (!this._live || !this._live.size) return;
      for (const [r, [rc, pc]] of this._live) {
        if (r.final) {
          this._renderTable();
          return;
        }
        const cells = this._rowCells(r);
        rc.textContent = cells.resp + ' …';
        pc.textContent = cells.pct;
      }
    }
    _exclude(id) {
      const E = this.exp;
      if (E.excl[id]) delete E.excl[id];
      else E.excl[id] = 1;
      this._renderTable();
      this._writeCsvSoon();
      this._persistSoon();
    }
    async _note(id) {
      const E = this.exp;
      const t = await MG.promptText('A note on this response', 'For example: “tissue moved”, or “the bubbles stopped”. Notes are kept in the table and in the CSV file.', E.notes[id] || '', 'Keep it');
      if (t == null) return;
      if (t) E.notes[id] = t;
      else delete E.notes[id];
      this._renderTable();
      this._writeCsvSoon();
      this._persistSoon();
    }

    /* ================= the chart ================= */
    _win() {
      const E = this.exp, span = this.view.span;
      let t1 = this.view.end == null ? Math.max(span, E.t + span * 0.08) : this.view.end;
      return [t1 - span, t1];
    }
    _geom() {
      const W = this.chartBody.clientWidth, Hh = this.chartBody.clientHeight;
      const L = 48, R = 12, T = 12, AX = 18, MK = 46;
      return { W, H: Hh, L, R, T, x0: L, x1: W - R, y0: T, y1: Hh - AX - MK, mk: Hh - MK };
    }
    _yRange(t0, t1) {
      const E = this.exp, u = this.units === 'mN' ? GF : 1;
      let lo, hi;
      if (this.view.yfit) {
        const i0 = clamp(Math.floor(t0 / DT), 0, E.n - 1), i1 = clamp(Math.ceil(t1 / DT), 0, E.n - 1);
        lo = Infinity;
        hi = -Infinity;
        for (let i = i0; i <= i1; i++) {
          const v = E.tr[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (!isFinite(lo)) {
          lo = 0;
          hi = 1;
        }
        const pad = Math.max(0.05, (hi - lo) * 0.12);
        lo -= pad;
        hi += pad;
      } else {
        lo = 0;
        hi = Math.max(E.P.rest + E.P.Em * 1.12, 1);
        // (whatever is in view stays in view)
        const i0 = clamp(Math.floor(t0 / DT), 0, E.n - 1), i1 = clamp(Math.ceil(t1 / DT), 0, E.n - 1);
        for (let i = i0; i <= i1; i++) if (E.tr[i] > hi) hi = E.tr[i] * 1.05;
      }
      return [lo * u, hi * u];
    }
    _drawChart(target) {
      const box = this.chartBody;
      const W = box.clientWidth, Hh = box.clientHeight;
      if (!this.exp || !W || !Hh) return;
      const cv = target || this.cv;
      const dpr = target ? 2 : window.devicePixelRatio || 1;
      if (!target && (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr))) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(Hh * dpr);
        cv.style.width = W + 'px';
        cv.style.height = Hh + 'px';
      }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, Hh);
      if (target) {
        c.fillStyle = '#fff';
        c.fillRect(0, 0, W, Hh);
      }
      const E = this.exp, g = this._geom();
      const [t0, t1] = this._win();
      const u = this.units === 'mN' ? GF : 1;
      const [lo, hi] = this._yRange(t0, t1);
      if (!target) this.spanLbl.textContent = fmtSpan(t1 - t0);
      const X = (t) => g.x0 + ((t - t0) / (t1 - t0)) * (g.x1 - g.x0);
      const Y = (v) => g.y1 - ((v * u - lo) / (hi - lo || 1)) * (g.y1 - g.y0);
      c.font = '11px system-ui, sans-serif';
      // the grid and the axis of tension
      const ticks = niceTicks(lo, hi, Math.max(2, Math.floor((g.y1 - g.y0) / 34)));
      c.strokeStyle = '#e6ebf1';
      c.lineWidth = 1;
      c.fillStyle = '#5b6678';
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (const v of ticks) {
        if (v < lo - 1e-9 || v > hi + 1e-9) continue;
        const y = Math.round(g.y1 - ((v - lo) / (hi - lo)) * (g.y1 - g.y0)) + 0.5;
        c.beginPath();
        c.moveTo(g.x0, y);
        c.lineTo(g.x1, y);
        c.stroke();
        c.fillText(fmtTick(v), g.x0 - 5, y);
      }
      c.save();
      c.translate(12, (g.y0 + g.y1) / 2);
      c.rotate(-Math.PI / 2);
      c.textAlign = 'center';
      c.fillStyle = '#3e4a5c';
      c.font = '600 11px system-ui, sans-serif';
      c.fillText(`Tension (${this.units})`, 0, 0);
      c.restore();
      // the time axis
      const tstep = timeStep((t1 - t0) / Math.max(1, (g.x1 - g.x0) / 80));
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillStyle = '#5b6678';
      for (let t = Math.ceil(Math.max(0, t0) / tstep) * tstep; t <= t1 + 1e-9; t += tstep) {
        const x = Math.round(X(t)) + 0.5;
        c.strokeStyle = '#eef1f5';
        c.beginPath();
        c.moveTo(x, g.y0);
        c.lineTo(x, g.y1);
        c.stroke();
        c.fillText(fmtT(t), x, g.y1 + 4);
      }
      c.strokeStyle = '#c9d1dc';
      c.strokeRect(g.x0 + 0.5, g.y0 + 0.5, g.x1 - g.x0 - 1, g.y1 - g.y0 - 1);
      // the antagonists in the bath, as bands behind the trace
      const bands = E.bands.concat(Object.entries(E.mods).map(([d, m]) => ({ d, c: m.c, t0: m.t0, t1: E.t, open: true })));
      // the trace: for each column of pixels, its first, lowest, highest and last value
      c.save();
      c.beginPath();
      c.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
      c.clip();
      for (const b of bands) {
        if (b.t1 < t0 || b.t0 > t1) continue;
        c.fillStyle = 'rgba(122, 76, 196, 0.06)';
        c.fillRect(X(b.t0), g.y0, X(b.t1) - X(b.t0), g.y1 - g.y0);
      }
      const i0 = clamp(Math.floor(t0 / DT) - 1, 0, E.n - 1), i1 = clamp(Math.ceil(t1 / DT) + 1, 0, E.n - 1);
      c.strokeStyle = '#1d3f72';
      c.lineWidth = 1.4;
      c.lineJoin = 'round';
      c.beginPath();
      let col = null, first, lowv, highv, last, started = false;
      const flush = () => {
        if (col == null) return;
        if (!started) {
          c.moveTo(col, Y(first));
          started = true;
        } else c.lineTo(col, Y(first));
        if (highv !== lowv) {
          c.lineTo(col, Y(lowv));
          c.lineTo(col, Y(highv));
        }
        c.lineTo(col, Y(last));
      };
      for (let i = i0; i <= i1 && E.n > 0; i++) {
        const v = E.tr[i];
        const x = Math.round(X(i * DT) * 2) / 2;
        if (x !== col) {
          flush();
          col = x;
          first = lowv = highv = last = v;
        } else {
          if (v < lowv) lowv = v;
          if (v > highv) highv = v;
          last = v;
        }
      }
      flush();
      c.stroke();
      // the pen
      if (!target && E.n && E.t >= t0 && E.t <= t1) {
        c.fillStyle = '#d1495b';
        c.beginPath();
        c.arc(X(E.t), Y(E.tr[E.n - 1]), 3, 0, 6.2832);
        c.fill();
      }
      // the cursors
      this.cursors.forEach((t, k) => {
        if (t < t0 || t > t1) return;
        const x = Math.round(X(t)) + 0.5;
        c.strokeStyle = k ? '#c2398a' : '#e08a1e';
        c.lineWidth = 1.5;
        c.setLineDash([4, 3]);
        c.beginPath();
        c.moveTo(x, g.y0);
        c.lineTo(x, g.y1);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.arc(x, Y(E.at(t)), 3.5, 0, 6.2832);
        c.fill();
        c.font = '700 11px system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText(k ? 'B' : 'A', x + 4, g.y0 + 3);
        c.font = '11px system-ui, sans-serif';
      });
      c.restore();
      // the marks under the trace: additions, washes, the washing solution, and the antagonists' bands
      this._marks = [];
      const lanes = [-Infinity, -Infinity, -Infinity];
      c.textBaseline = 'top';
      c.textAlign = 'left';
      for (const m of E.marks) {
        if (m.t < t0 - 1 || m.t > t1 + 1) continue;
        const x = Math.round(X(m.t)) + 0.5;
        let colr = '#0b6b8a', label = '';
        if (m.type === 'add') {
          const a = E.P.act[m.d] || {};
          colr = a.kind === 'relaxation' ? '#16794a' : a.kind ? '#0b6b8a' : '#7a4cc4';
          label = `${DRUGS[m.d].short} ${fmtC(m.c, unitOf(m.d), true)}`;
        } else if (m.type === 'wash') {
          colr = '#2e86ab';
          label = 'W';
        } else {
          colr = '#7a4cc4';
          label = m.d === 'none' ? 'plain soln' : `soln + ${DRUGS[m.d].short}`;
        }
        c.strokeStyle = colr;
        c.globalAlpha = 0.35;
        c.beginPath();
        c.moveTo(x, g.y0);
        c.lineTo(x, g.y1);
        c.stroke();
        c.globalAlpha = 1;
        c.fillStyle = colr;
        c.beginPath();
        c.moveTo(x, g.mk + 2);
        c.lineTo(x - 4, g.mk + 9);
        c.lineTo(x + 4, g.mk + 9);
        c.closePath();
        c.fill();
        const w = c.measureText(label).width;
        let lane = lanes.findIndex((end) => end < x - 2);
        if (lane >= 0) {
          c.fillText(label, x - 3, g.mk + 11 + lane * 11);
          lanes[lane] = x - 3 + w;
        }
        this._marks.push({ x, m });
      }
      for (const b of bands) {
        if (b.t1 < t0 || b.t0 > t1) continue;
        const xa = Math.max(g.x0, X(b.t0)), xb = Math.min(g.x1, X(b.t1));
        c.fillStyle = 'rgba(122, 76, 196, 0.55)';
        c.fillRect(xa, g.H - 6, Math.max(1, xb - xa), 3);
      }
    }
    _xToT(x) {
      const g = this._geom(), [t0, t1] = this._win();
      return t0 + ((x - g.x0) / (g.x1 - g.x0)) * (t1 - t0);
    }
    _down(e) {
      if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.ob-readout')) return;
      this.chartBody.focus({ preventScroll: true });
      this._ptrs = this._ptrs || new Map();
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.chartBody.setPointerCapture(e.pointerId);
      } catch (err) {
        /* (a pointer that has gone) */
      }
      if (this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), span: this.view.span };
        this._drag = null;
        return;
      }
      const [t0, t1] = this._win();
      this._drag = { x: e.clientX, t1, span: t1 - t0, moved: false };
    }
    _move(e) {
      const r = this.chartBody.getBoundingClientRect();
      if (this._ptrs && this._ptrs.has(e.pointerId)) this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pinch && this._ptrs && this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 10) this.setSpan((this._pinch.span * this._pinch.d) / d);
        return;
      }
      const D = this._drag;
      if (D) {
        const dx = e.clientX - D.x;
        if (Math.abs(dx) > 4) D.moved = true;
        if (D.moved) {
          const g = this._geom();
          const dt = (dx / (g.x1 - g.x0)) * D.span;
          this.view.end = clamp(D.t1 - dt, D.span * 0.5, Math.max(D.span, this.exp.t + D.span * 0.08));
          this._drawChart();
        }
        return;
      }
      // the tension under the pointer, or what a mark is
      if (e.pointerType !== 'mouse') return;
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const g = this._geom();
      const near = (this._marks || []).find((k) => Math.abs(k.x - x) < 6 && y > g.mk - 4);
      let html = '';
      if (near) html = this._markText(near.m);
      else if (x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1) {
        const t = this._xToT(x);
        if (t >= 0 && t <= this.exp.t) html = `${fmtT(t, true)} · <b>${this._fmtTension(this.exp.at(t), 3)} ${this.units}</b>`;
      }
      this.tip.hidden = !html;
      if (html) {
        this.tip.innerHTML = html;
        this.tip.style.left = Math.min(x + 12, r.width - this.tip.offsetWidth - 6) + 'px';
        this.tip.style.top = Math.max(4, y - 30) + 'px';
      }
    }
    _markText(m) {
      if (m.type === 'add') return `${fmtT(m.t)} · ${esc(fmtV(m.v))} of ${esc(fmtStock(m.S, m.d))} ${esc(lc(m.d))} → <b>${esc(fmtC(m.c, unitOf(m.d)))}</b> in the bath`;
      if (m.type === 'wash') return `${fmtT(m.t)} · the bath washed out (${m.n}×)`;
      return `${fmtT(m.t)} · the washing solution ${m.d === 'none' ? 'is plain again' : `now holds ${esc(lc(m.d))} ${esc(fmtC(m.c, unitOf(m.d)))}`}`;
    }
    _up(e, cancel) {
      if (e.target.closest && e.target.closest('.ob-readout') && !this._drag) return;
      if (this._ptrs) this._ptrs.delete(e.pointerId);
      if (this._pinch) {
        if (!this._ptrs || this._ptrs.size < 2) this._pinch = null;
        this._drag = null;
        return;
      }
      const D = this._drag;
      this._drag = null;
      if (!D || D.moved || cancel) return;
      // a click (or a tap): a cursor
      const r = this.chartBody.getBoundingClientRect(), g = this._geom();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1) return;
      const t = clamp(this._xToT(x), 0, this.exp.t);
      if (this.cursors.length >= 2) this.cursors = [];
      this.cursors.push(t);
      this._cursorReadout();
      this._drawChart();
    }
    _cursorReadout() {
      const E = this.exp, cs = this.cursors;
      if (!cs.length) {
        this.readout.hidden = true;
        return;
      }
      const v = cs.map((t) => E.at(t));
      let html = `<span class="ob-ca">A</span> ${fmtT(cs[0], true)} · ${this._fmtTension(v[0], 3)} ${this.units}`;
      if (cs.length === 2) {
        const dt = cs[1] - cs[0], dy = v[1] - v[0];
        html += `<br><span class="ob-cb">B</span> ${fmtT(cs[1], true)} · ${this._fmtTension(v[1], 3)} ${this.units}<br><b>B − A: ${dy >= 0 ? '+' : '−'}${this._fmtTension(Math.abs(dy), 3)} ${this.units}</b> in ${Math.abs(dt).toFixed(1)} s
<div class="ob-rbtns"><button class="tbtn" type="button" data-act="keep">Add to the results</button><button class="tbtn" type="button" data-act="clear">Clear</button></div>`;
        bus.emit('bath:measure', { dt: Number(dt.toFixed(2)), dy: Number(dy.toFixed(4)) });
      } else html += '<div class="ob-hint2">Click a second point to measure the change.</div>';
      this.readout.innerHTML = html;
      this.readout.hidden = false;
    }
    _clearCursors() {
      this.cursors = [];
      this.readout.hidden = true;
      this._drawChart();
    }
    _keepMeasure() {
      const E = this.exp, cs = this.cursors;
      if (cs.length < 2) return;
      const [t1, t2] = cs[0] <= cs[1] ? cs : [cs[1], cs[0]];
      E.act({ type: 'manual', t1, t2, y1: E.at(t1), y2: E.at(t2) });
      this._clearCursors();
      this._renderTable();
      this._toggleResults(true);
      this._writeCsvSoon();
      this._persistSoon();
    }
    _wheel(e) {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.25 : 0.8;
      const r = this.chartBody.getBoundingClientRect();
      const tAt = this._xToT(e.clientX - r.left);
      const [t0, t1] = this._win();
      const span = clamp((t1 - t0) * f, 10, this._maxSpan());
      if (this.view.end == null && f > 1) {
        this.view.span = span;
      } else {
        const frac = (tAt - t0) / (t1 - t0);
        const nt0 = tAt - frac * span;
        this.view.span = span;
        this.view.end = nt0 + span >= this.exp.t + span * 0.08 ? null : Math.max(span * 0.5, nt0 + span);
      }
      this._drawChart();
    }
    _chartKey(e) {
      const [t0, t1] = this._win();
      const span = t1 - t0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const end = (this.view.end == null ? t1 : this.view.end) + (e.key === 'ArrowLeft' ? -0.25 : 0.25) * span;
        this.view.end = end >= this.exp.t + span * 0.08 ? null : Math.max(span * 0.5, end);
        this._drawChart();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.zoom(0.5);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        this.zoom(2);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.view.end = null;
        this._drawChart();
      } else if (e.key === 'Escape') this._clearCursors();
    }

    /* ================= files: the results, R, pictures ================= */
    _csvText() {
      const E = this.exp;
      const head = ['experiment', 'tissue', 'time_s', 'drug', 'role', 'kind', 'stock_M', 'volume_uL', 'bath_M', 'log_bath_M', 'condition', 'antagonist', 'antagonist_M', 'baseline_g', 'peak_g', 'response_g', 'response_mN', 'pct', 'final', 'use', 'note'];
      const lines = [head.join(',')];
      for (const r of E.rows) {
        const resp = Experiment.response(r);
        const pct = E.pct(r);
        const manual = r.kind === 'manual';
        lines.push([
          E.id, E.type, r.t.toFixed(1), manual ? 'manual' : lc(r.drug), manual ? 'cursors' : 'agonist', r.kind,
          manual ? 'NA' : rnum(r.S), manual ? 'NA' : rnum(r.v), manual ? 'NA' : rnum(r.conc), manual ? 'NA' : Math.log10(r.conc).toFixed(3),
          r.condition, r.ant || '', rnum(r.antM), r.base.toFixed(4), r.ext.toFixed(4), resp.toFixed(4), (resp * GF).toFixed(3),
          Number.isFinite(pct) ? pct.toFixed(1) : 'NA', r.final ? 'TRUE' : 'FALSE', E.excl[r.id] ? 'FALSE' : 'TRUE', E.notes[r.id] || ''
        ].map(csvCell).join(','));
      }
      return lines.join('\n') + '\n';
    }
    _csvPath() {
      return HOME() + '/organbath/' + this.exp.id + '.csv';
    }
    _writeCsv() {
      const E = this.exp;
      if (!E || !this.fs) return null;
      const p = this._csvPath();
      try {
        if (!E.rows.length && !this.fs.exists(p)) return null;
        const text = this._csvText();
        this.fs.mkdirp(HOME() + '/organbath');
        if (!this.fs.exists(p) || this._lastCsv !== p + text) this.fs.writeText(p, text);
        this._lastCsv = p + text;
      } catch (e) {
        console.error(e);
      }
      return p;
    }
    /** save the results (a CSV file) in ~/organbath */
    async save() {
      const E = this.exp;
      if (!E.rows.length) {
        toast('There are no responses to save yet.', 'warn');
        return null;
      }
      const p = await MG.app.saveToFiles(E.id + '.csv', this._csvText(), { folder: '~/organbath', ask: false });
      if (p) {
        this._lastCsv = p + this._csvText();
        bus.emit('bath:export', { path: this.fs.pretty(p), format: 'csv' });
      }
      return p;
    }
    /** save the results and open a script that analyses them in RStudio */
    async toR() {
      const E = this.exp;
      if (!E.rows.length) toast('There are no responses yet: the script will have nothing to analyse until you add some.', 'warn', 5000);
      this._writeCsv();
      if (!this.fs.exists(this._csvPath())) {
        this.fs.mkdirp(HOME() + '/organbath');
        this.fs.writeText(this._csvPath(), this._csvText());
      }
      const path = HOME() + '/organbath/' + E.id + '.R';
      if (!this.fs.exists(path)) this.fs.writeText(path, rScript(E.id, E.title));
      bus.emit('bath:r', { path: this.fs.pretty(path) });
      return MG.app.openInRStudio(path);
    }
    /** a picture of the chart (as it is in view), with a title, saved in ~/organbath */
    async capture() {
      const E = this.exp;
      const W = this.chartBody.clientWidth, Hh = this.chartBody.clientHeight;
      if (!W || !Hh) {
        toast('Show the chart first.', 'warn');
        return null;
      }
      const s = 2, head = 34, foot = 20;
      const cv = document.createElement('canvas');
      cv.width = W * s;
      cv.height = Hh * s;
      this._drawChart(cv);
      const out = document.createElement('canvas');
      out.width = W * s;
      out.height = (Hh + head + foot) * s;
      const c = out.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, out.width, out.height);
      c.scale(s, s);
      c.fillStyle = '#18212f';
      c.font = '600 14px system-ui, sans-serif';
      c.textBaseline = 'middle';
      c.fillText(`${E.title}: ${E.T.solution}, ${E.P.volume} mL, ${E.T.temp} °C`, 12, head / 2);
      c.drawImage(cv, 0, head, W, Hh);
      c.fillStyle = '#647086';
      c.font = '11px system-ui, sans-serif';
      c.fillText('BMS workbench – organ bath (a teaching simulation, not data from a real tissue)', 12, head + Hh + foot / 2);
      const blob = await new Promise((ok) => out.toBlob(ok, 'image/png'));
      const name = `${E.id}-${fmtT(E.t).replace(/:/g, '-')}.png`;
      const p = await MG.app.saveToFiles(name, blob, { folder: '~/organbath', ask: false });
      if (p) {
        bus.emit('bath:capture', { path: this.fs.pretty(p) });
        bus.emit('bath:export', { path: this.fs.pretty(p), format: 'png' });
      }
      return p;
    }

    /* ================= menus and help ================= */
    _menu(anchor) {
      const items = [
        ['plus', 'A fresh guinea-pig ileum', () => this.go('ileum?new=1')],
        ['plus', 'A fresh ring of rat aorta', () => this.go('aorta?new=1')],
        ['plus', 'A ring of rat aorta without its endothelium', () => this.go('aorta?new=1&endothelium=off')]
      ];
      for (const d of [...this.exps].reverse()) {
        if (this.exp && d.id === this.exp.id) continue;
        const T = TISSUES[d.type];
        const num = (/-(\d+)$/.exec(d.id) || [])[1];
        items.push(['flask', `Back to ${T.name.toLowerCase()} ${num}${d.type === 'aorta' && d.opts.endothelium === false ? ' (no endothelium)' : ''}`, () => this._switch(d.id)]);
      }
      items.push(['download', 'Save the results (CSV)', () => this.save()], ['camera', 'Save a picture of the chart', () => this.capture()], ['info', 'About the model', () => this.about()]);
      MG.popmenu(anchor, items);
    }
    help() {
      MG.modal('The organ bath', `
<p>A piece of tissue hangs in warm, aerated physiological salt solution, tied by a thread to a <b>force transducer</b>, which measures the tension it develops. You add drugs to the bath and watch the tension on the chart. It is a simulation (see <b>About</b>, ⓘ), but it behaves as a real tissue does: each tissue is a little different, the responses take time to develop, and there is noise.</p>
<ul>
<li><b>Add a drug:</b> choose the drug, the stock solution and the volume, and press <b>Add to the bath</b>. The concentration it gives in the bath is shown before you add it: the drug is diluted by the bath, C<sub>bath</sub> = C<sub>stock</sub> × <i>v</i> / (<i>V</i> + <i>v</i>). A drug added on top of the same drug adds to it (a <i>cumulative</i> dose).</li>
<li><b>Wait for the plateau</b>, then <b>Wash</b>: the bath is drained and filled with fresh solution three times, and the tissue relaxes. The response – the largest rise above the baseline before the dose (or the fall, for a relaxation) – is measured when you wash, or when you add the next dose of the same drug, and goes into the <b>Results</b>.</li>
<li><b>Time:</b> the clock runs while the tab is in view (×1 is real time; ×5 and ×20 are faster). <b>Plateau</b> lets time run on until the response settles; <b>Wait</b> lets minutes go by at once (for an antagonist to equilibrate, or the tissue to recover). The clock stops while the tab is out of sight.</li>
<li><b>Antagonists:</b> add one to the bath, and it stays until you wash. Tick <i>Put it in the washing solution too</i> (or use the instructions’ buttons) and the bath is washed with a solution that holds it, so that it is there for a whole curve. Leave it to equilibrate with the tissue (10 minutes or so) before you add the agonist.</li>
<li><b>The chart:</b> drag it (or use the arrow keys) to look back, scroll (or pinch, or + and −) to zoom, and <b>Now</b> to follow the trace again. Click two points to measure the change between them with the cursors; <b>Add to the results</b> keeps it.</li>
<li><b>Results</b> are kept in <code>~/organbath/</code> (one CSV file for each tissue), where R can read them: <b>Analyse in R</b> opens a script that plots the concentration–response curves, fits them and works out dose ratios and pA<sub>2</sub>. ✎ adds a note to a response, and 👁 leaves it out of the analysis.</li>
<li><b>Keys:</b> <kbd>Space</kbd> pauses, <kbd>W</kbd> washes, <kbd>P</kbd> goes to the plateau.</li>
</ul>`);
    }
    about(reveal) {
      const E = this.exp, T = E.T;
      const rows = Object.entries(T.act).filter(([d]) => !DRUGS[d].unknown).map(([d, a]) => {
        const acts = [];
        if (a.rec) for (const [rec, x] of Object.entries(a.rec)) acts.push(x.pKA != null ? `agonist at ${esc(T.recNames[rec])} (pK<sub>A</sub> ${x.pKA}, τ ${x.tau})` : `antagonist at ${esc(T.recNames[rec])} (pK<sub>B</sub> ${x.pKB})`);
        if (a.kcl) acts.push(`depolarisation (EC<sub>50</sub> about ${Math.round(a.kcl.ec50 * 1000)} mM K⁺ in all)`);
        if (a.relax) acts.push(`relaxes the muscle (pIC<sub>50</sub> ${a.relax.pIC50})`);
        if (a.ache) acts.push(`inhibits cholinesterase (pIC<sub>50</sub> ${a.ache.pIC50})`);
        if (a.nblock) acts.push(`blocks the channels of the nicotinic receptors of the enteric neurones (pIC<sub>50</sub> ${a.nblock.pIC50}): no amount of nicotine overcomes it`);
        if (a.irrev) acts.push('inactivates the receptors it binds, irreversibly');
        if (a.no) acts.push(`releases NO (pEC<sub>50</sub> ${a.no.pEC50})`);
        if (a.nos) acts.push(`inhibits NO synthase (pIC<sub>50</sub> ${a.nos.pIC50})`);
        if (a.ccb) acts.push(`blocks L-type Ca²⁺ channels (pIC<sub>50</sub> ${a.ccb.pIC50})`);
        return `<tr><td>${esc(DRUGS[d].name)}</td><td>${acts.join('; ')}</td></tr>`;
      }).join('');
      const unk = E.P.act.drugX ? `<p><b>Drugs X and Y</b> are unknowns: each tissue has its own. ${reveal ? `<br>X is ${E.P.act.drugX.truth}.<br>Y is ${E.P.act.drugY.truth}.` : '<button class="linkbtn ob-reveal" type="button">Show what they are</button>'}</p>` : '';
      const m = MG.modal('About the organ bath', `
<p>This is a <b>teaching simulation</b>, not a recording of a real tissue: ${esc(T.prep)}, in ${E.P.volume} mL of ${esc(T.solution)} at ${T.temp} °C, aerated with ${esc(T.gas)}.</p>
<p><b>The model.</b> Each agonist acts through the <i>operational model</i> of Black and Leff (1983): it binds its receptor with an affinity (K<sub>A</sub>) and activates it with an efficacy (τ, which also depends on how many receptors the tissue has); the stimulus is turned into a response by a curve whose maximum is the tissue’s. All the ligands of a receptor compete for it, so that a <b>competitive antagonist</b> (dissociation constant K<sub>B</sub>) shifts the agonist’s curve to the right in parallel, by the dose ratio 1 + [B]/K<sub>B</sub> (Gaddum, Schild); a <b>partial agonist</b> has a low efficacy; an <b>irreversible antagonist</b> inactivates the receptors it occupies, so that the curve shifts and then its maximum falls as the receptor reserve is used up (Furchgott); a relaxant or a Ca²⁺-channel blocker lowers the maximum whatever the agonist (non-competitive, functional antagonism). In the aorta, acetylcholine relaxes the muscle through nitric oxide made by the endothelium (Furchgott and Zawadzki, 1980). Drugs reach and leave the receptors with first-order kinetics; the muscle contracts and relaxes with its own time constants; there is noise, drift and (in the ileum) small spontaneous movements; and each tissue’s values differ a little from the typical ones below (it is made from a seed, ${E.seed}).</p>
<table class="ob-about"><thead><tr><th>Drug</th><th>What it does here (typical values)</th></tr></thead><tbody>${rows}</tbody></table>
${unk}
<p class="muted">The values are typical of those reported for these tissues, rounded, and chosen for teaching. build/organbath/README.md gives the equations and the sources: Black &amp; Leff (1983) <i>Proc R Soc Lond B</i> 220:141; Gaddum (1937) <i>J Physiol</i> 89:7P; Schild (1947) <i>Br J Pharmacol</i> 2:189; Arunlakshana &amp; Schild (1959) <i>Br J Pharmacol</i> 14:48; Furchgott (1966) <i>Adv Drug Res</i> 3:21; Furchgott &amp; Zawadzki (1980) <i>Nature</i> 288:373; and the IUPHAR/BPS Guide to Pharmacology.</p>`);
      const b = m.box.querySelector('.ob-reveal');
      if (b) b.addEventListener('click', () => {
        m.close();
        this.about(true);
      });
    }
  }

  /* ticks and steps for the axes */
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1;
    const raw = span / Math.max(1, n);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  const fmtSpan = (s) => (s >= 3600 ? +(s / 3600).toFixed(1) + ' h' : s >= 120 ? Math.round(s / 60) + ' min' : Math.round(s) + ' s');
  const fmtTick = (v) => (v === 0 ? '0' : Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, ''));
  function timeStep(minStep) {
    for (const s of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200]) if (s >= minStep) return s;
    return 7200;
  }

  /* =================================================================
     The R script that analyses the results (written once for each tissue)
     ================================================================= */
  function rScript(id, title) {
    return `# The organ bath: the responses of ${title.replace(/^Guinea/, 'guinea').replace(/^Rat/, 'rat')} (${id})
# The organ bath tab keeps the table up to date: each row is one dose of an agonist, the concentration it gave in the
# bath (M) and the response it caused. Run the script a line at a time (Ctrl+Enter), or all of it (Ctrl+Shift+Enter).
d <- read.csv("~/organbath/${id}.csv")
d <- subset(d, use & kind %in% c("contraction", "relaxation"))
if (nrow(d) == 0) stop("There are no responses to analyse yet: add an agonist in the organ bath, and wash.")
head(d)

# One curve for each agonist in each condition: control, or with an antagonist in the bath
d$curve <- paste0(d$drug, " (", d$condition, ")")
table(d$curve)

# The size of each response: the rise in tension (g) for a contraction; the % of the tone that relaxed for a relaxation
d$y <- ifelse(d$kind == "contraction", d$response_g, d$pct)

# The Hill equation (a four-parameter logistic curve), against log concentration:
#   y = bottom + (top - bottom) / (1 + 10^((logEC50 - logc) * slope))
hill <- function(logc, bottom, top, logEC50, slope) bottom + (top - bottom) / (1 + 10^((logEC50 - logc) * slope))

# Fit it to one curve with nls(), starting from a guess: the largest response, the concentration that gave about half
# of it, and a slope of 1. With fewer than five concentrations the bottom is held at 0 (no drug, no response).
fit_curve <- function(g) {
  top0 <- max(g$y)
  mid0 <- g$log_bath_M[which.min(abs(g$y - top0 / 2))]
  if (length(unique(g$log_bath_M)) >= 5) {
    f <- try(nls(y ~ hill(log_bath_M, bottom, top, logEC50, slope), data = g,
                 start = list(bottom = 0, top = top0, logEC50 = mid0, slope = 1)), silent = TRUE)
    if (!inherits(f, "try-error")) return(coef(f))
  }
  f <- try(nls(y ~ hill(log_bath_M, 0, top, logEC50, slope), data = g,
               start = list(top = top0, logEC50 = mid0, slope = 1)), silent = TRUE)
  if (inherits(f, "try-error")) return(c(bottom = NA, top = NA, logEC50 = NA, slope = NA))
  c(bottom = 0, coef(f))
}

curves <- split(d, d$curve)
fits <- t(sapply(curves, fit_curve))
fits

# The results of the fits: the largest response (Emax), the EC50 and pEC50 (-log10 EC50), and the slope
results <- data.frame(n = sapply(curves, nrow), Emax = round(fits[, "top"], 2), EC50_M = signif(10^fits[, "logEC50"], 3),
                      pEC50 = round(-fits[, "logEC50"], 2), slope = round(fits[, "slope"], 2))
results

# The concentration-response curves: the points, and the curves fitted to them
cols <- c("black", "red", "blue", "darkgreen", "purple", "orange", "brown", "grey40")
for (k in unique(d$kind)) {
  dk <- d[d$kind == k, ]
  ks <- names(curves)[sapply(curves, function(g) g$kind[1] == k)]
  plot(dk$log_bath_M, dk$y, type = "n", xlab = "log [agonist] (M)",
       ylab = if (k == "contraction") "Contraction (g)" else "Relaxation (% of the tone)",
       ylim = c(0, max(dk$y, na.rm = TRUE) * 1.15), main = paste("${title}:", k))
  for (i in seq_along(ks)) {
    g <- curves[[ks[i]]]
    p <- fits[ks[i], ]
    col <- cols[(i - 1) %% length(cols) + 1]
    points(g$log_bath_M, g$y, pch = 19, col = col)
    if (!anyNA(p)) curve(hill(x, p["bottom"], p["top"], p["logEC50"], p["slope"]), add = TRUE, col = col, lwd = 2)
  }
  legend("topleft", legend = ks, col = cols[(seq_along(ks) - 1) %% length(cols) + 1], pch = 19, lwd = 2, bty = "n", cex = 0.8)
}

# Dose ratios: how many times more agonist gave the same response with the antagonist (EC50 with it / EC50 without)
info <- do.call(rbind, lapply(curves, function(g) g[1, c("drug", "condition", "antagonist", "antagonist_M")]))
info$EC50 <- 10^fits[rownames(info), "logEC50"]
control <- info[info$condition == "control", c("drug", "EC50")]
names(control)[2] <- "EC50_control"
dr <- merge(info[info$condition != "control" & !is.na(info$antagonist_M), ], control, by = "drug")
if (nrow(dr) > 0) {
  dr$dose_ratio <- signif(dr$EC50 / dr$EC50_control, 3)
  # The Schild equation: log(DR - 1) = log[B] - log KB. So each dose ratio gives an estimate of the pA2 (-log KB),
  # if the antagonist is competitive
  dr$pA2 <- round(log10(dr$dose_ratio - 1) - log10(dr$antagonist_M), 2)
  print(data.frame(agonist = dr$drug, antagonist = dr$antagonist, conc_M = dr$antagonist_M, DR = dr$dose_ratio, pA2 = dr$pA2), row.names = FALSE)
  # A Schild plot for each antagonist used at two or more concentrations: log(DR - 1) against log [antagonist].
  # Competitive antagonism gives a straight line with a slope of 1, which crosses the x-axis at log [B] = -pA2.
  for (a in unique(dr$antagonist)) {
    s <- dr[dr$antagonist == a & dr$dose_ratio > 1, ]
    if (length(unique(s$antagonist_M)) < 2) next
    lb <- log10(s$antagonist_M)
    ldr <- log10(s$dose_ratio - 1)
    schild <- lm(ldr ~ lb)
    slope <- unname(coef(schild)[2])
    pA2 <- unname(coef(schild)[1] / slope)
    plot(lb, ldr, pch = 19, xlim = range(c(lb, -pA2)) + c(-0.3, 0.3), ylim = range(c(ldr, 0)) + c(-0.2, 0.2),
         xlab = paste0("log [", a, "] (M)"), ylab = "log (dose ratio - 1)", main = paste("Schild plot:", a))
    abline(schild, lwd = 2)
    abline(h = 0, lty = 2)
    points(-pA2, 0, pch = 4, cex = 1.6, lwd = 2, col = "red")
    text(-pA2, 0, paste0("pA2 = ", round(pA2, 2)), pos = 4, col = "red")
    print(c(slope = round(slope, 2), pA2 = round(pA2, 2)))
  }
}
`;
  }

  MG.OrganBathApp = OrganBathApp;
  MG.OrganBath = { TISSUES, DRUGS, makeParams, model, steady, Sim, Experiment, fmtC, parseConc, parseVol, bathAfter, rScript, hash, H, DT };
})();
