/* =====================================================================
   The 3D viewer's library for biomedical science: proteins of physiology
   and the small molecules of hormones and signalling, kept with the site
   (molecules/), so they open quickly and without the internet. The
   proteins are from the Protein Data Bank (as BinaryCIF from RCSB PDB);
   the small molecules are the ideal coordinates of the PDB's Chemical
   Component Dictionary (SDF). PDB data are free of all copyright (CC0).

   MG.BMSLibrary(vui) adds a Library button to the viewer and lists the
   library when no structure is loaded. The instructions can load an
   entry with data-pdb="4HHB" or data-viewer="load 4HHB" (the bundled
   copy is used when there is one), or a small molecule with
   data-viewer="molecule cortisol" (see MG.BMSLibrary.load).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, toast, bus } = MG;
  const BASE = 'molecules/';

  const PROTEINS = [
    ['4HHB', 'Haemoglobin', 'Human deoxyhaemoglobin: two α and two β globin chains, each holding a haem group that binds oxygen.'],
    ['1MBN', 'Myoglobin', 'The oxygen store of muscle: one globin chain with one haem (sperm whale; the first protein structure to be solved).'],
    ['4INS', 'Insulin', 'Insulin as it is stored in the β cells, where six molecules pack round two zinc ions. Each molecule is an A and a B chain joined by disulfide bonds (pig). This file holds two of the six molecules, with the two zinc ions: the symmetry of the crystal makes the rest.'],
    ['3SN6', 'β₂-adrenergic receptor and its G protein', 'A G-protein-coupled receptor in the membrane, activated by an agonist and bound to the Gs protein (α, β and γ subunits) – the first step of the cascade that makes cAMP. A nanobody and a lysozyme were added to help it crystallise.'],
    ['1M2Z', 'Glucocorticoid receptor with dexamethasone', 'The hormone-binding part of an intracellular steroid receptor (human), holding the synthetic glucocorticoid dexamethasone and a peptide of a coactivator.'],
    ['1A52', 'Oestrogen receptor with oestradiol', 'The hormone-binding part of oestrogen receptor α (human), with oestradiol in its pocket.'],
    ['2ROX', 'Transthyretin carrying thyroxine', 'A carrier protein of the plasma (human), with thyroxine (T₄) bound in the channel between its subunits. Transthyretin has four subunits: this file holds two of them, so the channel is only half there.'],
    ['1BM0', 'Serum albumin', 'Human serum albumin, the most abundant protein of the plasma, which carries fatty acids, some hormones and many drugs.'],
    ['1J4N', 'Aquaporin-1', 'A water channel of red blood cells and the kidney (cow). It has four subunits, each with a pore that lets water through but not ions; this file holds one of them (the symmetry of the crystal makes the other three).'],
    ['4PYP', 'Glucose transporter GLUT1', 'Facilitated diffusion: the human glucose transporter GLUT1, in the membrane.'],
    ['3WGU', 'Na⁺/K⁺-ATPase', 'The sodium–potassium pump (pig kidney), a primary active transporter that uses ATP to move 3 Na⁺ out of the cell and 2 K⁺ in.'],
    ['1BL8', 'Potassium channel KcsA', 'A bacterial K⁺ channel: four subunits round a selectivity filter that lets K⁺ through but not Na⁺ – the model for the K⁺ channels of nerve and muscle.'],
    ['2BG9', 'Nicotinic acetylcholine receptor', 'A ligand-gated ion channel (from the electric organ of the ray Torpedo): five subunits round a central pore, like the receptor at the neuromuscular junction.'],
    ['3HHR', 'Growth hormone and its receptor', 'One molecule of human growth hormone holding two receptor chains together – how receptors of this family are switched on.'],
    ['1CLL', 'Calmodulin', 'A calcium-binding protein (human) with four Ca²⁺ ions, which passes calcium signals on to enzymes.'],
    ['1ATP', 'Protein kinase A', 'The catalytic subunit of the kinase switched on by cAMP (mouse), with ATP and a peptide inhibitor.'],
    ['1CGD', 'Collagen triple helix', 'A collagen-like peptide: three chains wound round each other, with glycine at every third position – except at one point, where alanine replaces it, the kind of change that causes brittle bone disease (osteogenesis imperfecta).']
  ];
  const SMALL = [
    ['cortisol', 'HCY', 'Cortisol', 'Steroid hormone (glucocorticoid)'],
    ['aldosterone', 'AS4', 'Aldosterone', 'Steroid hormone (mineralocorticoid)'],
    ['dexamethasone', 'DEX', 'Dexamethasone', 'A synthetic glucocorticoid (a drug)'],
    ['testosterone', 'TES', 'Testosterone', 'Steroid hormone (androgen)'],
    ['oestradiol', 'EST', 'Oestradiol', 'Steroid hormone (oestrogen)'],
    ['progesterone', 'STR', 'Progesterone', 'Steroid hormone (progestogen)'],
    ['cholesterol', 'CLR', 'Cholesterol', 'The sterol from which steroid hormones are made'],
    ['thyroxine', 'T44', 'Thyroxine (T₄)', 'Thyroid hormone, with four iodine atoms'],
    ['triiodothyronine', 'T3', 'Triiodothyronine (T₃)', 'Thyroid hormone, with three iodine atoms'],
    ['adrenaline', 'ALE', 'Adrenaline', 'Catecholamine hormone and transmitter'],
    ['noradrenaline', 'LNR', 'Noradrenaline', 'Catecholamine transmitter and hormone'],
    ['dopamine', 'LDP', 'Dopamine', 'Catecholamine transmitter'],
    ['melatonin', 'ML1', 'Melatonin', 'Hormone of the pineal gland (an indoleamine)'],
    ['acetylcholine', 'ACH', 'Acetylcholine', 'Transmitter of nerve and the neuromuscular junction'],
    ['glucose', 'GLC', 'Glucose', 'α-D-glucose'],
    ['atp', 'ATP', 'ATP', 'Adenosine triphosphate'],
    ['camp', 'CMP', 'Cyclic AMP', 'A second messenger'],
    ['haem', 'HEM', 'Haem', 'The iron-containing group of haemoglobin and myoglobin']
  ];

  // the bundled copies of the proteins: the viewer looks here first (viewer-core.js: loadPDB)
  MG.config.bundled = MG.config.bundled || {};
  MG.config.bundled.pdb = Object.assign({}, MG.config.bundled.pdb || {});
  PROTEINS.forEach(([id]) => (MG.config.bundled.pdb[id] = BASE + id + '.bcif'));

  async function loadSmall(key) {
    const k = String(key || '').toLowerCase().replace(/\s+/g, '');
    const m = SMALL.find((s) => s[0] === k || s[1].toLowerCase() === k || s[2].toLowerCase().replace(/\s+/g, '') === k);
    if (!m) throw new Error(`The library has no molecule called “${key}”.`);
    const V = MG.app.viewer;
    const st = await V.loadURL(BASE + m[1] + '.sdf', 'sdf', m[2]);
    // (beside a protein, a small molecule is lost inside it: the view goes to the molecule)
    if (V.structures && V.structures.length > 1 && st && st.comp) {
      st.comp.autoView(500);
      toast(`${esc(m[2])} is added to the structures already open, and the view moves to it. To see it alone, type <code>clear</code> before you open it, or hide the others.`, null, 6000);
    }
    bus.emit('viewer:molecule', { name: m[2], code: m[1] });
    return st;
  }

  class BMSLibrary {
    constructor(vui) {
      this.vui = vui;
      const form = vui.loadForm;
      if (form) {
        const b = h('button.btn', { type: 'button', title: 'Proteins of physiology, hormones and other molecules, ready to open', html: MG.icon('book') + '<span>Library</span>' });
        b.addEventListener('click', () => this.open());
        form.insertBefore(b, form.firstChild);
        form.insertBefore(h('span.v-sep'), b.nextSibling);
      }
      // the empty viewer suggests the library
      const orig = vui.renderEmpty.bind(vui);
      vui.renderEmpty = () => {
        orig();
        if (!vui.emptyEl.hidden) {
          vui.emptyEl.innerHTML = `<div>${MG.icon('cube')}<h3>No structure loaded</h3><p>Open the <button type="button" class="linkbtn" data-lib>library</button> of proteins and hormones, type a PDB ID above (try <button type="button" class="linkbtn" data-load="4HHB">4HHB</button>, haemoglobin), or open a file.</p></div>`;
          vui.emptyEl.querySelector('[data-lib]').addEventListener('click', () => this.open());
          vui.emptyEl.querySelector('[data-load]').addEventListener('click', () => vui.run('load 4HHB'));
        }
      };
      vui.renderEmpty();
      // "molecule NAME" in the viewer's command line and in data-viewer buttons
      if (MG.commands && MG.commands.run && !MG.commands._bms) {
        const run = MG.commands.run;
        MG.commands.run = async (text, opts = {}) => {
          if (!/(^|[;\n])\s*molecule\s/i.test(String(text || ''))) return run(text, opts);
          let last;
          for (const c of MG.commands.splitScript(String(text))) {
            const m = /^\s*molecule\s+(.+?)\s*$/i.exec(c);
            if (!m) last = await run(c, opts);
            else {
              try {
                last = await loadSmall(m[1]);
                MG.app.vui.log(c);
              } catch (e) {
                MG.app.vui.log(c, 'err');
                toast(esc(e.message || String(e)), 'error');
                if (opts.throw) throw e;
                break;
              }
            }
          }
          return last;
        };
        MG.commands._bms = true;
      }
    }
    open() {
      const prot = PROTEINS.map(([id, name, desc]) => `<button type="button" class="lib-item" data-id="${id}"><b>${esc(name)}</b> <code>${id}</code><span>${esc(desc)}</span></button>`).join('');
      const small = SMALL.map(([key, code, name, desc]) => `<button type="button" class="lib-item small" data-mol="${key}"><b>${esc(name)}</b><span>${esc(desc)}</span></button>`).join('');
      const m = MG.modal('The library', `<p class="muted">Click a molecule to open it. The proteins come from the Protein Data Bank (the code after each name is its PDB ID); the small molecules are the PDB’s ideal models of them.</p>
        <h4 class="lib-h">Proteins of physiology</h4><div class="lib-grid">${prot}</div>
        <h4 class="lib-h">Hormones, transmitters and other small molecules</h4><div class="lib-grid small">${small}</div>`);
      m.box.classList.add('wide');
      m.box.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', async () => {
        m.close();
        try {
          await this.vui.run('load ' + b.dataset.id);
        } catch (e) {
          toast(esc(e.message || e), 'error');
        }
      }));
      m.box.querySelectorAll('[data-mol]').forEach((b) => b.addEventListener('click', async () => {
        m.close();
        try {
          await loadSmall(b.dataset.mol);
        } catch (e) {
          toast(esc(e.message || e), 'error');
        }
      }));
      bus.emit('viewer:library', {});
    }
  }
  BMSLibrary.load = loadSmall;
  BMSLibrary.PROTEINS = PROTEINS;
  BMSLibrary.SMALL = SMALL;
  MG.BMSLibrary = BMSLibrary;
})();
