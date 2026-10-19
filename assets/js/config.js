/* =====================================================================
   Settings for the BMS workbench.
   You can change these settings by editing this file and uploading it
   again; nothing else needs to change.
   ===================================================================== */
window.MG_CONFIG = {
  courseTitle: 'BMS workbench',
  courseSubtitle: 'The microscope, anatomy, recordings, the organ bath, models, exam practice and R, in your browser',

  /* The prefix for everything the page saves in the browser (files, answers, essays and settings). Practicals made
     from this workbench that are hosted at the same address (for example, GitHub Pages sites of one account) and have
     the same prefix share the student's files and essays; give a practical its own prefix to keep them apart. */
  storePrefix: 'bmswb',
  hostname: 'workbench',

  /* Model answers are shown with a "Show answer" button under each question. Set this to false to hide
     them (they are still in the page's source code, and adding ?answers to the address shows them). */
  showModelAnswers: true,

  /* The microscope. slideBase is the folder (or the web address of a folder) that holds the slides: index.json lists
     them and each slide is a folder of its own (see build/slides/README.md). Another web site can hold them, as long as
     it allows requests from this page (CORS) and answers range requests, as GitHub Pages does. */
  slideBase: 'slides/',
  /* The objectives on the microscope, and the size of the slide's pixels that each one shows at one screen pixel:
     20x shows a slide scanned at 20x (about 0.5 micrometres per pixel) pixel for pixel. */
  objectives: [1, 2, 4, 10, 20, 40],
  micronsPerScreenPixelAt20x: 0.5,

  /* Exam practice. The papers are in exams/ (exams/index.json lists them). spellcheckDefault: whether the browser's
     spelling checker is on when a student starts a paper (it is usually off in real exams; students can switch it).
     autosaveSeconds: how often an answer that is being typed is saved. */
  examBase: 'exams/',
  spellcheckDefault: false,
  autosaveSeconds: 5,

  /* The examples of the Diagrams and Circuits tabs. */
  examplesBase: 'examples/',

  /* The Recorder's recordings (recordings/index.json lists them; see build/recordings/README.md). Another web site can
     hold them, as long as it allows requests from this page (CORS). */
  recordingBase: 'recordings/',

  /* R in the browser (webR). RStudio downloads R from here (about 30 MB, kept by the browser after the first
     download), and R packages from the webR repository when install.packages() asks for them. */
  webrBase: 'https://webr.r-wasm.org/v0.6.0/',
  rRepos: ['https://repo.r-wasm.org'],

  /* The Molecules tab: what the boxes suggest. */
  pdbExample: '4HHB',
  afExample: 'UniProt e.g. P69905',

  /* How many megabytes of files the workbench can keep in the browser before it warns the user. */
  storageWarnMB: 1500
};
