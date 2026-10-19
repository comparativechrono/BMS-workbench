# The microscope's slides

Each slide of the microscope's slide box is a folder `slides/<id>/` with four files:

| File | What it is |
| --- | --- |
| `slide.json` | What the slide is: its title, the system of the body it is filed under, a description, a list of things to look for, the stain, the size of its pixels (`mpp`, micrometres per pixel), where it comes from and its licence, its teaching labels, and the layout of its tiles |
| `tiles.pack` | The image pyramid: every tile of every level (WebP pictures of 254 × 254 pixels, overlapping by 1 pixel, as in OpenSeadragon's Deep Zoom layout), one after another in one file |
| `tiles.idx` | Where each tile is in `tiles.pack` (two little-endian 32-bit numbers per tile: its offset and length) |
| `thumb.jpg` | The small picture in the slide box |

The microscope reads `tiles.idx`, and then asks for each tile it needs with an HTTP *range request* into `tiles.pack`. A student who looks at a slide only downloads the parts they look at, and the site needs four files per slide instead of tens of thousands. `python3 build/make_page.py` lists the slides in `slides/index.json`, sorted by system (the list of systems is in `make_page.py`).

The scripts here make and check the slides. They need Python 3 with numpy, Pillow and OpenCV (`pip install numpy pillow opencv-python-headless`); `gtex.py` also needs pydicom (`pip install pydicom`).

| Script | What it does |
| --- | --- |
| `pyramid.py` | Writes a slide folder from a picture held in memory (used by the other scripts) |
| `gtex.py` | Makes the GTEx slides listed in `gtex-slides.json`, downloading only the region of each slide that is used |
| `labels.py` | Copies the labels, description and "look for" list of each slide in `gtex-slides.json` into its `slide.json`, without making the tiles again |
| `synthetic.py` | Draws the stage micrometer and the haemocytometer |
| `add_image.py` | Adds a slide of your own, from a picture or a slide scanner's file |
| `render.py` | Draws a slide (or part of it) as a JPEG, with a grid of pixel coordinates and its labels: for checking a slide and placing labels |

## The GTEx slides

29 of the slides are sections of human tissue from the **Genotype-Tissue Expression (GTEx) project** (normal tissues, except the coronary artery, which has atherosclerosis), which took samples of many tissues from nearly a thousand donors (most of them after death), fixed them in PAXgene, embedded them in paraffin, stained sections with haematoxylin and eosin (H&E), and scanned them with an Aperio scanner at 20× (0.4942 µm per pixel). The scans are kept by the **NCI Imaging Data Commons** (IDC, collection `gtex`; [doi:10.5281/zenodo.11099100](https://doi.org/10.5281/zenodo.11099100)) as DICOM files in a public bucket, under the **Creative Commons Attribution 4.0** licence; the credit is *the GTEx Consortium*, and each slide's `slide.json`, *About* panel and the pictures students take give the GTEx sample it comes from.

For each tissue, a section was chosen from the IDC's list (with the [idc-index](https://github.com/ImagingDataCommons/idc-index) package) and checked against the GTEx pathologist's notes (in GTEx's sample attributes, given in each slide's *About* panel), preferring well-preserved sections with the typical features of the tissue. Then a region of a few millimetres that shows the tissue well was chosen (`crop_mm`, in millimetres from the top left of the scan). `gtex.py` reads the DICOM file's table of tiles and downloads only the tiles of that region, with range requests, so a slide costs a few megabytes to make instead of the whole scan's gigabyte. The region is then encoded again as WebP tiles (quality 70); nothing else about the picture is changed.

Each entry of `gtex-slides.json` gives the slide's `id`, the GTEx `sample`, the region (`crop_mm`), the IDC identifiers of the scan (`idc`), the GTEx tissue site and pathologist's note, and the texts and labels the microscope shows:

```bash
python3 build/slides/gtex.py                  # make the slides that are not made yet
python3 build/slides/gtex.py liver            # make one again
python3 build/slides/gtex.py --preview liver  # only a preview of its region (build/slides/previews/liver.jpg)
python3 build/slides/labels.py                # after changing labels or texts
python3 build/make_page.py
```

To add another GTEx slide, find a sample of the tissue you want in the IDC portal or with idc-index (`collection_id == 'gtex'`), add an entry for it to `gtex-slides.json` (copy an existing one), try its region with `--preview`, and then make it.

## Labels and *find* tasks

A slide's labels are listed in `slide.json` (for the GTEx slides, in `gtex-slides.json`, from which `labels.py` copies them):

```json
{"key": "glomerulus", "text": "Renal corpuscle (glomerulus)", "find": "a renal corpuscle", "x": 5140, "y": 1518, "r": 110}
```

`x` and `y` are in full-resolution pixels of the slide (the microscope draws the label as a pin with its text when the student shows the labels). `r` (a circle, in pixels) or `poly` (a list of `[x, y]` points) is the region that counts as the structure when a practical asks students to find it: `scopefind('kidney-cortex:glomerulus')` in the instructions says *Find a renal corpuscle and click on it*, and any label with that key counts. `find` is how the request names the structure (without it, the text is used). To place labels, draw the slide with a grid:

```bash
python3 build/slides/render.py kidney-cortex check.jpg --down 8 --grid 1000 --labels        # the whole slide
python3 build/slides/render.py kidney-cortex detail.jpg --down 2 --box 4000,1000,6000,2500   # a part, in more detail
```

Every GTEx slide carries labels for its main structures (`slides/index.json` gives the number for each slide, and the microscope's *Labels* panel lists them). Check the labels of a slide before you set a *find* task on it, and add your own where you need them:

- A *find* task only knows the examples that are labelled. A click on another labelled structure is answered with what it is ("You clicked on a portal tract, not a central vein"), and a click elsewhere with "That isn't one of the examples marked on this slide", so set *find* tasks on structures that are labelled **everywhere** they occur in the slide (the renal corpuscles of the kidney and the portal tracts of the liver, for example) or that occur only once. *Show me* takes the student to each example in turn and rings it in yellow. For something found all over a slide (proximal tubules, hepatocytes), label a few good examples and ask students to look at them, or to label others themselves, rather than to find one.
- A structure that is easy to confuse with another needs a region that covers all of it (`poly` for an irregular one), and several labels with the same key if there are several good examples. A click within a few screen pixels of a region also counts, so that small structures can be hit at low power.

### What some slides do and don't show

These are sections of normal tissue (apart from the coronary artery), mostly from donors after death, cut from routine GTEx samples, so they don't all show everything a textbook would. When the slides were labelled, every label was checked at high power, and these points were noted:

- **Ovary**: most of the region is one large antral follicle (its antrum, granulosa and theca) and the ovarian stroma; there is no oocyte, no smaller follicle and no corpus luteum.
- **Coronary artery**: the plaque is a much-thickened intima with foam cells and inflammatory cells; there is no lipid core, no cholesterol clefts, no calcification and no distinct fibrous cap, and the lumen is still wide.
- **Stomach**: the surface and the gastric pits are partly worn away (autolysis).
- **Lung**: many alveoli have collapsed, and the airway is a bronchiole (no cartilage); there is no bronchus.
- **Aorta**: the endothelium has come away. **Liver**: the branches of the hepatic artery are hard to pick out; there are nine portal tracts (one of them a large one, with a long branch of the portal vein, across the middle) but only two clear central veins, and some vessels that could be either are left unlabelled. **Thyroid** and **testis**: the region has no capsule or tunica albuginea. **Pituitary**: no clear pars intermedia. **Fallopian tube**: the cilia are too fine to see in a 20× scan.
- Some labels mark small things (the umbrella cells of the bladder, the surface epithelium of the uterus, the two layers of cells lining a breast duct). A click within a few screen pixels of a label counts in a *find* task, but these are best found at 20× or 40×.

## The drawn slides

`synthetic.py` draws two slides for practising measurement, which are drawings rather than photographs (CC0); `python3 build/slides/synthetic.py stage-micrometer` draws one of them only:

- **stage-micrometer**: a stage micrometer, 1 mm divided into 100 divisions of 10 µm, drawn at 0.25 µm per pixel. With the eyepiece view, its graticule of 100 divisions covers 4 µm per division at 10× and 1 µm at 40×.
- **haemocytometer**: an improved Neubauer chamber (depth 0.1 mm; nine large squares of 1 mm) holding cells mixed 1:1 with trypan blue: clear (living) cells and blue (dead) cells, drawn at 0.5 µm per pixel. The true counts of each large square, following the usual rule (count the cells that touch the top or left line, not the bottom or right), are kept in its `slide.json` (`counts`): the four corner squares hold 60, 64, 60 and 45 living cells and 8, 8, 8 and 2 dead ones, so the suspension held 1.145 × 10⁶ living cells per mL, 89.8% of them alive. Changing the random seed in `synthetic.py` draws a different suspension, for a practical of your own; the new counts are written into `slide.json`, but the numbers quoted in the starter practical (`build/chapters.py`) and here would then need changing too.

## Slides of your own

`add_image.py` makes a slide from a picture (JPEG, PNG or TIFF) or, if [OpenSlide](https://openslide.org/) is installed (`pip install openslide-python openslide-bin`), from a slide scanner's file (SVS, NDPI, MRXS, SCN…). The scale is essential: for a scanner's file OpenSlide reads it; for a photograph taken through a microscope, photograph a stage micrometer with the same objective and camera settings, and divide its length in micrometres by its length in pixels.

```bash
python3 build/slides/add_image.py my-thyroid.svs thyroid-mine --title "Thyroid (department slide 12)" \
    --system Endocrine --stain "H&E (haematoxylin and eosin)" --species Human --crop 2,2,7,6 \
    --credit "Department of Physiology slide collection" --licence "Used with permission"
python3 build/slides/add_image.py photo.jpg cells-photo --title "Cultured cells" --mpp 0.32 --system Other
python3 build/make_page.py
```

`--crop` keeps only a region (in millimetres), and `--down 2` halves the size (and doubles the size of each pixel), which keeps the slide small: a region of 4 × 4 mm at 0.5 µm per pixel is about 15 MB. Make sure that you may publish a picture before you add it: everything in `slides/` is public on the site.

## Size

The 31 slides take about 370 MB, which GitHub Pages hosts comfortably (a site may be up to 1 GB). A practical that only needs some of the slides can delete the others' folders before it is published. The slides can also be hosted on another site (set `slideBase` in `assets/js/config.js`), as long as that site allows requests from the workbench's address (CORS) and answers range requests.
