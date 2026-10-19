/* =====================================================================
   The Simulations tab: the PhET simulations.
   (A placeholder, replaced by the tab itself.)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  MG.SimsApp = class {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs;
      root.innerHTML = '<div class="wb-loading">The Simulations tab is not ready yet.</div>';
      this.ready = Promise.resolve();
    }
    shown() {}
  };
})();
