/* =====================================================================
   The Circuits tab: an editor and simulator for electrical circuits, and for
   the circuit models of physiology (pressure ↔ voltage, flow ↔ current,
   resistance to flow ↔ resistance, compliance ↔ capacitance).

   A circuit is a list of elements, each drawn between two points of a grid
   (a ground has one point). Wires join the points; a point that lies on a
   wire is joined to it. The simulator works out the voltage at every point
   and the current through every element, step by step in time (modified
   nodal analysis; capacitors and inductors by the backward Euler method;
   diodes and valves by Newton's method).

   new MG.CircuitApp(root, { fs })   built by page.js when the tab is first shown
     .ready             a promise: the tab has opened the circuit it had last time
     .shown(opts)       the tab is shown (or the window resized)
     .open(ref)         'example:ID' (examples/circuits/ID.circuit.json) or a file of the user's ('~/circuits/x.circuit.json')
     .run() .pause() .reset() .step()
     .newCircuit()      an empty circuit
     .dirty()           true only if the latest changes could not be kept in this browser
   MG.CircuitSim        the simulator on its own (new MG.CircuitSim.Sim(doc) …), for tests

   Events on MG.bus (for the steps of a practical that tick themselves):
     circuit:open     {name, path, example, mode}      a circuit was opened (an example, a file, or a new one)
     circuit:add      {type}                           a component or wire was added
     circuit:edit     {components: {type: n}, total, name, mode, resistor, capacitor, …}   the circuit changed (at most
                                                       every 0.4 s); total counts the parts other than wires, and each
                                                       kind of part has its own count (resistor: 2 …) for data-auto tests
     circuit:run      {name, mode, time}               the simulation started (or went on)
     circuit:switch   {id, label, on}                  a switch was closed (on) or opened
     circuit:measure  {kind, id, label, value, units}  a meter showed a reading (kind 'voltmeter' or 'ammeter'): when
                                                       the circuit runs (again when the reading changes, at most once a
                                                       second) and when a change to the circuit changes it; or a trace
                                                       was added to the plot (kind 'trace'). value is in V or A (mmHg,
                                                       mL/s in physiology mode); a voltmeter's reading is the voltage
                                                       at its + end minus the voltage at its other end
     circuit:mode     {mode}                           'electrical' or 'physiology'
     circuit:save     {path}                           the circuit was saved among the user's files
     circuit:export   {format, path}                   'png', 'svg' or 'csv' saved (path) or downloaded (no path)
   For example, in a chapter: data-auto="circuit:open example=rc-circuit", data-auto="circuit:switch id=S1 on=true",
   data-auto="circuit:edit capacitor>1", data-auto="circuit:measure kind=voltmeter value>3.3 value<3.4".
   ===================================================================== */
