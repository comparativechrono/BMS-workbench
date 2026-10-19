/* =====================================================================
   The Anatomy tab: the 3D anatomy of the human body (Z-Anatomy).
   (A placeholder, replaced by the tab itself.)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  MG.AnatomyApp = class {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs;
      root.innerHTML = '<div class="wb-loading">The Anatomy tab is not ready yet.</div>';
      this.ready = Promise.resolve();
    }
    shown() {}
  };
})();
