# Third-party software and data, and where they came from

The BMS workbench includes libraries and data that are licensed separately, and it also uses others that the student's browser downloads while the page is running. Each of them keeps its own licence, and none of the licences below applies to the workbench's own text and code. If you copy or redistribute any of these files, please keep each component's notices and licence files with it.

## JavaScript libraries (bundled with the site)

| Library | Version | Licence | Files |
| --- | --- | --- | --- |
| OpenSeadragon, which draws the microscope's slides (the minified build from the release, unchanged) | 5.0.1 | BSD 3-clause | [assets/vendor/openseadragon/LICENSE.txt](assets/vendor/openseadragon/LICENSE.txt) |
| NGL Viewer, the 3D viewer (includes three.js r158, MIT; chroma.js 1.4.1, 3-clause BSD, with the ColorBrewer colours, Apache 2.0; JS Signals and a k-d tree, MIT) | 2.5.0 | MIT | [assets/vendor/ngl/LICENSE](assets/vendor/ngl/LICENSE), [THIRD-PARTY-NOTICES.txt](assets/vendor/ngl/THIRD-PARTY-NOTICES.txt) |
| CodeMirror 5, used for the editors (the R, Markdown, YAML, YAML front-matter, shell, JavaScript and Python modes, and the add-ons for brackets, comments, the active line, search, overlay and multiplexed modes, and runmode, all unchanged) | 5.65.18 | MIT | [assets/vendor/codemirror/LICENSE](assets/vendor/codemirror/LICENSE) |
| `rmarkdown.js`, the editor mode for R Markdown and Quarto documents. It is not part of CodeMirror: it was written for the R workbench, based on CodeMirror's own modes and its multiplex and YAML front-matter add-ons | – | MIT, like CodeMirror (see its header) | [assets/vendor/codemirror/rmarkdown.js](assets/vendor/codemirror/rmarkdown.js) |
| marked, which displays Markdown (`lib/marked.umd.js` from the npm package, unchanged, saved as `marked.min.js`) | 18.0.13 | MIT (its licence file also contains the BSD notice of the original Markdown) | [assets/vendor/marked/LICENSE](assets/vendor/marked/LICENSE) |
| DOMPurify, which cleans HTML before it is displayed (R help pages, and HTML in papers and examples) | 3.4.16 | Apache 2.0 or MPL 2.0 | [assets/vendor/dompurify/LICENSE](assets/vendor/dompurify/LICENSE) |
| JSZip, which makes the `.zip` downloads and the Word documents of exam practice, and reads `.xlsx` files for previews (it includes pako 1.0) | 3.10.1 | MIT or GPL v3; pako: MIT ([LICENSE-pako.txt](assets/vendor/jszip/LICENSE-pako.txt), and also at the end of this file) | [assets/vendor/jszip/LICENSE.markdown](assets/vendor/jszip/LICENSE.markdown) |
| PDF.js, which displays PDF files in the Files tab (the legacy build from the npm package pdfjs-dist, unchanged) | 6.3.289 | Apache 2.0 | [assets/vendor/pdfjs/LICENSE](assets/vendor/pdfjs/LICENSE), [README.txt](assets/vendor/pdfjs/README.txt) |
| Supplied with PDF.js: the Foxit standard fonts (BSD), Adobe's CMaps (BSD), OpenJPEG (BSD 2-clause), PDFium's JBIG2 decoder (BSD 3-clause) and qcms (MIT), the last three as built for PDF.js by Mozilla (BSD 2-clause, Apache 2.0 and MIT), and a CMYK profile (CC0). The package's Liberation Sans fonts (GPL 2 with a font exception) have been left out | | as listed | [standard_fonts/LICENSE_FOXIT](assets/vendor/pdfjs/standard_fonts/LICENSE_FOXIT), [cmaps/LICENSE](assets/vendor/pdfjs/cmaps/LICENSE), [wasm/](assets/vendor/pdfjs/wasm/), [iccs/LICENSE](assets/vendor/pdfjs/iccs/LICENSE) |

These files are the same as those of the R workbench and the bioinformatics workbench (the same versions, unchanged). Apart from webR, the R packages and the structures described below, the page doesn't load any code, fonts or style sheets from other sites. It uses the fonts that are already on the student's computer.

## Code adapted from another project

