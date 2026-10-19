/* =====================================================================
   The Anatomy tab: the human body in 3D, from Z-Anatomy.

   The models are Z-Anatomy's (CC BY-SA 4.0; most of them made from BodyParts3D), converted from its Blender file by
   build/anatomy (one glTF file for each part of the body, in anatomy/, loaded only when it is first shown, and
   anatomy/index.json, which lists every structure). three.js draws them (assets/vendor/three/three-anatomy.min.js).
   The student turns the body round, shows and hides the systems, clicks on a structure to see what it is (with its
   Latin name and the opening of its Wikipedia article), isolates or fades it, cuts through the body, labels what is
   shown, is asked to find structures, and keeps pictures in ~/anatomy/.

   What the buttons of the instructions ask for (go(spec), find(spec)):
     go('endocrine')                 the endocrine glands alone, with the skeleton faint behind them for context
     go('endocrine:thyroid-gland')   … and the thyroid gland selected and framed
     go('thyroid-gland')             a structure alone: its system is shown, and it is selected
     go('kidney')                    a name without its side means both sides (the kidney on the left and on the right)
     go('heart@anterior')            a view: anterior, posterior, left, right, superior or inferior
     go('respiratory+skeleton')      several systems; the skeleton, when it is named, is shown in full
     go('section:transverse@0.6')    a section: sagittal, coronal or transverse, at 0–1 of the way along the body
                                     (from the right, the back, or the feet); 'section:off' ends it. It can end with a
                                     view: 'section:transverse@0.45@superior'. A section leaves the systems as they are.
     go('labels')                    labels the structures shown (with other parts: 'endocrine+labels')
     find('thyroid-gland')           "Find the thyroid gland and click on it" (shows its system if it is hidden);
     find('suprarenal-gland')        either side counts; several answers: find('a|b')
   The systems: skeleton, muscles, heart, vessels, respiratory, digestive, urinary, reproductive, endocrine, brain,
   nerves, lymphoid (anatomy/index.json). The structures' names: the ids of anatomy/index.json.

   Events (MG.bus), for the steps of the practicals that tick themselves:
     anat:open     {systems}                       the body is shown for the first time
     anat:system   {id, on, faded}                 a system is shown, hidden or faded
     anat:select   {id, name, base, side, system, systems}   a structure is selected (a click, the list, a search)
     anat:view     {name}                          a standard view (anterior, posterior, left, right, superior, inferior)
     anat:isolate  {id, base, on}                  a structure is shown alone (or the others are shown again)
     anat:hide     {id, base}                      a structure is hidden
     anat:fade     {id, base, on}                  the others are faded round a structure
     anat:showall  {}                              everything hidden is shown again
     anat:section  {axis, at, flip}                a section is made or moved (axis: sagittal, coronal, transverse, off)
     anat:labels   {on, n}                         the labels are shown or hidden
     anat:find     {id, target, ok, clicked}       a click while asked to find a structure (id: the one asked for)
     anat:capture  {path, name}                    a picture is saved in Files
     anat:search   {q, n}                          the list is searched
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const I = (n) => MG.icon(n);
  const BASE = 'anatomy/';
  const THREE_SRC = 'assets/vendor/three/three-anatomy.min.js';
  const SECTION_IC = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M3 12.5l9 4 9-4" stroke-dasharray="2.5 2.5"/></svg>';
  const BODY_IC = '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="4.6" r="2.3"/><path d="M12 7.6v6.6M6.2 10.6L12 8.8l5.8 1.8M8.8 21l3.2-6.8 3.2 6.8"/></svg>';

  /* the standard views: where the camera is, seen from the body (the body faces +Z, its left is +X) */
  const VIEWS = {
    anterior: { dir: [0, 0, 1], label: 'Anterior (front)', key: '1' },
    posterior: { dir: [0, 0, -1], label: 'Posterior (back)', key: '2' },
    left: { dir: [1, 0, 0], label: 'Left side', key: '3' },
    right: { dir: [-1, 0, 0], label: 'Right side', key: '4' },
    superior: { dir: [0, 1, -0.012], label: 'Superior (from above)', key: '5' },
    inferior: { dir: [0, -1, 0.012], label: 'Inferior (from below)', key: '6' }
  };
  /* a section: the plane, the part kept (n points into it), and the view of its cut face: a sagittal section keeps the
     body's right half, seen from the left; a coronal one the back half, seen from the front; a transverse one the part
     above the cut, seen from below – as CT and MRI images are shown (the body's left on the right of the picture) */
  const AXES = {
    sagittal: { n: [-1, 0, 0], k: 0, label: 'Sagittal', what: 'from the right side (0) to the left (1)', view: 'left' },
    coronal: { n: [0, 0, -1], k: 2, label: 'Coronal', what: 'from the back (0) to the front (1)', view: 'anterior' },
    transverse: { n: [0, 1, 0], k: 1, label: 'Transverse', what: 'from the feet (0) to the head (1)', view: 'inferior' }
  };
  const DEFAULT_ON = { skeleton: 'fade', heart: 1, respiratory: 1, digestive: 1, urinary: 1, endocrine: 1 };
  const FADE = 0.16;
  const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/['’()*,./]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const lcFirst = (s) => (/^[A-Z][a-z]/.test(s) && !/^(Broca|Wernicke|Jensen|Meckel)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* searching: everyday and older names → the model's names (those of Terminologia Anatomica) */
  const SYNONYMS = [
    ['anterior pituitary', 'adenohypophysis'], ['posterior pituitary', 'neurohypophysis'], ['pituitary', 'hypophysis'],
    ['adrenal', 'suprarenal'], ['windpipe', 'trachea'], ['voice box', 'larynx'], ['gullet', 'oesophagus'], ['food pipe', 'oesophagus'],
    ['esophagus', 'oesophagus'], ['gall bladder', 'gallbladder'], ['mitral', 'left atrioventricular'], ['bicuspid valve', 'left atrioventricular valve'],
    ['tricuspid', 'right atrioventricular'], ['venae cavae', 'vena cava'], ['collar bone', 'clavicle'], ['collarbone', 'clavicle'],
    ['breastbone', 'sternum'], ['breast bone', 'sternum'], ['shoulder blade', 'scapula'], ['kneecap', 'patella'], ['knee cap', 'patella'],
    ['thigh bone', 'femur'], ['thighbone', 'femur'], ['shin bone', 'tibia'], ['shinbone', 'tibia'], ['backbone', 'vertebral column'],
    ['spinal column', 'vertebral column'], ['spine', 'vertebral column'], ['skull', 'cranium'], ['brain stem', 'brainstem'],
    ['appendix', 'vermiform appendix'], ['adam’s apple', 'thyroid cartilage'], ["adam's apple", 'thyroid cartilage'], ['ribcage', 'thoracic skeleton'],
    ['rib cage', 'thoracic skeleton'], ['cerebral cortex', 'gyrus'], ['vocal cords', 'vocal'], ['epiphysis cerebri', 'pineal']
  ];
  /* … and the adjectives of organs, which name their parts and vessels ('laryngeal cartilages', 'renal artery') */
  const FAMILY = [['larynx', 'laryngeal'], ['pharynx', 'pharyngeal'], ['heart', 'cardiac'], ['kidney', 'renal'], ['liver', 'hepatic'],
    ['stomach', 'gastric'], ['lung', 'pulmonary'], ['brain', 'cerebral'], ['bladder', 'vesical'], ['hypophysis', 'hypophysial'], ['testis', 'testicular']];
  /* what the model does not have */
  const ABSENT = [
    [/\b(uterus|womb|ovar(y|ies)|vagina|vulva|uterine tube|fallopian|cervix of uterus|placenta|mammary|breast)\b/i, 'The female reproductive organs are not in the model: it was made from a man’s body.'],
    [/\b(ears?|cochlea|semicircular|tympanic membrane|ossicles?|malleus|incus|stapes)\b/i, 'The ear is not in the model: Z-Anatomy’s ear may not be shared freely.'],
    [/\b(renal pelvis|calyx|calyces|calices|nephrons?|renal pyramids?|renal cortex|renal medulla)\b/i, 'The inside of the kidney is not in the model: Z-Anatomy’s model of it may not be shared freely.'],
    [/\b(skin|teeth|tooth|meninges|dura mater|pleura|peritoneum|joints?|white matter)\b/i, 'That is not in the model: the skin, the teeth, the joints, the meninges, the pleura, the peritoneum and the white matter of the brain were left out.']
  ];
  function singular(w) {
    if (/(ss|us|is|ae|um)$/.test(w) || w.length < 4) return w.replace(/ae$/, 'a');
    if (w === 'testes') return 'testis';
    if (w === 'bronchi') return 'bronchus';
    if (w === 'atria') return 'atrium';
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
    return w.replace(/s$/, '');
  }
  /** the forms of a search to look for: as typed, in the singular, with the model's names for everyday ones */
  function variants(q) {
    q = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const out = new Set([q]);
    out.add(q.split(' ').map(singular).join(' '));
    [...out].forEach((v) => SYNONYMS.forEach(([a, b]) => v.includes(a) && out.add(v.replace(a, b))));
    [...out].forEach((v) => FAMILY.forEach(([a, b]) => v.includes(a) && out.add(v.replace(a, b))));
    return [...out].filter((v) => v.length >= 2);
  }

  class AnatomyApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      this.st = Object.assign({ on: null, cam: null, sel: null, labels: false, section: null, panel: null, info: null, side: 'info' }, store.get('anatomy', {}) || {});
      this.S = {}; // structure id → its entry of index.json (+ .mesh once its file is loaded)
      this.sys = {}; // system id → {id, title, files, structures}
      this.files = {}; // file id → {id, file, bytes, state, promise, progress}
      this.on = {}; // system id → 1 (shown) or 'fade'
      this.hidden = new Set();
      this.isolated = null; // a Set of ids shown alone
      this.fadeRound = null; // a Set of ids the others are faded round
      this.sel = []; // the selected structures (one, or both sides)
      this.hint = null; // the structures "Show me" is pointing at
      this.findTask = null;
      this.section = null; // {axis, at, flip}
      this.labels = !!this.st.labels;
      this.query = '';
      this._build();
      this._save = MG.debounce(() => store.set('anatomy', this._state()), 400);
      this.ready = this._start();
    }

    /* ================================================================ layout */
    _build() {
      const r = this.root;
      r.classList.add('an-app');
      r.innerHTML = '';
      // the systems and the list of structures
      this.sysList = h('div.an-systems', { role: 'list', 'aria-label': 'Systems of the body' });
      this.search = h('input.an-search', { type: 'search', placeholder: 'Search the structures', 'aria-label': 'Search the structures', autocomplete: 'off', spellcheck: 'false' });
      this.search.addEventListener('input', () => {
        this.query = this.search.value.trim();
        this._renderList();
        this._searched();
      });
      this.list = h('div.an-list');
      this.panel = h('aside.an-panel', { 'aria-label': 'Systems and structures' },
        h('div.an-panel-h', h('b', 'Systems'), h('span.grow'), this._btn('x', 'Close the list', () => this.togglePanel(false), '.an-panel-x')),
        this.sysList, h('div.an-search-w', this.search), this.list);

      // the toolbar
      this.panelBtn = this._btn('layers', 'Systems and structures', () => this.togglePanel(), '.an-tg');
      this.titleEl = h('button.an-title', { type: 'button', title: 'What is shown: choose the systems' }, 'Anatomy');
      this.titleEl.addEventListener('click', () => this.togglePanel(true));
      this.viewBtn = h('button.an-tool', { type: 'button', title: 'The standard views (keys 1 to 6)', html: I('cube') + '<span>View</span>' + '<svg class="ic an-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' });
      this.viewBtn.addEventListener('click', () => this._viewMenu());
      const frame = this._btn('target', 'Frame: fit the selected structure (or everything shown) in the view (F)', () => this.frame());
      this.secBtn = h('button.an-tool', { type: 'button', title: 'Cut through the body (a section)', 'aria-pressed': 'false', html: SECTION_IC + '<span>Section</span>' });
      this.secBtn.addEventListener('click', () => this._sectionMenu());
      this.labBtn = h('button.an-tool', { type: 'button', title: 'Label the structures shown (L)', 'aria-pressed': 'false', html: I('tag') + '<span>Labels</span>' });
      this.labBtn.addEventListener('click', () => this.setLabels(!this.labels, true));
      this.allBtn = h('button.an-tool', { type: 'button', title: 'Show again everything that you hid, isolated or faded', html: I('showall') + '<span>Show all</span>' });
      this.allBtn.addEventListener('click', () => this.showAll(true));
      const cap = this._btn('camera', 'Take a picture of the view (saved in Files, in anatomy)', () => this.capture());
      this.infoBtn = this._btn('info', 'About the selected structure', () => this.toggleInfo(), '.an-tg');
      const more = this._btn('more', 'More', (e) => this._moreMenu(e.currentTarget));
      this.bar = h('div.an-bar', this.panelBtn, this.titleEl, h('span.an-sep'), this.viewBtn, frame, this.secBtn, this.labBtn, this.allBtn, h('span.grow'), cap, this.infoBtn, more);

      // the view
      this.canvasBox = h('div.an-canvas');
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'an-svg');
      this.tip = h('div.an-tip', { hidden: true });
      this.banner = h('div.an-banner', { hidden: true, role: 'status', 'aria-live': 'polite' });
      this.loadEl = h('div.an-loading', { hidden: true }, h('span.spinner'), h('span.an-loading-t', 'Loading…'));
      this.empty = h('div.an-empty', { hidden: true }, h('div', h('h3', 'Nothing is shown'), h('p', 'Choose a system in the list to show it.'), h('button.btn.primary', { type: 'button', onclick: () => this.togglePanel(true) }, 'Choose a system')));
      this.secRange = h('input.an-sec-r', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Where the section cuts' });
      this.secRange.addEventListener('input', () => this.setSection(this.section && this.section.axis, this.secRange.value / 1000, { say: 'later' }));
      this.secName = h('b.an-sec-n', 'Section');
      const flip = h('button.tbtn', { type: 'button', title: 'Keep the other part' }, 'Flip');
      flip.addEventListener('click', () => this.section && this.setSection(this.section.axis, this.section.at, { flip: !this.section.flip, say: true }));
      this.secBar = h('div.an-secbar', { hidden: true }, this.secName, this.secRange, flip, this._btn('x', 'End the section', () => this.setSection('off', 0, { say: true }), '.sm'));
      this.compass = h('div.an-compass', { 'aria-hidden': 'true' });
      this.chip = h('button.an-chip', { type: 'button', hidden: true, title: 'About the selected structure' });
      this.chip.addEventListener('click', () => this.toggleInfo(true));
      this.view = h('div.an-view', this.canvasBox, this.svg, this.compass, this.chip, this.tip, this.banner, this.secBar, this.loadEl, this.empty);
      this.view.tabIndex = 0;
      this.view.setAttribute('aria-label', 'The body in 3D. Drag to turn it, scroll or pinch to zoom; arrow keys turn it, + and − zoom, 1 to 6 choose a view.');

      // the side panel: the selected structure, and about the models
      this.infoTabs = {};
      const tabs = h('div.an-info-tabs', { role: 'tablist' });
      [['info', 'Structure'], ['about', 'About']].forEach(([id, label]) => {
        const b = h('button.an-itab', { type: 'button', role: 'tab' }, label);
        b.addEventListener('click', () => this.showInfo(id));
        this.infoTabs[id] = b;
        tabs.appendChild(b);
      });
      this.infoBody = h('div.an-info-b');
      this.info = h('aside.an-info', { 'aria-label': 'The selected structure' }, h('div.an-info-h', tabs, this._btn('x', 'Close the panel', () => this.toggleInfo(false), '.an-info-x')), this.infoBody);

      // (the toolbar runs across the whole tab, so that the names of its tools fit beside the list of systems)
      this.body = h('div.an-body', this.panel, this.view, this.info);
      r.append(this.bar, this.body);
      this.root.addEventListener('keydown', (e) => this._key(e));
      if (window.ResizeObserver) new ResizeObserver(() => this._resized()).observe(this.view);
    }
    _btn(ic, title, fn, cls = '') {
      const b = h('button.an-ib' + cls, { type: 'button', title, 'aria-label': title, html: I(ic) });
      b.addEventListener('click', fn);
      return b;
    }
    _narrow() {
      return (this.root.clientWidth || 1000) < 760;
    }

    /* ================================================================ start */
    async _start() {
      const [idx] = await Promise.all([
        fetch(BASE + 'index.json', { cache: 'no-cache' }).then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }),
        MG.app.loadOnce(THREE_SRC)
      ]).catch((e) => {
        this._fail('The models could not be loaded', `${esc(e.message || e)}. Check your internet connection and reload the page. (The workbench must be opened through a web server, not as a file.)`);
        return [null];
      });
      if (!idx) return;
      this.index = idx;
      idx.files.forEach((f) => (this.files[f.id] = Object.assign({ state: 'idle', progress: 0 }, f)));
      idx.systems.forEach((s) => (this.sys[s.id] = s));
      this.sysOrder = idx.systems.map((s) => s.id);
      idx.structures.forEach((s) => {
        s.name = s.base + (s.side && !new RegExp('\\b' + s.side + '\\b', 'i').test(s.base) ? ` (${s.side})` : '');
        s.slug = slugify(s.base);
        this.S[s.id] = s;
      });
      this.bySlug = {};
      idx.structures.forEach((s) => (this.bySlug[s.slug] = this.bySlug[s.slug] || []).push(s.id));
      if (!this._initGL()) return;
      // what was shown last time, or the organs of the trunk with the skeleton faint behind them
      const on = this.st.on && typeof this.st.on === 'object' && Object.keys(this.st.on).some((k) => this.sys[k]) ? this.st.on : DEFAULT_ON;
      Object.keys(on).forEach((k) => this.sys[k] && (this.on[k] = on[k]));
      (this.st.hidden || []).forEach((id) => this.S[id] && this.hidden.add(id));
      const W0 = this.root.clientWidth || 1000;
      this.togglePanel(W0 >= 760 && this.st.panel !== false, true);
      this.toggleInfo(this._maxPanels() >= 2 && this.st.info !== false && !!this.st.info, true);
      this.showInfo(this.st.side || 'info', true);
      this._renderSystems();
      this._renderList();
      this._updateTitle();
      this.labBtn.setAttribute('aria-pressed', this.labels ? 'true' : 'false');
      this.labBtn.classList.toggle('on', this.labels);
      await this._loadShown();
      if (this.st.section && AXES[this.st.section.axis]) this.setSection(this.st.section.axis, this.st.section.at, { flip: this.st.section.flip, quiet: true });
      const cam = this.st.cam;
      if (cam && Array.isArray(cam.p) && Array.isArray(cam.t)) {
        this.camera.position.fromArray(cam.p);
        this.controls.target.fromArray(cam.t);
        this._clipCamera();
        this.controls.update();
      } else this._frameShown('anterior', { instant: true });
      if (this.st.sel && this.S[this.st.sel]) this.select([this.st.sel], { quiet: true });
      this._applyVis();
      this.render();
      bus.emit('anat:open', { systems: this._onList().join(',') });
    }
    _fail(title, html) {
      this.view.querySelectorAll('.an-fail').forEach((x) => x.remove());
      this.view.appendChild(h('div.an-fail', h('div', h('h3', title), h('p', { html }))));
    }
    _initGL() {
      const T = (this.T = window.THREE);
      try {
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      } catch (e) {
        this._fail('The 3D view could not start', 'This browser or computer may have 3D graphics (WebGL) switched off. Try Chrome, Edge, Firefox or Safari, and turn on “hardware acceleration” in the browser’s settings.');
        this.T = null;
        return false;
      }
      const R = this.renderer;
      R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      R.outputColorSpace = T.SRGBColorSpace;
      R.localClippingEnabled = true;
      R.setClearColor(new T.Color('#eef1f4'), 1);
      this.canvasBox.appendChild(R.domElement);
      R.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this._fail('The 3D view stopped', 'The computer’s graphics were reset. Reload the page to start the view again.');
      });
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(28, 1, 0.01, 50);
      this.camera.position.set(0, 1.1, 3);
      this.scene.add(this.camera);
      this.scene.add(new T.HemisphereLight(0xffffff, 0x8d99a8, 1.15));
      const head = new T.DirectionalLight(0xffffff, 1.9);
      head.position.set(0.35, 0.5, 1);
      this.camera.add(head);
      head.target.position.set(0, 0, -1);
      this.camera.add(head.target);
      this.model = new T.Group();
      this.scene.add(this.model);
      this.plane = new T.Plane(new T.Vector3(0, -1, 0), 0);
      this.planes = [this.plane];
      this.controls = new T.OrbitControls(this.camera, R.domElement);
      const C = this.controls;
      C.enableDamping = false;
      C.zoomToCursor = true;
      C.rotateSpeed = 0.9;
      C.zoomSpeed = 1.1;
      C.minDistance = 0.02;
      C.maxDistance = 12;
      C.screenSpacePanning = true;
      C.addEventListener('change', () => {
        this._clipCamera();
        this.render();
        this._save();
      });
      C.addEventListener('start', () => this._hideTip());
      this.loader = new T.GLTFLoader();
      this.loader.setMeshoptDecoder(T.MeshoptDecoder);
      this.ray = new T.Raycaster();
      // a click (not a drag) picks what is under it; the pointer shows names on a computer
      const cv = R.domElement;
      cv.addEventListener('pointerdown', (e) => {
        this._down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button, id: e.pointerId };
      });
      cv.addEventListener('pointerup', (e) => {
        const d = this._down;
        this._down = null;
        if (!d || d.b !== 0 || d.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 700) return;
        this._click(e.clientX, e.clientY);
      });
      cv.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || e.buttons) return;
        this._hoverAt = { x: e.clientX, y: e.clientY };
        if (!this._hoverT) this._hoverT = setTimeout(() => this._hover(), 70);
      });
      cv.addEventListener('pointerleave', () => this._hideTip());
      cv.addEventListener('dblclick', (e) => {
        const id = this._pick(e.clientX, e.clientY);
        if (id) this.frame([id]);
      });
      this._resized();
      return true;
    }

    /* ================================================================ loading the models */
    _filesFor(systems) {
      const need = new Set();
      systems.forEach((sid) => {
        const S = this.sys[sid];
        if (!S) return;
        S.files.forEach((f) => need.add(f));
        // (a system that borrows a structure from another file: the pancreas of the endocrine glands)
        S.structures.forEach((id) => this.S[id] && need.add(this.S[id].file));
      });
      return [...need];
    }
    _loadShown() {
      return this._loadFiles(this._filesFor(this._onList()));
    }
    async _loadFiles(fids) {
      const waits = fids.filter((f) => this.files[f]).map((f) => this._loadFile(f).catch(() => null));
      if (!waits.length) return;
      this._showLoading();
      await Promise.all(waits);
      this._showLoading();
      this._applyVis();
      this.render();
    }
    _loadFile(fid) {
      const F = this.files[fid];
      if (F.promise) return F.promise;
      F.state = 'loading';
      F.progress = 0;
      this._renderSystems();
      F.promise = this.loader
        .loadAsync(BASE + F.file, (ev) => {
          F.progress = ev.total ? ev.loaded / ev.total : F.bytes ? Math.min(0.99, ev.loaded / F.bytes) : 0;
          this._progress();
        })
        .then((gltf) => {
          const T = this.T;
          const root = gltf.scene;
          const meshes = [];
          root.traverse((o) => o.isMesh && meshes.push(o));
          meshes.forEach((m) => {
            const id = (m.userData && m.userData.id) || String(m.name || '').replace(/_\d+$/, '');
            const s = this.S[id];
            if (!s) return;
            m.material = this._material(s.colour);
            m.userData.sid = id;
            m.matrixAutoUpdate = false;
            m.updateMatrix();
            s.mesh = m;
          });
          this.model.add(root);
          root.updateMatrixWorld(true);
          F.state = 'ready';
          F.progress = 1;
          this._bbox = null;
          this._renderSystems();
          this._applyVis();
          this.render();
        })
        .catch((e) => {
          F.state = 'failed';
          F.promise = null;
          this._renderSystems();
          toast(`The ${esc(F.title.toLowerCase())} could not be loaded (${esc(e.message || e)}). Check your internet connection, then try again.`, 'error', 7000);
          throw e;
        });
      return F.promise;
    }
    /** a structure's material: both sides drawn (many of Z-Anatomy's models – the chambers of the heart, the vessels
        – are open surfaces, and a section shows the inside of every organ), the inner side in a darker shade */
    _material(colour) {
      const T = this.T;
      const mat = new T.MeshStandardMaterial({ color: new T.Color(colour), roughness: 0.62, metalness: 0, side: T.DoubleSide });
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tif ( ! gl_FrontFacing ) diffuseColor.rgb *= 0.5;');
      };
      mat.customProgramCacheKey = () => 'anat-inner-darker';
      return mat;
    }
    _progress() {
      if (this._progT) return;
      this._progT = setTimeout(() => {
        this._progT = null;
        this._renderSystems();
        this._showLoading();
      }, 120);
    }
    _showLoading() {
      const busy = Object.values(this.files).filter((f) => f.state === 'loading');
      this.loadEl.hidden = !busy.length;
      if (busy.length) {
        const done = busy.reduce((a, f) => a + (f.progress || 0) * (f.bytes || 1), 0);
        const all = busy.reduce((a, f) => a + (f.bytes || 1), 0);
        this.loadEl.querySelector('.an-loading-t').textContent = `Loading ${busy.map((f) => f.title.toLowerCase()).join(', ')}… ${Math.round((100 * done) / all)}%`;
      }
    }

    /* ================================================================ what is shown */
    _onList() {
      return this.sysOrder.filter((k) => this.on[k]);
    }
    _isShown(s) {
      if (!s || !s.mesh) return false;
      if (this.hidden.has(s.id)) return false;
      if (this.isolated && !this.isolated.has(s.id)) return false;
      return s.systems.some((k) => this.on[k]);
    }
    _isFaded(s) {
      if (this.isolated && this.isolated.has(s.id)) return false;
      if (this.fadeRound) return !this.fadeRound.has(s.id);
      // faded when every shown system it belongs to is faded
      const ks = s.systems.filter((k) => this.on[k]);
      return ks.length > 0 && ks.every((k) => this.on[k] === 'fade');
    }
    _applyVis() {
      const T = this.T;
      if (!T) return;
      const sel = new Set(this.sel), hint = new Set(this.hint || []);
      const cut = !!this.section;
      let n = 0;
      Object.values(this.S).forEach((s) => {
        const m = s.mesh;
        if (!m) return;
        const show = this._isShown(s);
        m.visible = show;
        if (!show) return;
        n++;
        const mat = m.material;
        const faded = this._isFaded(s) && !sel.has(s.id) && !hint.has(s.id);
        // (a faint structure shows only its outer side, so that it stays faint)
        const want = { transparent: faded, opacity: faded ? FADE : 1, depthWrite: !faded, side: faded ? T.FrontSide : T.DoubleSide, clip: cut };
        if (mat.transparent !== want.transparent || mat.side !== want.side || !!mat.clippingPlanes !== want.clip) {
          mat.transparent = want.transparent;
          mat.side = want.side;
          mat.clippingPlanes = want.clip ? this.planes : null;
          mat.needsUpdate = true;
        }
        mat.opacity = want.opacity;
        mat.depthWrite = want.depthWrite;
        if (sel.has(s.id)) {
          mat.emissive.set(0xffa800);
          mat.emissiveIntensity = 0.42;
        } else if (hint.has(s.id)) {
          mat.emissive.set(0xffd400);
          mat.emissiveIntensity = this._pulse ? 0.7 : 0.3;
        } else mat.emissiveIntensity = 0;
        m.renderOrder = faded ? 2 : 0;
      });
      this.nShown = n;
      const nothing = !this._onList().length || (n === 0 && !Object.values(this.files).some((f) => f.state === 'loading'));
      this.empty.hidden = !nothing;
      this.allBtn.disabled = !this.hidden.size && !this.isolated && !this.fadeRound;
      this._bbox = null;
    }
    /** show or hide systems: on is {systemId: 1 | 'fade'} (the others hidden), or setSystem(id, value) one at a time */
    _setSystems(on, opts = {}) {
      const before = Object.assign({}, this.on);
      this.on = {};
      Object.keys(on).forEach((k) => this.sys[k] && on[k] && (this.on[k] = on[k]));
      this._systemsChanged(before, opts);
    }
    setSystem(id, val, opts = {}) {
      if (!this.sys[id]) return Promise.resolve();
      const before = Object.assign({}, this.on);
      if (val) this.on[id] = val;
      else delete this.on[id];
      return this._systemsChanged(before, opts);
    }
    _systemsChanged(before, opts) {
      const keys = new Set([...Object.keys(before), ...Object.keys(this.on)]);
      keys.forEach((k) => {
        // (a system that the instructions ask for is reported even when it was shown already)
        if (before[k] === this.on[k] && !(opts.named || []).includes(k)) return;
        if (!opts.quiet) bus.emit('anat:system', { id: k, on: !!this.on[k], faded: this.on[k] === 'fade', title: this.sys[k].title });
      });
      // (the selection stays only while it can be seen)
      if (this.sel.length && !this.sel.some((id) => this.S[id].systems.some((k) => this.on[k]))) this.select([], { quiet: true });
      this._renderSystems();
      this._renderList();
      this._updateTitle();
      this._applyVis();
      this.render();
      this._save();
      return this._loadShown();
    }
    _updateTitle() {
      const on = this._onList();
      const full = on.filter((k) => this.on[k] !== 'fade').map((k) => this.sys[k].title);
      const t = full.length ? full.join(', ') : on.length ? on.map((k) => this.sys[k].title).join(', ') : 'Nothing shown';
      this.titleEl.textContent = t;
      this.titleEl.title = 'Shown: ' + (on.map((k) => this.sys[k].title + (this.on[k] === 'fade' ? ' (faint)' : '')).join(', ') || 'nothing') + '. Click to choose the systems.';
    }

    /* ================================================================ the list of systems and structures */
    _renderSystems() {
      if (!this.sysOrder) return;
      this.sysList.innerHTML = '';
      this.sysOrder.forEach((k) => {
        const S = this.sys[k];
        const files = this._filesFor([k]).map((f) => this.files[f]).filter(Boolean);
        const loading = files.some((f) => f.state === 'loading');
        const failed = files.some((f) => f.state === 'failed');
        const pct = loading ? Math.round((100 * files.reduce((a, f) => a + (f.state === 'ready' ? 1 : f.progress || 0) * (f.bytes || 1), 0)) / files.reduce((a, f) => a + (f.bytes || 1), 0)) : 0;
        const cb = h('input', { type: 'checkbox', 'aria-label': 'Show the ' + S.title.toLowerCase() });
        cb.checked = !!this.on[k];
        cb.addEventListener('change', () => this.setSystem(k, cb.checked ? 1 : 0));
        const fade = h('button.an-ib.sm.an-fadebtn', { type: 'button', title: this.on[k] === 'fade' ? 'Show it in full' : 'Make it faint (to see what is behind it)', 'aria-pressed': this.on[k] === 'fade' ? 'true' : 'false', html: I(this.on[k] === 'fade' ? 'eyeOff' : 'eye') });
        fade.classList.toggle('on', this.on[k] === 'fade');
        fade.disabled = !this.on[k];
        fade.addEventListener('click', () => this.setSystem(k, this.on[k] === 'fade' ? 1 : 'fade'));
        const sw = h('i.an-sw', { style: { background: this._sysColour(k) } });
        const label = h('label.an-sys-l', cb, sw, h('span.an-sys-t', S.title), h('small', loading ? pct + '%' : failed ? 'not loaded' : String(S.n)));
        const row = h('div.an-sys', { role: 'listitem', dataset: { sys: k } }, label, fade);
        row.classList.toggle('on', !!this.on[k]);
        row.classList.toggle('faded', this.on[k] === 'fade');
        if (loading) row.appendChild(h('i.an-bar-p', { style: { width: pct + '%' } }));
        if (failed) {
          const again = h('button.linkbtn', { type: 'button' }, 'Try again');
          again.addEventListener('click', () => this._loadShown());
          row.appendChild(again);
        }
        this.sysList.appendChild(row);
      });
    }
    _sysColour(k) {
      const ids = this.sys[k].structures;
      const s = this.S[ids[Math.floor(ids.length / 2)]] || this.S[ids[0]];
      return { skeleton: '#e6dcc3', muscles: '#b5473b', heart: '#a8413a', vessels: '#c62f35', respiratory: '#e7a3a1', digestive: '#d4997e', urinary: '#9b4537', reproductive: '#d8b4c0', endocrine: '#e8b13a', brain: '#e9b9a6', nerves: '#f2d24a', lymphoid: '#7cb86a' }[k] || (s && s.colour) || '#ccc';
    }
    _row(s, opts = {}) {
      const eye = h('button.an-ib.sm.an-row-eye', { type: 'button', title: this.hidden.has(s.id) ? 'Show it' : 'Hide it', 'aria-label': (this.hidden.has(s.id) ? 'Show ' : 'Hide ') + s.name, html: I(this.hidden.has(s.id) ? 'eyeOff' : 'eye') });
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.hidden.has(s.id)) this.unhide([s.id]);
        else this.hide([s.id], true);
      });
      const b = h('button.an-row-n', { type: 'button', title: s.name + (s.latin ? ' – ' + s.latin : '') },
        h('i.an-dot', { style: { background: s.colour } }), h('span', s.name), opts.sys ? h('small', this.sys[s.systems[0]] ? this.sys[s.systems[0]].title : '') : null);
      b.addEventListener('click', () => this.pick(s.id));
      const row = h('div.an-row', { dataset: { id: s.id } }, b, eye);
      row.classList.toggle('sel', this.sel.includes(s.id));
      row.classList.toggle('off', this.hidden.has(s.id));
      return row;
    }
    _renderList() {
      if (!this.sysOrder) return;
      const L = this.list;
      L.innerHTML = '';
      const q = this.query.toLowerCase();
      if (q) {
        const R = this.search_(q);
        if (R.absent) L.appendChild(h('p.an-none.an-absent', R.absent));
        if (!R.name.length && !R.group.length && !R.absent) L.appendChild(h('p.an-none', 'Nothing has that name. Try part of a name, in English or in Latin.'));
        let n = 0;
        R.name.slice(0, 80).forEach((s) => (L.appendChild(this._row(s, { sys: true })), n++));
        if (R.group.length && n < 80) {
          L.appendChild(h('div.an-lsys-h', h('b', R.name.length ? 'In groups of that name' : 'In the groups of that name')));
          R.group.slice(0, 80 - n).forEach((s) => (L.appendChild(this._row(s, { sys: true })), n++));
        }
        const all = R.name.length + R.group.length;
        if (all > n) L.appendChild(h('p.an-none', `…and ${all - n} more: type more of the name.`));
        return;
      }
      const on = this._onList();
      if (!on.length) {
        L.appendChild(h('p.an-none', 'Tick a system above to show it, and its structures are listed here.'));
        return;
      }
      on.forEach((k) => {
        const S = this.sys[k];
        const groups = new Map();
        S.structures.forEach((id) => {
          const s = this.S[id];
          if (!s) return;
          const g = S.files.includes(s.file) ? s.group || S.title : 'Also part of other systems';
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g).push(s);
        });
        const box = h('div.an-lsys', h('div.an-lsys-h', h('i.an-sw', { style: { background: this._sysColour(k) } }), h('b', S.title), h('small', this.on[k] === 'fade' ? 'faint' : '')));
        [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([g, list]) => {
          list.sort((a, b) => a.name.localeCompare(b.name));
          const det = h('details.an-grp', h('summary', h('span', g), h('small', String(list.length))));
          const fill = () => {
            if (det.dataset.filled) return;
            det.dataset.filled = '1';
            list.forEach((s) => det.appendChild(this._row(s)));
          };
          det.addEventListener('toggle', () => det.open && fill());
          if (list.some((s) => this.sel.includes(s.id)) || groups.size === 1) {
            det.open = true;
            fill();
          }
          box.appendChild(det);
        });
        L.appendChild(box);
      });
      const r = L.querySelector('.an-row.sel');
      if (r && this._scrollSel) {
        this._scrollSel = false;
        r.scrollIntoView({ block: 'nearest' });
      }
    }
    /** the structures a search finds: by their names (English or Latin, everyday names and plurals too), then by the
        names of their groups and systems ('heart', 'larynx'); and a word on what the model does not have */
    search_(q) {
      const vs = variants(q);
      const name = [], group = [];
      Object.values(this.S).forEach((s) => {
        const hay = s._hay || (s._hay = (s.name + ' ' + (s.latin || '')).toLowerCase());
        if (vs.some((v) => hay.includes(v))) return name.push(s);
        const grp = s._grp || (s._grp = [s.group || ''].concat(this.index.paths[s.path] || [], s.systems.map((k) => this.sys[k].title)).join(' | ').toLowerCase());
        if (vs.some((v) => grp.includes(v))) group.push(s);
      });
      const first = (s) => (vs.some((v) => s.name.toLowerCase().startsWith(v)) ? 0 : 1);
      name.sort((a, b) => first(a) - first(b) || a.name.localeCompare(b.name));
      group.sort((a, b) => a.name.localeCompare(b.name));
      const ab = ABSENT.find(([re]) => re.test(q));
      return { name, group, absent: ab ? ab[1] : null };
    }
    _searched() {
      clearTimeout(this._searchT);
      const q = this.query;
      if (!q) return;
      this._searchT = setTimeout(() => {
        const n = this.list.querySelectorAll('.an-row').length;
        bus.emit('anat:search', { q, n });
      }, 700);
    }
    /** how many of the side panels can be open at once and leave the view at least half the width of the tab: both
        when the tab is wide, one at a time on a laptop beside the instructions, and on a phone (where they lie over
        the view) one at a time too */
    _maxPanels() {
      const W = this.root.clientWidth || 1000;
      return W >= 1180 ? 2 : 1;
    }
    togglePanel(open, quiet) {
      if (open == null) open = this.panel.hidden;
      if (open && !this.info.hidden && this._maxPanels() < 2) this.toggleInfo(false, true);
      this.panel.hidden = !open;
      this.panelBtn.classList.toggle('on', open);
      this.panelBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!quiet) {
        this.st.panel = open;
        this._save();
      }
      this._resized();
    }
    toggleInfo(open, quiet) {
      if (open == null) open = this.info.hidden;
      if (open && !this.panel.hidden && this._maxPanels() < 2) this.togglePanel(false, true);
      this.info.hidden = !open;
      this.infoBtn.classList.toggle('on', open);
      if (!quiet) {
        this.st.info = open;
        this._save();
      }
      if (open) this._renderInfo();
      this._renderChip();
      this._resized();
    }
    showInfo(id, quiet) {
      this.infoSide = id === 'about' ? 'about' : 'info';
      Object.entries(this.infoTabs).forEach(([k, b]) => {
        b.classList.toggle('on', k === this.infoSide);
        b.setAttribute('aria-selected', k === this.infoSide ? 'true' : 'false');
      });
      if (!quiet) {
        this.st.side = this.infoSide;
        this._save();
      }
      this._renderInfo();
    }

    /* ================================================================ the side panel */
    async _defs() {
      if (!this._defsP) this._defsP = fetch(BASE + 'definitions.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      return this._defsP;
    }
    _renderInfo() {
      if (!this.infoBody || this.info.hidden) return;
      const B = this.infoBody;
      B.innerHTML = '';
      if (this.infoSide === 'about') return this._renderAbout(B);
      const s = this.S[this.sel[0]];
      if (!s) {
        B.append(h('p.an-help', 'Click on a structure to see what it is. Drag to turn the body round; scroll (or pinch) to zoom; drag with the right button (or two fingers) to move it.'),
          h('p.an-help', 'Tick the systems to show in the list on the left, and use the search box there to find a structure by its name.'));
        if (this.nShown) B.append(h('p.an-help', `${this.nShown} structures are shown.`));
        return;
      }
      const both = this.sel.length > 1;
      const name = both ? s.base : s.name;
      B.append(h('h3', name));
      if (s.latin) B.append(h('p.an-latin', h('i', s.latin), s.ta2 ? h('small', ` · TA2 ${s.ta2}`) : null));
      const path = (this.index.paths[s.path] || []).filter((p) => p !== s.base);
      const sysNames = s.systems.map((k) => this.sys[k].title).join(', ');
      B.append(h('dl.an-meta', h('dt', 'System'), h('dd', sysNames), path.length ? [h('dt', 'Part of'), h('dd', path.slice(-3).join(' › '))] : null, s.side && !both ? [h('dt', 'Side'), h('dd', s.side === 'left' ? 'Left (the body’s own left)' : 'Right (the body’s own right)')] : null));
      const acts = h('div.an-acts');
      const act = (ic, label, title, fn, on) => {
        const b = h('button.tbtn', { type: 'button', title, html: I(ic) + `<span>${label}</span>` });
        if (on) b.classList.add('on');
        b.addEventListener('click', fn);
        acts.appendChild(b);
      };
      const ids = this.sel.slice();
      const isoOn = !!this.isolated && ids.every((id) => this.isolated.has(id)) && this.isolated.size === ids.length;
      act('target', 'Frame it', 'Fit it in the view (F)', () => this.frame(ids));
      act('isolate', isoOn ? 'Show the others' : 'Isolate', isoOn ? 'Show the other structures again' : 'Show it alone (I)', () => this.isolate(ids, !isoOn, true), isoOn);
      const fadeOn = !!this.fadeRound && ids.every((id) => this.fadeRound.has(id));
      act('contrast', fadeOn ? 'Unfade the others' : 'Fade the others', 'Make everything else faint, to see it in place', () => this.fadeOthers(ids, !fadeOn, true), fadeOn);
      act('hide', 'Hide', 'Hide it (H)', () => this.hide(ids, true));
      if (!both && s.side) {
        const other = Object.values(this.S).find((x) => x.slug === s.slug && x.id !== s.id && x.side);
        if (other) act('showall', 'Both sides', 'Select it on both sides', () => this.select([s.id, other.id], { say: true, by: 'list' }));
      }
      B.append(acts);
      const d = h('div.an-def', h('p.an-note', 'Loading the definition…'));
      B.append(d);
      this._defs().then((defs) => {
        if (this.S[this.sel[0]] !== s) return;
        const D = defs[s.base];
        d.innerHTML = '';
        if (D) {
          d.append(h('p', D.text));
          d.append(h('p.an-credit', 'From ', D.url ? h('a', { href: D.url, target: '_blank', rel: 'noopener' }, 'Wikipedia') : 'Wikipedia', ' (CC BY-SA), as kept by Z-Anatomy.'));
        } else d.append(h('p.an-note', 'There is no definition of this structure in Z-Anatomy.'));
      });
    }
    _renderAbout(B) {
      const C = (this.index && this.index.credit) || {};
      const links = C.links || {};
      B.append(
        h('h3', 'The models'),
        h('p', 'The body is a 3D atlas of a man’s body: the skeleton, the muscles, the heart and vessels, the organs, the brain and the nerves. Each structure is a separate model that you can select, hide, isolate or cut through.'),
        h('p.an-credit', { html: `The models are from <a href="${esc(links['Z-Anatomy'] || 'https://www.z-anatomy.com/')}" target="_blank" rel="noopener"><b>Z-Anatomy</b></a>, the libre 3D atlas of anatomy (by Gauthier Kervyn and others), most of them made from <a href="${esc(links.BodyParts3D || 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/')}" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science (CC BY-SA 2.1 Japan). The surface of the brain is from <a href="${esc(links['Brain for Blender'] || 'https://brainder.org/research/brain-for-blender/')}" target="_blank" rel="noopener">Brain for Blender</a> by Anderson M. Winkler (CC BY-SA 3.0), and the cranial nerves follow “Cranial Nerves and Foramina” (University of Dundee, CAHID, CC BY 4.0). The definitions are the opening sentences of Wikipedia’s articles (CC BY-SA), as kept in Z-Anatomy.` }),
        h('p.an-credit', { html: 'They were simplified and converted for the workbench (see <code>build/anatomy</code>) and are shared, like Z-Anatomy, under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-ShareAlike 4.0</a> licence: you may use and share them, and pictures you take of them, if you credit Z-Anatomy and BodyParts3D and share what you make in the same way.' }),
        h('h4', 'What is not here'),
        h('ul.an-look',
          h('li', 'The female reproductive organs: the body is a man’s (BodyParts3D was made from one man).'),
          h('li', 'The ear, and the inside of the kidney (its pelvis and calyces): Z-Anatomy adapted these from models that may not be shared freely.'),
          h('li', 'The white matter of the cerebral hemispheres, the meninges, the pleura and the peritoneum, the joints, the teeth and the skin.')),
        h('h4', 'How to use it'),
        h('ul.an-look',
          h('li', 'Drag to turn the body; scroll or pinch to zoom; drag with the right mouse button, or with two fingers, to move it.'),
          h('li', 'Click a structure to select it, double-click to zoom to it. Keys: 1–6 the views, F frame, I isolate, H hide, L labels, Esc clear, arrows turn, + and − zoom.')));
      const n = Object.values(this.files).reduce((a, f) => a + (f.state === 'ready' ? f.bytes : 0), 0);
      B.append(h('p.an-note', `${Object.keys(this.S).length} structures in ${Object.keys(this.files).length} models; ${(n / 1e6).toFixed(1)} MB downloaded so far.`));
    }

    /* ================================================================ selecting, hiding, isolating */
    _resolve(name) {
      const n = String(name || '').trim();
      if (!n) return [];
      if (this.S[n]) return [n];
      const k = slugify(n.replace(/-(left|right)$/, ''));
      const side = /-(left|right)$/.exec(n);
      const ids = this.bySlug[k] || this.bySlug[slugify(n)] || [];
      return side ? ids.filter((id) => this.S[id].side === side[1]) : ids.slice();
    }
    /** a structure picked in the list or by a click: select it (turning its system on if need be) */
    async pick(id) {
      const s = this.S[id];
      if (!s) return;
      if (!s.systems.some((k) => this.on[k])) await this.setSystem(s.systems[0], 1);
      if (this.hidden.has(id)) this.unhide([id], true);
      if (this.isolated && !this.isolated.has(id)) this.isolate(null, false, true);
      if (this._narrow()) this.togglePanel(false, true);
      this.select([id], { say: true, by: 'list', frame: !this._isOnScreen(id) });
    }
    select(ids, opts = {}) {
      ids = (ids || []).filter((id) => this.S[id]);
      this.sel = ids;
      this.hint = null;
      this.st.sel = ids[0] || null;
      this._save();
      this._applyVis();
      this._scrollSel = true;
      this._renderList();
      // (the panel about it opens by itself when the view keeps room enough beside it; else its name shows below the body)
      // (the panel about it opens by itself after a click on the body; on a phone, its name shows below the body instead)
      if (ids.length && !opts.quiet && this.info.hidden && this.st.info !== false && !this._narrow() && (this._maxPanels() >= 2 || opts.by === 'click' || opts.by === 'find')) this.toggleInfo(true, true);
      this._renderInfo();
      this._renderChip();
      this.render();
      if (ids.length && opts.say) {
        const s = this.S[ids[0]];
        bus.emit('anat:select', { id: s.id, name: ids.length > 1 ? s.base : s.name, base: s.base, side: ids.length > 1 ? 'both' : s.side || '', system: s.systems[0], systems: s.systems.join(','), by: opts.by || 'go' });
      }
      if (ids.length && opts.frame) return this.frame(ids, opts.view);
      return Promise.resolve();
    }
    hide(ids, say) {
      ids = ids || this.sel;
      if (!ids.length) return;
      ids.forEach((id) => this.hidden.add(id));
      if (ids.some((id) => this.sel.includes(id))) this.sel = this.sel.filter((id) => !ids.includes(id));
      this._afterChange();
      if (say) bus.emit('anat:hide', { id: ids[0], base: this.S[ids[0]].base });
    }
    unhide(ids, quiet) {
      ids.forEach((id) => this.hidden.delete(id));
      this._afterChange();
    }
    isolate(ids, on = true, say) {
      if (on && ids && ids.length) {
        this.isolated = new Set(ids);
        this.fadeRound = null;
      } else this.isolated = null;
      this._afterChange();
      if (on && ids && ids.length) this.frame(ids);
      if (say) bus.emit('anat:isolate', { id: (ids && ids[0]) || '', base: ids && ids[0] ? this.S[ids[0]].base : '', on: !!on });
    }
    fadeOthers(ids, on = true, say) {
      this.fadeRound = on && ids && ids.length ? new Set(ids) : null;
      this._afterChange();
      if (say) bus.emit('anat:fade', { id: (ids && ids[0]) || '', base: ids && ids[0] ? this.S[ids[0]].base : '', on: !!on });
    }
    showAll(say) {
      this.hidden.clear();
      this.isolated = null;
      this.fadeRound = null;
      this._afterChange();
      if (say) bus.emit('anat:showall', {});
    }
    _renderChip() {
      const s = this.S[this.sel[0]];
      this.chip.hidden = !s || !this.info.hidden;
      if (s) this.chip.innerHTML = `<i class="an-dot" style="background:${esc(s.colour)}"></i><span>${esc(this.sel.length > 1 ? s.base : s.name)}</span>` + I('info');
    }
    _afterChange() {
      this.st.hidden = [...this.hidden];
      this._save();
      this._applyVis();
      this._renderList();
      this._renderInfo();
      this.render();
    }

    /* ================================================================ picking */
    _ndc(x, y) {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new this.T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    }
    _hitAt(x, y, faded) {
      this.ray.setFromCamera(this._ndc(x, y), this.camera);
      const list = [];
      Object.values(this.S).forEach((s) => s.mesh && s.mesh.visible && list.push(s.mesh));
      const hits = this.ray.intersectObjects(list, false);
      for (const ht of hits) {
        if (this.section && this.plane.distanceToPoint(ht.point) < 0) continue;
        const s = this.S[ht.object.userData.sid];
        if (!s) continue;
        const f = ht.object.material.transparent && ht.object.material.opacity < 0.5;
        if (f && !faded) continue;
        return { id: s.id, d: ht.distance, point: ht.point };
      }
      return null;
    }
    /** what is under a point of the screen: an opaque structure first, else a faint one; a click just beside a small
        structure counts too (rays a few pixels round the point) */
    _pick(x, y) {
      if (!this.renderer) return null;
      let hit = this._hitAt(x, y, false);
      if (!hit) {
        for (const r of [4, 8]) {
          for (let k = 0; k < 8 && !hit; k++) {
            const a = (k * Math.PI) / 4;
            hit = this._hitAt(x + r * Math.cos(a), y + r * Math.sin(a), false);
          }
          if (hit) break;
        }
      }
      if (!hit) hit = this._hitAt(x, y, true);
      return hit ? hit.id : null;
    }
    _click(x, y) {
      const id = this._pick(x, y);
      if (this.findTask) return this._findClick(id);
      if (!id) {
        if (this.sel.length) this.select([], { quiet: true });
        return;
      }
      if (this.sel.length === 1 && this.sel[0] === id) return;
      this.select([id], { say: true, by: 'click' });
    }
    _hover() {
      this._hoverT = null;
      const p = this._hoverAt;
      if (!p || !this.renderer) return;
      const id = this._pick(p.x, p.y);
      if (!id) return this._hideTip();
      const r = this.view.getBoundingClientRect();
      this.tip.textContent = this.S[id].name;
      this.tip.hidden = false;
      const x = p.x - r.left + 14, y = p.y - r.top + 16;
      this.tip.style.left = Math.min(x, r.width - this.tip.offsetWidth - 6) + 'px';
      this.tip.style.top = Math.min(y, r.height - 30) + 'px';
    }
    _hideTip() {
      this.tip.hidden = true;
    }
    /** a point of the screen (client coordinates) where a click lands on the structure – for the tests */
    testPoint(id) {
      const s = this.S[id];
      if (!s || !s.mesh || !s.mesh.visible) return null;
      const T = this.T;
      const r = this.renderer.domElement.getBoundingClientRect();
      const g = s.mesh.geometry, pos = g.attributes.position;
      const cand = [new T.Vector3().fromArray(s.anchor)];
      const step = Math.max(1, Math.floor(pos.count / 60));
      for (let i = 0; i < pos.count; i += step) cand.push(new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(s.mesh.matrixWorld));
      for (const v of cand) {
        const p = v.clone().project(this.camera);
        if (p.z > 1 || Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.98) continue;
        const x = r.left + ((p.x + 1) / 2) * r.width, y = r.top + ((1 - p.y) / 2) * r.height;
        const hit = this._hitAt(x, y, false) || this._hitAt(x, y, true);
        if (hit && hit.id === id) return { x, y };
      }
      return null;
    }

    /* ================================================================ the camera */
    /** what the view is framed on: the structures shown in full – and not the skeleton when other systems are shown with
        it (it is there for context) */
    _main() {
      const list = Object.values(this.S).filter((s) => this._isShown(s) && !this._isFaded(s));
      const organs = list.filter((s) => s.systems.some((k) => k !== 'skeleton' && this.on[k]));
      return organs.length ? organs : list;
    }
    _box(ids) {
      const T = this.T;
      const box = new T.Box3();
      const list = ids ? ids.map((id) => this.S[id]).filter(Boolean) : this._main();
      const use = list.length ? list : Object.values(this.S).filter((s) => this._isShown(s));
      use.forEach((s) => {
        box.expandByPoint(new T.Vector3().fromArray(s.min));
        box.expandByPoint(new T.Vector3().fromArray(s.max));
      });
      return box;
    }
    _allBox() {
      if (this._bbox) return this._bbox;
      const T = this.T;
      const box = new T.Box3();
      Object.values(this.S).forEach((s) => {
        if (!this._isShown(s)) return;
        box.expandByPoint(new T.Vector3().fromArray(s.min));
        box.expandByPoint(new T.Vector3().fromArray(s.max));
      });
      if (box.isEmpty()) {
        box.expandByPoint(new T.Vector3(-0.3, 0, -0.2));
        box.expandByPoint(new T.Vector3(0.3, 1.8, 0.2));
      }
      return (this._bbox = box);
    }
    /** where the camera goes to show a box from a direction, filling the view */
    _fit(box, dir) {
      const T = this.T;
      const fwd = new T.Vector3().fromArray(dir).normalize().negate();
      const up = Math.abs(fwd.y) > 0.99 ? new T.Vector3(0, 0, fwd.y > 0 ? 1 : -1) : new T.Vector3(0, 1, 0);
      const right = new T.Vector3().crossVectors(fwd, up).normalize();
      const upv = new T.Vector3().crossVectors(right, fwd).normalize();
      const c = box.getCenter(new T.Vector3());
      let w = 0, hh = 0, dd = 0;
      for (let i = 0; i < 8; i++) {
        const p = new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
        w = Math.max(w, Math.abs(p.dot(right)));
        hh = Math.max(hh, Math.abs(p.dot(upv)));
        dd = Math.max(dd, Math.abs(p.dot(fwd)));
      }
      const tan = Math.tan(this.T.MathUtils.degToRad(this.camera.fov / 2));
      const aspect = this.camera.aspect || 1;
      const dist = Math.max(hh / tan, w / (tan * aspect), 0.03) * 1.12 + dd;
      return { pos: c.clone().addScaledVector(fwd, -dist), target: c };
    }
    _clipCamera() {
      // (near and far follow the distance, so that small structures are not cut off close up)
      const d = this.camera.position.distanceTo(this.controls.target);
      const near = Math.max(0.002, d * 0.02), far = Math.max(5, d * 30);
      if (Math.abs(this.camera.near - near) > near * 0.2 || this.camera.far !== far) {
        this.camera.near = near;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
      }
    }
    _moveCamera(pos, target, instant) {
      const C = this.controls, cam = this.camera;
      this._camAnim = null;
      if (instant || reduced() || !this.view.offsetWidth) {
        cam.position.copy(pos);
        C.target.copy(target);
        this._clipCamera();
        C.update();
        this.render();
        this._save();
        return Promise.resolve();
      }
      const p0 = cam.position.clone(), t0 = C.target.clone(), start = performance.now(), dur = 380;
      return new Promise((done) => {
        const anim = (this._camAnim = () => {
          if (this._camAnim !== anim) return done();
          const k = Math.min(1, (performance.now() - start) / dur);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          cam.position.lerpVectors(p0, pos, e);
          C.target.lerpVectors(t0, target, e);
          this._clipCamera();
          C.update();
          this._draw();
          if (k < 1) requestAnimationFrame(anim);
          else {
            this._camAnim = null;
            this._save();
            done();
          }
        });
        requestAnimationFrame(anim);
      });
    }
    _viewDir() {
      return this.camera.position.clone().sub(this.controls.target).normalize().toArray();
    }
    _frameShown(view, opts = {}) {
      const dir = view && VIEWS[view] ? VIEWS[view].dir : this._viewDir();
      const box = (this.section && this._sectionBox(dir)) || this._box();
      const f = this._fit(box, dir);
      return this._moveCamera(f.pos, f.target, opts.instant);
    }
    /** looking at the face of a section: the structures it cuts (and those just behind it), not the whole body */
    _sectionBox(dir) {
      const A = AXES[this.section.axis];
      if (Math.abs(dir[A.k]) < 0.9) return null;
      const T = this.T;
      const n = this.plane.normal, c = -this.plane.constant / (n.getComponent(A.k) || 1);
      const keepBelow = n.getComponent(A.k) < 0;
      const lo = keepBelow ? c - 0.14 : c, hi = keepBelow ? c : c + 0.14;
      const box = new T.Box3();
      this._main().forEach((s) => {
        if (s.max[A.k] < lo || s.min[A.k] > hi) return;
        box.expandByPoint(new T.Vector3().fromArray(s.min));
        box.expandByPoint(new T.Vector3().fromArray(s.max));
      });
      if (box.isEmpty()) return null;
      box.min.setComponent(A.k, Math.max(box.min.getComponent(A.k), lo));
      box.max.setComponent(A.k, Math.min(box.max.getComponent(A.k), hi));
      return box;
    }
    /** fit structures (or what is shown) in the view, from the current direction or a standard view */
    frame(ids, view, opts = {}) {
      if (!this.camera) return Promise.resolve();
      ids = ids && ids.length ? ids : this.sel.length ? this.sel : null;
      const dir = view && VIEWS[view] ? VIEWS[view].dir : this._viewDir();
      const box = this._box(ids);
      if (ids) {
        // (a structure is shown with what is round it: at least 16 cm across, and a margin)
        const T = this.T;
        const size = box.getSize(new T.Vector3());
        const m = Math.max(size.x, size.y, size.z);
        box.expandByScalar(Math.max(0, (0.16 - m) / 2) + m * 0.18);
      }
      const f = this._fit(box, dir);
      return this._moveCamera(f.pos, f.target, opts.instant);
    }
    setView(name, say) {
      if (!VIEWS[name]) return Promise.resolve();
      this._lastView = name;
      const p = this.sel.length && this._isOnScreen(this.sel[0]) ? this.frame(this.sel, name) : this._frameShown(name);
      if (say) bus.emit('anat:view', { name });
      return p;
    }
    resetView() {
      this._lastView = 'anterior';
      return this._frameShown('anterior');
    }
    _isOnScreen(id) {
      const s = this.S[id];
      if (!s || !s.mesh || !s.mesh.visible) return false;
      const p = new this.T.Vector3().fromArray(s.anchor).project(this.camera);
      return p.z < 1 && Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9;
    }
    _orbit(dTheta, dPhi) {
      const T = this.T;
      const off = this.camera.position.clone().sub(this.controls.target);
      const sp = new T.Spherical().setFromVector3(off);
      sp.theta += dTheta;
      sp.phi = Math.max(0.01, Math.min(Math.PI - 0.01, sp.phi + dPhi));
      off.setFromSpherical(sp);
      this.camera.position.copy(this.controls.target).add(off);
      this.controls.update();
      this.render();
    }
    _dolly(k) {
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(k);
      this.camera.position.copy(this.controls.target).add(off);
      this._clipCamera();
      this.controls.update();
      this.render();
    }

    /* ================================================================ drawing */
    render() {
      if (!this.renderer || this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this._draw();
      });
    }
    _draw() {
      if (!this.renderer || !this.view.offsetWidth) return;
      this.renderer.render(this.scene, this.camera);
      this._drawLabels();
      this._drawCompass();
      this.drawn = (this.drawn || 0) + 1;
    }
    _resized() {
      this._fitBar();
      if (!this.info.hidden && !this.panel.hidden && this._maxPanels() < 2) this.togglePanel(false, true);
      if (!this.renderer) return;
      const W = this.view.clientWidth, H = this.view.clientHeight;
      if (!W || !H) return;
      if (this._W === W && this._H === H) return;
      const was = this._W;
      this._W = W;
      this._H = H;
      this.renderer.setSize(W, H, false);
      this.renderer.domElement.style.width = W + 'px';
      this.renderer.domElement.style.height = H + 'px';
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // (a panel that opens or closes moves the middle of the view: what is selected stays in it)
      if (was && this.sel.length && !this._camAnim && !this._isOnScreen(this.sel[0])) this.frame(this.sel, null, { instant: true });
      this._draw();
    }
    /** the toolbar on one line: the names of the tools when they fit, else only their icons (.an-compact) */
    _fitBar() {
      const b = this.bar;
      if (!b || !b.clientWidth) return;
      b.classList.remove('an-compact');
      if (b.scrollWidth > b.clientWidth + 1) b.classList.add('an-compact');
    }
    shown(opts = {}) {
      setTimeout(() => {
        this._W = 0;
        this._resized();
        this.render();
      }, 30);
    }
    _drawCompass() {
      // which way is the head, and which side is the body's left, from where the student looks
      const T = this.T;
      const cam = this.camera;
      const toScreen = (v) => {
        const p = v.clone().applyQuaternion(cam.quaternion.clone().invert());
        return [p.x, -p.y];
      };
      const items = [['S', new T.Vector3(0, 1, 0)], ['I', new T.Vector3(0, -1, 0)], ['L', new T.Vector3(1, 0, 0)], ['R', new T.Vector3(-1, 0, 0)], ['A', new T.Vector3(0, 0, 1)], ['P', new T.Vector3(0, 0, -1)]];
      const R = 17;
      let html = `<svg viewBox="-28 -28 56 56" width="56" height="56">`;
      items.forEach(([t, v]) => {
        const [x, y] = toScreen(v);
        const len = Math.hypot(x, y);
        if (len < 0.3) return;
        const px = x * R, py = y * R;
        html += `<line x1="0" y1="0" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}"/><text x="${(px * 1.38).toFixed(1)}" y="${(py * 1.38 + 3.5).toFixed(1)}">${t}</text>`;
      });
      this.compass.innerHTML = html + '</svg>';
      this.compass.title = 'S superior (head), I inferior, L the body’s left, R its right, A anterior (front), P posterior (back)';
    }

    /* ================================================================ labels */
    setLabels(on, say) {
      this.labels = !!on;
      this.st.labels = this.labels;
      this._save();
      this.labBtn.classList.toggle('on', this.labels);
      this.labBtn.setAttribute('aria-pressed', this.labels ? 'true' : 'false');
      this.render();
      if (say) {
        const n = this._labelIds().length;
        if (this.labels && this._tooMany) toast(`Only the selected structure is labelled: ${this._tooMany} structures are shown. Isolate some, or show a smaller system, to label them all.`, null, 5000);
        bus.emit('anat:labels', { on: this.labels, n });
      }
    }
    _labelIds() {
      this._tooMany = 0;
      if (!this.labels) return this.sel.slice();
      const shown = Object.values(this.S).filter((s) => this._isShown(s) && !this._isFaded(s)).map((s) => s.id);
      if (shown.length > 36) {
        this._tooMany = shown.length;
        return this.sel.slice();
      }
      return shown;
    }
    /** the labels: a pin on each structure, a line, and its name at the side of the view (as in an atlas) */
    _layoutLabels() {
      const W = this._W || this.view.clientWidth, H = this._H || this.view.clientHeight;
      const ids = this._labelIds();
      const T = this.T;
      const pts = [];
      ids.forEach((id) => {
        const s = this.S[id];
        if (!s || !s.mesh || !s.mesh.visible) return;
        const v = new T.Vector3().fromArray(s.anchor);
        if (this.section && this.plane.distanceToPoint(v) < -0.002) return;
        const p = v.project(this.camera);
        if (p.z > 1 || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) return;
        pts.push({ id, x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, text: this.sel.length > 1 && this.sel.includes(id) ? s.base : s.name, sel: this.sel.includes(id) });
      });
      if (!pts.length) return [];
      if (pts.length === 1 && !this.labels) {
        const p = pts[0];
        const right = p.x < W * 0.62;
        return [Object.assign(p, { lx: right ? Math.min(W - 10, p.x + 46) : Math.max(10, p.x - 46), ly: Math.max(18, p.y - 38), anchor: right ? 'start' : 'end' })];
      }
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const sides = [pts.filter((p) => p.x < cx || (p.x === cx && pts.length === 1)), pts.filter((p) => !(p.x < cx || (p.x === cx && pts.length === 1)))];
      const out = [];
      const lh = 17;
      sides.forEach((list, k) => {
        list.sort((a, b) => a.y - b.y);
        // (top down, each below the last; then, from the bottom up, none below the bottom of the view)
        let y = 14;
        list.forEach((p) => {
          p.ly = Math.max(y, p.y);
          y = p.ly + lh;
        });
        let maxY = H - 8;
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].ly > maxY) list[i].ly = maxY;
          maxY = list[i].ly - lh;
        }
        list.forEach((p) => {
          p.lx = k === 0 ? 10 : W - 10;
          p.anchor = k === 0 ? 'start' : 'end';
          p.text = this._fitText(p.text, W / 2 - 18);
          out.push(p);
        });
      });
      return out;
    }
    _textW(t) {
      if (!this._ctx2) {
        this._ctx2 = document.createElement('canvas').getContext('2d');
        this._ctx2.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
      }
      return this._ctx2.measureText(t).width;
    }
    /** a name cut short (…) to a width in pixels */
    _fitText(t, w) {
      if (this._textW(t) <= w) return t;
      let a = 0, b = t.length;
      while (a < b) {
        const m = Math.ceil((a + b) / 2);
        if (this._textW(t.slice(0, m).trimEnd() + '…') <= w) a = m;
        else b = m - 1;
      }
      return t.slice(0, Math.max(1, a)).trimEnd() + '…';
    }
    /** where a label's line meets its text */
    _lineEnd(p, many) {
      if (!many) return p.lx;
      const tw = this._textW(p.text) + 4;
      return p.anchor === 'start' ? p.lx + tw : p.lx - tw;
    }
    _drawLabels() {
      const L = (this._labelLayout = this._layoutLabels());
      const many = this.labels && L.length > 1;
      let s = '';
      L.forEach((p) => {
        const lx = this._lineEnd(p, many);
        s += `<g class="an-lab${p.sel ? ' sel' : ''}"><line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(p.ly - 4).toFixed(1)}"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6"/><text x="${p.lx.toFixed(1)}" y="${p.ly.toFixed(1)}" text-anchor="${p.anchor}">${esc(p.text)}</text></g>`;
      });
      this.svg.innerHTML = s;
    }

    /* ================================================================ sections */
    setSection(axis, at, opts = {}) {
      if (!this.T) return;
      if (!axis || axis === 'off' || !AXES[axis]) {
        const was = !!this.section;
        this.section = null;
        this.secBar.hidden = true;
        this.secBtn.classList.remove('on');
        this.secBtn.setAttribute('aria-pressed', 'false');
        this.st.section = null;
        this._save();
        this._applyVis();
        this.render();
        if (was && opts.say) bus.emit('anat:section', { axis: 'off', at: 0, flip: false });
        return;
      }
      const A = AXES[axis];
      at = Math.max(0, Math.min(1, Number(at)));
      if (!isFinite(at)) at = 0.5;
      const flip = opts.flip != null ? !!opts.flip : this.section && this.section.axis === axis ? this.section.flip : false;
      const fresh = !this.section;
      this.section = { axis, at, flip };
      const box = this._allBox();
      const lo = box.min.getComponent(A.k), hi = box.max.getComponent(A.k);
      const c = lo + (hi - lo) * at;
      const n = new this.T.Vector3().fromArray(A.n);
      if (flip) n.negate();
      // (the plane keeps the points where n·p + constant ≥ 0, those on the side n points to)
      this.plane.normal.copy(n);
      this.plane.constant = -n.getComponent(A.k) * c;
      this.secBar.hidden = false;
      this.secName.textContent = A.label + ' section';
      this.secRange.value = String(Math.round(at * 1000));
      this.secRange.title = 'Where it cuts, ' + A.what;
      this.secBtn.classList.add('on');
      this.secBtn.setAttribute('aria-pressed', 'true');
      this.st.section = this.section;
      this._save();
      if (fresh) this._applyVis();
      this.render();
      if (opts.say === 'later') {
        clearTimeout(this._secT);
        this._secT = setTimeout(() => bus.emit('anat:section', { axis, at: Math.round(at * 100) / 100, flip }), 350);
      } else if (opts.say) bus.emit('anat:section', { axis, at: Math.round(at * 100) / 100, flip });
    }
    _sectionMenu() {
      const items = Object.entries(AXES).map(([k, A]) => ['layers', `${A.label} section` + (this.section && this.section.axis === k ? ' ✓' : ''), () => {
        this.setSection(k, this.section && this.section.axis === k ? this.section.at : 0.5, { say: true });
        if (!this.section || this.section.axis !== k) return;
        this.setView(A.view, false);
      }]);
      if (this.section) items.push(['x', 'No section', () => this.setSection('off', 0, { say: true })]);
      MG.popmenu(this.secBtn, items);
    }
    _viewMenu() {
      const items = Object.entries(VIEWS).map(([k, V]) => ['cube', `${V.label}  (${V.key})`, () => this.setView(k, true)]);
      items.push(['reset', 'Reset: everything shown, from the front  (R)', () => this.resetView()]);
      MG.popmenu(this.viewBtn, items);
    }
    _moreMenu(anchor) {
      MG.popmenu(anchor, [
        ['help', 'How to use the anatomy', () => this.help()],
        ['info', 'About the models', () => {
          this.toggleInfo(true);
          this.showInfo('about');
        }],
        ['eye', 'Show the organs of the trunk again', () => this.go('heart+respiratory+digestive+urinary+endocrine')],
        ['reset', 'Start again (the first view)', () => this.reset()]
      ]);
    }
    async reset() {
      this.findTask = null;
      this._hideBanner();
      this.showAll();
      this.setSection('off');
      this.setLabels(false);
      this.select([], { quiet: true });
      this._setSystems(DEFAULT_ON);
      await this._loadShown();
      await this._frameShown('anterior');
    }

    /* ================================================================ what the instructions ask for */
    /** show something: see the top of this file for the specs */
    async go(spec) {
      await this.ready;
      if (!this.T) return;
      const items = String(spec || '').split('+').map((x) => x.trim()).filter(Boolean);
      let view = null, sel = null, labels = false, section;
      const systems = [];
      for (let it of items) {
        let m = /^section:(\w+)(?:@([\d.]+))?(?:@(\w+))?$/i.exec(it);
        if (m) {
          section = { axis: m[1].toLowerCase(), at: m[2] != null ? Number(m[2]) : 0.5 };
          if (m[3]) view = m[3].toLowerCase();
          continue;
        }
        if (/^labels?$/i.test(it)) {
          labels = true;
          continue;
        }
        if ((m = /^view:(\w+)$/i.exec(it))) {
          view = m[1].toLowerCase();
          continue;
        }
        const at = it.lastIndexOf('@');
        if (at > 0) {
          view = it.slice(at + 1).toLowerCase();
          it = it.slice(0, at);
        }
        const [a, b] = it.split(':');
        if (b) {
          if (this.sys[a]) systems.push(a);
          const ids = this._resolve(b);
          if (ids.length) sel = ids;
          else toast(`There is no structure called “${esc(b)}”.`, 'warn');
        } else if (a === 'all') systems.push(...this.sysOrder.filter((k) => k !== 'muscles'));
        else if (this.sys[a]) systems.push(a);
        else {
          const ids = this._resolve(a);
          if (ids.length) {
            sel = ids;
            systems.push(this.S[ids[0]].systems[0]);
          } else toast(`There is nothing called “${esc(a)}” in the anatomy.`, 'warn');
        }
      }
      if (this.findTask) this.cancelFind(true);
      if (systems.length) {
        const on = {};
        systems.forEach((k) => (on[k] = 1));
        if (!systems.includes('skeleton')) on.skeleton = 'fade';
        this.hidden.clear();
        this.isolated = null;
        this.fadeRound = null;
        this.st.hidden = [];
        this._setSystems(on, { named: systems });
        await this._loadShown();
      }
      // (a section stays only while it is asked for: new systems start whole)
      if (section) this.setSection(section.axis, section.at, { say: true, flip: false });
      else if (systems.length && this.section) this.setSection('off');
      if (labels) this.setLabels(true, true);
      if (sel) await this.select(sel, { say: true, by: 'go', frame: true, view: view || 'anterior' });
      else {
        if (systems.length && this.sel.length) this.select([], { quiet: true });
        if (systems.length || view) {
          const v = view && VIEWS[view] ? view : 'anterior';
          this._lastView = v;
          await this._frameShown(v);
        }
      }
      this._draw();
    }
    /** "Find the … and click on it" */
    async find(spec) {
      await this.ready;
      if (!this.T) return;
      let [a, b] = String(spec || '').split(':');
      const want = b != null ? b : a;
      const sysId = b != null && this.sys[a] ? a : null;
      const targets = [...new Set(want.split('|').flatMap((x) => this._resolve(x)))];
      if (!targets.length) {
        toast(`There is no structure called “${esc(want)}”.`, 'warn');
        return;
      }
      const s0 = this.S[targets[0]];
      if (!targets.some((id) => this.S[id].systems.some((k) => this.on[k]))) {
        const k = sysId || s0.systems[0];
        const on = Object.assign({}, this.on, { [k]: 1 });
        if (!Object.keys(this.on).length) on.skeleton = 'fade';
        this._setSystems(on);
      }
      targets.forEach((id) => this.hidden.delete(id));
      if (this.isolated && !targets.some((id) => this.isolated.has(id))) this.isolated = null;
      this._afterChange();
      await this._loadShown();
      const both = new Set(targets.map((id) => this.S[id].slug)).size === 1 && targets.length > 1;
      const name = lcFirst(s0.base);
      this.findTask = { spec: String(spec), targets, name, article: both ? 'a' : 'the' };
      this.select([], { quiet: true });
      const size = Math.max(...s0.max.map((v, i) => v - s0.min[i]));
      this._findBanner(`Find ${this.findTask.article} <b>${esc(name)}</b> and click on it.${size < 0.012 ? ' (It is small: zoom in.)' : ''}`, 'find');
      this.render();
    }
    _findBanner(html, kind) {
      const show = h('button.tbtn', { type: 'button' }, 'Show me');
      show.addEventListener('click', () => this._findShow());
      const stop = h('button.tbtn', { type: 'button' }, 'Stop');
      stop.addEventListener('click', () => this.cancelFind());
      this._banner(html, kind, [show, stop]);
    }
    _findClick(id) {
      const T = this.findTask;
      const tgt = T.targets[0];
      if (!id) {
        this._findBanner(`That isn’t one of the structures shown. Find ${T.article} <b>${esc(T.name)}</b> and click on it.`, 'no');
        bus.emit('anat:find', { id: tgt, target: T.spec, ok: false, clicked: '' });
        return;
      }
      if (T.targets.includes(id)) {
        this.findTask = null;
        this.hint = null;
        this.select([id], { say: true, by: 'find' });
        this._banner(`✓ Yes – that’s the <b>${esc(lcFirst(this.S[id].name))}</b>.`, 'ok');
        clearTimeout(this._bannerT);
        this._bannerT = setTimeout(() => this._hideBanner(), 4000);
        bus.emit('anat:find', { id, target: T.spec, ok: true, clicked: id });
        return;
      }
      const s = this.S[id];
      const same = s.slug === this.S[tgt].slug;
      this._findBanner(same ? `That’s the ${esc(lcFirst(s.name))} – the other side is asked for.` : `That’s the <b>${esc(lcFirst(s.name))}</b>, not the ${esc(T.name)}. Try again, or use <b>Show me</b>.`, 'no');
      bus.emit('anat:find', { id: tgt, target: T.spec, ok: false, clicked: id });
    }
    async _findShow() {
      const T = this.findTask;
      if (!T) return;
      this.hint = T.targets.slice();
      T.targets.forEach((id) => this.hidden.delete(id));
      this._applyVis();
      await this.frame(T.targets);
      // (the structure glows for a few seconds)
      let k = 0;
      clearInterval(this._pulseT);
      this._pulseT = setInterval(() => {
        this._pulse = !this._pulse;
        this._applyVis();
        this.render();
        if (++k >= 8) {
          clearInterval(this._pulseT);
          this._pulse = false;
          this._applyVis();
          this.render();
        }
      }, 420);
      this._findBanner(`Here is ${T.article} <b>${esc(T.name)}</b>, glowing. Click on it.`, 'find');
    }
    cancelFind(quiet) {
      this.findTask = null;
      this.hint = null;
      this._hideBanner();
      this._applyVis();
      this.render();
    }
    _banner(html, kind, actions) {
      this.banner.innerHTML = '';
      this.banner.className = 'an-banner ' + (kind || 'info');
      this.banner.append(h('span', { html }));
      (actions || []).forEach((b) => this.banner.appendChild(b));
      this.banner.hidden = false;
      clearTimeout(this._bannerT);
    }
    _hideBanner() {
      this.banner.hidden = true;
    }

    /* ================================================================ pictures */
    async capture() {
      if (!this.renderer) return null;
      this._draw();
      const R = this.renderer.domElement;
      const pr = this.renderer.getPixelRatio();
      const W = R.width, H = R.height;
      // (the credit of the models shown, on as many lines as it needs below the title)
      const credit = this.creditText();
      const meas = document.createElement('canvas').getContext('2d');
      meas.font = `${11 * pr}px system-ui, sans-serif`;
      const lines = [];
      credit.split(' · ').forEach((part, i) => {
        const t = (i ? ' · ' : '') + part;
        if (lines.length && meas.measureText(lines[lines.length - 1] + t).width <= W - 20 * pr) lines[lines.length - 1] += t;
        else lines.push(i ? part : t);
      });
      const strip = Math.round((28 + 15 * lines.length) * pr);
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H + strip;
      const g = out.getContext('2d');
      g.drawImage(R, 0, 0);
      // the labels, as on the screen
      (this._labelLayout || []).forEach((p) => {
        g.strokeStyle = 'rgba(20,24,32,0.85)';
        g.fillStyle = p.sel ? '#ffb000' : '#ffffff';
        g.lineWidth = 1.4 * pr;
        g.beginPath();
        g.moveTo(p.x * pr, p.y * pr);
        const lx = this._lineEnd(p, this.labels && this._labelLayout.length > 1);
        g.lineTo(lx * pr, (p.ly - 4) * pr);
        g.stroke();
        g.beginPath();
        g.arc(p.x * pr, p.y * pr, 3.6 * pr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.font = `600 ${12 * pr}px system-ui, sans-serif`;
        g.textAlign = p.anchor === 'start' ? 'left' : 'right';
        g.lineWidth = 3.2 * pr;
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.strokeText(p.text, p.lx * pr, p.ly * pr);
        g.fillStyle = '#141820';
        g.fillText(p.text, p.lx * pr, p.ly * pr);
      });
      // the strip below: what it shows, and the credit
      g.fillStyle = '#1b2340';
      g.fillRect(0, H, W, strip);
      g.fillStyle = '#ffffff';
      g.font = `600 ${13 * pr}px system-ui, sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const sel = this.S[this.sel[0]];
      const what = sel ? (this.sel.length > 1 ? sel.base : sel.name) : this.titleEl.textContent;
      const view = this._viewName();
      g.fillText(`${what}${view ? ' – ' + view + ' view' : ''}${this.section ? ' – ' + this.section.axis + ' section' : ''}`, 10 * pr, H + 15 * pr);
      g.font = `${11 * pr}px system-ui, sans-serif`;
      g.fillStyle = '#c9d1e6';
      lines.forEach((l, i) => g.fillText(l, 10 * pr, H + (33 + 15 * i) * pr));
      this.lastCredit = credit;
      const blob = await new Promise((ok) => out.toBlob(ok, 'image/png'));
      if (!blob) {
        toast('The picture could not be made in this browser.', 'error');
        return null;
      }
      let base = slugify(what).slice(0, 48) || 'anatomy';
      if (view) base += '-' + view;
      const fs = this.fs;
      let name = base + '.png', k = 2;
      while (fs && fs.exists(MG.app.HOME + '/anatomy/' + name)) name = `${base}-${k++}.png`;
      const path = await MG.app.saveToFiles(name, blob, { folder: '~/anatomy', ask: false });
      if (path) bus.emit('anat:capture', { path, name });
      return path;
    }
    /** the sources of the structures shown: Z-Anatomy and BodyParts3D always, and Brain for Blender and the University of
        Dundee when their parts are shown */
    creditKeys() {
      const keys = ['zanatomy', 'bodyparts3d'];
      Object.values(this.S).forEach((s) => s.src && this._isShown(s) && s.src.forEach((k) => keys.includes(k) || keys.push(k)));
      return keys;
    }
    creditText() {
      const src = (this.index && this.index.sources) || {};
      return 'Models: ' + this.creditKeys().map((k) => (src[k] ? src[k].short : k)).join(' · ');
    }
    _viewName() {
      const d = this._viewDir();
      let best = null, b = 0.97;
      Object.entries(VIEWS).forEach(([k, V]) => {
        const v = V.dir, n = Math.hypot(v[0], v[1], v[2]);
        const dot = (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / n;
        if (dot > b) (b = dot), (best = k);
      });
      return best;
    }

    /* ================================================================ keys, help, state */
    _key(e) {
      if (e.target.closest('input, textarea, select, .an-panel, .an-info') && e.key !== 'Escape') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const V = Object.entries(VIEWS).find(([, v]) => v.key === k);
      if (V) {
        e.preventDefault();
        return this.setView(V[0], true);
      }
      const step = Math.PI / 12;
      if (k === 'ArrowLeft') this._orbit(-step, 0);
      else if (k === 'ArrowRight') this._orbit(step, 0);
      else if (k === 'ArrowUp') this._orbit(0, -step);
      else if (k === 'ArrowDown') this._orbit(0, step);
      else if (k === '+' || k === '=') this._dolly(0.84);
      else if (k === '-' || k === '_') this._dolly(1.19);
      else if (k === 'f' || k === 'F') this.frame();
      else if (k === 'r' || k === 'R') this.resetView();
      else if ((k === 'h' || k === 'H') && this.sel.length) this.hide(this.sel.slice(), true);
      else if ((k === 'i' || k === 'I') && this.sel.length) this.isolate(this.sel.slice(), !(this.isolated && this.sel.every((id) => this.isolated.has(id))), true);
      else if (k === 'l' || k === 'L') this.setLabels(!this.labels, true);
      else if (k === 'Escape') {
        if (this.findTask) this.cancelFind();
        else if (this.sel.length) this.select([], { quiet: true });
        else return;
      } else return;
      e.preventDefault();
    }
    help() {
      MG.modal('The anatomy', `<ul>
<li><b>Turn</b> the body by dragging it (one finger on a touch screen); <b>zoom</b> with the scroll wheel or a pinch; <b>move</b> it by dragging with the right mouse button or two fingers. <b>View</b> gives the standard views; <b>Frame</b> fits what you selected, or everything shown, in the view.</li>
<li><b>Systems</b> (on the left) shows and hides the systems of the body: tick one to show it, and use the eye beside it to make it faint, so that you can see what is behind it. The search box finds any structure by its English or Latin name.</li>
<li><b>Click</b> on a structure to select it: its name, its Latin name and a short definition appear in the panel on the right, where you can <b>isolate</b> it (show it alone), <b>fade the others</b> round it, or <b>hide</b> it. Double-click to zoom to it.</li>
<li><b>Section</b> cuts through the body (sagittal, coronal or transverse); move the slider to choose where.</li>
<li><b>Labels</b> names the structures shown (when there are not too many); the camera button keeps a picture in Files, in the folder <code>anatomy</code>.</li>
<li>Keys: <kbd>1</kbd>–<kbd>6</kbd> the views, <kbd>F</kbd> frame, <kbd>I</kbd> isolate, <kbd>H</kbd> hide, <kbd>L</kbd> labels, <kbd>R</kbd> reset the view, arrows turn, <kbd>+</kbd> and <kbd>−</kbd> zoom, <kbd>Esc</kbd> clear the selection.</li>
<li>The little figure at the bottom left shows which way the body is facing: <b>S</b> superior (the head), <b>I</b> inferior, <b>A</b> anterior, <b>P</b> posterior, and <b>L</b> and <b>R</b> the body’s own left and right.</li>
</ul><p class="muted">The models are Z-Anatomy’s and BodyParts3D’s (CC BY-SA 4.0): see <b>About</b> in the panel on the right.</p>`);
    }
    _state() {
      return {
        on: this.on, cam: this.camera ? { p: this.camera.position.toArray().map((v) => +v.toFixed(4)), t: this.controls.target.toArray().map((v) => +v.toFixed(4)) } : null,
        sel: this.sel[0] || null, labels: this.labels, section: this.section, panel: this.st.panel, info: this.st.info, side: this.infoSide || 'info', hidden: [...this.hidden]
      };
    }
  }
  MG.AnatomyApp = AnatomyApp;
})();
