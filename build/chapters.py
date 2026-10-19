"""The chapters of the BMS workbench's starter practical, "A tour of the workbench".

A short tour of the tools of the workbench, using examples that are not taken from the course's lectures: the microscope
(a slide of the kidney and of the liver), measuring and counting (a stage micrometer, an eyepiece graticule, renal
corpuscles, magnification and scale bars, a haemocytometer), flow diagrams that run, circuits, exam practice, the 3D
viewer and R. Each chapter shows how the tools link together: measurements and counts from the microscope are read by
R, pictures go to Files, and essays are downloaded as Word documents."""
from lib import *

# (code that contains quotes or backslashes is kept out of the f-strings below)
HAEMO_R = '''# Counting cells with a haemocytometer
# the living (clear) and dead (blue) cells in the four large corner squares
live <- c(60, 64, 60, 45)
dead <- c(8, 8, 8, 2)

volume_mL <- 1e-4   # the volume over one large square: 1 mm x 1 mm x 0.1 mm = 0.1 uL = 0.0001 mL
dilution <- 2       # the cells were mixed 1:1 with trypan blue

# living cells per mL of the original suspension
cells_per_mL <- mean(live) / volume_mL * dilution
cells_per_mL
format(cells_per_mL, scientific = TRUE)

# the percentage of the cells that are alive (the viability)
viability <- 100 * sum(live) / (sum(live) + sum(dead))
round(viability, 1)
'''


HAEMO_CHECK = 'has:scripts/haemocytometer.R|live <- c\\(48, ?52, ?50, ?46\\)'


def tabs_figure():
    """the tabs of the workbench, as a figure"""
    items = [
        ('Microscope', 'A virtual microscope with slides of human tissues: objectives from 1× to 40×, an eyepiece graticule, and tools to measure, count, label and take pictures.'),
        ('Diagrams', 'Flow diagrams of how the body controls itself – boxes, and arrows that increase (+) or decrease (−) – which you can run to see how things change with time.'),
        ('Circuits', 'Electrical circuits, and the circuit models of physiology, built and run as on a lab bench, with meters and traces.'),
        ('Exam practice', 'An essay editor that works like the online exam system: a timer, a word count, a calculator, flags, and downloads as Word documents.'),
        ('3D viewer', 'Proteins and smaller molecules in 3D, with a library of molecules of physiology.'),
        ('RStudio', 'R, for analysing data – including the measurements and counts that you make with the microscope.'),
        ('Files', 'Everything you save: measurements, counts, pictures, diagrams, circuits, essays and R scripts.'),
    ]
    return '<div class="ways">' + ''.join(f'<div class="way"><b>{t}</b><span>{d}</span></div>' for t, d in items) + '</div>'


def eq(html):
    return f'<p class="eq">{html}</p>'


