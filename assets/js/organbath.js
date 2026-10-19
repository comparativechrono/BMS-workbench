/* =====================================================================
   The Organ bath tab: an organ bath simulator.
   (A placeholder, replaced by the tab itself.)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  MG.OrganBathApp = class {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs;
      root.innerHTML = '<div class="wb-loading">The Organ bath tab is not ready yet.</div>';
      this.ready = Promise.resolve();
    }
    shown() {}
  };
})();
