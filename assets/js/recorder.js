/* =====================================================================
   The Recorder tab: a chart recorder that plays back real recordings of
   people – the ECG, heart sounds, blood pressure, the pulse, breathing,
   muscle (EMG) and brain (EEG) – excerpts of open-access databases of
   PhysioNet (made by build/recordings/make_recordings.py).

   A recording is recordings/<id>.json (what it is: its channels and sampling rate, its beats and annotations, where it
   comes from and its licence) and recordings/<id>.bin (its samples: little-endian 16-bit integers, channel after
   channel; a sample's value is raw × scale + offset, and −32768 is a gap). recordings/index.json lists them.

   What the buttons of the instructions ask for (go, tool, toR):
     go('ecg-normal')               open a recording, as it opens from the list
     go('ecg-normal@12,22')         …showing 12 s to 22 s
     go('ecg-normal@12')            …from 12 s, keeping the time per screen it had
     go('rsa@0,60:II,Resp')         …showing only these channels (by short name, name, or number from 1)
     go('rsa+hr')                   …with the heart-rate channel ('-hr': without it)
     go('list')                     the list of recordings
     tool('pan' | 'calipers' | 'marker')   what dragging and clicking on the trace do
     tool('hr' | 'hr:off')          the heart-rate channel (computed from the beats) on or off
     tool('play' | 'stop')          play the recording in real time, as if it were being recorded, or stop
     tool('speed:2')                the speed of playing (0.5, 1, 2 or 5 times real time)
     tool('zoom:5')                 5 seconds across the screen ('zoom:all' the whole recording)
     tool('listen' | 'listen:off')  hear a heart-sound or EMG channel while it plays
     tool('about' | 'datapad' | 'channels' | 'list')   show a panel
     tool('add')                    add the measurement between the cursors to the data pad
     tool('padfile')                show the data pad's file (~/recorder/measurements.csv) in Files
     tool('export' | 'capture' | 'autoscale' | 'clear')
     toR('measurements')            a script that reads ~/recorder/measurements.csv, opened in RStudio
     toR('<recording id>')          the recording as a CSV file (~/recorder/<id>.csv) and a script that plots it

   What an interval is: R-R (from one R wave to the next), PR, QRS, QT or other. The Recorder guesses it from where the
   cursors lie on an ECG with beats (other for anything else); the menu beside the Data pad button, and each row of the
   data pad, can change it. The data pad's heart rate comes from its R-R rows only.

   Events (MG.bus), for the steps of the practicals that tick themselves:
     rec:open     {id, title, group}                     a recording is opened
     rec:view     {id, t0, t1, span}                     the view settles after a move or a zoom (seconds)
     rec:tool     {name}                                 pan, calipers or marker is chosen
     rec:play     {id, on, speed}                        playing starts or stops
     rec:measure  {id, kind: 'interval', channel, signal, interval, t1, t2, dt, dy, rate, hz, units}
                                                         the calipers measure an interval: t1 < t2 and dt in s, rate per
                                                         minute (60 / dt) and hz (1 / dt), dy the change in the channel;
                                                         signal: the kind of channel (ecg, eeg, emg, bp, …); interval:
                                                         R-R, PR, QRS, QT or other
                  {id, kind: 'point', channel, signal, t, value, units}   the marker is put down (or moved)
     rec:datapad  {id, n, channel, interval, dt, rate, n_rr, n_pr, n_qrs, n_qt, n_other}
                                                         a row is added to the data pad, or its interval changed (n: rows
                                                         in it; n_rr…: the rows of this recording of each interval)
     rec:hr       {id, on}                               the heart-rate channel is switched on or off
     rec:listen   {id, on}
     rec:export   {id, path, rows}
     rec:capture  {id, path}
     rec:panel    {name}                                 a panel is shown: about, datapad, channels
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;

  const BASE = () => ((MG.config && MG.config.recordingBase) || 'recordings/').replace(/\/?$/, '/');
  const HOME = () => MG.app.HOME || '/home/user';
  const DIR = () => HOME() + '/recorder';

  /* icons of the Recorder's own (the others are MG.icon's) */
  const OWN_IC = {
    calipers: '<path d="M7 3v18M17 3v18"/><path d="M7 12h10"/><path d="M10 9l-3 3 3 3M14 9l3 3-3 3"/>',
    marker: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 3.5L17 11H6"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5.5 12.5h3l1.3-2.5 2 5 1.4-2.5h4.3"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    pad: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    wave: '<path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5"/>',
    zin: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6M10.5 7.5v6"/>',
    zout: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6"/>',
    chans: '<path d="M3 6h3l1.5-2 2 4 1.5-2H21"/><path d="M3 12h4l1.5 2 2-4 1.5 2H21"/><path d="M3 18h6l1.5-2 2 4 1.5-2H21"/>'
  };
  const I = (n) =>
    OWN_IC[n]
      ? `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${OWN_IC[n]}</svg>`
      : MG.icon(n);

  /* the colours of the traces, by kind of signal */
  const KIND_COLOUR = { ecg: '#1d1d22', bp: '#1c5fb0', resp: '#2b8a3e', ppg: '#9c36b5', pcg: '#5c4033', emg: '#0b7285', eeg: '#3b4cc0', scg: '#6b7280', angle: '#c2620a', hr: '#d9480f', other: '#384355' };
  const ITEM_COLOUR = { ecg: '#c92a2a', pcg: '#8d5524', bp: '#1c5fb0', ppg: '#9c36b5', resp: '#2b8a3e', emg: '#0b7285', eeg: '#3b4cc0' };
  const BEAT_COLOUR = { N: '#7a8494', V: '#c92a2a', A: '#1c7ed6', a: '#1c7ed6', S: '#1c7ed6', J: '#7048e8', j: '#7048e8', R: '#2f9e44', L: '#2f9e44', F: '#e67700', E: '#c92a2a', e: '#7048e8', Q: '#868e96' };
  const SPEEDS = [0.5, 1, 2, 5];
  const SPANS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600];
  const GUTTER = 54; // the scale on the left of the traces (css px)
  const RIGHT = 10;
  /* what an interval is (the data pad's kind of row): its value, its label, and what it means */
  const INTERVALS = [
    ['R-R', 'R–R', 'R–R interval: from one R wave to the next (the heart rate comes from these)'],
    ['PR', 'PR', 'PR interval: from the start of the P wave to the start of the QRS'],
    ['QRS', 'QRS', 'QRS duration'],
    ['QT', 'QT', 'QT interval: from the start of the QRS to the end of the T wave'],
    ['other', 'other', 'anything else']
  ];
  const IV_LABEL = Object.fromEntries(INTERVALS.map(([v, l]) => [v, l]));
  const IV_TEXT = { 'R-R': 'an R–R interval', PR: 'a PR interval', QRS: 'a QRS duration', QT: 'a QT interval', other: '“other”' };
  const IV_OK = (v) => Object.prototype.hasOwnProperty.call(IV_LABEL, v);
  /** the kind of a row of the data pad (rows kept before there were kinds count as other) */
  const padKind = (r) => (r && IV_OK(r.kind) ? r.kind : 'other');
  /* (a rate means something for an interval that repeats: from one beat or wave to the next – not for a PR, QRS or QT) */
  const HAS_RATE = (iv) => iv === 'R-R' || iv === 'other';

  /* ---------- small helpers ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const uid = () => Math.random().toString(36).slice(2, 9);
  /** a "nice" step for about n ticks across a range: 1, 2 or 5 × a power of ten */
  function niceStep(range, n) {
    const raw = range / Math.max(1, n);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const decimalsFor = (step) => Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));
  /** a time in seconds, with as many decimals as the step of the view needs */
  function fmtT(t, step) {
    const d = step == null ? 3 : decimalsFor(step);
    return t.toFixed(d);
  }
  /** a value with about 3 significant figures (no exponent for the usual sizes) */
  function fmtV(v) {
    if (v == null || !isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return Math.round(v).toString();
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.1) return v.toFixed(3);
    if (a >= 0.01) return v.toFixed(4);
    return v.toPrecision(3);
  }
  /** a label of the scale: as many decimals as the step between the labels needs */
  const fmtTick = (v, step) => {
    const d = Math.max(0, Math.min(5, -Math.floor(Math.log10(step) + 1e-9)));
    const s = (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(d);
    return s === '-0' ? '0' : s;
  };
  const fmtDt = (dt) => (dt >= 10 ? dt.toFixed(1) : dt >= 1 ? dt.toFixed(2) : dt.toFixed(3)) + ' s';
  const fmtRate = (r) => (r >= 100 ? r.toFixed(0) : r.toFixed(1));
  const fmtHz = (f) => (f >= 100 ? f.toFixed(0) : f >= 10 ? f.toFixed(1) : f.toFixed(2));
  /** a name for a column of a CSV file that R reads as it is: "ECG (MLII)", "mV" → ecg_mlii_mV */
  const colName = (c) => {
    const base = (c.short || c.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'channel';
    const u = String(c.units || '').replace('µ', 'u').replace(/[^A-Za-z0-9]+/g, '');
    return (/^[0-9]/.test(base) ? 'ch_' + base : base) + (u ? '_' + u : '');
  };
  const LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

  /* =====================================================================
     The recorder
     ===================================================================== */
  class RecorderApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      const st = store.get('recorder', {}) || {};
      this.st = Object.assign({ rec: null, views: {}, hidden: {}, hr: {}, ranges: {}, side: 'about', list: null, pad: [], speed: 1, listen: false, tool: 'pan' }, st);
      ['views', 'hidden', 'hr', 'ranges'].forEach((k) => (this.st[k] = this.st[k] && typeof this.st[k] === 'object' ? this.st[k] : {}));
      if (!Array.isArray(this.st.pad)) this.st.pad = [];
      if (!SPEEDS.includes(this.st.speed)) this.st.speed = 1;
      this.catalogue = { groups: [], recordings: [] };
      this.cache = new Map(); // id → a promise of the loaded recording
      this.R = null; // the open recording
      this.t0 = 0;
      this.span = 10;
      this.A = null; // the cursors (seconds), and the marker
      this.B = null;
      this.M = null;
      this.mch = null; // the lane that measurements are of (its key)
      this.toolName = ['pan', 'calipers', 'marker'].includes(this.st.tool) ? this.st.tool : 'pan';
      this.playing = null;
      this._titleHits = [];
      this._save = MG.debounce(() => store.set('recorder', this.st), 300);
      this._mirror = MG.debounce(() => this._writePad(), 500);
      this._viewEv = MG.debounce(() => this._emitView(), 350);
      this._build();
      this.ready = this._start();
    }

    /* ---------------- layout ---------------- */
    _build() {
      const r = this.root;
      r.classList.add('rc-app');
      r.innerHTML = '';
      // the list of recordings
      this.search = h('input.rc-search', { type: 'search', placeholder: 'Search the recordings', 'aria-label': 'Search the recordings' });
      this.search.addEventListener('input', () => this._renderList());
      this.listEl = h('div.rc-listbody', { role: 'list' });
      const credits = h('button.tbtn', { type: 'button', html: I('info') + '<span>Where the recordings come from</span>' });
      credits.addEventListener('click', () => this.credits());
      this.list = h('aside.rc-list', { 'aria-label': 'Recordings' },
        h('div.rc-list-h', h('b', 'Recordings'), h('span.grow'), this._ib('x', 'Close the list', () => this.toggleList(false), '.rc-list-x')),
        this.search, this.listEl, h('div.rc-list-foot', credits));

      // the toolbar
      this.listBtn = this._ib('list', 'The list of recordings', () => this.toggleList(), '.rc-tg');
      this.titleEl = h('button.rc-title', { type: 'button', title: 'About this recording' }, 'No recording');
      this.titleEl.addEventListener('click', () => this.showSide('about'));
      this.playBtn = h('button.rc-play', { type: 'button', title: 'Play the recording in real time, as if it were being recorded (space)', html: I('play') + '<span>Play</span>' });
      this.playBtn.addEventListener('click', () => (this.playing ? this.stop() : this.play()));
      this.speedSel = h('select.rc-sel', { 'aria-label': 'Speed of playing', title: 'Speed of playing' }, SPEEDS.map((s) => h('option', { value: s }, '×' + s)));
      this.speedSel.value = String(this.st.speed);
      this.speedSel.addEventListener('change', () => this.setSpeed(Number(this.speedSel.value)));
      this.spanSel = h('select.rc-sel.rc-span', { 'aria-label': 'Time across the screen', title: 'Time across the screen' });
      this.spanSel.addEventListener('change', () => this.zoomTo(this.spanSel.value === 'all' ? Infinity : Number(this.spanSel.value)));
      const zout = this._ib('zout', 'Show more time (−)', () => this.zoom(2));
      const zin = this._ib('zin', 'Show less time, in more detail (+)', () => this.zoom(0.5));
      this.toolBtns = {};
      const tools = h('div.rc-tools', { role: 'group', 'aria-label': 'Tools' });
      [
        ['pan', 'hand', 'Move', 'Move along the recording: drag the trace (P)'],
        ['calipers', 'calipers', 'Calipers', 'Measure between two cursors: drag across the trace, or click at each end (C)'],
        ['marker', 'marker', 'Marker', 'Put a marker on the trace: the readout then measures from it to the pointer (M)']
      ].forEach(([id, ic, label, title]) => {
        const b = h('button.rc-tool', { type: 'button', title, 'aria-pressed': 'false', html: I(ic) + `<span>${label}</span>` });
        b.addEventListener('click', () => this.tool(id));
        this.toolBtns[id] = b;
        tools.appendChild(b);
      });
      this.hrBtn = h('button.rc-tool.rc-hrbtn', { type: 'button', title: 'The heart rate, beat by beat, as a channel of its own (H)', 'aria-pressed': 'false', html: I('heart') + '<span>Heart rate</span>' });
      this.hrBtn.addEventListener('click', () => this.setHR(!this._hrOn()));
      this.listenBtn = h('button.rc-tool', { type: 'button', title: 'Hear the sound of this recording while it plays', 'aria-pressed': 'false', html: I('speaker') + '<span>Sound</span>', hidden: true });
      this.listenBtn.addEventListener('click', () => this.setListen(!this.st.listen));
      this.padBtn = this._ib('pad', 'The data pad: your measurements', () => this.showSide(this.st.side === 'datapad' ? null : 'datapad'), '.rc-tg');
      this.chBtn = this._ib('chans', 'The channels: show, hide and scale them', () => this.showSide(this.st.side === 'channels' ? null : 'channels'), '.rc-tg');
      const cap = this._ib('camera', 'Take a picture of the view (saved in Files, in recorder)', () => this.capture());
      const menu = this._ib('more', 'More', (e) => this._menu(e.currentTarget));
      this.bar = h('div.rc-bar', this.listBtn, this.titleEl, h('span.rc-sep'), this.playBtn, this.speedSel, h('span.rc-sep'),
        h('span.rc-zoom', zout, this.spanSel, zin), h('span.rc-sep'), tools, this.hrBtn, this.listenBtn, h('span.grow'), this.chBtn, this.padBtn, cap, menu);

      // the readout of the cursors
      this.mbar = h('div.rc-mbar', { role: 'status', 'aria-live': 'polite' });

      // the chart: the traces (scrolling up and down when there are many channels), the time axis and the overview
      this.cv = h('canvas.rc-cv', { 'aria-hidden': 'true' });
      this.g = this.cv.getContext('2d');
      this.hair = h('div.rc-hair', { hidden: true });
      this.tip = h('div.rc-tip', { hidden: true });
      this.scroller = h('div.rc-scroll', this.cv, this.hair);
      this.axis = h('canvas.rc-axis', { 'aria-hidden': 'true', width: 600, height: 24 });
      this.ov = h('canvas.rc-ov', { title: 'The whole recording: click or drag to move the view', width: 600, height: 36 });
      this.empty = h('div.rc-empty', h('div', h('h3', 'Choose a recording'), h('p', 'Pick a recording from the list to start.'), this._openListBtn()));
      this.banner = h('div.rc-banner', { hidden: true, role: 'status' });
      this.chart = h('div.rc-chart', { tabindex: '0', 'aria-label': 'The recording. Arrow keys move along it, + and − zoom, space plays.' }, this.scroller, this.tip, this.banner, this.empty);
      this.view = h('div.rc-view', this.mbar, this.chart, this.axis, this.ov);

      // the side panel
      this.sideTabs = {};
      this.sideBody = h('div.rc-side-b');
      const nav = h('div.rc-side-tabs', { role: 'tablist' });
      [['about', 'About'], ['datapad', 'Data pad'], ['channels', 'Channels']].forEach(([id, label]) => {
        const b = h('button.rc-stab', { type: 'button', role: 'tab' }, label);
        b.addEventListener('click', () => this.showSide(id));
        this.sideTabs[id] = b;
        nav.appendChild(b);
      });
      this.side = h('aside.rc-side', { 'aria-label': 'About the recording, the data pad and the channels' }, h('div.rc-side-h', nav, this._ib('x', 'Close the panel', () => this.showSide(null), '.rc-side-x')), this.sideBody);

      this.main = h('div.rc-main', this.bar, h('div.rc-work', this.view, this.side));
      r.append(this.list, this.main);
      this._pointer();
      this.root.addEventListener('keydown', (e) => this._key(e));
      if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(this.chart);
      this._toolUI();
    }
    _ib(ic, title, fn, cls = '') {
      const b = h('button.rc-ib' + cls, { type: 'button', title, 'aria-label': title, html: I(ic) });
      b.addEventListener('click', fn);
      return b;
    }
    _openListBtn() {
      const b = h('button.tbtn', { type: 'button', html: I('list') + '<span>The list of recordings</span>' });
      b.addEventListener('click', () => this.toggleList(true));
      return b;
    }

    async _start() {
      const W0 = this.root.clientWidth || 1000;
      try {
        const r = await fetch(BASE() + 'index.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.catalogue = await r.json();
      } catch (e) {
        this.listEl.innerHTML = `<p class="rc-none">The list of recordings could not be loaded (${esc(e.message || e)}). Check your internet connection, or open the workbench through a web server (for example <code>python3 serve.py</code>), not as a file.</p>`;
      }
      this._renderList();
      const want = this.st.rec && this._entry(this.st.rec) ? this.st.rec : null;
      this.toggleList(this.st.list != null ? this.st.list && W0 >= 1100 : !want || W0 >= 1300, true);
      if (want) await this.open(want, { quiet: true, restore: true }).catch(() => {});
      else {
        this._refreshTitle();
        this._draw();
      }
      this.showSide(W0 >= 980 ? this.st.side || null : null, true);
    }
    _narrow() {
      return (this.root.clientWidth || 1000) < 860;
    }
    /** where the list and the side panel lie over the chart (a narrow pane, beside the instructions or on a phone): close
        them, so that the whole chart can be seen and used → whether one was open */
    _closeOverlays() {
      if (!this._narrow()) return false;
      let did = false;
      if (!this.side.hidden) {
        this.showSide(null, true);
        did = true;
      }
      if (!this.list.hidden) {
        this.toggleList(false, true);
        did = true;
      }
      return did;
    }
    shown() {
      setTimeout(() => this._resize(), 20);
    }
    dirty() {
      return false;
    }

    /* ---------------- the list ---------------- */
    _entry(id) {
      return (this.catalogue.recordings || []).find((x) => x.id === id);
    }
    _renderList() {
      const q = this.search.value.trim().toLowerCase();
      const all = this.catalogue.recordings || [];
      const list = all.filter((s) => !q || [s.title, s.group, s.summary, (s.channels || []).join(' ')].join(' ').toLowerCase().includes(q));
      this.listEl.innerHTML = '';
      if (!list.length && all.length) this.listEl.appendChild(h('p.rc-none', 'No recording matches.'));
      const groups = {};
      list.forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
      const seen = new Set();
      (this.catalogue.groups || []).concat(Object.keys(groups)).forEach((gname) => {
        if (seen.has(gname) || !groups[gname]) return;
        seen.add(gname);
        this.listEl.appendChild(h('div.rc-grp', gname));
        groups[gname].forEach((s) => {
          const b = h('button.rc-item', { type: 'button', role: 'listitem', dataset: { id: s.id }, title: s.summary || '' },
            h('span.rc-item-ic', { html: I('wave'), style: { color: ITEM_COLOUR[s.kind] || ITEM_COLOUR.ecg } }),
            h('span.rc-item-t', h('b', s.title), h('small', `${(s.channels || []).slice(0, 3).join(', ')}${(s.channels || []).length > 3 ? '…' : ''} · ${durText(s.duration)}`)));
          b.addEventListener('click', () => {
            this.open(s.id);
            if (this.root.clientWidth < 1300) this.toggleList(false, true);
          });
          if (this.R && this.R.id === s.id) b.classList.add('on');
          this.listEl.appendChild(b);
        });
      });
    }
    toggleList(on, quiet) {
      on = on == null ? this.list.hidden : !!on;
      this.list.hidden = !on;
      this.listBtn.classList.toggle('on', on);
      this.listBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!quiet) {
        this.st.list = on;
        this._save();
      }
      if (on && !quiet) setTimeout(() => this.search.focus({ preventScroll: true }), 30);
      setTimeout(() => this._resize(), 20);
    }

    /* ---------------- loading a recording ---------------- */
    _load(id) {
      if (this.cache.has(id)) return this.cache.get(id);
      const p = (async () => {
        const mr = await fetch(BASE() + id + '.json', { cache: 'no-cache' });
        if (!mr.ok) throw new Error(mr.status === 404 ? 'There is no recording called ' + id + '.' : 'HTTP ' + mr.status);
        const R = await mr.json();
        const br = await fetch(BASE() + (R.file || id + '.bin'));
        if (!br.ok) throw new Error('HTTP ' + br.status + ' for its samples');
        const buf = await br.arrayBuffer();
        const n = R.n;
        const nc = R.channels.length;
        if (buf.byteLength < n * nc * 2) throw new Error('its file of samples is incomplete');
        const dv = new DataView(buf);
        R.data = R.channels.map((c, k) => {
          const a = new Float32Array(n);
          const off = k * n * 2;
          if (LITTLE) {
            const raw = new Int16Array(buf, off, n);
            for (let i = 0; i < n; i++) a[i] = raw[i] === -32768 ? NaN : raw[i] * c.scale + c.offset;
          } else {
            for (let i = 0; i < n; i++) {
              const v = dv.getInt16(off + 2 * i, true);
              a[i] = v === -32768 ? NaN : v * c.scale + c.offset;
            }
          }
          if (!c.short) c.short = c.name;
          if (!c.range) c.range = rangeOf(a);
          return a;
        });
        R.duration = n / R.fs;
        R.blocks = Array.isArray(R.blocks) && R.blocks.length ? R.blocks : [{ start: 0, n, label: '' }];
        R.events = Array.isArray(R.events) ? R.events : [];
        R.rhythms = Array.isArray(R.rhythms) ? R.rhythms : [];
        // the heart rate, beat by beat (none across the break between two blocks)
        if (R.beats && Array.isArray(R.beats.t) && R.beats.t.length > 1) {
          const bt = R.beats.t;
          const breaks = R.blocks.slice(1).map((b) => b.start / R.fs);
          const pts = [];
          for (let i = 1; i < bt.length; i++) {
            const rr = bt[i] - bt[i - 1];
            if (rr <= 0.15 || rr > 4) continue;
            if (breaks.some((x) => bt[i - 1] < x && bt[i] >= x)) continue;
            pts.push({ t: bt[i], v: 60 / rr, rr, code: (R.beats.code || '')[i] || '' });
          }
          R.hr = pts;
          if (pts.length) {
            let lo = Infinity, hi = -Infinity;
            pts.forEach((p) => ((lo = Math.min(lo, p.v)), (hi = Math.max(hi, p.v))));
            R.hrRange = [Math.max(0, Math.floor((lo - 8) / 10) * 10), Math.ceil((hi + 8) / 10) * 10];
          }
        } else R.hr = null;
        R.audioCh = R.channels.findIndex((c) => c.audio);
        return R;
      })();
      this.cache.set(id, p);
      p.catch(() => this.cache.delete(id));
      return p;
    }

    /** open a recording. opts.t0, opts.span (or opts.t1): the view; opts.channels: the lanes to show; opts.hr: the
        heart-rate channel; opts.quiet: no event; opts.restore: as it was left */
    async open(id, opts = {}) {
      if (this.playing) this.stop();
      const entry = this._entry(id);
      // (a recording that is already here opens at once: "Loading" only for one that takes a moment)
      const slow = setTimeout(() => this._showEmpty(`<h3>Loading ${esc(entry ? entry.title : id)}…</h3><span class="spinner"></span>`), 150);
      let R;
      try {
        R = await this._load(id);
      } catch (e) {
        clearTimeout(slow);
        this._showEmpty(`<h3>The recording could not be loaded</h3><p>${esc(e.message || e)}</p><p>Check your internet connection, then try again.</p>`, () => this.open(id, opts));
        throw e;
      }
      clearTimeout(slow);
      const same = this.R && this.R.id === R.id;
      this._hideHover();
      this.R = R;
      this.A = this.B = this.M = null;
      this.mch = null;
      this.ivPick = null;
      this.st.rec = R.id;
      this._showEmpty(null);
      // (in a narrow pane the panels lie over the chart: the recording just opened is to be seen)
      if (!opts.restore) this._closeOverlays();
      // the channels shown
      if (opts.channels) this.st.hidden[R.id] = R.channels.map((c) => c.short).filter((s) => !opts.channels.includes(s));
      else if (!this.st.hidden[R.id]) this.st.hidden[R.id] = R.channels.filter((c) => c.hidden).map((c) => c.short);
      if (opts.hr != null) this.st.hr[R.id] = !!opts.hr && !!R.hr;
      else if (this.st.hr[R.id] == null && R.view && R.view.hr && R.hr) this.st.hr[R.id] = true;
      // the view
      const v = this.st.views[R.id];
      const def = R.view || {};
      let span = opts.span || (opts.t1 != null && opts.t0 != null ? opts.t1 - opts.t0 : null) || (v && v.span) || def.span || Math.min(10, R.duration);
      let t0 = opts.t0 != null ? opts.t0 : v && (opts.restore || same) ? v.t0 : def.t0 || 0;
      this._setSpanOptions();
      this._setView(t0, span, true);
      this._renderList();
      this._refreshTitle();
      this._toolUI();
      this._renderSide();
      this._save();
      this._resize();
      if (!opts.quiet) bus.emit('rec:open', { id: R.id, title: R.title, group: R.group });
      this._viewEv();
      return R;
    }
    _showEmpty(html, retry) {
      if (!html) {
        this.empty.hidden = true;
        return;
      }
      this.empty.hidden = false;
      this.empty.innerHTML = '';
      const box = h('div', { html });
      if (retry) {
        const b = h('button.btn', { type: 'button' }, 'Try again');
        b.addEventListener('click', retry);
        box.appendChild(b);
      }
      this.empty.appendChild(box);
    }
    _refreshTitle() {
      const R = this.R;
      this.titleEl.textContent = R ? R.title : 'No recording';
      this.titleEl.title = R ? `About this recording: ${R.title}` : 'Choose a recording';
      this.listenBtn.hidden = !(R && R.audioCh >= 0);
      this.hrBtn.hidden = !(R && R.hr);
      this.hrBtn.classList.toggle('on', this._hrOn());
      this.hrBtn.setAttribute('aria-pressed', this._hrOn() ? 'true' : 'false');
      this.listenBtn.classList.toggle('on', !!this.st.listen);
      this.listenBtn.setAttribute('aria-pressed', this.st.listen ? 'true' : 'false');
      this.listenBtn.innerHTML = I(this.st.listen ? 'speaker' : 'mute') + '<span>Sound</span>';
    }

    /* ---------------- what the instructions ask for ---------------- */
    /** go('id[@t0[,t1]][:ch,ch][+hr|-hr]') – see the top of this file */
    async go(spec) {
      await this.ready;
      spec = String(spec || '').trim();
      if (!spec || spec === 'list') {
        this.toggleList(true);
        return;
      }
      let hr = null;
      spec = spec.replace(/([+-])hr\b/i, (m, s) => {
        hr = s === '+';
        return '';
      });
      let chans = null;
      const ci = spec.indexOf(':');
      if (ci >= 0) {
        chans = spec.slice(ci + 1).split(',').map((s) => s.trim()).filter(Boolean);
        spec = spec.slice(0, ci);
      }
      let t0 = null, t1 = null;
      const ai = spec.indexOf('@');
      if (ai >= 0) {
        const parts = spec.slice(ai + 1).split(',').map(Number);
        spec = spec.slice(0, ai);
        if (isFinite(parts[0])) t0 = parts[0];
        if (parts.length > 1 && isFinite(parts[1])) t1 = parts[1];
      }
      const id = spec.trim();
      const R = await this._load(id);
      const opts = { hr };
      if (chans) opts.channels = chans.map((c) => this._chanBy(R, c)).filter((c) => c).map((c) => c.short);
      if (t0 != null) {
        opts.t0 = t0;
        if (t1 != null && t1 > t0) opts.span = t1 - t0;
      }
      await this.open(id, opts);
      if ((this.root.clientWidth || 0) < 1300) this.toggleList(false, true);
      return this.R;
    }
    _chanBy(R, s) {
      const k = Number(s);
      if (Number.isInteger(k) && k >= 1 && k <= R.channels.length) return R.channels[k - 1];
      const low = String(s).toLowerCase();
      return R.channels.find((c) => c.short.toLowerCase() === low) || R.channels.find((c) => c.name.toLowerCase() === low) || R.channels.find((c) => c.name.toLowerCase().includes(low));
    }
    /** tool(name) – see the top of this file */
    async tool(name) {
      await this.ready;
      const [n, arg] = String(name || '').split(':');
      if (['pan', 'calipers', 'marker'].includes(n)) return this._setTool(n);
      if (n === 'hr') return this.setHR(arg !== 'off');
      if (n === 'play') return this.play();
      if (n === 'stop') return this.stop();
      if (n === 'speed') return this.setSpeed(Number(arg));
      if (n === 'zoom') return this.zoomTo(arg === 'all' ? Infinity : Number(arg));
      if (n === 'listen') return this.setListen(arg !== 'off');
      if (['about', 'datapad', 'channels'].includes(n)) return this.showSide(n);
      if (n === 'list') return this.toggleList(true);
      if (n === 'add') return this.addToPad();
      if (n === 'padfile') return this.showPadFile();
      if (n === 'export') return this.exportDialog();
      if (n === 'capture') return this.capture();
      if (n === 'autoscale') return this.autoscale();
      if (n === 'clear') return this.clearCursors();
      toast('The Recorder has no tool called ' + esc(name) + '.', 'warn');
    }
    _setTool(n) {
      // (choosing a tool is going back to the chart: in a narrow pane, the panel over it closes)
      this._closeOverlays();
      this.toolName = n;
      this.st.tool = n;
      this._save();
      if (n === 'pan') this.M = this.M; // (the cursors stay: they can still be read)
      this._toolUI();
      this._draw();
      bus.emit('rec:tool', { name: n });
    }
    _toolUI() {
      Object.entries(this.toolBtns).forEach(([k, b]) => {
        b.classList.toggle('on', k === this.toolName);
        b.setAttribute('aria-pressed', k === this.toolName ? 'true' : 'false');
      });
      this.root.dataset.tool = this.toolName;
      this._measureBar();
    }

    /* ---------------- the view: time ---------------- */
    _minSpan() {
      const R = this.R;
      return R ? Math.max(0.02, Math.min(R.duration, 100 / R.fs)) : 0.1;
    }
    _setView(t0, span, quiet) {
      const R = this.R;
      if (!R) return;
      span = clamp(isFinite(span) ? span : R.duration, this._minSpan(), R.duration);
      t0 = clamp(t0, 0, Math.max(0, R.duration - span));
      this.t0 = t0;
      this.span = span;
      this.st.views[R.id] = { t0: +t0.toFixed(4), span: +span.toFixed(4) };
      this._save();
      this._syncSpanSel();
      this._draw();
      if (!quiet) this._viewEv();
    }
    _emitView() {
      if (!this.R) return;
      bus.emit('rec:view', { id: this.R.id, t0: +this.t0.toFixed(3), t1: +(this.t0 + this.span).toFixed(3), span: +this.span.toFixed(3) });
    }
    _setSpanOptions() {
      const R = this.R;
      this.spanSel.innerHTML = '';
      if (!R) return;
      const lo = this._minSpan();
      SPANS.filter((s) => s >= lo * 0.999 && s < R.duration * 0.98).forEach((s) => this.spanSel.appendChild(h('option', { value: s }, spanText(s))));
      this.spanSel.appendChild(h('option', { value: 'all', title: 'The whole recording (' + durText(R.duration) + ')' }, 'All'));
    }
    _syncSpanSel() {
      if (!this.R) return;
      const opts = Array.from(this.spanSel.options);
      let best = opts.find((o) => o.value === 'all');
      if (this.span < this.R.duration * 0.98) {
        const near = opts.filter((o) => o.value !== 'all').find((o) => Math.abs(Number(o.value) - this.span) / this.span < 0.02);
        if (near) best = near;
        else {
          // (a zoom in between: a choice of its own, for now)
          let o = opts.find((x) => x.dataset.custom);
          if (!o) {
            o = h('option', { dataset: { custom: '1' } });
            this.spanSel.insertBefore(o, this.spanSel.firstChild);
          }
          o.value = String(this.span);
          o.textContent = spanText(this.span);
          best = o;
        }
      }
      opts.filter((o) => o.dataset.custom && o !== best).forEach((o) => o.remove());
      this.spanSel.value = best.value;
    }
    /** zoom by a factor about a time (default: the middle of the view) */
    zoom(f, about) {
      if (!this.R) return;
      this._closeOverlays();
      if (this.playing) this.stop();
      const c = about != null ? about : this.t0 + this.span / 2;
      const ns = clamp(this.span * f, this._minSpan(), this.R.duration);
      const k = (c - this.t0) / this.span;
      this._setView(c - k * ns, ns);
    }
    zoomTo(span) {
      if (!this.R) return;
      this._closeOverlays();
      if (this.playing) this.stop();
      const c = this.t0 + this.span / 2;
      const ns = clamp(isFinite(span) ? span : this.R.duration, this._minSpan(), this.R.duration);
      this._setView(c - ns / 2, ns);
    }
    scrollBy(frac) {
      if (!this.R) return;
      if (this.playing) this.stop();
      this._setView(this.t0 + frac * this.span, this.span);
    }
    /** show from t0 to t1 (seconds) */
    show(t0, t1) {
      if (!this.R) return;
      this._setView(t0, t1 != null ? t1 - t0 : this.span);
    }

    /* ---------------- the lanes ---------------- */
    _hrOn() {
      return !!(this.R && this.R.hr && this.st.hr[this.R.id]);
    }
    _lanes() {
      const R = this.R;
      if (!R) return [];
      const hidden = new Set(this.st.hidden[R.id] || []);
      const out = [];
      R.channels.forEach((c, k) => {
        if (!hidden.has(c.short)) out.push({ key: 'c' + k, k, c, units: c.units, name: c.name, short: c.short, kind: c.kind || 'other' });
        // (the heart rate goes under the channel it was counted on)
        if (this._hrOn() && R.beats && R.beats.channel === k) out.push(this._hrLane());
      });
      if (this._hrOn() && !out.some((l) => l.key === 'hr')) out.push(this._hrLane());
      return out;
    }
    _hrLane() {
      return { key: 'hr', k: -1, c: null, units: '/min', name: 'Heart rate', short: 'HR', kind: 'hr' };
    }
    _range(L) {
      const R = this.R;
      if (L.key === 'hr') {
        const r = (this.st.ranges[R.id] || {}).HR;
        return r || R.hrRange || [40, 120];
      }
      const r = (this.st.ranges[R.id] || {})[L.short];
      return r || L.c.range;
    }
    _setRange(L, lo, hi, quiet) {
      const R = this.R;
      const m = (this.st.ranges[R.id] = this.st.ranges[R.id] || {});
      if (lo == null) delete m[L.short];
      else m[L.short] = [lo, hi];
      this._save();
      this._draw();
      if (!quiet) this._renderSide();
    }
    /** fit the scale of each lane (or one) to what is on the screen */
    autoscale(only) {
      if (!this.R) return;
      this._lanes().forEach((L) => {
        if (only && L.key !== only.key) return;
        const [lo, hi] = this._minmax(L, this.t0, this.t0 + this.span);
        if (!isFinite(lo) || !isFinite(hi)) return;
        const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
        this._setRange(L, +(lo - pad).toPrecision(4), +(hi + pad).toPrecision(4), true);
      });
      this._renderSide();
    }
    _minmax(L, a, b) {
      let lo = Infinity, hi = -Infinity;
      if (L.key === 'hr') {
        (this.R.hr || []).forEach((p) => {
          if (p.t >= a && p.t <= b) {
            lo = Math.min(lo, p.v);
            hi = Math.max(hi, p.v);
          }
        });
        return [lo, hi];
      }
      const arr = this.R.data[L.k], fs = this.R.fs;
      const i0 = Math.max(0, Math.floor(a * fs)), i1 = Math.min(arr.length, Math.ceil(b * fs) + 1);
      for (let i = i0; i < i1; i++) {
        const v = arr[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return [lo, hi];
    }
    /** the value of a lane at a time (for the heart rate: the rate of the beat that ends after it) */
    _valueAt(L, t) {
      const R = this.R;
      if (!R) return NaN;
      if (L.key === 'hr') {
        const pts = R.hr || [];
        for (let i = 0; i < pts.length; i++) if (pts[i].t >= t) return pts[i].t - pts[i].rr <= t ? pts[i].v : NaN;
        return NaN;
      }
      const arr = R.data[L.k];
      const x = t * R.fs;
      const i = Math.floor(x);
      if (i < 0 || i >= arr.length) return NaN;
      if (i + 1 >= arr.length) return arr[i];
      return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
    }
    _stats(L, a, b) {
      const R = this.R;
      if (L.key === 'hr') {
        const v = (R.hr || []).filter((p) => p.t >= a && p.t <= b).map((p) => p.v);
        if (!v.length) return null;
        return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((x, y) => x + y, 0) / v.length };
      }
      const arr = R.data[L.k];
      const i0 = Math.max(0, Math.ceil(a * R.fs)), i1 = Math.min(arr.length - 1, Math.floor(b * R.fs));
      let lo = Infinity, hi = -Infinity, s = 0, n = 0;
      for (let i = i0; i <= i1; i++) {
        const v = arr[i];
        if (v !== v) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        s += v;
        n++;
      }
      return n ? { min: lo, max: hi, mean: s / n } : null;
    }

    /* ---------------- sizes ---------------- */
    _resize() {
      this._placeSide();
      const W = this.chart.clientWidth, H = this.chart.clientHeight;
      if (!W || !H) return;
      this.cssW = W;
      const lanes = this._lanes();
      const band = this._bandH();
      const n = Math.max(1, lanes.length);
      const minLane = W < 500 ? 44 : 52;
      const avail = H - band - 2;
      const laneH = Math.max(minLane, Math.floor(avail / n));
      this.laneH = laneH;
      const cssH = Math.max(H, band + laneH * n + 2);
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      // (the canvas is narrower than the scroller when the lanes overflow and a scroll bar takes room)
      const sw = this.scroller.clientWidth || W;
      this.cssW = sw;
      this.cssH = cssH;
      this.cv.style.width = sw + 'px';
      this.cv.style.height = cssH + 'px';
      this.cv.width = Math.round(sw * dpr);
      this.cv.height = Math.round(cssH * dpr);
      for (const [c, hh] of [[this.axis, 24], [this.ov, 36]]) {
        const w = this.axis.parentElement.clientWidth || W;
        c.style.width = w + 'px';
        c.style.height = hh + 'px';
        c.width = Math.round(w * dpr);
        c.height = Math.round(hh * dpr);
      }
      this._ovCache = null;
      this._draw();
    }
    _bandH() {
      const R = this.R;
      return R && (R.rhythms.length || R.blocks.length > 1) ? 36 : 20;
    }
    _plotW() {
      return Math.max(10, (this.cssW || 600) - GUTTER - RIGHT);
    }
    /** a time → x on the canvas (css px), and back */
    _xOf(t) {
      return GUTTER + ((t - this.t0) / this.span) * this._plotW();
    }
    _tOf(x) {
      return this.t0 + ((x - GUTTER) / this._plotW()) * this.span;
    }
    /** where a time is on the page (for the tests): clientX */
    _clientX(t) {
      return this.cv.getBoundingClientRect().left + this._xOf(t);
    }
    /** the middle of a lane on the page (for the tests): clientY */
    _clientY(short) {
      const lanes = this._lanes();
      const i = lanes.findIndex((L) => L.short === short || L.key === short);
      if (i < 0) return null;
      return this.cv.getBoundingClientRect().top + this._bandH() + this.laneH * i + this.laneH / 2;
    }

    /* ---------------- drawing ---------------- */
    _draw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._paint();
      });
    }
    _paint() {
      const g = this.g, R = this.R, dpr = this.dpr || 1;
      if (!this.cssW) return;
      const W = this.cssW, H = this.cssH;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      this._titleHits = [];
      if (!R) {
        this._paintAxis();
        this._paintOverview();
        this._measureBar();
        return;
      }
      const lanes = this._lanes();
      const band = this._bandH();
      const LH = this.laneH || 60;
      const pw = this._plotW();
      const t0 = this.t0, t1 = this.t0 + this.span;
      const step = niceStep(this.span, Math.max(2, pw / 110));
      const playT = this.playing ? this.playing.t : null;
      // the band at the top: rhythms, blocks, events and the cursors' handles
      g.fillStyle = '#f7f8fa';
      g.fillRect(0, 0, W, band);
      g.strokeStyle = '#e0e5ec';
      g.beginPath();
      g.moveTo(0, band - 0.5);
      g.lineTo(W, band - 0.5);
      g.stroke();
      lanes.forEach((L, i) => {
        const y0 = band + i * LH;
        this._paintLane(g, L, y0, LH, pw, t0, t1, step, playT);
      });
      // the breaks between blocks, events, the play head and the cursors, across all the lanes
      const yTop = band, yBot = band + LH * lanes.length;
      this._paintBand(g, band, W, pw, t0, t1, yTop, yBot);
      if (playT != null) {
        const x = this._xOf(playT);
        g.strokeStyle = 'rgba(201, 42, 42, 0.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, yTop);
        g.lineTo(x, yBot);
        g.stroke();
        g.lineWidth = 1;
      }
      this._paintCursors(g, band, yTop, yBot);
      this._paintAxis();
      this._paintOverview();
      this._measureBar();
    }
    _paintLane(g, L, y0, LH, pw, t0, t1, step, playT) {
      const R = this.R;
      const X0 = GUTTER;
      const [lo, hi] = this._range(L);
      const pad = 4;
      const yOf = (v) => y0 + pad + ((hi - v) / (hi - lo || 1)) * (LH - 2 * pad);
      // the lane's background and grid
      g.save();
      g.beginPath();
      g.rect(X0, y0, pw, LH);
      g.clip();
      const ecgPaper = L.kind === 'ecg' && /^mV$/i.test(L.units || '') && this._paper(g, L, y0, LH, pw, t0, t1, yOf);
      if (!ecgPaper) {
        g.strokeStyle = '#eef1f5';
        g.lineWidth = 1;
        g.beginPath();
        for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
          const x = Math.round(this._xOf(t)) + 0.5;
          g.moveTo(x, y0);
          g.lineTo(x, y0 + LH);
        }
        const ys = niceStep(hi - lo, Math.max(1, LH / 34));
        for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
          const y = Math.round(yOf(v)) + 0.5;
          g.moveTo(X0, y);
          g.lineTo(X0 + pw, y);
        }
        g.stroke();
        if (lo < 0 && hi > 0) {
          g.strokeStyle = '#d5dbe3';
          g.beginPath();
          const y = Math.round(yOf(0)) + 0.5;
          g.moveTo(X0, y);
          g.lineTo(X0 + pw, y);
          g.stroke();
        }
      }
      // the shading between the cursors
      if (this.A != null && this.B != null) {
        const a = this._xOf(Math.min(this.A, this.B)), b = this._xOf(Math.max(this.A, this.B));
        g.fillStyle = 'rgba(28, 126, 214, 0.07)';
        g.fillRect(a, y0, b - a, LH);
      }
      // the trace (only what has been "recorded" while playing)
      if (playT != null) {
        g.beginPath();
        g.rect(X0, y0, Math.max(0, this._xOf(playT) - X0), LH);
        g.clip();
      }
      if (L.key === 'hr') this._paintHR(g, yOf, t0, t1);
      else this._paintTrace(g, R.data[L.k], R.fs, yOf, KIND_COLOUR[L.kind] || L.c.color || KIND_COLOUR.other, t0, t1, pw);
      // the beats' labels, on the channel they were counted on
      if (R.beats && R.beats.channel === L.k && this.span <= 30 && R.beats.code) this._paintBeats(g, y0, t0, t1, playT);
      // events that belong to this channel (heart sounds, breaths)
      this._paintChanEvents(g, L, y0, LH, t0, t1, yOf);
      g.restore();
      // the lane's frame, scale and name
      g.strokeStyle = '#e0e5ec';
      g.beginPath();
      g.moveTo(0, y0 + LH - 0.5);
      g.lineTo(this.cssW, y0 + LH - 0.5);
      g.stroke();
      g.fillStyle = '#f7f8fa';
      g.fillRect(0, y0, GUTTER - 1, LH - 1);
      g.strokeStyle = '#e0e5ec';
      g.beginPath();
      g.moveTo(GUTTER - 0.5, y0);
      g.lineTo(GUTTER - 0.5, y0 + LH);
      g.stroke();
      g.fillStyle = '#647086';
      g.font = '10px system-ui, sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      const ys = niceStep(hi - lo, Math.max(1, LH / 30));
      const marks = [];
      for (let v = Math.ceil(lo / ys) * ys; v <= hi + 1e-9; v += ys) marks.push(v);
      marks.forEach((v) => {
        const y = yOf(v);
        if (y < y0 + 6 || y > y0 + LH - 6) return;
        g.fillText(fmtTick(v, ys), GUTTER - 5, y);
        g.fillRect(GUTTER - 3, Math.round(y), 3, 1);
      });
      // the name (a button: click it for the channel's menu)
      const label = L.name + (L.units ? ' · ' + L.units : '');
      g.font = '600 11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      const tw = Math.min(g.measureText(label).width, this._plotW() - 10);
      g.fillStyle = 'rgba(255, 255, 255, 0.86)';
      g.fillRect(GUTTER + 3, y0 + 2, tw + 8, 15);
      g.fillStyle = L.key === 'hr' ? KIND_COLOUR.hr : '#18212f';
      g.fillText(label, GUTTER + 7, y0 + 4, tw);
      this._titleHits.push({ x: GUTTER + 3, y: y0 + 2, w: tw + 8, h: 15, L });
      if (this.mch === L.key && this.A != null && this.B != null) {
        g.fillStyle = '#1c7ed6';
        g.fillRect(GUTTER + 3, y0 + 17, tw + 8, 2);
      }
    }
    /** an ECG lane drawn on ECG paper (1 mm = 0.04 s and 0.1 mV; 5 mm squares), when the squares are big enough */
    _paper(g, L, y0, LH, pw, t0, t1, yOf) {
      const pxS = pw / this.span; // px per second
      const pxMV = Math.abs(yOf(0) - yOf(1)); // px per mV
      const minor = pxS * 0.04 >= 4 && pxMV * 0.1 >= 4;
      const major = pxS * 0.2 >= 7 && pxMV * 0.5 >= 7;
      if (!major) return false;
      const [lo, hi] = this._range(L);
      const lines = (dt, dv, colour) => {
        g.strokeStyle = colour;
        g.beginPath();
        for (let t = Math.ceil(t0 / dt - 1e-6) * dt; t <= t1; t += dt) {
          const x = Math.round(this._xOf(t)) + 0.5;
          g.moveTo(x, y0);
          g.lineTo(x, y0 + LH);
        }
        for (let v = Math.ceil(lo / dv - 1e-6) * dv; v <= hi; v += dv) {
          const y = Math.round(yOf(v)) + 0.5;
          g.moveTo(GUTTER, y);
          g.lineTo(GUTTER + pw, y);
        }
        g.stroke();
      };
      g.lineWidth = 1;
      if (minor) lines(0.04, 0.1, '#fbe3e6');
      lines(0.2, 0.5, '#f3b9c0');
      return true;
    }
    _paintTrace(g, arr, fs, yOf, colour, t0, t1, pw) {
      const n = arr.length;
      const s0 = t0 * fs;
      const spp = (this.span * fs) / pw; // samples per css px
      g.strokeStyle = colour;
      g.lineWidth = 1.25;
      g.lineJoin = 'round';
      g.beginPath();
      let pen = false;
      if (spp <= 1.5) {
        const iA = Math.max(0, Math.floor(s0) - 1), iB = Math.min(n - 1, Math.ceil(t1 * fs) + 1);
        for (let i = iA; i <= iB; i++) {
          const v = arr[i];
          if (v !== v) {
            pen = false;
            continue;
          }
          const x = GUTTER + (i - s0) / spp, y = yOf(v);
          if (pen) g.lineTo(x, y);
          else {
            g.moveTo(x, y);
            pen = true;
          }
        }
      } else {
        for (let px = 0; px < pw; px++) {
          const a = Math.floor(s0 + px * spp), b = Math.floor(s0 + (px + 1) * spp);
          if (b <= 0 || a >= n) {
            pen = false;
            continue;
          }
          let lo = Infinity, hi = -Infinity;
          for (let i = Math.max(0, a), e = Math.min(n, Math.max(b, a + 1)); i < e; i++) {
            const v = arr[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          if (lo === Infinity) {
            pen = false;
            continue;
          }
          const x = GUTTER + px + 0.5;
          if (pen) g.lineTo(x, yOf(hi));
          else {
            g.moveTo(x, yOf(hi));
            pen = true;
          }
          if (lo !== hi) g.lineTo(x, yOf(lo));
        }
      }
      g.stroke();
      g.lineWidth = 1;
    }
    _paintHR(g, yOf, t0, t1) {
      const pts = (this.R.hr || []).filter((p) => p.t >= t0 - 5 && p.t <= t1 + 5);
      g.strokeStyle = KIND_COLOUR.hr;
      g.fillStyle = KIND_COLOUR.hr;
      g.lineWidth = 1.5;
      g.beginPath();
      let prev = null;
      pts.forEach((p) => {
        const x = this._xOf(p.t), y = yOf(p.v);
        // (a gap where beats are missing: no line across it)
        if (prev && p.t - prev.t <= Math.max(3, prev.rr * 2.2)) g.lineTo(x, y);
        else g.moveTo(x, y);
        prev = p;
      });
      g.stroke();
      const r = this.span <= 120 ? 2.4 : 1.4;
      pts.forEach((p) => {
        g.beginPath();
        g.arc(this._xOf(p.t), yOf(p.v), r, 0, Math.PI * 2);
        g.fill();
      });
      g.lineWidth = 1;
    }
    _paintBeats(g, y0, t0, t1, playT) {
      const B = this.R.beats;
      g.font = '600 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (let i = 0; i < B.t.length; i++) {
        const t = B.t[i];
        if (t < t0 || t > t1 || (playT != null && t > playT)) continue;
        const code = B.code[i] || '';
        const x = this._xOf(t);
        g.fillStyle = BEAT_COLOUR[code] || '#495057';
        g.fillText(code, x, y0 + 19);
      }
    }
    _paintChanEvents(g, L, y0, LH, t0, t1, yOf) {
      if (L.k < 0) return;
      const evs = this.R.events.filter((e) => e.channel === L.k && e.t >= t0 && e.t <= t1);
      if (!evs.length) return;
      const showText = this.span <= 12;
      g.font = '600 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      evs.forEach((e) => {
        const x = this._xOf(e.t);
        g.fillStyle = e.colour || '#e8590c';
        g.beginPath();
        g.moveTo(x - 4, y0 + LH - 12);
        g.lineTo(x + 4, y0 + LH - 12);
        g.lineTo(x, y0 + LH - 5);
        g.closePath();
        g.fill();
        if (showText && e.label) g.fillText(e.label, x, y0 + LH - 13);
      });
    }
    _paintBand(g, band, W, pw, t0, t1, yTop, yBot) {
      const R = this.R;
      const row2 = band - 18;
      g.save();
      g.beginPath();
      g.rect(GUTTER, 0, pw, yBot);
      g.clip();
      g.font = '600 10.5px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      // rhythms: a strip with their names
      R.rhythms.forEach((r) => {
        if (r.t1 < t0 || r.t0 > t1) return;
        const a = Math.max(GUTTER, this._xOf(r.t0)), b = Math.min(GUTTER + pw, this._xOf(r.t1));
        g.fillStyle = r.colour || '#e7f5ff';
        g.fillRect(a, 2, Math.max(1, b - a - 1), 14);
        g.fillStyle = '#1c3d5a';
        const txt = r.text || r.code;
        if (b - a > 30) g.fillText(txt, a + 4, 9, b - a - 8);
      });
      // blocks: where one ends and the next begins
      R.blocks.forEach((bl, k) => {
        const t = bl.start / R.fs;
        if (k > 0 && t >= t0 && t <= t1) {
          const x = Math.round(this._xOf(t));
          g.fillStyle = '#ffffff';
          g.fillRect(x - 3, yTop, 6, yBot - yTop);
          g.strokeStyle = '#868e96';
          g.beginPath();
          g.moveTo(x - 3.5, 0);
          g.lineTo(x - 3.5, yBot);
          g.moveTo(x + 3.5, 0);
          g.lineTo(x + 3.5, yBot);
          g.stroke();
        }
        if (bl.label) {
          const x = Math.max(GUTTER, this._xOf(t)) + (k > 0 ? 7 : 4);
          const end = k + 1 < R.blocks.length ? this._xOf(R.blocks[k + 1].start / R.fs) : GUTTER + pw;
          if (end - x > 30 && x < GUTTER + pw) {
            g.fillStyle = '#e9ecef';
            const tw = Math.min(g.measureText(bl.label).width, end - x - 8);
            g.fillRect(x - 2, 2, tw + 8, 14);
            g.fillStyle = '#343a40';
            g.fillText(bl.label, x + 2, 9, tw);
          }
        }
      });
      // events that belong to the whole recording: a flag, and a dashed line down the lanes
      R.events.forEach((e) => {
        if (e.channel != null || e.t < t0 || e.t > t1) return;
        const x = Math.round(this._xOf(e.t)) + 0.5;
        g.strokeStyle = 'rgba(232, 89, 12, 0.75)';
        g.setLineDash([4, 3]);
        g.beginPath();
        g.moveTo(x, row2);
        g.lineTo(x, yBot);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#e8590c';
        const tw = g.measureText(e.text).width;
        g.fillRect(x, row2 + 2, Math.min(tw + 8, GUTTER + pw - x), 14);
        g.fillStyle = '#fff';
        g.fillText(e.text, x + 4, row2 + 9);
      });
      g.restore();
    }
    _paintCursors(g, band, yTop, yBot) {
      const row2 = band - 18;
      const one = (t, colour, label) => {
        if (t == null || t < this.t0 || t > this.t0 + this.span) return;
        const x = Math.round(this._xOf(t)) + 0.5;
        g.strokeStyle = colour;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, row2 + 1);
        g.lineTo(x, yBot);
        g.stroke();
        g.lineWidth = 1;
        g.fillStyle = colour;
        g.beginPath();
        g.moveTo(x - 8, row2 + 1);
        g.lineTo(x + 8, row2 + 1);
        g.lineTo(x + 8, row2 + 12);
        g.lineTo(x, row2 + 17);
        g.lineTo(x - 8, row2 + 12);
        g.closePath();
        g.fill();
        g.fillStyle = '#fff';
        g.font = '700 10px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, x, row2 + 7.5);
      };
      one(this.A, '#1c7ed6', 'A');
      one(this.B, '#e8590c', 'B');
      one(this.M, '#2b8a3e', 'M');
    }
    _paintAxis() {
      const c = this.axis, g = c.getContext('2d'), dpr = this.dpr || 1;
      const W = c.width / dpr, H = c.height / dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#f7f8fa';
      g.fillRect(0, 0, W, H);
      if (!this.R) return;
      const pw = this._plotW();
      const step = niceStep(this.span, Math.max(2, pw / 110));
      g.strokeStyle = '#9aa6b5';
      g.fillStyle = '#384355';
      g.font = '11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.beginPath();
      g.moveTo(GUTTER, 0.5);
      g.lineTo(GUTTER + pw, 0.5);
      for (let t = Math.ceil(this.t0 / step - 1e-9) * step; t <= this.t0 + this.span + 1e-9; t += step) {
        const x = Math.round(this._xOf(t)) + 0.5;
        g.moveTo(x, 0);
        g.lineTo(x, 5);
        const lab = fmtT(t, step);
        if (x > GUTTER + 12 && x < GUTTER + pw - 8) g.fillText(lab, x, 7);
      }
      const sub = step / 5;
      if (pw / (this.span / sub) >= 6) {
        for (let t = Math.ceil(this.t0 / sub) * sub; t <= this.t0 + this.span; t += sub) {
          const x = Math.round(this._xOf(t)) + 0.5;
          g.moveTo(x, 0);
          g.lineTo(x, 3);
        }
      }
      g.stroke();
      g.textAlign = 'left';
      g.fillStyle = '#647086';
      g.fillText('time (s)', 4, 7, GUTTER - 6);
    }
    _paintOverview() {
      const c = this.ov, g = c.getContext('2d'), dpr = this.dpr || 1;
      const W = c.width / dpr, H = c.height / dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#eef1f5';
      g.fillRect(0, 0, W, H);
      const R = this.R;
      if (!R) return;
      const pw = this._plotW();
      const X = (t) => GUTTER + (t / R.duration) * pw;
      // the envelope of the first channel shown (drawn once for each size)
      const L = this._lanes().find((x) => x.key !== 'hr') || { k: 0, c: R.channels[0], short: R.channels[0].short };
      const key = R.id + '|' + L.k + '|' + pw + '|' + H;
      if (!this._ovCache || this._ovCache.key !== key) {
        const arr = R.data[L.k];
        const cols = [];
        let lo0 = Infinity, hi0 = -Infinity;
        for (let px = 0; px < pw; px++) {
          const a = Math.floor((px / pw) * arr.length), b = Math.max(a + 1, Math.floor(((px + 1) / pw) * arr.length));
          let lo = Infinity, hi = -Infinity;
          for (let i = a; i < b && i < arr.length; i++) {
            const v = arr[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          cols.push([lo, hi]);
          if (lo < lo0) lo0 = lo;
          if (hi > hi0) hi0 = hi;
        }
        const r = L.c && L.c.range ? L.c.range : [lo0, hi0];
        this._ovCache = { key, cols, r };
      }
      const { cols, r } = this._ovCache;
      const Y = (v) => 3 + ((r[1] - v) / (r[1] - r[0] || 1)) * (H - 6);
      g.strokeStyle = '#7b8798';
      g.beginPath();
      cols.forEach(([lo, hi], px) => {
        if (lo === Infinity) return;
        const x = GUTTER + px + 0.5;
        g.moveTo(x, clamp(Y(hi), 1, H - 1));
        g.lineTo(x, clamp(Y(lo), 1, H - 1) + 0.5);
      });
      g.stroke();
      R.blocks.slice(1).forEach((b) => {
        const x = Math.round(X(b.start / R.fs)) + 0.5;
        g.strokeStyle = '#495057';
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      });
      // the view
      const a = X(this.t0), b = X(this.t0 + this.span);
      g.fillStyle = 'rgba(11, 107, 138, 0.16)';
      g.fillRect(a, 0, Math.max(3, b - a), H);
      g.strokeStyle = '#0b6b8a';
      g.lineWidth = 1.5;
      g.strokeRect(a + 0.75, 0.75, Math.max(3, b - a) - 1.5, H - 1.5);
      g.lineWidth = 1;
      if (this.playing) {
        g.fillStyle = '#c92a2a';
        g.fillRect(X(this.playing.t) - 1, 0, 2, H);
      }
      g.fillStyle = '#647086';
      g.font = '10px system-ui, sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(R.duration < 100 ? Math.round(R.duration) + ' s' : (R.duration / 60).toFixed(1) + ' min', GUTTER - 6, H / 2, GUTTER - 8);
    }

    /* ---------------- the readout of the cursors ---------------- */
    _measLane() {
      const lanes = this._lanes();
      return lanes.find((L) => L.key === this.mch) || lanes.find((L) => L.key !== 'hr') || lanes[0];
    }
    /** the measurement between the cursors (or null) */
    measurement() {
      if (!this.R || this.A == null || this.B == null) return null;
      const L = this._measLane();
      if (!L) return null;
      const a = Math.min(this.A, this.B), b = Math.max(this.A, this.B);
      const y1 = this._valueAt(L, this.A), y2 = this._valueAt(L, this.B);
      const dt = b - a;
      const st = this._stats(L, a, b);
      const breaks = this.R.blocks.slice(1).some((bl) => bl.start / this.R.fs > a && bl.start / this.R.fs < b);
      return {
        lane: L, channel: L.short, name: L.name, units: L.units, t1: this.A, t2: this.B, dt, y1, y2, dy: y2 - y1,
        rate: dt > 0 ? 60 / dt : NaN, hz: dt > 0 ? 1 / dt : NaN, stats: st, breaks, interval: this._interval(L, a, b)
      };
    }
    /** what the interval between the cursors is: as chosen in the menu beside the Data pad button, else a guess */
    _interval(L, a, b) {
      const key = [this.R.id, this.A, this.B, L.key].join('|');
      if (this.ivPick && this.ivPick.key === key) return this.ivPick.v;
      return this._guessInterval(L, a, b);
    }
    /** a guess at what an interval from a to b (s) is, from the beats of an ECG: R-R when the cursors lie on two R waves
        one after the other; QRS when they hold one R wave closely; PR when the second lies at the start of a QRS; QT when
        the first does and the second is well before the next beat; else other */
    _guessInterval(L, a, b) {
      const B = this.R && this.R.beats;
      if (!L || L.kind !== 'ecg' || !B || !Array.isArray(B.t) || B.t.length < 2) return 'other';
      const t = B.t, dt = b - a;
      const ia = nearestIndex(t, a), ib = nearestIndex(t, b);
      if (ib === ia + 1 && Math.abs(t[ia] - a) <= 0.06 && Math.abs(t[ib] - b) <= 0.06) return 'R-R';
      let k = nearestIndex(t, a);
      while (k > 0 && t[k] > a) k--;
      while (k < t.length && t[k] <= a) k++;
      const inside = [];
      for (let i = k; i < t.length && t[i] < b; i++) inside.push(i);
      if (dt <= 0.16 && inside.length === 1 && t[inside[0]] - a <= 0.12 && b - t[inside[0]] <= 0.12) return 'QRS';
      // (the R wave whose QRS starts near a time: the QRS starts up to about 0.12 s before the peak of the R wave)
      const qrsAt = (x) => {
        const i = nearestIndex(t, x);
        return i >= 0 && x >= t[i] - 0.13 && x <= t[i] + 0.03 ? i : -1;
      };
      const ib2 = qrsAt(b);
      if (dt >= 0.06 && dt <= 0.35 && ib2 >= 0 && inside.every((i) => t[i] >= b - 0.03)) return 'PR';
      const ia2 = qrsAt(a);
      if (dt >= 0.2 && dt <= 0.7 && ia2 >= 0 && (ia2 + 1 >= t.length || t[ia2 + 1] > b + 0.05)) return 'QT';
      return 'other';
    }
    _measureBar() {
      const B = this.mbar;
      if (!B) return;
      // (redrawn only when what it shows changes: not at every frame of playing or scrolling)
      const key = [this.R && this.R.id, this.A, this.B, this.M, this.mch, this.toolName, this.ivPick && this.ivPick.key + this.ivPick.v, this._lanes().map((L) => L.key).join()].join('|');
      if (key === this._mkey) return;
      this._mkey = key;
      // (its height can change, and in a narrow pane the side panel lies below it)
      queueMicrotask(() => this._placeSide());
      const padAdd = this.sideBody && this.sideBody.querySelector('.rc-padadd');
      if (padAdd) padAdd.disabled = !this.measurement();
      B.innerHTML = '';
      if (!this.R) {
        B.appendChild(h('span.rc-hint', 'Open a recording from the list.'));
        return;
      }
      const m = this.measurement();
      if (!m) {
        const hint = this.toolName === 'calipers'
          ? (this.A != null ? 'Now click where the measurement ends (or drag across the trace).' : 'Drag across the trace, or click at each end of what you want to measure.')
          : this.toolName === 'marker'
            ? (this.M != null ? 'The readout by the pointer measures from the marker (M).' : 'Click on the trace to put down a marker.')
            : 'Drag the trace to move along it. To measure, choose the Calipers.';
        B.appendChild(h('span.rc-hint', hint));
        if (this.A != null || this.M != null) B.appendChild(this._clearBtn());
        return;
      }
      const sel = h('select.rc-sel.rc-mch', { 'aria-label': 'The channel to measure' }, this._lanes().map((L) => h('option', { value: L.key, selected: L.key === m.lane.key }, L.short)));
      sel.addEventListener('change', () => {
        this.mch = sel.value;
        this._draw();
      });
      const u = m.units ? ' ' + m.units : '';
      const vals = [h('span.rc-mv', h('i', 'Δt'), h('b', fmtDt(m.dt)))];
      // the rate the interval corresponds to (not for a PR, QRS or QT: those do not repeat), in Hz as well for a short one
      if (HAS_RATE(m.interval) && isFinite(m.rate)) {
        const r = [h('i', 'rate'), h('b', fmtRate(m.rate) + ' /min')];
        if (m.dt < 2) r.push(h('i', '='), h('b.rc-hz', fmtHz(m.hz) + ' Hz'));
        vals.push(h('span.rc-mv', { title: 'The rate this interval corresponds to: 60 ÷ Δt per minute, or 1 ÷ Δt per second (Hz)' }, r));
      }
      vals.push(h('span.rc-mv.rc-ch', sel));
      vals.push(h('span.rc-mv', h('i', 'Δ'), h('b', fmtV(m.dy) + u)));
      if (m.stats) vals.push(h('span.rc-mv.rc-more', h('i', 'min'), h('b', fmtV(m.stats.min)), h('i', 'max'), h('b', fmtV(m.stats.max)), h('i', 'mean'), h('b', fmtV(m.stats.mean) + u)));
      if (m.breaks) vals.push(h('span.rc-warn', 'across a break between two parts'));
      // what the interval is (a guess, which can be changed): the data pad keeps it with the measurement
      const iv = h('select.rc-sel.rc-iv', { 'aria-label': 'What you measured', title: 'What you measured: the data pad keeps it with the measurement, and works out the heart rate from the R–R intervals only' },
        INTERVALS.map(([v, l, t]) => h('option', { value: v, selected: v === m.interval, title: t }, l)));
      iv.addEventListener('change', () => {
        this.ivPick = { key: [this.R.id, this.A, this.B, m.lane.key].join('|'), v: iv.value };
        this._draw();
      });
      const add = h('button.tbtn.rc-add', { type: 'button', title: 'Add this measurement to the data pad (Enter)', html: I('plus') + '<span>Data pad</span>' });
      add.addEventListener('click', () => this.addToPad());
      B.append(h('span.rc-mvals', vals), h('span.rc-mbtns', iv, add, this._clearBtn()));
    }
    _clearBtn() {
      const b = h('button.rc-ib.sm', { type: 'button', title: 'Clear the cursors (Esc)', 'aria-label': 'Clear the cursors', html: I('x') });
      b.addEventListener('click', () => this.clearCursors());
      return b;
    }
    clearCursors() {
      this.A = this.B = this.M = null;
      this.ivPick = null;
      this._draw();
    }
    /** put the cursors at two times (seconds) and measure (for the tests and the instructions) */
    setCursors(a, b, lane) {
      if (!this.R) return null;
      this.A = clamp(a, 0, this.R.duration);
      this.B = b == null ? null : clamp(b, 0, this.R.duration);
      this.ivPick = null;
      if (lane) {
        const L = this._lanes().find((x) => x.short === lane || x.key === lane);
        if (L) this.mch = L.key;
      }
      this._draw();
      if (this.B != null) this._emitMeasure();
      return this.measurement();
    }
    _emitMeasure() {
      const m = this.measurement();
      if (!m) return;
      bus.emit('rec:measure', {
        id: this.R.id, kind: 'interval', channel: m.channel, signal: m.lane.kind, interval: m.interval,
        t1: +Math.min(m.t1, m.t2).toFixed(4), t2: +Math.max(m.t1, m.t2).toFixed(4), dt: +m.dt.toFixed(4), dy: num(m.dy),
        rate: +m.rate.toFixed(2), hz: +(+m.hz).toPrecision(4), units: m.units || ''
      });
    }
    /** the marker is put down: the event of a point */
    _emitPoint() {
      if (!this.R || this.M == null) return;
      const L = this._lanes().find((x) => x.key === this.mlane) || this._measLane();
      if (!L) return;
      bus.emit('rec:measure', { id: this.R.id, kind: 'point', channel: L.short, signal: L.kind, t: +this.M.toFixed(4), value: num(this._valueAt(L, this.M)), units: L.units || '' });
    }

    /* ---------------- the data pad ---------------- */
    /** add the measurement between the cursors to the data pad (interval: what it is; else as the bar shows it) */
    addToPad(interval) {
      const m = this.measurement();
      if (!m) {
        toast('Put the two cursors on the trace first: choose the Calipers and drag across what you want to measure.', 'warn', 5000);
        return null;
      }
      const R = this.R;
      const row = {
        id: uid(), rec: R.id, title: R.title, channel: m.channel, kind: IV_OK(interval) ? interval : m.interval, units: m.units || '',
        t1: +Math.min(m.t1, m.t2).toFixed(4), t2: +Math.max(m.t1, m.t2).toFixed(4), dt: +m.dt.toFixed(4),
        y1: num(m.t1 <= m.t2 ? m.y1 : m.y2), y2: num(m.t1 <= m.t2 ? m.y2 : m.y1), dy: num(m.t1 <= m.t2 ? m.dy : -m.dy),
        min: m.stats ? num(m.stats.min) : null, max: m.stats ? num(m.stats.max) : null, mean: m.stats ? num(m.stats.mean) : null,
        rate: +m.rate.toFixed(2), comment: '', time: nowISO()
      };
      this.st.pad.push(row);
      this._save();
      this._mirror();
      this._emitPad(row);
      if (this.st.side === 'datapad' && !this.side.hidden) this._renderSide();
      else {
        const tid = 'rcp' + uid();
        toast(`Added to the data pad as ${IV_TEXT[row.kind]} (${this.st.pad.length} row${this.st.pad.length === 1 ? '' : 's'}). <button class="linkbtn" type="button" id="${tid}">Show it</button>`, 'ok', 3500);
        setTimeout(() => {
          const b = document.getElementById(tid);
          if (b) b.addEventListener('click', () => this.showSide('datapad'));
        }, 0);
      }
      return row;
    }
    /** a row of the data pad is added, or its interval changed */
    _emitPad(row) {
      const own = this.st.pad.filter((r) => r.rec === row.rec);
      const count = (k) => own.filter((r) => padKind(r) === k).length;
      bus.emit('rec:datapad', {
        id: row.rec, n: this.st.pad.length, channel: row.channel, interval: padKind(row), dt: row.dt, rate: row.rate,
        n_rr: count('R-R'), n_pr: count('PR'), n_qrs: count('QRS'), n_qt: count('QT'), n_other: count('other')
      });
    }
    /** the data pad as CSV text: one row for each measurement */
    _padCsv() {
      const rows = [['recording', 'channel', 'kind', 'units', 't1_s', 't2_s', 'dt_s', 'rate_per_min', 'freq_hz', 'value1', 'value2', 'change', 'min', 'max', 'mean', 'comment', 'time']];
      this.st.pad.forEach((r) => {
        const k = padKind(r);
        const rated = HAS_RATE(k) && r.dt > 0;
        rows.push([r.rec, r.channel, k, r.units, r.t1, r.t2, r.dt, rated ? r.rate : null, rated ? +(1 / r.dt).toPrecision(4) : null, r.y1, r.y2, r.dy, r.min, r.max, r.mean, r.comment, r.time]);
      });
      return rows.map((r) => r.map((v) => csvCell(v == null || (typeof v === 'number' && !isFinite(v)) ? 'NA' : v)).join(',')).join('\n') + '\n';
    }
    /** show the data pad's file in Files */
    showPadFile() {
      this._writePad();
      if (!this.fs.exists(DIR() + '/measurements.csv')) return toast('The data pad is empty: add a measurement to it first.', 'warn');
      MG.app.editFile(DIR() + '/measurements.csv');
    }
    _writePad() {
      const fs = this.fs;
      const p = DIR() + '/measurements.csv';
      try {
        if (!this.st.pad.length && !fs.exists(p)) return;
        const text = this._padCsv();
        if (this._lastPad === text && fs.exists(p)) return;
        fs.mkdirp(DIR());
        fs.writeText(p, text);
        this._lastPad = text;
      } catch (e) {
        console.error(e);
      }
    }

    /* ---------------- the heart rate, sound, speed ---------------- */
    setHR(on) {
      const R = this.R;
      if (!R) return;
      if (!R.hr) {
        if (on) toast('This recording has no heartbeats to count.', 'warn');
        return;
      }
      this.st.hr[R.id] = !!on;
      this._save();
      this._refreshTitle();
      this._resize();
      this._renderSide();
      bus.emit('rec:hr', { id: R.id, on: !!on });
    }
    setSpeed(x) {
      if (!SPEEDS.includes(x)) return;
      this.st.speed = x;
      this.speedSel.value = String(x);
      this._save();
      if (this.playing) {
        const t = this.playing.t;
        this.stop(true);
        this.play(t);
      }
    }
    setListen(on) {
      const R = this.R;
      if (on && !(R && R.audioCh >= 0)) {
        toast('This recording has no sound to listen to: the heart sounds and the EMG recordings do.', 'warn', 5000);
        return;
      }
      this.st.listen = !!on;
      this._save();
      this._refreshTitle();
      if (this.playing) {
        if (on) this._startAudio(this.playing.t);
        else this._stopAudio();
      }
      if (R) bus.emit('rec:listen', { id: R.id, on: !!on });
      if (on && !this.playing) toast('Press <b>Play</b> to hear it. (Headphones help.)', null, 3500);
    }

    /* ---------------- playing ---------------- */
    /** play from a time (default: the start of the view, or the start of the recording if the view is at its end) */
    play(from) {
      const R = this.R;
      if (!R) return toast('Open a recording first.', 'warn');
      if (this.playing) this.stop(true);
      this._closeOverlays();
      let t = from != null ? from : this.t0;
      if (t >= R.duration - 0.05) t = 0;
      const speed = this.st.speed || 1;
      this._hideHover();
      this.playing = { t, t0: t, start: performance.now(), speed };
      if (from == null && t !== this.t0) this._setView(t, this.span, true);
      this.playBtn.classList.add('on');
      this.playBtn.innerHTML = I('stopsq') + '<span>Stop</span>';
      this.playBtn.title = 'Stop (space)';
      this.root.classList.add('rc-playing');
      if (this.st.listen && R.audioCh >= 0) this._startAudio(t);
      bus.emit('rec:play', { id: R.id, on: true, speed });
      const step = () => {
        const P = this.playing;
        if (!P) return;
        P.t = P.t0 + ((performance.now() - P.start) / 1000) * P.speed;
        if (P.t >= R.duration) {
          P.t = R.duration;
          this._follow(P.t);
          this.stop();
          return;
        }
        this._follow(P.t);
        P.raf = requestAnimationFrame(step);
      };
      this.playing.raf = requestAnimationFrame(step);
    }
    /** while playing, the view follows the pen, as a chart recorder's paper does */
    _follow(t) {
      if (t > this.t0 + this.span) this.t0 = Math.min(this.R.duration - this.span, t - this.span);
      else if (t < this.t0) this.t0 = Math.max(0, t);
      this.st.views[this.R.id] = { t0: +this.t0.toFixed(4), span: this.span };
      this._paint();
    }
    stop(quiet) {
      const P = this.playing;
      if (!P) return;
      cancelAnimationFrame(P.raf);
      this.playing = null;
      this._stopAudio();
      this.playBtn.classList.remove('on');
      this.playBtn.innerHTML = I('play') + '<span>Play</span>';
      this.playBtn.title = 'Play the recording in real time, as if it were being recorded (space)';
      this.root.classList.remove('rc-playing');
      this._save();
      this._draw();
      if (!quiet && this.R) {
        bus.emit('rec:play', { id: this.R.id, on: false, speed: P.speed });
        this._viewEv();
      }
    }
    _audioBuffer() {
      const R = this.R;
      if (this._abuf && this._abuf.id === R.id) return this._abuf.buf;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this._actx = this._actx || new Ctx();
      const src = R.data[R.audioCh];
      const k = Math.max(1, Math.ceil(8000 / R.fs)); // (browsers play from 8000 samples a second)
      const n = src.length * k;
      const buf = this._actx.createBuffer(1, n, R.fs * k);
      const out = buf.getChannelData(0);
      let peak = 0, mean = 0, cnt = 0;
      for (let i = 0; i < src.length; i++) if (src[i] === src[i]) ((mean += src[i]), cnt++);
      mean = cnt ? mean / cnt : 0;
      for (let i = 0; i < src.length; i++) if (src[i] === src[i]) peak = Math.max(peak, Math.abs(src[i] - mean));
      const g = peak ? 0.85 / peak : 1;
      for (let i = 0; i < src.length; i++) {
        const a = src[i] === src[i] ? (src[i] - mean) * g : 0;
        const b = i + 1 < src.length && src[i + 1] === src[i + 1] ? (src[i + 1] - mean) * g : a;
        for (let j = 0; j < k; j++) out[i * k + j] = a + ((b - a) * j) / k;
      }
      this._abuf = { id: R.id, buf };
      return buf;
    }
    _startAudio(t) {
      this._stopAudio();
      try {
        const buf = this._audioBuffer();
        if (!buf) return;
        if (this._actx.state === 'suspended') this._actx.resume();
        const s = this._actx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = this.st.speed || 1;
        s.connect(this._actx.destination);
        s.start(0, Math.max(0, t));
        this._asrc = s;
      } catch (e) {
        console.warn('sound', e);
      }
    }
    _stopAudio() {
      if (this._asrc) {
        try {
          this._asrc.stop();
        } catch (e) {
          /* (already stopped) */
        }
        this._asrc = null;
      }
    }

    /* ---------------- the mouse, touch and keys ---------------- */
    _pointer() {
      const cv = this.cv;
      const pts = new Map();
      let drag = null;
      const local = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const laneAt = (y) => {
        const i = Math.floor((y - this._bandH()) / (this.laneH || 60));
        return this._lanes()[i] || null;
      };
      // the cursors move only by their flags, in the band above the lanes (a drag anywhere else on the trace starts a
      // new measurement – even one that starts where the last one ended)
      const handleAt = (p, touch) => {
        const row2 = this._bandH() - 18;
        if (p.y > row2 + 18) return null;
        const reach = touch ? 14 : 9;
        let best = null, bd = Infinity;
        for (const k of ['B', 'A', 'M']) {
          if (this[k] == null) continue;
          const d = Math.abs(this._xOf(this[k]) - p.x);
          if (d <= reach && d < bd) {
            best = k;
            bd = d;
          }
        }
        return best;
      };
      cv.addEventListener('pointerdown', (e) => {
        if (!this.R || (e.pointerType === 'mouse' && e.button !== 0)) return;
        // (a narrow pane: the panel over the chart closes when the chart is used again)
        this._closeOverlays();
        pts.set(e.pointerId, local(e));
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (err) {
          /* (a pointer that has already gone) */
        }
        this.chart.focus({ preventScroll: true });
        if (pts.size === 2) {
          // two fingers: zoom
          const [a, b] = [...pts.values()];
          drag = { kind: 'pinch', d0: Math.abs(a.x - b.x) || 1, span0: this.span, c: this._tOf((a.x + b.x) / 2) };
          return;
        }
        const p = local(e);
        if (this.playing) this.stop();
        const hit = this._titleHits.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
        const hk = handleAt(p, e.pointerType !== 'mouse');
        // (a menu's choice of what was measured holds for those cursors only: moved or new ones are guessed again)
        if (hk !== 'M' && (hk || this.toolName === 'calipers')) this.ivPick = null;
        if (hk) drag = { kind: 'cursor', which: hk, x0: p.x, moved: false };
        else if (hit) drag = { kind: 'title', L: hit.L, x0: p.x, y0: p.y, moved: false };
        else if (this.toolName === 'calipers') {
          const t = clamp(this._tOf(p.x), 0, this.R.duration);
          const L = laneAt(p.y);
          drag = { kind: 'calipers', x0: p.x, t, lane: L, moved: false, first: this.A == null || this.B != null };
        } else if (this.toolName === 'marker') {
          drag = { kind: 'marker', x0: p.x, moved: false };
          this.M = clamp(this._tOf(p.x), 0, this.R.duration);
          const L = laneAt(p.y);
          if (L) this.mlane = L.key;
          this._draw();
        } else drag = { kind: 'pan', x0: p.x, t0: this.t0, moved: false };
        e.preventDefault();
      });
      cv.addEventListener('pointermove', (e) => {
        const p = local(e);
        if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
        if (!drag) {
          this._hover(p, e);
          return;
        }
        if (drag.kind === 'pinch' && pts.size >= 2) {
          const [a, b] = [...pts.values()];
          const d = Math.abs(a.x - b.x) || 1;
          const ns = clamp((drag.span0 * drag.d0) / d, this._minSpan(), this.R.duration);
          const k = ((a.x + b.x) / 2 - GUTTER) / this._plotW();
          this._setView(drag.c - k * ns, ns);
          return;
        }
        if (Math.abs(p.x - drag.x0) > 3) drag.moved = true;
        if (!drag.moved) return;
        const t = clamp(this._tOf(p.x), 0, this.R.duration);
        if (drag.kind === 'pan') this._setView(drag.t0 - ((p.x - drag.x0) / this._plotW()) * this.span, this.span);
        else if (drag.kind === 'cursor') {
          this[drag.which] = t;
          this._draw();
        } else if (drag.kind === 'calipers') {
          this.A = drag.t;
          this.B = t;
          if (drag.lane) this.mch = drag.lane.key;
          this._draw();
        } else if (drag.kind === 'marker') {
          this.M = t;
          this._draw();
        }
        this._hover(p, e);
      });
      const end = (e) => {
        const p = local(e);
        pts.delete(e.pointerId);
        if (!drag) return;
        const d = drag;
        if (d.kind === 'pinch') {
          if (pts.size < 2) drag = null;
          return;
        }
        drag = null;
        // (a finger leaves no pointer behind: the readout goes after a moment)
        if (e.pointerType !== 'mouse') {
          clearTimeout(this._tipT);
          this._tipT = setTimeout(() => this._hideHover(), 1800);
        }
        if (e.type === 'pointercancel') return;
        if (d.kind === 'title' && !d.moved) return this._chanMenu(d.L, e.clientX, e.clientY);
        if (d.kind === 'calipers') {
          if (d.moved && this.B != null && Math.abs(this.B - this.A) > 1e-4) this._emitMeasure();
          else if (!d.moved) {
            // a click: the first end, then the second
            const t = clamp(this._tOf(p.x), 0, this.R.duration);
            if (d.first) {
              this.A = t;
              this.B = null;
            } else {
              this.B = t;
              if (Math.abs(this.B - this.A) > 1e-4) this._emitMeasure();
            }
            if (d.lane) this.mch = d.lane.key;
            this._draw();
          }
        } else if (d.kind === 'cursor' && d.moved && (d.which === 'A' || d.which === 'B') && this.A != null && this.B != null) this._emitMeasure();
        else if ((d.kind === 'cursor' && d.moved && d.which === 'M') || d.kind === 'marker') this._emitPoint();
        else if (d.kind === 'pan' && !d.moved && this.toolName === 'pan') this._hover(p, e);
        this._measureBar();
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && !drag) this._hideHover();
      });
      // the wheel: Ctrl (or a pinch on a touchpad) zooms; otherwise it moves along the recording – unless the lanes are
      // taller than the view, when it scrolls them up and down (Shift+wheel moves along the recording)
      cv.addEventListener('wheel', (e) => {
        if (!this.R) return;
        const p = local(e);
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.zoom(Math.exp(e.deltaY * 0.0025), this._tOf(p.x));
          return;
        }
        const overflow = this.scroller.scrollHeight > this.scroller.clientHeight + 2;
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey || !overflow ? e.deltaY : 0;
        if (!dx) return;
        e.preventDefault();
        if (this.playing) this.stop();
        this._setView(this.t0 + (dx / this._plotW()) * this.span * (e.deltaMode === 1 ? 16 : 1), this.span);
      }, { passive: false });
      // the overview: click or drag to move the view there
      let ovDrag = false;
      const ovGo = (e) => {
        const r = this.ov.getBoundingClientRect();
        const t = ((e.clientX - r.left - GUTTER) / this._plotW()) * this.R.duration;
        this._setView(t - this.span / 2, this.span);
      };
      this.ov.addEventListener('pointerdown', (e) => {
        if (!this.R) return;
        this._closeOverlays();
        if (this.playing) this.stop();
        ovDrag = true;
        try {
          this.ov.setPointerCapture(e.pointerId);
        } catch (err) {
          /* */
        }
        ovGo(e);
      });
      this.ov.addEventListener('pointermove', (e) => ovDrag && ovGo(e));
      this.ov.addEventListener('pointerup', () => (ovDrag = false));
      this.ov.addEventListener('pointercancel', () => (ovDrag = false));
      this.scroller.addEventListener('scroll', () => this._hideHover());
    }
    _hover(p, e) {
      if (!this.R || p.x < GUTTER || p.x > GUTTER + this._plotW()) return this._hideHover();
      const lanes = this._lanes();
      const i = Math.floor((p.y - this._bandH()) / (this.laneH || 60));
      const L = lanes[i];
      if (!L) return this._hideHover();
      const t = this._tOf(p.x);
      if (t < 0 || t > this.R.duration) return this._hideHover();
      const v = this._valueAt(L, t);
      let txt = `${fmtT(t, niceStep(this.span, 40))} s · ${L.short} ${fmtV(v)}${L.units ? ' ' + L.units : ''}`;
      if (this.M != null) {
        const dt = t - this.M;
        const vm = this._valueAt(L, this.M);
        txt += ` · from M: Δt ${fmtDt(Math.abs(dt))}${Math.abs(dt) > 0.02 ? ', ' + fmtRate(60 / Math.abs(dt)) + ' /min' : ''}, Δ ${fmtV(v - vm)}`;
      }
      // what is there: a beat or an event
      const near = (t2) => Math.abs(this._xOf(t2) - p.x) <= 6;
      const B = this.R.beats;
      if (B && B.code && L.k === B.channel) {
        const j = nearestIndex(B.t, t);
        if (j >= 0 && near(B.t[j]) && B.legend && B.legend[B.code[j]]) txt += ` · ${B.code[j]}: ${B.legend[B.code[j]]}`;
      }
      const ev = this.R.events.find((x) => (x.channel == null || x.channel === L.k) && near(x.t));
      if (ev) txt += ' · ' + (ev.title || ev.text || ev.label);
      this.tip.textContent = txt;
      this.tip.hidden = false;
      const cr = this.chart.getBoundingClientRect(), vr = this.cv.getBoundingClientRect();
      const x = vr.left - cr.left + p.x, y = vr.top - cr.top + p.y;
      const tw = this.tip.offsetWidth;
      this.tip.style.left = clamp(x + 12, 4, cr.width - tw - 4) + 'px';
      this.tip.style.top = clamp(y - 30, 2, cr.height - 26) + 'px';
      this.hair.hidden = false;
      this.hair.style.left = p.x + 'px';
      this.hair.style.height = this.cssH + 'px';
    }
    _hideHover() {
      this.tip.hidden = true;
      this.hair.hidden = true;
    }
    _key(e) {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.target.closest('.rc-chart, .rc-bar, .rc-mbar')) return;
      const k = e.key;
      let done = true;
      if (k === 'ArrowRight') this.scrollBy(e.shiftKey ? 0.9 : 0.1);
      else if (k === 'ArrowLeft') this.scrollBy(e.shiftKey ? -0.9 : -0.1);
      else if (k === '+' || k === '=') this.zoom(0.5);
      else if (k === '-' || k === '_') this.zoom(2);
      else if (k === ' ' && !e.target.closest('button')) this.playing ? this.stop() : this.play();
      else if (k === 'Home') this.R && this._setView(0, this.span);
      else if (k === 'End') this.R && this._setView(this.R.duration, this.span);
      else if (k === 'c' || k === 'C') this.tool('calipers');
      else if (k === 'm' || k === 'M') this.tool('marker');
      else if (k === 'p' || k === 'P') this.tool('pan');
      else if (k === 'h' || k === 'H') this.setHR(!this._hrOn());
      else if (k === 'Enter' && this.A != null && this.B != null && !e.target.closest('button')) this.addToPad();
      else if (k === 'Escape') {
        if (this.A != null || this.M != null) this.clearCursors();
        else if (this.toolName !== 'pan') this.tool('pan');
        else done = false;
      } else done = false;
      if (done) e.preventDefault();
    }

    /* ---------------- a channel's menu ---------------- */
    _chanMenu(L, cx, cy) {
      const anchor = h('span', { style: { position: 'fixed', left: cx + 'px', top: cy + 'px', width: '1px', height: '1px' } });
      document.body.appendChild(anchor);
      setTimeout(() => anchor.remove(), 100);
      const items = [
        ['maximize', 'Fit the scale to the screen', () => this.autoscale(L)],
        ['ruler', 'Set the scale…', () => this._askRange(L)],
        ['reset', 'The usual scale', () => this._setRange(L, null)],
        ['target', 'Measure this channel', () => {
          this.mch = L.key;
          this._draw();
        }]
      ];
      if (L.key === 'hr') items.push(['eyeOff', 'Hide the heart rate', () => this.setHR(false)]);
      else items.push(['eyeOff', 'Hide this channel', () => this.setHidden(L.short, true)]);
      items.push(['chart', 'All the channels…', () => this.showSide('channels')]);
      MG.popmenu(anchor, items);
    }
    async _askRange(L) {
      const [lo, hi] = this._range(L);
      const t = await MG.promptText('The scale of ' + L.name, `The lowest and highest values to show, in ${L.units || 'its units'}, separated by a comma:`, `${fmtV(lo)}, ${fmtV(hi)}`, 'Set');
      if (!t) return;
      const m = t.split(/[,;\s]+/).map(Number).filter((x) => isFinite(x));
      if (m.length !== 2 || m[0] === m[1]) return toast('Give two different numbers, such as -1, 2.', 'warn');
      this._setRange(L, Math.min(m[0], m[1]), Math.max(m[0], m[1]));
    }
    setHidden(short, hide) {
      const R = this.R;
      if (!R) return;
      const set = new Set(this.st.hidden[R.id] || []);
      if (hide) set.add(short);
      else set.delete(short);
      if (set.size >= R.channels.length && !this._hrOn()) return toast('At least one channel has to be shown.', 'warn');
      this.st.hidden[R.id] = [...set];
      this._save();
      this._resize();
      this._renderSide();
    }

    /* ---------------- the side panel ---------------- */
    showSide(id, quiet) {
      this.st.side = id;
      if (!quiet) this._save();
      if (id && !quiet) bus.emit('rec:panel', { name: id });
      this.side.hidden = !id;
      Object.entries(this.sideTabs).forEach(([k, b]) => {
        b.classList.toggle('on', k === id);
        b.setAttribute('aria-selected', k === id ? 'true' : 'false');
      });
      this.padBtn.classList.toggle('on', id === 'datapad');
      this.chBtn.classList.toggle('on', id === 'channels');
      this._placeSide();
      this._renderSide();
      setTimeout(() => this._resize(), 20);
    }
    /** in a narrow pane the side panel lies over the chart, below the readout of the cursors: that stays in sight, with
        the menu of what was measured and the Data pad button */
    _placeSide() {
      if (!this.side || !this.mbar) return;
      const top = this._narrow() ? this.mbar.offsetHeight : 0;
      this.side.style.top = top ? top + 'px' : '';
    }
    _renderSide() {
      const id = this.st.side;
      if (!id || this.side.hidden) return;
      const B = this.sideBody;
      const keep = B.scrollTop;
      B.innerHTML = '';
      if (id === 'about') this._sideAbout(B);
      else if (id === 'datapad') this._sidePad(B);
      else if (id === 'channels') this._sideChannels(B);
      B.scrollTop = keep;
    }
    _sideAbout(B) {
      const R = this.R;
      if (!R) return B.appendChild(h('p.rc-none', 'Choose a recording from the list.'));
      B.appendChild(h('h3', R.title));
      if (R.description) B.appendChild(h('p', R.description));
      if (Array.isArray(R.look_for) && R.look_for.length) {
        B.appendChild(h('h4', 'Look for'));
        B.appendChild(h('ul.rc-look', R.look_for.map((t) => h('li', t))));
      }
      const meta = [];
      const sub = R.subject || {};
      const who = [sub.age != null ? sub.age + ' years old' : '', sub.sex || ''].filter(Boolean).join(', ');
      if (who) meta.push(['Who', who]);
      if (sub.notes) meta.push(['Notes', sub.notes]);
      meta.push(['Length', durText(R.duration)]);
      meta.push(['Samples', `${fmtRate(R.fs)} a second, for each channel`]);
      B.appendChild(h('dl.rc-meta', meta.map(([k, v]) => [h('dt', k), h('dd', v)])));
      B.appendChild(h('h4', 'Channels'));
      B.appendChild(h('ul.rc-look', R.channels.map((c) => h('li', h('b', c.name), c.units ? ` (${c.units})` : '', c.about ? ' – ' + c.about : ''))));
      if (R.beats && R.beats.legend) {
        B.appendChild(h('h4', 'The labels of the beats'));
        const p = h('p.rc-note', R.beats.note || '');
        B.appendChild(p);
        B.appendChild(h('dl.rc-meta.rc-codes', Object.entries(R.beats.legend).map(([k, v]) => [h('dt', h('b', { style: { color: BEAT_COLOUR[k] || '#495057' } }, k)), h('dd', v)])));
      } else if (R.beats && R.beats.note) B.appendChild(h('p.rc-note', R.beats.note));
      const src = R.source || {};
      if (src.database) {
        B.appendChild(h('h4', 'Where it comes from'));
        const p = h('p.rc-credit');
        p.innerHTML = `${esc(src.excerpt || '')} <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.database)}</a>${src.version ? ' (version ' + esc(src.version) + ')' : ''}, record <code>${esc(src.record)}</code>, PhysioNet. Licence: <a href="${esc(src.licence_url || '#')}" target="_blank" rel="noopener">${esc(src.licence || '')}</a>.`;
        B.appendChild(p);
        if (src.changes) B.appendChild(h('p.rc-note', 'What was changed: ' + src.changes));
        const cites = [src.cite_database, src.cite_original, src.cite_physionet].filter(Boolean);
        if (cites.length) {
          B.appendChild(h('h4', 'Please cite'));
          B.appendChild(h('ul.rc-cite', cites.map((c) => h('li', { html: linkify(c) }))));
        }
      }
      const acts = h('div.rc-side-acts');
      const ex = h('button.tbtn', { type: 'button', html: I('download') + '<span>Save as CSV…</span>', title: 'Save the samples as a CSV file, which R can read' });
      ex.addEventListener('click', () => this.exportDialog());
      const rs = h('button.tbtn', { type: 'button', html: I('r') + '<span>Plot it in R</span>', title: 'Save the recording as a CSV file and open a script that plots it in RStudio' });
      rs.addEventListener('click', () => this.toR(R.id));
      acts.append(ex, rs);
      B.appendChild(acts);
    }
    _sidePad(B) {
      const rows = this.st.pad;
      B.appendChild(h('p.rc-help', 'Measure with the Calipers, then add the measurement here with the button above the trace (or Enter). The menu beside that button says what you measured – R–R, PR, QRS, QT or other – and each row’s menu here can change it: the heart rate comes from the R–R rows only. Everything in the data pad is kept in ', h('code', 'recorder/measurements.csv'), ', which R can read.'));
      const m = this.measurement();
      const add = h('button.btn.primary.rc-padadd', { type: 'button', disabled: !m, html: I('plus') + '<span>Add the measurement</span>' });
      add.addEventListener('click', () => this.addToPad());
      B.appendChild(add);
      if (!rows.length) B.appendChild(h('p.rc-none', 'Nothing in the data pad yet.'));
      else {
        const tb = h('tbody');
        rows.forEach((r, i) => {
          const kind = padKind(r);
          const cm = h('input.rc-cm', { type: 'text', value: r.comment || '', placeholder: 'note', 'aria-label': 'A note about this measurement', maxlength: 60 });
          cm.addEventListener('change', () => {
            r.comment = cm.value.trim();
            this._save();
            this._mirror();
          });
          const ks = h('select.rc-sel.rc-rk', { 'aria-label': 'What this measurement is', title: 'What this measurement is (the heart rate comes from the R–R rows only)' },
            INTERVALS.map(([v, l, t]) => h('option', { value: v, selected: v === kind, title: t }, l)));
          ks.addEventListener('change', () => {
            r.kind = ks.value;
            this._save();
            this._mirror();
            this._emitPad(r);
            this._renderSide();
          });
          const del = h('button.rc-ib.sm', { type: 'button', title: 'Delete this row', 'aria-label': 'Delete this row', html: I('trash') });
          del.addEventListener('click', () => {
            this.st.pad = this.st.pad.filter((x) => x !== r);
            this._save();
            this._mirror();
            this._renderSide();
          });
          const go = h('button.rc-ib.sm', { type: 'button', title: 'Show it', 'aria-label': 'Show this measurement on the trace', html: I('target') });
          go.addEventListener('click', async () => {
            if (!this.R || this.R.id !== r.rec) await this.open(r.rec);
            const pad = Math.max(0.5, r.dt * 0.6);
            this._setView(r.t1 - pad, Math.max(r.dt + 2 * pad, Math.min(this.span, 10)));
            this.A = r.t1;
            this.B = r.t2;
            const L = this._lanes().find((x) => x.short === r.channel);
            if (L) this.mch = L.key;
            if (L) this.ivPick = { key: [this.R.id, this.A, this.B, L.key].join('|'), v: padKind(r) };
            this._closeOverlays();
            this._draw();
          });
          const dy = r.dy == null ? '' : ` · Δ ${fmtV(r.dy)} ${r.units || ''}`;
          const rated = HAS_RATE(kind) && r.dt > 0;
          const rate = rated
            ? h('td.num', { title: `${fmtRate(60 / r.dt)} per minute = ${fmtHz(1 / r.dt)} Hz` }, fmtRate(60 / r.dt), kind === 'other' ? h('small', fmtHz(1 / r.dt) + ' Hz') : null)
            : h('td.num.rc-na', { title: 'A PR, QRS or QT interval does not repeat: it has no rate' }, '–');
          tb.appendChild(h('tr', { dataset: { kind } },
            h('td', { title: `${r.title}, ${r.channel}: from ${r.t1} s to ${r.t2} s${dy}` }, h('span.rc-rid', (i + 1) + '. ' + r.rec), h('span.rc-rk-w', ks, h('small', r.channel))),
            h('td.num', r.dt.toFixed(3)), rate, h('td', cm), h('td.rc-acts', go, del)));
        });
        B.appendChild(h('div.rc-padwrap', h('table.rc-pad', h('thead', h('tr', h('th', 'Recording, what'), h('th.num', 'Δt (s)'), h('th.num', '/min'), h('th', 'Note'), h('th', ''))), tb)));
        // for each recording: the heart rate from its R–R intervals only, and the mean of each other kind of interval
        const recs = new Map();
        rows.forEach((r) => {
          if (!recs.has(r.rec)) recs.set(r.rec, []);
          recs.get(r.rec).push(r);
        });
        recs.forEach((rs, rec) => {
          if (rs.length < 2) return;
          const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
          const of = (k) => rs.filter((r) => padKind(r) === k).map((r) => r.dt);
          const parts = [];
          const rr = of('R-R');
          if (rr.length) {
            const mr = mean(rr);
            parts.push(h('span.rc-hr', `heart rate ${fmtRate(60 / mr)} /min`, h('small', ` – from ${rr.length} R–R interval${rr.length === 1 ? '' : 's'} (mean ${mr.toFixed(3)} s)`)));
          }
          ['PR', 'QRS', 'QT'].forEach((k) => {
            const v = of(k);
            if (v.length) parts.push(h('span', `${k} ${Math.round(mean(v) * 1000)} ms` + (v.length > 1 ? ` (mean of ${v.length})` : '')));
          });
          const ot = of('other');
          if (ot.length) {
            const mo = mean(ot);
            parts.push(h('span', `other: ${ot.length === 1 ? '' : ot.length + ', mean '}${mo.toFixed(3)} s (${fmtRate(60 / mo)} /min, ${fmtHz(1 / mo)} Hz)`));
          }
          B.appendChild(h('p.rc-sum', h('b', rec), parts.map((x, k) => [k ? h('span.rc-dot', ' · ') : ': ', x])));
        });
      }
      const acts = h('div.rc-side-acts');
      const f = h('button.tbtn', { type: 'button', html: I('file') + '<span>measurements.csv</span>', title: 'Show the file in Files' });
      f.addEventListener('click', () => this.showPadFile());
      const rs = h('button.tbtn', { type: 'button', html: I('r') + '<span>Analyse in R</span>', title: 'Open a script that reads your measurements in RStudio' });
      rs.addEventListener('click', () => this.toR('measurements'));
      const clr = h('button.tbtn', { type: 'button', html: I('trash') + '<span>Clear</span>', disabled: !rows.length });
      clr.addEventListener('click', async () => {
        if (await MG.confirmBox('Clear the data pad?', `<p>Delete all ${rows.length} measurements in the data pad?</p>`, 'Delete them', { danger: true })) {
          this.st.pad = [];
          this._save();
          this._mirror();
          this._renderSide();
        }
      });
      acts.append(f, rs, clr);
      B.appendChild(acts);
    }
    _sideChannels(B) {
      const R = this.R;
      if (!R) return B.appendChild(h('p.rc-none', 'Choose a recording from the list.'));
      B.appendChild(h('p.rc-help', 'Tick the channels to show. Click a channel’s name on the trace for its menu; Fit sets its scale to what is on the screen.'));
      const ul = h('ul.rc-chans');
      const hidden = new Set(this.st.hidden[R.id] || []);
      const row = (L, on, toggle) => {
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': 'Show ' + L.name });
        cb.addEventListener('change', () => toggle(cb.checked));
        const [lo, hi] = on ? this._range(L) : [null, null];
        const fit = h('button.rc-ib.sm', { type: 'button', title: 'Fit the scale to the screen', 'aria-label': 'Fit the scale of ' + L.name, html: I('maximize'), disabled: !on });
        fit.addEventListener('click', () => this.autoscale(L));
        const set = h('button.rc-ib.sm', { type: 'button', title: 'Set the scale', 'aria-label': 'Set the scale of ' + L.name, html: I('ruler'), disabled: !on });
        set.addEventListener('click', () => this._askRange(L));
        ul.appendChild(h('li', h('label.rc-chk', cb, h('i', { style: { background: L.key === 'hr' ? KIND_COLOUR.hr : KIND_COLOUR[L.kind] || '#384355' } }), h('span', L.name)), h('small', on ? `${fmtV(lo)} to ${fmtV(hi)} ${L.units || ''}` : L.units || ''), fit, set));
      };
      R.channels.forEach((c, k) => {
        const L = { key: 'c' + k, k, c, units: c.units, name: c.name, short: c.short, kind: c.kind || 'other' };
        row(L, !hidden.has(c.short), (on) => this.setHidden(c.short, !on));
      });
      if (R.hr) row(this._hrLane(), this._hrOn(), (on) => this.setHR(on));
      B.appendChild(ul);
      if (R.hr) B.appendChild(h('p.rc-note', 'The heart rate is worked out beat by beat from the time between each heartbeat and the one before it (60 ÷ the R–R interval in seconds). ' + (R.beats.note || '')));
      const acts = h('div.rc-side-acts');
      const fit = h('button.tbtn', { type: 'button', html: I('maximize') + '<span>Fit them all</span>' });
      fit.addEventListener('click', () => this.autoscale());
      const reset = h('button.tbtn', { type: 'button', html: I('reset') + '<span>The usual scales</span>' });
      reset.addEventListener('click', () => {
        delete this.st.ranges[R.id];
        this._save();
        this._draw();
        this._renderSide();
      });
      acts.append(fit, reset);
      if (R.audioCh >= 0) {
        const s = h('button.tbtn', { type: 'button', html: I(this.st.listen ? 'speaker' : 'mute') + `<span>${this.st.listen ? 'Sound on' : 'Sound off'}</span>` });
        s.addEventListener('click', () => {
          this.setListen(!this.st.listen);
          this._renderSide();
        });
        acts.appendChild(s);
      }
      B.appendChild(acts);
    }

    /* ---------------- files: CSV for R, pictures ---------------- */
    /** the samples from a to b (seconds) as CSV text: a column of time, then one for each channel (and the rows) */
    _csv(a, b) {
      const R = this.R;
      const i0 = Math.max(0, Math.floor(a * R.fs + 1e-6)), i1 = Math.min(R.n - 1, Math.ceil(b * R.fs - 1e-6));
      const cols = R.channels.map(colName);
      const used = new Set();
      cols.forEach((c, k) => {
        let x = c, j = 2;
        while (used.has(x)) x = c + '_' + j++;
        used.add(x);
        cols[k] = x;
      });
      const dec = Math.max(3, Math.ceil(Math.log10(R.fs)) + 1);
      const out = ['time_s,' + cols.join(',')];
      const prec = R.channels.map((c) => {
        const step = Math.abs(c.scale) || 1e-3;
        return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
      });
      for (let i = i0; i <= i1; i++) {
        let line = (i / R.fs).toFixed(dec);
        for (let k = 0; k < R.channels.length; k++) {
          const v = R.data[k][i];
          line += ',' + (v === v ? +v.toFixed(prec[k]) : 'NA');
        }
        out.push(line);
      }
      return { text: out.join('\n') + '\n', rows: i1 - i0 + 1, cols };
    }
    _beatsCsv(a, b) {
      const R = this.R;
      if (!R.hr) return null;
      const rows = [['time_s', 'rr_s', 'hr_per_min', 'label']];
      R.hr.filter((p) => p.t >= a && p.t <= b).forEach((p) => rows.push([p.t.toFixed(4), p.rr.toFixed(4), p.v.toFixed(2), p.code || '']));
      return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
    }
    /** save the samples from a to b as ~/recorder/<name>.csv (and the beats as <name>-beats.csv) → the path */
    async exportRange(a, b, name, opts = {}) {
      const R = this.R;
      if (!R) return null;
      const { text, rows } = this._csv(a, b);
      const fs = this.fs;
      fs.mkdirp(DIR());
      const path = DIR() + '/' + name + '.csv';
      fs.writeText(path, text);
      const bc = this._beatsCsv(a, b);
      if (bc) fs.writeText(DIR() + '/' + name + '-beats.csv', bc);
      bus.emit('file:saved', { path, name: name + '.csv' });
      if (!opts.quiet) {
        const tid = 'rcx' + uid();
        toast(`Saved <b>${esc(fs.pretty ? fs.pretty(path) : path)}</b> (${rows.toLocaleString('en-GB')} rows)${bc ? ' and the beats' : ''}. <button class="linkbtn" type="button" id="${tid}">Show it</button>`, 'ok', 5000);
        setTimeout(() => {
          const el = document.getElementById(tid);
          if (el) el.addEventListener('click', () => MG.app.revealFile(path));
        }, 0);
      }
      bus.emit('rec:export', { id: R.id, path, rows });
      return path;
    }
    exportDialog() {
      const R = this.R;
      if (!R) return toast('Open a recording first.', 'warn');
      const hasC = this.A != null && this.B != null;
      const a = hasC ? Math.min(this.A, this.B) : this.t0, b = hasC ? Math.max(this.A, this.B) : this.t0 + this.span;
      const m = MG.modal('Save the samples as a CSV file', `<form class="rc-exp">
<p>A CSV file has a column of times and a column for each channel: R, a spreadsheet or Python can read it.${R.hr ? ' The heartbeats go into a second file, <code>…-beats.csv</code>, with the R–R interval and the heart rate of each beat.' : ''}</p>
<label class="check"><input type="radio" name="what" value="cursors" ${hasC ? 'checked' : 'disabled'}> Between the cursors${hasC ? ` (${fmtDt(b - a)})` : ' (put the cursors on the trace first)'}</label>
<label class="check"><input type="radio" name="what" value="screen" ${hasC ? '' : 'checked'}> What is on the screen (${fmtDt(this.span)})</label>
<label class="check"><input type="radio" name="what" value="all"> The whole recording (${durText(R.duration)})</label>
<p><label>File name: <input class="prompt-input" name="name" value="${esc(R.id)}" spellcheck="false"></label></p>
<div class="prompt-actions"><button class="btn" type="button" data-x="no">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
      const f = m.box.querySelector('form');
      f.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const what = f.querySelector('input[name="what"]:checked').value;
        const name = (f.querySelector('input[name="name"]').value.trim() || R.id).replace(/\.csv$/i, '').replace(/[\/\\:*?"<>|\s]+/g, '-');
        m.close();
        const [x, y] = what === 'all' ? [0, R.duration] : what === 'cursors' ? [a, b] : [this.t0, this.t0 + this.span];
        await this.exportRange(x, y, name);
      });
    }
    /** a script for R: of the data pad ('measurements'), or of a recording (its id) – opened in RStudio */
    async toR(what) {
      await this.ready;
      const fs = this.fs;
      fs.mkdirp(DIR());
      if (!what || what === 'measurements') {
        this._writePad();
        if (!fs.exists(DIR() + '/measurements.csv')) fs.writeText(DIR() + '/measurements.csv', this._padCsv());
        const path = DIR() + '/recorder-measurements.R';
        const e = fs.exists(path) ? fs.get(path) : null;
        // (a script of the first version, left as it was, is brought up to date: it took every interval for an R-R)
        if (!e || (typeof e.text === 'string' && e.text.trim() === R_PAD_V1.trim())) fs.writeText(path, R_PAD);
        return MG.app.openInRStudio(path);
      }
      const id = String(what);
      if (!this.R || this.R.id !== id) await this.open(id, { quiet: true });
      const R = this.R;
      await this.exportRange(0, R.duration, R.id, { quiet: true });
      const path = DIR() + '/' + R.id + '.R';
      if (!fs.exists(path)) fs.writeText(path, rScript(R));
      return MG.app.openInRStudio(path);
    }
    /** a picture of the view, saved in ~/recorder → its path */
    async capture(opts = {}) {
      const R = this.R;
      if (!R) return toast('Open a recording first.', 'warn');
      this._paint();
      const dpr = this.dpr || 1;
      const W = this.cssW, Hc = this.cssH, Ha = 24;
      const who = MG.user && MG.user.name() !== MG.user.DEFAULT ? ' · ' + MG.user.name() : '';
      const title = `${R.title} · ${fmtT(this.t0, niceStep(this.span, 8))}–${fmtT(this.t0 + this.span, niceStep(this.span, 8))} s${who} · ${new Date().toLocaleDateString('en-GB')}`;
      const src = R.source || {};
      const credit = src.database ? `${src.database}, record ${src.record} (PhysioNet; ${src.licence || ''})` : '';
      const head = 26, foot = 22;
      const out = document.createElement('canvas');
      out.width = Math.round(W * dpr);
      out.height = Math.round((head + Hc + Ha + foot) * dpr);
      const g = out.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, out.width, out.height);
      g.drawImage(this.cv, 0, Math.round(head * dpr));
      g.drawImage(this.axis, 0, 0, this.axis.width, this.axis.height, 0, Math.round((head + Hc) * dpr), Math.round(W * dpr), Math.round(Ha * dpr));
      g.scale(dpr, dpr);
      g.fillStyle = '#18212f';
      g.font = '600 13px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText(title, 10, head / 2, W - 20);
      g.fillStyle = '#647086';
      g.font = '11px system-ui, sans-serif';
      g.fillText(credit, 10, head + Hc + Ha + foot / 2, W - 20);
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (!blob) return toast('The picture could not be made.', 'error');
      const fs = this.fs;
      fs.mkdirp(DIR());
      let k = 1, path;
      do path = `${DIR()}/${R.id}-${k++}.png`;
      while (fs.exists(path));
      const p = await MG.app.saveToFiles(path.split('/').pop(), blob, { folder: '~/recorder', ask: false });
      if (p) bus.emit('rec:capture', { id: R.id, path: p });
      if (opts.download) MG.downloadBlob(blob, path.split('/').pop());
      return p;
    }

    /* ---------------- the menu, help and credits ---------------- */
    _menu(anchor) {
      const R = this.R;
      const items = [];
      if (R) {
        items.push(['download', 'Save the samples as CSV…', () => this.exportDialog()]);
        items.push(['r', 'Plot this recording in R', () => this.toR(R.id)]);
      }
      items.push(['table', 'Analyse the data pad in R', () => this.toR('measurements')]);
      if (R) {
        items.push(['maximize', 'Fit the scales to the screen', () => this.autoscale()]);
        items.push(['camera', 'Take a picture and download it', () => this.capture({ download: true })]);
      }
      items.push(['folder', 'Show my recorder files (in Files)', () => {
        this.fs.mkdirp(DIR());
        MG.app.revealFile(DIR());
      }]);
      items.push(['info', 'Where the recordings come from', () => this.credits()]);
      items.push(['help', 'How to use the recorder', () => this.help()]);
      MG.popmenu(anchor, items);
    }
    help() {
      MG.modal('The recorder', `<ul>
<li><b>Recordings</b>: real recordings of people, from the open databases of PhysioNet: the ECG, heart sounds, blood pressure, the pulse, breathing, muscle (EMG) and the brain (EEG). The list button (top left) shows them; <b>About</b> (click the recording's name) says what each one shows and where it comes from.</li>
<li><b>Moving along</b>: drag the trace, use the arrow keys, or click or drag in the strip at the bottom, which shows the whole recording. <b>Zoom</b> with − and + (or Ctrl and the mouse wheel, or two fingers): the menu between them sets the time across the screen.</li>
<li><b>Play</b> replays the recording in real time, as if it were being recorded, with the pen moving across the chart (×2 or ×5 plays it faster). The heart sounds and the EMG can be heard as they play: switch on <b>Sound</b>.</li>
<li><b>Calipers</b>: drag across the trace (or click at each end) to put two cursors, A and B. The bar above the trace shows the time between them (Δt), the rate that interval corresponds to (60 ÷ Δt per minute, and 1 ÷ Δt per second, in Hz, for a short one), and the change, lowest, highest and mean values of the channel you measured (choose it in the bar). Drag the cursors' flags (at the top of the chart) to adjust them; a drag anywhere else starts a new measurement. <b>Marker</b> puts down one cursor: the readout by the pointer then measures from it.</li>
<li><b>Heart rate</b> adds a channel of the heart rate, worked out beat by beat from the time between heartbeats.</li>
<li><b>The data pad</b> keeps your measurements: add one with the button above the trace (or Enter). The menu beside that button says what you measured – an R–R interval (from one R wave to the next), a PR, QRS or QT interval, or other: the Recorder guesses it from where the cursors lie on an ECG, and you can change it there or in the data pad. The data pad works out the heart rate from the R–R intervals only. It is saved as <code>~/recorder/measurements.csv</code>, and <b>Analyse in R</b> opens a script that reads it.</li>
<li><b>Channels</b>: click a channel's name for its menu (fit or set its scale, hide it). Pictures (the camera) and CSV files go into <code>~/recorder</code> in Files.</li>
<li>Keys: ← → move, Shift+← → a screen at a time, + − zoom, space plays, C calipers, M marker, P move, H heart rate, Enter adds to the data pad, Esc clears the cursors.</li>
</ul>`);
    }
    credits() {
      const recs = this.catalogue.recordings || [];
      const dbs = new Map();
      recs.forEach((r) => {
        const d = r.database || '';
        if (!d) return;
        if (!dbs.has(d)) dbs.set(d, { url: r.url, licence: r.licence, licence_url: r.licence_url, recs: [] });
        dbs.get(d).recs.push(r.title);
      });
      const list = [...dbs.entries()].map(([d, x]) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(d)}</a> – ${esc(x.recs.join(', '))}. Licence: <a href="${esc(x.licence_url || '#')}" target="_blank" rel="noopener">${esc(x.licence || '')}</a>.</li>`).join('');
      MG.modal('Where the recordings come from', `<p>The recordings are excerpts of open-access databases of <a href="https://physionet.org" target="_blank" rel="noopener">PhysioNet</a>, a resource for research on physiological signals. Each database is shared under the Open Data Commons Attribution Licence: anyone may use and share it, as long as the database is credited. <b>About</b> gives the source and the citations of each recording.</p><ul>${list}</ul><p class="muted">Please also cite PhysioNet: Goldberger AL, Amaral LAN, Glass L, et al. PhysioBank, PhysioToolkit, and PhysioNet: components of a new research resource for complex physiologic signals. Circulation 101(23):e215–e220 (2000).</p>`);
    }
  }

  /* ---------- helpers that need no recorder ---------- */
  function rangeOf(a) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) return [-1, 1];
    const pad = (hi - lo) * 0.06 || 1;
    return [lo - pad, hi + pad];
  }
  function nearestIndex(arr, t) {
    let lo = 0, hi = arr.length - 1;
    if (hi < 0) return -1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < t) lo = mid;
      else hi = mid;
    }
    return Math.abs(arr[lo] - t) <= Math.abs(arr[hi] - t) ? lo : hi;
  }
  function num(v) {
    return v == null || !isFinite(v) ? null : +(+v).toPrecision(5);
  }
  function durText(s) {
    if (s == null) return '';
    if (s < 90) return (s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)) + ' s';
    const m = Math.floor(s / 60), r = Math.round(s - m * 60);
    return `${m} min${r ? ' ' + r + ' s' : ''}`;
  }
  function spanText(s) {
    if (s < 1) return Math.round(s * 1000) + ' ms';
    if (s < 60) return (s < 10 ? +s.toFixed(2) : Math.round(s)) + ' s';
    return durText(s);
  }
  function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  }

  /* ---------- the scripts for R ---------- */
  const R_PAD = `# Measurements from the Recorder's data pad
# Each row is one measurement that you added to the data pad: its recording and channel, what it is (kind: R-R, PR,
# QRS, QT or other), and the time between the cursors (dt_s, in seconds). The Recorder keeps this file up to date.
m <- read.csv("~/recorder/measurements.csv")
head(m)

# how many measurements of each kind, for each recording
table(m$recording, m$kind)

# the heart rate comes from the R-R intervals only: 60 divided by the mean R-R interval (in seconds)
rr <- subset(m, kind == "R-R")
round(tapply(rr$dt_s, rr$recording, mean), 3)       # the mean R-R interval of each recording (s)
round(60 / tapply(rr$dt_s, rr$recording, mean), 1)  # its heart rate (beats per minute)

# the PR, QRS and QT intervals, in milliseconds: the mean of each, for each recording
ecg <- subset(m, kind %in% c("PR", "QRS", "QT"))
if (nrow(ecg) > 0) round(tapply(ecg$dt_s * 1000, list(ecg$recording, ecg$kind), mean))

# anything else (kind "other"), with its frequency in hertz (1 / dt_s)
other <- subset(m, kind == "other")
if (nrow(other) > 0) other[, c("recording", "channel", "dt_s", "freq_hz", "comment")]

# the intervals of each kind, as a strip chart
stripchart(dt_s ~ kind, data = m, vertical = TRUE, method = "jitter", pch = 19,
           col = "steelblue", ylab = "Interval (s)", xlab = "")
`;
  /* the first version of that script, which took the mean of every interval as R-R (replaced if it was left unchanged) */
  const R_PAD_V1 = `# Measurements from the Recorder's data pad
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
`;
  function rScript(R) {
    const cols = R.channels.map(colName);
    const src = R.source || {};
    const shown = cols.slice(0, 4);
    const lines = [
      `# ${R.title}: a recording from the Recorder`,
      `# ${src.database || ''}, record ${src.record || ''} (PhysioNet; ${src.licence || ''})`,
      `# Each row of the CSV file is one moment: its time (s) and the value of each channel then.`,
      `d <- read.csv("~/recorder/${R.id}.csv")`,
      `head(d)`,
      `nrow(d)          # ${Math.round(R.fs)} samples a second`,
      ``,
      `# each channel against time${cols.length > 4 ? ' (the first four of the ' + cols.length + ')' : ''}`,
      `op <- par(mfrow = c(${shown.length}, 1), mar = c(2.5, 4.5, 1, 1))`,
      `for (ch in c(${shown.map((c) => '"' + c + '"').join(', ')})) plot(d$time_s, d[[ch]], type = "l", xlab = "", ylab = ch, col = "grey20")`,
      `par(op)`,
      ``,
      `# a closer look: the first 5 seconds of the first channel`,
      `first5 <- subset(d, time_s < 5)`,
      `plot(first5$time_s, first5$${shown[0]}, type = "l", xlab = "Time (s)", ylab = "${shown[0]}")`
    ];
    if (R.hr) {
      lines.push(
        ``,
        `# the heartbeats: the time of each beat, the R-R interval before it (s) and the heart rate (per minute)`,
        `b <- read.csv("~/recorder/${R.id}-beats.csv")`,
        `summary(b$hr_per_min)`,
        `plot(b$time_s, b$hr_per_min, type = "o", pch = 20, xlab = "Time (s)", ylab = "Heart rate (/min)")`,
        ``,
        `# how much the heart rate varies from beat to beat: the standard deviation of the R-R intervals (ms)`,
        `round(sd(b$rr_s) * 1000)`
      );
    }
    return lines.join('\n') + '\n';
  }

  MG.RecorderApp = RecorderApp;
})();