# ---------------------------------------------------------------------------------------------------------------------
def ch_start():
    body = f'''
<h2 id="s-what">What’s in the workbench</h2>
<p>The workbench on the right brings together the tools of a biomedical science practical. Each tab is a different tool:</p>
{tabs_figure()}
<p>The tools work together. The microscope keeps your measurements and counts in files that R can read, and your pictures in <b>Files</b>; you can run a diagram or a circuit and keep its results; and the essays you write in <b>Exam practice</b> can be downloaded as Word documents. This short practical takes you round each of the tools, so that you know your way around before you use them in the practicals of the course.</p>

<h2 id="s-how">How this page works</h2>
<ul>
<li>The instructions are on the left and the workbench is on the right. Use the tabs along the top of the workbench to move between the tools. You can drag the divider between the two halves, and the button at the top left hides the instructions so that the workbench fills the window.</li>
<li>Each activity is a list of steps. When you complete a step, it is ticked automatically and marked <span class="auto-tag">✓ spotted</span>, but you can also tick steps yourself. Buttons such as {scope("liver", "show me")} do things for you: they open a slide, a diagram or a paper, or choose a tool.</li>
<li>Type your answers to the questions in the boxes. Some questions check your answer (a number, for example) as soon as you press <b>Check</b>; others show a model answer when you click <b>Show answer</b>.</li>
<li>Your answers, essays and files are saved in this web browser, on this computer. To keep a copy, use <b>My answers</b> to download your answers and <b>My files</b> to download all your files as a .zip file. Some lab computers clear the browser’s storage when you log out, so download your work before you leave.</li>
<li>The slides, the molecules and R itself are downloaded as you use them: looking at a slide downloads a few megabytes, and R is about 30 MB, the first time you open RStudio.</li>
</ul>
{callout("info", "Where things are saved", "<p>Look in the <b>Files</b> tab for what the tools save: <code>microscope/</code> holds your measurements (<code>measurements.csv</code>), counts (<code>counts.csv</code>) and pictures; <code>diagrams/</code> and <code>circuits/</code> hold the diagrams and circuits you save; and <code>essays/</code> holds your answers to exam practice.</p>")}
{activity("Find your way around", [
    task("s-scope", f'Open the <b>Microscope</b> tab {bench("scope", "show me")}. The slide box on its left lists the slides, sorted by the system of the body they come from.', auto="app:bench name=scope", check="bench:scope"),
    task("s-slide", 'Click on any slide in the slide box to open it.', auto="scope:open"),
    task("s-files", f'Have a look at the <b>Files</b> tab {bench("editor", "show me")}, where you will find the folders for your microscope work, diagrams, circuits and essays.', auto="app:bench name=editor"),
])}
'''
    return chapter("start", "0", "Start here", "scope", "The BMS workbench", 10, "A virtual microscope, flow diagrams and circuits that you can run, exam practice, molecules in 3D and R for your data – the tools of your practicals, in one web page.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_microscope():
    body = f'''
<p>Its objectives work as they do in digital microscopy: at 20× you see a slide at the full resolution of its scan, and 10× shows it half as big, 40× twice as big. The slides are sections of human tissues (normal, apart from one coronary artery with atherosclerosis), stained with haematoxylin and eosin (H&amp;E) and scanned at high resolution, so you can look at a whole section at low power and then zoom in on single cells. Haematoxylin stains nuclei blue-purple and eosin stains cytoplasm and collagen pink.</p>

<h2 id="m-box">From low power to high power</h2>
<p>Always start with a low-power objective, which shows you the whole section, so that you can see how the tissue is organised and choose where to look. Then move up through the objectives. The readout at the bottom right of the view shows the magnification and the size of the field of view, and the map at the top right shows which part of the slide you are looking at.</p>
{activity("Look at the kidney", [
    task("m-open", f'Open the slide of the kidney {scope("kidney-cortex", "show me")}. You are looking at the outer part of the kidney, the cortex.', auto="scope:open slide=kidney-cortex", check="slide:kidney-cortex"),
    task("m-about", 'Click on the name of the slide, above the view, to read about it: how it was stained, how big it is, what to look for, and where it comes from.', auto="scope:panel name=about"),
    task("m-10", 'Click the <b>10×</b> objective (or press <kbd>4</kbd>, as the objectives are numbered 1 to 6). Drag the slide to move round it, and scroll (or pinch) to zoom in and out.', auto="scope:mag slide=kidney-cortex mag=10"),
    task("m-40", 'Now look at part of the slide with the <b>40×</b> objective (<kbd>6</kbd>).', auto="scope:mag slide=kidney-cortex mag=40"),
])}
{callout("concept", "Magnification, resolution and the field of view", "<p>Through a real microscope, the total magnification is that of the objective multiplied by that of the eyepiece (usually 10×): a 40× objective gives 400×. As the magnification goes up, the field of view gets smaller: at 40× you see a quarter of the width of the field at 10×. (On a screen, how much you see also depends on the size of your window.) What limits the detail you can see is the <em>resolution</em>, the smallest distance between two points that can still be told apart. These slides were scanned with a 20× objective, about 0.5 µm per pixel, so the 40× objective makes the picture bigger without showing more detail. A real microscope with a good 40× objective resolves finer detail than that.</p>")}
{mcq("m-q-low", "Why do histologists look at a slide at low power before they use a high-power objective?", [
    ("To see how the tissue is organised, and to choose where to look in detail", True, "Yes. At high power you only see a small part of the section, so you need to know where you are and what is around it."),
    ("Because the light of a high-power objective fades the stain", False, "No. The reason is about what you can see: a high-power objective shows only a small part of the section."),
    ("Because cells can only be seen at low power", False, "No. Cells are seen in detail at high power; at low power you see how they are arranged into a tissue."),
])}
{q("m-q-field", "At 10×, read the width of the field of view in the readout at the bottom right of the view. Change to 40×. How does the width of the field change, and why?", "At 40× the field of view is a quarter as wide as at 10× (and covers a sixteenth of the area), because the magnification is four times as great: the same window shows a smaller part of the slide. (The width depends on the size of your window: about 600 µm at 10× in a typical window, and about 150 µm at 40×.)")}

<h2 id="m-find">Finding things</h2>
<p>In the practicals, you will often be asked to find a structure on a slide and click on it. The microscope checks your click against the examples marked on the slide, and if you are stuck, <b>Show me</b> takes you to one.</p>
{activity("Find a renal corpuscle, and look at the tubules", [
    task("m-glom", f'{scopefind("kidney-cortex:glomerulus", "Find a renal corpuscle")}. A renal corpuscle is a round knot of capillaries, the glomerulus, inside a thin capsule. This is where the blood is filtered. Look at 4× or 10×.', auto="scope:find slide=kidney-cortex target=glomerulus ok=true"),
    task("m-labels", f'Show the slide’s labels {scopetool("labels", "show me")} (the tag button in the toolbar). The <b>Labels</b> panel lists them: click <i>Proximal convoluted tubule</i> to go to one, and look at it at 20× or 40×. Most of the tubules of the cortex are proximal convoluted tubules: their cells are the pinkest, with a fuzzy brush border lining the lumen (which often looks lacy in this slide). Compare them with the smaller tubules that have clear lumens and more nuclei.', auto="scope:labels on=true"),
])}

<h2 id="m-lab">Your own labels and pictures</h2>
{activity("Label it and keep a picture", [
    task("m-mylabel", f'Choose the <b>Label</b> tool {scopetool("label", "show me")} and click on something you can recognise. Type a name for it.', auto="scope:label"),
    task("m-picture", f'Take a picture of the view with the camera button {scopetool("capture", "show me")}. The picture includes a scale bar and the slide’s credit, and it is saved in your files, in <code>microscope/pictures</code>.', auto="scope:capture"),
    task("m-files", f'Find your picture in the <b>Files</b> tab {bench("editor", "show me")} and click on it to see it.', auto="editor:view path~/microscope/pictures/"),
])}
{callout("tip", "Using the pictures", "<p>To put a picture into a report, download it from Files (the download button above the picture), or use <b>⋯ → Take a picture and download it</b> in the microscope. The credit at the bottom of the picture says where the slide comes from: keep it when you use the picture.</p>")}

<h2 id="m-liver">Another tissue: the liver</h2>
{activity("Look at the liver", [
    task("m-liver", f'Open the slide of the liver {scope("liver", "show me")}, and look at it at 1× and then at 4×.', auto="scope:open slide=liver", check="slide:liver"),
    task("m-cv", f'{scopefind("liver:central-vein", "Find a central vein")}: a thin-walled vein, with plates of liver cells running out from it like the spokes of a wheel.', auto="scope:find slide=liver target=central-vein ok=true"),
    task("m-pt", f'{scopefind("liver:portal-tract", "Find a portal tract")}: a patch of connective tissue holding a branch of the portal vein, a small artery (hard to see on this slide) and one or more bile ducts.', auto="scope:find slide=liver target=portal-tract ok=true"),
])}
{q("m-q-cv", "How could you tell a central vein from a portal tract at low power?", "A central vein is a single thin-walled vessel with liver cells right up to its wall, and the plates of liver cells run out from it like spokes. A portal tract is a patch of pink connective tissue that holds several tubes: a branch of the portal vein, a small artery and one or more bile ducts.")}
'''
    return chapter("microscope", "1", "The microscope", "scope", "Looking at a slide", 25, "The Microscope tab works like a light microscope: a slide box, objectives from 1× to 40× and a stage you move by dragging. In this chapter you look at the kidney and the liver, find structures, label them and keep pictures.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_measuring():
    body = f'''
<p>A lot of laboratory work is measurement: how big a cell is, or how many cells there are in a millilitre. In this chapter you calibrate an eyepiece graticule with a stage micrometer, measure with the microscope’s tools, work out sizes from magnifications and scale bars, and count cells with a haemocytometer.</p>

<h2 id="n-cal">Calibrating an eyepiece graticule</h2>
<p>The eyepiece of a microscope can hold a <em>graticule</em>, a glass disc with a scale on it (here, 100 divisions). The graticule is in the eyepiece, not on the slide, so the length on the slide that one division covers depends on the objective. To use it for measuring, you calibrate it against a <em>stage micrometer</em>: a slide with a scale of known length, here 1 mm divided into 100 divisions of 10 µm.</p>
{activity("Calibrate the graticule", [
    task("n-sm", f'Open the stage micrometer {scope("stage-micrometer@0.75,0.304,10x", "show me")} at 10×.', auto="scope:open slide=stage-micrometer", check="slide:stage-micrometer"),
    task("n-eye", f'Switch on the eyepiece view {scopetool("eyepiece:on", "show me")} (the eyepiece button in the toolbar). You now see a round field of view, with the graticule across its middle.', auto="scope:eyepiece on=true"),
    task("n-line", 'The graticule’s divisions (blue) hang down from its line, and the micrometer’s divisions (black) stand up from theirs. Drag the slide sideways so that the 0 of the graticule lines up with a long line of the micrometer. Then look along the two scales for the point, as far along as you can, where a line of the graticule lines up exactly with a line of the micrometer.'),
])}
{q("n-q-10", "At 10×, how many micrometres does one division of the graticule cover?", "4 µm. The whole graticule, 100 divisions, lines up with 40 divisions of the micrometer, which is 40 × 10 µm = 400 µm, so one division covers 400 µm ÷ 100 = 4 µm.", accept="num:4±0.2", hint="Count the micrometer divisions that match the 100 divisions of the graticule; each micrometer division is 10 µm.", placeholder="µm per division")}
{activity("Calibrate the other objectives", [
    task("n-40", 'Change to the 40× objective (<kbd>6</kbd>) and line up the scales again.', auto="scope:mag slide=stage-micrometer mag=40"),
])}
{q("n-q-40", "At 40×, how many micrometres does one division of the graticule cover?", "1 µm. The 100 divisions of the graticule now match 10 divisions of the micrometer (100 µm), so one division covers 1 µm: a quarter of what it covered at 10×, because the magnification is four times as great.", accept="num:1±0.1", placeholder="µm per division")}
{callout("concept", "One calibration for each objective", "<p>What one division of the graticule covers is inversely proportional to the magnification: 4 µm at 10× means 10 µm at 4× and 1 µm at 40×. To measure something, count the divisions across it and multiply by the calibration for that objective.</p>")}

<h2 id="n-tools">Measuring with the microscope’s tools</h2>
<p>The microscope also has tools that measure for you, using the scale that each slide was scanned at. The <b>Measure</b> tool (the ruler) measures a length, and the <b>Area</b> tool (the outline) measures the area inside an outline you draw. Every measurement is listed in the <b>Measurements</b> panel, and kept in the file <code>microscope/measurements.csv</code>, which R can read.</p>
{activity("Measure renal corpuscles", [
    task("n-kidney", f'Go back to the kidney {scope("kidney-cortex@1.4,2.95,10x", "show me")}, at 10×, and switch the eyepiece view off {scopetool("eyepiece:off", "show me")}.', auto="scope:open slide=kidney-cortex", check="slide:kidney-cortex"),
    task("n-measure", f'Choose the <b>Measure</b> tool {scopetool("measure:renal corpuscle", "show me")}. This button also labels the measurements that follow as “renal corpuscle”, as you can see in the Measurements panel. Measure the diameter of five renal corpuscles: drag across each one at its widest, from the outside of its capsule to the other side.', auto="scope:measure slide=kidney-cortex n>4"),
])}
{q("n-q-mean", "The Measurements panel shows the mean and standard deviation of your lengths. What is the mean diameter of your renal corpuscles, in micrometres?", "Usually between 100 and 200 µm. Renal corpuscles are about 200 µm across in life, but a section cuts most of them away from their widest part, and the tissue shrinks a little as it is processed, so the diameters you measure are smaller and vary.", accept="num:60..300", placeholder="µm")}
{q("n-q-sphere", "The renal corpuscles in the section are not all the same size. Give two reasons why.", "First, they really do vary in size. Second, a section is a thin slice through the tissue: it cuts through each corpuscle at a different level, and only a slice through the middle shows the full diameter; most slices are nearer the edge and show a smaller circle. (This is why a mean from sections underestimates the true size of round structures.)")}

<h2 id="n-mag">Magnification and scale bars</h2>
<p>The magnification of a picture is how much bigger it is than the real thing:</p>
{eq("magnification = size in the picture ÷ real size &nbsp;&nbsp;so&nbsp;&nbsp; real size = size in the picture ÷ magnification")}
<p>Both sizes have to be in the same units: 1 mm = 1000 µm. A picture that carries a scale bar is safer than a magnification, because the scale bar grows or shrinks with the picture when it is printed or shown at a different size. (The pictures you take with the microscope carry a scale bar.) The calculator {calc("open it")} is the same as the one in Exam practice.</p>
{q("n-q-mag", "In a printed micrograph, a scale bar labelled 50 µm is 20 mm long. What is the magnification of the print?", "×400. The scale bar is 20 mm = 20 000 µm long in the print and stands for 50 µm, so the magnification is 20 000 µm ÷ 50 µm = 400.", accept="num:400±2", placeholder="e.g. 250")}
{q("n-q-real", "In the same print, a cell is 9 mm wide. How wide is the real cell, in micrometres?", "22.5 µm. 9 mm = 9000 µm in the print, and 9000 µm ÷ 400 = 22.5 µm.", accept="num:22.5±0.5", placeholder="µm")}

<h2 id="n-haemo">Counting cells: the haemocytometer</h2>
<p>A haemocytometer is a thick glass slide with a counting chamber of known depth, 0.1 mm, and a grid ruled on its floor. In the commonest kind (the improved Neubauer), the grid has nine large squares, each 1 mm × 1 mm, so the volume above one large square is 1 mm × 1 mm × 0.1 mm = 0.1 mm³ = 0.1 µL = 10<sup>−4</sup> mL. You count the cells in several large squares, and work out how many cells there are in a millilitre:</p>
{eq("cells per mL = mean number of cells in a large square × 10<sup>4</sup> × dilution factor")}
<p>Before counting, the cells are often mixed with trypan blue. Living cells keep the dye out and look clear; dead cells take it up and look blue. To avoid counting a cell twice, count the cells that touch the top or the left-hand line of a square, but not those that touch the bottom or the right-hand line.</p>
{activity("Count the cells", [
    task("n-haemo", f'Open the haemocytometer {scope("haemocytometer@0.7,0.7,4x", "show me")}. This slide is a drawing, made for practising counts. Find the large square at the top left, which is divided into 16 smaller squares, and look at it at 10×.', auto="scope:open slide=haemocytometer", check="slide:haemocytometer"),
    task("n-count", f'Choose the <b>Count</b> tool {scopetool("count:Living cells,Dead cells", "show me")}. This button also names the two categories in the Counts panel: choose a category there, then click on each cell to count it (click a mark again to remove it). Count the living and the dead cells in the top-left large square, going along the rows of small squares so that you don’t miss any.', auto="scope:count slide=haemocytometer total>19"),
])}
{q("n-q-count", "How many <b>living</b> cells did you count in the top-left large square?", "60 living cells (and 8 dead ones). If your count is a cell or two out, look again at the cells that touch the lines of the square.", accept="num:57..63", placeholder="living cells")}
{q("n-q-conc", "The four large corner squares held 229 living cells altogether (60 in the top-left square, and 64, 60 and 45 in the other three). The cells had been mixed 1:1 with trypan blue (a dilution factor of 2). How many living cells were there in a millilitre of the original suspension?", "1.145 × 10<sup>6</sup> living cells per mL. The mean is 229 ÷ 4 = 57.25 cells per large square. Each large square holds 10<sup>−4</sup> mL, so the suspension in the chamber held 57.25 × 10<sup>4</sup> = 5.725 × 10<sup>5</sup> cells per mL; it had been diluted twofold with trypan blue, so the original suspension held 1.145 × 10<sup>6</sup> cells per mL (about 1.1 × 10<sup>6</sup>).", accept="num:1.145e6±4%", hint="Find the mean per large square first; then multiply by 10⁴ and by the dilution factor.", placeholder="cells per mL, e.g. 2.5e6 or 2.5×10^6")}
{q("n-q-viab", "The same four squares held 26 dead cells. What percentage of the cells were alive (the <em>viability</em> of the cells)?", "89.8%. The four squares held 229 + 26 = 255 cells, of which 229 were alive: 229 ÷ 255 × 100 = 89.8%.", accept="num:89.8±0.3", placeholder="%")}
{callout("tip", "Your counts in R", "<p>The marks you make with the Count tool are kept in <code>microscope/counts.csv</code>, with the slide, the category and where each mark is. In the last chapter you read your measurements and counts in R, and do this calculation there too.</p>")}
'''
    return chapter("measuring", "2", "Measuring and counting", "scope", "Measuring and counting", 30, "How big is it, and how many are there? Calibrate an eyepiece graticule, measure with the microscope’s tools, work with magnifications and scale bars, and count cells with a haemocytometer.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_diagrams():
    body = f'''
<p>Physiology is full of flow diagrams: boxes for quantities, such as a concentration or a temperature, and arrows that show what increases (+) or decreases (−) what. In the <b>Diagrams</b> tab you can draw them, and you can also <em>run</em> them. The workbench turns the diagram into a simple model, in which each quantity moves towards what its arrows tell it, and plots how each quantity changes with time. Running a diagram is a good way to check that it does what you think it does.</p>
{callout("info", "Kinds of box", "<p>A <b>quantity</b> (a rounded box) is something that changes, such as a level or a rate. A <b>stimulus</b> (a flag) pushes on the system from outside: switched on and left on, a pulse, a ramp or a wave. A <b>set point</b> is a fixed level, and a <b>comparator</b> (Σ) adds up its inputs: a + arrow adds and a − arrow subtracts. A green <b>+</b> arrow stimulates, a red <b>−</b> arrow (with a bar at its end) inhibits, and each arrow has a <em>strength</em> and can have a <em>delay</em>.</p>")}

<h2 id="f-run">Run an example</h2>
<p>This example is a loop in which a regulated variable is measured, compared with its set point, and corrected by an effector – but the signal from the sensor arrives two minutes late.</p>
{activity("A loop with a delay", [
    task("f-open", f'Open the example {flow("example:delay-oscillation", "show me")}. You can also find it in the tab’s <b>Examples</b> menu.', auto="flow:open example=delay-oscillation"),
    task("f-run", f'Press <b>Run</b> {flowrun("show me")}. The graphs under the diagram show each quantity over the run, and you can drag the slider to see the diagram at any moment. The regulated variable overshoots, and swings up and down, less and less.', auto="flow:run name~delay"),
    task("f-short", 'Click the arrow labelled <i>sensor</i>. Its settings are in the panel on the right: change its <b>Delay</b> to 0.5 min, and press <b>Run</b> again.', auto="flow:run name~delay settled=true"),
    task("f-long", 'Now make the delay 4 min, and run it again.', auto="flow:run name~delay oscillation=growing"),
])}
{q("f-q-delay", "What happens to the swings when the delay is short, and when it is long? Why does a delay in a loop like this make it swing?", "With a short delay the variable settles quickly, with little or no overshoot; with a long delay the swings get bigger and bigger. The effector corrects for the error that the sensor reported, but with a delay that report is out of date: the effector keeps pushing after the error has gone, and overshoots, and then over-corrects the other way. The longer the delay (or the stronger the correction), the bigger each overshoot.")}

<h2 id="f-draw">Draw your own</h2>
{activity("Build a small loop", [
    task("f-new", f'Start a blank diagram {flow("example:blank", "show me")}, click its name at the top, and call it <i>My loop</i>.', auto="flow:open example=blank"),
    task("f-boxes", 'Add a stimulus with <b>Box</b> ▸ <i>A stimulus or disturbance</i>, and two quantities by double-clicking on empty parts of the diagram. Double-click each box to name it: <i>Push</i> (the stimulus), <i>Level</i> and <i>Response</i>.', auto="flow:node role=stimulus"),
    task("f-plus", 'Draw a + arrow from <i>Push</i> to <i>Level</i>: drag from one of the dots on the edge of <i>Push</i> to <i>Level</i>. Draw another + arrow from <i>Level</i> to <i>Response</i>.', auto="flow:edge sign=+"),
    task("f-minus", 'Choose <b>−</b> in the toolbar and draw an arrow from <i>Response</i> back to <i>Level</i>, which closes the loop.', auto="flow:edge sign=-"),
    task("f-run2", 'Run your diagram, and look at the level of <i>Level</i> at the end (the <b>Numbers</b> under the diagram).', auto="flow:run name~my loop"),
    task("f-block", 'Right-click the − arrow and block it, and run the diagram again.', auto="flow:run name~my loop blocked>0"),
    task("f-save", 'Save the diagram (<b>Save</b>, in your <code>diagrams</code> folder), and keep the results of the run as a table for R (<b>Results to my files</b>).', auto="flow:export format=csv", check="exists:diagrams/my-loop.flow.json"),
])}
{q("f-q-loop", "How did blocking the − arrow change what happened to <i>Level</i>, and why?", "Without the loop, <i>Level</i> rose by the whole size of the push (from 1 to 2, with the settings a new box starts with). With the loop it rose only half as far (to 1.5), because <i>Response</i> rose with it and pushed it back down: the − arrow opposes the change.")}
{callout("tip", "Diagrams in your work", "<p>The <b>Export</b> menu saves a diagram as a picture (PNG or SVG) for a report, and the results of a run as a CSV table that you can plot in RStudio. A diagram saved in your files opens again in this tab when you click on it in Files.</p>")}
'''
    return chapter("diagrams", "3", "Diagrams", "flow", "Flow diagrams that run", 15, "Draw the boxes-and-arrows diagrams of physiology, and run them to see how the quantities in them change with time.", body)


def ch_circuits():
    body = f'''
<p>The <b>Circuits</b> tab is an electronics bench: batteries, resistors, capacitors, switches and meters, joined by wires, and a simulator that works out the voltage at every point and the current through every part as time passes. In its <b>Physiology</b> mode the same circuits become models of the body: pressure for voltage, flow for current, resistance to flow for resistance, and compliance for capacitance.</p>

<h2 id="c-ohm">Ohm’s law</h2>
<p>The current through a resistor is proportional to the voltage across it: <i>I</i> = <i>V</i> / <i>R</i>.</p>
{activity("Check Ohm’s law", [
    task("c-open", f'Open the example {circuit("example:ohms-law", "show me")}: a 9 V battery, a 1 kΩ resistor, an ammeter in series and a voltmeter in parallel with the resistor.', auto="circuit:open example=ohms-law"),
    task("c-run", f'Press <b>Run</b> {circuitrun("show me")}. The moving dots show the current, and the meters show their readings.', auto="circuit:run"),
])}
{q("c-q-9", "What current does the ammeter show, in milliamps (mA)?", "9 mA: <i>I</i> = <i>V</i> / <i>R</i> = 9 V / 1000 Ω = 0.009 A.", accept="num:9±0.05", placeholder="mA")}
{activity("Change the resistance", [
    task("c-r", 'Click the resistor and change its resistance to <code>2.2k</code> (2.2 kΩ) in the panel on the right.', auto="circuit:edit"),
])}
{q("c-q-22", "What current flows through a 2.2 kΩ resistor, in mA?", "4.09 mA: 9 V / 2200 Ω = 0.00409 A. Doubling the resistance (roughly) halves the current.", accept="num:4.09±0.03", placeholder="mA")}

<h2 id="c-rc">Charging a capacitor</h2>
<p>A capacitor stores charge. Charged through a resistor, it charges quickly at first and then more and more slowly: after one <em>time constant</em>, τ = <i>RC</i>, it has reached 63% of its final voltage.</p>
{activity("Watch a capacitor charge", [
    task("c-rc", f'Open the example {circuit("example:rc-circuit", "show me")} and press <b>Run</b>.', auto="circuit:open example=rc-circuit"),
    task("c-close", 'Click the switch labelled <b>Charge</b> to close it, and watch the trace of the capacitor’s voltage under the circuit. Then open it again, and close <b>Discharge</b>.', auto="circuit:switch on=true"),
])}
{q("c-q-tau", "With R1 = 10 kΩ and C1 = 100 µF, how long does the capacitor take to charge to 63% of the battery’s 5 V (3.16 V), in seconds?", "1 s: τ = <i>RC</i> = 10 000 Ω × 0.0001 F = 1 s. After 2τ it has reached 86%, and after 3τ 95%.", accept="num:1±0.15", placeholder="s")}
{mcq("c-q-double", "What happens to the time constant if you double the resistance?", [
    ("It doubles", True, "Yes. τ = RC, so a bigger resistance (which lets less current through) means the capacitor takes longer to charge."),
    ("It halves", False, "No: a bigger resistance lets less current through, so the capacitor charges more slowly. τ = RC."),
    ("It stays the same", False, "No: τ = RC depends on both the resistance and the capacitance."),
])}

<h2 id="c-phys">Circuits as models of the body</h2>
{activity("Physiology mode", [
    task("c-mode", 'Switch the tab to <b>Physiology</b> (at the top). The parts are now called pressure sources, resistances to flow, compliances and valves, and the meters read pressure (mmHg) and flow (mL/s).', auto="circuit:mode mode=physiology"),
    task("c-wk", f'Open the Windkessel model of the circulation {circuit("example:windkessel", "show me")} and run it. The heart pumps blood in pulses, but the elastic arteries (a compliance) smooth them into a pressure that never falls to zero.', auto="circuit:open example=windkessel"),
    task("c-save", 'Save the circuit in your files (<b>Save</b>, in your <code>circuits</code> folder).', auto="circuit:save"),
])}
'''
    return chapter("circuits", "4", "Circuits", "circuit", "Circuits on the bench", 15, "Build electrical circuits and run them, and use the same circuits as models of the body.", body)


def ch_exam():
    body = f'''
<p>Your exams are written on a computer, in an online exam system (Inspera). The <b>Exam practice</b> tab works in the same way, so that you can get used to planning, writing and checking an essay in a browser – with a timer and a word limit – before it matters. Your practicals will set essays here too.</p>
{callout("info", "What is the same, and what isn’t", "<p>The layout, the timer, the editor and its toolbar, flags, the calculator and the submission page work as they do in the exam system. But this is practice: your answers are saved only in this browser, nobody marks them, and after you submit you can review them alongside the marking guidance and download them as a Word document.</p>")}

<h2 id="e-paper">A short practice paper</h2>
{activity("Take the paper", [
    task("e-open", f'Open the paper <i>Getting to know exam practice</i> {exam("tour", "show me")} and read its first page.', auto="exam:open paper=tour"),
    task("e-start", 'Press <b>Start</b>. The time left is shown at the top left, under your candidate number.', auto="exam:start paper=tour"),
    task("e-write", 'Go to question 1 with the arrow at the bottom right (or the tile <b>1</b>). It asks you to look at a slide: the buttons at the top of the page open it in the Microscope tab, and the <b>Exam practice</b> tab brings you back. Write at least 60 words, and watch the word count under the box.', auto="exam:words paper=tour words>59"),
    task("e-format", 'Try the toolbar: make a word bold, start a bulleted list, and insert a special character such as µ or → (the <b>Ω</b> button).', auto="exam:format cmd=special"),
    task("e-flag", 'Flag a question that you want to come back to (the bookmark at the top right of the question). Its tile at the bottom shows the flag.', auto="exam:flag on=true"),
    task("e-calc", 'Answer the calculation, using the calculator (at the top of the page).', auto="calc:result"),
    task("e-submit", 'Go to the submission page (the ✓ tile at the bottom right, or ☰ ▸ <i>Go to submission page</i>), look at what you have and haven’t answered, and submit.', auto="exam:submit paper=tour"),
    task("e-word", 'Download your answers as a Word document.', auto="exam:download format~docx"),
])}
{q("e-q-differ", "What is one thing about writing in the browser that is different from writing by hand, and how will you allow for it in an exam?", "For example: you can edit and move text, so it is worth writing a plan (headings, or a list that you delete later) and then filling it in; the word count shows how much you have written, so you can share your time between the sections; there is no spelling checker in most exams, so leave time to read your answer through; drawings take longer than on paper, so keep them simple; and you can’t see the whole essay at once, so a clear structure (paragraphs with a point each) matters even more.")}

<h2 id="e-free">Essays of your own</h2>
<p><b>Write an essay…</b>, on the list of papers, starts an essay with any title, with a word limit and a time limit if you like {exam("free", "show me")}. Your attempts and essays are kept in your <code>essays</code> folder, and open again from there.</p>
'''
    return chapter("exam", "5", "Exam practice", "exam", "Writing answers as in the exam", 20, "Practise writing essays in the browser, as you will in the exam: a timer, a word count, the editor’s toolbar, flags, the calculator, and a Word document of your answers at the end.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_molecules():
    body = f'''
<p>The <b>3D viewer</b> shows the structures of proteins and smaller molecules: where each atom is, as worked out (mostly) by X-ray crystallography and cryo-electron microscopy, and kept in the Protein Data Bank (PDB). You can turn a molecule round, change how it is drawn and coloured, and look closely at the parts that matter, such as the site where something binds.</p>

<h2 id="v-hb">A protein: haemoglobin</h2>
{activity("Look at haemoglobin", [
    task("v-load", f'Open haemoglobin {pdb("4HHB", "show me")} (its PDB ID is 4HHB). It is drawn as a <em>cartoon</em>, which follows the backbone of each chain: the coils are α helices.', auto="viewer:loaded id~4hhb"),
    task("v-turn", 'Drag to turn the molecule round, scroll to zoom, and right-drag (or two-finger drag) to move it.'),
    task("v-chain", f'Colour each chain differently {viewer("color chain", "show me")}.', auto="viewer:color scheme=chain"),
    task("v-haem", f'Show the haem groups as spheres {viewer("show spheres HEM", "show me")}, coloured by element {viewer("color element HEM", "colour them")}. The iron atom at the centre of each haem is where oxygen binds.', auto="viewer:style type=spheres"),
])}
{q("v-q-chains", "How many protein chains does haemoglobin have, and how many haem groups?", "Four chains (two α and two β globins), each with one haem group: four haem groups, so a molecule of haemoglobin can carry four molecules of oxygen.", accept="num:4", placeholder="the number of chains")}

<h2 id="v-lib">The library</h2>
<p>The viewer has a library of proteins of physiology and of small molecules – hormones, transmitters and others – ready to open. They are kept with the workbench, so they open quickly.</p>
{activity("Open a small molecule", [
    task("v-library", 'Click <b>Library</b>, at the top left of the viewer, to see what it holds.', auto="viewer:library"),
    task("v-glucose", f'Open glucose {viewer("clear; molecule glucose; only ballstick; color cpk", "show me")} (the button clears haemoglobin away first). A small molecule is drawn with every atom: here as balls and sticks, coloured by element – grey for carbon, red for oxygen and white for hydrogen.', auto="viewer:molecule name=Glucose"),
    task("v-atp", f'Open ATP in the same way {viewer("clear; molecule atp; only ballstick; color cpk", "show me")} and find its three phosphate groups (phosphorus is orange).', auto="viewer:molecule name=ATP"),
])}
{q("v-q-draw", "Why is a protein drawn as a cartoon, while a small molecule is drawn with all its atoms?", "A protein has thousands of atoms (haemoglobin has about 4500, not counting hydrogens), so drawing them all gives a tangle in which you cannot see the fold. The cartoon follows the backbone of each chain and shows its helices and sheets. A small molecule has only a few dozen atoms, so all of them can be shown, and its chemistry is in the atoms themselves.")}
'''
    return chapter("molecules", "6", "3D molecules", "viewer", "Molecules in 3D", 10, "The structures of proteins and of the small molecules of physiology, in 3D: open them, turn them round and colour them.", body)


# ---------------------------------------------------------------------------------------------------------------------
def ch_r():
    body = f'''
<p>The microscope keeps your measurements and counts in two files in your <code>microscope</code> folder, <code>measurements.csv</code> and <code>counts.csv</code>. Each row is one measurement (or one mark of the Count tool), so they are ready for R. In this chapter you read them in <b>RStudio</b>, summarise them and plot them. You only need to run the scripts – but have a look at each line, to see what it does.</p>
{callout("info", "The first time", "<p>The first time you open RStudio, the workbench downloads R itself (about 30 MB), which can take a minute. After that, the browser keeps it.</p>")}

<h2 id="r-meas">Your measurements</h2>
{activity("Summarise your measurements", [
    task("r-csv", f'Look at your measurements in Files {edit("microscope/measurements.csv", "show me")}. Each row has the slide, what you measured (its label), the value and its unit, the objective, and where on the slide it was.', auto="editor:view path~measurements.csv||editor:open path~measurements.csv"),
    task("r-script", f'Open the microscope’s script for your measurements in RStudio {scoper("measurements", "show me")}. (In the microscope, the <b>Analyse in R</b> button of the Measurements panel does the same.)', auto="rstudio:doc name=microscope-measurements.R"),
    task("r-run", 'Put the cursor on the first line of code and press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on a Mac) to run it. Keep pressing it to run the script line by line, and watch the Console.', auto="r:input kind=rstudio line~read.csv||rstudio:source path~microscope-measurements||r:input kind=rstudio line~microscope-measurements.R"),
    task("r-plot", 'When you reach <code>boxplot(…)</code>, the box plot of your lengths appears in the <b>Plots</b> pane.', auto="rstudio:plot"),
])}
{q("r-q-sd", "R gives the mean, the standard deviation (SD) and the number of your renal corpuscle measurements. What does the standard deviation tell you?", "How spread out the measurements are around the mean: roughly, how far a typical measurement lies from the mean. About two thirds of measurements from a normal distribution lie within one SD of the mean. A large SD compared with the mean means that the diameters varied a lot (here, because the corpuscles are cut at different levels).")}

<h2 id="r-counts">Your counts</h2>
{activity("Count your counts", [
    task("r-counts", f'Open the script for your counts {scoper("counts", "show me")} and run it line by line. <code>table()</code> counts the marks of each category on each slide, and <code>prop.table()</code> turns the counts into proportions.', auto="r:input kind=rstudio line~counts.csv||rstudio:source path~microscope-counts||r:input kind=rstudio line~microscope-counts.R"),
])}

<h2 id="r-calc">Calculations in a script</h2>
<p>A calculation written as a script is easy to check, and easy to run again with new numbers. This script does the haemocytometer calculation of the last chapter.</p>
{codefile("scripts/haemocytometer.R", HAEMO_R, note="<b>Create this file</b> saves the script in your files and opens it in RStudio.")}
{activity("Run the calculation", [
    task("r-make", 'Click <b>Create this file</b> above.', auto="file:create name=haemocytometer.R"),
    task("r-source", 'Click <b>Source</b> at the top of the script, which runs the whole script, or run it line by line. Check that R gets the same answers as you did.', auto="rstudio:source path~haemocytometer||r:input kind=rstudio line~cells_per_mL||r:input kind=rstudio line~haemocytometer.R"),
    task("r-change", 'Change the counts to <code>live &lt;- c(48, 52, 50, 46)</code>, save the script (<kbd>Ctrl</kbd>+<kbd>S</kbd>) and run it again.', check=HAEMO_CHECK),
])}
{q("r-q-new", "With the new counts (48, 52, 50 and 46 living cells, and the same dead cells), how many living cells were there per mL of the original suspension?", "9.8 × 10<sup>5</sup> cells per mL: the mean is 196 ÷ 4 = 49 cells per large square, and 49 ÷ 10<sup>−4</sup> mL × 2 = 980 000 cells per mL.", accept="num:9.8e5±1%", placeholder="cells per mL")}
'''
    return chapter("r", "7", "Data in R", "rstudio", "From the microscope to R", 15, "Your measurements and counts are kept in files that R can read. Summarise and plot them in RStudio, and turn a calculation into a script.", body)


def ALL():
    return [ch_start(), ch_microscope(), ch_measuring(), ch_diagrams(), ch_circuits(), ch_exam(), ch_molecules(), ch_r()]
