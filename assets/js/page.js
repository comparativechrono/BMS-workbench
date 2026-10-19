/* =====================================================================
   Setting up the BMS workbench: the file system (the user's files, which
   are kept in the browser, and the starter files copied in on the first
   visit), the tabs (each one is built the first time it is shown, and the
   bigger ones load their code only then), opening files in the right
   place, what the buttons in the instructions do (MG.actions) and the
   conditions that tasks can check (MG.checks).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const CFG = MG.config;
  MG.app = MG.app || {};
  MG.page = MG.page || {};
  MG.actions = MG.actions || {};
  MG.checks = MG.checks || {};

  const HOME = '/home/user';
  MG.app.HOME = HOME;
  const abs = (u) => new URL(u, location.href).href;
  /* the files a new user finds in their home folder: the site's starter/ folder (the list is written into the page by
     build/make_page.py): starter/data/x.csv → ~/data/x.csv, starter/scripts/y.R → ~/scripts/y.R */
  const STARTERS = window.BMS_STARTERS || [];

  async function setupFs() {
    const fs = new MG.VFS(HOME);
    fs.mkdirp('/tmp');
    await MG.project.restore(fs, [HOME]);
    fs.cwd = HOME;
    // the first visit (or new starter files): copy them in; a file that is there already is left alone
    const seeded = store.get('seeded', 0);
    const version = Number(window.BMS_STARTERS_VERSION || 1);
    if (seeded < version) {
      for (const s of STARTERS) {
        const path = HOME + '/' + s.p;
        if (fs.exists(path)) continue;
        try {
          const r = await fetch(abs('starter/' + s.p));
          if (!r.ok) continue;
          const bytes = new Uint8Array(await r.arrayBuffer());
          const text = MG.looksText(s.p, bytes);
          fs.mkdirp(MG.path.dirname(path));
          if (text != null) fs.put(path, { kind: 'text', text, mtime: Date.parse('2026-10-19T09:00:00Z') });
          else fs.put(path, { kind: 'blob', blob: new Blob([bytes]), mtime: Date.parse('2026-10-19T09:00:00Z') });
        } catch (e) {
          /* offline: no starter */
        }
      }
      for (const d of ['microscope', 'diagrams', 'circuits', 'essays']) fs.mkdirp(HOME + '/' + d);
      store.set('seeded', version);
    }
    MG.project.watch(fs);
    return fs;
  }

  MG.page.firstBench = 'scope';
  MG.page.init = async function () {
    MG.app.fs = await setupFs();
    MG.project.persist();
  };

  /* ------------------------------------------------------------------
     the tabs, built when first shown (with their code, loaded once)
     ------------------------------------------------------------------ */
  const once = {};
  const loadOnce = (src) => (once[src] = once[src] || MG.loadScript(src));
  MG.app.loadOnce = loadOnce;
  async function loadAll(list) {
    for (const src of list) await loadOnce(src);
  }
  const loading = (root, what) => (root.innerHTML = `<div class="wb-loading"><span class="spinner"></span> Loading ${esc(what)}…</div>`);

  MG.app.createViewer = function (root) {
    try {
      new MG.ViewerUI(root);
      if (MG.BMSLibrary) MG.app.molLibrary = new MG.BMSLibrary(MG.app.vui);
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="ex-empty"><h3>The Molecules tab could not start</h3><p>This browser or computer may have 3D graphics (WebGL) switched off. Try Chrome, Edge, Firefox or Safari, and turn on “hardware acceleration” in the browser\'s settings.</p></div>';
      const noop = () => toast('The Molecules tab (3D) is not available in this browser.', 'error');
      MG.app.vui = { run: noop, log() {}, showTab() {}, showHelp() { noop(); }, tabs: {}, views: [] };
      MG.app.viewer = { structures: [], stage: { handleResize() {} } };
      if (MG.commands) MG.commands.run = async () => noop();
    }
  };

  /** build a tab whose module (one script) loads its own libraries: MG.app[key] = new MG[cls](root, { fs }) */
  async function build(pane, sel, what, src, key, cls) {
    const root = pane.querySelector(sel);
    loading(root, what);
    await loadOnce(src);
    root.innerHTML = '';
    MG.app[key] = new MG[cls](root, { fs: MG.app.fs });
    if (MG.app[key].ready) await MG.app[key].ready;
  }

  MG.page.lazy = {
    scope: async (pane) => {
      const root = pane.querySelector('#scopeRoot');
      loading(root, 'the microscope');
      await loadAll(['assets/vendor/openseadragon/openseadragon.min.js', 'assets/js/scope.js']);
      root.innerHTML = '';
      MG.app.scope = new MG.Microscope(root, { fs: MG.app.fs });
      await MG.app.scope.ready;
    },
    flow: async (pane) => {
      const root = pane.querySelector('#flowRoot');
      loading(root, 'the diagrams');
      await loadAll(['assets/js/flow.js']);
      root.innerHTML = '';
      MG.app.flow = new MG.FlowApp(root, { fs: MG.app.fs });
      if (MG.app.flow.ready) await MG.app.flow.ready;
    },
    circuit: async (pane) => {
      const root = pane.querySelector('#circuitRoot');
      loading(root, 'the circuits');
      await loadAll(['assets/js/circuit.js']);
      root.innerHTML = '';
      MG.app.circuit = new MG.CircuitApp(root, { fs: MG.app.fs });
      if (MG.app.circuit.ready) await MG.app.circuit.ready;
    },
    exam: async (pane) => {
      const root = pane.querySelector('#examRoot');
      loading(root, 'exam practice');
      await loadAll(['assets/js/calc.js', 'assets/js/exam.js']);
      root.innerHTML = '';
      MG.app.exam = new MG.ExamApp(root, { fs: MG.app.fs });
      if (MG.app.exam.ready) await MG.app.exam.ready;
    },
    viewer: async (pane) => {
      const root = pane.querySelector('#viewerRoot');
      loading(root, 'the molecules');
      await loadAll(['assets/vendor/ngl/ngl.js', 'assets/js/viewer-core.js', 'assets/js/annot.js', 'assets/js/alphafold.js', 'assets/js/commands.js', 'assets/js/session.js', 'assets/js/viewer-ui.js', 'assets/js/viewer-bms.js']);
      root.innerHTML = '';
      MG.app.createViewer(root);
    },
    /* the newer tabs: each module loads what else it needs (its libraries) itself, before its .ready */
    anatomy: (pane) => build(pane, '#anatRoot', 'the 3D anatomy', 'assets/js/anatomy.js', 'anatomy', 'AnatomyApp'),
    recorder: (pane) => build(pane, '#recRoot', 'the recorder', 'assets/js/recorder.js', 'recorder', 'RecorderApp'),
    bath: (pane) => build(pane, '#bathRoot', 'the organ bath', 'assets/js/organbath.js', 'bath', 'OrganBathApp'),
    sims: (pane) => build(pane, '#simsRoot', 'the simulations', 'assets/js/sims.js', 'sims', 'SimsApp'),
    rstudio: (pane) => {
      MG.app.rstudio = new MG.RStudioApp(pane.querySelector('#rsRoot'), { fs: MG.app.fs });
    },
    editor: (pane) => {
      MG.app.editor = new MG.Editor(pane.querySelector('#edRoot'), { fs: MG.app.fs });
    }
  };
  /* each time a tab is shown */
  MG.page.shown = {
    scope: (pane, opts) => MG.app.scope && MG.app.scope.shown && MG.app.scope.shown(opts),
    flow: (pane, opts) => MG.app.flow && MG.app.flow.shown && MG.app.flow.shown(opts),
    circuit: (pane, opts) => MG.app.circuit && MG.app.circuit.shown && MG.app.circuit.shown(opts),
    exam: (pane, opts) => MG.app.exam && MG.app.exam.shown && MG.app.exam.shown(opts),
    viewer: () => MG.app.viewer && MG.app.viewer.stage && MG.app.viewer.stage.handleResize(),
    anatomy: (pane, opts) => MG.app.anatomy && MG.app.anatomy.shown && MG.app.anatomy.shown(opts),
    recorder: (pane, opts) => MG.app.recorder && MG.app.recorder.shown && MG.app.recorder.shown(opts),
    bath: (pane, opts) => MG.app.bath && MG.app.bath.shown && MG.app.bath.shown(opts),
    sims: (pane, opts) => MG.app.sims && MG.app.sims.shown && MG.app.sims.shown(opts),
    rstudio: (pane, opts) => MG.app.rstudio && MG.app.rstudio.shown(opts),
    editor: () => MG.app.editor && MG.app.editor.shown && MG.app.editor.shown()
  };
  /* a tab can be left with work that is not saved: the tabs say so (the exam saves itself) */
  MG.app.hasTab = (name) => !!document.querySelector(`.wb-tab[data-wb="${name}"]`);

  async function waitFor(get, ms = 6000) {
    for (let t = 0; t < ms && !get(); t += 50) await new Promise((r) => setTimeout(r, 50));
    return get();
  }
  MG.app.waitFor = waitFor;
  /** show a tab, wait until it is built, and give back what it made (MG.app[key]) */
  async function tab(name, key, ms = 20000) {
    await MG.app.showWorkbench(name);
    const A = await waitFor(() => MG.app[key], ms);
    if (!A) throw new Error(`The ${MG.app.tabName[name] || name} tab could not start.`);
    // (a tab that is still setting itself up – the microscope loading its list of slides – is ready first)
    if (A.ready && typeof A.ready.then === 'function') await A.ready.catch(() => {});
    return A;
  }
  MG.app.tab = tab;

  /* ------------------------------------------------------------------
     opening files: the right tab for each kind
     ------------------------------------------------------------------ */
  const STRUCTURE = /\.(pdb|ent|cif|mmcif|bcif|mol2|sdf|mol|pqr|gro|mmtf)(\.gz)?$/i;
  MG.app.isStructure = (p) => STRUCTURE.test(p);
  MG.app.kindOf = (p) => {
    p = String(p || '');
    if (/\.flow\.json$/i.test(p)) return 'flow';
    if (/\.circuit\.json$/i.test(p)) return 'circuit';
    if (/\.exam\.json$/i.test(p)) return 'exam';
    if (STRUCTURE.test(p)) return 'structure';
    if (/\.(R|Rmd|qmd)$/i.test(p)) return 'rstudio';
    return 'file';
  };
  /** edit or look at a file in the Files tab */
  MG.app.editFile = async (path, opts = {}) => {
    const ed = await tab('editor', 'editor');
    await ed.openFile(path, opts);
  };
  /** open a file where it belongs: a diagram in Diagrams, a circuit in Circuits, answers in Exam practice, a structure
      in the 3D viewer, the rest in Files */
  MG.app.openFile = async (path, opts = {}) => {
    const p = MG.app.fs.resolve(path);
    const k = opts.edit ? 'file' : MG.app.kindOf(p);
    if (k === 'flow') return (await tab('flow', 'flow')).open(p);
    if (k === 'circuit') return (await tab('circuit', 'circuit')).open(p);
    if (k === 'exam') return (await tab('exam', 'exam')).openFile(p);
    if (k === 'structure') return MG.app.viewStructure(p);
    return MG.app.editFile(p, opts);
  };
  /** open a file in RStudio's Source pane */
  MG.app.openInRStudio = async (path, opts = {}) => (await tab('rstudio', 'rstudio')).openFile(MG.app.fs.resolve(path), opts);
  /** a picture among the files → the microscope (as a slide of its own) */
  MG.app.openInMicroscope = async (path) => (await tab('scope', 'scope')).openImage(MG.app.fs.resolve(path));
  /** show a folder or file in the Files tab */
  MG.app.revealFile = async (path) => {
    const ed = await tab('editor', 'editor');
    if (ed.reveal) ed.reveal(MG.app.fs.resolve(path));
  };
  /** a structure file → the 3D viewer */
  MG.app.viewStructure = async (path) => {
    const fs = MG.app.fs;
    const p = fs.resolve(path);
    await MG.app.showWorkbench('viewer');
    const V = await waitFor(() => MG.app.viewer && MG.app.viewer.loadFile && MG.app.viewer, 20000);
    if (!V) return;
    const bytes = await fs.readBytes(p);
    await V.loadFile(new File([bytes], MG.path.basename(p)));
    bus.emit('viewer:fromfile', { path: p });
  };
  /** the 3D viewer, built and ready → the Viewer */
  MG.app.ensureViewer = async () => {
    await MG.app.showWorkbench('viewer');
    return waitFor(() => MG.app.vui && MG.app.viewer && MG.app.viewer.loadPDB && MG.app.viewer, 20000);
  };
  /** run a command of the 3D viewer (load 4HHB, color chain …), building the viewer first if need be */
  MG.app.viewerRun = async (cmd) => {
    await MG.app.ensureViewer();
    return MG.app.vui.run(cmd);
  };
  /** what R's browseURL() asks to be shown: a web address in a new browser tab; a file of R's (an HTML report) in
      RStudio's Viewer when RStudio asked, else in a new browser tab */
  MG.app.browse = async (url, opts = {}) => {
    url = String(url || '');
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const fs = MG.app.fs;
    const p = fs.resolve(url.replace(/^file:\/\//, ''));
    if (!fs.exists(p)) {
      toast(`There is no file ${esc(url)} to show.`, 'warn');
      return;
    }
    if (opts.from === 'rstudio' && MG.app.rstudio) return MG.app.rstudio.viewFile(p);
    const blob = await fs.toBlob(p);
    const type = /\.html?$/i.test(p) ? 'text/html' : /\.pdf$/i.test(p) ? 'application/pdf' : /\.svg$/i.test(p) ? 'image/svg+xml' : /\.png$/i.test(p) ? 'image/png' : 'text/plain';
    const u = URL.createObjectURL(new Blob([blob], { type }));
    const w = window.open(u, '_blank');
    if (!w) toast('The browser didn’t open a new tab, perhaps because pop-ups are blocked. You can find the file in the Files tab.', 'warn', 6000);
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  };

  /** keep text, bytes or a Blob among the user's files. opts.folder ('~/microscope' …); opts.ask: let the user choose the
      name first; opts.quiet: no message. → the path, or null */
  MG.app.saveToFiles = async (defName, content, opts = {}) => {
    const fs = MG.app.fs;
    const folder = (opts.folder || '~/data').replace(/\/+$/, '');
    const clean = String(defName).replace(/[\/\\:*?"<>|]+/g, '_').replace(/\s+/g, '-');
    let name = folder + '/' + clean;
    if (opts.ask !== false) {
      name = await MG.promptText('Save to my files', 'Where to save it (a path in your home folder, ~):', name, 'Save');
      if (!name) return null;
    }
    const p = fs.resolve(name);
    if (!p.startsWith(HOME + '/')) {
      toast('Files can only be saved in your home folder (~).', 'warn');
      return null;
    }
    if (opts.ask !== false && fs.exists(p) && !opts.overwrite) {
      if (!(await MG.confirmBox('Replace the file?', `<p><b>${esc(fs.pretty(p))}</b> already exists. Replace it?</p>`, 'Replace it'))) return null;
    }
    fs.mkdirp(MG.path.dirname(p));
    if (content instanceof Blob) fs.put(p, { kind: 'blob', blob: content, size: content.size, fresh: true });
    else if (content instanceof Uint8Array) fs.put(p, { kind: 'blob', blob: new Blob([content]), size: content.length, fresh: true });
    else fs.writeText(p, String(content));
    if (!opts.quiet) {
      const id = 'sv' + Math.random().toString(36).slice(2);
      toast(`Saved <b>${esc(fs.pretty(p))}</b>. <button class="linkbtn" type="button" id="${id}">Show it</button>`, 'ok', 5000);
      setTimeout(() => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => MG.app.revealFile(p));
      }, 0);
    }
    bus.emit('file:saved', { path: p, name: p.split('/').pop() });
    return p;
  };

  /* Files edited in the Files tab and in RStudio are saved with Save / Ctrl+S: before the page is left or reloaded
     with unsaved edits, the browser asks */
  window.addEventListener('beforeunload', (e) => {
    const dirty = []
      .concat(MG.app.editor && MG.app.editor.dirtyPaths ? MG.app.editor.dirtyPaths() : [])
      .concat(MG.app.rstudio && MG.app.rstudio.dirtyPaths ? MG.app.rstudio.dirtyPaths() : [])
      .concat(MG.app.flow && MG.app.flow.dirty && MG.app.flow.dirty() ? ['diagram'] : [])
      .concat(MG.app.circuit && MG.app.circuit.dirty && MG.app.circuit.dirty() ? ['circuit'] : [])
      .concat(['anatomy', 'recorder', 'bath', 'sims'].filter((k) => MG.app[k] && MG.app[k].dirty && MG.app[k].dirty()));
    if (dirty.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ------------------------------------------------------------------
     Buttons in the instructions and what they do
     data-scope="slide[@x,y[,10x]]"     open a slide in the microscope (x, y in mm from the slide's top left)
     data-scope-find="slide:label"      ask the student to find a labelled structure and click on it
     data-scope-tool="measure|area|count|label|capture|eyepiece|labels"   pick a tool of the microscope ('measure:glomerulus'
                                        also labels the new measurements; 'count:Living,Dead' sets the categories)
     data-scope-r="measurements|counts" open the microscope's script for R (in RStudio) that reads them
     data-flow="example:ID | ~/path"    open a diagram (an example, or a file)
     data-flow-run                      run the simulation of the open diagram
     data-circuit="example:ID | ~/path" open a circuit
     data-circuit-run                   run the open circuit
     data-exam="paper-id"               open a paper of exam practice ("" or "free": a blank essay)
     data-calc                          open the calculator
     data-anat="spec"  data-anat-find="spec"   the Anatomy tab: show a system or structure / ask the student to find
                                        one and click on it (the specs: anatomy.js)
     data-rec="spec"  data-rec-tool="name"  data-rec-r="what"   the Recorder: open a recording (at a time) / pick a tool /
                                        open its R script (recorder.js)
     data-bath="spec"  data-bath-do="cmd"  data-bath-r="what"   the Organ bath: set up a tissue / do something to it (add
                                        a drug, wash out…) / open its R script (organbath.js)
     data-sim="id[:screen]"             open a simulation in the Simulations tab (sims.js)
     data-pdb="4HHB"                    load a structure in the 3D viewer
     data-viewer="load 4HHB; color chain"   run commands of the 3D viewer
     data-rs-open="path"  data-rs-run="code"   open a file in RStudio / run code in its console
     data-rcon="code"                   type code into RStudio's console (the student presses Enter)
     data-edit="path"                   open a file in Files
     data-file-create="path"            make the file shown in the instructions (a .codefile)
     ------------------------------------------------------------------ */
  const inHome = (p) => (p.startsWith('/') ? p : p.startsWith('~/') ? HOME + p.slice(1) : HOME + '/' + p);
  const code = (s) => String(s).replace(/\\n/g, '\n');
  MG.actions.scope = async (spec) => (await tab('scope', 'scope')).go(spec);
  MG.actions.scopeFind = async (spec) => {
    const S = await tab('scope', 'scope');
    const [slide, label] = String(spec).split(':');
    return S.find(slide, label);
  };
  MG.actions.scopeTool = async (name) => (await tab('scope', 'scope')).tool(name);
  MG.actions.scopeR = async (what) => (await tab('scope', 'scope')).toR(what === 'counts' ? 'counts' : 'measurements');
  MG.actions.flow = async (ref) => (await tab('flow', 'flow')).open(ref);
  MG.actions.flowRun = async () => (await tab('flow', 'flow')).run();
  MG.actions.circuit = async (ref) => (await tab('circuit', 'circuit')).open(ref);
  MG.actions.circuitRun = async () => (await tab('circuit', 'circuit')).run();
  MG.actions.exam = async (id) => {
    const E = await tab('exam', 'exam');
    return !id || id === 'free' ? E.newEssay() : E.openPaper(id);
  };
  MG.actions.calc = async () => {
    await loadOnce('assets/js/calc.js');
    MG.Calculator.open();
  };
  MG.actions.anat = async (spec) => (await tab('anatomy', 'anatomy')).go(spec);
  MG.actions.anatFind = async (spec) => (await tab('anatomy', 'anatomy')).find(spec);
  MG.actions.rec = async (spec) => (await tab('recorder', 'recorder')).go(spec);
  MG.actions.recTool = async (name) => (await tab('recorder', 'recorder')).tool(name);
  MG.actions.recR = async (what) => (await tab('recorder', 'recorder')).toR(what);
  MG.actions.bath = async (spec) => (await tab('bath', 'bath')).go(spec);
  MG.actions.bathDo = async (cmd) => (await tab('bath', 'bath')).do(cmd);
  MG.actions.bathR = async (what) => (await tab('bath', 'bath')).toR(what);
  MG.actions.sim = async (spec) => (await tab('sims', 'sims')).open(spec);
  MG.actions.pdb = async (id) => MG.app.viewerRun('load ' + id);
  MG.actions.viewer = async (cmds) => MG.app.viewerRun(code(cmds));
  MG.actions.rsOpen = async (p) => MG.app.openInRStudio(inHome(p));
  MG.actions.rsRun = async (c) => (await tab('rstudio', 'rstudio')).consoleRun(code(c));
  MG.actions.rcon = async (c) => (await tab('rstudio', 'rstudio')).consoleType(code(c));
  MG.actions.edit = async (p) => MG.app.editFile(inHome(p), { create: true });
  const codeOf = (btn) => {
    const box = btn.closest('.codefile');
    return box ? box.querySelector('pre').textContent : '';
  };
  MG.actions.fileCreate = async (rel, btn) => {
    const fs = MG.app.fs;
    const path = inHome(rel);
    const text = codeOf(btn).replace(/\s+$/, '') + '\n';
    const e = fs.get(path);
    if (e && e.kind !== 'dir') {
      const old = await fs.readText(path);
      if (old !== text && !(await MG.confirmBox('Replace the file?', `<p><b>${esc(fs.pretty(path))}</b> already exists. Do you want to replace its contents with the version in the instructions?</p>`, 'Replace it'))) return;
    }
    fs.mkdirp(MG.path.dirname(path));
    fs.writeText(path, text, e && e.mode ? { mode: e.mode } : {});
    bus.emit('file:create', { path, name: path.split('/').pop() });
    if (btn && btn.dataset.openIn === 'files') return MG.app.editFile(path, { line: 1 });
    return MG.app.openInRStudio(path);
  };
  MG.actions.copyCode = async (v, btn) => toast((await MG.copyText(codeOf(btn))) ? 'Copied.' : 'The text could not be copied. Please select it and copy it yourself.', null, 1800);

  /* ------------------------------------------------------------------
     Conditions that tasks can check (data-check="name:arg")
     ------------------------------------------------------------------ */
  const textOf = (rel) => {
    const e = MG.app.fs && MG.app.fs.get(inHome(rel));
    return e && e.kind === 'text' ? e.text : null;
  };
  MG.checks.exists = (t, d, path) => !!MG.app.fs && MG.app.fs.exists(inHome(path));
  MG.checks.has = (t, d, arg) => {
    const cut = arg.indexOf('|');
    const txt = textOf(arg.slice(0, cut));
    return txt != null && new RegExp(arg.slice(cut + 1), 'm').test(txt);
  };
  MG.checks.installed = (t, d, pkg) => MG.R.userlib.list().includes(pkg);
  MG.checks.bench = (t, d, name) => MG.app.currentBench === name;
  /* the slide open in the microscope (scope:adrenal-gland) */
  MG.checks.slide = (t, d, id) => !!MG.app.scope && MG.app.scope.current && MG.app.scope.current() === id;
  /* how many lines a file has (rows:microscope/measurements.csv>5) */
  MG.checks.rows = (t, d, arg) => {
    const m = /^(.*?)([<>=])(\d+)$/.exec(arg);
    if (!m) return false;
    const txt = textOf(m[1]);
    if (txt == null) return false;
    const n = txt.split(/\r?\n/).filter((l) => l.trim()).length - 1;
    return m[2] === '>' ? n > +m[3] : m[2] === '<' ? n < +m[3] : n === +m[3];
  };

  /* the Help button at the top of the page */
  MG.page.help = function () {
    // (the tabs' own icons: on a phone the tabs show only these)
    const ic = (id) => {
      const s = document.querySelector(`.wb-tab[data-wb="${id}"] .ic`);
      return s ? s.outerHTML.replace('class="ic"', 'class="ic help-ic"') : '';
    };
    MG.modal(
      'How this page works',
      `<ul>
<li>The <b>instructions</b> are on the left and the <b>workbench</b> is on the right. Drag the divider between them to change their widths; the button at the top left (or <kbd>Ctrl</kbd>+<kbd>\\</kbd>) hides the instructions so that the workbench fills the window.</li>
<li>The workbench has eleven tabs. ${ic('scope')} <b>Microscope</b> is a virtual microscope with slides of human tissues: change the objective, measure, count, label and take pictures. ${ic('anatomy')} <b>Anatomy</b> shows the human body in 3D, system by system: click a structure to see its name and what it is, isolate it, cut sections and label what is shown. ${ic('viewer')} <b>Molecules</b> shows proteins and other molecules in 3D. ${ic('recorder')} <b>Recorder</b> plays back real recordings of people – the ECG, heart sounds, blood pressure, breathing, muscle and the brain – as a chart recorder does: zoom, play, and measure intervals and rates with the calipers. ${ic('bath')} <b>Organ bath</b> is a simulated isolated tissue: add drugs, watch it contract or relax, and build concentration–response curves that R analyses. ${ic('flow')} <b>Diagrams</b> draws flow diagrams of physiological control and can run them as a simulation. ${ic('circuit')} <b>Circuits</b> builds and runs electrical circuits, including the circuit models of physiology. ${ic('sims')} <b>Simulations</b> has interactive simulations from PhET (University of Colorado Boulder): the action potential, membrane transport, gases, pH, solutions and Beer’s law, lenses and colour vision. ${ic('exam')} <b>Exam practice</b> is an essay editor that works like the online exam system, with a word count, a timer and a calculator. ${ic('rstudio')} <b>RStudio</b> is for analysing data in R, and ${ic('editor')} <b>Files</b> holds everything you save.</li>
<li>When there isn’t room for all the tabs’ names – on a phone or a tablet, or beside the instructions in a smaller window – the tabs show only their icons (the ones above), and the open tab keeps its name. On a phone, the workbench opens over the instructions with the <b>Workbench</b> button, and the ✕ at the right of its tabs goes back to the instructions.</li>
<li>The tabs work together: measurements and counts from the microscope, measurements from the recorder and the organ bath, pictures you take, and the results of diagrams and circuits are saved in <b>Files</b>, where R can read them; and the buttons in the instructions open slides, models, recordings, tissues, simulations, diagrams, circuits and papers for you.</li>
<li>The steps of each activity are ticked automatically when you do them (they are marked <b>✓ spotted</b>), and you can also tick them yourself.</li>
<li>Your ticks and answers, your essays and your files are saved in this browser, so they will still be there if you reload the page. <b>My answers</b> downloads your answers, <b>My files</b> downloads all your files as a .zip file, and each essay can be downloaded as a Word document. Some lab computers clear the browser’s storage when you log out, so download your work before you leave.</li>
<li>The slides, the 3D models, the recordings, the simulations and R itself are downloaded from the internet as you use them; R is about 30 MB the first time RStudio starts.</li>
<li>To start again, use <b>My answers → Start again</b> to clear your ticks and answers, or <b>My files → Start afresh</b> to delete your files.</li>
</ul>`
    );
  };

  /* Start afresh: forget what the tabs remember */
  MG.page.beforeReset = async () => {
    for (const k of ['seeded', 'rsOpen', 'rsHistory', 'rlib', 'bench', 'scope', 'flow', 'circuit', 'exam', 'calc', 'anatomy', 'recorder', 'bath', 'sims']) store.remove(k);
  };
})();
