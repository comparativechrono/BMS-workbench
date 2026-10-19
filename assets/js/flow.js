/* =====================================================================
   The Diagrams tab: flow diagrams of physiological control – boxes for
   the quantities, arrows that stimulate (+) or inhibit (−) – and a small
   simulator that runs them, so that students can see what negative and
   positive feedback, delays and feed-forward do.

   page.js builds it the first time the tab is shown:
     MG.app.flow = new MG.FlowApp(root, { fs })      (then awaits .ready)
   and calls:
     .shown(opts)    the tab was shown (or resized)
     .open(ref)      'example:ID' (examples/diagrams/ID.flow.json) or a path among the files (~/diagrams/x.flow.json)
     .run()          run the simulation of the open diagram
     .dirty()        true when the diagram has changes that are not saved in a file
     .newDiagram()   a blank diagram
   and, for the tests and the practicals: .save(), .saveAs(), .exportPNG(mine), .exportSVG(mine), .exportCSV(mine)
   (mine: into the files rather than a download), .intervene(id, 'knock'|'fix'|null, level), .setRunView('graphs'|
   'numbers'). An unsaved diagram is kept in the browser (MG.store 'flow:draft') and comes back after a reload.

   A diagram (.flow.json) is
     { format: 'bms-flow-1', title, description, group, order,
       nodes: [{ id, text, shape, color, x, y, w, h, role, … }],      x, y: the centre of the box
       edges: [{ id, from, to, sign: '+'|'-'|'0', gain, delay, label, dashed, bend, blocked }],
       sim: { duration, timeUnit, clampZero, changeAt } }
   role is what the box is in the simulation: 'quantity' (rest, unit, tau), 'stimulus' (kind: step|pulse|ramp|wave,
   start, size, length, period), 'setpoint' (rest, unit, stepAt, step), 'comparator' (Σ: adds up its inputs) or
   'label' (not simulated). A box can be knocked out (knocked: true) or fixed at a level (fixed: number).

   The model (simulate, below): every box starts at its resting level. For a quantity i,
       tau_i · dx_i/dt = Σ_j w_ij · v_j(t − delay_ij) − x_i
   where x_i is how far i is from its resting level, v_j is what the box at the other end of an arrow sends (a
   quantity its own x, a stimulus or a set point its value, a comparator the sum of its inputs at that moment) and
   w_ij = +gain for a + (or plain) arrow and −gain for a − arrow. Each step is solved exactly for a quantity whose
   inputs stay the same (x → target + (x − target)·e^(−dt/tau)), so the simulation is stable however short tau is;
   delays read the history of the box at the other end.

   Events on MG.bus (for the practicals' tasks that tick themselves):
     flow:open    {name, path, example}     a diagram was opened (path: absolute, '' for an example; example: its id,
                                            'blank' for a new diagram)
     flow:edit    {nodes, edges, name}      the diagram changed (half a second after the last change)
     flow:node    {text, role}              a box was added
     flow:edge    {sign, from, to}          an arrow was added (sign '+', '-' or '0'; from, to: the texts of its boxes)
     flow:run     {name, nodes, edges, duration, oscillates, oscillation, oscillating, runaway, blocked, knocked,
                   settled}                 a run: oscillation 'growing' | 'steady' | 'dying away' (or ''), oscillating
                                            the names of the boxes that went up and down, blocked and knocked the
                                            numbers of blocked arrows and of knocked-out or fixed boxes
     flow:save    {path, name}              the diagram was saved in a file
     flow:export  {format, path}            format 'png' | 'svg' | 'csv' | 'json'; path when kept among the files
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const NS = 'http://www.w3.org/2000/svg';
  const GRID = 10;
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  /* ------------------------------------------------------------------
     small helpers
     ------------------------------------------------------------------ */
  function S(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    for (const k of kids) if (k != null) el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    return el;
  }
  const num = (v, d) => {
    const x = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(x) ? x : d;
  };
  const str = (v) => (v == null ? '' : String(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snapTo = (v, g) => Math.round(v / g) * g;
  /** a number as people write it: 37, 36.67, 0.25, 1.2e-5 */
  function fmt(v) {
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(2).replace(/\.?0+e/, 'e');
    let s = v.toPrecision(4);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }
  const minus = (s) => String(s).replace(/^-/, '−');
  const LIC = {
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    box: '<rect x="3" y="6.5" width="18" height="11" rx="3.5"/><path d="M12 9.5v5M9.5 12h5"/>',
    plusArrow: '<path d="M3 12h13"/><path d="M15 7.5l5 4.5-5 4.5z" fill="currentColor"/>',
    minusArrow: '<path d="M3 12h15"/><path d="M19.5 6.5v11" stroke-width="2.6"/>',
    plainArrow: '<path d="M3 12h13" stroke-dasharray="0"/><path d="M15 8l5 4-5 4"/>',
    knock: '<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 9l8 6M16 9l-8 6"/>',
    cut: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 16M8 15.5L20 8"/>',
    pin: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
    sheet: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>'
  };
  const ic = (name) => (LIC[name] ? `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LIC[name]}</svg>` : MG.icon(name));

  /* ------------------------------------------------------------------
     what boxes and arrows can be
     ------------------------------------------------------------------ */
  const COLORS = {
    blue: { fill: '#e4f0fb', stroke: '#2f6fae', ink: '#123a5e', label: 'Blue' },
    teal: { fill: '#dff3f0', stroke: '#1f8a7d', ink: '#0f4a43', label: 'Teal' },
    green: { fill: '#e6f4e3', stroke: '#3c8a35', ink: '#1f4a1b', label: 'Green' },
    yellow: { fill: '#fdf5d3', stroke: '#b38b00', ink: '#5a4600', label: 'Yellow' },
    orange: { fill: '#fde9d9', stroke: '#c8641b', ink: '#6b3008', label: 'Orange' },
    red: { fill: '#fbe3e1', stroke: '#c0392b', ink: '#6b1a12', label: 'Red' },
    pink: { fill: '#fbe4ef', stroke: '#c2477f', ink: '#6b1d42', label: 'Pink' },
    purple: { fill: '#efe6fa', stroke: '#7a4fb3', ink: '#3f2266', label: 'Purple' },
    grey: { fill: '#eef1f5', stroke: '#6b7686', ink: '#262f3b', label: 'Grey' },
    white: { fill: '#ffffff', stroke: '#3b4656', ink: '#18212f', label: 'White' }
  };
  const SHAPES = [
    ['round', 'Rounded box'],
    ['rect', 'Box'],
    ['ellipse', 'Ellipse'],
    ['circle', 'Circle (Σ)'],
    ['flag', 'Stimulus (arrow-shaped)'],
    ['label', 'Text only']
  ];
  const SHAPE_SET = new Set(SHAPES.map((x) => x[0]));
  const ROLES = [
    ['quantity', 'A quantity that changes'],
    ['stimulus', 'A stimulus or disturbance'],
    ['setpoint', 'A set point'],
    ['comparator', 'A comparator (Σ)'],
    ['label', 'Not in the simulation']
  ];
  const ROLE_SET = new Set(ROLES.map((x) => x[0]));
  const ROLE_SHAPE = { quantity: 'round', stimulus: 'flag', setpoint: 'rect', comparator: 'circle', label: 'label' };
  const ROLE_COLOR = { quantity: 'blue', stimulus: 'orange', setpoint: 'grey', comparator: 'white', label: 'white' };
  const ROLE_TEXT = { quantity: 'Quantity', stimulus: 'Stimulus', setpoint: 'Set point', comparator: 'Σ', label: 'Note' };
  const KINDS = [
    ['step', 'Step (switched on and left on)'],
    ['pulse', 'Pulse (on for a while)'],
    ['ramp', 'Ramp (rises steadily, then stays)'],
    ['wave', 'Wave (goes up and down)']
  ];
  const KIND_SET = new Set(KINDS.map((x) => x[0]));
  const SIGNS = {
    '+': { label: 'Stimulates (+)', short: '+', color: '#2e7d32' },
    '-': { label: 'Inhibits (−)', short: '−', color: '#c62828' },
    '0': { label: 'Leads to', short: '→', color: '#3b4656' }
  };
  const UNITS = ['s', 'min', 'h', 'days'];
  const SPEEDS = [['slow', 'Slow', 12], ['normal', 'Normal', 5], ['fast', 'Fast', 2], ['instant', 'At once', 0]];

  /* ------------------------------------------------------------------
     the model: reading a diagram in, and writing it out
     ------------------------------------------------------------------ */
  function normNode(n, k) {
    n = n || {};
    const role = ROLE_SET.has(n.role) ? n.role : 'quantity';
    const shape = SHAPE_SET.has(n.shape) ? n.shape : ROLE_SHAPE[role];
    const round = shape === 'circle';
    const out = {
      id: str(n.id) || 'n' + (k + 1),
      text: n.text == null ? ROLE_TEXT[role] : str(n.text),
      shape,
      color: COLORS[n.color] ? n.color : ROLE_COLOR[role],
      x: num(n.x, 200),
      y: num(n.y, 150),
      w: clamp(num(n.w, round ? 56 : 150), 24, 800),
      h: clamp(num(n.h, round ? 56 : 56), 20, 500),
      role,
      // (every setting is kept, whatever the role, so that changing the role and back loses nothing)
      rest: num(n.rest, role === 'quantity' ? 1 : 0),
      unit: str(n.unit),
      tau: Math.max(1e-6, num(n.tau, 1)),
      kind: KIND_SET.has(n.kind) ? n.kind : 'step',
      start: num(n.start, 5),
      size: num(n.size, 1),
      length: Math.max(1e-6, num(n.length, 10)),
      period: Math.max(1e-6, num(n.period, 20)),
      stepAt: num(n.stepAt, 0),
      step: num(n.step, 0),
      plot: n.plot != null ? !!n.plot : role === 'quantity' || role === 'stimulus'
    };
    if (n.knocked) out.knocked = true;
    if (n.fixed != null && n.fixed !== '' && Number.isFinite(+n.fixed)) out.fixed = +n.fixed;
    return out;
  }
  function normEdge(e, k) {
    e = e || {};
    const sign = e.sign === '-' || e.sign === '−' ? '-' : e.sign === '0' || e.sign === 'none' ? '0' : '+';
    const out = {
      id: str(e.id) || 'e' + (k + 1),
      from: str(e.from),
      to: str(e.to),
      sign,
      gain: Math.max(0, num(e.gain, 1)),
      delay: Math.max(0, num(e.delay, 0)),
      label: str(e.label),
      dashed: !!e.dashed,
      bend: num(e.bend, 0)
    };
    if (e.blocked) out.blocked = true;
    return out;
  }
  function normDiagram(d) {
    d = d && typeof d === 'object' ? d : {};
    const nodes = (Array.isArray(d.nodes) ? d.nodes : []).slice(0, 400).map(normNode);
    // (ids must be different: a repeated id is given a new one)
    const seen = new Set();
    let k = nodes.length;
    for (const n of nodes) {
      while (seen.has(n.id)) n.id = 'n' + ++k;
      seen.add(n.id);
    }
    const ids = new Set(nodes.map((n) => n.id));
    const pairs = new Set();
    const edges = [];
    (Array.isArray(d.edges) ? d.edges : []).slice(0, 800).forEach((e, i) => {
      const x = normEdge(e, i);
      if (!ids.has(x.from) || !ids.has(x.to) || x.from === x.to || pairs.has(x.from + '>' + x.to)) return;
      while (seen.has(x.id)) x.id = 'e' + ++k;
      seen.add(x.id);
      pairs.add(x.from + '>' + x.to);
      edges.push(x);
    });
    const s = d.sim || {};
    return {
      format: 'bms-flow-1',
      title: str(d.title) || 'Untitled diagram',
      description: str(d.description),
      group: str(d.group),
      order: num(d.order, 0),
      nodes,
      edges,
      sim: {
        duration: Math.max(1e-6, num(s.duration, 60)),
        timeUnit: str(s.timeUnit || 'min'),
        clampZero: s.clampZero == null ? true : !!s.clampZero,
        changeAt: s.changeAt == null || s.changeAt === '' ? null : Math.max(0, num(s.changeAt, 0))
      }
    };
  }
  /** what is written to a .flow.json file: only the settings that each box's role uses */
  function toJSON(D) {
    const keep = {
      quantity: ['rest', 'unit', 'tau'],
      stimulus: ['kind', 'start', 'size', 'length', 'period', 'unit'],
      setpoint: ['rest', 'unit', 'stepAt', 'step'],
      comparator: [],
      label: []
    };
    const out = {
      format: 'bms-flow-1',
      title: D.title,
      description: D.description || undefined,
      group: D.group || undefined,
      order: D.order || undefined,
      nodes: D.nodes.map((n) => {
        const o = { id: n.id, text: n.text, role: n.role, shape: n.shape, color: n.color, x: n.x, y: n.y, w: n.w, h: n.h };
        for (const k of keep[n.role]) o[k] = n[k];
        if (n.role === 'stimulus' && n.kind !== 'pulse' && n.kind !== 'ramp') delete o.length;
        if (n.role === 'stimulus' && n.kind !== 'wave') delete o.period;
        if (n.role === 'setpoint' && !n.step) { delete o.step; delete o.stepAt; }
        if (n.unit === '') delete o.unit;
        if (n.role !== 'label' && n.role !== 'comparator') o.plot = n.plot;
        if (n.knocked) o.knocked = true;
        if (n.fixed != null) o.fixed = n.fixed;
        return o;
      }),
      edges: D.edges.map((e) => {
        const o = { id: e.id, from: e.from, to: e.to, sign: e.sign };
        if (e.gain !== 1) o.gain = e.gain;
        if (e.delay) o.delay = e.delay;
        if (e.label) o.label = e.label;
        if (e.dashed) o.dashed = true;
        if (e.bend) o.bend = Math.round(e.bend);
        if (e.blocked) o.blocked = true;
        return o;
      }),
      sim: { duration: D.sim.duration, timeUnit: D.sim.timeUnit, clampZero: D.sim.clampZero }
    };
    if (D.sim.changeAt != null) out.sim.changeAt = D.sim.changeAt;
    return out;
  }
  const changeTime = (D) => (D.sim.changeAt == null ? D.sim.duration / 10 : D.sim.changeAt);
  const oneLine = (t) => str(t).replace(/\s*\n\s*/g, ' ').trim();

  /* ------------------------------------------------------------------
     the simulation
     ------------------------------------------------------------------ */
  /** the value that a stimulus or a set point sends at time t (its change from rest) */
  function drive(n, t) {
    if (n.role === 'setpoint') return n.step && t >= n.stepAt ? n.step : 0;
    if (t < n.start) return 0;
    const u = t - n.start;
    if (n.kind === 'pulse') return u < n.length ? n.size : 0;
    if (n.kind === 'ramp') return u < n.length ? (n.size * u) / n.length : n.size;
    if (n.kind === 'wave') return n.size * Math.sin((2 * Math.PI * u) / n.period);
    return n.size;
  }
  /** turning points of a trace (a fall or rise of more than prom between them) */
  function turningPoints(vals, prom) {
    const ext = [];
    let mode = 0, ref = vals[0], refI = 0;
    for (let i = 1; i < vals.length; i++) {
      const v = vals[i];
      if (mode === 0) {
        if (v - ref > prom) (mode = 1), (ref = v), (refI = i);
        else if (ref - v > prom) (mode = -1), (ref = v), (refI = i);
      } else if (mode === 1) {
        if (v > ref) (ref = v), (refI = i);
        else if (ref - v > prom) {
          ext.push({ type: 'max', i: refI, v: ref });
          (mode = -1), (ref = v), (refI = i);
        }
      } else if (v < ref) (ref = v), (refI = i);
      else if (v - ref > prom) {
        ext.push({ type: 'min', i: refI, v: ref });
        (mode = 1), (ref = v), (refI = i);
      }
    }
    return ext;
  }
  /**
   * Run a diagram. → { times, series: {id: levels}, ids, runaway: {id, t} | null, oscillating: [{id, trend}],
   *   settled, dt, steps, duration, changeAt, algebraicLoop, finals: {id: level} }
   */
  function simulate(D, opts = {}) {
    D = normDiagram(D);
    const T = Math.max(1e-6, num(opts.duration, D.sim.duration));
    const tChange = opts.changeAt != null ? opts.changeAt : changeTime(D);
    const clampZero = D.sim.clampZero;
    const nodes = D.nodes.filter((n) => n.role !== 'label');
    const N = nodes.length;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const ins = nodes.map(() => []);
    let blocked = 0;
    for (const e of D.edges) {
      if (!idx.has(e.from) || !idx.has(e.to)) continue;
      if (e.blocked) {
        blocked++;
        continue;
      }
      const to = nodes[idx.get(e.to)];
      if (to.role === 'stimulus' || to.role === 'setpoint') continue; // (nothing changes what comes from outside)
      ins[idx.get(e.to)].push({ j: idx.get(e.from), w: (e.sign === '-' ? -1 : 1) * e.gain, d: e.delay });
    }
    // the time step: short beside every response time, delay, pulse and wave
    const cands = [T / 2000];
    nodes.forEach((n, i) => {
      if (n.role === 'quantity') cands.push(n.tau / 20);
      if (n.role === 'stimulus' && (n.kind === 'pulse' || n.kind === 'ramp')) cands.push(n.length / 20);
      if (n.role === 'stimulus' && n.kind === 'wave') cands.push(n.period / 40);
      for (const x of ins[i]) if (x.d > 0) cands.push(x.d / 20);
    });
    let steps = Math.ceil(T / Math.max(Math.min(...cands), T / 200000));
    steps = clamp(steps, 50, 200000);
    const dt = T / steps;
    // how big a change can get before it counts as running away: ten times the biggest level or push in the diagram
    let drives = 1;
    for (const n of nodes) {
      if (n.role === 'stimulus') drives = Math.max(drives, Math.abs(n.size));
      if (n.role === 'setpoint') drives = Math.max(drives, Math.abs(n.step));
      if (n.fixed != null) drives = Math.max(drives, Math.abs(n.fixed - (n.role === 'stimulus' || n.role === 'comparator' ? 0 : n.rest)));
    }
    const cap = nodes.map((n) => 10 * Math.max(1, Math.abs(n.rest), drives));
    const rest = nodes.map((n) => (n.role === 'quantity' || n.role === 'setpoint' ? n.rest : 0));
    // the comparators, in an order in which each comes after the comparators it reads at once (no delay)
    const comps = [];
    {
      const cs = nodes.map((n, i) => i).filter((i) => nodes[i].role === 'comparator');
      const indeg = new Map(cs.map((i) => [i, 0]));
      for (const c of cs) for (const x of ins[c]) if (!x.d && nodes[x.j].role === 'comparator') indeg.set(c, indeg.get(c) + 1);
      const queue = cs.filter((c) => indeg.get(c) === 0);
      const done = new Set();
      while (queue.length) {
        const c = queue.shift();
        comps.push(c);
        done.add(c);
        for (const d of cs) {
          if (done.has(d)) continue;
          for (const x of ins[d]) if (!x.d && x.j === c) indeg.set(d, indeg.get(d) - 1);
          if (indeg.get(d) === 0 && !queue.includes(d)) queue.push(d);
        }
      }
      for (const c of cs) if (!done.has(c)) comps.push(c);
    }
    const algebraicLoop = comps.length && comps.some((c, k) => ins[c].some((x) => !x.d && nodes[x.j].role === 'comparator' && comps.indexOf(x.j) > k));
    // the history of the boxes that an arrow with a delay reads
    const hist = new Array(N).fill(null);
    nodes.forEach((n, i) => {
      for (const x of ins[i]) {
        if (x.d <= 0) continue;
        const need = Math.ceil(x.d / dt) + 3;
        if (!hist[x.j] || hist[x.j].length < need) hist[x.j] = new Float64Array(need);
      }
    });
    const x = new Float64Array(N); // quantities: their change from rest
    const v = new Float64Array(N); // what each box sends
    const E = nodes.map((n) => (n.role === 'quantity' ? Math.exp(-dt / n.tau) : 0));
    let k = 0;
    const read = (j, d) => {
      if (!d) return v[j];
      const p = k - d / dt;
      if (p < 0) return 0;
      const H = hist[j], L = H.length;
      const a = Math.floor(p), f = p - a;
      const va = H[a % L], vb = a + 1 <= k - 1 ? H[(a + 1) % L] : va;
      return va + (vb - va) * f;
    };
    const every = Math.max(1, Math.round(steps / 1000));
    const times = [];
    const series = nodes.map(() => []);
    let runaway = null;
    const forced = (n, i, t) => {
      if (t < tChange) return null;
      if (n.knocked) return -rest[i];
      if (n.fixed != null) return n.fixed - rest[i];
      return null;
    };
    for (k = 0; k <= steps; k++) {
      const t = k * dt;
      for (let i = 0; i < N; i++) {
        const n = nodes[i];
        if (n.role === 'stimulus' || n.role === 'setpoint') {
          const f = forced(n, i, t);
          v[i] = f != null ? f : drive(n, t);
        } else if (n.role === 'quantity') v[i] = x[i];
      }
      for (const c of comps) {
        const f = forced(nodes[c], c, t);
        if (f != null) {
          v[c] = f;
          continue;
        }
        let s = 0;
        for (const q of ins[c]) s += q.w * read(q.j, q.d);
        v[c] = s;
      }
      if (k % every === 0 || k === steps) {
        times.push(t);
        for (let i = 0; i < N; i++) series[i].push(rest[i] + v[i]);
      }
      for (let i = 0; i < N; i++) if (hist[i]) hist[i][k % hist[i].length] = v[i];
      if (k === steps) break;
      // move the quantities on by one step
      for (let i = 0; i < N; i++) {
        const n = nodes[i];
        if (n.role !== 'quantity') continue;
        const f = forced(n, i, t + dt);
        if (f != null) {
          x[i] = f;
          continue;
        }
        let target = 0;
        for (const q of ins[i]) target += q.w * read(q.j, q.d);
        let nx = target + (x[i] - target) * E[i];
        if (clampZero && rest[i] + nx < 0) nx = -rest[i];
        if (!Number.isFinite(nx) || Math.abs(nx) > cap[i]) {
          nx = Number.isFinite(nx) ? Math.sign(nx) * cap[i] : cap[i];
          if (!runaway) runaway = { id: n.id, t: t + dt };
        }
        x[i] = nx;
      }
    }
    // did anything go up and down, and did it settle?
    const oscillating = [];
    let settled = true;
    nodes.forEach((n, i) => {
      if (n.role !== 'quantity') return;
      const s = series[i];
      let lo = Infinity, hi = -Infinity;
      for (const y of s) (lo = Math.min(lo, y)), (hi = Math.max(hi, y));
      const range = hi - lo;
      const scale = Math.max(1e-9, Math.abs(rest[i]), 1e-6);
      if (range > 1e-6 * scale) {
        const ext = turningPoints(s, 0.03 * range);
        if (ext.length >= 3) {
          const amps = [];
          for (let q = 1; q < ext.length; q++) amps.push(Math.abs(ext[q].v - ext[q - 1].v));
          const r = amps[amps.length - 1] / Math.max(1e-12, amps[0]);
          oscillating.push({ id: n.id, trend: r > 1.2 ? 'growing' : r < 0.8 ? 'dying away' : 'steady', cycles: Math.floor(ext.length / 2) });
        }
        const last = s[s.length - 1], before = s[Math.floor(s.length * 0.9)];
        let lo2 = Infinity, hi2 = -Infinity;
        for (let q = Math.floor(s.length * 0.9); q < s.length; q++) (lo2 = Math.min(lo2, s[q])), (hi2 = Math.max(hi2, s[q]));
        if (Math.abs(last - before) > 0.01 * range || hi2 - lo2 > 0.02 * range) settled = false;
      }
    });
    const out = {
      times,
      ids: nodes.map((n) => n.id),
      series: {},
      finals: {},
      runaway,
      oscillating,
      settled: settled && !runaway,
      dt,
      steps,
      duration: T,
      changeAt: tChange,
      blocked,
      knocked: nodes.filter((n) => n.knocked || n.fixed != null).length,
      algebraicLoop: !!algebraicLoop
    };
    nodes.forEach((n, i) => {
      out.series[n.id] = series[i];
      out.finals[n.id] = series[i][series[i].length - 1];
    });
    return out;
  }

  /* ------------------------------------------------------------------
     geometry: where an arrow meets a box, curves, wrapping text
     ------------------------------------------------------------------ */
  /** the point where a line from the centre of box n towards (px, py) leaves the box */
  function border(n, px, py, pad = 0) {
    let dx = px - n.x, dy = py - n.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const a = n.w / 2 + pad, b = n.h / 2 + pad;
    let t;
    if (n.shape === 'ellipse' || n.shape === 'circle') t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
    else t = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
    return { x: n.x + dx * t, y: n.y + dy * t };
  }
  const qpt = (p0, c, p2, s) => ({ x: (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * c.x + s * s * p2.x, y: (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * c.y + s * s * p2.y });
  /** the geometry of an arrow from box A to box B: start, control point, end, the direction at each end */
  function edgeGeom(A, B, bend) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    let dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const px = -dy, py = dx; // (the side of the line that a positive bend goes to)
    const C = { x: mx + bend * px, y: my + bend * py };
    const p0 = border(A, bend ? C.x : B.x, bend ? C.y : B.y, 2);
    const p2 = border(B, bend ? C.x : A.x, bend ? C.y : A.y, 3);
    const cc = bend ? C : { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    let tx = p2.x - cc.x, ty = p2.y - cc.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    return { p0, c: cc, p2, tx, ty, px, py, mid: qpt(p0, cc, p2, 0.5), straight: !bend };
  }
  let measureCtx = null;
  function textWidth(t, size, weight) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight || 600} ${size}px ${FONT}`;
    return measureCtx.measureText(t).width;
  }
  /** the lines of a box's text, wrapped to its width */
  function wrap(text, maxW, size, weight) {
    const out = [];
    for (const para of str(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.push('');
        continue;
      }
      let line = words[0];
      for (const w of words.slice(1)) {
        const t = line + ' ' + w;
        if (textWidth(t, size, weight) <= maxW) line = t;
        else {
          out.push(line);
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1;
    const step0 = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * span; v += step) out.push(Math.abs(v) < 1e-12 * span ? 0 : v);
    return out;
  }
  const slug = (t) => oneLine(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'diagram';

  /* ------------------------------------------------------------------
     the app
     ------------------------------------------------------------------ */
  class FlowApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      this.view = { tx: 40, ty: 40, k: 1 };
      this.selN = new Set();
      this.selE = new Set();
      this.newSign = '+';
      this.snap = true;
      this.hist = [];
      this.future = [];
      this.result = null;
      this.tCursor = null;
      this.speed = store.get('flow:speed', 'normal');
      this.pointers = new Map();
      this.examples = null;
      this.uid = Math.random().toString(36).slice(2, 8);
      this._build();
      this.ready = this._start().catch((e) => {
        console.error(e);
        this._load(normDiagram({ title: 'Untitled diagram' }), {});
      });
    }

    /* ================= building the page ================= */
    _build() {
      const r = this.root;
      r.classList.add('fl');
      r.innerHTML = '';
      const B = (icon, label, title, fn, cls) => {
        const b = h('button.tbtn' + (cls ? '.' + cls : ''), { type: 'button', title: title || label, 'aria-label': title || label, html: ic(icon) + (label ? `<span>${esc(label)}</span>` : '') });
        if (fn) b.addEventListener('click', fn);
        return b;
      };
      // the toolbar
      this.titleBtn = h('button.fl-title', { type: 'button', title: 'Rename the diagram' });
      this.titleBtn.addEventListener('click', () => this.rename());
      this.btnNew = B('newfile', 'New', 'A new diagram, or one of the examples', () => this.newMenu(), 'caret');
      this.btnOpen = B('openfolder', 'Open', 'Open a diagram from your files', () => this.openDialog());
      this.btnSave = B('save', 'Save', 'Save the diagram in your files (Ctrl+S)', () => this.save());
      this.btnAdd = B('box', 'Box', 'Add a box (or double-click an empty part of the diagram)', () => this.addMenu(), 'caret');
      this.signBtns = {};
      const seg = h('div.fl-seg', { role: 'group', 'aria-label': 'The kind of arrow that new arrows will be' });
      for (const [s, iname, lab, tip] of [['+', 'plusArrow', '+', 'New arrows stimulate (+): more of one makes more of the other'], ['-', 'minusArrow', '−', 'New arrows inhibit (−): more of one makes less of the other'], ['0', 'plainArrow', '→', 'New arrows simply lead to the next box']]) {
        const b = h('button.fl-sign', { type: 'button', title: tip, 'aria-label': tip, 'aria-pressed': 'false', 'data-sign': s, html: ic(iname) + `<span>${lab}</span>` });
        b.addEventListener('click', () => this.setSign(s));
        this.signBtns[s] = b;
        seg.appendChild(b);
      }
      this.btnUndo = B('undo', '', 'Undo (Ctrl+Z)', () => this.undo());
      this.btnRedo = B('redo', '', 'Redo (Ctrl+Y)', () => this.redo());
      this.btnDel = B('trash', '', 'Delete what is selected (Delete)', () => this.deleteSelection());
      this.btnRun = h('button.btn.primary.small.fl-runbtn', { type: 'button', title: 'Run the simulation', html: MG.icon('play') + '<span>Run</span>' });
      this.btnRun.addEventListener('click', () => this.run());
      this.btnExport = B('download', 'Export', 'Save a picture of the diagram, or the results of the last run', () => this.exportMenu(), 'caret');
      this.btnHelp = B('help', '', 'How to draw a diagram, and how the simulation works', () => this.help());
      // (the labels that go first when the toolbar is too narrow for one line: see _fitBar)
      this.btnOpen.classList.add('fl-l2');
      this.btnSave.classList.add('fl-l2');
      for (const b of [this.btnNew, this.btnAdd, this.btnExport]) b.classList.add('fl-l3');
      this.bar = h('div.fl-bar', { role: 'toolbar', 'aria-label': 'Diagram' },
        this.titleBtn, h('span.fl-sep'),
        this.btnNew, this.btnOpen, this.btnSave, h('span.fl-sep'),
        this.btnAdd, seg, h('span.fl-sep'),
        this.btnUndo, this.btnRedo, this.btnDel, h('span.grow'),
        this.btnRun, this.btnExport, this.btnHelp);

      // the drawing
      this.svg = S('svg', { class: 'fl-svg', tabindex: '0', role: 'application', 'aria-label': 'Diagram: double-click to add a box, drag from the dots on a box to draw an arrow' });
      const defs = S('defs');
      this.gridPat = S('pattern', { id: 'flgrid-' + this.uid, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, S('circle', { cx: 1, cy: 1, r: 1, fill: '#cfd6df' }));
      defs.appendChild(this.gridPat);
      this.svg.appendChild(defs);
      this.bg = S('rect', { class: 'fl-bgrect', x: 0, y: 0, width: '100%', height: '100%', fill: `url(#flgrid-${this.uid})` });
      this.svg.appendChild(this.bg);
      this.world = S('g', { class: 'fl-world', 'font-family': FONT });
      this.gEdges = S('g', { class: 'fl-edges' });
      this.gNodes = S('g', { class: 'fl-nodes' });
      this.gOver = S('g', { class: 'fl-over fl-ui' });
      this.world.append(this.gEdges, this.gNodes, this.gOver);
      this.svg.appendChild(this.world);
      this.editor = h('textarea.fl-edit', { hidden: true, 'aria-label': 'Text of the box', spellcheck: 'true' });
      this.legend = h('div.fl-legend', { 'aria-hidden': 'true' },
        h('span', { html: `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6h24" stroke="${SIGNS['+'].color}" stroke-width="2"/><path d="M24 1.5l8 4.5-8 4.5z" fill="${SIGNS['+'].color}"/></svg>stimulates (+)` }),
        h('span', { html: `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6h29" stroke="${SIGNS['-'].color}" stroke-width="2"/><path d="M31 0.5v11" stroke="${SIGNS['-'].color}" stroke-width="3"/></svg>inhibits (−)` }),
        h('span', { html: `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6h24" stroke="#3b4656" stroke-width="2" stroke-dasharray="5 3"/><path d="M24 1.5l8 4.5-8 4.5z" fill="#3b4656"/></svg>dashed: indirect, or feedback` }));
      this.zoomLbl = h('button.fl-zbtn.fl-zpct', { type: 'button', title: 'Zoom to 100%' }, '100%');
      this.zoomLbl.addEventListener('click', () => this.zoomTo(1));
      const zb = (iname, title, fn) => {
        const b = h('button.fl-zbtn', { type: 'button', title, 'aria-label': title, html: ic(iname) });
        b.addEventListener('click', fn);
        return b;
      };
      this.boxModeBtn = zb('boxsel', 'Select an area (or drag with Shift held down)', () => {
        this.boxMode = !this.boxMode;
        this.boxModeBtn.classList.toggle('on', this.boxMode);
      });
      this.keyBtn = zb('list', 'Show or hide the key to the arrows', () => this.showKey(!this.keyShown));
      const zoom = h('div.fl-zoom', zb('minus', 'Zoom out', () => this.zoomBy(1 / 1.25)), this.zoomLbl, zb('plus', 'Zoom in', () => this.zoomBy(1.25)), zb('fit', 'Fit the diagram to the window', () => this.fit()), this.boxModeBtn, this.keyBtn);
      this.hint = h('div.fl-hint', { 'aria-live': 'polite' });
      this.empty = h('div.fl-empty', { hidden: true }, h('b', 'An empty diagram'), h('span', 'Double-click to add a box, or use '), h('b', '+ Box'), h('span', '. Drag from the dots on the edge of a box to another box to draw an arrow.'));
      this.canvas = h('div.fl-canvas', this.svg, this.legend, zoom, this.hint, this.empty, this.editor);

      // the run panel
      this.durIn = h('input.fl-num', { type: 'number', min: '0', step: 'any', 'aria-label': 'How long to simulate', title: 'How long to simulate' });
      this.unitSel = h('select.fl-sel', { 'aria-label': 'Time unit', title: 'Time unit' }, UNITS.map((u) => h('option', { value: u }, u)));
      this.speedSel = h('select.fl-sel', { 'aria-label': 'Speed', title: 'How fast the run is shown' }, SPEEDS.map(([v, l]) => h('option', { value: v }, l)));
      this.speedSel.value = this.speed;
      this.speedSel.addEventListener('change', () => {
        this.speed = this.speedSel.value;
        store.set('flow:speed', this.speed);
      });
      this.durIn.addEventListener('change', () => this.setSim({ duration: Math.max(1e-6, num(this.durIn.value, this.D.sim.duration)) }));
      this.unitSel.addEventListener('change', () => this.setSim({ timeUnit: this.unitSel.value }));
      const runBtn2 = h('button.btn.primary.small', { type: 'button', html: MG.icon('play') + '<span>Run</span>', title: 'Run the simulation' });
      runBtn2.addEventListener('click', () => this.run());
      this.stopBtn = h('button.tbtn', { type: 'button', title: 'Stop the animation (show the end)', html: MG.icon('stopsq'), hidden: true });
      this.stopBtn.addEventListener('click', () => this.stopAnim(true));
      this.csvBtn = h('button.tbtn.fl-csv', { type: 'button', title: 'Keep the results of the run in your files (a .csv table for R)', html: MG.icon('table') + '<span>Results to my files</span>', disabled: true });
      this.csvBtn.addEventListener('click', () => this.exportCSV(true));
      this.runMsg = h('div.fl-runmsg', { 'aria-live': 'polite' }, 'Press Run to see how the quantities in the diagram change over time.');
      this.collapseBtn = h('button.tbtn.fl-collapse', { type: 'button', title: 'Hide or show the graphs', html: MG.icon('chevD') });
      this.collapseBtn.addEventListener('click', () => this.toggleRun());
      this.chart = h('div.fl-chart');
      this.scrub = h('input.fl-scrub', { type: 'range', min: '0', max: '1000', value: '1000', 'aria-label': 'Time shown in the diagram', disabled: true });
      this.scrub.addEventListener('input', () => {
        if (!this.result) return;
        this.stopAnim(false);
        this.setCursor((this.result.duration * this.scrub.value) / 1000);
      });
      this.tLabel = h('span.fl-tlabel');
      this.table = h('div.fl-results');
      // (where the drawing is narrow, the graphs and the table of numbers take turns: flow.css shows these buttons)
      this.viewBtns = {};
      const viewSeg = h('div.fl-seg.fl-view', { role: 'group', 'aria-label': 'Show the graphs or the numbers' });
      for (const [v, label, tip] of [['graphs', 'Graphs', 'Show the graphs of the run'], ['numbers', 'Numbers', 'Show the lowest, highest and final levels of the run']]) {
        const b = h('button.fl-vbtn', { type: 'button', title: tip, 'aria-pressed': 'false', 'data-view': v }, label);
        b.addEventListener('click', () => this.setRunView(v));
        this.viewBtns[v] = b;
        viewSeg.appendChild(b);
      }
      this.runBody = h('div.fl-runbody', h('div.fl-plot', this.chart, h('div.fl-scrubrow', this.scrub, this.tLabel)), this.table);
      this.runPanel = h('div.fl-run', { role: 'region', 'aria-label': 'Simulation' },
        h('div.fl-runbar', runBtn2, this.stopBtn,
          h('label.fl-lab', h('span', 'Run for'), this.durIn, this.unitSel),
          h('label.fl-lab', h('span', 'Speed'), this.speedSel),
          this.runMsg, viewSeg, this.csvBtn, this.collapseBtn),
        this.runBody);
      this.setRunView('graphs');
      if (store.get('flow:runClosed', true)) this.runPanel.classList.add('closed');

      // the inspector
      this.side = h('aside.fl-side', { 'aria-label': 'Properties' });
      this.sideHead = h('button.fl-sidehead', { type: 'button', 'aria-expanded': 'true' });
      this.sideHead.addEventListener('click', () => {
        const open = !this.side.classList.contains('open');
        this.side.classList.toggle('open', open);
        this.root.classList.toggle('side-open', open);
        this.sideHead.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      this.sideBody = h('div.fl-sidebody');
      this.side.append(this.sideHead, this.sideBody);

      this.stage = h('div.fl-stage', this.canvas, this.runPanel);
      r.append(this.bar, h('div.fl-body', this.stage, this.side));
      this._wire();
      this.setSign('+');
      this.showKey(store.get('flow:key', true));
    }
    showKey(on) {
      this.keyShown = !!on;
      this.legend.hidden = !on;
      this.keyBtn.classList.toggle('on', !!on);
      store.set('flow:key', !!on);
    }

    _wire() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => this._down(e));
      svg.addEventListener('pointermove', (e) => this._move(e));
      svg.addEventListener('pointerup', (e) => this._up(e));
      svg.addEventListener('pointercancel', (e) => this._up(e, true));
      svg.addEventListener('dblclick', (e) => this._dbl(e));
      svg.addEventListener('contextmenu', (e) => this._context(e));
      svg.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
      svg.addEventListener('keydown', (e) => this._key(e));
      svg.addEventListener('focus', () => this.svg.classList.add('kbd'));
      svg.addEventListener('blur', () => this.svg.classList.remove('kbd'));
      this.editor.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this._endEdit(false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._endEdit(true);
        }
        e.stopPropagation();
      });
      this.editor.addEventListener('blur', () => this._endEdit(true));
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(MG.debounce(() => this._resized(), 60));
        this._ro.observe(this.canvas);
        this._ro.observe(this.chart);
      }
      this._emitEdit = MG.debounce(() => bus.emit('flow:edit', { nodes: this.D.nodes.length, edges: this.D.edges.length, name: this.D.title }), 500);
      this._saveDraft = MG.debounce(() => {
        try {
          store.set('flow:draft', { ref: this.ref || null, example: this.example || null, D: toJSON(this.D), saved: this.savedJSON });
        } catch (e) {
          /* (the browser keeps nothing) */
        }
      }, 400);
    }

    async _start() {
      const d = store.get('flow:draft', null);
      if (d && d.D) {
        const D = normDiagram(d.D);
        this._load(D, { ref: d.ref, example: d.example, saved: d.saved });
        return;
      }
      try {
        await this.open('example:negative-feedback-temperature', { quiet: true, force: true });
      } catch (e) {
        this._load(normDiagram({ title: 'Untitled diagram' }), {});
      }
    }

    /* ================= loading, saving ================= */
    _load(D, o = {}) {
      this._endEdit(false);
      this.stopAnim(false);
      this.D = D;
      this.ref = o.ref || null;
      this.example = o.example || null;
      this.savedJSON = o.saved != null ? o.saved : JSON.stringify(toJSON(D));
      this.hist = [];
      this.future = [];
      this.selN.clear();
      this.selE.clear();
      this.result = null;
      this.tCursor = null;
      this.hint.textContent = '';
      this._nextIds();
      this.durIn.value = D.sim.duration;
      if (!UNITS.includes(D.sim.timeUnit)) this.unitSel.appendChild(h('option', { value: D.sim.timeUnit }, D.sim.timeUnit));
      this.unitSel.value = D.sim.timeUnit;
      this.render();
      this.renderSide();
      this.renderRun();
      this._fitted = false;
      if (this.canvas.clientWidth) this.fit();
      this._saveDraft();
      this._updateButtons();
    }
    _nextIds() {
      let n = 0;
      for (const x of this.D.nodes.concat(this.D.edges)) {
        const m = /(\d+)$/.exec(x.id);
        if (m) n = Math.max(n, +m[1]);
      }
      this._id = n;
    }
    _newId(p) {
      const ids = new Set(this.D.nodes.map((n) => n.id).concat(this.D.edges.map((e) => e.id)));
      let id;
      do id = p + ++this._id;
      while (ids.has(id));
      return id;
    }
    dirty() {
      return !!this.D && JSON.stringify(toJSON(this.D)) !== this.savedJSON;
    }
    async _confirmLeave() {
      if (!this.dirty()) return true;
      return MG.confirmBox('Leave this diagram?', `<p><b>${esc(this.D.title)}</b> has changes that are not saved in a file. If you go on, they are lost (unless you save it first).</p>`, 'Go on without saving', { danger: true, cancel: 'Keep it' });
    }
    async newDiagram(opts = {}) {
      if (!opts.force && !(await this._confirmLeave())) return false;
      this._load(normDiagram({ title: 'New diagram', sim: { duration: 60, timeUnit: 'min' } }), {});
      bus.emit('flow:open', { name: this.D.title, path: '', example: 'blank' });
      return true;
    }
    async _examples() {
      if (this.examples) return this.examples;
      const base = (MG.config.examplesBase || 'examples/').replace(/\/?$/, '/');
      try {
        const r = await fetch(base + 'index.json', { cache: 'no-cache' });
        this.examples = r.ok ? (await r.json()).diagrams || [] : [];
      } catch (e) {
        this.examples = [];
      }
      return this.examples;
    }
    /** open 'example:ID' or a file (a path among the user's files) */
    async open(ref, opts = {}) {
      ref = str(ref).trim();
      if (!ref) return this.newDiagram(opts);
      if (!opts.force && !(await this._confirmLeave())) return false;
      let text, example = null, path = null;
      if (/^example:/i.test(ref)) {
        example = ref.slice(8);
        if (example === 'blank') return this.newDiagram({ force: true });
        const base = (MG.config.examplesBase || 'examples/').replace(/\/?$/, '/');
        const r = await fetch(base + 'diagrams/' + encodeURIComponent(example) + '.flow.json', { cache: 'no-cache' });
        if (!r.ok) {
          if (!opts.quiet) toast(`There is no example called <b>${esc(example)}</b>.`, 'warn');
          throw new Error('no such example: ' + example);
        }
        text = await r.text();
      } else {
        path = this.fs.resolve(ref);
        if (!this.fs.exists(path)) {
          toast(`There is no file <b>${esc(this.fs.pretty(path))}</b>.`, 'warn');
          return false;
        }
        text = await this.fs.readText(path);
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch (e) {
        toast(`That file is not a diagram (it is not JSON): ${esc(e.message)}`, 'error');
        return false;
      }
      const D = normDiagram(raw);
      this._load(D, { ref: path, example });
      bus.emit('flow:open', { name: D.title, path: path || '', example: example || '' });
      return true;
    }
    async save() {
      if (!this.ref) return this.saveAs();
      return this._writeTo(this.ref);
    }
    async saveAs() {
      // (named after the diagram's title: a diagram begun from an example, or from the blank one, is the student's own)
      const def = '~/diagrams/' + slug(this.D.title) + '.flow.json';
      let name = await MG.promptText('Save the diagram', 'Where to save it (a path in your home folder, ~; the name ends in .flow.json):', this.ref ? this.fs.pretty(this.ref) : def, 'Save');
      if (!name) return false;
      if (!/\.flow\.json$/i.test(name)) name = name.replace(/(\.json)?$/i, '.flow.json');
      const p = this.fs.resolve(name);
      if (!p.startsWith(MG.app.HOME + '/')) {
        toast('Diagrams can only be saved in your home folder (~).', 'warn');
        return false;
      }
      if (p !== this.ref && this.fs.exists(p) && !(await MG.confirmBox('Replace the file?', `<p><b>${esc(this.fs.pretty(p))}</b> already exists. Replace it?</p>`, 'Replace it'))) return false;
      return this._writeTo(p);
    }
    _writeTo(p) {
      const text = JSON.stringify(toJSON(this.D), null, 1) + '\n';
      this.fs.mkdirp(MG.path.dirname(p));
      this.fs.writeText(p, text);
      this.ref = p;
      this.example = null;
      this.savedJSON = JSON.stringify(toJSON(this.D));
      this._saveDraft();
      this._updateButtons();
      toast(`Saved <b>${esc(this.fs.pretty(p))}</b>.`, 'ok', 2500);
      bus.emit('flow:save', { path: p, name: this.D.title });
      return p;
    }
    rename() {
      MG.promptText('Name the diagram', 'The title of the diagram:', this.D.title, 'OK').then((t) => {
        if (!t || t === this.D.title) return;
        this._snap();
        this.D.title = t;
        this._changed();
      });
    }
    async newMenu() {
      const ex = await this._examples();
      const items = [['newfile', 'Blank diagram', () => this.newDiagram()]];
      for (const e of ex) if (e.id !== 'blank') items.push(['book', 'Example: ' + e.title, () => this.open('example:' + e.id)]);
      items.push(['openfolder', 'Open a diagram from my files…', () => this.openDialog()]);
      items.push(['save', 'Save as…', () => this.saveAs()]);
      MG.popmenu(this.btnNew, items);
    }
    openDialog() {
      const fs = this.fs;
      const mine = [];
      for (const [p, e] of fs.entries) if (e.kind !== 'dir' && p.startsWith(MG.app.HOME + '/') && /\.flow\.json$/i.test(p)) mine.push(p);
      mine.sort();
      const m = MG.modal('Open a diagram', '');
      const body = m.box.querySelector('.modal-b');
      body.appendChild(h('h4.fl-dlg-h', 'Your diagrams'));
      if (!mine.length) body.appendChild(h('p.muted', 'You have not saved a diagram yet. Diagrams you save go in ~/diagrams.'));
      const list = h('div.fl-dlg-list');
      for (const p of mine) {
        const b = h('button.fl-dlg-item', { type: 'button' }, h('span', { html: MG.icon('file') }), h('span', fs.pretty(p)));
        b.addEventListener('click', () => {
          m.close();
          this.open(p);
        });
        list.appendChild(b);
      }
      body.appendChild(list);
      body.appendChild(h('h4.fl-dlg-h', 'Examples'));
      const exl = h('div.fl-dlg-list');
      body.appendChild(exl);
      this._examples().then((ex) => {
        for (const e of ex) {
          const b = h('button.fl-dlg-item', { type: 'button' }, h('span', { html: MG.icon('book') }), h('span', h('b', e.title), e.description ? h('small', e.description) : null));
          b.addEventListener('click', () => {
            m.close();
            this.open('example:' + e.id);
          });
          exl.appendChild(b);
        }
        if (!ex.length) exl.appendChild(h('p.muted', 'The examples could not be loaded.'));
      });
      const up = h('button.btn.small', { type: 'button', html: MG.icon('upload') + '<span>Open a .flow.json file from my computer…</span>' });
      up.addEventListener('click', () => {
        const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
        document.body.appendChild(inp);
        inp.addEventListener('change', async () => {
          const f = inp.files && inp.files[0];
          inp.remove();
          if (!f) return;
          const text = await f.text();
          let name = f.name.replace(/[^A-Za-z0-9._-]+/g, '-');
          if (!/\.flow\.json$/i.test(name)) name = name.replace(/(\.json)?$/i, '.flow.json');
          const p = fs.resolve('~/diagrams/' + name);
          fs.mkdirp(MG.path.dirname(p));
          fs.writeText(p, text);
          m.close();
          this.open(p);
        });
        inp.click();
      });
      body.appendChild(h('div.prompt-actions', up));
    }

    /* ================= changes, undo ================= */
    _snap() {
      this.hist.push(JSON.stringify(toJSON(this.D)));
      if (this.hist.length > 120) this.hist.shift();
      this.future = [];
      this._updateButtons();
    }
    _snapOnce(key) {
      const now = Date.now();
      if (this._lastKey === key && now - (this._lastSnapAt || 0) < 1500) {
        this._lastSnapAt = now;
        return;
      }
      this._lastKey = key;
      this._lastSnapAt = now;
      this._snap();
    }
    _changed(opts = {}) {
      this._lastKey = opts.key || null;
      this.render();
      if (opts.side !== false) this.renderSide();
      this._saveDraft();
      this._emitEdit();
      this._updateButtons();
      if (this.result) {
        const stale = this._simSig() !== this.result.sig;
        const plots = this._plotSig();
        if (stale !== !!this.result.stale || plots !== this.result.plots) {
          this.result.stale = stale;
          this.result.plots = plots;
          this.renderRun();
          this.render();
        }
      }
    }
    /** what the simulation uses: a change to any of it makes the last run out of date */
    _simSig() {
      const D = this.D;
      return JSON.stringify([D.sim, D.nodes.map((n) => [n.id, n.role, n.rest, n.tau, n.kind, n.start, n.size, n.length, n.period, n.stepAt, n.step, n.knocked, n.fixed]), D.edges.map((e) => [e.from, e.to, e.sign, e.gain, e.delay, e.blocked])]);
    }
    _plotSig() {
      return this.D.nodes.map((n) => (n.plot ? n.id + ':' + n.text + ':' + n.color + ':' + n.unit : '')).join('|');
    }
    undo() {
      if (!this.hist.length) return;
      this.future.push(JSON.stringify(toJSON(this.D)));
      this._restore(this.hist.pop());
    }
    redo() {
      if (!this.future.length) return;
      this.hist.push(JSON.stringify(toJSON(this.D)));
      this._restore(this.future.pop());
    }
    _restore(json) {
      const D = normDiagram(JSON.parse(json));
      this.D = D;
      for (const id of [...this.selN]) if (!D.nodes.some((n) => n.id === id)) this.selN.delete(id);
      for (const id of [...this.selE]) if (!D.edges.some((e) => e.id === id)) this.selE.delete(id);
      this._lastKey = null;
      this.durIn.value = D.sim.duration;
      this.unitSel.value = D.sim.timeUnit;
      this._changed();
    }
    _updateButtons() {
      if (!this.D) return;
      this.btnUndo.disabled = !this.hist.length;
      this.btnRedo.disabled = !this.future.length;
      this.btnDel.disabled = !this.selN.size && !this.selE.size;
      const dirty = this.dirty();
      const th = `<span>${esc(oneLine(this.D.title))}</span>` + (dirty ? '<i title="Not saved in a file">•</i>' : '');
      if (th !== this._titleHTML) {
        this._titleHTML = th;
        this.titleBtn.innerHTML = th;
        this._fitBar();
      }
      this.titleBtn.title = oneLine(this.D.title) + ' – ' + (this.ref ? 'in ' + this.fs.pretty(this.ref) : this.example ? 'an example: save it to keep your changes' : 'not saved yet') + '. Click to rename it.';
      this.empty.hidden = !!this.D.nodes.length;
    }
    setSim(o) {
      this._snap();
      Object.assign(this.D.sim, o);
      this._changed();
    }
    setSign(s) {
      this.newSign = s;
      for (const [k, b] of Object.entries(this.signBtns)) {
        b.classList.toggle('on', k === s);
        b.setAttribute('aria-pressed', k === s ? 'true' : 'false');
      }
      // (only new arrows: an arrow that is there already is changed in the panel on the right, or by right-clicking it)
    }

    /* ================= adding and removing ================= */
    node(id) {
      return this.D.nodes.find((n) => n.id === id) || null;
    }
    edge(id) {
      return this.D.edges.find((e) => e.id === id) || null;
    }
    /** add a box; p: its settings (role, text, x, y, …) → the box */
    addNode(p = {}, opts = {}) {
      if (opts.snap !== false) this._snap();
      const c = this._viewCentre();
      const role = ROLE_SET.has(p.role) ? p.role : 'quantity';
      const base = { role, x: c.x, y: c.y };
      if (role === 'stimulus') Object.assign(base, { start: snapTo(this.D.sim.duration / 10, this.D.sim.duration >= 20 ? 1 : 0.1) || 1 });
      const n = normNode(Object.assign(base, p, { id: this._newId('n') }), 0);
      if (this.snap) {
        n.x = snapTo(n.x, GRID);
        n.y = snapTo(n.y, GRID);
      }
      // (not on top of another box)
      for (let tries = 0; tries < 30 && this.D.nodes.some((m) => Math.abs(m.x - n.x) < 20 && Math.abs(m.y - n.y) < 20); tries++) {
        n.x += 30;
        n.y += 20;
      }
      this.D.nodes.push(n);
      this.selN.clear();
      this.selE.clear();
      this.selN.add(n.id);
      this._changed();
      bus.emit('flow:node', { text: oneLine(n.text), role: n.role });
      return n;
    }
    /** add an arrow from box a to box b → the arrow (or null when there is one already) */
    addEdge(a, b, p = {}, opts = {}) {
      if (!a || !b || a === b) return null;
      if (this.D.edges.some((e) => e.from === a && e.to === b)) {
        toast('There is an arrow between these boxes already.', null, 2000);
        return null;
      }
      if (opts.snap !== false) this._snap();
      // (an arrow back the other way bends, so that the two do not lie on top of each other)
      const back = this.D.edges.find((e) => e.from === b && e.to === a);
      const e = normEdge(Object.assign({ sign: this.newSign, bend: back && !back.bend ? 30 : 0 }, p, { id: this._newId('e'), from: a, to: b }), 0);
      if (back && !back.bend) back.bend = 30;
      this.D.edges.push(e);
      this.selN.clear();
      this.selE.clear();
      this.selE.add(e.id);
      this._changed();
      bus.emit('flow:edge', { sign: e.sign, from: oneLine(this.node(a).text), to: oneLine(this.node(b).text) });
      return e;
    }
    deleteSelection() {
      if (!this.selN.size && !this.selE.size) return;
      this._snap();
      this.D.nodes = this.D.nodes.filter((n) => !this.selN.has(n.id));
      this.D.edges = this.D.edges.filter((e) => !this.selE.has(e.id) && !this.selN.has(e.from) && !this.selN.has(e.to));
      this.selN.clear();
      this.selE.clear();
      this._changed();
    }
    addMenu() {
      const add = (p) => () => {
        const n = this.addNode(p);
        if (p.role !== 'comparator') setTimeout(() => this.editText(n.id), 30);
      };
      MG.popmenu(this.btnAdd, [
        ['rect', 'A quantity (a level, a rate, a hormone…)', add({ role: 'quantity' })],
        ['arrowR', 'A stimulus or disturbance', add({ role: 'stimulus', text: 'Stimulus' })],
        ['target', 'A set point', add({ role: 'setpoint', text: 'Set point' })],
        ['plus', 'A comparator (Σ: adds up its inputs)', add({ role: 'comparator', text: 'Σ' })],
        ['text', 'A note (text only, not simulated)', add({ role: 'label', text: 'Note' })]
      ]);
    }
    copy() {
      const ids = new Set(this.selN);
      if (!ids.size) return false;
      this.clip = {
        nodes: this.D.nodes.filter((n) => ids.has(n.id)).map((n) => JSON.parse(JSON.stringify(n))),
        edges: this.D.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => JSON.parse(JSON.stringify(e)))
      };
      return true;
    }
    paste() {
      if (!this.clip || !this.clip.nodes.length) return;
      this._snap();
      const map = {};
      this.selN.clear();
      this.selE.clear();
      for (const n of this.clip.nodes) {
        const c = Object.assign({}, n, { id: this._newId('n'), x: n.x + 30, y: n.y + 30 });
        map[n.id] = c.id;
        this.D.nodes.push(c);
        this.selN.add(c.id);
      }
      for (const e of this.clip.edges) {
        const c = Object.assign({}, e, { id: this._newId('e'), from: map[e.from], to: map[e.to] });
        this.D.edges.push(c);
      }
      // (the next paste goes further along)
      this.clip.nodes.forEach((n) => ((n.x += 30), (n.y += 30)));
      this._changed();
    }

    /* ================= drawing ================= */
    _viewCentre() {
      const W = this.canvas.clientWidth || 600, H = this.canvas.clientHeight || 400;
      return { x: (W / 2 - this.view.tx) / this.view.k, y: (H / 2 - this.view.ty) / this.view.k };
    }
    _applyView() {
      const { tx, ty, k } = this.view;
      this.world.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k.toFixed(4)})`);
      this.gridPat.setAttribute('patternTransform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k.toFixed(4)})`);
      this.zoomLbl.textContent = Math.round(k * 100) + '%';
    }
    _bbox(withVals) {
      if (!this.D.nodes.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of this.D.nodes) {
        x0 = Math.min(x0, n.x - n.w / 2);
        y0 = Math.min(y0, n.y - n.h / 2);
        x1 = Math.max(x1, n.x + n.w / 2);
        y1 = Math.max(y1, n.y + n.h / 2 + (withVals ? 18 : 0));
      }
      for (const e of this.D.edges) {
        const A = this.node(e.from), B = this.node(e.to);
        if (!A || !B || !e.bend) continue;
        const g = edgeGeom(A, B, e.bend);
        x0 = Math.min(x0, g.mid.x - 10);
        x1 = Math.max(x1, g.mid.x + 10);
        y0 = Math.min(y0, g.mid.y - 10);
        y1 = Math.max(y1, g.mid.y + 10);
      }
      return { x0, y0, x1, y1 };
    }
    fit() {
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      if (!W || !H) return;
      const b = this._bbox(true);
      if (!b) {
        this.view = { tx: 40, ty: 40, k: 1 };
        this._applyView();
        return;
      }
      const m = 40, top = this.keyShown && this.legend.offsetHeight ? this.legend.offsetHeight + 18 : m, bottom = 46;
      const k = clamp(Math.min((W - 2 * m) / Math.max(1, b.x1 - b.x0), (H - top - bottom) / Math.max(1, b.y1 - b.y0)), 0.2, 1.3);
      this.view = { k, tx: (W - (b.x1 - b.x0) * k) / 2 - b.x0 * k, ty: top + (H - top - bottom - (b.y1 - b.y0) * k) / 2 - b.y0 * k };
      this._applyView();
      this._fitted = true;
      this._autoFit = true;
    }
    zoomBy(f, cx, cy) {
      this._autoFit = false;
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      if (cx == null) (cx = W / 2), (cy = H / 2);
      const k = clamp(this.view.k * f, 0.15, 4);
      const wx = (cx - this.view.tx) / this.view.k, wy = (cy - this.view.ty) / this.view.k;
      this.view = { k, tx: cx - wx * k, ty: cy - wy * k };
      this._applyView();
    }
    zoomTo(k) {
      this.zoomBy(k / this.view.k);
    }
    render() {
      if (!this.D) return;
      this._applyView();
      this.gEdges.textContent = '';
      this.gNodes.textContent = '';
      const showVals = this.result && !this.result.stale && this.tCursor != null;
      for (const e of this.D.edges) this.gEdges.appendChild(this._edgeEl(e));
      for (const n of this.D.nodes) this.gNodes.appendChild(this._nodeEl(n, showVals));
      this._overlay();
    }
    _nodeEl(n, showVals) {
      const c = COLORS[n.color] || COLORS.blue;
      const W = n.w, H = n.h;
      const sel = this.selN.has(n.id);
      const g = S('g', { class: 'fl-node' + (sel ? ' sel' : '') + (n.knocked ? ' knocked' : ''), 'data-node': n.id, transform: `translate(${n.x},${n.y})` });
      const st = { fill: c.fill, stroke: c.stroke, 'stroke-width': 1.6 };
      let shape;
      if (n.shape === 'rect') shape = S('rect', Object.assign({ x: -W / 2, y: -H / 2, width: W, height: H, rx: 2 }, st));
      else if (n.shape === 'ellipse' || n.shape === 'circle') shape = S('ellipse', Object.assign({ cx: 0, cy: 0, rx: W / 2, ry: H / 2 }, st));
      else if (n.shape === 'flag') {
        const a = Math.min(16, W / 4);
        shape = S('polygon', Object.assign({ points: `${-W / 2},${-H / 2} ${W / 2 - a},${-H / 2} ${W / 2},0 ${W / 2 - a},${H / 2} ${-W / 2},${H / 2}` }, st));
      } else if (n.shape === 'label') shape = S('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 4, fill: 'transparent', stroke: 'none', class: 'fl-labelbox' });
      else shape = S('rect', Object.assign({ x: -W / 2, y: -H / 2, width: W, height: H, rx: Math.min(14, H / 2) }, st));
      g.appendChild(shape);
      // its level while (and after) the simulation runs: a bar, and the value under the box
      const res = this.result;
      let dev = null, level = null;
      if (showVals && n.role !== 'label' && res.series[n.id]) {
        level = this._valueAt(n.id, this.tCursor);
        const r0 = n.role === 'quantity' || n.role === 'setpoint' ? n.rest : 0;
        dev = level - r0;
        const span = this._spans[n.id] || 1;
        if (n.role === 'quantity' && n.shape !== 'label') {
          const bw = Math.max(10, W - 22), y = H / 2 - 7;
          const f = clamp(dev / span, -1, 1);
          g.appendChild(S('rect', { x: -bw / 2, y, width: bw, height: 3.5, rx: 1.75, fill: '#ffffff', stroke: '#c9d1dc', 'stroke-width': 0.6, opacity: 0.95 }));
          if (Math.abs(f) > 0.002) g.appendChild(S('rect', { x: f > 0 ? 0 : (f * bw) / 2, y, width: (Math.abs(f) * bw) / 2, height: 3.5, rx: 1.75, fill: f > 0 ? '#e0662a' : '#2c7fd0' }));
          g.appendChild(S('rect', { x: -0.6, y: y - 1.5, width: 1.2, height: 6.5, fill: '#6b7686' }));
        }
      }
      // the text
      const big = n.shape === 'circle' && oneLine(n.text).length <= 2;
      const size = big ? 20 : 13;
      const lines = wrap(n.text, Math.max(16, W - (n.shape === 'flag' ? 26 : n.shape === 'ellipse' ? 26 : 14)), size, 600);
      const lh = size + 2;
      const shift = level != null && n.role === 'quantity' && n.shape !== 'label' ? -3 : 0;
      const y0 = -((lines.length - 1) * lh) / 2 + size * 0.35 + shift;
      const tx = n.shape === 'flag' ? -Math.min(16, W / 4) / 2 : 0;
      const text = S('text', { 'text-anchor': 'middle', 'font-size': size, 'font-weight': big ? 500 : 600, fill: c.ink, 'font-family': FONT });
      lines.forEach((ln, i) => text.appendChild(S('tspan', { x: tx, y: (y0 + i * lh).toFixed(1) }, ln)));
      g.appendChild(text);
      if (level != null) {
        const u = n.role === 'stimulus' || n.role === 'comparator' ? (n.unit && n.role === 'stimulus' ? ' ' + n.unit : '') : n.unit ? ' ' + n.unit : '';
        const sign = n.role === 'stimulus' || n.role === 'comparator' ? (level > 0 ? '+' : '') : '';
        g.appendChild(S('text', { class: 'fl-val', 'text-anchor': 'middle', y: H / 2 + 16, 'font-size': 11.5, 'font-weight': 650, fill: dev > 1e-9 ? '#b8480b' : dev < -1e-9 ? '#1d5fa3' : '#4a5566', stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': FONT }, minus(sign + fmt(level)) + u));
      }
      // knocked out, or fixed
      if (n.knocked) {
        g.appendChild(S('path', { d: `M${-W / 2 + 6},${-H / 2 + 6}L${W / 2 - 6},${H / 2 - 6}M${W / 2 - 6},${-H / 2 + 6}L${-W / 2 + 6},${H / 2 - 6}`, stroke: '#9b2b22', 'stroke-width': 2, opacity: 0.55 }));
        g.appendChild(this._tag(W, H, 'knocked out', '#9b2b22'));
      } else if (n.fixed != null) g.appendChild(this._tag(W, H, 'fixed at ' + minus(fmt(n.fixed)), '#5b3a8c'));
      // the dots to draw an arrow from, and the corner to resize by
      const ui = S('g', { class: 'fl-ui fl-handles' });
      for (const [px, py, side] of [[0, -H / 2, 'n'], [W / 2, 0, 'e'], [0, H / 2, 's'], [-W / 2, 0, 'w']]) ui.appendChild(S('circle', { class: 'fl-conn', 'data-handle': 'conn', 'data-id': n.id, 'data-side': side, cx: px, cy: py, r: 5.5 }));
      g.appendChild(ui);
      return g;
    }
    _tag(W, H, text, color) {
      const tw = textWidth(text, 10.5, 650) + 10;
      return S('g', { transform: `translate(${W / 2 - tw / 2 - 2},${-H / 2 - 9})` },
        S('rect', { x: -tw / 2, y: -8, width: tw, height: 15, rx: 7.5, fill: color }),
        S('text', { 'text-anchor': 'middle', y: 3.5, 'font-size': 10.5, 'font-weight': 650, fill: '#ffffff', 'font-family': FONT }, text));
    }
    _edgeEl(e) {
      const A = this.node(e.from), B = this.node(e.to);
      const g = S('g', { class: 'fl-edge' + (this.selE.has(e.id) ? ' sel' : ''), 'data-edge': e.id });
      if (!A || !B) return g;
      const G = edgeGeom(A, B, e.bend);
      const col = e.blocked ? '#9aa4b2' : SIGNS[e.sign].color;
      const head = e.sign === '-' ? 2.5 : 10;
      const end = { x: G.p2.x - G.tx * head, y: G.p2.y - G.ty * head };
      const d = G.straight ? `M${G.p0.x.toFixed(1)},${G.p0.y.toFixed(1)}L${end.x.toFixed(1)},${end.y.toFixed(1)}` : `M${G.p0.x.toFixed(1)},${G.p0.y.toFixed(1)}Q${G.c.x.toFixed(1)},${G.c.y.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
      g.appendChild(S('path', { class: 'fl-hit', d, stroke: 'transparent', 'stroke-width': 14, fill: 'none' }));
      g.appendChild(S('path', { class: 'fl-line', d, stroke: col, 'stroke-width': 2.2, fill: 'none', 'stroke-dasharray': e.blocked ? '3 5' : e.dashed ? '8 5' : null, 'stroke-linecap': 'round' }));
      const nx = -G.ty, ny = G.tx;
      if (e.sign === '-') g.appendChild(S('path', { d: `M${G.p2.x + nx * 8},${G.p2.y + ny * 8}L${G.p2.x - nx * 8},${G.p2.y - ny * 8}`, stroke: col, 'stroke-width': 3.4, 'stroke-linecap': 'round' }));
      else {
        const bx = G.p2.x - G.tx * 12, by = G.p2.y - G.ty * 12;
        g.appendChild(S('path', { d: `M${G.p2.x},${G.p2.y}L${bx + nx * 5.5},${by + ny * 5.5}L${bx - nx * 5.5},${by - ny * 5.5}Z`, fill: col }));
      }
      // + or − on the arrow (so that the sign does not rest on colour alone)
      if (e.sign !== '0') {
        const bp = qpt(G.p0, G.c, G.p2, 0.72);
        g.appendChild(S('circle', { cx: bp.x, cy: bp.y, r: 7.5, fill: '#ffffff', stroke: col, 'stroke-width': 1.6 }));
        g.appendChild(S('text', { x: bp.x, y: bp.y + 4.3, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: col, 'font-family': FONT }, e.sign === '-' ? '−' : '+'));
      }
      const lab = [e.label, e.gain !== 1 ? '×' + fmt(e.gain) : '', e.delay ? 'delay ' + fmt(e.delay) : ''].filter(Boolean).join(' · ');
      if (lab) {
        const side = e.bend > 0 ? 1 : -1;
        const lp = { x: G.mid.x + G.px * 13 * side, y: G.mid.y + G.py * 13 * side };
        g.appendChild(S('text', { x: lp.x, y: lp.y + 4, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 600, fill: '#384355', stroke: '#ffffff', 'stroke-width': 3.5, 'paint-order': 'stroke', 'font-family': FONT }, lab));
      }
      if (e.blocked) {
        const m = G.mid;
        g.appendChild(S('circle', { cx: m.x, cy: m.y, r: 8, fill: '#ffffff', stroke: '#9b2b22', 'stroke-width': 1.6 }));
        g.appendChild(S('path', { d: `M${m.x - 4},${m.y - 4}L${m.x + 4},${m.y + 4}M${m.x + 4},${m.y - 4}L${m.x - 4},${m.y + 4}`, stroke: '#9b2b22', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      }
      return g;
    }
    _overlay() {
      const o = this.gOver;
      o.textContent = '';
      for (const id of this.selN) {
        const n = this.node(id);
        if (!n) continue;
        o.appendChild(S('rect', { class: 'fl-selbox', x: n.x - n.w / 2 - 5, y: n.y - n.h / 2 - 5, width: n.w + 10, height: n.h + 10, rx: 6 }));
        if (this.selN.size === 1) o.appendChild(S('rect', { class: 'fl-resize', 'data-handle': 'resize', 'data-id': n.id, x: n.x + n.w / 2 - 1, y: n.y + n.h / 2 - 1, width: 10, height: 10, rx: 2 }));
      }
      for (const id of this.selE) {
        const e = this.edge(id);
        const A = e && this.node(e.from), B = e && this.node(e.to);
        if (!A || !B) continue;
        const G = edgeGeom(A, B, e.bend);
        o.appendChild(S('circle', { class: 'fl-bend', 'data-handle': 'bend', 'data-id': e.id, cx: G.mid.x, cy: G.mid.y, r: 6.5 }));
      }
      if (this.drag && this.drag.kind === 'connect' && this.drag.cur) {
        const A = this.node(this.drag.from);
        if (A) {
          const p = border(A, this.drag.cur.x, this.drag.cur.y, 2);
          o.appendChild(S('path', { class: 'fl-temp', d: `M${p.x},${p.y}L${this.drag.cur.x},${this.drag.cur.y}`, stroke: SIGNS[this.newSign].color }));
        }
      }
      if (this.drag && this.drag.kind === 'box' && this.drag.cur) {
        const d = this.drag;
        o.appendChild(S('rect', { class: 'fl-boxsel', x: Math.min(d.x0, d.cur.x), y: Math.min(d.y0, d.cur.y), width: Math.abs(d.cur.x - d.x0), height: Math.abs(d.cur.y - d.y0) }));
      }
    }

    /* ================= the mouse, fingers and keyboard ================= */
    _world(e) {
      const r = this.svg.getBoundingClientRect();
      return { x: (e.clientX - r.left - this.view.tx) / this.view.k, y: (e.clientY - r.top - this.view.ty) / this.view.k, sx: e.clientX - r.left, sy: e.clientY - r.top };
    }
    _down(e) {
      if (e.button === 2) return;
      this._endEdit(true);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.svg.setPointerCapture(e.pointerId);
      } catch (err) {
        /* (a pointer that cannot be captured) */
      }
      if (this.pointers.size === 2) {
        // two fingers: pinch to zoom, move to pan
        const [a, b] = [...this.pointers.values()];
        this.drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), k0: this.view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: this.view.tx, ty: this.view.ty };
        clearTimeout(this._press);
        return;
      }
      if (this.pointers.size > 2) return;
      this.svg.focus({ preventScroll: true });
      const W = this._world(e);
      const t = e.target;
      const hd = t.closest && t.closest('[data-handle]');
      const ne = t.closest && t.closest('[data-node]');
      const ee = t.closest && t.closest('[data-edge]');
      this._downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
      if (hd) {
        const id = hd.dataset.id, kind = hd.dataset.handle;
        if (kind === 'conn') this.drag = { kind: 'connect', from: id, cur: null };
        else if (kind === 'resize') {
          const n = this.node(id);
          this.drag = { kind: 'resize', id, w0: n.w, h0: n.h, x0: W.x, y0: W.y, snapped: false };
        } else if (kind === 'bend') this.drag = { kind: 'bend', id, snapped: false };
        e.preventDefault();
        return;
      }
      if (ne) {
        const id = ne.dataset.node;
        const multi = e.shiftKey || e.ctrlKey || e.metaKey;
        if (multi) {
          if (this.selN.has(id)) this.selN.delete(id);
          else this.selN.add(id);
        } else if (!this.selN.has(id)) {
          this.selN.clear();
          this.selE.clear();
          this.selN.add(id);
        }
        const ids = [...this.selN].filter((x) => this.node(x));
        this.drag = { kind: 'move', ids, starts: ids.map((x) => ({ x: this.node(x).x, y: this.node(x).y })), x0: W.x, y0: W.y, moved: false, id, multi };
        this._selChanged();
        this._longPress(e, () => this._menuFor({ node: id }, e.clientX, e.clientY));
        return;
      }
      if (ee) {
        const id = ee.dataset.edge;
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (this.selE.has(id)) this.selE.delete(id);
          else this.selE.add(id);
        } else {
          this.selN.clear();
          this.selE.clear();
          this.selE.add(id);
        }
        this.drag = { kind: 'bend', id, snapped: false, moved: false, x0: W.x, y0: W.y };
        this._selChanged();
        this._longPress(e, () => this._menuFor({ edge: id }, e.clientX, e.clientY));
        return;
      }
      if (e.shiftKey || this.boxMode) this.drag = { kind: 'box', x0: W.x, y0: W.y, cur: null, add: e.shiftKey };
      else this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false };
    }
    _longPress(e, fn) {
      clearTimeout(this._press);
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      this._press = setTimeout(() => {
        if (this.drag && !this.drag.moved) {
          this.drag = null;
          fn();
        }
      }, 550);
    }
    _move(e) {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      if (!d) return;
      if (d.kind === 'pinch') {
        const [a, b] = [...this.pointers.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const r = this.svg.getBoundingClientRect();
        const k = clamp((d.k0 * dist) / Math.max(1, d.d0), 0.15, 4);
        const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        const wx = (d.cx - r.left - d.tx) / d.k0, wy = (d.cy - r.top - d.ty) / d.k0;
        this.view = { k, tx: cx - wx * k, ty: cy - wy * k };
        this._autoFit = false;
        this._applyView();
        return;
      }
      const far = this._downAt && Math.hypot(e.clientX - this._downAt.x, e.clientY - this._downAt.y) > 3;
      if (far) clearTimeout(this._press);
      const W = this._world(e);
      if (d.kind === 'pan') {
        if (!far && !d.moved) return;
        d.moved = true;
        this._autoFit = false;
        this.view.tx = d.tx + e.clientX - d.sx;
        this.view.ty = d.ty + e.clientY - d.sy;
        this._applyView();
        this.svg.classList.add('panning');
      } else if (d.kind === 'move') {
        if (!far && !d.moved) return;
        if (!d.moved) this._snap();
        d.moved = true;
        const dx = W.x - d.x0, dy = W.y - d.y0;
        d.ids.forEach((id, i) => {
          const n = this.node(id);
          if (!n) return;
          n.x = d.starts[i].x + dx;
          n.y = d.starts[i].y + dy;
          if (this.snap && !e.altKey) {
            n.x = snapTo(n.x, GRID);
            n.y = snapTo(n.y, GRID);
          }
        });
        this.render();
      } else if (d.kind === 'connect') {
        d.cur = { x: W.x, y: W.y };
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const ne = over && over.closest && over.closest('[data-node]');
        this.gNodes.querySelectorAll('.fl-node.target').forEach((x) => x.classList.remove('target'));
        if (ne && ne.dataset.node !== d.from) ne.classList.add('target');
        this._overlay();
      } else if (d.kind === 'resize') {
        const n = this.node(d.id);
        if (!n) return;
        if (!d.snapped) {
          this._snap();
          d.snapped = true;
        }
        let w = Math.max(24, d.w0 + 2 * (W.x - d.x0)), hh = Math.max(20, d.h0 + 2 * (W.y - d.y0));
        if (this.snap && !e.altKey) (w = snapTo(w, GRID)), (hh = snapTo(hh, GRID));
        if (n.shape === 'circle' && !e.shiftKey) w = hh = Math.max(w, hh);
        n.w = w;
        n.h = hh;
        this.render();
      } else if (d.kind === 'bend') {
        const ed = this.edge(d.id);
        const A = ed && this.node(ed.from), B = ed && this.node(ed.to);
        if (!A || !B) return;
        if (!far && !d.moved) return;
        if (!d.snapped) {
          this._snap();
          d.snapped = true;
        }
        d.moved = true;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        let dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        let bend = 2 * ((W.x - mx) * px + (W.y - my) * py);
        if (Math.abs(bend) < 8) bend = 0; // (close to straight: straight)
        ed.bend = bend;
        this.render();
      } else if (d.kind === 'box') {
        d.cur = { x: W.x, y: W.y };
        this._overlay();
      }
    }
    _up(e, cancel) {
      this.pointers.delete(e.pointerId);
      clearTimeout(this._press);
      const d = this.drag;
      this.drag = null;
      this.svg.classList.remove('panning');
      if (!d || cancel) {
        this._overlay();
        return;
      }
      if (d.kind === 'pinch') return;
      const W = this._world(e);
      if (d.kind === 'pan' && !d.moved) {
        if (this.selN.size || this.selE.size) {
          this.selN.clear();
          this.selE.clear();
          this._selChanged();
        }
      } else if (d.kind === 'move') {
        if (d.moved) this._changed({ side: false });
        else if (!d.multi && (this.selN.size > 1 || this.selE.size)) {
          this.selN.clear();
          this.selE.clear();
          this.selN.add(d.id);
          this._selChanged();
        }
      } else if (d.kind === 'connect') {
        this.gNodes.querySelectorAll('.fl-node.target').forEach((x) => x.classList.remove('target'));
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const ne = over && over.closest && over.closest('[data-node]');
        if (ne && ne.dataset.node !== d.from) this.addEdge(d.from, ne.dataset.node);
        else if (!ne && d.cur) {
          const A = this.node(d.from);
          if (A && Math.hypot(d.cur.x - A.x, d.cur.y - A.y) > Math.max(A.w, A.h) / 2 + 30) {
            // (let go on an empty part: a new box there, with the arrow to it)
            this._snap(); // (one step to undo, not two)
            const n = this.addNode({ role: 'quantity', text: 'Quantity', x: d.cur.x, y: d.cur.y }, { snap: false });
            this.addEdge(d.from, n.id, {}, { snap: false });
            setTimeout(() => this.editText(n.id), 30);
          }
        }
        this._overlay();
      } else if (d.kind === 'resize' || d.kind === 'bend') {
        if (d.snapped) this._changed({ side: d.kind === 'resize' ? false : true });
        else this._overlay();
      } else if (d.kind === 'box') {
        if (d.cur) {
          const x0 = Math.min(d.x0, W.x), x1 = Math.max(d.x0, W.x), y0 = Math.min(d.y0, W.y), y1 = Math.max(d.y0, W.y);
          if (!d.add) {
            this.selN.clear();
            this.selE.clear();
          }
          for (const n of this.D.nodes) if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) this.selN.add(n.id);
          for (const ed of this.D.edges) if (this.selN.has(ed.from) && this.selN.has(ed.to)) this.selE.add(ed.id);
        }
        this._selChanged();
      }
    }
    _dbl(e) {
      // (what is under the pointer now: the pointer was captured, so e.target is the drawing itself)
      const t = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      const hd = t.closest && t.closest('[data-handle]');
      if (hd) {
        if (hd.dataset.handle === 'bend') this.editLabel(hd.dataset.id);
        return;
      }
      const ne = t.closest && t.closest('[data-node]');
      const ee = t.closest && t.closest('[data-edge]');
      if (ne) return this.editText(ne.dataset.node);
      if (ee) return this.editLabel(ee.dataset.edge);
      const W = this._world(e);
      const n = this.addNode({ role: 'quantity', text: 'Quantity', x: W.x, y: W.y });
      setTimeout(() => this.editText(n.id), 30);
    }
    _wheel(e) {
      e.preventDefault();
      const r = this.svg.getBoundingClientRect();
      const f = Math.exp(-clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022));
      this.zoomBy(f, e.clientX - r.left, e.clientY - r.top);
    }
    _context(e) {
      e.preventDefault();
      const t = e.target;
      // (the handles of a selected box or arrow belong to it: the bend handle of an arrow, the resize handle of a box)
      const hd = t.closest && t.closest('[data-handle]');
      const ne = t.closest && t.closest('[data-node]');
      const ee = t.closest && t.closest('[data-edge]');
      let nid = ne ? ne.dataset.node : null, eid = !ne && ee ? ee.dataset.edge : null;
      if (hd && hd.dataset.handle === 'bend' && this.edge(hd.dataset.id)) (eid = hd.dataset.id), (nid = null);
      else if (hd && this.node(hd.dataset.id)) (nid = hd.dataset.id), (eid = null);
      if (nid) {
        if (!this.selN.has(nid)) {
          this.selN.clear();
          this.selE.clear();
          this.selN.add(nid);
          this._selChanged();
        }
        this._menuFor({ node: nid }, e.clientX, e.clientY);
      } else if (eid) {
        this.selN.clear();
        this.selE.clear();
        this.selE.add(eid);
        this._selChanged();
        this._menuFor({ edge: eid }, e.clientX, e.clientY);
      } else {
        const W = this._world(e);
        this._menuAt(e.clientX, e.clientY, [
          ['plus', 'Add a box here', () => {
            const n = this.addNode({ role: 'quantity', text: 'Quantity', x: W.x, y: W.y });
            setTimeout(() => this.editText(n.id), 30);
          }],
          ['copy', 'Paste', () => this.paste()],
          ['maximize', 'Fit the diagram to the window', () => this.fit()]
        ]);
      }
    }
    _menuAt(x, y, items) {
      const a = h('span', { style: { position: 'fixed', left: x + 'px', top: y + 'px', width: '1px', height: '1px' }, tabindex: '-1' });
      document.body.appendChild(a);
      MG.popmenu(a, items);
      setTimeout(() => a.remove(), 0);
    }
    _menuFor(o, x, y) {
      if (o.node) {
        const n = this.node(o.node);
        if (!n) return;
        const items = [['pencil', 'Edit the text', () => this.editText(n.id)]];
        if (n.role !== 'label') {
          if (n.knocked || n.fixed != null) items.push(['refresh', 'Put it back to normal', () => this.intervene(n.id, null)]);
          if (!n.knocked) items.push(['x', 'Knock it out (its level falls to zero)', () => this.intervene(n.id, 'knock')]);
          if (n.fixed == null) items.push(['lock', 'Fix it at a level…', () => this.askFix(n.id)]);
        }
        items.push(['copy', 'Duplicate', () => (this.copy(), this.paste())]);
        items.push(['trash', 'Delete', () => this.deleteSelection()]);
        this._menuAt(x, y, items);
      } else if (o.edge) {
        const ed = this.edge(o.edge);
        if (!ed) return;
        const items = [];
        for (const s of ['+', '-', '0']) if (ed.sign !== s) items.push([s === '-' ? 'minus' : s === '+' ? 'plus' : 'arrowR', 'Make it: ' + SIGNS[s].label.toLowerCase(), () => this.setEdge(ed.id, { sign: s })]);
        items.push([ed.blocked ? 'link' : 'x', ed.blocked ? 'Unblock this arrow' : 'Block this arrow (cut the pathway)', () => this.setEdge(ed.id, { blocked: !ed.blocked })]);
        items.push(['pencil', 'Edit the label', () => this.editLabel(ed.id)]);
        if (ed.bend) items.push(['arrowR', 'Make it straight', () => this.setEdge(ed.id, { bend: 0 })]);
        items.push(['trash', 'Delete', () => this.deleteSelection()]);
        this._menuAt(x, y, items);
      }
    }
    _key(e) {
      if (this.editing) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      const low = k.length === 1 ? k.toLowerCase() : k;
      if (mod && low === 'z') {
        e.preventDefault();
        return e.shiftKey ? this.redo() : this.undo();
      }
      if (mod && low === 'y') {
        e.preventDefault();
        return this.redo();
      }
      if (mod && low === 's') {
        e.preventDefault();
        return this.save();
      }
      if (mod && low === 'c') return void (this.copy() && e.preventDefault());
      if (mod && low === 'x') {
        if (this.copy()) {
          e.preventDefault();
          this.deleteSelection();
        }
        return;
      }
      if (mod && low === 'v') {
        e.preventDefault();
        return this.paste();
      }
      if (mod && low === 'a') {
        e.preventDefault();
        this.D.nodes.forEach((n) => this.selN.add(n.id));
        this.D.edges.forEach((ed) => this.selE.add(ed.id));
        return this._selChanged();
      }
      if (mod) return;
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        return this.deleteSelection();
      }
      if (k === 'Escape') {
        this.selN.clear();
        this.selE.clear();
        this.boxMode = false;
        this.boxModeBtn.classList.remove('on');
        return this._selChanged();
      }
      if (k === 'Enter') {
        e.preventDefault();
        if (this.selN.size === 1) return this.editText([...this.selN][0]);
        if (this.selE.size === 1) return this.editLabel([...this.selE][0]);
        return;
      }
      if (k === 'Tab') {
        const ns = this.D.nodes;
        if (!ns.length) return;
        const cur = this.selN.size === 1 ? ns.findIndex((n) => this.selN.has(n.id)) : -1;
        const next = cur + (e.shiftKey ? -1 : 1);
        if (next < 0 || next >= ns.length) return; // (out of the diagram, to the next control)
        e.preventDefault();
        this.selN.clear();
        this.selE.clear();
        this.selN.add(ns[next].id);
        this._selChanged();
        return this._reveal(ns[next]);
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k]) {
        e.preventDefault();
        const [dx, dy] = arrows[k];
        if (this.selN.size) {
          this._snapOnce('nudge');
          const step = e.shiftKey ? 50 : GRID;
          for (const id of this.selN) {
            const n = this.node(id);
            if (n) (n.x += dx * step), (n.y += dy * step);
          }
          this._changed({ side: false, key: 'nudge' });
        } else {
          this._autoFit = false;
          this.view.tx -= dx * 60;
          this.view.ty -= dy * 60;
          this._applyView();
        }
        return;
      }
      if (k === '+' || k === '=') return this.zoomBy(1.25);
      if (k === '-' || k === '_') return this.zoomBy(1 / 1.25);
      if (k === '0') return this.fit();
    }
    _reveal(n) {
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      const sx = n.x * this.view.k + this.view.tx, sy = n.y * this.view.k + this.view.ty;
      if (sx < 40 || sx > W - 40 || sy < 40 || sy > H - 40) {
        this.view.tx += W / 2 - sx;
        this.view.ty += H / 2 - sy;
        this._applyView();
      }
    }
    _selChanged() {
      this._overlay();
      this.gNodes.querySelectorAll('.fl-node').forEach((g) => g.classList.toggle('sel', this.selN.has(g.dataset.node)));
      this.gEdges.querySelectorAll('.fl-edge').forEach((g) => g.classList.toggle('sel', this.selE.has(g.dataset.edge)));
      this.renderSide();
      this._updateButtons();
      const n = this.selN.size === 1 ? this.node([...this.selN][0]) : null;
      const ed = this.selE.size === 1 && !this.selN.size ? this.edge([...this.selE][0]) : null;
      this.hint.textContent = n
        ? `${oneLine(n.text)}: ${ROLES.find((r) => r[0] === n.role)[1].toLowerCase()}. Double-click (or Enter) to edit the text; drag from a dot on its edge to draw an arrow.`
        : ed
          ? `An arrow that ${ed.sign === '-' ? 'inhibits' : ed.sign === '+' ? 'stimulates' : 'leads on'}: drag it to curve it; double-click to label it.`
          : this.selN.size + this.selE.size > 1
            ? `${this.selN.size} boxes and ${this.selE.size} arrows selected.`
            : '';
    }

    /* ================= editing text in place ================= */
    editText(id) {
      const n = this.node(id);
      if (!n) return;
      this._startEdit({ node: id }, n.text, n.x, n.y, Math.max(n.w, 110), Math.max(n.h, 44));
    }
    editLabel(id) {
      const ed = this.edge(id);
      const A = ed && this.node(ed.from), B = ed && this.node(ed.to);
      if (!A || !B) return;
      const G = edgeGeom(A, B, ed.bend);
      this._startEdit({ edge: id }, ed.label, G.mid.x, G.mid.y, 140, 34);
    }
    _startEdit(what, text, x, y, w, hh) {
      this._endEdit(true);
      const k = this.view.k;
      const W = w * Math.max(0.8, Math.min(k, 1.6)), H = hh * Math.max(0.8, Math.min(k, 1.6));
      const sx = x * k + this.view.tx, sy = y * k + this.view.ty;
      const ed = this.editor;
      Object.assign(ed.style, { left: sx - W / 2 + 'px', top: sy - H / 2 + 'px', width: W + 'px', height: H + 'px', fontSize: clamp(13 * k, 12, 20) + 'px' });
      ed.value = text;
      ed.placeholder = what.edge ? 'A label (optional)' : 'The text of the box';
      ed.hidden = false;
      this.editing = what;
      ed.focus();
      ed.select();
      // (once more, in case the click that started it takes the focus back)
      setTimeout(() => {
        if (this.editing === what && document.activeElement !== ed) {
          ed.focus();
          ed.select();
        }
      }, 0);
    }
    _endEdit(commit) {
      const what = this.editing;
      if (!what) return;
      this.editing = null;
      const val = this.editor.value.replace(/\s+$/, '');
      this.editor.hidden = true;
      if (commit) {
        if (what.node) {
          const n = this.node(what.node);
          if (n && val !== n.text && val.trim()) {
            this._snap();
            n.text = val;
            const lines = wrap(n.text, Math.max(16, n.w - 14), 13, 600).length;
            if (n.shape !== 'circle' && lines * 15 + 16 > n.h) n.h = snapTo(lines * 15 + 18, GRID);
            this._changed();
          }
        } else if (what.edge) {
          const ed = this.edge(what.edge);
          if (ed && val !== ed.label) {
            this._snap();
            ed.label = val.trim();
            this._changed();
          }
        }
      }
      this.svg.focus({ preventScroll: true });
    }

    /* ================= the inspector ================= */
    setNode(id, o, key) {
      const n = this.node(id);
      if (!n) return;
      if (key) this._snapOnce(key + id);
      else this._snap();
      if (o.role && o.role !== n.role) {
        // (a new role: the look that goes with it, unless the box has been given another)
        if (n.shape === ROLE_SHAPE[n.role]) o.shape = ROLE_SHAPE[o.role];
        if (n.color === ROLE_COLOR[n.role]) o.color = ROLE_COLOR[o.role];
        if (n.text === ROLE_TEXT[n.role]) o.text = ROLE_TEXT[o.role];
        if (o.role === 'comparator' && n.role !== 'comparator') (o.w = 56), (o.h = 56);
        if (n.role === 'comparator' && o.role !== 'comparator' && n.w < 100) (o.w = 150), (o.h = 56);
        if (o.role === 'quantity' && n.role !== 'quantity' && n.rest === 0) o.rest = 1;
        o.plot = o.role === 'quantity' || o.role === 'stimulus';
      }
      Object.assign(n, o);
      this._changed({ side: !key, key: key ? key + id : null });
    }
    setEdge(id, o, key) {
      const ed = this.edge(id);
      if (!ed) return;
      if (key) this._snapOnce(key + id);
      else this._snap();
      Object.assign(ed, o);
      this._changed({ side: !key, key: key ? key + id : null });
    }
    intervene(id, what, level) {
      const n = this.node(id);
      if (!n) return;
      this._snap();
      delete n.knocked;
      delete n.fixed;
      if (what === 'knock') n.knocked = true;
      if (what === 'fix') n.fixed = level;
      this._changed();
    }
    askFix(id) {
      const n = this.node(id);
      if (!n) return;
      const def = n.role === 'quantity' ? fmt(n.rest * 2) : '1';
      MG.promptText('Fix it at a level', `From the time the changes start, ${oneLine(n.text)} stays at this level, whatever its inputs say${n.unit ? ' (in ' + n.unit + ')' : ''}:`, def, 'Fix it').then((v) => {
        if (v === '' || !Number.isFinite(+v)) return;
        this.intervene(id, 'fix', +v);
      });
    }
    renderSide() {
      if (!this.D) return;
      const B = this.sideBody;
      // (a field being typed in keeps its place)
      const active = document.activeElement && B.contains(document.activeElement) ? document.activeElement.dataset.f : null;
      B.textContent = '';
      const nodes = [...this.selN].map((id) => this.node(id)).filter(Boolean);
      const edges = [...this.selE].map((id) => this.edge(id)).filter(Boolean);
      let title;
      if (nodes.length === 1 && !edges.length) title = this._sideNode(nodes[0]);
      else if (edges.length === 1 && !nodes.length) title = this._sideEdge(edges[0]);
      else if (nodes.length + edges.length > 1) title = this._sideMany(nodes, edges);
      else title = this._sideDiagram();
      this.sideHead.innerHTML = `<span>${esc(title)}</span>${MG.icon('chevD')}`;
      if (active) {
        const el = B.querySelector(`[data-f="${active}"]`);
        if (el) el.focus();
      }
    }
    _field(label, input, hint, f) {
      if (f) input.dataset.f = f;
      return h('label.fl-f', h('span.fl-fl', label), input, hint ? h('small.fl-hintf', { html: hint }) : null);
    }
    _numIn(val, fn, opts = {}) {
      const i = h('input.fl-in', { type: 'number', step: opts.step || 'any', value: String(val), min: opts.min != null ? String(opts.min) : null });
      i.addEventListener('input', () => {
        const v = parseFloat(i.value);
        if (!Number.isFinite(v)) return;
        if (opts.min != null && v < opts.min) return;
        fn(v);
      });
      return i;
    }
    _textIn(val, fn, ph) {
      const i = h('input.fl-in', { type: 'text', value: val, placeholder: ph || '' });
      i.addEventListener('input', () => fn(i.value));
      return i;
    }
    _select(val, options, fn) {
      const s = h('select.fl-in', options.map(([v, l]) => h('option', { value: v }, l)));
      s.value = val;
      s.addEventListener('change', () => fn(s.value));
      return s;
    }
    _swatches(val, fn) {
      const box = h('div.fl-sw', { role: 'radiogroup', 'aria-label': 'Colour' });
      for (const [k, c] of Object.entries(COLORS)) {
        const b = h('button.fl-swb' + (k === val ? '.on' : ''), { type: 'button', title: c.label, 'aria-label': c.label, role: 'radio', 'aria-checked': k === val ? 'true' : 'false', style: { background: c.fill, borderColor: c.stroke } });
        b.addEventListener('click', () => fn(k));
        box.appendChild(b);
      }
      return box;
    }
    _sideNode(n) {
      const B = this.sideBody;
      const id = n.id;
      const ta = h('textarea.fl-in.fl-ta', { rows: 2 });
      ta.value = n.text;
      ta.dataset.f = 'text';
      ta.addEventListener('input', () => this.setNode(id, { text: ta.value }, 'text'));
      B.append(this._field('Text', ta));
      B.append(this._field('What it is in the simulation', this._select(n.role, ROLES, (v) => this.setNode(id, { role: v })), null, 'role'));
      const tu = this.D.sim.timeUnit;
      if (n.role === 'quantity') {
        B.append(h('div.fl-row2',
          this._field('Resting level', this._numIn(n.rest, (v) => this.setNode(id, { rest: v }, 'rest')), null, 'rest'),
          this._field('Unit', this._textIn(n.unit, (v) => this.setNode(id, { unit: v }, 'unit'), 'e.g. °C'), null, 'unit')));
        B.append(this._field(`Response time (${tu})`, this._numIn(n.tau, (v) => this.setNode(id, { tau: Math.max(1e-6, v) }, 'tau'), { min: 0 }), 'How quickly it follows its inputs: about two thirds of a change happens in one response time.', 'tau'));
      } else if (n.role === 'stimulus') {
        B.append(this._field('Kind', this._select(n.kind, KINDS, (v) => this.setNode(id, { kind: v })), null, 'kind'));
        B.append(h('div.fl-row2',
          this._field(`Starts at (${tu})`, this._numIn(n.start, (v) => this.setNode(id, { start: v }, 'start')), null, 'start'),
          this._field('Size', this._numIn(n.size, (v) => this.setNode(id, { size: v }, 'size')), null, 'size')));
        if (n.kind === 'pulse' || n.kind === 'ramp') B.append(this._field(n.kind === 'pulse' ? `Lasts (${tu})` : `Takes (${tu}) to rise`, this._numIn(n.length, (v) => this.setNode(id, { length: Math.max(1e-6, v) }, 'length'), { min: 0 }), null, 'length'));
        if (n.kind === 'wave') B.append(this._field(`Period (${tu})`, this._numIn(n.period, (v) => this.setNode(id, { period: Math.max(1e-6, v) }, 'period'), { min: 0 }), 'The time from one peak to the next.', 'period'));
        B.append(h('p.fl-note', 'The size is how hard it pushes: through an arrow of strength 1, a quantity ends up changed by this much (unless something resists the change).'));
      } else if (n.role === 'setpoint') {
        B.append(h('div.fl-row2',
          this._field('Level', this._numIn(n.rest, (v) => this.setNode(id, { rest: v }, 'rest')), null, 'rest'),
          this._field('Unit', this._textIn(n.unit, (v) => this.setNode(id, { unit: v }, 'unit'), 'e.g. °C'), null, 'unit')));
        B.append(h('div.fl-row2',
          this._field(`Changes at (${tu})`, this._numIn(n.stepAt, (v) => this.setNode(id, { stepAt: v }, 'stepAt')), null, 'stepAt'),
          this._field('by', this._numIn(n.step, (v) => this.setNode(id, { step: v }, 'step')), null, 'step')));
        B.append(h('p.fl-note', 'A set point is the level a comparator (Σ) compares a quantity with. Leave “by” at 0 for a set point that stays where it is.'));
      } else if (n.role === 'comparator') {
        B.append(h('p.fl-note', { html: 'A comparator adds up what its arrows bring: a <b>+</b> arrow adds, a <b>−</b> arrow subtracts. With the set point coming in through a + arrow and the measured quantity through a − arrow, it gives the <b>error signal</b>: how far the quantity is from its set point.' }));
      } else B.append(h('p.fl-note', 'A note is not part of the simulation: use it for labels and explanations. Arrows to and from it are not simulated either.'));
      if (n.role !== 'label' && n.role !== 'comparator') {
        const cb = h('input', { type: 'checkbox', checked: n.plot });
        cb.addEventListener('change', () => this.setNode(id, { plot: cb.checked }));
        B.append(h('label.fl-check', cb, h('span', 'Show it on the graphs')));
      }
      if (n.role !== 'label') {
        const st = n.knocked ? 'knock' : n.fixed != null ? 'fix' : 'normal';
        const box = h('div.fl-intv', h('div.fl-fl', 'What if…'));
        const opt = (v, label) => {
          const r = h('input', { type: 'radio', name: 'flintv-' + this.uid, value: v, checked: st === v });
          r.addEventListener('change', () => {
            if (v === 'normal') this.intervene(id, null);
            else if (v === 'knock') this.intervene(id, 'knock');
            else this.intervene(id, 'fix', n.fixed != null ? n.fixed : n.role === 'quantity' ? n.rest * 2 : 1);
          });
          return h('label.fl-check', r, h('span', label));
        };
        box.append(opt('normal', 'It works normally'), opt('knock', 'Knocked out: its level falls to zero'), opt('fix', 'Fixed: it ignores its inputs'));
        if (n.fixed != null) box.append(this._field('Fixed at', this._numIn(n.fixed, (v) => this.setNode(id, { fixed: v }, 'fixed')), null, 'fixed'));
        box.append(h('small.fl-hintf', `Changes like these start at ${fmt(changeTime(this.D))} ${tu} (see the settings of the diagram: click an empty part).`));
        B.append(box);
      }
      B.append(h('div.fl-fl.fl-gap', 'Look'));
      B.append(this._field('Shape', this._select(n.shape, SHAPES, (v) => {
        const o = { shape: v };
        if (v === 'circle') (o.w = Math.max(48, Math.min(n.w, n.h))), (o.h = o.w);
        this.setNode(id, o);
      }), null, 'shape'));
      B.append(h('div.fl-f', h('span.fl-fl', 'Colour'), this._swatches(n.color, (v) => this.setNode(id, { color: v }))));
      const del = h('button.btn.small', { type: 'button', html: MG.icon('trash') + '<span>Delete the box</span>' });
      del.addEventListener('click', () => this.deleteSelection());
      B.append(h('div.fl-actions', del));
      return oneLine(n.text) || 'Box';
    }
    _sideEdge(ed) {
      const B = this.sideBody;
      const id = ed.id;
      const A = this.node(ed.from), Bn = this.node(ed.to);
      B.append(h('p.fl-note', { html: `From <b>${esc(oneLine(A.text))}</b> to <b>${esc(oneLine(Bn.text))}</b>.` }));
      const kinds = h('div.fl-seg.fl-seg-wide', { role: 'radiogroup', 'aria-label': 'What the arrow does' });
      for (const s of ['+', '-', '0']) {
        const b = h('button.fl-sign' + (ed.sign === s ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': ed.sign === s ? 'true' : 'false', html: ic(s === '+' ? 'plusArrow' : s === '-' ? 'minusArrow' : 'plainArrow') + `<span>${esc(SIGNS[s].label)}</span>` });
        b.addEventListener('click', () => this.setEdge(id, { sign: s }));
        kinds.appendChild(b);
      }
      B.append(h('div.fl-f', h('span.fl-fl', 'What it does'), kinds));
      const tu = this.D.sim.timeUnit;
      B.append(h('div.fl-row2',
        this._field('Strength', this._numIn(ed.gain, (v) => this.setEdge(id, { gain: Math.max(0, v) }, 'gain'), { min: 0 }), null, 'gain'),
        this._field(`Delay (${tu})`, this._numIn(ed.delay, (v) => this.setEdge(id, { delay: Math.max(0, v) }, 'delay'), { min: 0 }), null, 'delay')));
      B.append(h('small.fl-hintf', 'Strength: with strength 2, a change of 1 in the box it comes from pushes the box it goes to by 2. Delay: how long before a change starts to act.'));
      B.append(this._field('Label (optional)', this._textIn(ed.label, (v) => this.setEdge(id, { label: v }, 'label'), 'e.g. secretes'), null, 'label'));
      const dash = h('input', { type: 'checkbox', checked: ed.dashed });
      dash.addEventListener('change', () => this.setEdge(id, { dashed: dash.checked }));
      B.append(h('label.fl-check', dash, h('span', 'Dashed line (indirect, or feedback)')));
      const blk = h('input', { type: 'checkbox', checked: !!ed.blocked });
      blk.addEventListener('change', () => this.setEdge(id, { blocked: blk.checked || undefined }));
      B.append(h('label.fl-check.fl-blk', blk, h('span', 'Blocked: cut this pathway in the simulation')));
      const rev = h('button.btn.small', { type: 'button', html: MG.icon('refresh') + '<span>Reverse</span>' });
      rev.addEventListener('click', () => {
        if (this.D.edges.some((x) => x.from === ed.to && x.to === ed.from)) return toast('There is an arrow the other way already.', null, 2000);
        this.setEdge(id, { from: ed.to, to: ed.from, bend: -ed.bend });
      });
      const straight = h('button.btn.small', { type: 'button', html: MG.icon('arrowR') + '<span>Straighten</span>', disabled: !ed.bend });
      straight.addEventListener('click', () => this.setEdge(id, { bend: 0 }));
      const del = h('button.btn.small', { type: 'button', html: MG.icon('trash') + '<span>Delete</span>' });
      del.addEventListener('click', () => this.deleteSelection());
      B.append(h('div.fl-actions', rev, straight, del));
      return 'Arrow';
    }
    _sideMany(nodes, edges) {
      const B = this.sideBody;
      B.append(h('p.fl-note', `${nodes.length} box${nodes.length === 1 ? '' : 'es'} and ${edges.length} arrow${edges.length === 1 ? '' : 's'} selected. Drag one of the boxes to move them all.`));
      if (nodes.length) {
        B.append(h('div.fl-f', h('span.fl-fl', 'Colour'), this._swatches(null, (v) => {
          this._snap();
          nodes.forEach((n) => (n.color = v));
          this._changed();
        })));
        const al = (label, fn) => {
          const b = h('button.btn.small', { type: 'button' }, label);
          b.addEventListener('click', () => {
            this._snap();
            fn();
            this._changed();
          });
          return b;
        };
        if (nodes.length > 1) {
          B.append(h('div.fl-f', h('span.fl-fl', 'Line them up'), h('div.fl-actions',
            al('In a row', () => {
              const y = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
              nodes.forEach((n) => (n.y = snapTo(y, GRID)));
            }),
            al('In a column', () => {
              const x = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
              nodes.forEach((n) => (n.x = snapTo(x, GRID)));
            }),
            al('Same size', () => {
              const w = Math.max(...nodes.map((n) => n.w)), hh = Math.max(...nodes.map((n) => n.h));
              nodes.forEach((n) => {
                if (n.shape !== 'circle') (n.w = w), (n.h = hh);
              });
            }))));
        }
      }
      const del = h('button.btn.small', { type: 'button', html: MG.icon('trash') + '<span>Delete them</span>' });
      del.addEventListener('click', () => this.deleteSelection());
      B.append(h('div.fl-actions', del));
      return 'Several things';
    }
    _sideDiagram() {
      const B = this.sideBody;
      const D = this.D;
      const ti = this._textIn(D.title, (v) => {
        this._snapOnce('title');
        D.title = v || 'Untitled diagram';
        this._changed({ side: false, key: 'title' });
      });
      B.append(this._field('Title', ti, null, 'title'));
      const de = h('textarea.fl-in.fl-ta', { rows: 3, placeholder: 'What the diagram shows (optional)' });
      de.value = D.description;
      de.addEventListener('input', () => {
        this._snapOnce('desc');
        D.description = de.value;
        this._changed({ side: false, key: 'desc' });
      });
      B.append(this._field('Description', de, null, 'desc'));
      B.append(h('div.fl-fl.fl-gap', 'Simulation'));
      const cz = h('input', { type: 'checkbox', checked: D.sim.clampZero });
      cz.addEventListener('change', () => this.setSim({ clampZero: cz.checked }));
      B.append(h('label.fl-check', cz, h('span', 'Levels cannot fall below zero')));
      B.append(this._field(`Changes start at (${D.sim.timeUnit})`, this._numIn(changeTime(D), (v) => {
        this._snapOnce('changeAt');
        D.sim.changeAt = Math.max(0, v);
        this._changed({ side: false, key: 'changeAt' });
      }, { min: 0 }), 'When knock-outs, fixed levels and blocked arrows take effect, so that the graphs show the normal state first.', 'changeAt'));
      B.append(h('div.fl-fl.fl-gap', 'How to'));
      B.append(h('ul.fl-tips',
        h('li', { html: '<b>Add a box:</b> double-click an empty part, or use <b>Box</b>.' }),
        h('li', { html: '<b>Draw an arrow:</b> drag from one of the dots on the edge of a box to another box. The buttons <b>+ − →</b> choose its kind.' }),
        h('li', { html: '<b>Curve an arrow:</b> drag it sideways (feedback loops can go round the outside).' }),
        h('li', { html: '<b>Edit text:</b> double-click a box or an arrow.' }),
        h('li', { html: '<b>What if…:</b> right-click (or press and hold) a box to knock it out or fix it, or an arrow to block it.' }),
        h('li', { html: '<b>Run</b> the diagram to see how its quantities change over time.' })));
      return 'Diagram';
    }

    /* ================= the simulation, shown ================= */
    run() {
      if (!this.D) return null;
      this._endEdit(true);
      const D = this.D;
      const sim = D.nodes.filter((n) => n.role !== 'label');
      if (!sim.some((n) => n.role === 'quantity')) {
        this.runMsg.textContent = 'There is nothing to simulate yet: the diagram needs at least one box that is a quantity.';
        this.runPanel.classList.remove('closed');
        return null;
      }
      const res = simulate(D);
      res.sig = this._simSig();
      res.plots = this._plotSig();
      this.result = res;
      this._spans = {};
      for (const n of sim) {
        const s = res.series[n.id];
        if (!s) continue;
        const r0 = n.role === 'quantity' || n.role === 'setpoint' ? n.rest : 0;
        let m = 0;
        for (const y of s) m = Math.max(m, Math.abs(y - r0));
        this._spans[n.id] = m || 1;
      }
      this.runPanel.classList.remove('closed');
      store.set('flow:runClosed', false);
      this.csvBtn.disabled = false;
      this.scrub.disabled = false;
      const names = (ids) => ids.map((id) => oneLine((this.node(id) || {}).text)).filter(Boolean);
      bus.emit('flow:run', {
        name: D.title,
        nodes: D.nodes.length,
        edges: D.edges.length,
        duration: res.duration,
        oscillates: res.oscillating.length > 0,
        oscillation: res.oscillating.length ? res.oscillating[0].trend : '',
        runaway: !!res.runaway,
        blocked: res.blocked,
        knocked: res.knocked,
        settled: res.settled,
        oscillating: names(res.oscillating.map((o) => o.id)).join(', ')
      });
      const secs = (SPEEDS.find((s) => s[0] === this.speed) || SPEEDS[1])[2];
      this.stopAnim(false);
      if (!secs) this.setCursor(res.duration);
      else {
        const t0 = performance.now();
        this.stopBtn.hidden = false;
        const step = (now) => {
          const f = Math.min(1, (now - t0) / (secs * 1000));
          this.setCursor(f * res.duration);
          if (f < 1) this._anim = requestAnimationFrame(step);
          else this.stopAnim(false);
        };
        this._anim = requestAnimationFrame(step);
      }
      this.renderRun();
      return res;
    }
    stopAnim(toEnd) {
      if (this._anim) cancelAnimationFrame(this._anim);
      this._anim = null;
      if (this.stopBtn) this.stopBtn.hidden = true;
      if (toEnd && this.result) this.setCursor(this.result.duration);
    }
    _valueAt(id, t) {
      const res = this.result;
      const s = res && res.series[id];
      if (!s) return null;
      const n = res.times.length;
      const p = clamp((t / res.duration) * (n - 1), 0, n - 1);
      const a = Math.floor(p), b = Math.min(n - 1, a + 1);
      return s[a] + (s[b] - s[a]) * (p - a);
    }
    setCursor(t) {
      if (!this.result) return;
      this.tCursor = t;
      this.scrub.value = String(Math.round((t / this.result.duration) * 1000));
      this.tLabel.textContent = `t = ${fmt(t)} ${this.D.sim.timeUnit}`;
      this.render();
      this._drawCursor();
    }
    toggleRun() {
      const closed = !this.runPanel.classList.contains('closed');
      this.runPanel.classList.toggle('closed', closed);
      store.set('flow:runClosed', closed);
      if (!closed) this.renderRun();
    }
    // the graphs or the numbers, where there is room for only one of them ('graphs' | 'numbers')
    setRunView(v) {
      this.runView = v === 'numbers' ? 'numbers' : 'graphs';
      this.runBody.classList.toggle('numbers', this.runView === 'numbers');
      for (const k in this.viewBtns) {
        this.viewBtns[k].classList.toggle('on', k === this.runView);
        this.viewBtns[k].setAttribute('aria-pressed', k === this.runView ? 'true' : 'false');
      }
    }
    _plotted() {
      if (!this.result) return [];
      return this.D.nodes.filter((n) => n.plot && n.role !== 'label' && n.role !== 'comparator' && this.result.series[n.id]);
    }
    renderRun() {
      const res = this.result;
      this.chart.textContent = '';
      this.table.textContent = '';
      if (!res) {
        this.runMsg.textContent = 'Press Run to see how the quantities in the diagram change over time.';
        this.chart.appendChild(h('div.fl-chart-empty', 'The graphs of the quantities will be here.'));
        this.scrub.disabled = true;
        this.tLabel.textContent = '';
        return;
      }
      const D = this.D, tu = D.sim.timeUnit;
      // the message: what happened
      const nm = (id) => oneLine((this.node(id) || { text: '?' }).text);
      const msgs = [];
      if (res.stale) msgs.push('The diagram has changed since this run: press Run again.');
      if (res.runaway) msgs.push(`${nm(res.runaway.id)} ran away: positive feedback kept pushing it further, so at ${fmt(res.runaway.t)} ${tu} the simulation stopped it at ten times its usual size.`);
      if (res.oscillating.length) msgs.push(`${res.oscillating.map((o) => nm(o.id)).join(', ')} went up and down (an oscillation that is ${res.oscillating[0].trend}).`);
      if (!res.runaway && !res.oscillating.length) msgs.push(res.settled ? `Run for ${fmt(res.duration)} ${tu}: everything settled to a steady level.` : `Run for ${fmt(res.duration)} ${tu}: still changing at the end – try running it for longer.`);
      if (res.knocked || res.blocked) msgs.push(`Changes start at ${fmt(res.changeAt)} ${tu}.`);
      if (res.algebraicLoop) msgs.push('(Some comparators feed each other directly; the simulation used their values from a moment before.)');
      this.runMsg.textContent = msgs.join(' ');
      this.runMsg.classList.toggle('warn', !!res.runaway || !!res.stale);
      const nodes = this._plotted();
      // the table: start, lowest, highest, end
      if (nodes.length) {
        const tb = h('table.fl-tab', h('thead', h('tr', h('th', ''), h('th', { title: 'The lowest level during the run' }, 'lowest'), h('th', { title: 'The highest level during the run' }, 'highest'), h('th', { title: 'The level at the end of the run' }, 'at the end'))));
        const body = h('tbody');
        for (const n of nodes) {
          const s = res.series[n.id];
          let lo = Infinity, hi = -Infinity;
          for (const v of s) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
          // (the unit once, under the name: the columns of numbers stay narrow)
          const name = oneLine(n.text);
          const th = h('th', { title: name + (n.unit ? ' (' + n.unit + ')' : '') }, name);
          if (n.unit) th.appendChild(h('small', n.unit));
          body.appendChild(h('tr', th, h('td', minus(fmt(lo))), h('td', minus(fmt(hi))), h('td', minus(fmt(s[s.length - 1])))));
        }
        tb.appendChild(body);
        this.table.appendChild(tb);
      } else this.table.appendChild(h('p.fl-chart-empty', 'Lowest and highest levels will be here.'));
      // the graphs: one row for each quantity, with its own scale
      const W = Math.max(240, this.chart.clientWidth || 600);
      this._chartW = this.chart.clientWidth;
      if (!nodes.length) {
        this.chart.appendChild(h('div.fl-chart-empty', 'Tick “Show it on the graphs” for the boxes you want to see.'));
        return;
      }
      // (each quantity a strip of its own: low strips when there are many, or little room, leave out the unit)
      const rowH = clamp(Math.floor(((this.chart.clientHeight || 180) - 30) / nodes.length), 32, 90);
      const L = W < 420 ? 96 : 118, R = 10, top = 6;
      const H = top + rowH * nodes.length + 24;
      const svg = S('svg', { class: 'fl-graph', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'font-family': FONT, role: 'img', 'aria-label': 'Graphs of the quantities over time' });
      const pw = W - L - R;
      const T = res.duration;
      const X = (t) => L + (t / T) * pw;
      nodes.forEach((n, i) => {
        const s = res.series[n.id];
        const y0 = top + i * rowH, y1 = y0 + rowH - 8;
        let lo = Infinity, hi = -Infinity;
        for (const v of s) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
        const r0 = n.role === 'quantity' || n.role === 'setpoint' ? n.rest : 0;
        lo = Math.min(lo, r0);
        hi = Math.max(hi, r0);
        const flat = hi - lo < 1e-9 * Math.max(1, Math.abs(r0));
        if (flat) {
          const pad = Math.max(1e-3 * Math.abs(r0), 0.5);
          lo -= pad;
          hi += pad;
        } else {
          const pad = (hi - lo) * 0.08;
          lo -= pad;
          hi += pad;
        }
        const Y = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0 - 4);
        const c = COLORS[n.color] || COLORS.blue;
        const col = n.color === 'white' || n.color === 'grey' ? '#3b4656' : c.stroke;
        svg.appendChild(S('rect', { x: L, y: y0, width: pw, height: y1 - y0, fill: i % 2 ? '#fafbfc' : '#ffffff', stroke: '#e0e5ec' }));
        // the scale: round numbers, with faint lines across (labelled inside the graph at its left edge, later)
        let ticks = flat ? [r0] : niceTicks(lo, hi, 3).filter((v) => v >= lo && v <= hi);
        if (ticks.length < 2 && !flat) ticks = niceTicks(lo, hi, 5).filter((v) => v >= lo && v <= hi);
        for (const v of ticks) svg.appendChild(S('line', { x1: L, x2: L + pw, y1: Y(v), y2: Y(v), stroke: '#e6eaf0' }));
        // the resting level
        svg.appendChild(S('line', { x1: L, x2: L + pw, y1: Y(r0), y2: Y(r0), stroke: '#b9c2ce', 'stroke-dasharray': '3 3' }));
        if (res.knocked || res.blocked) svg.appendChild(S('line', { x1: X(res.changeAt), x2: X(res.changeAt), y1: y0, y2: y1, stroke: '#c9a6e6', 'stroke-dasharray': '2 3' }));
        let d = '';
        const n2 = s.length;
        for (let q = 0; q < n2; q++) d += (q ? 'L' : 'M') + X(res.times[q]).toFixed(1) + ',' + Y(s[q]).toFixed(1);
        svg.appendChild(S('path', { d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
        const name = oneLine(n.text);
        const max = Math.floor((L - 12) / 6.6);
        const lab = S('text', { x: 6, y: y0 + 13.5, 'font-size': 11.5, 'font-weight': 650, fill: col }, name.length > max ? name.slice(0, max - 1) + '…' : name);
        lab.appendChild(S('title', {}, name));
        svg.appendChild(lab);
        if (rowH >= 38) svg.appendChild(S('text', { x: 6, y: y0 + 26.5, 'font-size': 10.5, fill: '#647086' }, n.unit ? n.unit : n.role === 'stimulus' ? 'stimulus' : ''));
        // (the numbers of the scale, from the top, leaving out any that would crowd the one above)
        let last = -Infinity;
        for (const v of ticks.slice().sort((a, b) => b - a)) {
          const y = clamp(Y(v) + 3.3, y0 + 9, y1 - 2);
          if (y - last < 12) continue;
          last = y;
          svg.appendChild(S('text', { x: L + 3, y, 'font-size': 9.5, fill: '#647086', stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke' }, minus(fmt(v))));
        }
      });
      // the time axis
      const ya = top + rowH * nodes.length;
      for (const t of niceTicks(0, T, Math.max(3, Math.floor(pw / 70)))) {
        svg.appendChild(S('line', { x1: X(t), x2: X(t), y1: ya - 6, y2: ya - 2, stroke: '#9aa4b2' }));
        svg.appendChild(S('text', { x: X(t), y: ya + 10, 'text-anchor': 'middle', 'font-size': 10, fill: '#647086' }, minus(fmt(t))));
      }
      svg.appendChild(S('text', { x: L + pw, y: ya + 21, 'text-anchor': 'end', 'font-size': 10.5, fill: '#384355' }, `time (${tu})`));
      this.cursorLine = S('line', { class: 'fl-cursor', x1: L, x2: L, y1: top, y2: ya - 6, stroke: '#e0662a', 'stroke-width': 1.5 });
      svg.appendChild(this.cursorLine);
      this._X = X;
      this.chart.appendChild(svg);
      this._drawCursor();
    }
    _drawCursor() {
      if (!this.cursorLine || this.tCursor == null || !this._X) return;
      const x = this._X(this.tCursor);
      this.cursorLine.setAttribute('x1', x);
      this.cursorLine.setAttribute('x2', x);
    }
    // The toolbar keeps to one line: when it would wrap, its labels go a level at a time (the classes f1–f6 in
    // flow.css: a shorter title; Open and Save; New, Box and Export; a shorter title again; the arrow kinds and Run;
    // the separators). On a phone nothing fits on one line, and it wraps onto two with the icons only.
    _fitBar() {
      const bar = this.bar, w = bar.clientWidth;
      if (!w) return;
      const key = w + '|' + this.titleBtn.textContent;
      if (key === this._barKey) return;
      this._barKey = key;
      const mid = (el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };
      const set = (n) => {
        for (let i = 1; i <= 6; i++) bar.classList.toggle('f' + i, i <= n);
      };
      for (let n = 0; n <= 6; n++) {
        set(n);
        if (Math.abs(mid(this.btnHelp) - mid(this.titleBtn)) < 8) return;
      }
      set(5);
    }
    _resized() {
      if (!this.D) return;
      this._fitBar();
      // (until the student moves or zooms the view, it keeps the whole diagram in sight)
      const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
      if (cw && ch && (!this._fitted || (this._autoFit && (cw !== this._cw || ch !== this._ch)))) this.fit();
      this._cw = cw;
      this._ch = ch;
      if (this.result && !this.runPanel.classList.contains('closed')) {
        const w = this.chart.clientWidth;
        if (w && Math.abs(w - (this._chartW || 0)) > 2) this.renderRun();
      }
    }
    shown() {
      this._resized();
    }

    /* ================= pictures and tables ================= */
    exportMenu() {
      const name = slug(this.D.title);
      MG.popmenu(this.btnExport, [
        ['image', 'Picture (PNG) to my files…', () => this.exportPNG(true)],
        ['download', 'Picture (PNG) to my computer', () => this.exportPNG(false)],
        ['image', 'Drawing (SVG) to my files…', () => this.exportSVG(true)],
        ['download', 'Drawing (SVG) to my computer', () => this.exportSVG(false)],
        ['table', 'Results of the last run (CSV) to my files', () => this.exportCSV(true)],
        ['download', 'Results of the last run (CSV) to my computer', () => this.exportCSV(false)],
        ['download', `The diagram itself (${name}.flow.json) to my computer`, () => {
          MG.downloadText(JSON.stringify(toJSON(this.D), null, 1) + '\n', name + '.flow.json', 'application/json');
          bus.emit('flow:export', { format: 'json', path: '' });
        }]
      ]);
    }
    /** the diagram as an SVG document (text) */
    svgText() {
      const b = this._bbox(this.tCursor != null && this.result && !this.result.stale) || { x0: 0, y0: 0, x1: 200, y1: 100 };
      const m = 24;
      const x0 = b.x0 - m, y0 = b.y0 - m - 12, W = b.x1 - b.x0 + 2 * m, H = b.y1 - b.y0 + 2 * m + 12;
      const out = S('svg', { width: Math.ceil(W), height: Math.ceil(H), viewBox: `${x0.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}`, 'font-family': FONT });
      out.appendChild(S('rect', { x: x0, y: y0, width: W, height: H, fill: '#ffffff' }));
      const ge = this.gEdges.cloneNode(true), gn = this.gNodes.cloneNode(true);
      for (const g of [ge, gn]) {
        g.querySelectorAll('.fl-ui, .fl-hit').forEach((x) => x.remove());
        g.querySelectorAll('.sel, .target').forEach((x) => x.classList.remove('sel', 'target'));
        out.appendChild(g);
      }
      out.querySelectorAll('[class]').forEach((x) => x.removeAttribute('class'));
      out.querySelectorAll('[data-node],[data-edge]').forEach((x) => {
        x.removeAttribute('data-node');
        x.removeAttribute('data-edge');
      });
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out);
    }
    async pngBlob(scale = 2) {
      const text = this.svgText();
      const m = /width="(\d+)" height="(\d+)"/.exec(text);
      const W = +m[1], H = +m[2];
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        await new Promise((ok, bad) => {
          img.onload = ok;
          img.onerror = () => bad(new Error('The picture could not be drawn.'));
          img.src = url;
        });
        const cv = document.createElement('canvas');
        cv.width = Math.round(W * scale);
        cv.height = Math.round(H * scale);
        const cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        return await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    async exportPNG(mine) {
      const name = slug(this.D.title) + '.png';
      const blob = await this.pngBlob(2);
      if (!blob) return toast('The picture could not be made in this browser.', 'error');
      if (mine) {
        const p = await MG.app.saveToFiles(name, blob, { folder: '~/diagrams' });
        if (p) bus.emit('flow:export', { format: 'png', path: p });
        return p;
      }
      MG.downloadBlob(blob, name);
      bus.emit('flow:export', { format: 'png', path: '' });
      return name;
    }
    async exportSVG(mine) {
      const name = slug(this.D.title) + '.svg';
      const text = this.svgText();
      if (mine) {
        const p = await MG.app.saveToFiles(name, text, { folder: '~/diagrams' });
        if (p) bus.emit('flow:export', { format: 'svg', path: p });
        return p;
      }
      MG.downloadText(text, name, 'image/svg+xml');
      bus.emit('flow:export', { format: 'svg', path: '' });
      return name;
    }
    /** the last run as a table: time, then one column for each box in the simulation */
    csvText() {
      const res = this.result;
      if (!res) return null;
      const nodes = this.D.nodes.filter((n) => res.series[n.id]);
      const q = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      const used = new Set();
      const head = ['time_' + this.D.sim.timeUnit.replace(/[^A-Za-z0-9]+/g, '')].concat(nodes.map((n) => {
        let c = oneLine(n.text) || n.id;
        if (n.unit) c += ' (' + n.unit + ')';
        let c2 = c, k = 2;
        while (used.has(c2)) c2 = c + ' ' + k++;
        used.add(c2);
        return q(c2);
      }));
      const lines = [head.join(',')];
      for (let i = 0; i < res.times.length; i++) lines.push([+res.times[i].toPrecision(6)].concat(nodes.map((n) => +res.series[n.id][i].toPrecision(6))).join(','));
      return lines.join('\n') + '\n';
    }
    async exportCSV(mine) {
      if (!this.result) {
        toast('Run the diagram first: the table holds the results of the last run.', 'warn');
        return null;
      }
      const text = this.csvText();
      const name = slug(this.D.title) + '-run.csv';
      if (mine) {
        const p = await MG.app.saveToFiles(name, text, { folder: '~/diagrams', ask: false });
        if (p) bus.emit('flow:export', { format: 'csv', path: p });
        return p;
      }
      MG.downloadText(text, name, 'text/csv');
      bus.emit('flow:export', { format: 'csv', path: '' });
      return name;
    }

    help() {
      MG.modal('Diagrams: how they work',
        `<h4 class="fl-dlg-h">Drawing</h4>
<ul>
<li><b>Add a box</b>: double-click an empty part of the diagram, or use <b>Box</b> (which also offers stimuli, set points, comparators and notes).</li>
<li><b>Draw an arrow</b>: drag from one of the four dots on the edge of a box to another box (let go on an empty part to make a new box there). The buttons <b>+</b>, <b>−</b> and <b>→</b> choose what new arrows do: a green <b>+</b> arrow <i>stimulates</i> (more of one makes more of the other), a red <b>−</b> arrow with a bar at its end <i>inhibits</i> (more of one makes less of the other), and a plain arrow simply leads on.</li>
<li><b>Curve an arrow</b> by dragging it sideways; a feedback loop can go round the outside of the diagram. A dashed line can mark an indirect effect or a feedback pathway.</li>
<li><b>Edit text</b>: double-click a box or an arrow (or select it and press Enter). The panel on the right shows the settings of what is selected.</li>
<li>Drag the background to move around; the mouse wheel zooms. Hold Shift and drag to select an area. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, <kbd>Delete</kbd> deletes, the arrow keys move what is selected.</li>
</ul>
<h4 class="fl-dlg-h">The simulation</h4>
<p>When you press <b>Run</b>, every box starts at its <b>resting level</b> – where it sits when nothing disturbs the system – and the workbench follows how each quantity changes over time.</p>
<ul>
<li><b>Strength</b> (of an arrow): how big the effect is. With strength 2, a rise of 1 in the box the arrow comes from pushes the box it points to up by 2 (down by 2 for a − arrow), once that box has caught up.</li>
<li><b>Delay</b> (of an arrow): how long it takes before a change in one box starts to act on the next – for example, the time a hormone takes to reach its target and act there.</li>
<li><b>Response time</b> (of a quantity): how quickly it follows what its arrows tell it. After one response time it has made about two thirds (63%) of the change; after three, about 95%.</li>
<li>A <b>stimulus</b> or disturbance pushes on the system from outside: a step (switched on and left on), a pulse, a ramp or a wave.</li>
<li>A <b>set point</b> is a fixed level. A <b>comparator</b> (Σ) adds up its inputs (a + arrow adds, a − arrow subtracts), so <i>set point − measured value</i> gives the error signal.</li>
<li><b>What if…</b>: knock a box out (its level falls to zero), fix it at a level (it no longer responds to its inputs, like a tumour that secretes on its own), or block an arrow (cut the pathway). Right-click a box or an arrow, or use the panel on the right.</li>
</ul>
<p>The model is deliberately simple: each quantity moves at its own pace towards the sum of what its arrows bring (<i>τ dx/dt = Σ ±strength × input − x</i>, where <i>x</i> is its change from rest). Real physiology is more complicated, but this is enough to show the important behaviours: negative feedback holds a quantity close to its set point but not exactly at it; positive feedback runs away; a long delay in a feedback loop makes it overshoot and oscillate; and feed-forward lets a system respond before an error has appeared.</p>
<p>Under the diagram, the graphs show each quantity over the run (drag the slider to see the diagram at any moment), and the table its lowest, highest and final levels – where there is room for only one of them, <b>Graphs</b> and <b>Numbers</b> switch between the two. The results of a run can be kept in your files as a table (<b>Results to my files</b>), to plot or analyse in RStudio.</p>`);
    }
  }

  MG.FlowApp = FlowApp;
  MG.flowSim = { simulate, normDiagram, toJSON, turningPoints };
})();
