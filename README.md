# BMS workbench

**A browser-based workbench for biomedical science practicals. It brings together a virtual microscope with slides of human tissues, flow diagrams of physiological control that run as simulations, an electrical circuit simulator that also speaks the language of physiology (pressure, flow, resistance and compliance), exam practice that works like an online exam system, a 3D viewer for proteins and other molecules, and RStudio, with the instructions for the practical alongside them.**

Everything runs in the student's web browser. Students don't need to install anything, there is no server-side code, and students' files, answers and essays are stored in their own browser. Because the site is static (just HTML, CSS, JavaScript and the slides), it can be hosted for free on **GitHub Pages** or on any ordinary web server.

The workbench is intended as the base for the course's practicals, in the same way as the R, bioinformatics and pedigree workbenches. A week's practical might ask students to write an essay in *Exam practice*, then look at slides in the *Microscope*, measure and count, and analyse their measurements in *RStudio*: the tools link together, and each practical uses this page with its own chapters in the left-hand pane (see [Writing a practical](#writing-a-practical)). The workbench comes with a short starter practical, *A tour of the workbench*, which shows each tool without using the course's own teaching material.

---

## Contents

1. [What's in the workbench](#whats-in-the-workbench)
2. [The starter practical](#the-starter-practical)
3. [Before students use it](#before-students-use-it)
4. [Publishing it on GitHub Pages](#publishing-it-on-github-pages)
5. [Trying it on your own computer](#trying-it-on-your-own-computer)
6. [Settings in `config.js`](#settings-in-configjs)
7. [Writing a practical](#writing-a-practical)
8. [Slides, papers, examples and molecules](#slides-papers-examples-and-molecules)
9. [What students keep](#what-students-keep)
10. [Privacy](#privacy)
11. [Browser support and limitations](#browser-support-and-limitations)
12. [How it was tested](#how-it-was-tested)
13. [Files](#files)
14. [Credits and licences](#credits-and-licences)

---

## What's in the workbench

The workbench is a single page, `index.html`. The **instructions** are on the left: chapters made up of steps that tick themselves off as the student completes them, and questions with model answers (some of which check a numerical answer). The **workbench** itself is on the right, with seven tabs. Students can hide the instructions (with the button at the top left, or <kbd>Ctrl</kbd>+<kbd>\</kbd>) so that the workbench fills the screen. On a phone, the workbench opens on top of the instructions.

| Tab | What it contains |
| --- | --- |
| **Microscope** | A virtual light microscope. The **slide box** holds 31 slides, sorted by the system of the body: 29 sections of normal human tissue stained with H&E, from the GTEx project, and two slides drawn for practising measurement (a stage micrometer and a haemocytometer with living and dead cells). **Objectives** from 1× to 40× (keys 1 to 6) follow the convention of digital microscopy – 20× shows a slide at the full resolution of its scan, 0.5 µm per screen pixel – with a scale bar, a readout of the magnification and the field of view, and a map of the whole slide. The **eyepiece view** shows a round field of view with a graticule of 100 divisions, which students calibrate against the stage micrometer. The tools **measure** lengths and areas, **count** cells in up to six categories, and add **labels**; the camera takes **pictures** with a scale bar and the slide's credit. Many slides carry teaching **labels** (which can be shown or hidden), and the instructions can ask students to **find** a labelled structure and click on it. Every measurement and count is kept in `~/microscope/measurements.csv` and `~/microscope/counts.csv`, ready for R, and the microscope opens a ready-made R script for them. Students can also open a picture of their own (a photograph through a microscope, say) as a slide, and give it a scale from its scale bar. |
| **Diagrams** | Flow diagrams of physiological control: boxes for the quantities, stimuli, set points and comparators, and arrows that stimulate (+) or inhibit (−), with a gain and a delay. **Run** turns the diagram into a simple model and plots how each quantity changes with time, so that students can see what negative and positive feedback, feed-forward and delays do. Boxes can be knocked out or held fixed. Diagrams are saved in `~/diagrams` (`.flow.json`) and can be exported as pictures (PNG or SVG) and their results as a table for R (CSV). Examples: feedback in temperature control, feed-forward, positive feedback in clotting, a delayed loop that oscillates, blood glucose, and a template for an endocrine axis. |
| **Circuits** | An electronics bench: batteries, current sources, AC sources, resistors, capacitors, inductors, switches, diodes, voltmeters and ammeters, joined by wires, with a simulator that works out the voltages and currents as time passes, and traces that plot them. In **Physiology** mode the same parts become pressure and flow sources, resistances to flow, compliances, valves, pressure gauges and flowmeters (in mmHg and mL/s). Examples include Ohm's law, a voltage divider, resistances in series and in parallel, charging a capacitor, the membrane as an RC circuit, the parallel-conductance model of the resting membrane potential and the Windkessel model of the circulation. Circuits are saved in `~/circuits` (`.circuit.json`), and can be exported as pictures and their traces as CSV. |
| **Exam practice** | Essay writing as in the online exam system (Inspera), so that students can get used to writing in a browser before they have to: a start page, a timer, one question at a time with an essay editor (paragraph styles, bold, italic, underline, sub- and superscript, lists, indents, tables, special characters, formulas, drawings, undo and backups), a word count with a limit, flags, question tiles, a calculator, resources (which can open slides in the microscope), a submission page, a receipt, and a review with the marking guidance. Answers save themselves as students type (in `~/essays`), and a submission can be downloaded as a **Word document**, as a PDF (by printing), as a web page or as text. Papers are JSON files (`exams/`), and *Write an essay* starts a free essay for any title. |
| **3D viewer** | The structures of proteins and other molecules, drawn by NGL: cartoons, sticks, spheres and surfaces, colour schemes, selections, binding sites and their contacts, labels, distances and pictures. A **library** of 17 proteins of physiology (haemoglobin, myoglobin, insulin, a G-protein-coupled receptor with its G protein, steroid receptors, transporters, pumps and channels, and others) and 18 small molecules (hormones, transmitters, glucose, ATP, cAMP, haem…) is kept with the site; other entries are loaded from the Protein Data Bank or AlphaFold DB. |
| **RStudio** | An IDE modelled on RStudio, running R 4.6 in the browser (webR): scripts, R Markdown and Quarto, the Console, Environment, Plots, Packages, Help and Viewer panes, *Import Dataset*, and Shiny apps. The microscope's measurements and counts, the results of diagrams and the traces of circuits are all CSV files that R reads. |
| **Files** | The student's home folder (`~`, which is `/home/user`): the folder tree (with upload, download – a folder downloads as a `.zip` file – and new, rename, move and delete), an editor, and viewers for tables, pictures, PDFs and web pages. Buttons above each file send it where it belongs: a diagram to Diagrams, a circuit to Circuits, a picture to the Microscope, an R script to RStudio, a structure to the 3D viewer. |

**The tools work together.** The microscope's pictures, measurements and counts go to Files and on to R; a run of a diagram or a circuit can be kept as a CSV file; an exam paper can open slides in the microscope; and the buttons in the instructions open slides, diagrams, circuits, papers and molecules, choose tools and run code.

## The starter practical

*A tour of the workbench* takes about 2 hours 20 minutes and has 8 chapters. It shows each tool with generic examples (the kidney, the liver, a stage micrometer, a haemocytometer, haemoglobin…), not the course's lectures, so it can be given to students at the start of the course, or used as a model for writing practicals.

| Chapter | Tab | What students do |
| --- | --- | --- |
| 0. Start here (10 min) | Microscope | Find out what each tab is for and how the page works |
| 1. The microscope (25 min) | Microscope | Go from low power to high power on the kidney; find a renal corpuscle and a proximal tubule; show the slide's labels, add their own and take a picture; find a central vein and a portal tract in the liver |
| 2. Measuring and counting (30 min) | Microscope | Calibrate the eyepiece graticule against a stage micrometer at 10× and 40×; measure renal corpuscles; work out magnifications and real sizes from scale bars; count living and dead cells in a haemocytometer and work out cells per mL and viability |
| 3. Diagrams (15 min) | Diagrams | Run an example, change it and run it again; draw a diagram of their own, run it and keep it |
| 4. Circuits (15 min) | Circuits | Check Ohm's law; watch a capacitor charge and measure its time constant; switch to Physiology mode |
| 5. Exam practice (20 min) | Exam practice | Take a short practice paper: write, format, flag, use the calculator, submit and download the answers as a Word document |
| 6. 3D molecules (10 min) | 3D viewer | Look at haemoglobin, its chains and its haem groups; open small molecules from the library |
| 7. Data in R (15 min) | RStudio | Summarise and plot their microscope measurements and counts in R; run the haemocytometer calculation as a script and change it |

The model answers are included in the page (students see them with *Show answer* under each question; see `showModelAnswers` below), so the questions are meant for practice rather than assessment.

## Before students use it

1. **Computers and browsers.** Students need a laptop or desktop computer with a current version of Chrome, Edge, Firefox or Safari; 8 GB of memory is comfortable. The workbench also works on a phone, although the screen is cramped. The 3D viewer needs WebGL (3D graphics), which almost every computer has.
2. **Network.** Students' browsers need to reach your site (the page and the slides) and, for the tabs that use them: `webr.r-wasm.org` (R itself, about 30 MB the first time RStudio is opened, then kept in the browser's cache) and `repo.r-wasm.org` (R packages, when they are installed); `models.rcsb.org` and `files.rcsb.org` (structures from the Protein Data Bank that are not in the library) and `alphafold.ebi.ac.uk` (AlphaFold models). The microscope, Diagrams, Circuits, Exam practice and the library of the 3D viewer only need your site.
3. **Shared computers.** Students' files and essays are stored in the browser profile, so computers that wipe profiles when students log out will lose them. Tell students to download their work before they leave (*My files → Download all my files*, *My answers → Download my answers*, and *Download* on each submitted essay), and to use *Start afresh* when they finish on a shared computer.
4. **Exam practice is practice.** It works like the candidate's view of an online exam system, but it is not one: it is not locked down, it doesn't send anything to a server, and the student can see the model answers after submitting. Use it for practice and formative work, not for assessed exams. Whether the browser's spelling checker is on at the start is set for each paper (it is off by default, as it usually is in exams); students can switch it.
5. **Personal and patient data.** The slides are public, de-identified research images. If you add your own slides or pictures, make sure that you may publish them (anything on the site is public).

## Publishing it on GitHub Pages

1. On GitHub, open the repository's *Settings → Pages → Build and deployment* page. Under Source choose **Deploy from a branch**, then choose the branch **main** and the folder **/ (root)**, and click Save. (The repository needs to be public, unless your GitHub plan supports Pages for private repositories.)
2. After a minute or two, the site will be available at `https://<owner>.github.io/<repository>/`, which for this repository is `https://comparativechrono.github.io/BMS-workbench/`. That is the address to give to students.
3. The first time a browser opens the site, the page reloads itself once. This installs a small service worker (`isolation-sw.js`, next to `index.html`), which makes the page *cross-origin isolated*, so that R can wait for typed input and be interrupted with <kbd>Esc</kbd>; it also serves the Shiny apps that R runs.

**Size and bandwidth.** The site is about 380 MB, almost all of it the slides (`slides/`, about 12 MB each). GitHub Pages allows a published site of up to 1 GB and has a soft limit of 100 GB of traffic a month. A student who looks at a slide only downloads the parts they look at, at the magnifications they use (the microscope asks for each tile of the slide with an HTTP *range request* into the slide's `tiles.pack` file, which GitHub Pages and most web servers answer), so a practical with a few slides usually costs a few megabytes per student. If you add many more slides, keep an eye on the size of the repository (GitHub recommends staying under 1 GB) or host the slides elsewhere (see `slideBase` below).

The empty file `.nojekyll` stops GitHub from processing the site. The site itself doesn't need the `build/` and `test/` folders, but do keep `assets/vendor/licenses/`. To host the workbench on a different web server, just copy the folder (you can leave out `build/` and `test/`); the server must answer range requests (almost all do), and the address must use `https` (or be `localhost`) for the service worker to work.

**Students' files belong to the site's address.** The browser stores them for that address, so if the workbench moves to a different address, students will start with an empty home folder there. All the GitHub Pages sites of one account share the same address (`https://<owner>.github.io`), which matters when you have more than one practical: see `storePrefix` below.

## Trying it on your own computer

Opening `index.html` directly from your disk (`file://…`) doesn't work, because browsers block the Web Workers and the data files. Instead, serve the folder with a local web server:

```bash
cd BMS-workbench
python3 serve.py 8000        # then open http://localhost:8000
```

`serve.py` answers range requests (which the microscope needs) and sends the cross-origin isolation headers itself. Python's own `python3 -m http.server` does **not** answer range requests, so the microscope only works with it after downloading each slide in full.

## Settings in `config.js`

`assets/js/config.js` is the only file you need to edit for most changes.

| Setting | What it does |
| --- | --- |
| `courseTitle`, `courseSubtitle` | The name shown at the top of the page (and in the browser tab), and the line underneath it |
| `storePrefix` | The prefix for everything the page saves in the browser (files, answers, essays and settings). Sites at the same address, such as all the GitHub Pages sites of one account, share their files if their `storePrefix` is the same (see [Writing a practical](#writing-a-practical)) |
| `showModelAnswers` | When this is `true`, there is a *Show answer* button under each question. Set it to `false` to hide the model answers (they are still in the page's source code, and adding `?answers` to the address shows them) |
| `slideBase` | The folder (or web address of a folder) that holds the slides. Another site can hold them, as long as it allows requests from this page (CORS) and answers range requests |
| `objectives`, `micronsPerScreenPixelAt20x` | The microscope's objectives (1, 2, 4, 10, 20 and 40) and the scale of its magnifications: at 20×, one screen pixel shows 0.5 µm of the slide, so a slide scanned at 20× is shown pixel for pixel |
| `examBase`, `spellcheckDefault`, `autosaveSeconds` | Where the papers of exam practice are; whether the browser's spelling checker is on when a free essay starts; how often an answer that is being typed is saved |
| `examplesBase` | Where the examples of Diagrams and Circuits are |
| `webrBase`, `rRepos` | Where R is downloaded from (webR 0.6.0), and the repositories that R packages are installed from |
| `pdbExample`, `afExample` | What the 3D viewer's boxes suggest |
| `storageWarnMB` | How many megabytes of files a student can store before the page warns them |

## Writing a practical

### Making a new practical from the workbench

For each new practical, make a copy of this repository. The easiest way is to tick *Settings → General → Template repository* on this repository once, and then use *Use this template → Create a new repository* for each practical. Then, in the copy, change:

- `build/chapters.py`, which contains the chapters (see below);
- the files in `starter/`, which every student finds in their home folder on their first visit (`starter/data/x.csv` becomes `~/data/x.csv`); files that a student already has are left alone. If you add files after students have started, increase `STARTERS_VERSION` in `build/make_page.py` so that they receive the new files;
- the slides, papers and examples the practical needs (see [Slides, papers, examples and molecules](#slides-papers-examples-and-molecules)). A practical doesn't need every slide: you can delete the folders of the slides it doesn't use, to make the site smaller;
- `courseTitle`, `courseSubtitle` and `storePrefix` in `assets/js/config.js`;
- in `build/template.html`, the `<title>`, the description, and the `data-page` attribute of `<body>`, which is the name under which the page saves its ticks, answers and settings.

Then run `python3 build/make_page.py`, try the page with `python3 serve.py`, and commit the new `index.html` together with your other changes.

**Sharing files between practicals.** If two practicals are hosted at the same address (for example, two GitHub Pages sites of one account) and have the same `storePrefix`, they share the student's home folder, so measurements, pictures and essays made in one practical are available in the next. Giving them different `data-page` values keeps their ticks and answers separate. If a practical's files must be kept apart from the others, give it its own `storePrefix`. Note that *Start afresh* in one practical deletes the files of every practical that shares its `storePrefix`.

**A week's practical** might be, for example: an essay in Exam practice (a paper of its own in `exams/`, opened with `exam('week3-essay')`), then a histology section in which students find structures (`scopefind('thyroid-gland:follicle')`), measure them (`scopetool('measure:follicle')`) and take pictures, and a short R chapter that analyses the measurements. The starter practical shows each of these pieces.

### Writing the chapters

The chapters are written in Python, in `build/chapters.py`, using the helper functions in `build/lib.py`. Running `python3 build/make_page.py` puts them into `index.html` (between the `<!--CHAPTERS-->` and `<!--/CHAPTERS-->` markers in `build/template.html`), and also writes the lists that the tabs read (`slides/index.json`, `exams/index.json` and `examples/index.json`). It stops with an error if two tasks, questions or headings have the same name. `chapters.ALL()` lists the chapters in order.

| Helper | What it produces |
| --- | --- |
| `chapter(id, num, title, tab, heading, minutes, lede, body)` | A chapter. `num` and `title` appear in the chapter bar at the top, `tab` is the workbench tab shown with the chapter (`scope`, `flow`, `circuit`, `exam`, `viewer`, `rstudio` or `editor`), and `heading`, `minutes` and `lede` give its heading, how long it takes and its opening sentence |
| `activity(title, [task(...), ...])` | A numbered list of steps |
| `task(id, html, auto='…', check='…')` | A step with a tick box. It ticks itself when an event on the page matches `auto`, or when the condition named by `check` is true |
| `q(id, question, model_answer, accept=, hint=, placeholder=)` | A question with a box for the student's answer and a model answer. If `accept` is given, the answer is checked automatically: regular expressions separated by `\|\|`, or a **number** – `num:4±0.2`, `num:1.145e6±4%` (a tolerance), `num:57..63` (a range) or `num:400`. Numbers can be typed as `1.2e6`, `1.2 × 10^6`, `1.2×10⁶` or `1,200,000`, with units after them |
| `mcq(id, question, [(option, correct, why), ...])` | A multiple-choice question |
| `callout(kind, title, html)` | A highlighted box: `info`, `tip`, `warn` or `concept` |
| `scope(spec)` | A button that opens a slide: `'kidney-cortex'`, or `'kidney-cortex@1.4,2.95,10x'` (centred 1.4 mm from the left and 2.95 mm from the top of the slide, at 10×) |
| `scopefind('slide:key')` | A button that asks the student to find a labelled structure on a slide and click on it (*Show me* helps) |
| `scopetool(name)` | A button that chooses a tool of the microscope: `measure`, `area`, `count`, `label`, `capture` (take a picture), `eyepiece:on`/`eyepiece:off`, `labels`/`labels:off`. `measure:renal corpuscle` also labels the measurements that follow, and `count:Living cells,Dead cells` names the categories to count |
| `scoper('measurements')`, `scoper('counts')` | A button that opens the microscope's R script for the measurements or counts in RStudio |
| `flow(ref)`, `flowrun()` | Buttons that open a diagram (`'example:delay-oscillation'` or `'~/diagrams/my.flow.json'`) and run it |
| `circuit(ref)`, `circuitrun()` | The same for circuits (`'example:rc-circuit'`) |
| `exam(paper)`, `calc()` | Buttons that open a paper of exam practice (its id, or `'free'` for a free essay), or the calculator |
| `pdb(id)`, `viewer(commands)` | Buttons that open a structure in the 3D viewer (the library's copy when there is one), or run the viewer's commands (`'color chain; show spheres HEM'`, `'molecule cortisol'`) |
| `codefile(path, text)` | A file shown in the instructions, with a *Create this file* button (which opens the file in RStudio) and a *Copy* button |
| `rsopen(path)`, `rsrun(code)`, `edit(path)` | Buttons that open a file in RStudio, run code in RStudio's Console, or open a file in the Files tab |
| `bench(tab, label)`, `goto(id, label)` | Buttons that show a tab of the workbench, or a chapter (or a heading) of the instructions |

**`auto`** names an event, optionally followed by conditions on its fields: `=` means "equals", `~` means "contains", and `>` and `<` compare numbers. Alternatives are separated by `||`. For example, `auto="scope:find slide=kidney-cortex target=glomerulus ok=true"` ticks the step when the student clicks on a renal corpuscle when asked to find one, and `auto="scope:measure slide=kidney-cortex n>4"` once they have made five measurements on the slide. A step only ticks while its chapter is on screen. These are the events:

| Event | When it happens | Fields |
| --- | --- | --- |
| `app:bench` | A tab of the workbench is shown | `name` |
| `scope:open` | A slide (or a picture) is opened by the student or by a button | `slide`, `title`, `system` |
| `scope:mag`, `scope:view` | The objective changes; the view settles after a move | `slide`, `mag` (1, 2, 4, 10, 20 or 40: the nearest); `slide`, `mag`, `x`, `y` (mm) |
| `scope:tool`, `scope:panel` | A tool is chosen; a side panel is shown | `name` (`pan`, `measure`, `area`, `count`, `label`; `about`, `measures`, `counts`, `labels`) |
| `scope:measure` | A length (µm) or an area (µm²) is measured | `slide`, `kind` (`length` or `area`), `value`, `unit`, `label`, `n` (the measurements of that slide) |
| `scope:count` | A cell (or anything) is counted | `slide`, `category`, `n` (in that category, on that slide), `total` (on that slide) |
| `scope:label`, `scope:labels`, `scope:eyepiece` | A label of the student's own is added; the slide's labels are shown or hidden; the eyepiece view is switched | `slide`, `text`; `on`; `on` |
| `scope:capture`, `scope:find`, `scope:scale` | A picture is taken; a click while asked to find a structure; a picture's scale is set | `slide`, `path`; `slide`, `target`, `ok`; `slide`, `mpp` |
| `flow:open`, `flow:edit`, `flow:node`, `flow:edge` | A diagram is opened; changed; a box is added; an arrow is added | `name`, `path`, `example`; `nodes`, `edges`; `text`, `role`; `sign` (`+`, `-` or `0`) |
| `flow:run`, `flow:save`, `flow:export` | A diagram is run; saved; exported | `name`, `nodes`, `edges`, `duration`, `oscillates`, `runaway`, `blocked`, `knocked`, `settled`; `path`; `format`, `path` |
| `circuit:open`, `circuit:add`, `circuit:edit`, `circuit:mode` | A circuit is opened; a part is added; the circuit changes; the mode changes | `name`, `path`, `example`, `mode`; `type`; `components`, `total`, `name`; `mode` |
| `circuit:run`, `circuit:switch`, `circuit:measure` | The simulation runs; a switch is closed or opened; a meter shows a reading (or a trace is added) | `name`, `mode`, `time`; `id`, `on`; `kind`, `id`, `label`, `value`, `units` |
| `circuit:save`, `circuit:export` | A circuit is saved; exported | `path`; `format`, `path` |
| `exam:open`, `exam:start`, `exam:words`, `exam:format` | A paper is opened; an attempt starts; an answer's length changes; a button of the editor is used | `paper`, `title`; `paper`; `paper`, `q`, `words`; `cmd` (`bold`, `ul`, `table`, `special`, `formula`, `drawing`…) |
| `exam:flag`, `exam:nav`, `exam:timeup`, `exam:submit`, `exam:download`, `exam:saved` | A question is flagged; another question is shown; the time runs out; the answers are submitted; downloaded; saved to the file | `paper`, `q`, `on`; `paper`, `q`; `paper`; `paper`, `answered`, `total`; `paper`, `format`; `path` |
| `calc:open`, `calc:result` | The calculator is opened; it works something out | –; `expr`, `value` |
| `viewer:loaded`, `viewer:molecule`, `viewer:library` | A structure is loaded; a small molecule is opened from the library; the library is shown | `id`, `kind`; `name`, `code`; – |
| `viewer:command`, `viewer:color`, `viewer:style` | A command of the viewer is run; a colour scheme is applied; a style is shown | `text`; `scheme`, `target`; `type`, `target` |
| `r:input` | An R session reads a line at its prompt | `kind` (`rstudio`), `line` |
| `rstudio:doc`, `rstudio:source`, `rstudio:plot`, `rstudio:saved` | RStudio shows a document; Source is used; a new plot; a document is saved | `path`, `kind`, `name`; `path`, `echo`; `n`; `path` |
| `editor:open`, `editor:view`, `file:create`, `file:saved` | In the Files tab; *Create this file*; a tool saves a file | `path`, `name` |
| `q:checked` | A question has been answered | `id`, `ok` |

**`check`** names a condition, with its argument after a colon: `exists:diagrams/my.flow.json` (a file exists in `~`), `has:scripts/haemocytometer.R|live <- c\(48` (a file's text matches a regular expression), `rows:microscope/measurements.csv>9` (a CSV file has more than nine rows), `slide:liver` (that slide is open in the microscope), `bench:scope` (that tab is being shown) or `installed:ggplot2` (an R package has been installed). You can add your own conditions in `assets/js/page.js` (`MG.checks.name = (event, data, arg) => true or false`), which is also where the buttons' actions are defined (`MG.actions`).

It is worth testing a new practical by working through it as a student would; `test/t_practical.py` does this for the starter practical.

## Slides, papers, examples and molecules

**Slides** live in `slides/<id>/` (an image pyramid of WebP tiles packed into one file, with `slide.json` describing it); `build/make_page.py` lists them in `slides/index.json`, sorted by system. [build/slides/README.md](build/slides/README.md) explains how the GTEx slides were chosen and made, how to label a slide for *find* tasks, and how to add a slide of your own (`build/slides/add_image.py`, from a photograph with a known scale or from a slide scanner's file).

**Papers of exam practice** are JSON files in `exams/` (the format is described at the top of `assets/js/exam.js`): a title, the time allowed, instructions, resources (the calculator, slides, links) and questions – information pages, essays (with a word limit, which can be a hard limit), short answers, numerical questions (with units and a tolerance) and multiple-choice questions – each with marking guidance that students see when they review their submitted answers. The workbench comes with three: *Getting to know exam practice*, *Practice essay (45 minutes)* and *Calculations*. Write a new paper for each essay you set, and open it from the practical with `exam('its-id')`.

**Examples of diagrams and circuits** are the `.flow.json` and `.circuit.json` files in `examples/diagrams/` and `examples/circuits/`, offered in each tab's Examples menu. The easiest way to make one is to build it in the tab, save it, download it from Files, and copy it into the folder (give it a `title`, a `description`, a `group` and an `order`).

**The 3D viewer's library** is in `molecules/` (BinaryCIF files of the proteins, SDF files of the small molecules), and the list is in `assets/js/viewer-bms.js`. [molecules/README.md](molecules/README.md) says where they came from and how to add one.

## What students keep

Students' files, ticks, answers, essays and settings are stored in the browser's storage for the site (IndexedDB and local storage) on their own computer, and they are still there when the student comes back in the same browser. Nothing is stored on a server, and nobody else can see them. A different browser, a different computer or a private window won't have them, and clearing the browser's data for the site deletes them. *My files → Download all my files* downloads everything as a `.zip` file, *My answers → Download my answers* downloads the answers as a web page, and each essay can be downloaded as a Word document. The page warns students if it is open in two tabs of the same browser, because both would write to the same files.

## Privacy

The site sets no cookies and has no tracking or analytics. The only things that leave a student's computer are requests for the page and its slides (from your server); R and its packages (from `webr.r-wasm.org` and `repo.r-wasm.org`), when RStudio is used; structures that are not in the library (from RCSB PDB and AlphaFold DB), when the student asks for them; and anything the student's own R code requests. Essays are never sent anywhere. Shiny apps run inside the page.

## Browser support and limitations

The workbench works in current versions of Chrome, Edge, Firefox and Safari. It was tested in Chromium; please try the browsers your students use, particularly Safari.

- **The slides** were scanned with a 20× objective (about 0.49 µm per pixel), so 40× enlarges the scan without showing finer detail, and fine structures that need oil immersion (bacteria, the fine structure of chromosomes) can't be seen. The slides are regions of a few millimetres cut from each GTEx section, not the whole section. They are sections of normal tissue from post-mortem donors, so some show the changes of autolysis or of age (the slide's *About* panel gives the GTEx pathologist's notes).
- **Exam practice** imitates the candidate's view of an online exam system; the real system may differ in its details, and it changes from year to year.
- **R in the browser** is R 4.6 (webR 0.6.0): one thread, a few gigabytes of memory, packages from the webR repository (most of CRAN, including ggplot2 and dplyr), and documents knitted to HTML only. RStudio's tab is an imitation made for teaching.
- **Cross-origin isolation.** R can only wait for typed input and be interrupted with <kbd>Esc</kbd> if the page is cross-origin isolated. GitHub Pages can't send the headers for this, so `assets/js/isolation.js` registers `isolation-sw.js`, a service worker that adds them (it doesn't cache anything). On a student's first visit, the page reloads itself once. Adding `?isolation=off` to the address removes the service worker.

## How it was tested

The workbench was tested in Chromium (using Playwright) on 19 October 2026, with the scripts in the `test/` folder:

| Script | What it checks |
| --- | --- |
| `t_smoke.py` | The page loads, every tab opens, and nothing reports an error |
| `t_scope.py` | The microscope: slides open and draw completely, the objectives and the scale bar are right, measuring lengths and areas, counting, labels, pictures, the eyepiece, a picture from Files as a slide, the CSV files, what is kept across a reload, and the toolbar at the width of a phone |
| `t_flow.py` | Diagrams (85 checks): the simulator against worked answers (63% and 95% of a change after one and three response times, negative feedback settling at 1/(1 + gain), a delayed loop oscillating, positive feedback running away), drawing with the mouse and the keyboard, undo, saving and opening, PNG, SVG and CSV exports, every example, the events, and the layout at 1500, 1920 and 390 pixels |
| `t_circuit.py` | Circuits (82 checks): a circuit built with the mouse, and the simulator against hand calculations – Ohm's law, resistances in series and in parallel, a voltage divider, an RC circuit at one time constant (63%), an RLC circuit, diodes and valves, the Windkessel model and the resting membrane potential (−70.4 mV, as the formula gives); circuits that must not break it (a short circuit, a part joined to nothing, a current source with no path); saving and opening, pictures and tables, the events, Physiology mode, and the layout at the width of a phone |
| `t_exam.py` | Exam practice: the papers, typing, the word count and its limit, every button of the editor, flags, autosave and restore after a reload, the options, time running out, submitting, the Word, web and text downloads (the Word file is opened and checked), numerical and multiple-choice marking, and the calculator's arithmetic |
| `t_viewer.py` | The 3D viewer and its library |
| `t_practical.py` | The starter practical, worked through as a student would do it, checking that each step ticks itself and that the numerical answers are marked correctly |

To run the tests, install Playwright (`pip install playwright`, then `playwright install chromium`), go into the `test` folder and run each script, for example `python3 t_scope.py`. Screenshots are saved in `test/out/`.

## Files

```
index.html             the page (built by build/make_page.py)
isolation-sw.js        the service worker for cross-origin isolation and Shiny apps (keep it next to index.html)
assets/js/             the workbench's code: config.js (settings), page.js (the tabs, and the actions and checks used by
                       the instructions), scope.js (Microscope), flow.js (Diagrams), circuit.js (Circuits), exam.js,
                       calc.js and docx.js (Exam practice), viewer-*.js, commands.js and viewer-bms.js (3D viewer),
                       rstudio.js, rsource.js and rsession.js (RStudio and R), editor.js (Files), tutorial.js (the
                       instructions) and workbench.js (the page)
assets/css/            the style sheets
assets/vendor/         the bundled libraries, with their licences (see THIRD_PARTY.md)
slides/                the microscope's slides (index.json lists them; build/slides/README.md)
exams/                 the papers of exam practice (index.json lists them)
examples/              the examples of Diagrams and Circuits (index.json lists them)
molecules/             the 3D viewer's library (molecules/README.md)
starter/               the files copied into each student's home folder (none in the starter practical)
build/                 make_page.py, chapters.py (the starter practical), lib.py (the helper functions),
                       template.html, and slides/ (the scripts that make the slides)
test/                  the tests (Playwright)
serve.py               a small local web server (optional)
THIRD_PARTY.md         the third-party software and data, with their licences and sources
```

## Credits and licences

The microscope uses [OpenSeadragon](https://openseadragon.github.io/) (BSD 3-clause licence) and the 3D viewer [NGL](https://nglviewer.org/) (MIT). R is provided by [webR](https://github.com/r-wasm/webr) (R itself is licensed under the GNU GPL). The editors use [CodeMirror](https://codemirror.net/5/), Markdown is converted by marked and made safe by DOMPurify, `.zip` and `.docx` files are written with JSZip, and PDFs are displayed with PDF.js. The way Shiny apps run inside the page follows the design of [Shinylive](https://github.com/posit-dev/shinylive) (MIT licence). Each of these keeps its own licence, and **[THIRD_PARTY.md](THIRD_PARTY.md)** lists them all, with their versions, licences and origins.

**The slides of human tissue** are from the Genotype-Tissue Expression (GTEx) project, obtained through the NCI Imaging Data Commons, and are used under the Creative Commons Attribution 4.0 licence: *The Genotype-Tissue Expression (GTEx) Project was supported by the Common Fund of the Office of the Director of the National Institutes of Health, and by NCI, NHGRI, NHLBI, NIDA, NIMH, and NINDS.* Each slide's *About* panel, and every picture students take, gives the GTEx sample it comes from. The stage micrometer and the haemocytometer are drawings made for the workbench (CC0). **The molecules** of the 3D viewer's library come from the Protein Data Bank (PDB data are free of copyright, CC0).

**Imitations.** The RStudio tab imitates the RStudio IDE so that what students learn carries over to the real program; it contains no part of RStudio, and it is not made or endorsed by Posit. RStudio is a trademark of Posit Software, PBC. *Exam practice* imitates the candidate's view of online exam systems such as Inspera Assessment, so that students can practise writing in a browser; it contains no part of Inspera, and it is not made or endorsed by Inspera AS. Inspera is a trademark of Inspera AS.
