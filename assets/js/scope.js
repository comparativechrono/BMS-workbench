/* =====================================================================
   The Microscope tab: a virtual microscope for the workbench's slides.

   The slides are image pyramids made by build/slides/pyramid.py (slides/<id>/slide.json, tiles.pack, tiles.idx):
   OpenSeadragon draws them, and asks for each tile with an HTTP range request into tiles.pack. Around it: the slide
   box, objectives (1x to 40x; as in digital microscopy, 20x shows a slide scanned at 20x pixel for pixel), a scale
   bar, an eyepiece view with a graticule,
   and tools to measure lengths and areas, to count, to label and to take pictures. Measurements and counts are kept in
   ~/microscope/measurements.csv and ~/microscope/counts.csv, ready for R; pictures go to ~/microscope/pictures/.

   Events (MG.bus), for the practicals' steps that tick themselves:
     scope:open     {slide, title, system}                  a slide (or a picture) is opened
     scope:mag      {slide, mag}                            the objective changes (mag: 1, 2, 4, 10, 20 or 40 – the
                                                            nearest; a zoom in between rounds to the nearest)
     scope:view     {slide, mag, x, y}                      the view settles after a move (x, y: mm from the top left)
     scope:tool     {name}                                  a tool is chosen (pan, measure, area, count, label)
     scope:measure  {slide, kind, value, unit, label, n}    a length (µm) or an area (µm²) is measured; n: how many
                                                            measurements of that slide there are now
     scope:count    {slide, category, n, total}             a cell (or anything) is counted
     scope:label    {slide, text}                           a label of the student's own is added
     scope:labels   {on}                                    the slide's teaching labels are shown or hidden
     scope:eyepiece {on}                                    the eyepiece view is switched on or off
     scope:capture  {slide, path}                           a picture is taken (saved in Files)
     scope:find     {slide, target, ok}                     a click while asked to find a structure
     scope:scale    {slide, mpp}                            a picture's scale is set
     scope:panel    {name}                                  a panel at the side is shown (about, measures, counts, labels)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const CFG = MG.config;
  const OSD = window.OpenSeadragon;
  const I = (n) => MG.icon(n);

  const OBJ = (CFG.objectives || [1, 2, 4, 10, 20, 40]).slice().sort((a, b) => a - b);
  const U20 = CFG.micronsPerScreenPixelAt20x || 0.5; // µm per screen pixel at 20x
  const umPerPx = (mag) => (U20 * 20) / mag; // µm per screen pixel at a magnification
  const SLIDES = () => (CFG.slideBase || 'slides/').replace(/\/?$/, '/');
  const CAT_COLOURS = ['#e8590c', '#1c7ed6', '#2b8a3e', '#ae3ec9', '#f08c00', '#0b7285'];
  const DIV_PX = 4; // the eyepiece graticule: one division is 4 screen pixels (100 divisions)

  /* ---------- small helpers ---------- */
  const fmtLen = (um) => (um >= 1000 ? (um / 1000).toFixed(um >= 10000 ? 1 : 2) + ' mm' : um >= 100 ? Math.round(um) + ' µm' : um >= 10 ? um.toFixed(1) + ' µm' : um.toFixed(2) + ' µm');
  const fmtArea = (um2) => (um2 >= 1e5 ? (um2 / 1e6).toFixed(um2 >= 1e7 ? 2 : 3) + ' mm²' : Math.round(um2).toLocaleString('en-GB') + ' µm²');
  const fmtMag = (m) => (m >= 10 ? Math.round(m) : m >= 2 ? m.toFixed(1).replace(/\.0$/, '') : m.toFixed(2).replace(/0$/, '')) + '×';
  const nearestObj = (m) => OBJ.reduce((b, o) => (Math.abs(Math.log(o / m)) < Math.abs(Math.log(b / m)) ? o : b), OBJ[0]);
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const uid = () => Math.random().toString(36).slice(2, 9);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function polyArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      s += p.x * q.y - q.x * p.y;
    }
    return Math.abs(s) / 2;
  }
  function polyPerimeter(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
    return s;
  }
  function centroid(pts) {
    let x = 0, y = 0;
    pts.forEach((p) => ((x += p.x), (y += p.y)));
    return { x: x / pts.length, y: y / pts.length };
  }
  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const inLabel = (pt, L) => (L.poly ? inPoly(pt, L.poly) : L.r ? Math.hypot(pt.x - L.x, pt.y - L.y) <= L.r : false);
  /** a click within tol (image pixels) of a label's region counts as on it: a small structure is fiddly to hit at low power */
  function nearLabel(pt, L, tol) {
    if (inLabel(pt, L)) return true;
    if (L.r) return Math.hypot(pt.x - L.x, pt.y - L.y) <= L.r + tol;
    if (!L.poly) return false;
    for (let i = 0, j = L.poly.length - 1; i < L.poly.length; j = i++) {
      const [x1, y1] = L.poly[j], [x2, y2] = L.poly[i];
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((pt.x - x1) * dx + (pt.y - y1) * dy) / len2));
      if (Math.hypot(pt.x - (x1 + t * dx), pt.y - (y1 + t * dy)) <= tol) return true;
    }
    return false;
  }

  /* ---------- reading tiles out of tiles.pack ---------- */
  const noRanges = {}; // url → a promise of the whole file, for a server that does not answer range requests
  async function fetchRange(url, a, b, signal) {
    if (noRanges[url]) return (await noRanges[url]).slice(a, b + 1);
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal });
    if (r.status === 206) return r.arrayBuffer();
    if (r.status === 200) {
      // (the server sent the whole file: keep it, and cut the tiles out of it from now on)
      noRanges[url] = r.arrayBuffer();
      return (await noRanges[url]).slice(a, b + 1);
    }
    throw new Error('HTTP ' + r.status);
  }
  function tileSource(info, base, idx) {
    const ts = new OSD.TileSource({ width: info.width, height: info.height, tileSize: info.tileSize, tileOverlap: info.overlap, minLevel: info.minLevel, maxLevel: info.maxLevel });
    const levels = {};
    info.levels.forEach((L) => (levels[L.level] = L));
    const pack = base + 'tiles.pack';
    ts.getTileUrl = (level, x, y) => `${pack}#${level}/${x}/${y}`;
    ts.downloadTileStart = (ctx) => {
      const m = /#(\d+)\/(\d+)\/(\d+)$/.exec(ctx.src);
      const L = m && levels[+m[1]];
      if (!L) return ctx.finish(null, null, 'No such tile');
      const k = L.first + +m[3] * L.cols + +m[2];
      const off = idx[2 * k], len = idx[2 * k + 1];
      const ctrl = new AbortController();
      ctx.userData.ctrl = ctrl;
      fetchRange(pack, off, off + len - 1, ctrl.signal)
        .then((buf) => {
          const url = URL.createObjectURL(new Blob([buf], { type: info.tileType || 'image/webp' }));
          const img = new Image();
          ctx.userData.img = img;
          img.onload = () => {
            URL.revokeObjectURL(url);
            ctx.finish(img, null);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            ctx.finish(null, null, 'The tile could not be decoded');
          };
          img.src = url;
        })
        .catch((e) => ctx.finish(null, null, String((e && e.message) || e)));
    };
    ts.downloadTileAbort = (ctx) => {
      if (ctx.userData.ctrl) ctx.userData.ctrl.abort();
      if (ctx.userData.img) ctx.userData.img.onload = ctx.userData.img.onerror = null;
    };
    return ts;
  }

  /* =====================================================================
     The microscope
     ===================================================================== */
  class Microscope {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      this.st = Object.assign({ slide: null, views: {}, measures: [], counts: [], labels: [], cats: ['Cells', 'Type B'], cat: 0, mlabel: '', showLabels: true, eyepiece: false, box: true, side: 'about', scales: {} }, store.get('scope', {}) || {});
      if (!Array.isArray(this.st.cats) || !this.st.cats.length) this.st.cats = ['Cells', 'Type B'];
      this.toolName = 'pan';
      this.slide = null; // the open slide: {id, info, base, mpp, file}
      this.pending = null; // a measurement being drawn
      this.findTask = null;
      this.catalogue = { slides: [], systems: [] };
      this._build();
      this._save = MG.debounce(() => store.set('scope', this.st), 300);
      this._mirror = MG.debounce(() => this._writeCsv(), 600);
      this.ready = this._start();
    }

    /* ---------------- layout ---------------- */
    _build() {
      const r = this.root;
      r.classList.add('ms-app');
      r.innerHTML = '';
      // the slide box
      this.search = h('input.ms-search', { type: 'search', placeholder: 'Search the slides', 'aria-label': 'Search the slides' });
      this.boxList = h('div.ms-boxlist', { role: 'list' });
      const openPic = h('button.tbtn', { type: 'button', title: 'Open a picture (JPEG or PNG) from your files as a slide', html: I('image') + '<span>A picture from my files…</span>' });
      openPic.addEventListener('click', () => this.pickPicture());
      this.box = h('aside.ms-box', { 'aria-label': 'Slide box' },
        h('div.ms-box-h', h('b', 'Slide box'), h('span.grow'), this._mkBtn('x', 'Close the slide box', () => this.toggleBox(false), '.ms-box-x')),
        this.search, this.boxList, h('div.ms-box-foot', openPic));
      this.search.addEventListener('input', () => this._renderBox());

      // the toolbar
      this.titleEl = h('button.ms-title', { type: 'button', title: 'About this slide' }, 'No slide');
      this.titleEl.addEventListener('click', () => this.showSide('about'));
      this.objBar = h('div.ms-objs', { role: 'group', 'aria-label': 'Objectives' });
      OBJ.forEach((o, k) => {
        const b = h('button.ms-obj', { type: 'button', title: `${o}× objective (key ${k + 1})`, dataset: { mag: o } }, o + '×');
        b.addEventListener('click', () => this.setMag(o));
        this.objBar.appendChild(b);
      });
      this.toolBtns = {};
      const tools = [
        ['pan', 'hand', 'Move', 'Move the slide and zoom (drag, scroll, double-click)'],
        ['measure', 'ruler', 'Measure', 'Measure a length: drag across what you want to measure (M)'],
        ['area', 'polygon', 'Area', 'Measure an area: click round its edge, then click the first point again or double-click (A)'],
        ['count', 'tally', 'Count', 'Count: click on each thing you count; click a mark again to remove it (C)'],
        ['label', 'pin', 'Label', 'Add a label of your own (L)']
      ];
      this.toolBar = h('div.ms-tools', { role: 'group', 'aria-label': 'Tools' });
      tools.forEach(([id, ic, label, title]) => {
        const b = h('button.ms-tool', { type: 'button', title, 'aria-pressed': 'false', html: I(ic) + `<span>${label}</span>` });
        b.addEventListener('click', () => this.tool(id));
        this.toolBtns[id] = b;
        this.toolBar.appendChild(b);
      });
      this.labelsBtn = this._mkBtn('tag', 'Show or hide the labels that come with the slide', () => this.setShowLabels(!this.st.showLabels), '.ms-tg');
      this.eyeBtn = this._mkBtn('eyepiece', 'Eyepiece view, with a graticule (E)', () => this.setEyepiece(!this.st.eyepiece), '.ms-tg');
      this.navBtn = this._mkBtn('map', 'Show or hide the overview of the slide', () => this.toggleNavigator(), '.ms-tg');
      const cap = this._mkBtn('camera', 'Take a picture of the view (saved in Files, in microscope/pictures)', () => this.capture());
      const menu = this._mkBtn('more', 'More', (e) => this._menu(e.currentTarget));
      this.boxBtn = this._mkBtn('slides', 'The slide box', () => this.toggleBox(), '.ms-tg');
      this.bar = h('div.ms-bar', this.boxBtn, this.titleEl, h('span.ms-sep'), this.objBar, h('span.ms-sep'), this.toolBar, h('span.grow'), this.labelsBtn, this.eyeBtn, this.navBtn, cap, menu);

      // the view
      this.viewEl = h('div.ms-osd');
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'ms-svg');
      this.eye = h('div.ms-eye', { hidden: true });
      this.grat = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.grat.setAttribute('class', 'ms-grat');
      this.eye.appendChild(this.grat);
      this.scaleBar = h('div.ms-scale', h('i'), h('span'));
      this.readout = h('div.ms-readout');
      this.banner = h('div.ms-banner', { hidden: true, role: 'status', 'aria-live': 'polite' });
      this.empty = h('div.ms-empty', h('div', h('h3', 'Choose a slide'), h('p', 'Pick a slide from the slide box to start.')));
      this.view = h('div.ms-view', this.viewEl, this.svg, this.eye, this.scaleBar, this.readout, this.banner, this.empty);

      // the side panel
      this.sideTabs = {};
      this.sideBody = h('div.ms-side-b');
      const sideNav = h('div.ms-side-tabs', { role: 'tablist' });
      [['about', 'About'], ['measures', 'Measurements'], ['counts', 'Counts'], ['labels', 'Labels']].forEach(([id, label]) => {
        const b = h('button.ms-stab', { type: 'button', role: 'tab' }, label);
        b.addEventListener('click', () => this.showSide(id));
        this.sideTabs[id] = b;
        sideNav.appendChild(b);
      });
      this.side = h('aside.ms-side', { 'aria-label': 'About the slide, measurements, counts and labels' }, h('div.ms-side-h', sideNav, this._mkBtn('x', 'Close the panel', () => this.showSide(null), '.ms-side-x')), this.sideBody);

      this.main = h('div.ms-main', this.bar, h('div.ms-work', this.view, this.side));
      r.append(this.box, this.main);
      this.root.addEventListener('keydown', (e) => this._key(e));
      this.view.tabIndex = 0;
      this.view.setAttribute('aria-label', 'The slide. Arrow keys move it, + and − zoom, 1 to 6 choose an objective.');
      if (window.ResizeObserver) new ResizeObserver(() => this._layoutChanged()).observe(this.view);
    }
    _mkBtn(ic, title, fn, cls = '') {
      const b = h('button.ms-ib' + cls, { type: 'button', title, 'aria-label': title, html: I(ic) });
      b.addEventListener('click', fn);
      return b;
    }

    async _start() {
      if (!OSD) throw new Error('OpenSeadragon did not load.');
      this.viewer = OSD({
        element: this.viewEl,
        prefixUrl: '',
        showNavigationControl: false,
        showNavigator: true,
        navigatorPosition: 'TOP_RIGHT',
        navigatorSizeRatio: 0.17,
        navigatorAutoFade: false,
        drawer: 'canvas',
        crossOriginPolicy: false,
        maxZoomPixelRatio: 2.3,
        preserveImageSizeOnResize: true, // (a wider or narrower view shows more or less of the slide, at the same magnification)
        minZoomImageRatio: 0.6,
        visibilityRatio: 0.25,
        constrainDuringPan: true,
        animationTime: 0.55,
        springStiffness: 8,
        zoomPerScroll: 1.25,
        zoomPerClick: 2,
        imageLoaderLimit: 8,
        maxImageCacheCount: 500,
        tileRetryMax: 2,
        tileRetryDelay: 1200,
        timeout: 60000,
        immediateRender: false,
        blendTime: 0.1,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true, flickEnabled: true },
        gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchRotate: false, flickEnabled: true },
        keyboardNavEnabled: false,
        background: '#f4f4f4'
      });
      this.viewer.addHandler('animation', () => this._redraw());
      this.viewer.addHandler('update-viewport', () => this._redraw());
      this.viewer.addHandler('resize', () => this._redraw());
      this.viewer.addHandler('animation-finish', () => this._settled());
      this.viewer.addHandler('canvas-press', (e) => this._press(e));
      this.viewer.addHandler('canvas-drag', (e) => this._drag(e));
      this.viewer.addHandler('canvas-release', (e) => this._release(e));
      this.viewer.addHandler('canvas-click', (e) => this._click(e));
      this.viewer.addHandler('canvas-double-click', (e) => this._dblclick(e));
      this.viewer.addHandler('canvas-scroll', (e) => this._scroll(e));
      this.viewer.addHandler('open-failed', (e) => this._failed(e && e.message));
      this.viewer.addHandler('tile-load-failed', () => this._tileFailed());
      this.viewEl.addEventListener('pointermove', (e) => this._hover(e));
      this.navVisible(this.st.navigator !== false);
      this._applyToggles();
      // (the slide box and the side panel take room from the view: on a narrow workbench they start closed)
      const W0 = this.root.clientWidth || 1000;
      this.toggleBox(!this.st.slide || (this.st.box !== false && W0 >= 1200), true);
      try {
        const r = await fetch(SLIDES() + 'index.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.catalogue = await r.json();
      } catch (e) {
        this.boxList.innerHTML = `<p class="ms-none">The list of slides could not be loaded (${esc(e.message || e)}). Open the workbench through a web server (for example <code>python3 serve.py</code>), not as a file.</p>`;
      }
      this._renderBox();
      if (this.st.slide && !this.slide) {
        const s = this.st.slide;
        if (s.startsWith('file:')) {
          if (this.fs.exists(s.slice(5))) await this.openImage(s.slice(5), { quiet: true }).catch(() => {});
        } else if (this._entry(s)) await this.open(s, { restore: true, quiet: true }).catch(() => {});
      }
      this.showSide((this.root.clientWidth || 1000) >= 900 ? this.st.side || null : null, true);
    }
    _narrow() {
      return this.root.clientWidth && this.root.clientWidth < 760;
    }
    shown() {
      setTimeout(() => {
        if (this.viewer) this.viewer.forceRedraw();
        this._redraw();
      }, 30);
    }
    _layoutChanged() {
      this._redraw();
      this._eyeDraw();
    }

    /* ---------------- the slide box ---------------- */
    _entry(id) {
      return (this.catalogue.slides || []).find((s) => s.id === id);
    }
    _renderBox() {
      const q = this.search.value.trim().toLowerCase();
      const list = (this.catalogue.slides || []).filter((s) => !q || (s.title + ' ' + s.system + ' ' + s.description).toLowerCase().includes(q));
      this.boxList.innerHTML = '';
      if (!list.length && (this.catalogue.slides || []).length) this.boxList.appendChild(h('p.ms-none', 'No slide matches.'));
      const groups = {};
      list.forEach((s) => (groups[s.system] = groups[s.system] || []).push(s));
      const order = (this.catalogue.systems || []).concat(Object.keys(groups));
      const seen = new Set();
      order.forEach((sys) => {
        if (seen.has(sys) || !groups[sys]) return;
        seen.add(sys);
        this.boxList.appendChild(h('div.ms-sys', sys));
        groups[sys].forEach((s) => {
          const b = h('button.ms-slide', { type: 'button', role: 'listitem', dataset: { id: s.id }, title: s.description },
            h('img', { src: SLIDES() + s.id + '/thumb.jpg', alt: '', loading: 'lazy', width: 56, height: 56 }),
            h('span.ms-slide-t', h('b', s.title), h('small', s.stain ? s.stain.replace(/ \(.*\)$/, '') : '')));
          b.addEventListener('click', () => {
            this.open(s.id);
            if (this.root.clientWidth < 1200) this.toggleBox(false, true);
          });
          if (this.slide && this.slide.id === s.id) b.classList.add('on');
          this.boxList.appendChild(b);
        });
      });
    }
    toggleBox(on, quiet) {
      on = on == null ? this.box.hidden : !!on;
      this.box.hidden = !on;
      this.boxBtn.classList.toggle('on', on);
      this.boxBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!quiet) {
        this.st.box = on;
        this._save();
      }
      setTimeout(() => this._redraw(), 30);
    }

    /* ---------------- opening slides ---------------- */
    current() {
      return this.slide ? this.slide.id : null;
    }
    /** "slide", "slide@x,y" or "slide@x,y,10x" (x, y in mm from the top left of the slide) */
    async go(spec) {
      const m = /^([^@]+)(?:@\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*x?)?)?$/i.exec(String(spec).trim());
      if (!m) throw new Error('A slide is named like this: kidney-cortex, or kidney-cortex@1.2,0.8,20x');
      const id = m[1].trim(), at = m[2] ? { x: +m[2], y: +m[3], mag: m[4] ? +m[4] : null } : {};
      const ti = this._ti();
      if (this.slide && this.slide.id === id && ti) {
        // the slide is open already: move to the place (or show the whole slide)
        if (at.x != null) {
          this.viewer.viewport.panTo(ti.imageToViewportCoordinates(new OSD.Point((at.x * 1000) / this.slide.mpp, (at.y * 1000) / this.slide.mpp)));
          if (at.mag) this.setMag(at.mag);
        } else this.viewer.viewport.goHome();
        bus.emit('scope:open', { slide: id, title: this.slide.title, system: this.slide.system || '' });
        return this.slide;
      }
      return this.open(id, at);
    }
    async open(id, opts = {}) {
      const e = this._entry(id);
      if (!e) throw new Error(`There is no slide called “${id}” in the slide box.`);
      const base = SLIDES() + id + '/';
      this._loading(true, e.title);
      let info, idx;
      try {
        const [r1, r2] = await Promise.all([fetch(base + 'slide.json'), fetch(base + 'tiles.idx')]);
        if (!r1.ok || !r2.ok) throw new Error('HTTP ' + (r1.ok ? r2.status : r1.status));
        info = await r1.json();
        idx = new Uint32Array(await r2.arrayBuffer());
      } catch (err) {
        this._loading(false);
        this._failed(`The slide could not be loaded (${err.message || err}).`);
        throw err;
      }
      this._clearTasks();
      this.slide = { id, info, base, mpp: info.mpp, title: info.title, system: info.system };
      const ts = tileSource(info, base, idx);
      await this._openSource(ts, opts);
      this._afterOpen(opts);
      return this.slide;
    }
    _openSource(ts, opts) {
      return new Promise((resolve) => {
        const done = () => {
          this.viewer.removeHandler('open', done);
          this.viewer.removeHandler('open-failed', done);
          resolve();
        };
        this.viewer.addHandler('open', done);
        this.viewer.addHandler('open-failed', done);
        this.viewer.open(ts);
      });
    }
    _afterOpen(opts = {}) {
      this._syncSize();
      this._loading(false);
      this.empty.hidden = true;
      const s = this.slide;
      this.titleEl.textContent = s.title;
      this.titleEl.title = 'About this slide: ' + s.title;
      this.st.slide = s.id;
      this._save();
      $$('.ms-slide', this.boxList).forEach((b) => b.classList.toggle('on', b.dataset.id === s.id));
      const v = this.st.views[s.id];
      const ti = this._ti();
      if (opts.x != null && ti) {
        const p = new OSD.Point((opts.x * 1000) / s.mpp, (opts.y * 1000) / s.mpp);
        this.viewer.viewport.panTo(ti.imageToViewportCoordinates(p), true);
        if (opts.mag) this.setMag(opts.mag, true);
      } else if (opts.restore && v && ti) {
        if (v.m) this.setMag(v.m, true);
        else this.viewer.viewport.zoomTo(v.z, null, true);
        this.viewer.viewport.panTo(new OSD.Point(v.x, v.y), true);
      } else if (opts.mag) this.setMag(opts.mag, true);
      this._applyToggles();
      this._renderSide();
      this._redraw();
      this._lastMag = null;
      setTimeout(() => this._settled(), 50);
      if (!opts.quiet || opts.x != null) bus.emit('scope:open', { slide: s.id, title: s.title, system: s.system || '' });
      if (!opts.quiet && this._narrow()) this.showSide(null);
    }
    _loading(on, title) {
      if (on) {
        this.empty.hidden = false;
        this.empty.innerHTML = `<div><span class="spinner"></span><p>Loading ${esc(title || 'the slide')}…</p></div>`;
      } else if (this.slide) this.empty.hidden = true;
    }
    _failed(msg) {
      this.empty.hidden = false;
      this.empty.innerHTML = `<div><h3>The slide could not be shown</h3><p>${esc(msg || 'Something went wrong.')}</p><p>Check your internet connection and try again. If you opened the workbench as a file, open it through a web server instead (for example <code>python3 serve.py</code>).</p></div>`;
    }
    _tileFailed() {
      const t = Date.now();
      if (this._tileWarned && t - this._tileWarned < 30000) return;
      this._tileWarned = t;
      toast('Some parts of the slide could not be loaded. Check your internet connection; the microscope tries again as you move.', 'warn', 6000);
    }
    _ti() {
      return this.viewer && this.viewer.world.getItemCount() ? this.viewer.world.getItemAt(0) : null;
    }

    /* pictures from the user's files: a slide of one picture, with a scale if the student knows it */
    async pickPicture() {
      const fs = this.fs;
      const pics = [];
      for (const [p, e] of fs.entries) if (e.kind !== 'dir' && /\.(png|jpe?g|webp|gif)$/i.test(p) && p.startsWith(MG.app.HOME + '/')) pics.push(p);
      pics.sort();
      if (!pics.length) {
        toast('There are no pictures (PNG or JPEG) in your files yet. Add one with My files → Add files from my computer.', 'warn', 7000);
        return;
      }
      const m = MG.modal('Open a picture as a slide', `<p>Choose a picture from your files. You can set its scale afterwards, to measure in micrometres.</p><div class="ms-picks"></div>`);
      const list = m.box.querySelector('.ms-picks');
      pics.forEach((p) => {
        const b = h('button.tbtn', { type: 'button', html: I('image') + `<span>${esc(fs.pretty(p))}</span>` });
        b.addEventListener('click', () => {
          m.close();
          this.openImage(p);
        });
        list.appendChild(b);
      });
    }
    async openImage(path, opts = {}) {
      const fs = this.fs;
      const blob = await fs.toBlob(path);
      const url = URL.createObjectURL(blob);
      const size = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => rej(new Error('This picture could not be read.'));
        im.src = url;
      });
      this._clearTasks();
      const id = 'file:' + path;
      const mpp = this.st.scales[path] || null;
      this.slide = { id, file: path, base: null, mpp, title: path.split('/').pop(), system: 'My pictures', info: { title: path.split('/').pop(), width: size.w, height: size.h, labels: [], description: 'A picture from your files: ' + fs.pretty(path) + '.' } };
      if (this._picUrl) URL.revokeObjectURL(this._picUrl);
      this._picUrl = url;
      await this._openSource({ type: 'image', url, buildPyramid: true }, {});
      this._afterOpen(opts);
      if (!mpp && !opts.quiet) toast('This picture has no scale yet, so lengths are in pixels. Use <b>⋯ → Set the scale</b> to measure in micrometres.', null, 7000);
    }
    /** the scale of a picture: draw along a scale bar (or anything of known length), then give its length */
    async setScale() {
      if (!this.slide) return;
      if (!this.slide.file) {
        toast('The slides of the slide box have their scale already. You can set the scale of pictures from your files.', null, 5000);
        return;
      }
      this.tool('measure');
      this._scaleMode = true;
      this._showBanner('Draw a line along the picture’s scale bar (or anything whose length you know). Then type its length.', 'info', [['Cancel', () => this._endScale()]]);
    }
    /** a new slide: a find task, the setting of a scale and their messages belong to the old one */
    _clearTasks() {
      this.findTask = null;
      this._scaleMode = false;
      this._hideBanner();
    }
    _endScale() {
      this._scaleMode = false;
      this._hideBanner();
      this.tool('pan');
    }

    /* ---------------- objectives, the view, the scale bar ---------------- */
    mag() {
      const ti = this._ti();
      if (!ti || !this.slide) return 0;
      const imgZoom = ti.viewportToImageZoom(this.viewer.viewport.getZoom(true));
      return (imgZoom * umPerPx(1)) / (this.slide.mpp || U20) / 1; // screen px per image px × µm per screen px at 1x / µm per image px
    }
    /** OpenSeadragon only notices a change in the size of the view at its next frame (and not while it opens a slide):
        bring its idea of the size up to date before a magnification is turned into a zoom */
    _syncSize() {
      const v = this.viewer && this.viewer.viewport;
      const W = this.viewEl.clientWidth, H = this.viewEl.clientHeight;
      if (!v || !W || !H) return;
      const cs = v.getContainerSize();
      if (Math.abs(cs.x - W) > 0.5 || Math.abs(cs.y - H) > 0.5) v.resize(new OSD.Point(W, H), true);
    }
    setMag(m, immediately) {
      const ti = this._ti();
      if (!ti || !this.slide) return;
      this._syncSize();
      const imgZoom = (this.slide.mpp || U20) / umPerPx(m);
      this.viewer.viewport.zoomTo(ti.imageToViewportZoom(imgZoom), null, !!immediately);
      if (!immediately) this.viewer.viewport.applyConstraints();
    }
    _redraw() {
      if (!this.viewer) return;
      const m = this.mag();
      // the objective buttons
      const near = m ? nearestObj(m) : 0;
      $$('.ms-obj', this.objBar).forEach((b) => b.classList.toggle('on', m && +b.dataset.mag === near && Math.abs(Math.log(m / near)) < 0.08));
      this._scaleDraw(m);
      this._overlayDraw();
    }
    _scaleDraw(m) {
      if (!m || !this.slide) {
        this.scaleBar.hidden = true;
        this.readout.textContent = '';
        return;
      }
      const hasScale = !!this.slide.mpp;
      const u = hasScale ? umPerPx(m) : 1 / (this._ti().viewportToImageZoom(this.viewer.viewport.getZoom(true)) || 1); // µm (or pixels) per screen pixel
      // a round length of about 110 screen pixels
      const target = 110 * u;
      const p10 = Math.pow(10, Math.floor(Math.log10(target)));
      const nice = [1, 2, 5, 10].map((k) => k * p10).reduce((b, x) => (Math.abs(x - target) < Math.abs(b - target) ? x : b));
      this.scaleBar.hidden = false;
      this.scaleBar.querySelector('i').style.width = Math.round(nice / u) + 'px';
      this.scaleBar.querySelector('span').textContent = hasScale ? fmtLen(nice) : nice + ' px';
      const w = this.view.clientWidth * u, hh = this.view.clientHeight * u;
      this.readout.textContent = hasScale ? `${fmtMag(m)} · field ${fmtLen(w)} × ${fmtLen(hh)}` : `${fmtMag(m)} (no scale)`;
    }
    _settled() {
      if (!this.slide) return;
      const vp = this.viewer.viewport;
      const c = vp.getCenter(true), z = vp.getZoom(true);
      const m = this.mag();
      // (the magnification is kept too: the zoom alone would give another magnification in a view of another width)
      this.st.views[this.slide.id] = { x: +c.x.toFixed(6), y: +c.y.toFixed(6), z: +z.toFixed(6), m: +m.toFixed(4) };
      this._save();
      const near = nearestObj(m);
      if (this._lastMag !== near) {
        this._lastMag = near;
        bus.emit('scope:mag', { slide: this.slide.id, mag: near });
      }
      const ti = this._ti();
      if (ti && this.slide.mpp) {
        const p = ti.viewportToImageCoordinates(c);
        bus.emit('scope:view', { slide: this.slide.id, mag: near, x: +((p.x * this.slide.mpp) / 1000).toFixed(3), y: +((p.y * this.slide.mpp) / 1000).toFixed(3) });
      }
    }
    navVisible(on) {
      const nav = this.viewer && this.viewer.navigator;
      if (nav && nav.element) nav.element.style.display = on ? '' : 'none';
      this.navBtn.classList.toggle('on', on);
      this.navBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    toggleNavigator() {
      this.st.navigator = this.st.navigator === false;
      this.navVisible(this.st.navigator);
      this._save();
    }

    /* ---------------- the eyepiece ---------------- */
    setEyepiece(on) {
      this.st.eyepiece = !!on;
      this._save();
      this._applyToggles();
      if (on && this.slide) this.setMag(nearestObj(this.mag() || 10));
      bus.emit('scope:eyepiece', { on: !!on });
    }
    _applyToggles() {
      this.eye.hidden = !this.st.eyepiece;
      this.eyeBtn.classList.toggle('on', !!this.st.eyepiece);
      this.eyeBtn.setAttribute('aria-pressed', this.st.eyepiece ? 'true' : 'false');
      this.labelsBtn.classList.toggle('on', !!this.st.showLabels);
      this.labelsBtn.setAttribute('aria-pressed', this.st.showLabels ? 'true' : 'false');
      this.root.classList.toggle('ms-eyepiece', !!this.st.eyepiece);
      this._eyeDraw();
      this._overlayDraw();
    }
    /** the radius of the eyepiece's field of view: as big as the view allows, up to 230 pixels (a field of view of a
        fixed size, as in a real eyepiece) */
    _eyeR() {
      const W = this.view.clientWidth, H = this.view.clientHeight;
      return Math.max(60, Math.min(230, Math.min(W, H) / 2 - 8));
    }
    _eyeDraw() {
      if (!this.st.eyepiece) return;
      const W = this.view.clientWidth, H = this.view.clientHeight;
      const R = this._eyeR();
      this.eye.style.setProperty('--eye-r', R + 'px');
      // the graticule: 100 divisions of DIV_PX screen pixels across the middle of the field
      const n = 100, div = DIV_PX, len = n * div; // (fixed, as an eyepiece's graticule is: on a small screen its ends may lie outside the field)
      const x0 = W / 2 - len / 2, y = H / 2;
      // (its divisions hang down from the line, so that a scale on the slide with marks that stand up from a line – the
      // stage micrometer – can be laid against it, edge to edge)
      let d = '';
      for (let k = 0; k <= n; k++) {
        const t = k % 10 === 0 ? 14 : k % 5 === 0 ? 10 : 6;
        d += `M${x0 + k * div} ${y}v${t}`;
      }
      let nums = '';
      for (let k = 0; k <= n; k += 10) nums += `<text x="${x0 + k * div}" y="${y + 27}">${k}</text>`;
      this.grat.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this.grat.innerHTML = `<path class="g" d="M${x0} ${y}h${len}${d}"/>${nums}`;
    }

    /* ---------------- tools ---------------- */
    /** choose a tool: pan, measure, area, count, label; or capture (take a picture), eyepiece (switch the eyepiece view
        on or off; 'eyepiece:on', 'eyepiece:off'), labels (show the slide's labels; 'labels:off' hides them).
        'measure:glomerulus' (or 'area:…') also gives new measurements that label; 'count:Living cells,Dead cells' also
        sets the categories to count (they replace the categories if none has been used, else are added) */
    tool(name) {
      let arg = null;
      const cut = String(name).indexOf(':');
      if (cut > 0) {
        arg = String(name).slice(cut + 1).trim();
        name = String(name).slice(0, cut);
      }
      if (name === 'capture') return this.capture();
      if (name === 'eyepiece') return this.setEyepiece(arg == null ? !this.st.eyepiece : arg !== 'off');
      if (name === 'labels') return this.setShowLabels(arg !== 'off');
      if (arg != null) {
        if (name === 'measure' || name === 'area') this.st.mlabel = arg.slice(0, 60);
        if (name === 'count' && arg) this._setCats(arg.split(',').map((x) => x.trim()).filter(Boolean));
        this._save();
      }
      if (!this.toolBtns[name]) throw new Error('The microscope has no tool called ' + name);
      this.toolName = name;
      this.pending = null;
      Object.entries(this.toolBtns).forEach(([k, b]) => {
        b.classList.toggle('on', k === name);
        b.setAttribute('aria-pressed', k === name ? 'true' : 'false');
      });
      this.root.dataset.tool = name;
      if (name === 'count') this.showSide('counts');
      if (name === 'measure' || name === 'area') this.showSide('measures');
      this._overlayDraw();
      bus.emit('scope:tool', { name });
    }
    _setCats(names) {
      const used = new Set(this.st.counts.map((c) => c.cat));
      if (!this.st.cats.some((x, k) => used.has(k))) this.st.cats = names.slice(0, CAT_COLOURS.length);
      else names.forEach((n) => {
        if (!this.st.cats.includes(n) && this.st.cats.length < CAT_COLOURS.length) this.st.cats.push(n);
      });
      const k = this.st.cats.indexOf(names[0]);
      this.st.cat = k >= 0 ? k : 0;
      this._renderSide();
    }
    _img(e) {
      const ti = this._ti();
      return ti ? ti.viewerElementToImageCoordinates(e.position) : null;
    }
    _screen(x, y) {
      const ti = this._ti();
      return ti ? ti.imageToViewerElementCoordinates(new OSD.Point(x, y)) : { x: 0, y: 0 };
    }
    _press(e) {
      if (!this.slide) return;
      if (this.toolName === 'measure') {
        const p = this._img(e);
        if (this.pending && this.pending.kind === 'length' && this.pending.click) return; // (the second click ends it: see _click)
        this.pending = { kind: 'length', a: p, b: p, start: e.position };
      }
    }
    _drag(e) {
      if (!this.slide) return;
      if (this.toolName === 'measure' && this.pending) {
        e.preventDefaultAction = true;
        this.pending.b = this._img(e);
        this.pending.dragged = true;
        this._overlayDraw();
      } else if (this.toolName !== 'pan' && this.toolName !== 'measure') {
        // (counting, labelling and areas: dragging still moves the slide)
      }
    }
    _release(e) {
      if (!this.slide || this.toolName !== 'measure' || !this.pending) return;
      const P = this.pending;
      if (P.dragged && dist(this._screen(P.a.x, P.a.y), this._screen(P.b.x, P.b.y)) > 4) {
        this.pending = null;
        this._addLength(P.a, P.b);
      } else if (!P.click) {
        // a click without dragging: the line follows the pointer until the next click
        P.click = true;
        P.dragged = false;
      }
    }
    _click(e) {
      if (!this.slide || !e.quick) return;
      const p = this._img(e);
      if (this.findTask) {
        e.preventDefaultAction = true;
        return this._findClick(p);
      }
      if (this.toolName === 'measure') {
        e.preventDefaultAction = true;
        const P = this.pending;
        if (P && P.click && P.moved) {
          this.pending = null;
          this._addLength(P.a, p);
        }
        return;
      }
      if (this.toolName === 'area') {
        e.preventDefaultAction = true;
        const P = this.pending && this.pending.kind === 'area' ? this.pending : (this.pending = { kind: 'area', pts: [] });
        if (P.pts.length >= 3 && dist(this._screen(P.pts[0].x, P.pts[0].y), e.position) < 10) return this._finishArea();
        P.pts.push({ x: p.x, y: p.y });
        this._overlayDraw();
        return;
      }
      if (this.toolName === 'count') {
        e.preventDefaultAction = true;
        return this._countAt(p, e.position);
      }
      if (this.toolName === 'label') {
        e.preventDefaultAction = true;
        return this._labelAt(p, e.position);
      }
    }
    _dblclick(e) {
      if (this.toolName === 'area' && this.pending && this.pending.kind === 'area') {
        e.preventDefaultAction = true;
        this._finishArea();
      } else if (this.toolName !== 'pan') e.preventDefaultAction = true;
    }
    _scroll(e) {
      // in the eyepiece view the objectives click from one to the next, as on a microscope
      if (!this.st.eyepiece || !this.slide) return;
      e.preventDefaultAction = true;
      const now = Date.now();
      if (this._lastScroll && now - this._lastScroll < 250) return;
      this._lastScroll = now;
      const cur = nearestObj(this.mag());
      const k = OBJ.indexOf(cur) + (e.scroll > 0 ? 1 : -1);
      if (k >= 0 && k < OBJ.length) this.setMag(OBJ[k]);
    }
    _hover(ev) {
      const P = this.pending;
      if (!P || !this.slide) return;
      const r = this.viewEl.getBoundingClientRect();
      const ti = this._ti();
      if (!ti) return;
      const p = ti.viewerElementToImageCoordinates(new OSD.Point(ev.clientX - r.left, ev.clientY - r.top));
      if (P.kind === 'length' && P.click) {
        P.b = p;
        P.moved = true;
        this._overlayDraw();
      } else if (P.kind === 'area') {
        P.hover = p;
        this._overlayDraw();
      }
    }
    _key(e) {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!this.slide) return;
      const vp = this.viewer.viewport;
      const k = e.key;
      if (/^[1-9]$/.test(k) && OBJ[+k - 1]) {
        this.setMag(OBJ[+k - 1]);
        return e.preventDefault();
      }
      if (k === '+' || k === '=') return vp.zoomBy(1.25), vp.applyConstraints(), e.preventDefault();
      if (k === '-' || k === '_') return vp.zoomBy(0.8), vp.applyConstraints(), e.preventDefault();
      const step = 0.08 / vp.getZoom(true);
      const pan = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (pan && !e.ctrlKey && !e.metaKey) {
        vp.panBy(new OSD.Point(pan[0], pan[1]));
        vp.applyConstraints();
        return e.preventDefault();
      }
      const t = { m: 'measure', a: 'area', c: 'count', l: 'label', h: 'pan' }[k.toLowerCase()];
      if (t && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.tool(t);
        return e.preventDefault();
      }
      if (k.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) return this.setEyepiece(!this.st.eyepiece), e.preventDefault();
      if (k === 'Escape') {
        if (this.pending) {
          this.pending = null;
          this._overlayDraw();
        } else if (this.findTask) this.cancelFind();
        else this.tool('pan');
        e.preventDefault();
      }
      if ((k === 'Enter') && this.pending && this.pending.kind === 'area') this._finishArea();
    }

    /* ---------------- measurements ---------------- */
    _mineFor(list) {
      return this.slide ? list.filter((x) => x.slide === this.slide.id) : [];
    }
    async _addLength(a, b) {
      const s = this.slide;
      const px = dist(a, b);
      if (this._scaleMode) {
        const v = await MG.promptText('The scale of this picture', `The line is ${px.toFixed(1)} pixels long. How long is it in micrometres (µm)? (For a scale bar of 0.1 mm, type 100.)`, '', 'Set the scale');
        this._endScale();
        const um = parseFloat(String(v).replace(',', '.'));
        if (!(um > 0)) return;
        s.mpp = um / px;
        this.st.scales[s.file] = s.mpp;
        this._save();
        this._redraw();
        this._renderSide();
        toast(`Scale set: ${(1 / s.mpp).toFixed(2)} pixels per micrometre (${s.mpp.toFixed(3)} µm per pixel).`, 'ok');
        bus.emit('scope:scale', { slide: s.id, mpp: s.mpp });
        return;
      }
      const um = s.mpp ? px * s.mpp : null;
      const M = { id: uid(), slide: s.id, kind: 'length', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, value: um != null ? +um.toFixed(2) : +px.toFixed(1), unit: um != null ? 'µm' : 'px', mag: nearestObj(this.mag()), time: nowISO(), label: this.st.mlabel || '' };
      this.st.measures.push(M);
      this._changed('measures');
      bus.emit('scope:measure', { slide: s.id, kind: 'length', value: M.value, unit: M.unit, label: M.label, n: this._mineFor(this.st.measures).length });
    }
    _finishArea() {
      const P = this.pending;
      this.pending = null;
      if (!P || P.pts.length < 3) {
        this._overlayDraw();
        return;
      }
      const s = this.slide;
      const a = polyArea(P.pts), per = polyPerimeter(P.pts);
      const sc = s.mpp || null;
      const M = { id: uid(), slide: s.id, kind: 'area', pts: P.pts, value: sc ? +(a * sc * sc).toFixed(1) : +a.toFixed(0), unit: sc ? 'µm²' : 'px²', perimeter: sc ? +(per * sc).toFixed(1) : +per.toFixed(1), mag: nearestObj(this.mag()), time: nowISO(), label: this.st.mlabel || '' };
      this.st.measures.push(M);
      this._changed('measures');
      bus.emit('scope:measure', { slide: s.id, kind: 'area', value: M.value, unit: M.unit, label: M.label, n: this._mineFor(this.st.measures).length });
    }
    removeMeasure(id) {
      this.st.measures = this.st.measures.filter((m) => m.id !== id);
      this._changed('measures');
    }

    /* ---------------- counting ---------------- */
    _countAt(p, screenPos) {
      const s = this.slide;
      // a click on a mark removes it
      const near = this._mineFor(this.st.counts).find((c) => dist(this._screen(c.x, c.y), screenPos) < 9);
      if (near) {
        this.st.counts = this.st.counts.filter((c) => c !== near);
        this._changed('counts');
        return;
      }
      const cat = this.st.cat || 0;
      this.st.counts.push({ id: uid(), slide: s.id, cat, x: p.x, y: p.y, mag: nearestObj(this.mag()), time: nowISO() });
      this._changed('counts');
      const mine = this._mineFor(this.st.counts);
      bus.emit('scope:count', { slide: s.id, category: this.st.cats[cat], n: mine.filter((c) => c.cat === cat).length, total: mine.length });
    }
    clearCounts() {
      if (!this.slide) return;
      this.st.counts = this.st.counts.filter((c) => c.slide !== this.slide.id);
      this._changed('counts');
    }

    /* ---------------- labels of the student's own ---------------- */
    async _labelAt(p, screenPos) {
      const s = this.slide;
      const near = this._mineFor(this.st.labels).find((L) => dist(this._screen(L.x, L.y), screenPos) < 12);
      if (near) {
        const t = await MG.promptText('Change the label', 'The label’s text (leave it empty to delete the label):', near.text, 'Save');
        if (t === '' && (await MG.confirmBox('Delete the label?', `<p>Delete “${esc(near.text)}”?</p>`, 'Delete', { danger: true }))) this.st.labels = this.st.labels.filter((x) => x !== near);
        else if (t) near.text = t;
        this._changed('labels');
        return;
      }
      const t = await MG.promptText('Add a label', 'What is here?', '', 'Add the label');
      if (!t) return;
      this.st.labels.push({ id: uid(), slide: s.id, x: p.x, y: p.y, text: t, time: nowISO() });
      this._changed('labels');
      bus.emit('scope:label', { slide: s.id, text: t });
    }
    setShowLabels(on) {
      this.st.showLabels = !!on;
      this._save();
      this._applyToggles();
      bus.emit('scope:labels', { on: !!on });
    }

    _changed(what) {
      this._save();
      this._overlayDraw();
      this._renderSide();
      this._mirror();
    }

    /* ---------------- the files that R can read ---------------- */
    _writeCsv() {
      const fs = this.fs;
      const H = MG.app.HOME + '/microscope';
      try {
        fs.mkdirp(H);
        const ms = this.st.measures;
        if (ms.length || fs.exists(H + '/measurements.csv')) {
          const rows = [['slide', 'kind', 'label', 'value', 'unit', 'perimeter_um', 'objective', 'x_um', 'y_um', 'time']];
          ms.forEach((m) => {
            const sc = m.unit.startsWith('µm') ? this._mppOf(m.slide) : 1;
            const c = m.kind === 'area' ? centroid(m.pts) : { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
            rows.push([m.slide.replace(/^file:/, ''), m.kind, m.label || '', m.value, m.unit === 'µm' ? 'um' : m.unit === 'µm²' ? 'um2' : m.unit, m.kind === 'area' && m.unit === 'µm²' ? m.perimeter : '', m.mag + 'x', (c.x * sc).toFixed(1), (c.y * sc).toFixed(1), m.time]);
          });
          const text = rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
          if (!fs.exists(H + '/measurements.csv') || this._lastMeas !== text) fs.writeText(H + '/measurements.csv', text);
          this._lastMeas = text;
        }
        const cs = this.st.counts;
        if (cs.length || fs.exists(H + '/counts.csv')) {
          const rows = [['slide', 'category', 'x_um', 'y_um', 'objective', 'time']];
          cs.forEach((c) => {
            const sc = this._mppOf(c.slide) || 1;
            rows.push([c.slide.replace(/^file:/, ''), this.st.cats[c.cat] || 'Category ' + (c.cat + 1), (c.x * sc).toFixed(1), (c.y * sc).toFixed(1), c.mag + 'x', c.time]);
          });
          const text = rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
          if (!fs.exists(H + '/counts.csv') || this._lastCounts !== text) fs.writeText(H + '/counts.csv', text);
          this._lastCounts = text;
        }
      } catch (e) {
        console.error(e);
      }
    }
    _mppOf(slideId) {
      if (this.slide && this.slide.id === slideId) return this.slide.mpp || 1;
      if (slideId.startsWith('file:')) return this.st.scales[slideId.slice(5)] || 1;
      const e = this._entry(slideId);
      return e ? e.mpp : 1;
    }

    /* ---------------- drawing on top of the slide ---------------- */
    _overlayDraw() {
      const svg = this.svg;
      if (!svg) return;
      const W = this.view.clientWidth, H = this.view.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      if (!this.slide || !this._ti()) {
        svg.innerHTML = '';
        return;
      }
      const S = (x, y) => this._screen(x, y);
      const parts = [];
      const vis = (p) => p.x > -200 && p.y > -200 && p.x < W + 200 && p.y < H + 200;
      // the slide's own labels (not while the student is asked to find something)
      const info = this.slide.info || {};
      if (this.st.showLabels && !this.findTask && Array.isArray(info.labels)) {
        info.labels.forEach((L) => {
          const p = S(L.x, L.y);
          if (L.poly) parts.push(`<path class="ms-region" d="M${L.poly.map(([x, y]) => { const q = S(x, y); return q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('L')}Z"/>`);
          else if (L.r) {
            const q = S(L.x + L.r, L.y);
            parts.push(`<circle class="ms-region" cx="${p.x}" cy="${p.y}" r="${Math.abs(q.x - p.x)}"/>`);
          }
          if (vis(p)) parts.push(this._pin(p, L.text, 'ms-tlabel'));
        });
      }
      // the student's labels
      this._mineFor(this.st.labels).forEach((L) => {
        const p = S(L.x, L.y);
        if (vis(p)) parts.push(this._pin(p, L.text, 'ms-mylabel'));
      });
      // measurements
      this._mineFor(this.st.measures).forEach((m) => {
        if (m.kind === 'length') {
          const a = S(m.a.x, m.a.y), b = S(m.b.x, m.b.y);
          parts.push(this._line(a, b, (m.label ? m.label + ': ' : '') + this._val(m), 'ms-meas'));
        } else {
          const pts = m.pts.map((q) => S(q.x, q.y));
          const c = centroid(pts);
          parts.push(`<path class="ms-area" d="M${pts.map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join('L')}Z"/>` + this._tag(c, (m.label ? m.label + ': ' : '') + this._val(m), 'ms-meas'));
        }
      });
      // the measurement being drawn
      const P = this.pending;
      if (P && P.kind === 'length' && P.a && P.b) {
        const a = S(P.a.x, P.a.y), b = S(P.b.x, P.b.y);
        const px = dist(P.a, P.b);
        const txt = this._scaleMode ? px.toFixed(0) + ' px' : this.slide.mpp ? fmtLen(px * this.slide.mpp) : px.toFixed(0) + ' px';
        parts.push(this._line(a, b, txt, 'ms-meas ms-live'));
      } else if (P && P.kind === 'area' && P.pts.length) {
        const pts = P.pts.map((q) => S(q.x, q.y));
        if (P.hover) pts.push(S(P.hover.x, P.hover.y));
        parts.push(`<path class="ms-area ms-live" d="M${pts.map((q) => q.x.toFixed(1) + ' ' + q.y.toFixed(1)).join('L')}${pts.length > 2 ? 'Z' : ''}"/>`);
        P.pts.forEach((q, k) => {
          const s = S(q.x, q.y);
          parts.push(`<circle class="ms-vertex${k === 0 ? ' first' : ''}" cx="${s.x}" cy="${s.y}" r="${k === 0 ? 5 : 3.5}"/>`);
        });
      }
      // counts
      this._mineFor(this.st.counts).forEach((c) => {
        const p = S(c.x, c.y);
        if (!vis(p)) return;
        const col = CAT_COLOURS[c.cat % CAT_COLOURS.length];
        parts.push(`<g class="ms-mark"><circle cx="${p.x}" cy="${p.y}" r="6.5" fill="${col}"/><path d="M${p.x - 3} ${p.y}h6M${p.x} ${p.y - 3}v6" stroke="#fff" stroke-width="1.6"/></g>`);
      });
      svg.innerHTML = parts.join('');
    }
    _val(m) {
      if (m.unit === 'µm') return fmtLen(m.value);
      if (m.unit === 'µm²') return fmtArea(m.value);
      return m.value + ' ' + m.unit;
    }
    _line(a, b, text, cls) {
      const ang = Math.atan2(b.y - a.y, b.x - a.x), nx = -Math.sin(ang) * 5, ny = Math.cos(ang) * 5;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return `<g class="${cls}"><path class="ms-line-bg" d="M${a.x} ${a.y}L${b.x} ${b.y}"/><path class="ms-line" d="M${a.x} ${a.y}L${b.x} ${b.y}M${a.x - nx} ${a.y - ny}L${a.x + nx} ${a.y + ny}M${b.x - nx} ${b.y - ny}L${b.x + nx} ${b.y + ny}"/></g>` + this._tag({ x: mid.x, y: mid.y - 14 }, text, cls);
    }
    _tag(p, text, cls) {
      const w = text.length * 6.6 + 12;
      return `<g class="${cls} ms-tagg"><rect x="${p.x - w / 2}" y="${p.y - 10}" width="${w}" height="20" rx="10"/><text x="${p.x}" y="${p.y + 4}">${esc(text)}</text></g>`;
    }
    _pin(p, text, cls) {
      // the label goes to the right of its pin, or to the left near the right-hand edge of the view
      const w = text.length * 6.7 + 14;
      const W = (this.view && this.view.clientWidth) || 1e9;
      const left = p.x + 14 + w > W - 4 && p.x - 14 - w >= 4;
      const x0 = left ? p.x - 14 - w : p.x + 14, lx = left ? p.x - 14 : p.x + 14;
      return `<g class="${cls}"><circle cx="${p.x}" cy="${p.y}" r="5"/><path d="M${p.x} ${p.y}L${lx} ${p.y - 14}"/><rect x="${x0}" y="${p.y - 26}" width="${w}" height="22" rx="5"/><text x="${x0 + 7}" y="${p.y - 11}">${esc(text)}</text></g>`;
    }

    /* ---------------- find tasks: "find the … and click on it" ---------------- */
    async find(slideId, key) {
      if (!this.slide || this.slide.id !== slideId) await this.open(slideId, { quiet: true });
      const labels = (this.slide.info.labels || []).filter((L) => (L.key || L.id) === key && (L.r || L.poly));
      if (!labels.length) throw new Error(`The slide ${slideId} has no structure called “${key}” to find.`);
      this.findTask = { slide: slideId, key, text: labels[0].find || labels[0].text, labels, tries: 0 };
      this.tool('pan');
      this._findBanner();
      this._overlayDraw();
    }
    _findBanner(msg, kind) {
      const T = this.findTask;
      if (!T) return;
      const acts = [['Show me', () => this._findShow()], ['Stop', () => this.cancelFind()]];
      this._showBanner(msg || `Find <b>${esc(T.text)}</b> and click on it. Use the objectives to look closely.`, kind || 'find', acts);
    }
    _findClick(p) {
      const T = this.findTask;
      const ti = this._ti();
      const zoom = ti ? ti.viewportToImageZoom(this.viewer.viewport.getZoom(true)) : 1; // screen pixels per image pixel
      const tol = 6 / Math.max(zoom, 1e-6);
      const hit = T.labels.find((L) => inLabel(p, L)) || T.labels.find((L) => nearLabel(p, L, tol));
      bus.emit('scope:find', { slide: T.slide, target: T.key, ok: !!hit });
      if (hit) {
        this._showBanner(`✓ Yes – that is ${esc(T.text)}.`, 'ok', [['Done', () => this.cancelFind()]]);
        this.findTask = null;
        this._overlayDraw();
        setTimeout(() => {
          if (!this.findTask && this.banner.classList.contains('ok')) this._hideBanner();
        }, 6000);
      } else {
        T.tries++;
        this._findBanner(`Not there. Keep looking for <b>${esc(T.text)}</b>${T.tries >= 3 ? ' – or click “Show me”' : ''}.`, 'no');
      }
    }
    _findShow() {
      const T = this.findTask;
      if (!T) return;
      const L = T.labels[0];
      const ti = this._ti();
      this.viewer.viewport.panTo(ti.imageToViewportCoordinates(new OSD.Point(L.x, L.y)));
      this.findTask = null;
      const was = this.st.showLabels;
      this.st.showLabels = true;
      this._applyToggles();
      this.st.showLabels = was;
      this._showBanner(`Here it is: ${esc(T.text)}.`, 'info', [['Done', () => this.cancelFind()]]);
      bus.emit('scope:find', { slide: T.slide, target: T.key, ok: false, shown: true });
    }
    cancelFind(quiet) {
      this.findTask = null;
      if (!quiet || this.banner.classList.contains('find') || this.banner.classList.contains('no')) this._hideBanner();
      this._applyToggles();
    }
    _showBanner(html, kind, actions) {
      const b = this.banner;
      b.className = 'ms-banner ' + (kind || 'info');
      b.innerHTML = `<span>${html}</span>`;
      (actions || []).forEach(([label, fn]) => {
        const x = h('button.tbtn', { type: 'button' }, label);
        x.addEventListener('click', fn);
        b.appendChild(x);
      });
      b.hidden = false;
    }
    _hideBanner() {
      this.banner.hidden = true;
    }

    /* ---------------- pictures ---------------- */
    async capture(opts = {}) {
      if (!this.slide) return toast('Open a slide first.', 'warn');
      const cv = this.viewer.drawer && this.viewer.drawer.canvas;
      if (!cv) return toast('The picture could not be taken in this browser.', 'error');
      const W = this.view.clientWidth, Hh = this.view.clientHeight;
      const dpr = cv.width / W || 1;
      // the caption under the picture, wrapped to its width
      const credit = (this.slide.info.source && this.slide.info.source.credit) || '';
      const date = new Date().toLocaleDateString('en-GB');
      const who = MG.user && MG.user.name() !== MG.user.DEFAULT ? ' · ' + MG.user.name() : '';
      const m = this.mag();
      const title = `${this.slide.title} · ${this.slide.info.stain ? this.slide.info.stain.replace(/ \(.*\)$/, '') + ' · ' : ''}${fmtMag(m)}${who} · ${date}`;
      const meas = document.createElement('canvas').getContext('2d');
      const wrap = (text, font) => {
        meas.font = font;
        const out = [];
        let line = '';
        for (const w of String(text).split(' ')) {
          const t = line ? line + ' ' + w : w;
          if (meas.measureText(t).width > W - 20 && line) {
            out.push(line);
            line = w;
          } else line = t;
        }
        if (line) out.push(line);
        return out;
      };
      const F1 = '600 13px system-ui, sans-serif', F2 = '11px system-ui, sans-serif';
      const L1 = wrap(title, F1), L2 = credit ? wrap(credit, F2) : [];
      const foot = 12 + L1.length * 17 + L2.length * 14 + 6;
      const out = document.createElement('canvas');
      out.width = Math.round(W * dpr);
      out.height = Math.round((Hh + foot) * dpr);
      const g = out.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, out.width, out.height);
      try {
        g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, out.width, Math.round(Hh * dpr));
      } catch (e) {
        return toast('The picture could not be taken: ' + esc(e.message || e), 'error');
      }
      g.scale(dpr, dpr);
      // what is drawn on the slide
      await this._drawSvgOn(g, W, Hh);
      if (this.st.eyepiece) {
        const R = this._eyeR();
        g.save();
        g.fillStyle = '#000';
        g.beginPath();
        g.rect(0, 0, W, Hh);
        g.arc(W / 2, Hh / 2, R, 0, Math.PI * 2, true);
        g.fill('evenodd');
        g.restore();
      }
      // the scale bar
      if (this.slide.mpp) {
        const u = umPerPx(m);
        const target = 120 * u, p10 = Math.pow(10, Math.floor(Math.log10(target)));
        const nice = [1, 2, 5, 10].map((k) => k * p10).reduce((b, x) => (Math.abs(x - target) < Math.abs(b - target) ? x : b));
        const len = nice / u;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(12, Hh - 40, len + 20, 30);
        g.fillStyle = '#111';
        g.fillRect(22, Hh - 20, len, 5);
        g.font = '600 12px system-ui, sans-serif';
        g.fillText(fmtLen(nice), 22, Hh - 25);
      }
      // the caption
      let yy = Hh + 18;
      g.fillStyle = '#222';
      g.font = F1;
      L1.forEach((t) => (g.fillText(t, 10, yy), (yy += 17)));
      g.fillStyle = '#666';
      g.font = F2;
      L2.forEach((t) => (g.fillText(t, 10, yy), (yy += 14)));
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (!blob) return toast('The picture could not be made.', 'error');
      const base = (this.slide.file ? this.slide.title.replace(/\.[^.]+$/, '') : this.slide.id) + '-' + Math.round(m) + 'x';
      const fs = this.fs;
      const dir = MG.app.HOME + '/microscope/pictures';
      fs.mkdirp(dir);
      let k = 1, path;
      do path = `${dir}/${base}-${k++}.png`;
      while (fs.exists(path));
      const p = await MG.app.saveToFiles(path.split('/').pop(), blob, { folder: '~/microscope/pictures', ask: false });
      if (p) bus.emit('scope:capture', { slide: this.slide.id, path: p });
      if (opts.download) MG.downloadBlob(blob, path.split('/').pop());
      return p;
    }
    _drawSvgOn(g, W, H) {
      return new Promise((resolve) => {
        const xml = new XMLSerializer().serializeToString(this.svg);
        const css = `<style>${SVG_CSS}</style>`;
        const src = xml.replace(/^<svg([^>]*)>/, (m, attrs) => `<svg${/xmlns=/.test(attrs) ? '' : ' xmlns="http://www.w3.org/2000/svg"'}${attrs} width="${W}" height="${H}">${css}`);
        const im = new Image();
        im.onload = () => {
          g.drawImage(im, 0, 0, W, H);
          resolve();
        };
        im.onerror = () => resolve();
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
      });
    }

    /* ---------------- the side panel ---------------- */
    showSide(id, quiet) {
      this.st.side = id;
      if (!quiet) this._save();
      if (id && !quiet) bus.emit('scope:panel', { name: id });
      this.side.hidden = !id;
      Object.entries(this.sideTabs).forEach(([k, b]) => {
        b.classList.toggle('on', k === id);
        b.setAttribute('aria-selected', k === id ? 'true' : 'false');
      });
      this._renderSide();
      setTimeout(() => this._redraw(), 30);
    }
    _renderSide() {
      const id = this.st.side;
      if (!id || this.side.hidden) return;
      const B = this.sideBody;
      B.innerHTML = '';
      if (id === 'about') return this._sideAbout(B);
      if (id === 'measures') return this._sideMeasures(B);
      if (id === 'counts') return this._sideCounts(B);
      if (id === 'labels') return this._sideLabels(B);
    }
    _sideAbout(B) {
      if (!this.slide) return B.appendChild(h('p.ms-none', 'Choose a slide from the slide box.'));
      const s = this.slide, info = s.info || {}, src = info.source || {};
      B.appendChild(h('h3', s.title));
      if (info.description) B.appendChild(h('p', info.description));
      const meta = [];
      if (info.stain) meta.push(['Stain', info.stain]);
      if (info.species) meta.push(['Species', info.species]);
      if (s.mpp) meta.push(['Pixel size', s.mpp.toFixed(3) + ' µm']);
      if (info.width) meta.push(['Size', s.mpp ? `${fmtLen(info.width * s.mpp)} × ${fmtLen(info.height * s.mpp)}` : `${info.width} × ${info.height} pixels`]);
      if (info.scan) meta.push(['Scanned', info.scan]);
      if (meta.length) B.appendChild(h('dl.ms-meta', meta.map(([k, v]) => [h('dt', k), h('dd', v)])));
      if (Array.isArray(info.look_for) && info.look_for.length) {
        B.appendChild(h('h4', 'Look for'));
        B.appendChild(h('ul.ms-look', info.look_for.map((t) => h('li', t))));
      }
      if (src.name) {
        B.appendChild(h('h4', 'Where the slide comes from'));
        const p = h('p.ms-credit');
        p.innerHTML = `${esc(src.name)}${src.sample ? `, sample <code>${esc(src.sample)}</code>` : ''}${src.tissue_site ? ` (${esc(src.tissue_site)})` : ''}${src.via ? `, from the ${esc(src.via)}` : ''}. ${src.licence ? `Licence: <a href="${esc(src.licence_url || '#')}" target="_blank" rel="noopener">${esc(src.licence)}</a>.` : ''} ${src.changes ? esc(src.changes) : ''}`;
        B.appendChild(p);
        if (src.pathology_note) B.appendChild(h('p.ms-note', h('b', 'The pathologist’s note (GTEx): '), src.pathology_note));
      }
      if (s.file) {
        const b = h('button.tbtn', { type: 'button', html: I('ruler') + '<span>Set the scale…</span>' });
        b.addEventListener('click', () => this.setScale());
        B.appendChild(h('p', s.mpp ? `Scale: ${s.mpp.toFixed(4)} µm per pixel.` : 'This picture has no scale yet, so lengths are measured in pixels.'));
        B.appendChild(b);
      }
    }
    _sideMeasures(B) {
      const mine = this._mineFor(this.st.measures);
      const head = h('div.ms-side-acts');
      const all = h('button.tbtn', { type: 'button', html: I('file') + '<span>measurements.csv</span>', title: 'Show the file of all your measurements (in Files), which R can read' });
      all.addEventListener('click', () => {
        this._writeCsv();
        MG.app.editFile(MG.app.HOME + '/microscope/measurements.csv');
      });
      const rs = h('button.tbtn', { type: 'button', html: I('r') + '<span>Analyse in R</span>', title: 'Open a script that reads your measurements in RStudio' });
      rs.addEventListener('click', () => this.toR('measurements'));
      head.append(all, rs);
      B.appendChild(h('p.ms-help', this.toolName === 'measure' ? 'Drag across what you want to measure (or click at each end).' : this.toolName === 'area' ? 'Click round the edge; click the first point again (or double-click) to finish.' : 'Choose Measure or Area in the toolbar.'));
      // the label that new measurements get (what is being measured), so that R can group them
      const nl = h('input.ms-lab', { type: 'text', value: this.st.mlabel || '', placeholder: 'e.g. glomerulus', maxlength: 60, 'aria-label': 'The label of new measurements' });
      nl.addEventListener('change', () => {
        this.st.mlabel = nl.value.trim();
        this._save();
      });
      B.appendChild(h('label.ms-next', h('span', 'Label new measurements as'), nl));
      if (!mine.length) B.appendChild(h('p.ms-none', 'No measurements on this slide yet.'));
      else {
        const ul = h('ol.ms-list');
        mine.forEach((m) => {
          const lab = h('input.ms-lab', { type: 'text', value: m.label || '', placeholder: m.kind === 'area' ? 'area' : 'what?', 'aria-label': 'What this measurement is', maxlength: 60 });
          lab.addEventListener('change', () => {
            m.label = lab.value.trim();
            this._changed('measures');
          });
          const go = h('button.ms-ib.sm', { type: 'button', title: 'Go to it', 'aria-label': 'Go to it', html: I('target') });
          go.addEventListener('click', () => this._goTo(m.kind === 'area' ? centroid(m.pts) : { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }));
          const del = h('button.ms-ib.sm', { type: 'button', title: 'Delete', 'aria-label': 'Delete this measurement', html: I('trash') });
          del.addEventListener('click', () => this.removeMeasure(m.id));
          ul.appendChild(h('li', h('span.ms-v', this._val(m)), lab, go, del));
        });
        B.appendChild(ul);
        const vals = mine.filter((m) => m.kind === 'length' && m.unit === 'µm').map((m) => m.value);
        if (vals.length > 1) {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (vals.length - 1));
          B.appendChild(h('p.ms-sum', `${vals.length} lengths: mean ${fmtLen(mean)}, SD ${fmtLen(sd)}`));
        }
        const clr = h('button.tbtn', { type: 'button', html: I('trash') + '<span>Delete them all</span>' });
        clr.addEventListener('click', async () => {
          if (await MG.confirmBox('Delete the measurements?', `<p>Delete all ${mine.length} measurements of this slide?</p>`, 'Delete them', { danger: true })) {
            this.st.measures = this.st.measures.filter((m) => m.slide !== this.slide.id);
            this._changed('measures');
          }
        });
        B.appendChild(clr);
      }
      B.appendChild(head);
    }
    _sideCounts(B) {
      const mine = this._mineFor(this.st.counts);
      B.appendChild(h('p.ms-help', this.toolName === 'count' ? 'Click on each one you count. Click a mark again to remove it.' : 'Choose Count in the toolbar, then click on each one you count.'));
      const ul = h('ul.ms-cats');
      this.st.cats.forEach((name, k) => {
        const n = mine.filter((c) => c.cat === k).length;
        const radio = h('input', { type: 'radio', name: 'ms-cat', checked: this.st.cat === k, 'aria-label': 'Count ' + name });
        radio.addEventListener('change', () => {
          this.st.cat = k;
          this._save();
          if (this.toolName !== 'count') this.tool('count');
        });
        const nm = h('input.ms-lab', { type: 'text', value: name, maxlength: 40, 'aria-label': 'The name of category ' + (k + 1) });
        nm.addEventListener('change', () => {
          this.st.cats[k] = nm.value.trim() || 'Category ' + (k + 1);
          this._changed('counts');
        });
        ul.appendChild(h('li', h('label.ms-cat', radio, h('i', { style: { background: CAT_COLOURS[k % CAT_COLOURS.length] } })), nm, h('b.ms-n', String(n))));
      });
      B.appendChild(ul);
      const acts = h('div.ms-side-acts');
      if (this.st.cats.length < CAT_COLOURS.length) {
        const add = h('button.tbtn', { type: 'button', html: I('plus') + '<span>Another category</span>' });
        add.addEventListener('click', () => {
          this.st.cats.push('Category ' + (this.st.cats.length + 1));
          this._changed('counts');
        });
        acts.appendChild(add);
      }
      const clr = h('button.tbtn', { type: 'button', html: I('trash') + '<span>Clear the counts</span>', disabled: !mine.length });
      clr.addEventListener('click', async () => {
        if (await MG.confirmBox('Clear the counts?', `<p>Remove all ${mine.length} marks on this slide?</p>`, 'Clear them', { danger: true })) this.clearCounts();
      });
      acts.appendChild(clr);
      B.appendChild(h('p.ms-sum', `Total on this slide: ${mine.length}`));
      B.appendChild(acts);
      const files = h('div.ms-side-acts');
      const f = h('button.tbtn', { type: 'button', html: I('file') + '<span>counts.csv</span>' });
      f.addEventListener('click', () => {
        this._writeCsv();
        MG.app.editFile(MG.app.HOME + '/microscope/counts.csv');
      });
      const rs = h('button.tbtn', { type: 'button', html: I('r') + '<span>Analyse in R</span>' });
      rs.addEventListener('click', () => this.toR('counts'));
      files.append(f, rs);
      B.appendChild(files);
    }
    _sideLabels(B) {
      if (!this.slide) return B.appendChild(h('p.ms-none', 'Choose a slide first.'));
      const info = this.slide.info || {};
      const tl = (info.labels || []).filter((L) => L.text);
      const sw = h('label.check', h('input', { type: 'checkbox', checked: !!this.st.showLabels }), ' Show the slide’s labels');
      sw.querySelector('input').addEventListener('change', (e) => this.setShowLabels(e.target.checked));
      B.appendChild(sw);
      if (tl.length) {
        const ul = h('ul.ms-labels');
        const seen = new Set();
        tl.forEach((L) => {
          const b = h('button.linkbtn', { type: 'button' }, L.text);
          b.addEventListener('click', () => {
            if (!this.st.showLabels) this.setShowLabels(true);
            this._goTo(L, L.mag || null);
          });
          const k = L.text + L.x;
          if (seen.has(k)) return;
          seen.add(k);
          ul.appendChild(h('li', b));
        });
        B.appendChild(h('h4', 'The slide’s labels'));
        B.appendChild(ul);
      } else B.appendChild(h('p.ms-none', 'This slide has no labels of its own.'));
      const mine = this._mineFor(this.st.labels);
      B.appendChild(h('h4', 'My labels'));
      if (!mine.length) B.appendChild(h('p.ms-none', 'Choose Label in the toolbar and click on the slide to add your own.'));
      else {
        const ul = h('ul.ms-labels');
        mine.forEach((L) => {
          const b = h('button.linkbtn', { type: 'button' }, L.text);
          b.addEventListener('click', () => this._goTo(L));
          const del = h('button.ms-ib.sm', { type: 'button', title: 'Delete', 'aria-label': 'Delete this label', html: I('trash') });
          del.addEventListener('click', () => {
            this.st.labels = this.st.labels.filter((x) => x !== L);
            this._changed('labels');
          });
          ul.appendChild(h('li', b, del));
        });
        B.appendChild(ul);
      }
    }
    _goTo(p, mag) {
      const ti = this._ti();
      if (!ti) return;
      this.viewer.viewport.panTo(ti.imageToViewportCoordinates(new OSD.Point(p.x, p.y)));
      if (mag) this.setMag(mag);
    }
    _menu(anchor) {
      const items = [
        ['download', 'Take a picture and download it', () => this.capture({ download: true })],
        ['folder', 'Show my pictures (in Files)', () => MG.app.revealFile(MG.app.HOME + '/microscope/pictures')],
        ['image', 'Open a picture from my files…', () => this.pickPicture()],
        ['ruler', 'Set the scale of a picture…', () => this.setScale()],
        ['r', 'Analyse my measurements in R', () => this.toR('measurements')],
        ['info', 'How to use the microscope', () => this.help()]
      ];
      MG.popmenu(anchor, items);
    }

    /** a script that reads the measurements (or counts) in RStudio */
    async toR(what) {
      this._writeCsv();
      const fs = this.fs;
      const path = MG.app.HOME + '/scripts/' + (what === 'counts' ? 'microscope-counts.R' : 'microscope-measurements.R');
      if (!fs.exists(path)) {
        fs.mkdirp(MG.app.HOME + '/scripts');
        fs.writeText(path, what === 'counts' ? R_COUNTS : R_MEASURES);
      }
      return MG.app.openInRStudio(path);
    }

    help() {
      MG.modal('The microscope', `<ul>
<li><b>Moving around:</b> drag the slide to move it; scroll (or pinch) to zoom; double-click to zoom in. The objectives (1× to 40×) follow the convention of digital microscopes: at 20× a slide is shown at the full resolution of its scan (0.5 µm per pixel of your screen), at 10× half as big, at 40× twice as big. Keys 1 to 6 choose them, the arrow keys move the slide and + and − zoom. How much of the slide you see (the field of view) depends on the size of the window.</li>
<li><b>The scale bar</b> (bottom left) and the readout (bottom right) show the magnification and how wide the field of view is.</li>
<li><b>Measure</b> lengths (drag across a cell, or click at each end) and <b>areas</b> (click round the edge). Every measurement goes into <code>~/microscope/measurements.csv</code>, which R can read.</li>
<li><b>Count</b>: click on each thing you count; click a mark again to remove it. You can count several categories at once (name them in the Counts panel). The marks go into <code>~/microscope/counts.csv</code>.</li>
<li><b>Labels</b>: some slides come with labels (the tag button shows or hides them); you can add your own.</li>
<li><b>The eyepiece</b> view shows a round field of view with a graticule of 100 divisions, as in a real eyepiece, and the objectives click from one to the next. Calibrate the graticule with the stage micrometer slide.</li>
<li><b>Pictures</b> (the camera) are saved in <code>~/microscope/pictures</code> with a scale bar and the slide’s credit. You can also open a picture of your own from your files and set its scale.</li>
</ul><p class="muted">The slides of human tissue are sections of normal tissue from the GTEx project, scanned at 20× (about 0.5 µm per pixel); at 40× the microscope enlarges the scan.</p>`);
    }
  }

  const R_MEASURES = `# Measurements from the microscope
# (each row is one length or area that you measured; the microscope keeps this file up to date)
m <- read.csv("~/microscope/measurements.csv")
head(m)

# measurements without a label are called "unlabelled"
m$label <- ifelse(is.na(m$label) | m$label == "", "unlabelled", m$label)

# lengths only, in micrometres
lengths <- subset(m, kind == "length" & unit == "um")
summary(lengths$value)

# the mean, standard deviation and number of lengths for each label you gave them
aggregate(value ~ label, data = lengths, FUN = function(x) c(mean = mean(x), sd = sd(x), n = length(x)))

# a box plot of the lengths by label
boxplot(value ~ label, data = lengths, xlab = "", ylab = "Length (µm)", col = "lavender")
`;
  const R_COUNTS = `# Counts from the microscope
# (each row is one mark that you placed with the Count tool)
counts <- read.csv("~/microscope/counts.csv")
head(counts)

# how many of each category, on each slide
table(counts$slide, counts$category)

# the proportion of each category on each slide
prop.table(table(counts$slide, counts$category), margin = 1)
`;

  // the styles of the overlay, for pictures (the page's stylesheet does not reach an SVG drawn as an image)
  const SVG_CSS = `.ms-line-bg{stroke:rgba(0,0,0,.55);stroke-width:5;fill:none;stroke-linecap:round}.ms-line{stroke:#ffd43b;stroke-width:2.2;fill:none;stroke-linecap:round}
.ms-tagg rect{fill:rgba(20,20,30,.82)}.ms-tagg text{fill:#fff;font:600 12px system-ui,sans-serif;text-anchor:middle}
.ms-area{fill:rgba(255,212,59,.18);stroke:#ffd43b;stroke-width:2}.ms-region{fill:rgba(59,130,246,.08);stroke:rgba(59,130,246,.55);stroke-width:1.5;stroke-dasharray:5 4}
.ms-tlabel circle,.ms-mylabel circle{stroke:#fff;stroke-width:2}.ms-tlabel circle{fill:#1c7ed6}.ms-mylabel circle{fill:#e8590c}
.ms-tlabel path,.ms-mylabel path{stroke:#fff;stroke-width:2}.ms-tlabel rect{fill:rgba(16,40,80,.85)}.ms-mylabel rect{fill:rgba(120,40,0,.85)}
.ms-tlabel text,.ms-mylabel text{fill:#fff;font:600 12px system-ui,sans-serif}.ms-mark circle{stroke:#fff;stroke-width:1.5}`;

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  MG.Microscope = Microscope;
})();
