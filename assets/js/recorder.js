/* =====================================================================
   The Recorder tab: a chart recorder for real recordings from PhysioNet.
   (A placeholder, replaced by the tab itself.)
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  MG.RecorderApp = class {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs;
      root.innerHTML = '<div class="wb-loading">The Recorder tab is not ready yet.</div>';
      this.ready = Promise.resolve();
    }
    shown() {}
  };
})();