| Files | Adapted from | Licence |
| --- | --- | --- |
| [isolation-sw.js](isolation-sw.js) (the part that handles Shiny), [assets/js/shiny.js](assets/js/shiny.js), [assets/js/shiny-socket.js](assets/js/shiny-socket.js), and the R functions `wb$shiny_*` in [assets/js/rsession.js](assets/js/rsession.js): the code that runs Shiny apps inside the page | [Shinylive](https://github.com/posit-dev/shinylive) (Posit): `shinylive-sw.ts`, `messageporthttp.ts`, `messageportwebsocket.ts`, `messageportwebsocket-channel.ts`, `shinylive-inject-socket.ts` and the R code in `hooks/useWebR.tsx` | MIT ([notice](assets/vendor/licenses/shinylive-MIT.txt)) |

These files come from the R workbench, where they were written afresh but follow Shinylive's design closely; Shinylive's MIT notice is kept with the site, in [assets/vendor/licenses/shinylive-MIT.txt](assets/vendor/licenses/shinylive-MIT.txt). The rest of the site's code belongs to the workbench itself: it was written for it, or taken from the R, bioinformatics and pedigree workbenches, which have the same authors. The microscope (`scope.js`), the Diagrams and Circuits tabs (`flow.js`, `circuit.js`), exam practice (`exam.js`, `calc.js`, `docx.js`) and the 3D viewer's library (`viewer-bms.js`) were written for this workbench; the RStudio tab, Files and the 3D viewer come from the other workbenches.

## Imitations written for the workbench

These files don't contain or load any of the programs they imitate. Their layout, names and messages follow the real programs, so that what students learn carries over to them.

| File | What it imitates | Notes |
| --- | --- | --- |
| `assets/js/rstudio.js` and `rsource.js` (the RStudio tab) | The [RStudio](https://posit.co/products/open-source/rstudio/) IDE: its panes, menus, dialogs and messages | It is not RStudio, and it is not made or endorsed by Posit (as its About box says). RStudio is a trademark of Posit Software, PBC; RStudio's open-source edition is licensed under the GNU AGPL 3 |
| `assets/js/exam.js`, `calc.js` and `docx.js` (the Exam practice tab) | The candidate's view of online exam systems such as [Inspera Assessment](https://www.inspera.com/): the start page, the timer, the essay editor and its toolbar, flags, question tiles, the calculator and the submission page | It contains no part of Inspera, and it is not made or endorsed by Inspera AS. Inspera is a trademark of Inspera AS |
| `assets/js/knit.js` | Knitting R Markdown documents and rendering Quarto documents to HTML, with the real knitr and markdown packages (see below) | rmarkdown: GNU GPL 3; Quarto: MIT |

## Downloaded while the page is running (not bundled)

- **webR 0.6.0**, which is R 4.6.0 compiled to WebAssembly, is downloaded by the student's browser from `https://webr.r-wasm.org/v0.6.0/` when RStudio first starts, and is then loaded from the browser's cache. The site does not distribute it. As [webR's licence notes](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md) explain, R is licensed under versions 2 and 3 of the GNU GPL, the webR binaries (and the libraries compiled into them) are distributed under version 3 of the GNU GPL, and webR's other software is under the MIT licence unless its files say otherwise. R's base packages are part of R (GNU GPL 2 or 3), and webR's support package, webr, is MIT.
- **Other R packages** are downloaded from the webR repository, `https://repo.r-wasm.org` (CRAN packages built for webR), when the student installs them, or when a feature of the page needs them and the student agrees (knitr and markdown for knitting, shiny for Shiny apps, readr and readxl for *Import Dataset*). Each has its own licence, which `packageDescription("NAME")$License` shows in R.
- **Structures that are not in the 3D viewer's library** are downloaded when the student asks for them, from RCSB PDB (`models.rcsb.org` and `files.rcsb.org`; PDB data are CC0) and AlphaFold DB (`alphafold.ebi.ac.uk`; CC BY 4.0, credit: Jumper et al. 2021 and Varadi et al. 2024).

## Data

| Data | Source | Terms |
| --- | --- | --- |
| `slides/` (29 slides of human tissues: adrenal gland to uterus) | Regions of whole-slide images of H&E-stained sections of human tissue (normal, except the coronary artery, which has atherosclerosis) from the **Genotype-Tissue Expression (GTEx) project**, obtained from the **NCI Imaging Data Commons** (collection `gtex`, published as *GTEx: DICOM converted whole slide hematoxylin and eosin stained images from the Genotype-Tissue Expression (GTEx) Project*, [doi:10.5281/zenodo.11099100](https://doi.org/10.5281/zenodo.11099100); Fedorov et al. 2023, *RadioGraphics* 43: e230180). Each slide's `slide.json` gives the GTEx sample, the IDC series and the region used; the region was re-encoded as WebP tiles and nothing else was changed. How they were chosen and made is described in [build/slides/README.md](build/slides/README.md) | **CC BY 4.0**. Credit: the GTEx Consortium. *The Genotype-Tissue Expression (GTEx) Project was supported by the Common Fund of the Office of the Director of the National Institutes of Health, and by NCI, NHGRI, NHLBI, NIDA, NIMH, and NINDS.* (GTEx Consortium 2020, *Science* 369: 1318–1330) |
| `slides/stage-micrometer`, `slides/haemocytometer` | Drawings made for the workbench by `build/slides/synthetic.py` (they are not photographs) | CC0 1.0 |
| `molecules/` (17 proteins and 18 small molecules) | The Protein Data Bank (RCSB PDB): entries as BinaryCIF from RCSB's ModelServer, and the ideal coordinates of small molecules from the Chemical Component Dictionary; downloaded on 19 October 2026. The entries, their primary citations and checksums are listed in [molecules/README.md](molecules/README.md) | CC0 1.0 (please cite the PDB, Berman et al. 2000, and each entry's primary publication) |
| `exams/`, `examples/` | The papers of exam practice and the examples of Diagrams and Circuits, written for the workbench | as the workbench |

## pako's licence notice

JSZip ([assets/vendor/jszip/jszip.min.js](assets/vendor/jszip/jszip.min.js)) includes pako 1.0, but the file doesn't contain pako's licence notice. The notice is therefore kept next to it, in [LICENSE-pako.txt](assets/vendor/jszip/LICENSE-pako.txt), and is also reproduced here:

```
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
