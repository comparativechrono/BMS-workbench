"""The chapter of the Organ bath tab (assets/js/organbath.js): concentration–response curves on an isolated tissue,
a competitive antagonist, and their analysis in R. build/chapters.py calls chapter(num)."""
import lib
from lib import *


def chapter(num):
    body = f'''
<p>An <b>organ bath</b> keeps a piece of tissue alive outside the body. A length of guinea-pig ileum, say, hangs in warm physiological salt solution, bubbled with air, and is tied by a thread to a <b>force transducer</b>, which records the tension the tissue develops. Drugs added to the bath reach the tissue’s receptors, and the tension shows how strongly it responds. The <b>Organ bath</b> tab is a simulation of one: each tissue is a little different, its responses take time to develop, and there is noise – but it follows the pharmacology of real tissues.</p>

<h2 id="ob-h-setup">Setting up</h2>
{activity("Set up a tissue", [
    task("ob-tissue", f'Set up a guinea-pig ileum {bath("ileum", "set it up")}. The drawing shows the bath, and the chart on the right shows the tension against time. The small, irregular movements are the ileum’s own.', auto="bath:setup tissue=ileum"),
    task("ob-speed", f'The clock runs in real time (×1). Make it run five times faster {bathdo("speed 5", "show me")}: the ileum responds within seconds, and the faster clock saves you waiting.', auto="bath:speed"),
])}

<h2 id="ob-h-dil">Concentrations in the bath</h2>
<p>A drug is added from a <b>stock solution</b>, and the bath dilutes it. If you add a volume <i>v</i> of a stock of concentration <i>C</i><sub>stock</sub> to a bath of volume <i>V</i>, the concentration in the bath is</p>
<p class="eq"><i>C</i><sub>bath</sub> = <i>C</i><sub>stock</sub> × <i>v</i> / (<i>V</i> + <i>v</i>)</p>
<p>The tab works this out before you add the drug (under <b>Add a drug</b>). The concentrations of a curve are spaced evenly on a <b>log scale</b> – 10<sup>−8</sup>, 3 × 10<sup>−8</sup>, 10<sup>−7</sup> M and so on – because the response grows with the logarithm of the concentration over a wide range.</p>
{q("ob-q-dil", "You add 100 µL of a 10<sup>−5</sup> M stock of acetylcholine to a 10 mL bath. What is the concentration of acetylcholine in the bath, in M?", "9.9 × 10<sup>−8</sup> M: 10<sup>−5</sup> M × 0.1 mL / (10 mL + 0.1 mL) = 9.9 × 10<sup>−8</sup> M, which is close to 10<sup>−7</sup> M. (Leaving out the volume you added, 10<sup>−5</sup> × 0.1 / 10 = 10<sup>−7</sup> M, is only 1% out.)", accept="num:9.9e-8±2%", placeholder="M")}

<h2 id="ob-h-curve">A concentration–response curve</h2>
<p>Each dose is left until the response reaches its plateau, and then washed out; the tissue recovers before the next dose. The tab measures each response – the rise in tension above the baseline before the dose – when you wash, and keeps it in the <b>Results</b> under the chart.</p>
{activity("Build a curve for acetylcholine", [
    task("ob-first", f'Add acetylcholine to give 10<sup>−8</sup> M in the bath: choose <b>Acetylcholine</b>, a stock of 10<sup>−6</sup> M and 100 µL, and press <b>Add to the bath</b> {bathdo("add acetylcholine 1e-8", "show me")}.', auto="bath:add drug=acetylcholine"),
    task("ob-plat", f'Wait for the response to reach its plateau (or press <b>Plateau</b> {bathdo("plateau", "show me")}), then <b>Wash</b> {bathdo("wash", "show me")}. The response goes into the Results.', auto="bath:response drug=acetylcholine"),
    task("ob-more", 'Give the tissue a minute to recover after each wash, and go on up the scale: 3 × 10<sup>−8</sup>, 10<sup>−7</sup>, 3 × 10<sup>−7</sup>, 10<sup>−6</sup> and 3 × 10<sup>−6</sup> M, each to its plateau and then washed out. Use a stronger stock as you go, to keep the volumes small. When two doses give about the same response, you have reached the maximum.', auto="bath:response drug=acetylcholine condition=control n>4"),
])}

<h2 id="ob-h-antag">In the presence of an antagonist</h2>
<p><b>Atropine</b> is an antagonist at muscarinic receptors. To see what it does to the curve, the tissue is equilibrated with a fixed concentration of atropine, and the curve is built again. Here the atropine is put in the solution used for washing, so that its concentration stays the same after every wash.</p>
{activity("Repeat the curve in atropine", [
    task("ob-atr", f'Put atropine (10<sup>−8</sup> M) in the washing solution, and wash the bath with it {bathdo("antagonist atropine 1e-8", "show me")}.', auto="bath:antagonist drug=atropine"),
    task("ob-eq", f'Let it equilibrate with the tissue for 10 minutes: <b>Wait</b> ▸ 10 minutes {bathdo("wait 600", "show me")}, or let the clock run at ×20.', auto="bath:equilibrated drug=atropine"),
    task("ob-curve2", 'Build the curve of acetylcholine again, from 10<sup>−7</sup> M up to 10<sup>−4</sup> M. In the Results, these responses are marked <i>atropine 1e-8 M</i>.', auto="bath:response drug=acetylcholine condition~atropine n>3"),
])}
{mcq("ob-q-shift", "In atropine, the curve has moved to the right, in parallel, and it reaches the same maximum. What does that tell you about atropine?", [
    ("It is a competitive antagonist: enough acetylcholine outcompetes it for the receptors", True, "Yes. Atropine binds reversibly to the same receptors as acetylcholine, so more agonist restores the same occupancy and the same maximum: the curve shifts in parallel, by the dose ratio."),
    ("It stops the muscle from contracting, whatever the agonist", False, "No: a drug that acted beyond the receptor would lower the maximum, and no amount of agonist could restore it."),
    ("It is a partial agonist", False, "No: a partial agonist would cause a response of its own, and atropine causes none."),
    ("It inactivates the receptors irreversibly", False, "No: an irreversible antagonist removes receptors, and once the spare receptors are used up the maximum falls."),
])}
{q("ob-q-max", "What would it mean if, instead, the maximum response fell in the presence of a drug?", "That the antagonism is insurmountable: no amount of agonist restores the maximum. The drug might act beyond the receptor – a non-competitive antagonist, such as a relaxant or a Ca²⁺-channel blocker, which stops the muscle contracting whatever the agonist. Or it might inactivate the receptors irreversibly, as phenoxybenzamine does at α-adrenoceptors: with fewer receptors, once the tissue’s spare receptors (its receptor reserve) are used up, even a saturating concentration of agonist can’t produce the full response. (A partial agonist also has a lower maximum, but it causes a response of its own.)")}

<h2 id="ob-h-r">Analysing the curves in R</h2>
{activity("Fit the curves and work out the pA<sub>2</sub>", [
    task("ob-script", f'Open the script for your results in RStudio {bathr("responses", "show me")} (or press <b>Analyse in R</b> in the tab). It reads the results of your tissue (<code>~/organbath/ileum-1.csv</code> for the first ileum), which the tab keeps up to date.', auto="bath:r||rstudio:doc name~ileum"),
    task("ob-run", 'Run it a line at a time (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). It fits a Hill curve to each set of responses with <code>nls()</code> and plots them, and it works out the EC<sub>50</sub> of each curve and the <b>dose ratio</b>: how many times more acetylcholine gave the same response in atropine.', auto="rstudio:plot||rstudio:source path~organbath"),
])}
<p>For a competitive antagonist the dose ratio (DR) follows the Schild equation, DR = 1 + [B]/<i>K</i><sub>B</sub>, where [B] is the antagonist’s concentration and <i>K</i><sub>B</sub> its dissociation constant. So each dose ratio gives an estimate of the <b>pA<sub>2</sub></b> = log(DR − 1) − log[B]: the negative log of the concentration of antagonist that makes you double the agonist’s concentration. With several concentrations of antagonist, a <b>Schild plot</b> of log(DR − 1) against log[B] should be a straight line with a slope of 1, which crosses the x-axis where log[B] = −pA<sub>2</sub>. The script draws one when you have curves at two or more concentrations of atropine.</p>
{q("ob-q-pa2", "In one tissue, 10<sup>−8</sup> M atropine raised the EC<sub>50</sub> of acetylcholine from 8 × 10<sup>−8</sup> M to 8.8 × 10<sup>−7</sup> M. What is the pA<sub>2</sub> of atropine?", "9.0. The dose ratio is 8.8 × 10<sup>−7</sup> / 8 × 10<sup>−8</sup> = 11, so pA<sub>2</sub> = log(11 − 1) − log(10<sup>−8</sup>) = 1 + 8 = 9.0. In other words, 10<sup>−9</sup> M (1 nM) atropine doubles the concentration of acetylcholine needed for the same response.", accept="num:9±0.05", placeholder="pA2")}

<div class="optional">
<h2 id="ob-h-more">If you have time</h2>
<p>Try the other drugs of the ileum. Is the response to <b>histamine</b> blocked by atropine, or by mepyramine? What do <b>drugs X and Y</b> do, and where? (Each tissue has its own; <b>About</b>, ⓘ, tells you when you have decided.) Or set up a ring of <b>rat aorta</b> {bath("aorta", "show me")}: contract it with phenylephrine (10<sup>−6</sup> M), and then add acetylcholine, which relaxes it through nitric oxide made by the endothelium. Then try a ring whose endothelium has been rubbed off {bath("aorta?endothelium=off", "show me")} – the experiment with which Furchgott and Zawadzki discovered, in 1980, that the endothelium makes a relaxing factor (nitric oxide).</p>
</div>
'''
    return lib.chapter("organbath", num, "The organ bath", "bath", "Drugs on an isolated tissue", 25,
                   "Add drugs to a piece of guinea-pig ileum in an organ bath, build concentration–response curves, see what a competitive antagonist does to them, and analyse them in R.",
                   body)
