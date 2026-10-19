/* =====================================================================
   The Simulations tab: a library of PhET Interactive Simulations
   (University of Colorado Boulder), chosen for biomedical science, kept
   with the site (sims/<id>/<id>_en.html, PhET's own English single-file
   builds, unchanged) and run here in a frame.

   The versions are the ones PhET published under the Creative Commons
   Attribution 4.0 licence (CC BY 4.0) – see build/sims/README.md. Each
   one runs with PhET's usage statistics switched off (?yotta=false), so
   that it sends nothing to PhET or to Google. The credit to PhET is shown
   under the library and under each simulation, and in its About box.

   What the buttons of the instructions ask (data-sim → open(spec)):
     open('neuron')          the simulation (its home screen, if it has several)
     open('ph-scale:2')      its second screen (screens count from 1; 'ph-scale:home' its home screen)
     open('') / open('library')   the library
   open() resolves when the simulation has started (or the library is shown); false if it could not start.

   Events (MG.bus), for the practicals' steps that tick themselves:
     sim:open       {id, title, screen}       a simulation has started (screen: 1, 2… or 0 for its home screen)
     sim:restore    {id, title, screen}       the simulation open last time has started again (a reload)
     sim:library    {}                        the library is shown
     sim:screen     {id, screen, name}        the simulation shows another screen (from the toolbar or inside it)
     sim:interact   {id, screen}              the student clicks or types in the simulation (at most every 3 s)
     sim:action     {id, screen, action}      something the student did in the simulation, watched for in some of
                                              them (sims/index.json "watch"): neuron – stimulate, chart, charges,
                                              concentrations; beers-law-lab – light, detector
     sim:change     {id, screen, what, value} a value the student changed in the simulation (as above; at most every
                                              0.4 s): beers-law-lab – concentration (mol/L), path (cm), wavelength
                                              (nm), solution, absorbance; ph-scale – solution, water (L), meter, ph
     sim:fullscreen {id, on}                  full screen on or off
     sim:about      {id}                      the About box of a simulation is opened
     sim:filter     {topic, n}                a topic is chosen in the library (n: how many simulations it shows)
     sim:search     {q, n}                    the library is searched
     sim:error      {id, message}             a simulation could not be started
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const I = (n) => MG.icon(n);

  const BASE = 'sims/';
  const PHET = 'https://phet.colorado.edu';
  const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
  /* PhET's credit, word for word as its licensing page gives it (https://phet.colorado.edu/en/licensing/html: "other
     modifications are not permitted"), with the address shown; the links change nothing in the text */
  const CREDIT = 'Simulation by PhET Interactive Simulations, University of Colorado Boulder, licensed under CC BY 4.0 (https://phet.colorado.edu).';
  const CREDIT_HTML = `Simulation by PhET Interactive Simulations, University of Colorado Boulder, licensed under <a href="${LICENCE_URL}" target="_blank" rel="noopener">CC BY 4.0</a> (<a href="${PHET}" target="_blank" rel="noopener">${PHET}</a>).`;
  const CREDIT_LABELS = [['leadDesign', 'Lead design'], ['softwareDevelopment', 'Software development'], ['team', 'Team'], ['contributors', 'Contributors'], ['qualityAssurance', 'Quality assurance'], ['graphicArts', 'Graphic arts'], ['soundDesign', 'Sound design'], ['thanks', 'Thanks']];
  // (PhET's texts carry marks that set the direction of the writing)
  const BIDI = /[‎‏‪-‮⁦-⁩]/g;
  const clean = (s) => String(s == null ? '' : s).replace(BIDI, '').trim();
  const fmtMB = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB');
  const fmtDate = (s) => {
    const d = new Date(String(s || '').replace(' UTC', 'Z').replace(' ', 'T'));
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const sig = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(4)) : v);
  /* a value of a simulation, as the events give it: a number, a true or false, or the name of what was chosen */
  function valueOf(v) {
    if (v == null) return null;
    if (typeof v === 'number') return sig(v);
    if (typeof v === 'boolean' || typeof v === 'string') return typeof v === 'string' ? clean(v) : v;
    try {
      if (v.nameProperty && v.nameProperty.value != null) return clean(v.nameProperty.value);
      if (typeof v.name === 'string') return clean(v.name);
      if (typeof v.tandemName === 'string') return v.tandemName;
    } catch (e) {
      /* (a value that cannot be read) */
    }
    return String(v);
  }

  class SimsApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      const saved = store.get('sims', {}) || {};
      // (the topic chosen in the library is not kept: the library opens with all of them)
      this.st = { view: saved.view === 'sim' ? 'sim' : 'library', last: saved.last || null, screen: saved.screen == null ? null : saved.screen, topic: '', q: '' };
      this.list = [];
      this.topics = [];
      this.cur = null; // the simulation in the frame: {id, e, frame, sim, ok, screen}
      this._tok = 0; // (each load has its own number: a load overtaken by another stops)
      this._build();
      this._save = MG.debounce(() => store.set('sims', { view: this.st.view, last: this.st.last, screen: this.st.screen }), 300);
      this._searched = MG.debounce(() => {
        const q = this.st.q.trim();
        if (q) bus.emit('sim:search', { q, n: this._shown().length });
      }, 700);
      bus.on('app:bench', (d) => this._pause(d.name !== 'sims' || this.player.hidden));
      this.ready = this._start();
    }

    /* ---------------- layout ---------------- */
    _build() {
      const r = this.root;
      r.classList.add('sm-app');
      r.innerHTML = '';
      // the library
      this.search = h('input.sm-search', { type: 'search', placeholder: 'Search the simulations', 'aria-label': 'Search the simulations', spellcheck: 'false', autocomplete: 'off' });
      this.search.addEventListener('input', () => {
        this.st.q = this.search.value;
        this._render();
        this._searched();
      });
      this.chips = h('div.sm-chips', { role: 'group', 'aria-label': 'Topics' });
      this.grid = h('div.sm-grid', { role: 'list', 'aria-label': 'Simulations' });
      const clear = h('button.linkbtn', { type: 'button' }, 'Show them all');
      clear.addEventListener('click', () => this._filter('', ''));
      this.noneT = h('span');
      this.none = h('p.sm-none', { hidden: true }, this.noneT, ' ', clear);
      this.cont = h('div.sm-cont', { hidden: true });
      this.lib = h('section.sm-lib', { 'aria-label': 'The library of simulations' },
        h('div.sm-lib-in',
          h('header.sm-lib-h',
            h('h2', 'Simulations'),
            h('p', 'Interactive simulations from PhET, at the University of Colorado Boulder, chosen for biomedical science. Choose one to open it here; each one has its own screens, controls and help.')),
          h('div.sm-find', this.search, this.chips),
          this.cont, this.grid, this.none,
          h('footer.sm-credit',
            h('p.sm-credit-t', { html: CREDIT_HTML }),
            h('p', { html: 'The PhET name and logo are trademarks of the University of Colorado, shown here only to credit PhET. Each simulation’s <b>About</b> gives its version, its authors and what else it contains.' }))));

      // the player
      const back = h('button.sm-back', { type: 'button', title: 'Back to the library of simulations', html: I('arrowL') + '<span>Library</span>' });
      back.addEventListener('click', () => this.showLibrary());
      this.titleEl = h('b.sm-title');
      this.screenSel = h('select.sm-screen', { 'aria-label': 'The screen of the simulation', title: 'The screens of the simulation (also at the bottom of the simulation)', hidden: true });
      this.screenSel.addEventListener('change', () => this.setScreen(Number(this.screenSel.value)));
      this.aboutBtn = this._ib('info', 'About this simulation: what it shows, its authors and its licence', () => this.about());
      this.winBtn = this._ib('external', 'Open the simulation in a new browser tab', () => this.newWindow());
      this.fullBtn = this._ib('maximize', 'Full screen (Esc leaves it)', () => this.fullscreen());
      if (!document.fullscreenEnabled || !this.root.requestFullscreen) this.fullBtn.hidden = true;
      this.bar = h('div.sm-bar', back, this.titleEl, this.screenSel, h('span.grow'), this.aboutBtn, this.winBtn, this.fullBtn);
      this.stage = h('div.sm-stage');
      this.waitT = h('span');
      this.wait = h('div.sm-wait', { hidden: true, role: 'status', 'aria-live': 'polite' }, h('span.spinner'), this.waitT);
      this.failT = h('p');
      const retry = h('button.btn.primary', { type: 'button' }, 'Try again');
      retry.addEventListener('click', () => this.cur && this._load(this.cur.e, this.st.screen, { focus: true }));
      const toLib = h('button.btn', { type: 'button' }, 'Back to the library');
      toLib.addEventListener('click', () => this.showLibrary());
      this.fail = h('div.sm-fail', { hidden: true, role: 'alert' }, h('div', h('h3', 'The simulation did not start'), this.failT, h('div.sm-fail-acts', toLib, retry)));
      this.foot = h('div.sm-foot', { html: CREDIT_HTML });
      // (a phone held upright: the simulations are made for a screen wider than it is tall)
      this.turn = h('div.sm-turn', { hidden: true, role: 'status' });
      this.stageW = h('div.sm-stage-w', this.stage, this.wait, this.fail, this.turn);
      this.player = h('section.sm-player', { hidden: true, 'aria-label': 'Simulation' }, this.bar, this.stageW, this.foot);
      if (window.ResizeObserver) new ResizeObserver(() => !this.turn.hidden && !this._upright() && (this.turn.hidden = true)).observe(this.stageW);
      document.addEventListener('fullscreenchange', () => {
        const on = document.fullscreenElement === this.player;
        this.fullBtn.classList.toggle('on', on);
        this.fullBtn.title = on ? 'Leave full screen (Esc)' : 'Full screen (Esc leaves it)';
        this.fullBtn.innerHTML = I(on ? 'shrink' : 'maximize');
        if (on !== !!this._full) {
          this._full = on;
          if (this.cur) bus.emit('sim:fullscreen', { id: this.cur.id, on });
        }
      });

      r.append(this.lib, this.player);
      r.addEventListener('keydown', (e) => this._key(e));
    }
    _upright() {
      const w = this.stageW.clientWidth, ht = this.stageW.clientHeight;
      return !!w && w < 600 && ht > w * 1.25 && window.matchMedia('(pointer: coarse)').matches;
    }
    _ib(ic, title, fn) {
      const b = h('button.sm-ib', { type: 'button', title, 'aria-label': title, html: I(ic) });
      b.addEventListener('click', fn);
      return b;
    }
    _key(e) {
      if (e.key === '/' && !this.lib.hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault();
        this.search.focus();
      }
    }

    async _start() {
      try {
        const r = await fetch(BASE + 'index.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        this.list = Array.isArray(d.sims) ? d.sims : [];
        this.topics = Array.isArray(d.topics) ? d.topics : [];
      } catch (e) {
        this._listFailed = `The list of simulations could not be loaded (${e.message || e}). Check your internet connection and reload the page.`;
      }
      if (this.st.topic && !this.topics.includes(this.st.topic)) this.st.topic = '';
      this._renderChips();
      this._render();
      // (the simulation that was open last time starts again, without holding up the tab)
      const last = this.st.view === 'sim' && this._entry(this.st.last);
      if (last) this._load(last, this.st.screen, { restore: true });
      else this.showLibrary({ quiet: true });
    }

    /** the tab is shown again (opts.resize: the window or the divider changed size – the frame follows by itself) */
    shown() {
      this._pause(this.player.hidden);
    }

    /* ---------------- the library ---------------- */
    _entry(id) {
      id = String(id || '').trim().toLowerCase();
      return id ? this.list.find((s) => s.id === id) || null : null;
    }
    _shown() {
      const words = this.st.q.toLowerCase().split(/\s+/).filter(Boolean);
      return this.list.filter((s) => {
        if (this.st.topic && !(s.topics || []).includes(this.st.topic)) return false;
        const text = [s.title, s.description, s.why, (s.topics || []).join(' '), (s.screens || []).join(' ')].join(' ').toLowerCase();
        return words.every((w) => text.includes(w));
      });
    }
    _renderChips() {
      this.chips.innerHTML = '';
      const chip = (topic, label) => {
        const b = h('button.sm-chip', { type: 'button', 'aria-pressed': String(this.st.topic === topic), dataset: { topic } }, label);
        b.addEventListener('click', () => this._filter(this.st.topic === topic ? '' : topic, null, true));
        this.chips.appendChild(b);
      };
      chip('', 'All');
      this.topics.forEach((t) => chip(t, t));
    }
    _filter(topic, q, user) {
      this.st.topic = topic;
      if (q != null) {
        this.st.q = q;
        this.search.value = q;
      }
      this.chips.querySelectorAll('.sm-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.topic === topic)));
      this._render();
      this._save();
      if (user) bus.emit('sim:filter', { topic, n: this._shown().length });
    }
    _render() {
      this.grid.innerHTML = '';
      if (this._listFailed) {
        this.noneT.textContent = this._listFailed;
        this.none.hidden = false;
        return;
      }
      const shown = this._shown();
      shown.forEach((s) => this.grid.appendChild(this._card(s)));
      this.none.hidden = shown.length > 0;
      this.noneT.textContent = this.st.topic ? `No simulation about “${this.st.topic}” matches “${this.st.q.trim()}”.` : `No simulation matches “${this.st.q.trim()}”.`;
      this._renderCont();
    }
    _card(s) {
      const pic = s.thumb ? h('img', { src: BASE + s.thumb, alt: '', loading: 'lazy', decoding: 'async', width: (s.thumbSize || [])[0], height: (s.thumbSize || [])[1] }) : null;
      const n = (s.screens || []).length;
      const b = h('button.sm-card', { type: 'button', dataset: { sim: s.id }, title: s.why || '' },
        h('span.sm-pic', pic),
        h('span.sm-card-b',
          h('b.sm-card-t', s.title),
          h('span.sm-desc', s.description || ''),
          h('span.sm-meta', (s.topics || []).map((t) => h('span.sm-tag', t)), h('span.sm-size', (n > 1 ? `${n} screens · ` : '') + fmtMB(s.bytes || 0)))));
      b.addEventListener('click', () => this.open(s.id, { focus: true }));
      if (this.cur && this.cur.id === s.id) b.classList.add('on');
      return h('div.sm-item', { role: 'listitem' }, b);
    }
    /* the simulation still open, while the library is shown: back to it without starting it again */
    _renderCont() {
      const c = this.cur;
      this.cont.innerHTML = '';
      this.cont.hidden = !(c && c.ok);
      if (!c || !c.ok) return;
      const b = h('button.sm-cont-b', { type: 'button', html: `<span>Back to <b>${esc(c.e.title)}</b></span>` + I('chevR') });
      b.addEventListener('click', () => {
        this._showPlayer();
        c.frame.focus();
      });
      this.cont.appendChild(b);
    }
    /** show the library */
    showLibrary(opts = {}) {
      if (document.fullscreenElement === this.player && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      this.player.hidden = true;
      this.lib.hidden = false;
      this._pause(true);
      this.st.view = 'library';
      this._save();
      this._render();
      if (!opts.quiet) bus.emit('sim:library', {});
      return true;
    }
    _showPlayer() {
      this.lib.hidden = true;
      this.player.hidden = false;
      this.st.view = 'sim';
      this._save();
      this._pause(MG.app.currentBench !== 'sims');
    }

    /* ---------------- a simulation ---------------- */
    /** open a simulation, or the library (see the top of this file) */
    async open(spec, opts = {}) {
      const s = String(spec == null ? '' : spec).trim();
      if (!s || s.toLowerCase() === 'library') return this.showLibrary();
      const cut = s.indexOf(':');
      const id = cut < 0 ? s : s.slice(0, cut);
      const scr = cut < 0 ? '' : s.slice(cut + 1).trim().toLowerCase();
      const e = this._entry(id);
      if (!e) {
        toast(`There is no simulation called “${esc(id)}” in the library.`, 'warn');
        this.showLibrary({ quiet: true });
        return false;
      }
      const screen = scr === '' ? null : scr === 'home' ? 0 : Math.max(0, parseInt(scr, 10) || 0);
      // (the same simulation, running already: only its screen changes)
      if (this.cur && this.cur.id === e.id && this.cur.ok) {
        this._showPlayer();
        if (screen != null) await this.setScreen(screen);
        if (opts.focus) this.cur.frame.focus();
        bus.emit('sim:open', { id: e.id, title: e.title, screen: this.cur.screen });
        return true;
      }
      return this._load(e, screen, opts);
    }
    _url(e, screen) {
      const many = (e.screens || []).length > 1;
      return `${BASE}${e.id}/${e.id}_en.html?yotta=false` + (many && screen > 0 ? '&initialScreen=' + Math.min(screen, e.screens.length) : '');
    }
    async _load(e, screen, opts = {}) {
      const tok = ++this._tok;
      this._showPlayer();
      this.titleEl.textContent = e.title;
      this.titleEl.title = e.title;
      this._fillScreens(e, null, screen);
      this.fail.hidden = true;
      this.turn.hidden = true;
      this.waitT.textContent = `Starting ${e.title}… (${fmtMB(e.bytes || 0)})`;
      this.wait.hidden = false;
      this._drop();
      this.cur = { id: e.id, e, frame: null, sim: null, ok: false, screen: null };
      // (is the file there? offline, the frame would only show the browser's own error)
      try {
        const r = await fetch(`${BASE}${e.id}/${e.id}_en.html`, { method: 'HEAD', cache: 'no-cache' });
        if (!r.ok) throw new Error(r.status === 404 ? 'it is not on this site' : 'HTTP ' + r.status);
      } catch (err) {
        if (tok === this._tok) this._failed(e, `${e.title} could not be downloaded (${err.message || err}). Check your internet connection, and try again.`);
        return false;
      }
      if (tok !== this._tok) return false;
      const frame = h('iframe.sm-frame', { title: e.title + ' – simulation', allow: 'fullscreen; autoplay', src: this._url(e, screen) });
      this.stage.appendChild(frame);
      this.cur.frame = frame;
      const sim = await this._whenStarted(frame, tok, 120000);
      if (tok !== this._tok) return false;
      if (!sim) {
        this._failed(e, `${e.title} is taking a long time to start. It needs a browser with up-to-date graphics; try again, or open it in a tab of its own.`);
        return false;
      }
      Object.assign(this.cur, { sim, ok: true });
      this.wait.hidden = true;
      this.cur.screen = this._screenOf(sim);
      this._fillScreens(e, sim, this.cur.screen);
      this._hook(this.cur);
      this.st.last = e.id;
      this.st.screen = this.cur.screen;
      this.st.view = 'sim';
      this._save();
      this._pause(MG.app.currentBench !== 'sims' || this.player.hidden);
      if (opts.focus) frame.focus();
      if (this._upright()) {
        this.turn.textContent = this.fullBtn.hidden ? 'Turn your phone sideways to make the simulation bigger.' : 'Turn your phone sideways, and use full screen (the button at the top right), to make the simulation bigger.';
        this.turn.hidden = false;
        clearTimeout(this._turnT);
        this._turnT = setTimeout(() => (this.turn.hidden = true), 7000);
      }
      bus.emit(opts.restore ? 'sim:restore' : 'sim:open', { id: e.id, title: e.title, screen: this.cur.screen });
      return true;
    }
    _failed(e, message) {
      this.wait.hidden = true;
      this.failT.textContent = message;
      this.fail.hidden = false;
      bus.emit('sim:error', { id: e.id, message });
    }
    /* the simulation in the frame goes (and the memory it used) */
    _drop() {
      if (this.cur && this.cur.frame) this.cur.frame.remove();
      this.stage.innerHTML = '';
      this.cur = null;
    }
    _simOf(frame) {
      try {
        const w = frame.contentWindow;
        return (w && w.phet && w.phet.joist && w.phet.joist.sim) || null;
      } catch (e) {
        return null; // (the browser's own error page, which the page may not look into)
      }
    }
    _started(sim, frame) {
      try {
        if (sim.isConstructionCompleteProperty) return !!sim.isConstructionCompleteProperty.value;
        // (the older simulations: started when its screens are made and the page has loaded)
        const d = frame.contentDocument;
        return !!(sim.screens && sim.screens.length && sim.screens.every((s) => s.model || s._model) && d && d.readyState === 'complete');
      } catch (e) {
        return false;
      }
    }
    async _whenStarted(frame, tok, ms) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (tok !== this._tok || !frame.isConnected) return null;
        const sim = this._simOf(frame);
        if (sim && this._started(sim, frame)) return sim;
        await new Promise((r) => setTimeout(r, 150));
      }
      return null;
    }

    /* ---------------- its screens ---------------- */
    _screensOf(sim) {
      return (sim && (sim.simScreens || sim.screens)) || [];
    }
    /** the screen shown: 1, 2… or 0 for the home screen */
    _screenOf(sim) {
      try {
        if (sim.selectedScreenProperty) {
          const i = this._screensOf(sim).indexOf(sim.selectedScreenProperty.value);
          return i < 0 ? 0 : i + 1;
        }
        if (sim.showHomeScreenProperty && sim.showHomeScreenProperty.value && this._screensOf(sim).length > 1) return 0;
        return sim.screenIndexProperty ? sim.screenIndexProperty.value + 1 : 1;
      } catch (e) {
        return 1;
      }
    }
    _fillScreens(e, sim, cur) {
      let names = (e.screens || []).slice();
      if (sim) {
        const got = this._screensOf(sim).map((s) => {
          try {
            return clean(s.nameProperty ? s.nameProperty.value : s.name);
          } catch (err) {
            return '';
          }
        });
        if (got.length > 1 && got.every(Boolean)) names = got;
        else if (got.length < 2) names = [];
      }
      const sel = this.screenSel;
      sel.innerHTML = '';
      sel.hidden = names.length < 2;
      if (sel.hidden) return;
      sel.appendChild(h('option', { value: '0' }, 'Home screen'));
      names.forEach((n, i) => sel.appendChild(h('option', { value: String(i + 1) }, `${i + 1}. ${n}`)));
      sel.value = String(cur == null ? 0 : cur);
      sel.disabled = !sim;
    }
    /** show a screen of the simulation that is open: 1, 2… or 0 for its home screen */
    async setScreen(n) {
      const c = this.cur;
      if (!c || !c.ok) return false;
      const list = this._screensOf(c.sim);
      if (list.length < 2) return true;
      n = Math.max(0, Math.min(list.length, Number(n) || 0));
      try {
        const sim = c.sim;
        if (sim.selectedScreenProperty) sim.selectedScreenProperty.value = n === 0 ? sim.homeScreen : list[n - 1];
        else if (n === 0) sim.showHomeScreenProperty.value = true;
        else {
          sim.screenIndexProperty.value = n - 1;
          sim.showHomeScreenProperty.value = false;
        }
      } catch (err) {
        // (a simulation that cannot be told: started again on that screen)
        return this._load(c.e, n);
      }
      await new Promise((r) => setTimeout(r, 30));
      if (!c.linked) this._screenChanged(c);
      return true;
    }
    _screenChanged(c) {
      if (c !== this.cur || !c.ok) return;
      const n = this._screenOf(c.sim);
      if (n === c.screen) return;
      c.screen = n;
      this.screenSel.value = String(n);
      this.st.screen = n;
      this._save();
      const opt = this.screenSel.querySelector(`option[value="${n}"]`);
      bus.emit('sim:screen', { id: c.id, screen: n, name: n === 0 ? 'Home' : opt ? opt.textContent.replace(/^\d+\.\s*/, '') : '' });
    }

    /* ---------------- what the student does in it ---------------- */
    _hook(c) {
      const sim = c.sim;
      // its screens, also when they are changed inside the simulation (its navigation bar, its home screen)
      const props = [sim.selectedScreenProperty, sim.screenIndexProperty, sim.showHomeScreenProperty].filter((p) => p && typeof p.lazyLink === 'function');
      props.forEach((p) => {
        try {
          p.lazyLink(() => setTimeout(() => this._screenChanged(c), 0));
          c.linked = true;
        } catch (e) {
          /* (no notice of changes: the toolbar still works) */
        }
      });
      // clicks and keys in the simulation
      let last = 0;
      const touched = () => {
        if (c !== this.cur || Date.now() - last < 3000) return;
        last = Date.now();
        bus.emit('sim:interact', { id: c.id, screen: c.screen });
      };
      try {
        const w = c.frame.contentWindow;
        w.addEventListener('pointerdown', touched, true);
        w.addEventListener('keydown', touched, true);
      } catch (e) {
        /* (none) */
      }
      // the values that some of the simulations are watched for (sims/index.json "watch")
      this._watch(c, c.e.watch || [], 0);
    }
    _watch(c, list, tries) {
      const later = [];
      list.forEach((w) => {
        const screens = Array.isArray(w.screen) ? w.screen : [w.screen || 1];
        screens.forEach((n) => {
          const one = Object.assign({}, w, { screen: n });
          const p = this._prop(c.sim, n, w.path);
          if (p === undefined) later.push(one);
          else if (p) this._watchOne(c, one, p);
        });
      });
      // (a screen whose model is made a little later)
      if (later.length && tries < 20) setTimeout(() => c === this.cur && this._watch(c, later, tries + 1), 500);
    }
    /* a property of a screen's model (path: 'light.isOnProperty'); undefined while the model isn't there yet; null if
       there is no such property */
    _prop(sim, n, path) {
      try {
        const scr = this._screensOf(sim)[n - 1];
        if (!scr) return null;
        const m = scr.model || scr._model || (scr.modelProperty && scr.modelProperty.value);
        if (!m) return undefined;
        const p = String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), m);
        return p && typeof p.lazyLink === 'function' ? p : null;
      } catch (e) {
        return null;
      }
    }
    _watchOne(c, w, p) {
      if (w.action) {
        p.lazyLink((v) => {
          if (c !== this.cur) return;
          if (w.when === undefined || v === w.when) bus.emit('sim:action', { id: c.id, screen: w.screen, action: w.action });
        });
        return;
      }
      if (!w.change) return;
      let timer = null, pending;
      p.lazyLink((v) => {
        if (c !== this.cur) return;
        pending = valueOf(v);
        if (pending == null) return;
        clearTimeout(timer);
        timer = setTimeout(() => bus.emit('sim:change', { id: c.id, screen: w.screen, what: w.change, value: pending }), 400);
      });
    }
    /* a simulation that isn't seen does not need to run: paused while its tab (or the library) is shown instead */
    _pause(paused) {
      const c = this.cur;
      if (!c || !c.ok) return;
      try {
        if (c.sim.activeProperty && c.sim.activeProperty.value === paused) c.sim.activeProperty.value = !paused;
      } catch (e) {
        /* (a simulation that cannot be paused keeps running) */
      }
    }

    /* ---------------- the toolbar ---------------- */
    /** full screen: the simulation and its toolbar */
    async fullscreen(on) {
      if (!this.cur) return false;
      const isOn = document.fullscreenElement === this.player;
      if (on == null) on = !isOn;
      try {
        if (on && !isOn) await this.player.requestFullscreen();
        else if (!on && isOn) await document.exitFullscreen();
      } catch (e) {
        toast('This browser did not allow full screen here.', 'warn');
        return false;
      }
      return true;
    }
    /** the simulation in a browser tab of its own */
    newWindow() {
      if (!this.cur) return;
      const w = window.open(this._url(this.cur.e, this.cur.screen || 0), '_blank', 'noopener');
      if (!w) toast('The browser did not open a new tab, perhaps because pop-ups are blocked.', 'warn', 5000);
    }
    /** the About box: what the simulation shows, its version, its authors and its licence */
    about(id) {
      const e = this._entry(id) || (this.cur && this.cur.e);
      if (!e) return;
      const credits = CREDIT_LABELS.filter(([k]) => e.credits && clean(e.credits[k])).map(([k, label]) => `<dt>${esc(label)}</dt><dd>${esc(clean(e.credits[k]))}</dd>`).join('');
      const date = fmtDate(e.built);
      const screens = (e.screens || []).length > 1 ? `<p><b>Screens:</b> ${e.screens.map(esc).join(', ')}.</p>` : '';
      MG.modal(e.title, `<div class="sm-about">
<p>${esc(e.description || '')}</p>
<p><b>In biomedical science:</b> ${esc(e.why || '')}</p>
${screens}
<h4>Credits</h4>
<p class="sm-credit-t">${CREDIT_HTML}</p>
${credits ? `<dl class="sm-credits">${credits}</dl>` : ''}
<h4>This copy</h4>
<p>Version ${esc(e.version)}${date ? `, built by PhET on ${esc(date)}` : ''}: PhET’s own file, unchanged, in the version that PhET published under the <a href="${LICENCE_URL}" target="_blank" rel="noopener">Creative Commons Attribution 4.0</a> licence. (PhET’s later versions have a different licence; they are on PhET’s website.) Here it runs with PhET’s usage statistics switched off, so it sends nothing to PhET or to anyone else. The PhET name and logo are trademarks of the University of Colorado, shown only to credit PhET.</p>
<p><a href="${PHET}/en/simulations/${encodeURIComponent(e.id)}" target="_blank" rel="noopener">${esc(e.title)} on PhET’s website</a>, with its activities for teachers and students.</p>
</div>`);
      bus.emit('sim:about', { id: e.id });
    }
  }

  SimsApp.CREDIT = CREDIT;
  MG.SimsApp = SimsApp;
})();