(function () {
  'use strict';
  const MG = (window.MG = window.MG || {});

  /* =================================================================
     Quantities, units and the components
     ================================================================= */
  const MODES = ['electrical', 'physiology'];
  /* what each quantity is called, and its unit, in each mode */
  const Q = {
    V: { electrical: ['voltage', 'V'], physiology: ['pressure', 'mmHg'] },
    I: { electrical: ['current', 'A'], physiology: ['flow', 'mL/s'] },
    R: { electrical: ['resistance', 'Ω'], physiology: ['resistance to flow', 'mmHg·s/mL'] },
    C: { electrical: ['capacitance', 'F'], physiology: ['compliance', 'mL/mmHg'] },
    L: { electrical: ['inductance', 'H'], physiology: ['inertance', 'mmHg·s²/mL'] },
    P: { electrical: ['power', 'W'], physiology: ['power', 'mmHg·mL/s'] },
    T: { electrical: ['time', 's'], physiology: ['time', 's'] },
    F: { electrical: ['frequency', 'Hz'], physiology: ['frequency', 'Hz'] }
  };
  const qName = (q, mode) => Q[q][mode][0];
  const qUnit = (q, mode) => Q[q][mode][1];

  /* the components: their names in each mode, the quantity of their main value, its default in each mode, and the
     letters of their names (R1, C1 …) */
  const TYPES = {
    wire: { names: ['Wire', 'Connection'], prefix: 'W' },
    resistor: { names: ['Resistor', 'Resistance (vessel)'], q: 'R', def: [1000, 1], prefix: 'R' },
    capacitor: { names: ['Capacitor', 'Compliance'], q: 'C', def: [100e-6, 1], prefix: 'C' },
    inductor: { names: ['Inductor', 'Inertance'], q: 'L', def: [0.1, 0.01], prefix: 'L' },
    battery: { names: ['Battery (DC voltage)', 'Pressure source'], q: 'V', def: [9, 100], prefix: 'V', vsrc: true },
    isource: { names: ['Current source', 'Flow source'], q: 'I', def: [0.001, 80], prefix: 'I' },
    acsource: { names: ['AC voltage source', 'Pulsatile pressure source'], q: 'V', def: [5, 100], prefix: 'V', vsrc: true, wave: true },
    acisource: { names: ['AC current source', 'Pulsatile flow source (heart)'], q: 'I', def: [0.001, 400], prefix: 'I', wave: true },
    switch: { names: ['Switch', 'Switch (open or block a path)'], prefix: 'S' },
    diode: { names: ['Diode', 'Valve'], prefix: 'D' },
    ground: { names: ['Ground (0 V)', 'Zero pressure (reference)'], prefix: 'GND', one: true },
    voltmeter: { names: ['Voltmeter', 'Pressure gauge'], prefix: 'VM', meter: 'V' },
    ammeter: { names: ['Ammeter', 'Flowmeter'], prefix: 'AM', meter: 'I' }
  };
  const PALETTE = ['wire', 'resistor', 'capacitor', 'inductor', 'battery', 'isource', 'acsource', 'acisource', 'switch', 'diode', 'ground', 'voltmeter', 'ammeter'];
  const typeName = (type, mode) => (TYPES[type] ? TYPES[type].names[mode === 'physiology' ? 1 : 0] : type);
  /* shorter names, for the list of parts */
  const SHORT = {
    battery: ['Battery', 'Pressure source'], acsource: ['AC voltage', 'Pulsing pressure'], acisource: ['AC current', 'Pulsing flow (heart)'],
    switch: ['Switch', 'Switch'], ground: ['Ground', 'Zero pressure'], resistor: ['Resistor', 'Resistance'], isource: ['Current source', 'Flow source']
  };
  const shortName = (type, mode) => (SHORT[type] ? SHORT[type][mode === 'physiology' ? 1 : 0] : typeName(type, mode));
  const WAVES = {
    sine: 'Sine wave',
    square: 'Square wave',
    pulse: 'Pulses (on, then off)',
    halfsine: 'Half-sine pulses (like heartbeats)'
  };

  /* ---------------- numbers: reading what is typed, and writing values ---------------- */
  const PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  // (longest first: a unit is taken off the end before a prefix is looked for – "100 mmHg" is not 100 milli-mHg)
  const UNIT_WORDS = ['mmhg·s²/ml', 'mmhg.s2/ml', 'mmhg s2/ml', 'mmhg·s^2/ml', 'mmhg·s/ml', 'mmhg.s/ml', 'mmhg s/ml', 'mmhgs/ml', 'ml/mmhg', 'ml/s',
    'mmhg', 'ohms', 'ohm', 'Ω', 'hz', 'bpm', 'v', 'a', 'f', 'h', 's', 'w'];
  /** a number typed with an SI prefix and perhaps a unit ("4.7k", "10 µF", "2m", "100 mmHg", "-70 mV") → number, or NaN */
  function parseValue(text) {
    let s = String(text == null ? '' : text).trim().replace(/[−–]/g, '-').replace(/×\s*10\^?/g, 'e');
    // commas: a decimal comma after a lone 0 (0,47), thousands (1,000), and other decimal commas (2,2k)
    s = s.replace(/(^|[^\d])0,(\d)/g, (m0, a, d) => a + '0.' + d).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').replace(/(\d),(\d)/g, '$1.$2');
    if (!s) return NaN;
    const low = s.toLowerCase();
    for (const u0 of UNIT_WORDS) {
      const u = u0.toLowerCase(); // (Ω in lower case is ω)
      if (low.endsWith(u) && low.length > u.length) {
        s = s.slice(0, s.length - u.length).trim();
        break;
      }
    }
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([pnuµμmkKMG]?)$/i.exec(s);
    if (!m) return NaN;
    // (in the prefix, m is milli and M mega: the regular expression ignores case for "e", so look at the letter again)
    const pre = s.slice(m[1].length).trim();
    const f = pre ? PREFIX[pre] : 1;
    if (pre && f == null) return NaN;
    const v = Number((parseFloat(m[1]) * f).toPrecision(15));
    return isFinite(v) ? v : NaN;
  }
  const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  /** a value with an SI prefix: fmtSI(0.0047, 'F') → '4.7 mF'; digits: significant figures; trim: no trailing zeros */
  function fmtSI(v, unit, digits = 3, trim = false) {
    if (v == null || !isFinite(v)) return '–';
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v);
    let k = SI.findIndex(([f]) => a >= f * 0.9995);
    if (k < 0) k = SI.length - 1;
    const [f, p] = SI[k];
    let s = (v / f).toPrecision(digits);
    if (trim && s.includes('.')) s = s.replace(/\.?0+$/, '');
    if (/e/.test(s)) s = String(Number(s));
    return s + ' ' + p + unit;
  }
  /** a value in plain numbers (physiology: "87.5 mmHg", "0.012 mL/s") */
  function fmtPlain(v, unit, digits = 3, trim = false) {
    if (v == null || !isFinite(v)) return '–';
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v);
    let s;
    if (a >= 1e5 || a < 1e-3) {
      const e = Math.floor(Math.log10(a));
      let m = (v / Math.pow(10, e)).toPrecision(digits);
      if (trim) m = m.replace(/\.?0+$/, '');
      s = `${m}×10${sup(e)}`;
    } else {
      s = a >= Math.pow(10, digits) ? String(Math.round(v)) : v.toPrecision(digits);
      if (trim && s.includes('.')) s = s.replace(/\.?0+$/, '');
    }
    return s + ' ' + unit;
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  /** a value of quantity q in this mode */
  function fmtQ(v, q, mode, digits = 3, trim = false) {
    const u = qUnit(q, mode);
    if (mode === 'physiology' && q !== 'T' && q !== 'F') {
      // (pressures and flows below a billionth of a unit are the simulator's rounding, not physiology)
      if ((q === 'V' || q === 'I') && Math.abs(v) < 1e-9) v = 0;
      return fmtPlain(v, u, digits, trim);
    }
    return fmtSI(v, u, digits, trim);
  }

  /* ---------------- the waveforms of the AC sources ---------------- */
  /** the value of a source at time t: offset + amplitude × w(t); w is -1…1 (sine, square) or 0…1 (pulse, half-sine) */
  function sourceValue(el, t) {
    const T = TYPES[el.type];
    if (!T.wave) return Number(el.value) || 0;
    const amp = Number(el.amp) || 0, f = Math.max(0, Number(el.freq) || 0), off = Number(el.offset) || 0;
    const delay = Number(el.delay) || 0;
    const tt = t - delay;
    if (tt < 0 || f === 0) return el.wave === 'sine' && f === 0 ? off : off + (el.wave === 'square' && tt >= 0 ? amp : 0);
    const ph = tt * f;
    const frac = ph - Math.floor(ph);
    const duty = Math.min(1, Math.max(0, el.duty == null ? 0.5 : Number(el.duty)));
    let w = 0;
    if (el.wave === 'square') w = frac < duty ? 1 : -1;
    else if (el.wave === 'pulse') w = frac < duty ? 1 : 0;
    else if (el.wave === 'halfsine') w = frac < duty && duty > 0 ? Math.sin((Math.PI * frac) / duty) : 0;
    else w = Math.sin(2 * Math.PI * ph);
    return off + amp * w;
  }
  /** the times at which a source jumps (square and pulse waves): the simulator lands on them */
  function sourcePeriod(el) {
    const T = TYPES[el.type];
    if (!T || !T.wave) return 0;
    const f = Number(el.freq) || 0;
    return f > 0 ? 1 / f : 0;
  }

  /* =================================================================
     The simulator
     ================================================================= */
  const GMIN = 1e-12; // a tiny conductance from every point to ground: a part with no path to ground still has voltages
  const RMIN = 1e-9; // the smallest resistance (a resistance of 0 is taken as this)
  const resOf = (el) => Math.max(Math.abs(Number(el.value)) || 0, RMIN);

  /** dense LU factorisation with partial pivoting (in place) → {lu, piv} or null if singular */
  function luFactor(A, n) {
    const piv = new Int32Array(n);
    let scale = 0;
    for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(A[i]));
    const tiny = (scale || 1) * 1e-15;
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(A[i * n + k]);
        if (v > max) {
          max = v;
          p = i;
        }
      }
      if (!(max > tiny)) return null;
      piv[k] = p;
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          const t = A[k * n + j];
          A[k * n + j] = A[p * n + j];
          A[p * n + j] = t;
        }
      }
      const d = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (A[i * n + k] /= d);
        if (f !== 0) for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      }
    }
    return { lu: A, piv, n };
  }
  function luSolve(F, b) {
    const { lu, piv, n } = F;
    const x = Float64Array.from(b);
    for (let k = 0; k < n; k++) {
      const p = piv[k];
      if (p !== k) {
        const t = x[k];
        x[k] = x[p];
        x[p] = t;
      }
    }
    for (let i = 0; i < n; i++) {
      let s = x[i];
      for (let j = 0; j < i; j++) s -= lu[i * n + j] * x[j];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
      x[i] = s / lu[i * n + i];
    }
    return x;
  }

  const key = (x, y) => x + ',' + y;
  /** union–find over strings */
  class DSU {
    constructor() {
      this.p = new Map();
    }
    find(a) {
      if (!this.p.has(a)) this.p.set(a, a);
      let r = a;
      while (this.p.get(r) !== r) r = this.p.get(r);
      while (this.p.get(a) !== r) {
        const n = this.p.get(a);
        this.p.set(a, r);
        a = n;
      }
      return r;
    }
    union(a, b) {
      const ra = this.find(a), rb = this.find(b);
      if (ra !== rb) this.p.set(ra, rb);
      return ra !== rb;
    }
  }
  /** is the grid point (px, py) on the segment from (x1, y1) to (x2, y2), but not at its ends? */
  function onSegment(px, py, x1, y1, x2, y2) {
    if ((px === x1 && py === y1) || (px === x2 && py === y2)) return false;
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross !== 0) return false;
    return px >= Math.min(x1, x2) && px <= Math.max(x1, x2) && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
  }

  /** the points of an element: [a] or [a, b] */
  const pointsOf = (el) => (TYPES[el.type] && TYPES[el.type].one ? [[el.x1, el.y1]] : [[el.x1, el.y1], [el.x2, el.y2]]);

  /* The netlist: which points are joined (by wires) into one node, and which node each terminal is on.
     Also: the pieces of wire between the points that lie on it, for the currents in the wires. */
  function netlist(elements) {
    const dsu = new DSU();
    const pts = new Map(); // key → [x, y]
    const addPt = (x, y) => {
      const k = key(x, y);
      if (!pts.has(k)) pts.set(k, [x, y]);
      dsu.find(k);
      return k;
    };
    for (const el of elements) for (const [x, y] of pointsOf(el)) addPt(x, y);
    const wires = elements.filter((e) => e.type === 'wire' && !(e.x1 === e.x2 && e.y1 === e.y2));
    // each wire, cut at the points that lie on it
    const pieces = []; // {wire, a: key, b: key, ax, ay, bx, by}
    for (const w of wires) {
      const on = [];
      for (const [k, [x, y]] of pts) if (onSegment(x, y, w.x1, w.y1, w.x2, w.y2)) on.push([x, y, k]);
      const len2 = (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2;
      on.sort((p, q) => ((p[0] - w.x1) * (w.x2 - w.x1) + (p[1] - w.y1) * (w.y2 - w.y1)) / len2 - ((q[0] - w.x1) * (w.x2 - w.x1) + (q[1] - w.y1) * (w.y2 - w.y1)) / len2);
      const chain = [[w.x1, w.y1, key(w.x1, w.y1)], ...on, [w.x2, w.y2, key(w.x2, w.y2)]];
      for (let i = 0; i + 1 < chain.length; i++) {
        const [ax, ay, a] = chain[i], [bx, by, b] = chain[i + 1];
        dsu.union(a, b);
        pieces.push({ wire: w, a, b, ax, ay, bx, by });
      }
    }
    // the ground: every ground point is the node 0
    const grounds = elements.filter((e) => e.type === 'ground');
    for (let i = 1; i < grounds.length; i++) dsu.union(key(grounds[0].x1, grounds[0].y1), key(grounds[i].x1, grounds[i].y1));
    // how many element ends meet at each point (for the dots at junctions, and the ends that are not joined to anything)
    const ends = new Map();
    for (const el of elements) for (const [x, y] of pointsOf(el)) ends.set(key(x, y), (ends.get(key(x, y)) || 0) + 1);
    for (const p of pieces) {
      // a point on a wire, not at its ends: a T-junction
      if (p.a !== key(p.wire.x1, p.wire.y1)) ends.set(p.a, (ends.get(p.a) || 0) + 2);
    }
    return { dsu, pts, pieces, grounds, ends };
  }

  /* The simulator. doc: { elements: [...] }. Build once for each change of the circuit (or of a switch); keep the state
     (the charge of the capacitors, the current of the inductors) across rebuilds with carryFrom(). */
  class Sim {
    constructor(doc, opts = {}) {
      this.doc = doc;
      this.elements = (doc.elements || []).filter((e) => TYPES[e.type]);
      this.t = 0;
      this.errors = [];
      this.warnings = [];
      this.info = [];
      this.capV = new Map(); // id → voltage across (a − b) at the last step
      this.indI = new Map(); // id → current (a → b) at the last step
      this.diodeState = new Map(); // id → on (ideal valves), or the last voltage (silicon diodes)
      this.build();
      this.chooseStep();
      this.resetState();
    }

    /* ---------- the nodes and unknowns ---------- */
    build() {
      const els = this.elements;
      const net = (this.net = netlist(els));
      const { dsu, grounds } = net;
      // the node of each terminal
      const root = (x, y) => dsu.find(key(x, y));
      // number the nodes: the ground's node is 0
      let refRoot = null;
      if (grounds.length) refRoot = root(grounds[0].x1, grounds[0].y1);
      const roots = new Set();
      for (const el of els) if (el.type !== 'wire') for (const [x, y] of pointsOf(el)) roots.add(root(x, y));
      for (const p of net.pieces) roots.add(dsu.find(p.a));
      this.autoGround = false;
      if (!refRoot) {
        // no ground: the voltages are measured from the negative end of the first source (or any point)
        const src = els.find((e) => TYPES[e.type].vsrc || e.type === 'isource' || e.type === 'acisource') || els.find((e) => e.type !== 'wire');
        if (src) {
          refRoot = root(src.x1, src.y1);
          this.autoGround = true;
        }
      }
      const index = new Map();
      if (refRoot) index.set(refRoot, 0);
      let n = 1;
      for (const r of roots) if (!index.has(r)) index.set(r, n++);
      this.nodeOf = (x, y) => {
        const r = root(x, y);
        return index.has(r) ? index.get(r) : 0;
      };
      this.nNodes = Math.max(1, n);
      this.rootIndex = index;
      // the terminals of each element, and the unknown currents of the voltage-like elements
      this.terms = new Map();
      this.branch = new Map();
      let nb = 0;
      const vloops = new DSU();
      for (const el of els) {
        if (el.type === 'wire') continue;
        const a = this.nodeOf(el.x1, el.y1), b = TYPES[el.type].one ? 0 : this.nodeOf(el.x2, el.y2);
        this.terms.set(el.id, [a, b]);
        if (this.isVBranch(el)) {
          if (a === b) {
            // a source whose ends are joined by a wire
            if (TYPES[el.type].vsrc && Math.abs(this.maxSourceValue(el)) > 0) this.errors.push({ id: el.id, text: `${this.label(el)} is short-circuited: a wire joins its two ends, so it would drive an unlimited ${this.mode === 'physiology' ? 'flow' : 'current'} round the wire.` });
            continue; // (a meter or a closed switch joined by a wire: it carries nothing)
          }
          if (!vloops.union('n' + a, 'n' + b)) {
            this.errors.push({ id: el.id, text: `${this.label(el)} makes a loop with other sources, ammeters or closed switches and nothing to limit the ${this.mode === 'physiology' ? 'flow' : 'current'} round it (a short circuit). Add a resistor to the loop, or take something out.` });
            continue;
          }
          this.branch.set(el.id, this.nNodes - 1 + nb++);
        }
      }
      this.nBranches = nb;
      this.size = this.nNodes - 1 + nb;
      this.hasDiodes = els.some((e) => e.type === 'diode');
      // the parts that no path joins to ground (through anything but a voltmeter or an open switch)
      const conn = new DSU();
      for (let i = 0; i < this.nNodes; i++) conn.find('n' + i);
      for (const el of els) {
        if (el.type === 'wire' || el.type === 'voltmeter' || el.type === 'ground' || (el.type === 'switch' && !el.closed)) continue;
        const [a, b] = this.terms.get(el.id) || [0, 0];
        conn.union('n' + a, 'n' + b);
      }
      this.floating = new Set();
      for (let i = 1; i < this.nNodes; i++) if (conn.find('n' + i) !== conn.find('n0')) this.floating.add(i);
      if (this.floating.size && els.some((e) => e.type !== 'wire'))
        this.warnings.push({ text: `Part of the circuit is not connected to the rest${this.autoGround ? '' : ' or to ground'}, so its ${this.mode === 'physiology' ? 'pressures are' : 'voltages are'} not defined (they are shown as 0). Join it up with a wire.` });
      // a current source needs a path for its current, from one end round to the other (through anything but
      // voltmeters, open switches and other current sources); without one, the voltage across it would be unlimited,
      // so it is switched off until the circuit round it is complete
      const path = new DSU();
      for (let i = 0; i < this.nNodes; i++) path.find('n' + i);
      for (const el of els) {
        if (el.type === 'wire' || el.type === 'voltmeter' || el.type === 'ground' || el.type === 'isource' || el.type === 'acisource' || (el.type === 'switch' && !el.closed)) continue;
        const [a, b] = this.terms.get(el.id) || [0, 0];
        path.union('n' + a, 'n' + b);
      }
      this.noPath = new Set();
      for (const el of els) {
        if (el.type !== 'isource' && el.type !== 'acisource') continue;
        const [a, b] = this.terms.get(el.id);
        if (a === b || path.find('n' + a) === path.find('n' + b)) continue;
        this.noPath.add(el.id);
        const what = this.mode === 'physiology' ? 'flow' : 'current';
        this.warnings.push({ id: el.id, text: `${this.label(el)} has no complete path for its ${what}: nothing leads from one of its ends round to the other${els.some((e) => e.type === 'switch' && !e.closed) ? ' (is a switch open?)' : ''}. It is switched off until the circuit round it is complete.` });
      }
      if (this.autoGround && els.some((e) => e.type !== 'wire'))
        this.info.push({ text: `There is no ground in the circuit, so ${this.mode === 'physiology' ? 'pressures' : 'voltages'} are measured from the negative end of ${this.label(els.find((e) => TYPES[e.type].vsrc || e.type === 'isource' || e.type === 'acisource') || els.find((e) => e.type !== 'wire'))}.` });
    }
    get mode() {
      return this.doc.mode === 'physiology' ? 'physiology' : 'electrical';
    }
    label(el) {
      if (!el) return 'it';
      return (el.label ? `${el.label} (${el.id})` : el.id);
    }
    isVBranch(el) {
      return TYPES[el.type].vsrc || el.type === 'ammeter' || (el.type === 'switch' && !!el.closed);
    }
    maxSourceValue(el) {
      if (!TYPES[el.type].wave) return Number(el.value) || 0;
      return Math.abs(Number(el.offset) || 0) + Math.abs(Number(el.amp) || 0);
    }

    /* ---------- the time step, from the circuit's own times ---------- */
    chooseStep() {
      const taus = this.timeConstants();
      const periods = this.elements.map(sourcePeriod).filter((p) => p > 0);
      // (an inductor and a capacitor can ring: the period 2π√(LC) of each pair counts too)
      const Ls = this.elements.filter((e) => e.type === 'inductor' && this.terms.has(e.id)).map((e) => Math.abs(Number(e.value)) || 0).filter((v) => v > 0);
      const Cs = this.elements.filter((e) => e.type === 'capacitor' && this.terms.has(e.id)).map((e) => Math.abs(Number(e.value)) || 0).filter((v) => v > 0);
      for (const L of Ls) for (const C of Cs) periods.push(2 * Math.PI * Math.sqrt(L * C));
      const pulses = this.elements.filter((e) => TYPES[e.type].wave && (e.wave === 'pulse' || e.wave === 'halfsine' || e.wave === 'square')).map((e) => sourcePeriod(e) * Math.min(Math.max(Number(e.duty) || 0.5, 0.02), 0.98));
      const fast = Math.min(Infinity, ...taus.map((t) => t / 100), ...periods.map((p) => p / 400), ...pulses.filter((d) => d > 0).map((d) => d / 40));
      const slow = Math.max(0, ...taus, ...periods);
      this.taus = taus;
      this.dynamic = taus.length > 0 || periods.length > 0;
      this.dt = isFinite(fast) && fast > 0 ? Math.min(Math.max(fast, 1e-12), 1e3) : 0.01;
      this.slow = slow > 0 ? slow : 1;
      // simulated seconds for each second on the screen: real time when the circuit's times are between 0.3 s and 5 s,
      // otherwise its slowest time takes about 1.5 s
      this.rate = slow > 0 && (slow < 0.3 || slow > 5) ? slow / 1.5 : 1;
    }
    /** the time constants: for each capacitor C × the resistance it sees, and for each inductor L / the resistance
        it sees (sources off: a voltage source is a short circuit, a current source an open one) */
    timeConstants() {
      const out = [];
      const reactive = this.elements.filter((e) => (e.type === 'capacitor' || e.type === 'inductor') && this.terms.has(e.id));
      for (const el of reactive) {
        const [a, b] = this.terms.get(el.id);
        if (a === b) continue;
        const R = this.resistanceSeen(el.id, a, b);
        // (a capacitor with no path for its charge: only the tiny conductances to ground give it a "resistance")
        if (!(R > 0) || !isFinite(R) || R > Math.max(1e3 * this.maxR(), 1e6) || R > 1e13) continue;
        const v = Math.abs(Number(el.value) || 0);
        if (!v) continue;
        out.push(el.type === 'capacitor' ? v * R : v / R);
      }
      return out;
    }
    maxR() {
      let m = 0;
      for (const el of this.elements) {
        if (el.type === 'resistor') m = Math.max(m, Math.abs(Number(el.value)) || 0);
        if (el.type === 'diode' && el.model === 'ideal') m = Math.max(m, Number(el.ron) || 1e-3);
      }
      return m;
    }
    /** the resistance between nodes a and b, with the sources off and the element itself taken out */
    resistanceSeen(skipId, a, b) {
      const n = this.size;
      if (!n) return Infinity;
      const A = new Float64Array(n * n);
      const z = new Float64Array(n);
      const G = (p, q, g) => this.stampG(A, n, p, q, g);
      for (let i = 1; i < this.nNodes; i++) A[(i - 1) * n + (i - 1)] += GMIN;
      for (const el of this.elements) {
        if (el.type === 'wire' || el.id === skipId || !this.terms.has(el.id)) continue;
        const [p, q] = this.terms.get(el.id);
        if (el.type === 'resistor') G(p, q, 1 / resOf(el));
        else if (el.type === 'diode') G(p, q, el.model === 'ideal' ? 1 / (Number(el.ron) || 1e-3) : 1e-12);
        else if (el.type === 'inductor') G(p, q, 1e6); // (another inductor: a short circuit, roughly)
        if (this.branch.has(el.id)) this.stampV(A, z, n, p, q, this.branch.get(el.id), 0);
      }
      // a test current of 1 into a, out of b
      if (a > 0) z[a - 1] += 1;
      if (b > 0) z[b - 1] -= 1;
      const F = luFactor(A, n);
      if (!F) return Infinity;
      const x = luSolve(F, z);
      const va = a > 0 ? x[a - 1] : 0, vb = b > 0 ? x[b - 1] : 0;
      return Math.abs(va - vb);
    }

    /* ---------- the state ---------- */
    resetState() {
      this.t = 0;
      this.capV.clear();
      this.indI.clear();
      this.diodeState.clear();
      for (const el of this.elements) {
        if (el.type === 'capacitor') this.capV.set(el.id, Number(el.v0) || 0);
        if (el.type === 'inductor') this.indI.set(el.id, Number(el.i0) || 0);
      }
      this.x = new Float64Array(this.size);
      this.cur = new Map();
      this.solveNow(0);
    }
    /** keep the state of the elements that are still there (after the circuit changed) */
    carryFrom(old) {
      if (!old) return;
      this.t = old.t;
      for (const el of this.elements) {
        if (el.type === 'capacitor' && old.capV.has(el.id)) this.capV.set(el.id, old.capV.get(el.id));
        if (el.type === 'inductor' && old.indI.has(el.id)) this.indI.set(el.id, old.indI.get(el.id));
        if (el.type === 'diode' && old.diodeState.has(el.id)) this.diodeState.set(el.id, old.diodeState.get(el.id));
      }
      this.solveNow(0);
    }

    stampG(A, n, p, q, g) {
      if (!A) return;
      if (p > 0) A[(p - 1) * n + (p - 1)] += g;
      if (q > 0) A[(q - 1) * n + (q - 1)] += g;
      if (p > 0 && q > 0) {
        A[(p - 1) * n + (q - 1)] -= g;
        A[(q - 1) * n + (p - 1)] -= g;
      }
    }
    /** a current I through an element from p to q: it leaves p and arrives at q */
    stampI(z, p, q, I) {
      if (p > 0) z[p - 1] -= I;
      if (q > 0) z[q - 1] += I;
    }
    /** a voltage source: V(q) − V(p) = V, with its current (p → q inside it) the unknown k */
    stampV(A, z, n, p, q, k, V) {
      z[k] += V;
      if (!A) return;
      if (p > 0) {
        A[(p - 1) * n + k] += 1;
        A[k * n + (p - 1)] -= 1;
      }
      if (q > 0) {
        A[(q - 1) * n + k] -= 1;
        A[k * n + (q - 1)] += 1;
      }
    }

    /** solve the circuit at time this.t + dt. dt = 0: the state as it is (each capacitor holds its voltage, each
        inductor its current), to show the readings before anything has run; dt > 0: one step of backward Euler from
        the last state */
    solveNow(dt, commit = true) {
      if (this.errors.length) return false;
      const n = this.size;
      if (!n) {
        this.x = new Float64Array(0);
        this.capI = new Map();
        this.currents();
        return true;
      }
      const t = this.t + dt;
      const els = this.elements;
      const hold = dt === 0;
      const diodes = els.filter((e) => e.type === 'diode' && this.terms.has(e.id));
      const caps = els.filter((e) => e.type === 'capacitor' && this.terms.has(e.id));
      const N = n + (hold ? caps.length : 0);
      let x = this.x && this.x.length === n ? this.x : new Float64Array(n);
      this._pendingOn = new Map();
      let ok = false, sol = null;
      const maxIter = diodes.length ? 80 : 1;
      for (let iter = 0; iter < maxIter; iter++) {
        // the matrix only changes with the step, the switches and the diodes: without diodes it is factorised once
        let F = null;
        const cacheKey = hold + ':' + dt;
        if (!diodes.length && this._luKey === cacheKey && this._lu) F = this._lu;
        const A = F ? null : new Float64Array(N * N);
        const z = new Float64Array(N);
        if (A) for (let i = 1; i < this.nNodes; i++) A[(i - 1) * N + (i - 1)] += GMIN;
        let extra = n;
        for (const el of els) {
          if (el.type === 'wire' || !this.terms.has(el.id)) continue;
          const [p, q] = this.terms.get(el.id);
          const T = TYPES[el.type];
          switch (el.type) {
            case 'resistor':
              if (A) this.stampG(A, N, p, q, 1 / resOf(el));
              break;
            case 'capacitor': {
              const C = Math.abs(Number(el.value)) || 0;
              const v0 = this.capV.get(el.id) || 0;
              if (hold) this.stampV(A, z, N, p, q, extra++, -v0); // V(p) − V(q) = v0
              else if (C > 0) {
                const g = C / dt;
                if (A) this.stampG(A, N, p, q, g);
                this.stampI(z, p, q, -g * v0); // i = g (v − v0)
              }
              break;
            }
            case 'inductor': {
              const L = Math.abs(Number(el.value)) || 1e-12;
              const i0 = this.indI.get(el.id) || 0;
              if (!hold && A) this.stampG(A, N, p, q, dt / L);
              this.stampI(z, p, q, i0);
              break;
            }
            case 'isource':
            case 'acisource':
              if (!this.noPath.has(el.id)) this.stampI(z, p, q, sourceValue(el, t));
              break;
            case 'diode': {
              const vd = (p > 0 ? x[p - 1] : 0) - (q > 0 ? x[q - 1] : 0);
              const [g, ieq] = this.diodeLinear(el, vd, iter);
              this.stampG(A, N, p, q, g);
              this.stampI(z, p, q, ieq);
              break;
            }
            default:
              if (this.branch.has(el.id)) this.stampV(A, z, N, p, q, this.branch.get(el.id), T.vsrc ? sourceValue(el, t) : 0);
          }
        }
        if (!F) {
          F = luFactor(A, N);
          if (!F) {
            if (hold) return this.instant();
            this.errors.push({ text: `The circuit cannot be solved: it has a short circuit, or sources that contradict each other. Look for a wire across a source, or two sources side by side.` });
            return false;
          }
          if (!diodes.length) {
            this._lu = F;
            this._luKey = cacheKey;
          }
        }
        sol = luSolve(F, z);
        const xn = sol.subarray(0, n);
        if (hold && (!xn.every(isFinite) || this._runaway(xn))) return this.instant();
        if (!xn.every(isFinite)) {
          this.errors.push({ text: 'The numbers ran away: the circuit has no steady answer. Look for a short circuit.' });
          return false;
        }
        let settled = true;
        for (const d of diodes) {
          const [p, q] = this.terms.get(d.id);
          const vNew = (p > 0 ? xn[p - 1] : 0) - (q > 0 ? xn[q - 1] : 0);
          if (!this.diodeSettled(d, vNew)) settled = false;
        }
        x = Float64Array.from(xn);
        if (settled) {
          ok = true;
          break;
        }
      }
      this.converged = ok || !diodes.length;
      this.x = x;
      // the currents of the capacitors, and the new state
      const capI = new Map();
      let k = n;
      for (const el of caps) {
        const [p, q] = this.terms.get(el.id);
        const v = (p > 0 ? x[p - 1] : 0) - (q > 0 ? x[q - 1] : 0);
        if (hold) capI.set(el.id, sol[k++]);
        else {
          const C = Math.abs(Number(el.value)) || 0;
          capI.set(el.id, C > 0 ? (C / dt) * (v - (this.capV.get(el.id) || 0)) : 0);
          if (commit) this.capV.set(el.id, v);
        }
      }
      this.capI = capI;
      if (!hold && commit) {
        this.t = t;
        for (const el of els) {
          if (el.type !== 'inductor' || !this.terms.has(el.id)) continue;
          const [p, q] = this.terms.get(el.id);
          const v = (p > 0 ? x[p - 1] : 0) - (q > 0 ? x[q - 1] : 0);
          const L = Math.abs(Number(el.value)) || 1e-12;
          this.indI.set(el.id, (this.indI.get(el.id) || 0) + (dt / L) * v);
        }
      }
      this.currents();
      return true;
    }
    /** The state as it is cannot hold when it contradicts the circuit: a capacitor straight across a battery (or
        shorted by a closed switch) cannot keep its old voltage, an inductor in series with a current source cannot
        keep its old current. Then the readings are those of an instant later (a very short step that is not kept),
        which is what a real circuit would show: the capacitor charged at once by a very large current. */
    instant() {
      return this.solveNow(Math.max(this.dt * 1e-3, 1e-15), false);
    }
    /** in the held state, voltages a million times beyond anything the sources could make: only the tiny conductances
        to ground hold them (an inductor's current with nowhere to go) */
    _runaway(xn) {
      let scale = 1;
      for (const el of this.elements) {
        if (TYPES[el.type].vsrc) scale = Math.max(scale, Math.abs(this.maxSourceValue(el)));
        if (el.type === 'capacitor') scale = Math.max(scale, Math.abs(Number(el.v0) || 0), Math.abs(this.capV.get(el.id) || 0));
        if (el.type === 'isource' || el.type === 'acisource') scale = Math.max(scale, Math.abs(this.maxSourceValue(el)) * Math.max(1, this.maxR()));
      }
      for (let i = 0; i < xn.length && i < this.nNodes - 1; i++) if (Math.abs(xn[i]) > 1e6 * scale) return true;
      return false;
    }
    /* diodes: an exponential (silicon) diode, linearised at the voltage of the last iteration (with the step limited, as
       in SPICE); an ideal valve: on (a small resistance, after a forward drop) or off (a very large one) */
    diodeLinear(el, vd, iter) {
      if (el.model === 'ideal') {
        const ron = Math.max(Number(el.ron) || 1e-3, 1e-9), roff = Math.max(Number(el.roff) || 1e9, 1);
        const vf = Number(el.vf) || 0;
        const on = this._pendingOn && this._pendingOn.has(el.id) ? this._pendingOn.get(el.id) : !!this.diodeState.get(el.id);
        if (on) return [1 / ron, -vf / ron];
        return [1 / roff, 0];
      }
      const Is = Number(el.is) || 1e-14, nf = Number(el.n) || 1, vt = 0.025852 * nf;
      let v = iter === 0 ? (this.diodeState.has(el.id) ? this.diodeState.get(el.id) : 0) : vd;
      const vcrit = vt * Math.log(vt / (Math.SQRT2 * Is));
      const vold = this._vLast && this._vLast.has(el.id) ? this._vLast.get(el.id) : v;
      if (iter > 0 && v > vcrit && Math.abs(v - vold) > 2 * vt) {
        if (vold > 0) {
          const arg = 1 + (v - vold) / vt;
          v = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
        } else v = vt * Math.log(Math.max(v / vt, 1e-30));
      }
      v = Math.min(v, 5); // (no diode has more than a few volts across it in forward bias)
      this._vLast = this._vLast || new Map();
      this._vLast.set(el.id, v);
      const e = Math.exp(v / vt);
      const g = (Is / vt) * e + GMIN;
      const i = Is * (e - 1);
      return [g, i - g * v];
    }
    diodeSettled(el, vNew) {
      if (el.model === 'ideal') {
        const vf = Number(el.vf) || 0;
        const ron = Math.max(Number(el.ron) || 1e-3, 1e-9);
        const was = this._pendingOn.has(el.id) ? this._pendingOn.get(el.id) : !!this.diodeState.get(el.id);
        // on: stays on while its current flows forwards; off: turns on when the voltage is above the drop
        const iOn = (vNew - vf) / ron;
        const tiny = 1e-12 * Math.max(1, Math.abs(vf));
        const want = was ? iOn > -tiny : vNew > vf + tiny;
        this._pendingOn.set(el.id, want);
        if (want !== was) return false;
        this.diodeState.set(el.id, want);
        return true;
      }
      const vLast = this._vLast && this._vLast.has(el.id) ? this._vLast.get(el.id) : 0;
      const done = Math.abs(vNew - vLast) < 1e-9 + 1e-6 * Math.abs(vNew);
      if (done) this.diodeState.set(el.id, vNew);
      return done;
    }
    /** the current through each element (a → b), and its voltage */
    currents() {
      const x = this.x, cur = new Map();
      const V = (node) => (node > 0 ? x[node - 1] : 0);
      for (const el of this.elements) {
        if (el.type === 'wire' || !this.terms.has(el.id)) continue;
        const [p, q] = this.terms.get(el.id);
        const v = V(p) - V(q);
        let i = 0;
        switch (el.type) {
          case 'resistor':
            i = v / resOf(el);
            break;
          case 'capacitor':
            i = (this.capI && this.capI.get(el.id)) || 0;
            break;
          case 'inductor':
            i = this.indI.get(el.id) || 0;
            break;
          case 'isource':
          case 'acisource':
            i = this.noPath.has(el.id) ? 0 : sourceValue(el, this.t);
            break;
          case 'diode': {
            if (el.model === 'ideal') {
              const on = !!this.diodeState.get(el.id);
              const ron = Math.max(Number(el.ron) || 1e-3, 1e-9);
              i = on ? (v - (Number(el.vf) || 0)) / ron : 0; // (shut: the tiny leak of the model is not a flow)
            } else {
              const Is = Number(el.is) || 1e-14, vt = 0.025852 * (Number(el.n) || 1);
              i = Is * (Math.exp(Math.min(v, 5) / vt) - 1);
            }
            break;
          }
          default:
            if (this.branch.has(el.id)) i = x[this.branch.get(el.id)];
        }
        cur.set(el.id, { i, v });
      }
      this.cur = cur;
    }
    /** move on by simTime seconds (a duration, not a time to reach), in steps of this.dt or less; → false if it had
        to stop */
    advance(simTime) {
      if (this.errors.length) return false;
      let left = simTime;
      let steps = 0;
      while (left > 1e-15 && steps < 200000) {
        const h = Math.min(this.dt, left);
        if (!this.solveNow(h)) return false;
        left -= h;
        steps++;
        if (this.onStep) this.onStep(this);
      }
      return true;
    }
    /** the voltage of a node, by a grid point on it */
    voltageAt(x, y) {
      const n = this.nodeOf(x, y);
      return n > 0 && this.x.length >= n ? this.x[n - 1] : 0;
    }
    nodeVoltage(n) {
      return n > 0 && this.x.length >= n ? this.x[n - 1] : 0;
    }
    /** the reading of an element: {i, v} (v = V(a) − V(b)) */
    read(id) {
      return this.cur.get(id) || { i: 0, v: 0 };
    }
    /** the time in the simulation, in seconds (the same as .t); advance(d) moves it on by d */
    get time() {
      return this.t;
    }

    /* The currents in the wires. In each node, the wires make a graph of the points they join; each element's end
       puts current in (or takes it out) at its point. Along a spanning tree of each piece of wire the currents follow
       from Kirchhoff's current law; a wire that closes a loop of wires carries none (any share would do). */
    wireCurrents() {
      const out = new Map(); // piece index → current from a to b
      const { pieces } = this.net;
      if (!pieces.length) return out;
      const inj = new Map(); // point key → current into the wires there
      const add = (k, v) => inj.set(k, (inj.get(k) || 0) + v);
      for (const el of this.elements) {
        if (el.type === 'wire') continue;
        const r = this.cur.get(el.id);
        if (!r) continue;
        // the element's current runs a → b inside it: it leaves the wires at a and comes back at b
        if (TYPES[el.type].one) continue;
        add(key(el.x1, el.y1), -r.i);
        add(key(el.x2, el.y2), r.i);
      }
      // the graph of the wire pieces
      const adj = new Map();
      pieces.forEach((p, idx) => {
        if (!adj.has(p.a)) adj.set(p.a, []);
        if (!adj.has(p.b)) adj.set(p.b, []);
        adj.get(p.a).push([p.b, idx, 1]);
        adj.get(p.b).push([p.a, idx, -1]);
      });
      const groundPts = new Set(this.elements.filter((e) => e.type === 'ground').map((e) => key(e.x1, e.y1)));
      const seen = new Set();
      for (const start of adj.keys()) {
        if (seen.has(start)) continue;
        // the component: start from a ground point if it has one (the ground takes up what is left over)
        const comp = [];
        const stack = [start];
        const inComp = new Set([start]);
        while (stack.length) {
          const u = stack.pop();
          comp.push(u);
          for (const [v] of adj.get(u)) if (!inComp.has(v)) {
            inComp.add(v);
            stack.push(v);
          }
        }
        const rootPt = comp.find((k) => groundPts.has(k)) || comp[0];
        // breadth-first tree from the root
        const parent = new Map([[rootPt, null]]);
        const order = [rootPt];
        for (let i = 0; i < order.length; i++) {
          const u = order[i];
          for (const [v, idx, dir] of adj.get(u)) if (!parent.has(v)) {
            parent.set(v, [u, idx, dir]);
            order.push(v);
          }
        }
        for (const k of order) seen.add(k);
        const sum = new Map(order.map((k) => [k, inj.get(k) || 0]));
        for (let i = order.length - 1; i > 0; i--) {
          const v = order[i];
          const [u, idx, dir] = parent.get(v);
          const s = sum.get(v); // what comes into v's subtree must leave it towards u
          // the piece idx runs a → b; dir = 1 if u is its a (so v is b): current from v to u is b → a
          out.set(idx, dir === 1 ? -s : s);
          sum.set(u, sum.get(u) + s);
        }
      }
      return out;
    }
  }

  MG.CircuitSim = { Sim, TYPES, PALETTE, Q, qName, qUnit, parseValue, fmtSI, fmtPlain, fmtQ, sourceValue, netlist, luFactor, luSolve, typeName, WAVES, MODES };

  if (!MG.h) return; // (the simulator alone, outside a page: for tests)
  /* =================================================================
     The editor
     ================================================================= */
  const { h, esc, bus, toast, store } = MG;
  const G = 20; // pixels for each step of the grid (at 100%)
  const ICON = (n) => MG.icon(n);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const TRACE_COLOURS = ['#d1495b', '#2e86ab', '#3c9d5d', '#8f5bd6', '#e08a1e', '#1f9e9e', '#c2398a', '#6b7a12'];
  const BODY = { resistor: 18, capacitor: 5, inductor: 20, battery: 7, isource: 14, acsource: 14, acisource: 14, voltmeter: 14, ammeter: 14, switch: 15, diode: 9 };
  const MIN_LEN = { ground: 1, wire: 1 };
  const minLen = (type) => MIN_LEN[type] || 2;
  const HOME = () => (MG.app && MG.app.HOME) || '/home/user';
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  /* the size of the names in the drawing: 12 px at full size, a little smaller (not much) as the drawing shrinks */
  const labelFont = (sc) => Math.max(9.5, Math.min(13, 12 * Math.sqrt(sc)));
  const fmtNum = (v, d = 4) => (v == null || !isFinite(v) ? '' : String(Number(Number(v).toPrecision(d))));

  /** the default values of a new element of this type, in this mode */
  function defaults(type, mode) {
    const T = TYPES[type];
    const ph = mode === 'physiology';
    const el = { type };
    if (T.def) el.value = T.def[ph ? 1 : 0];
    if (type === 'acsource') Object.assign(el, ph ? { wave: 'halfsine', amp: 120, freq: 1.25, duty: 0.35, offset: 0 } : { wave: 'sine', amp: 5, freq: 1, duty: 0.5, offset: 0 });
    if (type === 'acisource') Object.assign(el, ph ? { wave: 'halfsine', amp: 400, freq: 1.25, duty: 0.35, offset: 0 } : { wave: 'sine', amp: 0.001, freq: 1, duty: 0.5, offset: 0 });
    if (type === 'diode') el.model = ph ? 'ideal' : 'silicon';
    if (type === 'switch') el.closed = false;
    if (type === 'capacitor') el.v0 = 0;
    return el;
  }

  /* ---------------- drawing the symbols (along +x, from 0 to L, in pixels) ---------------- */
  function symbolBody(el, L, mode, ang = 0) {
    const m = L / 2;
    const ph = mode === 'physiology';
    // (letters and signs stay upright, whichever way the part is turned)
    const up = (x, y) => (ang ? ` transform="rotate(${-ang} ${x} ${y})"` : '');
    switch (el.type) {
      case 'resistor':
        return `<rect class="ck-body" x="${m - 18}" y="-7" width="36" height="14" rx="1.5"/>`;
      case 'capacitor':
        return `<path class="ck-plate" d="M${m - 5} -13V13M${m + 5} -13V13"/>`;
      case 'inductor': {
        let d = `M${m - 20} 0`;
        for (let k = 0; k < 4; k++) d += ' a5 5 0 0 1 10 0';
        return `<path class="ck-body ck-nofill" d="${d}"/>`;
      }
      case 'battery':
        return `<path class="ck-plate" d="M${m + 7} -14V14"/><path class="ck-plate thick" d="M${m - 7} -7V7"/><text class="ck-pm" x="${m + 18}" y="-12" text-anchor="middle" dominant-baseline="central"${up(m + 18, -12)}>+</text><text class="ck-pm" x="${m - 18}" y="-12" text-anchor="middle" dominant-baseline="central"${up(m - 18, -12)}>−</text>`;
      case 'isource':
        return `<circle class="ck-body" cx="${m}" cy="0" r="14"/><path class="ck-sym" d="M${m - 8} 0H${m + 6}M${m + 1} -5l5 5-5 5"/>`;
      case 'acisource':
        return `<circle class="ck-body" cx="${m}" cy="0" r="14"/><path class="ck-sym" d="M${m - 8} -2H${m + 6}M${m + 1} -7l5 5-5 5"/><path class="ck-sym thin" d="M${m - 6} 7q2 -3 4 0t4 0t4 0"/>`;
      case 'acsource':
        return `<circle class="ck-body" cx="${m}" cy="0" r="14"/><path class="ck-sym" d="M${m - 9} 0q4.5 -9 9 0t9 0"/><text class="ck-pm" x="${m + 20}" y="-12" text-anchor="middle" dominant-baseline="central"${up(m + 20, -12)}>+</text>`;
      case 'voltmeter':
      case 'ammeter': {
        const letter = el.type === 'voltmeter' ? (ph ? 'P' : 'V') : ph ? 'Q' : 'A';
        const extra = el.type === 'voltmeter' ? `<text class="ck-pm" x="${m + 20}" y="-12" text-anchor="middle" dominant-baseline="central"${up(m + 20, -12)}>+</text>` : `<path class="ck-sym thin" d="M${m + 16} -12h8m-3 -3l3 3-3 3"/>`;
        return `<circle class="ck-body ck-meter" cx="${m}" cy="0" r="14"/><text class="ck-letter" x="${m}" y="0" dominant-baseline="central"${up(m, 0)}>${letter}</text>${extra}`;
      }
      case 'switch': {
        const lever = el.closed ? `M${m - 15} 0L${m + 15} 0` : `M${m - 15} 0L${m - 15 + 30 * Math.cos(0.5)} ${-30 * Math.sin(0.5)}`;
        return `<circle class="ck-pin" cx="${m - 15}" cy="0" r="2.6"/><circle class="ck-pin" cx="${m + 15}" cy="0" r="2.6"/><path class="ck-lever" d="${lever}"/><rect class="ck-hit" x="${m - 18}" y="-18" width="36" height="24"/>`;
      }
      case 'diode':
        return `<path class="ck-body ck-solid" d="M${m - 9} -9L${m - 9} 9L${m + 9} 0Z"/><path class="ck-plate" d="M${m + 9} -9V9"/>`;
      default:
        return '';
    }
  }
  /** the whole element in its own coordinates: the leads (coloured by the voltage of each end) and the body */
  function elementSVG(el, mode) {
    const dx = (el.x2 - el.x1) * G, dy = (el.y2 - el.y1) * G;
    const L = Math.hypot(dx, dy);
    if (el.type === 'ground') {
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const bars = `<path class="ck-gnd" d="M${L} -11V11M${L + 5} -7V7M${L + 10} -3V3"/>`;
      return { transform: `translate(${el.x1 * G} ${el.y1 * G}) rotate(${ang})`, inner: `<line class="ck-lead lead-a" x1="0" y1="0" x2="${L}" y2="0"/>${bars}` };
    }
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const bw = BODY[el.type] || 0;
    const m = L / 2;
    const inner = `<line class="ck-lead lead-a" x1="0" y1="0" x2="${Math.max(0, m - bw)}" y2="0"/><line class="ck-lead lead-b" x1="${Math.min(L, m + bw)}" y1="0" x2="${L}" y2="0"/>` + symbolBody(el, L, mode, ang);
    return { transform: `translate(${el.x1 * G} ${el.y1 * G}) rotate(${ang})`, inner };
  }
  /** a small picture of a component for the palette */
  function paletteIcon(type, mode) {
    // (all 42 pixels wide, so that the names line up)
    if (type === 'wire') return `<svg viewBox="-4 -14 88 28" width="42" height="14" aria-hidden="true"><path class="ck-lead" d="M2 6H40V-6H78"/><circle class="ck-pin" cx="2" cy="6" r="3"/><circle class="ck-pin" cx="78" cy="-6" r="3"/></svg>`;
    if (type === 'ground') return `<svg viewBox="-32 -4 84 34" width="42" height="17" aria-hidden="true"><g transform="rotate(90)"><line class="ck-lead" x1="0" y1="-10" x2="14" y2="-10"/><path class="ck-gnd" d="M14 -21V1M19 -17V-3M24 -13V-7"/></g></svg>`;
    const el = defaults(type, mode);
    const L = 80;
    const bw = BODY[type] || 0;
    return `<svg viewBox="-2 -20 84 40" width="42" height="20" aria-hidden="true"><line class="ck-lead" x1="0" y1="0" x2="${40 - bw}" y2="0"/><line class="ck-lead" x1="${40 + bw}" y1="0" x2="80" y2="0"/>${symbolBody(el, L, mode)}</svg>`;
  }

  /* ---------------- the colours of voltages ---------------- */
  function mix(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const NEUTRAL = '#59657a', POS = '#14a14b', NEG = '#d6402f', WIRE = '#3b4658';
  const voltColour = (v, vref) => {
    if (!(vref > 0)) return NEUTRAL;
    const t = Math.max(-1, Math.min(1, v / vref));
    return t >= 0 ? mix(NEUTRAL, POS, Math.sqrt(t)) : mix(NEUTRAL, NEG, Math.sqrt(-t));
  };

  /* ---------------- the axes of the plot: a unit with its prefix, and nice numbers ---------------- */
  function axisScale(maxAbs, q, mode) {
    const unit = qUnit(q, mode);
    if (mode === 'physiology' && q !== 'T' && q !== 'F') return { f: 1, unit };
    if (!(maxAbs > 0)) return { f: 1, unit };
    let k = SI.findIndex(([f]) => maxAbs >= f * 0.9995);
    if (k < 0) k = SI.length - 1;
    return { f: SI[k][0], unit: SI[k][1] + unit };
  }
  function niceTicks(lo, hi, n = 5) {
    if (!(hi > lo)) {
      const d = Math.abs(lo) || 1;
      lo -= d * 0.5;
      hi += d * 0.5;
    }
    const span = hi - lo;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const a = Math.ceil(lo / step) * step;
    const out = [];
    for (let v = a; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: out, step };
  }

  class CircuitApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || (MG.app && MG.app.fs);
      this.doc = this.blank();
      this.view = { x: 40, y: 40, s: 1 }; // screen = world × s + (x, y)
      this.sel = new Set();
      this.tool = 'select';
      this.undoStack = [];
      this.redoStack = [];
      this.running = false;
      this.speed = 0; // a power of 2: the speed is the circuit's own rate × 2^speed
      this.rec = { t: [], v: [] };
      this.flowOffset = new Map();
      this.keptOk = true;
      this.savedSnap = null; // what was last saved to (or opened from) a file
      this._build();
      this._wire();
      this.ready = this._start();
      MG.app = MG.app || {};
      MG.app.circuit = this;
    }
    blank() {
      return { format: 'bms-circuit-1', title: 'Untitled circuit', description: '', mode: 'electrical', elements: [], traces: [], settings: {} };
    }
    async _start() {
      const kept = store.get('circuit', null);
      if (kept && kept.doc && Array.isArray(kept.doc.elements)) {
        this.load(kept.doc, { path: kept.path || null, example: kept.example || null, quiet: true });
        if (kept.view) this.view = kept.view;
        this.savedSnap = kept.savedSnap || null;
        this.render();
      } else {
        await this.open('example:ohms-law', { quiet: true }).catch(() => this.load(this.blank(), { quiet: true }));
      }
      this._examples().catch(() => {});
    }

    /* ================= the page ================= */
    _build() {
      const r = this.root;
      r.classList.add('ck');
      r.innerHTML = '';
      const tb = (icon, label, title, cls) => h('button.tbtn' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, html: ICON(icon) + (label ? `<span>${esc(label)}</span>` : '') });
      this.btn = {
        menu: tb('folder', 'Circuit', 'New circuit, examples, open, save and export', 'lbl'),
        save: tb('save', 'Save', 'Save the circuit in your files (Ctrl+S)', 'lbl.savebtn'),
        undo: tb('reset', '', 'Undo (Ctrl+Z)'),
        redo: tb('rerun', '', 'Redo (Ctrl+Y)'),
        select: tb('arrow', 'Select', 'Select and move (Esc)', 'tool.lbl'),
        wire: tb('pencil', 'Wire', 'Draw wires: drag from one point to another (W)', 'tool.lbl'),
        probe: tb('chart', 'Plot', 'Click a component or a wire to plot it against time (P)', 'tool.lbl'),
        rotate: tb('spin', '', 'Turn the selected parts by 90° (R)', 'edit'),
        flip: tb('superpose', '', 'Swap the ends of the selected part (F): turns a battery or a diode round', 'edit'),
        del: tb('trash', '', 'Delete the selected parts (Delete)', 'edit'),
        run: tb('play', 'Run', 'Run the simulation (Space)', 'run.lbl'),
        step: tb('fastforward', '', 'Run for a moment, then stop', 'stepbtn'),
        reset: tb('history', '', 'Back to the start: time 0, capacitors uncharged'),
        help: tb('help', '', 'How to use the circuit simulator', 'helpbtn')
      };
      // zooming: buttons in the corner of the drawing (as well as the mouse wheel and two fingers)
      const zb = (icon, title) => h('button', { type: 'button', title, 'aria-label': title, html: ICON(icon) });
      this.btn.zoomIn = zb('plus', 'Zoom in');
      this.btn.zoomOut = zb('minus', 'Zoom out');
      this.btn.fit = zb('maximize', 'Fit the circuit in the window');
      this.zoomBox = h('div.ck-zoombox', { role: 'group', 'aria-label': 'Zoom' }, this.btn.zoomIn, this.btn.zoomOut, this.btn.fit);
      this.timeEl = h('span.ck-time', { title: 'The time in the simulation' }, 't = 0 s');
      this.speedIn = h('input.ck-speed', { type: 'range', min: '-4', max: '4', step: '1', value: '0', title: 'How fast the simulation runs', 'aria-label': 'Speed of the simulation' });
      this.speedLbl = h('span.ck-speedlbl', '×1');
      this.modeSeg = h('div.ck-seg', { role: 'group', 'aria-label': 'Labels' },
        (this.modeE = h('button', { type: 'button', 'data-mode': 'electrical', title: 'Electrical names and units: volts, amps, ohms, farads' }, 'Electrical')),
        (this.modeP = h('button', { type: 'button', 'data-mode': 'physiology', title: 'Physiological names and units: pressure (mmHg), flow (mL/s), resistance, compliance' }, 'Physiology')));
      this.top = h('div.ck-top', this.btn.menu, this.btn.save, h('span.ck-sep'), this.btn.undo, this.btn.redo, h('span.ck-sep'),
        this.btn.select, this.btn.wire, this.btn.probe, h('span.ck-sep.edit'), this.btn.rotate, this.btn.flip, this.btn.del, h('span.ck-sep'),
        this.btn.run, this.btn.step, this.btn.reset, h('label.ck-speedbox', this.speedIn, this.speedLbl), this.timeEl, h('span.grow'),
        this.modeSeg, this.btn.help);
      // the palette
      this.pal = h('div.ck-pal', { role: 'toolbar', 'aria-label': 'Components' });
      // the drawing
      this.svg = document.createElementNS(SVGNS, 'svg');
      this.svg.setAttribute('class', 'ck-svg');
      this.svg.setAttribute('role', 'img');
      this.svg.innerHTML = '<g class="ck-world"><g class="ck-wires"></g><g class="ck-els"></g><g class="ck-flow"></g><g class="ck-dots"></g><g class="ck-marks"></g><g class="ck-sel"></g><g class="ck-over"></g></g><g class="ck-labels"></g>';
      this.world = this.svg.querySelector('.ck-world');
      this.layer = {};
      for (const k of ['wires', 'els', 'flow', 'dots', 'marks', 'labels', 'sel', 'over']) this.layer[k] = this.svg.querySelector('.ck-' + k);
      this.tip = h('div.ck-tip', { hidden: true, role: 'status' });
      this.status = h('div.ck-status', { 'aria-live': 'polite' });
      this.hint = h('div.ck-hint', { hidden: true });
      this.stage = h('div.ck-stage', { tabindex: '0', 'aria-label': 'The circuit. Arrow keys move the selected parts; Delete deletes them.' }, this.svg, this.hint, this.tip, this.status, this.zoomBox);
      // the inspector
      this.insp = h('div.ck-insp', { 'aria-label': 'Properties' });
      this.inspToggle = h('button.ck-insptoggle', { type: 'button', title: 'Show or hide the properties', html: ICON('sidebar') });
      // the plot
      this.plotBox = h('div.ck-plot');
      this.plotHead = h('div.ck-plothead');
      this.plotCanvas = h('canvas.ck-plotcv', { 'aria-label': 'Plot of the traces against time' });
      this.plotEmpty = h('div.ck-plotempty');
      this.plotBody = h('div.ck-plotbody', this.plotCanvas, this.plotEmpty);
      this.plotBox.append(this.plotHead, this.plotBody);
      this.mid = h('div.ck-mid', this.pal, this.stage, this.insp, this.inspToggle);
      r.append(this.top, this.mid, this.plotBox);
      this._renderPalette();
    }
    _renderPalette() {
      const mode = this.doc.mode;
      this.pal.innerHTML = '';
      for (const type of PALETTE) {
        const b = h('button.ck-palbtn', { type: 'button', 'data-type': type, title: `${typeName(type, mode)}: click it, then click on the grid (or drag across it, or drag it onto the grid)`, html: paletteIcon(type, mode) + `<span>${esc(shortName(type, mode))}</span>` });
        if (this.tool === 'place:' + type || (type === 'wire' && this.tool === 'wire')) b.classList.add('on');
        b.addEventListener('click', () => {
          // (the wire tool stays on after each wire, so clicking Wire again – as one does before each part – keeps it
          // on: Select, or Esc, ends it)
          if (type === 'wire') this.setTool('wire');
          else this.setTool(this.tool === 'place:' + type ? 'select' : 'place:' + type);
        });
        // drag from the palette onto the drawing
        b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || type === 'wire') return;
          this._palDrag = { type, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false };
        });
        this.pal.appendChild(b);
      }
    }

    /* ================= events ================= */
    _wire() {
      const B = this.btn;
      B.menu.addEventListener('click', () => this.menu());
      B.save.addEventListener('click', () => this.save());
      B.undo.addEventListener('click', () => this.undo());
      B.redo.addEventListener('click', () => this.redo());
      B.select.addEventListener('click', () => this.setTool('select'));
      B.wire.addEventListener('click', () => this.setTool('wire'));
      B.probe.addEventListener('click', () => this.setTool(this.tool === 'probe' ? 'select' : 'probe'));
      B.rotate.addEventListener('click', () => this.rotateSel());
      B.flip.addEventListener('click', () => this.flipSel());
      B.del.addEventListener('click', () => this.deleteSel());
      B.run.addEventListener('click', () => (this.running ? this.pause() : this.run()));
      B.step.addEventListener('click', () => this.step());
      B.reset.addEventListener('click', () => this.reset());
      B.fit.addEventListener('click', () => this.fit());
      B.zoomIn.addEventListener('click', () => this.zoom(1.25));
      B.zoomOut.addEventListener('click', () => this.zoom(0.8));
      B.help.addEventListener('click', () => this.help());
      this.speedIn.addEventListener('input', () => {
        this.speed = Number(this.speedIn.value) || 0;
        this._speedLabel();
        this.doc.settings = Object.assign({}, this.doc.settings, { speed: this.speed });
        this._keep();
      });
      this.modeSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-mode]');
        if (b) this.setMode(b.dataset.mode);
      });
      this.inspToggle.addEventListener('click', () => {
        this._keepDrawer = true;
        this._inspector();
        this.root.classList.toggle('insp-open');
      });
      // the drawing
      const sv = this.svg;
      sv.addEventListener('pointerdown', (e) => this._down(e));
      sv.addEventListener('pointermove', (e) => this._move(e));
      sv.addEventListener('pointerup', (e) => this._up(e));
      sv.addEventListener('pointercancel', (e) => this._up(e, true));
      sv.addEventListener('pointerleave', () => this._hideTip());
      sv.addEventListener('dblclick', (e) => this._dbl(e));
      sv.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
      sv.addEventListener('contextmenu', (e) => this._context(e));
      this.stage.addEventListener('keydown', (e) => this._key(e));
      // (Esc ends a tool also when the focus is on a button – the palette's, just after one was chosen)
      this.root.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.target === this.stage || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (this.tool !== 'select') {
          e.preventDefault();
          this.setTool('select');
        }
      });
      document.addEventListener('keydown', (e) => {
        // (Ctrl+S anywhere in the tab)
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && this._visible()) {
          e.preventDefault();
          this.save();
        }
      });
      // dropping a component dragged from the palette
      document.addEventListener('pointermove', (e) => {
        const d = this._palDrag;
        if (!d || e.pointerId !== d.id) return;
        if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
          d.moved = true;
          this.root.classList.add('ck-dragging');
        }
        if (d.moved) this._ghost(e, d.type);
      });
      document.addEventListener('pointerup', (e) => {
        const d = this._palDrag;
        if (!d || e.pointerId !== d.id) return;
        this._palDrag = null;
        this.root.classList.remove('ck-dragging');
        this.layer.over.innerHTML = '';
        if (!d.moved) return;
        const r = this.svg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const g = this._grid(this._world(e));
        this.place(d.type, g[0], g[1]);
        this.setTool('select');
      });
      if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(this.stage);
      window.addEventListener('resize', () => this._resize());
    }
    /** is the panel of properties a drawer over the drawing (a narrow tab) rather than a column beside it? */
    _drawer() {
      return this.root.offsetWidth > 0 && this.root.offsetWidth < 1040;
    }
    _visible() {
      return this.root.offsetParent !== null;
    }
    shown() {
      this._resize();
      if (!this._fitted) {
        this._fitted = true;
        if (!store.get('circuit', null) || !(store.get('circuit', {}).view)) this.fit();
      }
    }
    _resize() {
      this._fitTop();
      this._applyView();
      this._drawPlot();
    }
    /** the toolbar in one row if it can be: names and the less needed buttons are hidden a step at a time */
    _fitTop() {
      const top = this.top;
      if (!top.offsetWidth) return;
      // (an item is on a second row when its middle is below the bottom of the first item)
      const wraps = () => {
        const kids = [...top.children].filter((c) => c.offsetWidth > 0 && c.offsetHeight > 0);
        if (!kids.length) return false;
        const first = kids[0].getBoundingClientRect().bottom;
        return kids.some((c) => {
          const r = c.getBoundingClientRect();
          return (r.top + r.bottom) / 2 > first;
        });
      };
      for (let i = 1; i <= 7; i++) top.classList.remove('fit' + i);
      for (let i = 1; i <= 7 && wraps(); i++) top.classList.add('fit' + i);
    }

    /* ================= the circuit: load, change, keep ================= */
    load(doc, opts = {}) {
      const d = Object.assign(this.blank(), deep(doc || {}));
      d.mode = d.mode === 'physiology' ? 'physiology' : 'electrical';
      d.elements = (d.elements || []).filter((e) => e && TYPES[e.type]).map((e) => {
        const el = Object.assign({}, e);
        for (const k of ['x1', 'y1', 'x2', 'y2']) el[k] = Math.round(Number(el[k]) || 0);
        if (TYPES[el.type].one && (el.x2 == null || (el.x2 === el.x1 && el.y2 === el.y1))) {
          el.x2 = el.x1;
          el.y2 = el.y1 + 1;
        }
        return el;
      });
      // every element needs a name of its own
      const seen = new Set();
      for (const el of d.elements) {
        if (!el.id || seen.has(el.id)) el.id = this._nextId(el.type, d.elements, seen);
        seen.add(el.id);
      }
      d.traces = (d.traces || []).filter((t) => t && (t.kind === 'node' || d.elements.some((e) => e.id === t.id)));
      this.doc = d;
      this.path = opts.path || null;
      this.example = opts.example || null;
      this.sel.clear();
      this._hideTip();
      this.undoStack = [];
      this.redoStack = [];
      this.speed = Number(d.settings && d.settings.speed) || 0;
      this.speedIn.value = String(this.speed);
      this._speedLabel();
      this.pause();
      this.sim = null;
      this.rebuild(true);
      this.savedSnap = opts.path || opts.example ? this._snap() : null;
      this._renderPalette();
      this._modeButtons();
      this.render();
      this._inspector();
      this._plotHeader();
      this._keep();
      if (!opts.quiet || opts.event) bus.emit('circuit:open', { name: d.title, path: this.path ? this.fs.pretty(this.path) : '', example: this.example || '', mode: d.mode });
    }
    _snap() {
      return JSON.stringify({ e: this.doc.elements, t: this.doc.traces, m: this.doc.mode, n: this.doc.title });
    }
    /** keep the circuit in the browser (it is there after a reload) */
    _keep() {
      this.keptOk = store.set('circuit', { doc: this.doc, path: this.path, example: this.example, view: this.view, savedSnap: this.savedSnap });
    }
    dirty() {
      return !this.keptOk;
    }
    unsaved() {
      return this.doc.elements.length > 0 && this._snap() !== this.savedSnap;
    }
    /** before a change: what to go back to */
    _before() {
      this.undoStack.push(JSON.stringify({ elements: this.doc.elements, traces: this.doc.traces }));
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack = [];
    }
    /** after a change */
    changed(opts = {}) {
      this.rebuild(!!opts.resetTime);
      this.render();
      this._inspector();
      this._plotHeader();
      this._keep();
      this._editEvent();
      this._measureEvents(true);
    }
    _editEvent() {
      clearTimeout(this._editT);
      this._editT = setTimeout(() => {
        // (the counts are also given one by one – resistor: 2, capacitor: 1 … – for the steps of a practical to test)
        const components = {};
        let total = 0;
        for (const el of this.doc.elements) {
          components[el.type] = (components[el.type] || 0) + 1;
          if (el.type !== 'wire') total++;
        }
        const counts = {};
        for (const t of PALETTE) counts[t] = components[t] || 0;
        bus.emit('circuit:edit', Object.assign(counts, { components, total, name: this.doc.title, mode: this.doc.mode }));
      }, 400);
    }
    undo() {
      if (!this.undoStack.length) return toast('Nothing to undo.', null, 1500);
      this.redoStack.push(JSON.stringify({ elements: this.doc.elements, traces: this.doc.traces }));
      const s = JSON.parse(this.undoStack.pop());
      this.doc.elements = s.elements;
      this.doc.traces = s.traces;
      this.sel.clear();
      this.changed();
    }
    redo() {
      if (!this.redoStack.length) return toast('Nothing to redo.', null, 1500);
      this.undoStack.push(JSON.stringify({ elements: this.doc.elements, traces: this.doc.traces }));
      const s = JSON.parse(this.redoStack.pop());
      this.doc.elements = s.elements;
      this.doc.traces = s.traces;
      this.sel.clear();
      this.changed();
    }
    _nextId(type, list, taken) {
      const pre = TYPES[type].prefix;
      if (type === 'ground') {
        let k = 1;
        while ((list || this.doc.elements).some((e) => e.id === 'GND' + k) || (taken && taken.has('GND' + k))) k++;
        return 'GND' + k;
      }
      let n = 1;
      const used = new Set((list || this.doc.elements).map((e) => e.id));
      if (taken) for (const t of taken) used.add(t);
      while (used.has(pre + n)) n++;
      return pre + n;
    }
    byId(id) {
      return this.doc.elements.find((e) => e.id === id);
    }

    /* ================= the simulator ================= */
    /** a new simulator for the circuit as it is now (keeping the time and the charges, unless fresh) */
    rebuild(fresh) {
      const old = this.sim;
      this.sim = new Sim(this.doc);
      if (old && !fresh && !old.errors.length) this.sim.carryFrom(old);
      this.sim.onStep = (s) => this._record(s);
      this._speedLabel();
      if (fresh) this._clearRec();
      this._statusMsg();
      if (this.sim.errors.length && this.running) this.pause();
    }
    run() {
      if (!this.sim || this.sim.errors.length) {
        this._statusMsg();
        return toast(this.sim && this.sim.errors.length ? 'The circuit cannot run until the problem shown is fixed.' : 'There is nothing to run yet.', 'warn');
      }
      if (!this.doc.elements.some((e) => e.type !== 'wire')) return toast('Add some components first.', 'warn');
      // (already running – from a button in the instructions, say: it goes on, and the step still counts)
      if (this.running) return bus.emit('circuit:run', { name: this.doc.title, mode: this.doc.mode, time: this.sim.t });
      this.running = true;
      this.btn.run.innerHTML = ICON('stopsq') + '<span>Pause</span>';
      this.btn.run.classList.add('on');
      this._fitTop();
      this._last = performance.now();
      this._measured = new Map();
      bus.emit('circuit:run', { name: this.doc.title, mode: this.doc.mode, time: this.sim.t });
      const frame = (now) => {
        if (!this.running) return;
        const real = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
        this._last = now;
        this._advance(real);
        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    }
    pause() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this._raf);
      this.btn.run.innerHTML = ICON('play') + '<span>Run</span>';
      this.btn.run.classList.remove('on');
      this._fitTop();
      this._live();
    }
    /** run for a short while (a fiftieth of the circuit's slowest time), then stop */
    step() {
      if (!this.sim || this.sim.errors.length) return this._statusMsg();
      this.pause();
      this.sim.advance(this.sim.slow / 50);
      this._afterAdvance(0.05);
    }
    reset() {
      this.pause();
      this.rebuild(true);
      this.flowOffset.clear();
      this.render();
      this._drawPlot();
    }
    _rate() {
      return (this.sim ? this.sim.rate : 1) * Math.pow(2, this.speed);
    }
    _speedLabel() {
      const f = Math.pow(2, this.speed);
      const rate = this.sim ? this.sim.rate * f : f;
      this.speedLbl.textContent = f === 1 ? '×1' : f > 1 ? '×' + f : '×1/' + 1 / f;
      this.speedIn.title = `How fast the simulation runs: ${fmtSI(rate, 's', 3, true)} of simulated time for each second`;
    }
    _advance(real) {
      const s = this.sim;
      let simTime = this._rate() * real;
      // (at most a few thousand steps for each frame: a very fast circuit is slowed down rather than the page)
      const maxSteps = 2500;
      if (simTime / s.dt > maxSteps) simTime = s.dt * maxSteps;
      if (!s.advance(simTime)) {
        this.pause();
        this._statusMsg();
        this.render();
        return;
      }
      this._afterAdvance(real);
    }
    _afterAdvance(real) {
      this._live(real);
      this._drawPlot();
      this.timeEl.textContent = 't = ' + fmtSI(this.sim.t, 's', 3);
      this._measureEvents();
    }
    /** the meters' readings as events: when one first shows a reading in a run, when it changes as the circuit runs (at
        most once a second), and when it changes because the circuit was changed (edit: no waiting) */
    _measureEvents(edit) {
      if (!this.sim || this.sim.errors.length) return;
      const now = performance.now();
      this._measured = this._measured || new Map();
      for (const el of this.doc.elements) {
        if (el.type !== 'voltmeter' && el.type !== 'ammeter') continue;
        const r = this.sim.read(el.id);
        const val = el.type === 'voltmeter' ? -r.v : r.i;
        const last = this._measured.get(el.id);
        if (last && ((!edit && now - last.at < 1000) || Math.abs(val - last.value) <= 0.01 * Math.max(Math.abs(val), Math.abs(last.value), 1e-15))) continue;
        this._measured.set(el.id, { value: val, at: now });
        const q = el.type === 'voltmeter' ? 'V' : 'I';
        bus.emit('circuit:measure', { kind: el.type, id: el.id, label: el.label || el.id, value: val, units: qUnit(q, this.doc.mode) });
      }
    }

    /* ================= the plot's recording ================= */
    _clearRec() {
      this.rec = { t: [], v: this.doc.traces.map(() => []) };
      this._lastRec = -Infinity;
      if (this.sim) this._record(this.sim, true);
    }
    _traceValue(tr, s) {
      if (tr.kind === 'node') return s.voltageAt(tr.x, tr.y);
      const el = this.byId(tr.id);
      if (!el) return NaN;
      const r = s.read(tr.id);
      if (tr.kind === 'i') return r.i;
      // the voltage across: + at b for the sources and the voltmeter, + at a for the rest
      return this._vAcross(el, r);
    }
    _vAcross(el, r) {
      return TYPES[el.type].vsrc || el.type === 'voltmeter' || el.type === 'isource' || el.type === 'acisource' ? -r.v : r.v;
    }
    _record(s, force) {
      const every = Math.max(s.dt, s.slow / 400);
      if (!force && s.t - this._lastRec < every * 0.999) return;
      this._lastRec = s.t;
      const R = this.rec;
      if (R.v.length !== this.doc.traces.length) {
        while (R.v.length < this.doc.traces.length) R.v.push(R.t.map(() => NaN));
        R.v.length = this.doc.traces.length;
      }
      R.t.push(s.t);
      this.doc.traces.forEach((tr, k) => R.v[k].push(this._traceValue(tr, s)));
      // (a long run: every other point is dropped, to keep at most 20 000)
      if (R.t.length > 20000) {
        R.t = R.t.filter((_, i) => i % 2 === 0);
        R.v = R.v.map((a) => a.filter((_, i) => i % 2 === 0));
      }
    }

    /* ================= drawing ================= */
    _applyView() {
      const v = this.view;
      this.world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.s})`);
      const g = G * v.s;
      this.stage.style.backgroundSize = `${g}px ${g}px`;
      this.stage.style.backgroundPosition = `${v.x - g / 2}px ${v.y - g / 2}px`;
      this.stage.classList.toggle('ck-fine', g < 9);
      this.layer.labels.innerHTML = this.labelsSVG(v.s, v.x, v.y);
    }
    /** the names and values of the parts, at a scale and offset (the screen's, or 1 and 0 for a picture) */
    labelsSVG(sc, ox, oy) {
      let out = '';
      for (const el of this.doc.elements) out += this._labelSVG(el, this.doc.mode, sc, ox, oy);
      const fs = labelFont(sc);
      return `<g style="font-size:${fs}px">${out}</g>`;
    }
    render() {
      const mode = this.doc.mode;
      const s = this.sim;
      const L = this.layer;
      const els = this.doc.elements;
      let wires = '', parts = '', flow = '', dots = '', marks = '';
      for (const el of els) {
        const selc = this.sel.has(el.id) ? ' sel' : '';
        if (el.type === 'wire') {
          wires += `<g class="ck-el ck-wire${selc}" data-id="${esc(el.id)}"><line class="ck-hl" x1="${el.x1 * G}" y1="${el.y1 * G}" x2="${el.x2 * G}" y2="${el.y2 * G}"/><line class="ck-w" x1="${el.x1 * G}" y1="${el.y1 * G}" x2="${el.x2 * G}" y2="${el.y2 * G}"/></g>`;
          continue;
        }
        const { transform, inner } = elementSVG(el, mode);
        const dx = (el.x2 - el.x1) * G, dy = (el.y2 - el.y1) * G;
        const len = Math.hypot(dx, dy);
        parts += `<g class="ck-el ck-${el.type}${selc}${el.type === 'switch' && el.closed ? ' closed' : ''}" data-id="${esc(el.id)}" transform="${transform}"><line class="ck-hl" x1="0" y1="0" x2="${el.type === 'ground' ? len + 10 : len}" y2="0"/>${inner}</g>`;
        if (el.type !== 'ground') flow += `<path class="ck-fl" data-id="${esc(el.id)}" d="M${el.x1 * G} ${el.y1 * G}L${el.x2 * G} ${el.y2 * G}"/>`;
      }
      // the pieces of wire (cut at the points on them) carry the moving dots of the current
      if (s) s.net.pieces.forEach((p, i) => (flow += `<path class="ck-fl" data-piece="${i}" d="M${p.ax * G} ${p.ay * G}L${p.bx * G} ${p.by * G}"/>`));
      // junctions, and ends that are joined to nothing
      if (s) {
        for (const [k, n] of s.net.ends) {
          const [x, y] = k.split(',').map(Number);
          if (n >= 3) dots += `<circle class="ck-junc" cx="${x * G}" cy="${y * G}" r="3.6"/>`;
          else if (n === 1 && !els.some((e) => e.type === 'ground' && e.x1 === x && e.y1 === y)) dots += `<circle class="ck-loose" cx="${x * G}" cy="${y * G}" r="3.2"><title>Not connected to anything</title></circle>`;
        }
      }
      // the points that are plotted
      this.doc.traces.forEach((tr, k) => {
        if (tr.kind !== 'node') return;
        const c = TRACE_COLOURS[k % TRACE_COLOURS.length];
        marks += `<g class="ck-probe" transform="translate(${tr.x * G} ${tr.y * G})"><path d="M0 0L7 -16H19V-8H7" fill="${c}" stroke="#fff" stroke-width="1"/><circle r="4" fill="${c}" stroke="#fff" stroke-width="1.5"/></g>`;
      });
      L.wires.innerHTML = wires;
      L.els.innerHTML = parts;
      L.flow.innerHTML = flow;
      L.dots.innerHTML = dots;
      L.marks.innerHTML = marks;
      this._selHandles();
      this._applyView();
      this.btn.undo.disabled = !this.undoStack.length;
      this.btn.redo.disabled = !this.redoStack.length;
      const hasSel = this.sel.size > 0;
      this.btn.rotate.disabled = this.btn.del.disabled = this.btn.flip.disabled = !hasSel;
      this.hint.hidden = els.length > 0;
      this.hint.innerHTML = `<b>An empty circuit.</b> Click a component on the left, then click on the grid to place it (or drag it across). Join the ends with <b>Wire</b>. ${esc('Or open an example:')} <button type="button" class="linkbtn" data-x="ex">Examples</button>`;
      const ex = this.hint.querySelector('[data-x="ex"]');
      if (ex) ex.addEventListener('click', () => this.menu(ex));
      this.svg.setAttribute('aria-label', `Circuit diagram: ${els.filter((e) => e.type !== 'wire').length} components`);
      this._live();
    }
    /** the name and value of a component, upright, beside it (above it if it lies across, to its right if it stands
        up – or where el.labelPos says: above, below, left, right; none hides it) */
    _labelSVG(el, mode, sc = 1, ox = 0, oy = 0) {
      if (el.type === 'ground' || el.type === 'wire' || el.labelPos === 'none') return '';
      const ax = el.x1 * G, ay = el.y1 * G, bx = el.x2 * G, by = el.y2 * G;
      const mx = ((ax + bx) / 2) * sc + ox, my = ((ay + by) / 2) * sc + oy;
      const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
      const pos = el.labelPos && el.labelPos !== 'auto' ? el.labelPos : horiz ? 'above' : 'right';
      const half = 15 * sc; // (half the height of a part's body)
      const name = el.label ? el.label : el.id;
      const val = this._valueText(el, mode);
      const two = !!val;
      const f = labelFont(sc) / 12;
      let x = mx, y = my, anchor = 'middle';
      if (pos === 'above') y = my - half - (two ? 19 : 6) * f;
      else if (pos === 'below') y = my + half + 13 * f;
      else if (pos === 'right') {
        x = mx + half + 7;
        anchor = 'start';
        y = my - (two ? 3 : -4) * f;
      } else {
        x = mx - half - 7;
        anchor = 'end';
        y = my - (two ? 3 : -4) * f;
      }
      const meter = el.type === 'voltmeter' || el.type === 'ammeter';
      return `<text class="ck-lbl${meter ? ' meter' : ''}" data-id="${esc(el.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"><tspan class="ck-lname">${esc(name)}</tspan>${two ? `<tspan class="ck-lval" x="${x.toFixed(1)}" dy="1.17em">${esc(val)}</tspan>` : ''}</text>`;
    }
    _valueText(el, mode) {
      const T = TYPES[el.type];
      if (el.type === 'voltmeter' || el.type === 'ammeter') return this._meterText(el);
      if (el.type === 'switch') return el.closed ? (mode === 'physiology' ? 'open to flow' : 'closed') : mode === 'physiology' ? 'blocked' : 'open';
      if (el.type === 'diode') return el.model === 'ideal' ? (mode === 'physiology' ? '' : 'ideal') : mode === 'physiology' ? 'silicon' : '';
      if (T.wave) {
        const q = T.q;
        const per = Number(el.freq) > 0 ? (mode === 'physiology' ? `${fmtNum(Number(el.freq) * 60, 3)} /min` : fmtSI(Number(el.freq), 'Hz', 3, true)) : 'steady';
        return `${fmtQ(Number(el.amp) || 0, q, mode, 3, true)} ${el.wave === 'sine' ? 'sine' : el.wave === 'square' ? 'square' : 'pulses'}, ${per}`;
      }
      if (T.q) return fmtQ(Number(el.value) || 0, T.q, mode, 4, true);
      return '';
    }
    _meterText(el) {
      if (!this.sim || this.sim.errors.length) return '–';
      const r = this.sim.read(el.id);
      return el.type === 'voltmeter' ? fmtQ(-r.v, 'V', this.doc.mode) : fmtQ(r.i, 'I', this.doc.mode);
    }
    /** the parts of the drawing that change as the simulation runs: colours, meters, moving dots */
    _live(real) {
      const s = this.sim;
      if (!s || s.errors.length) {
        this.svg.querySelectorAll('.ck-w, .ck-lead').forEach((l) => l.removeAttribute('style'));
        this.layer.flow.classList.add('off');
        return;
      }
      const els = this.doc.elements;
      // the colour of each node, by its voltage
      let vref = 0;
      for (let i = 1; i < s.nNodes; i++) vref = Math.max(vref, Math.abs(s.nodeVoltage(i)));
      const colourAt = (x, y) => voltColour(s.voltageAt(x, y), vref);
      for (const el of els) {
        const g = this.layer[el.type === 'wire' ? 'wires' : 'els'].querySelector(`[data-id="${CSS.escape(el.id)}"]`);
        if (!g) continue;
        if (el.type === 'wire') g.querySelector('.ck-w').style.stroke = colourAt(el.x1, el.y1);
        else {
          const a = g.querySelector('.lead-a'), b = g.querySelector('.lead-b');
          if (a) a.style.stroke = colourAt(el.x1, el.y1);
          if (b) b.style.stroke = colourAt(el.x2, el.y2);
        }
      }
      // the meters
      for (const el of els) {
        if (el.type !== 'voltmeter' && el.type !== 'ammeter') continue;
        const t = this.layer.labels.querySelector(`[data-id="${CSS.escape(el.id)}"] .ck-lval`);
        if (t) t.textContent = this._meterText(el);
      }
      // the moving dots: their speed grows with the current (as its square root, so that small currents show too)
      const wc = s.wireCurrents();
      let iref = 0;
      for (const el of els) if (el.type !== 'wire' && el.type !== 'ground') iref = Math.max(iref, Math.abs(s.read(el.id).i));
      for (const v of wc.values()) iref = Math.max(iref, Math.abs(v));
      this.layer.flow.classList.toggle('off', !(iref > 0));
      const dt = real || 0;
      const move = (path, k, i) => {
        if (!path) return;
        const rel = iref > 0 ? Math.abs(i) / iref : 0;
        if (rel < 1e-4) {
          path.style.visibility = 'hidden';
          return;
        }
        path.style.visibility = '';
        const sp = 70 * Math.sqrt(rel) * Math.sign(i);
        const off = (this.flowOffset.get(k) || 0) - sp * dt;
        this.flowOffset.set(k, off % 1000);
        path.style.strokeDashoffset = off % 1000;
      };
      if (this.running || real) {
        for (const el of els) if (el.type !== 'wire' && el.type !== 'ground') move(this.layer.flow.querySelector(`[data-id="${CSS.escape(el.id)}"]`), 'e:' + el.id, s.read(el.id).i);
        for (const [idx, i] of wc) move(this.layer.flow.querySelector(`[data-piece="${idx}"]`), 'p:' + idx, i);
      }
      this.layer.flow.classList.toggle('still', !this.running);
      if (this._insLive) this._insLive();
      // the readings under the pointer follow the simulation
      if (this._tipId && !this.tip.hidden) {
        const el = this.byId(this._tipId);
        if (el) this.tip.innerHTML = this._readingHTML(el);
        else this._hideTip();
      }
    }
    _selHandles() {
      let out = '';
      for (const id of this.sel) {
        const el = this.byId(id);
        if (!el) continue;
        out += `<circle class="ck-handle" data-end="a" data-id="${esc(id)}" cx="${el.x1 * G}" cy="${el.y1 * G}" r="5.5"/>`;
        if (!TYPES[el.type].one) out += `<circle class="ck-handle" data-end="b" data-id="${esc(id)}" cx="${el.x2 * G}" cy="${el.y2 * G}" r="5.5"/>`;
      }
      this.layer.sel.innerHTML = out;
    }
    fit() {
      const els = this.doc.elements;
      const r = this.svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (!els.length) {
        this.view = { x: 40, y: 40, s: 1 };
        this._applyView();
        return;
      }
      // the parts, and their names (which keep their size on the screen: the scale is found in a few rounds)
      const W = r.width - 24, H = r.height - 24 - (this.status.offsetHeight || 0);
      let sc = 1, box = null;
      for (let round = 0; round < 5; round++) {
        const [x0, y0, x1, y1] = this._extent(sc);
        box = [x0 - 12, y0 - 12, x1 + 12, y1 + 12];
        const ns = Math.max(0.3, Math.min(1.5, Math.min(W / (box[2] - box[0]), H / (box[3] - box[1]))));
        if (Math.abs(ns - sc) < 0.005) {
          sc = ns;
          break;
        }
        sc = ns;
      }
      this.view = { s: sc, x: 12 + (W - (box[2] - box[0]) * sc) / 2 - box[0] * sc, y: 12 + (H - (box[3] - box[1]) * sc) / 2 - box[1] * sc };
      this._applyView();
      this._keep();
    }
    /** the box (in the drawing's pixels) that the parts and their names take up, at the scale sc */
    _extent(sc) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      };
      for (const el of this.doc.elements) {
        add(el.x1 * G, el.y1 * G);
        add(el.x2 * G, el.y2 * G);
        if (el.type === 'ground') add(el.x2 * G, el.y2 * G + 14);
        const lb = this._labelBox(el, sc);
        if (lb) {
          add(lb[0], lb[1]);
          add(lb[2], lb[3]);
        }
      }
      return [x0, y0, x1, y1];
    }
    /** does part of the circuit (or of a name) lie outside the window? */
    _clipped() {
      const r = this.svg.getBoundingClientRect();
      if (!r.width || !r.height || !this.doc.elements.length) return false;
      const v = this.view, [x0, y0, x1, y1] = this._extent(v.s);
      return x0 * v.s + v.x < 0 || y0 * v.s + v.y < 0 || x1 * v.s + v.x > r.width || y1 * v.s + v.y > r.height;
    }
    /** the box (in the drawing's pixels, at scale sc) that a part's name and value take up */
    _labelBox(el, sc) {
      if (el.type === 'ground' || el.type === 'wire' || el.labelPos === 'none') return null;
      const name = el.label || el.id;
      const val = this._valueText(el, this.doc.mode) || '';
      const f = labelFont(sc) / 12;
      const wpx = (Math.max(name.length, val.length) * 6.9 + 4) * f, hpx = (val ? 30 : 16) * f;
      const mx = ((el.x1 + el.x2) / 2) * G, my = ((el.y1 + el.y2) / 2) * G;
      const horiz = Math.abs(el.x2 - el.x1) >= Math.abs(el.y2 - el.y1);
      const pos = el.labelPos && el.labelPos !== 'auto' ? el.labelPos : horiz ? 'above' : 'right';
      const half = 15, w = wpx / sc, hh = hpx / sc;
      if (pos === 'above') return [mx - w / 2, my - half - hh - 4 / sc, mx + w / 2, my - half];
      if (pos === 'below') return [mx - w / 2, my + half, mx + w / 2, my + half + hh];
      if (pos === 'right') return [mx + half + 7 / sc, my - hh / 2, mx + half + 7 / sc + w, my + hh / 2];
      return [mx - half - 7 / sc - w, my - hh / 2, mx - half - 7 / sc, my + hh / 2];
    }
    zoom(f, cx, cy) {
      const v = this.view;
      const r = this.svg.getBoundingClientRect();
      if (cx == null) {
        cx = r.width / 2;
        cy = r.height / 2;
      }
      const s = Math.max(0.25, Math.min(4, v.s * f));
      const k = s / v.s;
      v.x = cx - (cx - v.x) * k;
      v.y = cy - (cy - v.y) * k;
      v.s = s;
      this._applyView();
      this._keepView();
    }
    _keepView() {
      clearTimeout(this._kvT);
      this._kvT = setTimeout(() => this._keep(), 400);
    }

    /* ================= the pointer ================= */
    /** the point of the drawing (in grid steps) under the pointer */
    _world(e) {
      const r = this.svg.getBoundingClientRect();
      return [(e.clientX - r.left - this.view.x) / this.view.s / G, (e.clientY - r.top - this.view.y) / this.view.s / G];
    }
    _grid(w) {
      return [Math.round(w[0]), Math.round(w[1])];
    }
    /** the element under a point of the drawing (within a few pixels on the screen) */
    _hit(w) {
      const tol = 9 / (this.view.s * G);
      let best = null, bd = Infinity;
      for (const el of this.doc.elements) {
        const ax = el.x1, ay = el.y1;
        let bx = el.x2, by = el.y2;
        if (el.type === 'ground') {
          bx = el.x1 + (el.x2 - el.x1) * 1.6;
          by = el.y1 + (el.y2 - el.y1) * 1.6;
        }
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy || 1e-9;
        let t = ((w[0] - ax) * dx + (w[1] - ay) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        let d = Math.hypot(w[0] - (ax + t * dx), w[1] - (ay + t * dy));
        // (the body of a component is wider than its line)
        if (el.type !== 'wire' && t > 0.2 && t < 0.8) d = Math.max(0, d - 10 / G);
        // (wires lose to the components that sit on them)
        if (el.type === 'wire') d += 0.15 * tol;
        if (d < tol && d < bd) {
          bd = d;
          best = el;
        }
      }
      return best;
    }
    _handleAt(w) {
      const tol = 8 / (this.view.s * G);
      for (const id of this.sel) {
        const el = this.byId(id);
        if (!el) continue;
        if (Math.hypot(w[0] - el.x1, w[1] - el.y1) < tol) return { el, end: 'a' };
        if (!TYPES[el.type].one && Math.hypot(w[0] - el.x2, w[1] - el.y2) < tol) return { el, end: 'b' };
      }
      return null;
    }
    _down(e) {
      this.stage.focus({ preventScroll: true });
      this._hideTip();
      this._ptrs = this._ptrs || new Map();
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.svg.setPointerCapture(e.pointerId);
      } catch (err) {
        /* (a pointer that cannot be captured) */
      }
      if (this._ptrs.size === 2) {
        // two fingers: pinch to zoom
        const [p, q] = [...this._ptrs.values()];
        this.drag = { kind: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y), s0: this.view.s, v0: Object.assign({}, this.view), c: [(p.x + q.x) / 2, (p.y + q.y) / 2] };
        return;
      }
      const w = this._world(e), g = this._grid(w);
      const touch = e.pointerType === 'touch';
      if (e.button === 1 || e.button === 2 || this._space) {
        this.drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, v0: Object.assign({}, this.view) };
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (this.tool === 'wire') {
        this.drag = { kind: 'wire', g0: g, g1: g };
        this._preview();
        return;
      }
      if (this.tool.startsWith('place:')) {
        this.drag = { kind: 'place', type: this.tool.slice(6), g0: g, g1: g };
        this._preview();
        return;
      }
      if (this.tool === 'probe') {
        this.drag = { kind: 'probe', g0: g, w0: w };
        return;
      }
      const hd = this._handleAt(w);
      if (hd) {
        this._before();
        this.drag = { kind: 'end', el: hd.el, end: hd.end, moved: false, g0: g, att: this._attached([hd.el], hd.end) };
        return;
      }
      const el = this._hit(w);
      if (el) {
        if (e.shiftKey) {
          if (this.sel.has(el.id)) this.sel.delete(el.id);
          else this.sel.add(el.id);
        } else if (!this.sel.has(el.id)) {
          this.sel.clear();
          this.sel.add(el.id);
        }
        this._selHandles();
        this._paintSel();
        this._inspector();
        const moving = [...this.sel].map((id) => this.byId(id)).filter(Boolean);
        this.drag = { kind: 'move', g0: g, last: g, moved: false, el, items: moving, att: this._attached(moving) };
        return;
      }
      // empty space: a box to select (mouse), or move the drawing (touch)
      if (touch) {
        this.drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, v0: Object.assign({}, this.view), tap: true };
        return;
      }
      if (!e.shiftKey) {
        this.sel.clear();
        this._selHandles();
        this._paintSel();
        this._inspector();
      }
      this.drag = { kind: 'box', w0: w, w1: w };
    }
    /** the ends of wires (not being moved) that sit on the ends of these elements: they stretch to follow them */
    _attached(items, onlyEnd) {
      const ids = new Set(items.map((e) => e.id));
      const pts = new Set();
      for (const el of items) {
        if (!onlyEnd || onlyEnd === 'a') pts.add(key(el.x1, el.y1));
        if (!TYPES[el.type].one && (!onlyEnd || onlyEnd === 'b')) pts.add(key(el.x2, el.y2));
      }
      const att = [];
      for (const w of this.doc.elements) {
        if (w.type !== 'wire' || ids.has(w.id)) continue;
        if (pts.has(key(w.x1, w.y1))) att.push([w, 'a']);
        if (pts.has(key(w.x2, w.y2))) att.push([w, 'b']);
      }
      return att;
    }
    _move(e) {
      if (this._ptrs && this._ptrs.has(e.pointerId)) this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      const w = this._world(e), g = this._grid(w);
      if (!d) {
        this._hover(e, w);
        return;
      }
      if (d.kind === 'pinch') {
        if (this._ptrs.size < 2) return;
        const [p, q] = [...this._ptrs.values()];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        const r = this.svg.getBoundingClientRect();
        this.view = Object.assign({}, d.v0);
        this.zoom(dist / (d.d0 || 1), d.c[0] - r.left, d.c[1] - r.top);
        return;
      }
      if (d.kind === 'pan') {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) d.tap = false;
        this.view.x = d.v0.x + (e.clientX - d.x0);
        this.view.y = d.v0.y + (e.clientY - d.y0);
        this._applyView();
        return;
      }
      if (d.kind === 'wire' || d.kind === 'place') {
        d.g1 = g;
        this._preview();
        return;
      }
      if (d.kind === 'box') {
        d.w1 = w;
        const x = Math.min(d.w0[0], w[0]) * G, y = Math.min(d.w0[1], w[1]) * G;
        this.layer.over.innerHTML = `<rect class="ck-box" x="${x}" y="${y}" width="${Math.abs(w[0] - d.w0[0]) * G}" height="${Math.abs(w[1] - d.w0[1]) * G}"/>`;
        return;
      }
      if (d.kind === 'end') {
        if (g[0] === d.g0[0] && g[1] === d.g0[1] && !d.moved) return;
        const el = d.el;
        const other = d.end === 'a' ? [el.x2, el.y2] : [el.x1, el.y1];
        if (!TYPES[el.type].one && Math.max(Math.abs(g[0] - other[0]), Math.abs(g[1] - other[1])) < minLen(el.type) && el.type !== 'wire') return;
        if (g[0] === other[0] && g[1] === other[1]) return;
        d.moved = true;
        if (d.end === 'a') {
          el.x1 = g[0];
          el.y1 = g[1];
        } else {
          el.x2 = g[0];
          el.y2 = g[1];
        }
        for (const [w2, end] of d.att) {
          if (end === 'a') {
            w2.x1 = g[0];
            w2.y1 = g[1];
          } else {
            w2.x2 = g[0];
            w2.y2 = g[1];
          }
        }
        this.render();
        return;
      }
      if (d.kind === 'move') {
        const ddx = g[0] - d.last[0], ddy = g[1] - d.last[1];
        if (!ddx && !ddy) return;
        if (!d.moved) {
          this._before();
          d.moved = true;
        }
        d.last = g;
        for (const el of d.items) {
          el.x1 += ddx;
          el.y1 += ddy;
          el.x2 += ddx;
          el.y2 += ddy;
        }
        for (const [w2, end] of d.att) {
          if (end === 'a') {
            w2.x1 += ddx;
            w2.y1 += ddy;
          } else {
            w2.x2 += ddx;
            w2.y2 += ddy;
          }
        }
        this.render();
      }
    }
    _up(e, cancel) {
      if (this._ptrs) this._ptrs.delete(e.pointerId);
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.kind === 'pinch') {
        this._keepView();
        return;
      }
      if (d.kind === 'pan') {
        this._keepView();
        if (d.tap && !cancel) {
          this.sel.clear();
          this._selHandles();
          this._paintSel();
          this._inspector();
        }
        return;
      }
      this.layer.over.innerHTML = '';
      if (cancel) {
        if (d.kind === 'move' || d.kind === 'end') this.changed();
        return;
      }
      if (d.kind === 'wire') return this._finishWire(d);
      if (d.kind === 'place') {
        const [x0, y0] = d.g0, [x1, y1] = d.g1;
        if (Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) >= minLen(d.type)) this.place(d.type, x0, y0, x1, y1);
        else this.place(d.type, x0, y0);
        if (!this._sticky) this.setTool('select');
        return;
      }
      if (d.kind === 'probe') {
        const el = this._hit(d.w0);
        if (el && el.type !== 'wire') this._probeMenu(el, e);
        else {
          // a wire, or a point: plot the voltage of that point
          const g = el ? this._nearestPointOn(el, d.w0) : d.g0;
          const net = this.sim && this.sim.net;
          if (net && (net.pts.has(key(g[0], g[1])) || (el && el.type === 'wire'))) this.addTrace({ kind: 'node', x: g[0], y: g[1] });
          else toast('Click a component, or a wire, to plot it.', null, 2500);
        }
        return;
      }
      if (d.kind === 'box') {
        const x0 = Math.min(d.w0[0], d.w1[0]), x1 = Math.max(d.w0[0], d.w1[0]);
        const y0 = Math.min(d.w0[1], d.w1[1]), y1 = Math.max(d.w0[1], d.w1[1]);
        if (x1 - x0 > 0.2 || y1 - y0 > 0.2) {
          for (const el of this.doc.elements) {
            const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
            if (inside(el.x1, el.y1) && inside(el.x2, el.y2)) this.sel.add(el.id);
          }
          this._selHandles();
          this._paintSel();
          this._inspector();
        }
        return;
      }
      if (d.kind === 'end') {
        if (d.moved) this.changed();
        else this.undoStack.pop();
        return;
      }
      if (d.kind === 'move') {
        if (d.moved) {
          this.changed();
          return;
        }
        // a click without moving: a switch changes over; another part shows its panel (where the panel is a drawer)
        if (d.el.type === 'switch' && !e.shiftKey) this.toggleSwitch(d.el);
        else if (this.sel.size === 1 && !e.shiftKey) this._openDrawer();
      }
    }
    /** slide the panel of properties in (in a narrow tab), keeping the selected part in sight */
    _openDrawer() {
      if (!this._drawer()) return;
      this.root.classList.add('insp-open');
      const el = this.sel.size === 1 ? this.byId([...this.sel][0]) : null;
      if (!el) return;
      const r = this.svg.getBoundingClientRect();
      const free = r.width - this.insp.offsetWidth - 16;
      if (free < 120) return; // (a phone: the panel covers nearly all of the drawing anyway)
      const v = this.view;
      let x0 = Math.min(el.x1, el.x2) * G, x1 = Math.max(el.x1, el.x2) * G;
      const lb = this._labelBox(el, v.s);
      if (lb) {
        x0 = Math.min(x0, lb[0]);
        x1 = Math.max(x1, lb[2]);
      }
      const right = x1 * v.s + v.x + 12;
      if (right <= free) return;
      v.x -= Math.min(right - free, Math.max(0, x0 * v.s + v.x - 12));
      this._applyView();
      this._keepView();
    }
    _nearestPointOn(el, w) {
      const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((w[0] - el.x1) * dx + (w[1] - el.y1) * dy) / l2));
      return t < 0.5 ? [el.x1, el.y1] : [el.x2, el.y2];
    }
    _paintSel() {
      this.root.querySelectorAll('.ck-el').forEach((g) => g.classList.toggle('sel', this.sel.has(g.dataset.id)));
      const hasSel = this.sel.size > 0;
      this.btn.rotate.disabled = this.btn.del.disabled = this.btn.flip.disabled = !hasSel;
    }
    /** what would be drawn: a wire's route, or a new component */
    _preview() {
      const d = this.drag;
      if (d.kind === 'wire') {
        const segs = this._route(d.g0, d.g1);
        this.layer.over.innerHTML = segs.map(([a, b]) => `<line class="ck-ghostwire" x1="${a[0] * G}" y1="${a[1] * G}" x2="${b[0] * G}" y2="${b[1] * G}"/>`).join('') + `<circle class="ck-ghostpt" cx="${d.g0[0] * G}" cy="${d.g0[1] * G}" r="4"/>`;
        return;
      }
      const [x0, y0] = d.g0, [x1, y1] = d.g1;
      const long = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) >= minLen(d.type);
      const el = Object.assign(defaults(d.type, this.doc.mode), long ? { x1: x0, y1: y0, x2: x1, y2: y1 } : this._defaultSpan(d.type, x0, y0));
      const { transform, inner } = elementSVG(el, this.doc.mode);
      this.layer.over.innerHTML = `<g class="ck-ghost" transform="${transform}">${inner}</g>`;
    }
    _ghost(e, type) {
      const g = this._grid(this._world(e));
      const el = Object.assign(defaults(type, this.doc.mode), this._defaultSpan(type, g[0], g[1]));
      const { transform, inner } = elementSVG(el, this.doc.mode);
      this.layer.over.innerHTML = `<g class="ck-ghost" transform="${transform}">${inner}</g>`;
    }
    _defaultSpan(type, x, y) {
      if (type === 'ground') return { x1: x, y1: y, x2: x, y2: y + 1 };
      return { x1: x - 2, y1: y, x2: x + 2, y2: y };
    }
    /** a wire from a to b along the grid: across, then up or down (or the other way round, if it is mostly vertical) */
    _route(a, b) {
      if (a[0] === b[0] || a[1] === b[1]) return a[0] === b[0] && a[1] === b[1] ? [] : [[a, b]];
      const horizFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
      const c = horizFirst ? [b[0], a[1]] : [a[0], b[1]];
      return [[a, c], [c, b]];
    }
    _finishWire(d) {
      const segs = this._route(d.g0, d.g1);
      if (!segs.length) return;
      this._before();
      for (const [a, b] of segs) {
        // (not a wire where there is one already)
        if (this.doc.elements.some((w) => w.type === 'wire' && ((w.x1 === a[0] && w.y1 === a[1] && w.x2 === b[0] && w.y2 === b[1]) || (w.x1 === b[0] && w.y1 === b[1] && w.x2 === a[0] && w.y2 === a[1])))) continue;
        const el = { id: this._nextId('wire'), type: 'wire', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
        this.doc.elements.push(el);
      }
      this.changed();
      bus.emit('circuit:add', { type: 'wire' });
    }
    /** add a component: centred on (x0, y0), or from (x0, y0) to (x1, y1) */
    place(type, x0, y0, x1, y1) {
      if (!TYPES[type]) return null;
      this._before();
      const el = Object.assign(defaults(type, this.doc.mode), x1 == null ? this._defaultSpan(type, x0, y0) : { x1: x0, y1: y0, x2: x1, y2: y1 });
      el.id = this._nextId(type);
      this.doc.elements.push(el);
      this.sel.clear();
      this.sel.add(el.id);
      this.changed();
      bus.emit('circuit:add', { type });
      return el;
    }
    _hover(e, w) {
      if (e.pointerType === 'touch') return;
      const el = this._hit(w);
      this.root.querySelectorAll('.ck-el.hover').forEach((g) => g.classList.remove('hover'));
      if (!el) {
        this._hideTip();
        this.svg.style.cursor = this.tool === 'select' ? 'default' : 'crosshair';
        return;
      }
      const g = this.root.querySelector(`.ck-el[data-id="${CSS.escape(el.id)}"]`);
      if (g) g.classList.add('hover');
      this.svg.style.cursor = this.tool === 'select' ? (el.type === 'switch' ? 'pointer' : 'move') : 'crosshair';
      const html = this._readingHTML(el);
      if (!html) return this._hideTip();
      this.tip.innerHTML = html;
      this.tip.hidden = false;
      this._tipId = el.id;
      const r = this.stage.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      if (x + tw > r.width - 4) x = e.clientX - r.left - tw - 10;
      if (y + th > r.height - 4) y = e.clientY - r.top - th - 10;
      this.tip.style.left = Math.max(4, x) + 'px';
      this.tip.style.top = Math.max(4, y) + 'px';
    }
    _hideTip() {
      this.tip.hidden = true;
      this._tipId = null;
    }
    /** the readings of an element, as a few lines of HTML */
    _readingHTML(el) {
      const mode = this.doc.mode;
      const s = this.sim;
      const head = `<b>${esc(el.label || el.id)}</b> · ${esc(typeName(el.type, mode))}`;
      if (!s || s.errors.length) return head;
      if (el.type === 'wire') return `${head}<br>${esc(cap(qName('V', mode)))}: <b>${esc(fmtQ(s.voltageAt(el.x1, el.y1), 'V', mode))}</b>`;
      if (el.type === 'ground') return `${head}<br>${esc(cap(qName('V', mode)))}: <b>0 ${esc(qUnit('V', mode))}</b>`;
      const r = s.read(el.id);
      const v = this._vAcross(el, r);
      const lines = [head];
      if (el.type === 'voltmeter') lines.push(`Reading: <b>${esc(fmtQ(v, 'V', mode))}</b>`);
      else if (el.type === 'ammeter') lines.push(`Reading: <b>${esc(fmtQ(r.i, 'I', mode))}</b>`);
      else {
        lines.push(`${esc(cap(qName('V', mode)))} across: <b>${esc(fmtQ(v, 'V', mode))}</b>`);
        lines.push(`${esc(cap(qName('I', mode)))} through: <b>${esc(fmtQ(Math.abs(r.i), 'I', mode))}</b>${Math.abs(r.i) > 0 ? ' ' + (r.i > 0 ? '(from end 1 to end 2)' : '(from end 2 to end 1)') : ''}`);
        if (mode === 'electrical' && el.type !== 'switch') lines.push(`Power: ${esc(fmtSI(Math.abs(v * r.i), 'W'))}`);
      }
      return lines.join('<br>');
    }
    _dbl(e) {
      const el = this._hit(this._world(e));
      if (!el) return;
      this.sel.clear();
      this.sel.add(el.id);
      this._selHandles();
      this._paintSel();
      this._inspector();
      this._openDrawer();
      const inp = this.insp.querySelector('input.ck-val');
      if (inp) setTimeout(() => {
        inp.focus();
        inp.select();
      }, 20);
    }
    _wheel(e) {
      e.preventDefault();
      const r = this.svg.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      this.zoom(f, e.clientX - r.left, e.clientY - r.top);
    }
    _context(e) {
      e.preventDefault();
      const el = this._hit(this._world(e));
      if (!el) return;
      if (!this.sel.has(el.id)) {
        this.sel.clear();
        this.sel.add(el.id);
        this._selHandles();
        this._paintSel();
        this._inspector();
      }
      const anchor = h('span', { style: { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '1px', height: '1px' } });
      document.body.appendChild(anchor);
      MG.popmenu(anchor, this._elementMenu(el));
      setTimeout(() => anchor.remove(), 100);
    }
    _elementMenu(el) {
      const mode = this.doc.mode;
      const items = [];
      if (el.type !== 'wire' && el.type !== 'ground') {
        items.push(['chart', `Plot the ${qName('V', mode)} across ${el.label || el.id}`, () => this.addTrace({ kind: 'v', id: el.id })]);
        items.push(['chart', `Plot the ${qName('I', mode)} through ${el.label || el.id}`, () => this.addTrace({ kind: 'i', id: el.id })]);
      } else if (el.type === 'wire') items.push(['chart', `Plot the ${qName('V', mode)} of this wire`, () => this.addTrace({ kind: 'node', x: el.x1, y: el.y1 })]);
      if (el.type === 'switch') items.push(['check', el.closed ? 'Open the switch' : 'Close the switch', () => this.toggleSwitch(el)]);
      items.push(['spin', 'Turn by 90°', () => this.rotateSel()], ['superpose', 'Swap its ends', () => this.flipSel()], ['copy', 'Copy', () => this.copySel()], ['trash', 'Delete', () => this.deleteSel()]);
      return items;
    }
    _probeMenu(el, e) {
      const anchor = h('span', { style: { position: 'fixed', left: (e.clientX || 100) + 'px', top: (e.clientY || 100) + 'px', width: '1px', height: '1px' } });
      document.body.appendChild(anchor);
      const mode = this.doc.mode;
      const items = el.type === 'voltmeter' ? [['chart', `Plot the reading of ${el.label || el.id}`, () => this.addTrace({ kind: 'v', id: el.id })]]
        : el.type === 'ammeter' ? [['chart', `Plot the reading of ${el.label || el.id}`, () => this.addTrace({ kind: 'i', id: el.id })]]
        : [['chart', `The ${qName('V', mode)} across ${el.label || el.id}`, () => this.addTrace({ kind: 'v', id: el.id })], ['chart', `The ${qName('I', mode)} through ${el.label || el.id}`, () => this.addTrace({ kind: 'i', id: el.id })]];
      MG.popmenu(anchor, items);
      setTimeout(() => anchor.remove(), 100);
    }
    _key(e) {
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.target !== this.stage) return;
      if (ctrl && (k === 'z' || k === 'Z')) {
        e.preventDefault();
        return e.shiftKey ? this.redo() : this.undo();
      }
      if (ctrl && (k === 'y' || k === 'Y')) {
        e.preventDefault();
        return this.redo();
      }
      if (ctrl && (k === 'c' || k === 'C')) {
        e.preventDefault();
        return this.copySel();
      }
      if (ctrl && (k === 'v' || k === 'V')) {
        e.preventDefault();
        return this.paste();
      }
      if (ctrl && (k === 'a' || k === 'A')) {
        e.preventDefault();
        this.doc.elements.forEach((el) => this.sel.add(el.id));
        this._selHandles();
        this._paintSel();
        return this._inspector();
      }
      if (ctrl) return;
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        return this.deleteSel();
      }
      if (k === 'r' || k === 'R') return this.rotateSel();
      if (k === 'f' || k === 'F') return this.flipSel();
      if (k === 'w' || k === 'W') return this.setTool(this.tool === 'wire' ? 'select' : 'wire');
      if (k === 'p' || k === 'P') return this.setTool(this.tool === 'probe' ? 'select' : 'probe');
      if (k === 'Escape') {
        this.setTool('select');
        this.sel.clear();
        this._selHandles();
        this._paintSel();
        return this._inspector();
      }
      if (k === ' ') {
        e.preventDefault();
        return this.running ? this.pause() : this.run();
      }
      if (k === '+' || k === '=') return this.zoom(1.2);
      if (k === '-' || k === '_') return this.zoom(1 / 1.2);
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k] && this.sel.size) {
        e.preventDefault();
        const [dx, dy] = arrows[k];
        this._before();
        const items = [...this.sel].map((id) => this.byId(id)).filter(Boolean);
        const att = this._attached(items);
        for (const el of items) {
          el.x1 += dx;
          el.y1 += dy;
          el.x2 += dx;
          el.y2 += dy;
        }
        for (const [w2, end] of att) {
          if (end === 'a') {
            w2.x1 += dx;
            w2.y1 += dy;
          } else {
            w2.x2 += dx;
            w2.y2 += dy;
          }
        }
        this.changed();
      }
    }
    setTool(t) {
      this.tool = t;
      this._sticky = false;
      for (const [name, b] of Object.entries({ select: this.btn.select, wire: this.btn.wire, probe: this.btn.probe })) b.classList.toggle('on', t === name);
      this.pal.querySelectorAll('.ck-palbtn').forEach((b) => b.classList.toggle('on', t === 'place:' + b.dataset.type || (t === 'wire' && b.dataset.type === 'wire')));
      this.root.dataset.tool = t.split(':')[0];
      this.svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
      const msg = { wire: 'Drawing wires: drag from one point to another. Esc to stop.', probe: 'Plotting: click a component or a wire to plot it against time. Esc to stop.' }[t];
      if (t.startsWith('place:')) this._toolMsg(`Placing ${typeName(t.slice(6), this.doc.mode).toLowerCase()}: click on the grid, or drag from one end to the other. Esc to stop.`);
      else this._toolMsg(msg || '');
    }
    _toolMsg(text) {
      this._toolText = text;
      this._statusMsg();
    }

    /* ================= changing the selection ================= */
    rotateSel() {
      const items = [...this.sel].map((id) => this.byId(id)).filter(Boolean);
      if (!items.length) return;
      this._before();
      // about the middle of the selection, on the grid
      let cx = 0, cy = 0, n = 0;
      for (const el of items) {
        cx += el.x1 + el.x2;
        cy += el.y1 + el.y2;
        n += 2;
      }
      cx = Math.round(cx / n);
      cy = Math.round(cy / n);
      const rot = (x, y) => [cx - (y - cy), cy + (x - cx)];
      const att = this._attached(items);
      const moved = new Map();
      for (const el of items) {
        const [a1, b1] = rot(el.x1, el.y1), [a2, b2] = rot(el.x2, el.y2);
        moved.set(key(el.x1, el.y1), [a1, b1]);
        moved.set(key(el.x2, el.y2), [a2, b2]);
        Object.assign(el, { x1: a1, y1: b1, x2: a2, y2: b2 });
      }
      for (const [w2, end] of att) {
        const p = end === 'a' ? moved.get(key(w2.x1, w2.y1)) : moved.get(key(w2.x2, w2.y2));
        if (!p) continue;
        if (end === 'a') [w2.x1, w2.y1] = p;
        else [w2.x2, w2.y2] = p;
      }
      this.changed();
    }
    flipSel() {
      const items = [...this.sel].map((id) => this.byId(id)).filter((el) => el && !TYPES[el.type].one);
      if (!items.length) return;
      this._before();
      for (const el of items) [el.x1, el.y1, el.x2, el.y2] = [el.x2, el.y2, el.x1, el.y1];
      this.changed();
    }
    deleteSel() {
      if (!this.sel.size) return;
      this._before();
      const gone = new Set(this.sel);
      this.doc.elements = this.doc.elements.filter((el) => !gone.has(el.id));
      this.doc.traces = this.doc.traces.filter((t) => t.kind === 'node' || !gone.has(t.id));
      this.sel.clear();
      this.changed();
    }
    copySel() {
      const items = [...this.sel].map((id) => this.byId(id)).filter(Boolean);
      if (!items.length) return;
      this._clip = deep(items);
      toast(`Copied ${items.length} part${items.length === 1 ? '' : 's'}. Ctrl+V pastes ${items.length === 1 ? 'it' : 'them'}.`, null, 2000);
    }
    paste() {
      if (!this._clip || !this._clip.length) return;
      this._before();
      this.sel.clear();
      const taken = new Set();
      for (const src of this._clip) {
        const el = Object.assign(deep(src), { x1: src.x1 + 2, y1: src.y1 + 2, x2: src.x2 + 2, y2: src.y2 + 2 });
        el.id = this._nextId(el.type, null, taken);
        taken.add(el.id);
        this.doc.elements.push(el);
        this.sel.add(el.id);
      }
      this._clip = this._clip.map((e) => Object.assign(deep(e), { x1: e.x1 + 2, y1: e.y1 + 2, x2: e.x2 + 2, y2: e.y2 + 2 }));
      this.changed();
    }
    toggleSwitch(el) {
      this._before();
      el.closed = !el.closed;
      this.changed();
      bus.emit('circuit:switch', { id: el.id, label: el.label || el.id, on: !!el.closed });
    }
    /** change a value of an element (from the panel) */
    setProp(el, prop, value) {
      if (el[prop] === value) return;
      this._before();
      el[prop] = value;
      this.changed();
    }

    /* ================= the panel of properties ================= */
    _inspector() {
      const mode = this.doc.mode;
      const P = this.insp;
      this._insLive = null;
      P.innerHTML = '';
      const close = h('button.icon-btn.ck-inspx', { type: 'button', 'aria-label': 'Close the panel', html: ICON('x') });
      close.addEventListener('click', () => this.root.classList.remove('insp-open'));
      const items = [...this.sel].map((id) => this.byId(id)).filter(Boolean);
      if (items.length > 1) {
        P.append(close, h('h4', `${items.length} parts selected`), h('p.ck-note', 'Drag one of them to move them all. R turns them, Delete deletes them, Ctrl+C copies them.'));
        const row = h('div.ck-btnrow');
        for (const [ic, label, fn] of [['spin', 'Turn', () => this.rotateSel()], ['copy', 'Copy', () => this.copySel()], ['trash', 'Delete', () => this.deleteSel()]]) {
          const b = h('button.tbtn', { type: 'button', html: ICON(ic) + `<span>${label}</span>` });
          b.addEventListener('click', fn);
          row.appendChild(b);
        }
        P.appendChild(row);
        return;
      }
      if (items.length === 1) return this._inspectEl(items[0], close);
      if (this._drawer() && !this._keepDrawer) this.root.classList.remove('insp-open');
      this._keepDrawer = false;
      // nothing selected: the circuit itself, and the analogy
      const title = h('input.ck-in', { type: 'text', value: this.doc.title || '', 'aria-label': 'Name of the circuit', maxlength: '80' });
      title.addEventListener('change', () => {
        this.doc.title = title.value.trim() || 'Untitled circuit';
        this._keep();
      });
      P.append(close, h('h4', 'Circuit'), h('label.ck-field', h('span', 'Name'), title));
      if (this.doc.description) P.appendChild(h('p.ck-desc', { html: window.DOMPurify ? window.DOMPurify.sanitize(this.doc.description) : esc(this.doc.description) }));
      const where = this.path ? `Saved as ${this.fs.pretty(this.path)}${this.unsaved() ? ' (with changes since)' : ''}` : this.example ? 'An example: Save keeps your own copy.' : 'Not saved in your files yet.';
      P.appendChild(h('p.ck-note', where));
      P.appendChild(this._analogy());
      P.appendChild(h('p.ck-note', { html: '<b>Tips.</b> Click a part to select it and change it here. Double-click to change its value. Drag the round handles to move one end. <b>Wire</b> draws wires; <b>Plot</b> adds a trace to the plot below.' }));
    }
    _analogy() {
      const mode = this.doc.mode;
      const rows = [['Voltage, V (volts)', 'Pressure, P (mmHg)'], ['Current, I (amperes)', 'Flow, Q (mL/s)'], ['Resistance, R (ohms)', 'Resistance to flow, R (mmHg·s/mL)'], ['Capacitance, C (farads)', 'Compliance, C (mL/mmHg)'],
        ['Inductance, L (henries)', 'Inertance, L (mmHg·s²/mL)'], ['Battery', 'Pressure source (a pump)'], ['Diode', 'Valve'], ['Ground (0 V)', 'Zero pressure (reference)'], ['Ohm’s law: I = V / R', 'Darcy’s law: Q = ΔP / R']];
      const t = h('table.ck-analogy', h('thead', h('tr', h('th', { class: mode === 'electrical' ? 'on' : '' }, 'Electrical'), h('th', { class: mode === 'physiology' ? 'on' : '' }, 'Physiology'))), h('tbody', rows.map(([a, b]) => h('tr', h('td', a), h('td', b)))));
      return h('details.ck-analogybox', { open: true }, h('summary', 'The analogy'), t);
    }
    _inspectEl(el, close) {
      const mode = this.doc.mode;
      const T = TYPES[el.type];
      const P = this.insp;
      P.append(close, h('h4', h('span.ck-id', el.id), ' ', typeName(el.type, mode)));
      if (el.type !== 'wire' && el.type !== 'ground') {
        const lab = h('input.ck-in', { type: 'text', value: el.label || '', placeholder: el.id, maxlength: '40', 'aria-label': 'Name' });
        lab.addEventListener('change', () => this.setProp(el, 'label', lab.value.trim()));
        const pos = h('select.ck-in.small', { 'aria-label': 'Where the name goes', title: 'Where the name goes' },
          [['auto', 'beside'], ['above', 'above'], ['below', 'below'], ['left', 'on the left'], ['right', 'on the right'], ['none', 'hidden']].map(([v, l]) => h('option', { value: v, selected: (el.labelPos || 'auto') === v ? '' : null }, l)));
        pos.addEventListener('change', () => this.setProp(el, 'labelPos', pos.value === 'auto' ? undefined : pos.value));
        P.appendChild(h('label.ck-field', h('span', 'Name'), h('span.ck-inrow.wide', lab, pos)));
      }
      const field = (prop, q, label, opts = {}) => {
        const unit = q ? qUnit(q, mode) : opts.unit || '';
        const cur = el[prop] == null ? opts.def : el[prop];
        const shown = opts.fmt ? opts.fmt(cur) : q && mode === 'electrical' && !opts.plain ? fmtSI(Number(cur) || 0, '', 4, true).trim() : fmtNum(cur, 6);
        const inp = h('input.ck-in.ck-val', { type: 'text', value: shown, inputmode: 'decimal', 'aria-label': label, spellcheck: 'false', autocomplete: 'off' });
        const err = h('span.ck-err', { 'aria-live': 'polite' });
        const commit = () => {
          let v = opts.parse ? opts.parse(inp.value) : parseValue(inp.value);
          if (!isFinite(v) || (opts.positive && !(v > 0)) || (opts.min != null && v < opts.min) || (opts.max != null && v > opts.max)) {
            err.textContent = opts.positive ? 'Type a number above 0' : 'Type a number';
            inp.classList.add('bad');
            return;
          }
          err.textContent = '';
          inp.classList.remove('bad');
          if (opts.toValue) v = opts.toValue(v);
          this.setProp(el, prop, v);
        };
        inp.addEventListener('change', commit);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        });
        P.appendChild(h('label.ck-field', h('span', label), h('span.ck-inrow', inp, h('span.ck-unit', unit)), err));
        return inp;
      };
      const q = T.q;
      switch (el.type) {
        case 'resistor':
          field('value', 'R', cap(qName('R', mode)), { positive: true });
          break;
        case 'capacitor':
          field('value', 'C', cap(qName('C', mode)), { positive: true });
          field('v0', 'V', `Starting ${qName('V', mode)}`, { def: 0, plain: true });
          break;
        case 'inductor':
          field('value', 'L', cap(qName('L', mode)), { positive: true });
          break;
        case 'battery':
          field('value', 'V', cap(qName('V', mode)) + (mode === 'physiology' ? ' (+ end above − end)' : ' (+ end above − end)'));
          break;
        case 'isource':
          field('value', 'I', cap(qName('I', mode)) + ' (in the direction of the arrow)');
          break;
        case 'acsource':
        case 'acisource': {
          const sel = h('select.ck-in', { 'aria-label': 'Waveform' }, Object.entries(WAVES).map(([k, v]) => h('option', { value: k, selected: el.wave === k ? '' : null }, v)));
          sel.addEventListener('change', () => this.setProp(el, 'wave', sel.value));
          P.appendChild(h('label.ck-field', h('span', 'Waveform'), sel));
          field('amp', q, el.wave === 'sine' || el.wave === 'square' ? 'Amplitude (peak)' : 'Height of each pulse');
          field('freq', null, mode === 'physiology' ? 'Rate (beats per minute)' : 'Frequency', {
            unit: mode === 'physiology' ? '/min' : 'Hz', min: 0,
            fmt: (v) => (mode === 'physiology' ? fmtNum((Number(v) || 0) * 60, 5) : fmtNum(v, 5)),
            toValue: (v) => (mode === 'physiology' ? v / 60 : v)
          });
          if (el.wave === 'pulse' || el.wave === 'halfsine' || el.wave === 'square') field('duty', null, el.wave === 'halfsine' ? 'Part of each cycle with a pulse (%)' : 'Part of each cycle that is on (%)', { unit: '%', fmt: (v) => fmtNum((v == null ? 0.5 : Number(v)) * 100, 4), toValue: (v) => v / 100, min: 0, max: 100 });
          field('offset', q, 'Offset (added throughout)', { def: 0 });
          field('delay', null, 'Starts after', { unit: 's', def: 0, min: 0 });
          break;
        }
        case 'switch': {
          const b = h('button.btn.small', { type: 'button' }, el.closed ? (mode === 'physiology' ? 'Block it' : 'Open it') : mode === 'physiology' ? 'Let it through' : 'Close it');
          b.addEventListener('click', () => this.toggleSwitch(el));
          P.appendChild(h('div.ck-field', h('span', 'State: ' + (el.closed ? (mode === 'physiology' ? 'open to flow' : 'closed (joined)') : mode === 'physiology' ? 'blocked' : 'open (broken)')), b));
          P.appendChild(h('p.ck-note', 'Click a switch in the drawing to change it over, even while the simulation runs.'));
          break;
        }
        case 'diode': {
          const sel = h('select.ck-in', { 'aria-label': 'Kind' }, h('option', { value: 'silicon', selected: el.model !== 'ideal' ? '' : null }, 'Silicon diode (opens at about 0.6 V)'), h('option', { value: 'ideal', selected: el.model === 'ideal' ? '' : null }, 'Ideal valve (opens at any forward difference)'));
          sel.addEventListener('change', () => this.setProp(el, 'model', sel.value));
          P.appendChild(h('label.ck-field', h('span', 'Kind'), sel));
          if (el.model === 'ideal') field('vf', 'V', `Opening ${qName('V', mode)}`, { def: 0, min: 0, plain: true });
          P.appendChild(h('p.ck-note', mode === 'physiology' ? 'A valve lets flow through one way only: in the direction of the arrow.' : 'A diode lets current through one way only: in the direction of the arrow.'));
          break;
        }
        case 'ground':
          P.appendChild(h('p.ck-note', mode === 'physiology' ? 'The reference: every pressure is measured from here (0 mmHg).' : 'Every voltage is measured from here: this point is 0 V.'));
          break;
        case 'voltmeter':
          P.appendChild(h('p.ck-note', mode === 'physiology' ? 'Shows the difference in pressure between its two ends (+ end minus the other). It lets no flow through.' : 'Shows the voltage between its two ends (the + end minus the other). No current flows through it.'));
          break;
        case 'ammeter':
          P.appendChild(h('p.ck-note', mode === 'physiology' ? 'Shows the flow through it, in the direction of its arrow. Put it in series, in the path of the flow.' : 'Shows the current through it, in the direction of its arrow. Put it in series, in the path of the current.'));
          break;
        default:
          break;
      }
      // the readings, kept up to date while the simulation runs
      if (el.type !== 'ground') {
        const rd = h('div.ck-reading');
        P.appendChild(rd);
        this._insLive = () => {
          rd.innerHTML = this._readingHTML(el).split('<br>').slice(1).join('<br>');
        };
        this._insLive();
      }
      const row = h('div.ck-btnrow');
      const add = (ic, label, fn, title) => {
        const b = h('button.tbtn', { type: 'button', title: title || label, html: ICON(ic) + `<span>${esc(label)}</span>` });
        b.addEventListener('click', fn);
        row.appendChild(b);
      };
      if (el.type !== 'wire' && el.type !== 'ground') {
        if (el.type !== 'ammeter') add('chart', 'Plot ' + (mode === 'physiology' ? 'pressure' : 'voltage'), () => this.addTrace({ kind: 'v', id: el.id }), `Plot the ${qName('V', mode)} across it against time`);
        if (el.type !== 'voltmeter') add('chart', 'Plot ' + (mode === 'physiology' ? 'flow' : 'current'), () => this.addTrace({ kind: 'i', id: el.id }), `Plot the ${qName('I', mode)} through it against time`);
      } else if (el.type === 'wire') add('chart', 'Plot ' + (mode === 'physiology' ? 'pressure' : 'voltage'), () => this.addTrace({ kind: 'node', x: el.x1, y: el.y1 }));
      add('spin', 'Turn', () => this.rotateSel(), 'Turn by 90° (R)');
      if (!T.one) add('superpose', 'Swap ends', () => this.flipSel(), 'Swap its ends (F)');
      add('trash', 'Delete', () => this.deleteSel(), 'Delete (Delete key)');
      P.appendChild(row);
    }

    /* ================= the plot ================= */
    addTrace(tr) {
      const same = this.doc.traces.find((t) => t.kind === tr.kind && (tr.kind === 'node' ? this.sim && this.sim.nodeOf(t.x, t.y) === this.sim.nodeOf(tr.x, tr.y) : t.id === tr.id));
      if (same) return toast('That is plotted already.', null, 1800);
      if (this.doc.traces.length >= 8) return toast('The plot has room for 8 traces: remove one first.', 'warn');
      this._before();
      this.doc.traces.push(tr);
      this.rec.v.push(this.rec.t.map(() => NaN));
      this.changed();
      if (this.sim) {
        const last = this.rec.v[this.rec.v.length - 1];
        if (last.length) last[last.length - 1] = this._traceValue(tr, this.sim);
      }
      this._drawPlot();
      const info = this._traceInfo(tr, this.doc.traces.length - 1);
      const v = this.sim ? this._traceValue(tr, this.sim) : NaN;
      bus.emit('circuit:measure', { kind: 'trace', id: tr.id || `${tr.x},${tr.y}`, label: info.label, value: v, units: qUnit(info.q, this.doc.mode) });
      if (this.root.classList.contains('plot-closed')) this.root.classList.remove('plot-closed');
    }
    removeTrace(k) {
      this._before();
      this.doc.traces.splice(k, 1);
      this.rec.v.splice(k, 1);
      this.changed();
      this._drawPlot();
    }
    _traceInfo(tr, k) {
      const mode = this.doc.mode;
      const colour = TRACE_COLOURS[k % TRACE_COLOURS.length];
      if (tr.kind === 'node') {
        // name the point by the parts that meet there
        const near = this.doc.elements.filter((e) => e.type !== 'wire' && pointsOf(e).some(([x, y]) => this.sim && this.sim.nodeOf(x, y) === this.sim.nodeOf(tr.x, tr.y)) && e.type !== 'ground').map((e) => e.label || e.id).slice(0, 2);
        return { q: 'V', colour, label: `${cap(qName('V', mode))} at ${near.length ? near.join('–') : `(${tr.x}, ${tr.y})`}` };
      }
      const el = this.byId(tr.id);
      const name = el ? el.label || el.id : tr.id;
      if (el && el.type === 'voltmeter') return { q: 'V', colour, label: el.label ? name : `${name} (${qName('V', mode)})` };
      if (el && el.type === 'ammeter') return { q: 'I', colour, label: el.label ? name : `${name} (${qName('I', mode)})` };
      return tr.kind === 'i' ? { q: 'I', colour, label: `${cap(qName('I', mode))} through ${name}` } : { q: 'V', colour, label: `${cap(qName('V', mode))} across ${name}` };
    }
    _plotHeader() {
      const H = this.plotHead;
      H.innerHTML = '';
      const tog = h('button.ck-plottog', { type: 'button', 'aria-expanded': this.root.classList.contains('plot-closed') ? 'false' : 'true', html: ICON('chevD') + '<b>Plot</b>' });
      tog.addEventListener('click', () => {
        this.root.classList.toggle('plot-closed');
        tog.setAttribute('aria-expanded', this.root.classList.contains('plot-closed') ? 'false' : 'true');
        this._drawPlot();
      });
      const chips = h('div.ck-chips');
      this.doc.traces.forEach((tr, k) => {
        const info = this._traceInfo(tr, k);
        const x = h('button.ck-chipx', { type: 'button', 'aria-label': 'Remove ' + info.label, html: '×' });
        x.addEventListener('click', () => this.removeTrace(k));
        chips.appendChild(h('span.ck-chip', h('i', { style: { background: info.colour } }), h('span', info.label), x));
      });
      const add = h('button.tbtn', { type: 'button', html: ICON('plus') + '<span>Add trace</span>', title: 'Plot a voltage or a current against time' });
      add.addEventListener('click', () => this._addTraceMenu(add));
      this.winSel = h('select.ck-in.small', { 'aria-label': 'How much of the time to show', title: 'How much of the time to show' },
        [['auto', 'Last few cycles'], ['1', 'Last 1 s'], ['5', 'Last 5 s'], ['10', 'Last 10 s'], ['30', 'Last 30 s'], ['all', 'All of it']].map(([v, l]) => h('option', { value: v, selected: (this.doc.settings.window || 'auto') === v ? '' : null }, l)));
      this.winSel.addEventListener('change', () => {
        this.doc.settings = Object.assign({}, this.doc.settings, { window: this.winSel.value });
        this._keep();
        this._drawPlot();
      });
      const csv = h('button.tbtn', { type: 'button', html: ICON('download') + '<span>CSV</span>', title: 'Save the traces as a table (CSV) in your files, for R' });
      csv.addEventListener('click', () => this.exportCSV());
      const clr = h('button.tbtn', { type: 'button', html: ICON('broom') + '<span>Clear</span>', title: 'Start the plot again (the circuit carries on)' });
      clr.addEventListener('click', () => {
        this._clearRec();
        this._drawPlot();
      });
      H.append(tog, chips, h('span.grow'), add, this.winSel, clr, csv);
      this.plotEmpty.innerHTML = `<div>Nothing is plotted yet. <b>Add trace</b>, or click <b>Plot</b> in the toolbar and then a part of the circuit, to follow a ${qName('V', this.doc.mode)} or a ${qName('I', this.doc.mode)} against time.</div>`;
      this.plotEmpty.hidden = this.doc.traces.length > 0;
      this._drawPlot();
    }
    _addTraceMenu(anchor) {
      const mode = this.doc.mode;
      const items = [['target', 'Pick a part of the circuit…', () => this.setTool('probe')]];
      for (const el of this.doc.elements) {
        if (el.type === 'wire' || el.type === 'ground') continue;
        if (el.type !== 'ammeter') items.push(['chart', `${cap(qName('V', mode))}: ${el.label || el.id}${el.type === 'voltmeter' ? '' : ' (across)'}`, () => this.addTrace({ kind: 'v', id: el.id })]);
        if (el.type !== 'voltmeter') items.push(['chart', `${cap(qName('I', mode))}: ${el.label || el.id}${el.type === 'ammeter' ? '' : ' (through)'}`, () => this.addTrace({ kind: 'i', id: el.id })]);
      }
      MG.popmenu(anchor, items.slice(0, 40));
    }
    _window() {
      const w = (this.doc.settings && this.doc.settings.window) || 'auto';
      if (w === 'all') return Infinity;
      if (w !== 'auto') return Number(w);
      const s = this.sim;
      if (!s) return 5;
      const periods = this.doc.elements.map((e) => (TYPES[e.type].wave && Number(e.freq) > 0 ? 1 / Number(e.freq) : 0)).filter(Boolean);
      const tauMax = Math.max(0, ...(s.taus || []));
      const cand = Math.max(tauMax * 6, periods.length ? Math.max(...periods) * 4 : 0);
      return cand > 0 ? cand : 5;
    }
    _drawPlot() {
      const cv = this.plotCanvas;
      const box = this.plotBody;
      if (!cv || this.root.classList.contains('plot-closed')) return;
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.width = W + 'px';
        cv.style.height = H + 'px';
      }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const traces = this.doc.traces;
      this.plotEmpty.hidden = traces.length > 0;
      if (!traces.length) return;
      const R = this.rec;
      const tNow = this.sim ? this.sim.t : 0;
      const win = this._window();
      const t1 = Math.max(tNow, R.t.length ? R.t[R.t.length - 1] : 0);
      const t0 = isFinite(win) ? Math.max(0, t1 - win) : 0;
      const tEnd = isFinite(win) ? Math.max(t1, t0 + win) : Math.max(t1, 1e-9);
      // one panel for each kind of quantity
      const infos = traces.map((tr, k) => this._traceInfo(tr, k));
      const kinds = [...new Set(infos.map((i) => i.q))];
      const mode = this.doc.mode;
      const left = 52, right = 12, top = 6, bottom = 20, gap = 10;
      const tagH = 14;
      const ph = (H - top - bottom - gap * (kinds.length - 1)) / kinds.length - tagH;
      let i0 = 0;
      while (i0 < R.t.length && R.t[i0] < t0) i0++;
      i0 = Math.max(0, i0 - 1);
      const X = (t) => left + ((t - t0) / (tEnd - t0 || 1)) * (W - left - right);
      c.font = '11px system-ui, sans-serif';
      kinds.forEach((q, pk) => {
        const y0 = top + pk * (ph + tagH + gap) + tagH;
        let lo = Infinity, hi = -Infinity;
        traces.forEach((tr, k) => {
          if (infos[k].q !== q) return;
          const a = R.v[k] || [];
          for (let i = i0; i < a.length; i++) if (isFinite(a[i])) {
            lo = Math.min(lo, a[i]);
            hi = Math.max(hi, a[i]);
          }
        });
        if (!isFinite(lo)) {
          lo = 0;
          hi = 1;
        }
        // (a little room above and below; 0 in view when it is near)
        const span = hi - lo || Math.max(Math.abs(hi), 1e-12);
        lo -= span * 0.08;
        hi += span * 0.08;
        if (lo > 0 && lo < span * 0.6) lo = 0;
        if (hi < 0 && -hi < span * 0.6) hi = 0;
        const { ticks } = niceTicks(lo, hi, Math.max(2, Math.floor(ph / 30)));
        lo = Math.min(lo, ticks[0]);
        hi = Math.max(hi, ticks[ticks.length - 1]);
        const ax = axisScale(Math.max(Math.abs(ticks[0]), Math.abs(ticks[ticks.length - 1])), q, mode);
        const Y = (v) => y0 + ph - ((v - lo) / (hi - lo || 1)) * ph;
        // the frame and the grid
        c.strokeStyle = '#e3e8ef';
        c.lineWidth = 1;
        c.fillStyle = '#5b6678';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        for (const v of ticks) {
          const y = Math.round(Y(v)) + 0.5;
          c.beginPath();
          c.moveTo(left, y);
          c.lineTo(W - right, y);
          c.stroke();
          c.fillText(fmtNum(v / ax.f, 4), left - 4, y);
        }
        if (lo < 0 && hi > 0) {
          c.strokeStyle = '#b9c3d0';
          c.beginPath();
          c.moveTo(left, Math.round(Y(0)) + 0.5);
          c.lineTo(W - right, Math.round(Y(0)) + 0.5);
          c.stroke();
        }
        c.strokeStyle = '#c9d1dc';
        c.strokeRect(left + 0.5, y0 + 0.5, W - left - right - 1, ph - 1);
        // the quantity and its unit, once, above the panel
        c.save();
        c.font = '600 11px system-ui, sans-serif';
        c.fillStyle = '#3e4a5c';
        c.textAlign = 'left';
        c.textBaseline = 'bottom';
        c.fillText(`${cap(qName(q, mode))} (${ax.unit})`, left, y0 - 2);
        c.restore();
        // the traces
        c.save();
        c.beginPath();
        c.rect(left, y0, W - left - right, ph);
        c.clip();
        traces.forEach((tr, k) => {
          if (infos[k].q !== q) return;
          const a = R.v[k] || [];
          c.strokeStyle = infos[k].colour;
          c.lineWidth = 1.8;
          c.beginPath();
          let pen = false;
          // (at most about two points for each pixel)
          const stepI = Math.max(1, Math.floor((R.t.length - i0) / ((W - left) * 2)));
          for (let i = i0; i < R.t.length; i += stepI) {
            const v = a[i];
            if (!isFinite(v)) {
              pen = false;
              continue;
            }
            const x = X(R.t[i]), y = Y(v);
            if (pen) c.lineTo(x, y);
            else c.moveTo(x, y);
            pen = true;
          }
          c.stroke();
        });
        c.restore();
      });
      // the time axis
      const { ticks } = niceTicks(t0, tEnd, Math.max(2, Math.floor((W - left) / 90)));
      const tx = axisScale(Math.max(Math.abs(tEnd), 1e-12), 'T', 'electrical');
      c.fillStyle = '#5b6678';
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (const t of ticks) {
        if (t < t0 - 1e-12 || t > tEnd + 1e-12) continue;
        c.fillText(fmtNum(t / tx.f, 4) + (t === ticks[ticks.length - 1] || ticks.length < 3 ? ' ' + tx.unit : ''), X(t), H - bottom + 6);
      }
    }

    /* ================= modes ================= */
    setMode(mode) {
      mode = mode === 'physiology' ? 'physiology' : 'electrical';
      if (this.doc.mode === mode) return;
      // (the names of the values change length: if the whole circuit was in sight, it stays in sight)
      const inSight = !this._clipped();
      this.doc.mode = mode;
      this._modeButtons();
      this._renderPalette();
      this.rebuild(false);
      this.render();
      if (inSight && this._clipped()) this.fit();
      this._inspector();
      this._plotHeader();
      this._keep();
      if (this.tool.startsWith('place:')) this.setTool(this.tool);
      bus.emit('circuit:mode', { mode });
    }
    _modeButtons() {
      const m = this.doc.mode;
      this.modeE.classList.toggle('on', m === 'electrical');
      this.modeP.classList.toggle('on', m === 'physiology');
      this.modeE.setAttribute('aria-pressed', m === 'electrical' ? 'true' : 'false');
      this.modeP.setAttribute('aria-pressed', m === 'physiology' ? 'true' : 'false');
      this.root.dataset.mode = m;
    }

    /* ================= messages under the drawing ================= */
    _statusMsg() {
      const s = this.sim;
      const S = this.status;
      S.innerHTML = '';
      const add = (cls, html) => S.appendChild(h('div.ck-msg.' + cls, { html }));
      if (s) {
        for (const e of s.errors) add('error', `<b>Problem.</b> ${esc(e.text)}`);
        for (const w of s.warnings) add('warn', esc(w.text));
        if (!s.errors.length) for (const i of s.info) add('info', esc(i.text));
        if (s.converged === false) add('warn', 'The diodes did not settle at this step; the readings may be a little off.');
      }
      if (this._toolText) add('tool', esc(this._toolText));
      // the components with errors are outlined
      this.root.querySelectorAll('.ck-el.bad').forEach((g) => g.classList.remove('bad'));
      if (s) for (const e of s.errors) if (e.id) {
        const g = this.root.querySelector(`.ck-el[data-id="${CSS.escape(e.id)}"]`);
        if (g) g.classList.add('bad');
      }
    }

    /* ================= files ================= */
    async menu(anchor) {
      anchor = anchor || this.btn.menu;
      const ex = await this._examples().catch(() => []);
      const items = [['newfile', 'New (empty) circuit', () => this.newCircuit()]];
      for (const e of ex) items.push(['book', 'Example: ' + e.title, () => this.open('example:' + e.id)]);
      items.push(['openfolder', 'Open from my files…', () => this.openDialog()], ['save', 'Save in my files', () => this.save()], ['save', 'Save as…', () => this.save(true)],
        ['image', 'Picture (PNG) to my files', () => this.exportPicture('png', true)], ['image', 'Drawing (SVG) to my files', () => this.exportPicture('svg', true)],
        ['download', 'Download the picture (PNG)', () => this.exportPicture('png', false)], ['table', 'Traces (CSV) to my files', () => this.exportCSV()], ['download', 'Download the circuit file', () => this.download()],
        ['help', 'How to use the simulator', () => this.help()]);
      MG.popmenu(anchor, items);
    }
    async _examples() {
      if (this._exList) return this._exList;
      const base = (MG.config && MG.config.examplesBase) || 'examples/';
      const r = await fetch(base + 'index.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no examples');
      const j = await r.json();
      this._exList = (j.circuits || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      return this._exList;
    }
    async _confirmReplace() {
      if (!this.unsaved()) return true;
      // (an example whose values or switches were changed is simply replaced – it can be opened again; parts added to
      // it, moved or taken away are work of the student's, which is asked about)
      if (this.example && this.savedSnap) {
        const shape = (els) => JSON.stringify((els || []).map((e) => [e.id, e.type, e.x1, e.y1, e.x2, e.y2]));
        try {
          if (shape(JSON.parse(this.savedSnap).e) === shape(this.doc.elements)) return true;
        } catch (e) {
          /* (a snapshot that cannot be read: ask) */
        }
      }
      return MG.confirmBox('Replace this circuit?', `<p>Your circuit <b>${esc(this.doc.title)}</b> has changes that are not saved in your files. Opening another circuit replaces it.</p><p>To keep it, choose Cancel and then <b>Save</b>.</p>`, 'Replace it');
    }
    async newCircuit() {
      if (!(await this._confirmReplace())) return;
      const d = this.blank();
      d.mode = this.doc.mode;
      this.load(d, { event: true });
      this.view = { x: 60, y: 60, s: 1 };
      this._applyView();
      this._keep();
    }
    /** open an example ('example:ID') or a file of the user's */
    async open(ref, opts = {}) {
      ref = String(ref || '').trim();
      if (!ref) return;
      let doc, path = null, example = null;
      if (ref.startsWith('example:')) {
        example = ref.slice(8);
        const base = (MG.config && MG.config.examplesBase) || 'examples/';
        const r = await fetch(`${base}circuits/${encodeURIComponent(example)}.circuit.json`, { cache: 'no-cache' });
        if (!r.ok) {
          toast(`There is no example called ${esc(example)}.`, 'error');
          throw new Error('no example ' + example);
        }
        doc = await r.json();
      } else {
        path = this.fs.resolve(ref);
        try {
          doc = JSON.parse(await this.fs.readText(path));
        } catch (e) {
          toast(`${esc(this.fs.pretty(path))} could not be opened as a circuit: ${esc(e.message)}`, 'error');
          throw e;
        }
      }
      if (!opts.quiet && !opts.force && !(await this._confirmReplace())) return;
      this.load(doc, { path, example, event: !opts.quiet });
      requestAnimationFrame(() => this.fit());
      return this;
    }
    async openDialog() {
      const fs = this.fs;
      const home = HOME();
      const files = [...fs.entries.keys()].filter((p) => p.startsWith(home + '/') && /\.circuit\.json$/i.test(p)).sort();
      if (!files.length) return toast('There are no circuits in your files yet (they end in .circuit.json). Save one first.', 'warn', 5000);
      const m = MG.modal('Open a circuit from your files', '<div class="ck-filelist"></div>');
      const list = m.box.querySelector('.ck-filelist');
      for (const p of files) {
        const b = h('button.ck-fileitem', { type: 'button', html: ICON('file') + `<span>${esc(fs.pretty(p))}</span>` });
        b.addEventListener('click', () => {
          m.close();
          this.open(p);
        });
        list.appendChild(b);
      }
    }
    _fileText() {
      const d = Object.assign({}, this.doc, { format: 'bms-circuit-1', saved: new Date().toISOString() });
      return JSON.stringify(d, null, 1) + '\n';
    }
    _safeName() {
      return (this.doc.title || 'circuit').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'circuit';
    }
    async save(as) {
      let path = !as && this.path ? this.path : null;
      if (!path) {
        const p = await MG.app.saveToFiles(this._safeName() + '.circuit.json', this._fileText(), { folder: '~/circuits' });
        if (!p) return null;
        path = p;
      } else {
        this.fs.writeText(path, this._fileText());
        toast(`Saved <b>${esc(this.fs.pretty(path))}</b>.`, 'ok', 2500);
      }
      this.path = path;
      this.example = null;
      this.savedSnap = this._snap();
      this._keep();
      this._inspector();
      bus.emit('circuit:save', { path: this.fs.pretty(path) });
      return path;
    }
    download() {
      MG.downloadText(this._fileText(), this._safeName() + '.circuit.json', 'application/json');
    }
    /** a drawing of the circuit on its own, as SVG text (black on white, with the readings of the meters) */
    pictureSVG() {
      const els = this.doc.elements;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of els) for (const [x, y] of [[el.x1, el.y1], [el.x2, el.y2]]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      if (!isFinite(x0)) {
        x0 = y0 = 0;
        x1 = y1 = 4;
      }
      const pad = 2.2;
      let vx = (x0 - pad) * G, vy = (y0 - pad) * G, vw = (x1 - x0 + 2 * pad) * G, vh = (y1 - y0 + 2 * pad) * G;
      const body = this.layer.wires.outerHTML + this.layer.els.outerHTML + this.layer.dots.outerHTML + `<g class="ck-labels">${this.labelsSVG(1, 0, 0)}</g>`;
      // (the labels can reach beyond the parts – a meter's reading, a long name: the picture takes in all that is drawn)
      try {
        const tmp = document.createElementNS(SVGNS, 'svg');
        tmp.setAttribute('width', '10');
        tmp.setAttribute('height', '10');
        tmp.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
        tmp.innerHTML = `<g style="font:600 12px system-ui,sans-serif">${body.replace(/ style="[^"]*"/g, '')}</g>`;
        tmp.querySelectorAll('.ck-hl,.ck-hit,.ck-loose').forEach((n) => n.remove());
        document.body.appendChild(tmp);
        const b = tmp.firstChild.getBBox();
        tmp.remove();
        if (b && b.width > 0 && b.height > 0) {
          const m = 10;
          const X0 = Math.min(vx, b.x - m), Y0 = Math.min(vy, b.y - m);
          vw = Math.max(vx + vw, b.x + b.width + m) - X0;
          vh = Math.max(vy + vh, b.y + b.height + m) - Y0;
          vx = X0;
          vy = Y0;
        }
      } catch (e) {
        /* the box of the parts, then */
      }
      const style = `.ck-hl,.ck-hit,.ck-loose{display:none}.ck-w,.ck-lead,.ck-body,.ck-plate,.ck-sym,.ck-lever,.ck-gnd,.ck-nofill{stroke:#222;fill:none;stroke-width:2;stroke-linecap:round}
.ck-plate{stroke-width:2.6}.ck-plate.thick{stroke-width:5}.ck-body{fill:#fff}.ck-solid{fill:#222}.ck-meter{fill:#fff}.ck-pin{fill:#222}.ck-sym.thin{stroke-width:1.3}
.ck-junc{fill:#222}.ck-letter{font:700 15px system-ui,sans-serif;text-anchor:middle;fill:#222}.ck-pm{font:700 13px system-ui,sans-serif;fill:#222}
.ck-lbl{font:600 12px system-ui,sans-serif;fill:#222}.ck-lval{font-weight:400;fill:#333}.ck-lbl.meter .ck-lval{font-weight:700}`;
      return `<svg xmlns="${SVGNS}" viewBox="${vx} ${vy} ${vw} ${vh}" width="${Math.round(vw * 1.5)}" height="${Math.round(vh * 1.5)}"><style>${style}</style><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#fff"/>${body.replace(/ style="[^"]*"/g, '')}</svg>`;
    }
    async pictureBlob(kind) {
      const svg = this.pictureSVG();
      if (kind === 'svg') return new Blob([svg], { type: 'image/svg+xml' });
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        await new Promise((ok, bad) => {
          img.onload = ok;
          img.onerror = () => bad(new Error('The picture could not be drawn.'));
          img.src = url;
        });
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth || img.width;
        cv.height = img.naturalHeight || img.height;
        const c = cv.getContext('2d');
        c.fillStyle = '#fff';
        c.fillRect(0, 0, cv.width, cv.height);
        c.drawImage(img, 0, 0);
        return await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    async exportPicture(kind, mine) {
      const blob = await this.pictureBlob(kind);
      const name = this._safeName() + '.' + kind;
      if (mine) {
        const p = await MG.app.saveToFiles(name, blob, { folder: '~/circuits' });
        if (p) bus.emit('circuit:export', { format: kind, path: this.fs.pretty(p) });
        return p;
      }
      MG.downloadBlob(blob, name);
      bus.emit('circuit:export', { format: kind, path: '' });
      return null;
    }
    csvText() {
      const R = this.rec, mode = this.doc.mode;
      const infos = this.doc.traces.map((tr, k) => this._traceInfo(tr, k));
      const head = ['time_s'].concat(infos.map((i) => `${i.label} (${qUnit(i.q, mode)})`.replace(/"/g, "'")));
      const lines = [head.map((x) => `"${x}"`).join(',')];
      for (let i = 0; i < R.t.length; i++) {
        // (a trace added while the circuit runs has no values before then: rows with no values at all are left out)
        if (!R.v.some((a) => isFinite(a[i]))) continue;
        lines.push([Number(R.t[i].toPrecision(8))].concat(R.v.map((a) => (isFinite(a[i]) ? Number(a[i].toPrecision(7)) : ''))).join(','));
      }
      return lines.join('\n') + '\n';
    }
    async exportCSV() {
      if (!this.doc.traces.length) return toast('Add a trace to the plot first: the table holds the traces against time.', 'warn', 4000);
      if (this.rec.t.length < 2) return toast('Run the circuit first, so that there is something to save.', 'warn', 4000);
      const p = await MG.app.saveToFiles(this._safeName() + '-run.csv', this.csvText(), { folder: '~/circuits' });
      if (p) bus.emit('circuit:export', { format: 'csv', path: this.fs.pretty(p) });
      return p;
    }

    help() {
      MG.modal('The circuit simulator', `
<p>Build a circuit from the parts on the left, then press <b>Run</b> to see what happens in time. The same circuits model physiology: switch the labels to <b>Physiology</b> and voltage becomes pressure, current becomes flow, a capacitor becomes a compliance and a diode a valve.</p>
<ul>
<li><b>Add a part:</b> click it in the list, then click on the grid (or drag across the grid to set where its two ends go). You can also drag a part from the list onto the grid.</li>
<li><b>Join parts</b> with <b>Wire</b>: drag from one end to another. A wire that ends on another wire joins it; a black dot shows a junction, a small open circle an end that is joined to nothing.</li>
<li><b>Select</b> a part by clicking it: its values are on the right, where you can change them (type <code>4.7k</code>, <code>10µ</code> or <code>2m</code>, for example). Drag a part to move it (the wires follow), drag a round handle to move one end, <kbd>R</kbd> turns it, <kbd>F</kbd> swaps its ends, <kbd>Delete</kbd> deletes it. Drag on an empty part of the grid to select several parts. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.</li>
<li><b>Move round the drawing:</b> the mouse wheel (or two fingers, or <b>+</b> and <b>−</b> in the corner) zooms, and the button under them fits the circuit in the window; drag with the right mouse button (or hold the space bar), or with one finger on a touch screen, to move.</li>
<li><b>Measure:</b> hover over a part to see the voltage across it and the current through it. Voltmeters and ammeters show their readings all the time. The moving dots show the current (faster dots, more current); the colour of a wire shows its voltage (green above 0, red below).</li>
<li><b>Plot:</b> click <b>Plot</b> (or <b>Add trace</b>) and then a part, to follow it against time. <b>CSV</b> saves the traces in your files, where RStudio can read them.</li>
<li><b>Switches:</b> click a switch to close or open it, even while the circuit runs.</li>
<li><b>Save</b> keeps the circuit in your files (in <code>~/circuits</code>); the circuit you are working on is also kept in this browser between visits.</li>
</ul>
<p class="ck-note">How it works: the simulator uses modified nodal analysis, as circuit simulators such as SPICE do. At each small step of time it solves Kirchhoff’s laws for the voltage at every junction; capacitors and inductors are stepped on by the backward Euler method, and diodes are solved by Newton’s method. The step is chosen from the circuit’s own time constants.</p>`);
    }
  }
  MG.CircuitApp = CircuitApp;
})();
