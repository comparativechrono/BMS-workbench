# The simulations of the Simulations tab

The Simulations tab (`assets/js/sims.js`) holds a small library of **PhET Interactive Simulations**, made by the PhET
project at the University of Colorado Boulder (https://phet.colorado.edu), chosen for biomedical science. Each one is
kept with the site, in `sims/<id>/`:

| File | What it is |
| --- | --- |
| `<id>_en.html` | PhET's English single-file build of the simulation (its code, pictures and sounds in one file), exactly as PhET publishes it |
| `thumb.jpg` | PhET's screenshot of it (`<id>-600.png`), made smaller (480 × 315) for the library |

`sims/index.json` lists them for the tab: title, version, topics, a description and why it is there, its screens, its
credits (read from the file), its size and build date, and the values that the tab watches for the steps of the
practicals that tick themselves (`watch`, below). `fetch_sims.py` writes it from `sims.json`, the list kept here.

## The licence, and the versions

PhET published its HTML5 simulations under the **Creative Commons Attribution 4.0** licence (CC BY 4.0), which allows
anyone to copy them and to host them on their own site, for any purpose, with attribution. In 2026 PhET changed that:
the versions it publishes from **29 March 2026** are licensed **CC BY-NC 4.0** (no commercial use), and PhET's
licensing page now calls the earlier ones its "historical" simulations, which stay under CC BY 4.0
(https://phet.colorado.edu/en/licensing/html, read on 19 October 2026). This site uses only CC BY material, so **each
simulation here is pinned to the newest version whose own file says "This file is licensed under Creative Commons
Attribution 4.0"** – all of them built before 29 March 2026. `fetch_sims.py` checks that sentence (and the absence of
"NonCommercial") in every file it downloads, and refuses anything else; the test (`test/t_sims.py`) checks the files
on the site again. Do not replace a file with PhET's `latest` version without checking its licence.

The credit PhET asks for, "as close as possible to the point of use", is shown under the library, under every
simulation, and in each simulation's **About** box:

> Simulation by PhET Interactive Simulations, University of Colorado Boulder, licensed under CC BY 4.0
> (https://phet.colorado.edu).

The files are not changed. (CC BY 4.0 would allow changes, with notice, but none are needed.) The PhET name and logo
are trademarks of the University of Colorado: the logo stays in each simulation, visible and unaltered, as PhET
requires, and the name is used only to credit PhET. Each file lists, in its code, the third-party libraries, fonts,
pictures and sounds it contains and their licences (MIT, Apache 2.0, BSD, ISC, SIL OFL 1.1, CC BY 4.0, CC0 and public
domain); PhET's own source code is available separately under GPL 3.0 (https://github.com/phetsims).

**Privacy.** Out of the box, a PhET simulation reports its use to PhET (`phet.colorado.edu/yotta/…`), loads Google Tag
Manager and Google Analytics, and checks PhET's site for a newer version. The tab opens every simulation with PhET's own
query parameter **`yotta=false`**, which switches all of that off: the test checks that a simulation asks nothing of
any other site. (Opened directly, without the parameter, the same file would report to PhET and Google.)

## The simulations

| Simulation | id | Version | Built | Size | Screens |
| --- | --- | --- | --- | --- | --- |
| Neuron | `neuron` | 1.1.34 | 2025-12-17 | 1.1 MB | – |
| Membrane Transport | `membrane-transport` | 1.0.3 | 2026-03-12 | 3.3 MB | Simple Diffusion, Facilitated Diffusion, Active Transport, Playground |
| Diffusion | `diffusion` | 1.1.5 | 2026-03-16 | 2.4 MB | – |
| Gas Properties | `gas-properties` | 1.1.6 | 2026-02-27 | 2.6 MB | Ideal, Explore, Energy, Diffusion |
| Under Pressure | `under-pressure` | 1.1.34 | 2026-02-11 | 1.2 MB | – |
| pH Scale | `ph-scale` | 1.7.3 | 2026-02-15 | 2.8 MB | Macro, Micro, My Solution |
| Acid-Base Solutions | `acid-base-solutions` | 1.3.13 | 2026-02-06 | 2.6 MB | Intro, My Solution |
| Molarity | `molarity` | 1.5.21 | 2025-09-03 | 1.9 MB | – |
| Beer's Law Lab | `beers-law-lab` | 1.8.4 | 2026-02-15 | 2.8 MB | Concentration, Beer's Law |
| Gene Expression Essentials | `gene-expression-essentials` | 1.0.34 | 2025-11-22 | 5.0 MB | Expression, mRNA, Multiple Cells |
| Color Vision | `color-vision` | 1.3.4 | 2026-03-16 | 5.8 MB | Single Bulb, RGB Bulbs |
| Geometric Optics | `geometric-optics` | 1.3.14 | 2026-02-09 | 2.3 MB | Lens, Mirror |
| Capacitor Lab: Basics | `capacitor-lab-basics` | 1.6.37 | 2026-02-08 | 1.5 MB | Capacitance, Light Bulb |
| Least-Squares Regression | `least-squares-regression` | 1.2.3 | 2026-02-06 | 2.3 MB | – |

38 MB in all (the pictures are 0.3 MB of it). A student downloads only the simulations they open.

Why each one (the same sentences are in each simulation's About box):

- **Neuron** – the ionic basis of the action potential: the voltage-gated channels, the ions that move, and the membrane potential on a chart.
- **Membrane Transport** – how solutes cross the cell membrane: through the lipid bilayer, through channels and carriers, and against a gradient with energy.
- **Diffusion** – diffusion down a concentration gradient, and what makes it faster or slower (mass, temperature, number).
- **Gas Properties** – the gas laws that underlie breathing, the partial pressures of the gases in air, and the diffusion of gases.
- **Under Pressure** – pressure in a column of fluid (ρgh): why blood pressure differs between the head and the feet, and pressure measured against atmospheric pressure.
- **pH Scale** – pH as a logarithmic scale of the hydrogen ion concentration, the pH of body fluids, and the effect of dilution.
- **Acid-Base Solutions** – weak acids that dissociate only partly: the basis of buffers, and of the bicarbonate buffer of the blood.
- **Molarity** – concentration in mol L⁻¹, and the arithmetic of making up and diluting solutions for a practical.
- **Beer's Law Lab** – spectrophotometry: the Beer–Lambert law (A = εcl), which turns the absorbance of a solution into its concentration.
- **Gene Expression Essentials** – transcription and its control by transcription factors, translation, and the breakdown of mRNA and protein.
- **Color Vision** – three kinds of cone and the mixing of their signals, and what filters do to the light that reaches the eye.
- **Geometric Optics** – how a lens forms an image: the optics of the eye and of the microscope's objective and eyepiece.
- **Capacitor Lab: Basics** – the cell membrane as a capacitor: a thin insulator that separates charge (Q = CV).
- **Least-Squares Regression** – fitting a straight line to data (a standard curve, a calibration), and what the residuals and r tell you.

## Updating or adding a simulation

```bash
python3 build/sims/fetch_sims.py --find      # the newest CC BY 4.0 version of each simulation in sims.json (asks PhET's site)
python3 build/sims/fetch_sims.py             # download the pinned versions into sims/ and write sims/index.json
python3 build/sims/fetch_sims.py neuron      # only one
python3 build/sims/fetch_sims.py --index     # only write sims/index.json again (after editing sims.json)
python3 test/t_sims.py
```

To add a simulation, add an entry to `sims.json` (its PhET id – the name in its address on PhET's site – its title,
topics, a one-line description, why it is there, and the names of its screens), run `--find` to pin its newest CC BY
4.0 version, then download it. PhET's simulations published only after 29 March 2026 have no CC BY version and cannot
be added. Their screens can be read in the browser's console from a running simulation:
`phet.joist.sim.simScreens.map(s => s.nameProperty.value)` (in older ones, `phet.joist.sim.screens.map(s => s.name)`).

### What the tab watches (`watch`)

For the steps of a practical that tick themselves, the tab can watch a few values inside a simulation, through PhET's
own objects in the frame (the simulation comes from the same site, so the page may look into it). Each entry of
`watch` names a screen (from 1) and a property of that screen's model, and either an `action` (reported as
`sim:action` when the property takes the value `when`) or a `change` (reported as `sim:change` with its new value). For
example, Neuron's "Stimulate Neuron" button sets `model.stimulusPulseInitiatedProperty` of its screen to true, which the
tab reports as `sim:action {id: 'neuron', action: 'stimulate'}`. These are PhET's internal names, so they may change
between versions: after updating a simulation, run the test, which checks them.
