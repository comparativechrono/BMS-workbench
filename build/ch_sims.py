"""The chapter on the Simulations tab: PhET's simulations of the action potential (Neuron), of absorbance (Beer's Law
Lab) and of pH (pH Scale). Its steps tick themselves from the tab's events (sim:open, sim:action, sim:change…: see the
top of assets/js/sims.js)."""
import lib
from lib import *


def eq(html):
    return f'<p class="eq">{html}</p>'


def chapter(num):
    body = f'''
<p>The <b>Simulations</b> tab holds a library of simulations made by <b>PhET Interactive Simulations</b> at the University of Colorado Boulder, chosen for biomedical science. Each one is a model of a piece of science – ions crossing a membrane, light passing through a solution, the particles of a gas – that you can change and watch. Each has its own controls, and many have several screens, which you choose from the bar at the bottom of the simulation (or from the list in the tab’s toolbar). The <b>ⓘ</b> button tells you what a simulation is for, who made it and its licence.</p>

<h2 id="sim-nerve">The action potential</h2>
<p>The Neuron simulation shows a short length of an axon, cut across, with the channels in its membrane and the sodium and potassium ions on either side.</p>
{activity("Stimulate a neuron", [
    task("sim-lib", 'Look through the library of the <b>Simulations</b> tab, and choose the topic <b>Membranes and nerves</b> to see the simulations about membranes.', auto="sim:filter topic~membranes"),
    task("sim-neuron", f'Open the Neuron simulation {sim("neuron", "show me")}. The legend on the right shows the ions and the four kinds of channel.', auto="sim:open id=neuron"),
    task("sim-stim", 'Press <b>Stimulate Neuron</b> and watch the channels and the ions. Choose <b>Slow Motion</b>, or pause and step it with the buttons under the axon, to see the order of events.', auto="sim:action id=neuron action=stimulate"),
    task("sim-chart", 'Tick <b>Potential Chart</b> (under <b>Show</b>) and stimulate the neuron again: the chart plots the membrane potential against time – the action potential.', auto="sim:action id=neuron action=chart"),
    task("sim-conc", 'Tick <b>Concentrations</b> as well, and stimulate it once more, watching the concentrations of Na⁺ and K⁺ inside and outside the axon.', auto="sim:action id=neuron action=concentrations"),
])}
{mcq("sim-q-first", "When the neuron is stimulated, which channels open first, and which way do the ions move through them?", [
    ("Voltage-gated sodium channels: Na⁺ moves into the axon", True, "Yes. Na⁺ is more concentrated outside, and the inside is negative, so it flows in when its channels open, and the membrane depolarises."),
    ("Voltage-gated potassium channels: K⁺ moves out of the axon", False, "The potassium channels open too, but later and more slowly: they bring the potential back down after the peak."),
    ("Voltage-gated sodium channels: Na⁺ moves out of the axon", False, "Na⁺ is more concentrated outside the axon, and the inside is negative: when its channels open it moves in."),
    ("The leak channels: both ions move at once", False, "The leak channels are open all the time and set the resting potential; the action potential comes from the gated channels."),
], model="The voltage-gated sodium channels open first, and Na⁺ moves into the axon: the rising phase of the action potential. Then the sodium channels close (they inactivate) and the voltage-gated potassium channels open, K⁺ moves out, and the potential falls again – briefly below the resting potential, until the potassium channels close.")}
{q("sim-q-conc", "Did the concentrations of Na⁺ and K⁺ inside the axon change much during an action potential? What does that tell you?", "Hardly at all. Only a tiny fraction of the ions cross the membrane in one action potential: enough to change the charge on the membrane, which (like a capacitor) needs little charge to change its voltage, but far too few to change the concentrations. That is why a neuron can fire many action potentials before the Na⁺/K⁺ pump has to restore the gradients.")}

<h2 id="sim-beer-law">Absorbance and concentration</h2>
<p>A spectrophotometer measures how much light of one wavelength a solution absorbs. The <b>Beer–Lambert law</b> says that the absorbance, <i>A</i>, is proportional to the concentration, <i>c</i>, and to the distance the light travels through the solution, the path length, <i>l</i>:</p>
{eq("<i>A</i> = <i>ε</i> <i>c</i> <i>l</i>")}
<p>where <i>ε</i>, the molar absorptivity (or extinction coefficient), depends on the substance and on the wavelength. It is why a standard curve of absorbance against concentration is a straight line, and why cuvettes have a standard width of 1 cm.</p>
{activity("Measure absorbance", [
    task("sim-beer", f'Open Beer’s Law Lab on its <b>Beer’s Law</b> screen {sim("beers-law-lab:2", "show me")}.', auto="sim:open id=beers-law-lab screen=2||sim:screen id=beers-law-lab screen=2"),
    task("sim-detect", 'Switch the light on (the red button), choose <b>Absorbance</b> on the detector, and drag the detector’s probe into the beam behind the cuvette.', auto="sim:action id=beers-law-lab action=detector"),
    task("sim-bconc", 'Change the concentration of the drink mix with its slider, and watch the absorbance: double the concentration, and the absorbance doubles.', auto="sim:change id=beers-law-lab what=concentration"),
    task("sim-path", 'Change the path length: drag the yellow arrows on the side of the cuvette to make it wider or narrower, and measure it with the ruler.', auto="sim:change id=beers-law-lab what=path"),
])}
{q("sim-q-beer", "With the drink mix at 100 mM in a 1.00 cm cuvette, the absorbance at 508 nm is 0.51. What absorbance do you expect from a 50 mM solution in a 2.00 cm cuvette? Check your answer in the simulation.", "0.51, the same: halving the concentration halves the absorbance, and doubling the path length doubles it. In <i>A</i> = <i>εcl</i>, (½<i>c</i>)(2<i>l</i>) = <i>cl</i>.", accept="num:0.51±0.02", placeholder="the absorbance")}

<h2 id="sim-ph-log">pH, a logarithmic scale</h2>
<p>The pH of a solution is minus the logarithm (to base 10) of the concentration of hydrogen ions – strictly, H₃O⁺ – in moles per litre:</p>
{eq("pH = −log<sub>10</sub> [H₃O⁺]")}
<p>so each step of one pH unit is a tenfold change in the concentration of H₃O⁺.</p>
{activity("The pH of blood", [
    task("sim-ph", f'Open pH Scale on its <b>Micro</b> screen {sim("ph-scale:2", "show me")}, which shows the concentrations of H₃O⁺ and OH⁻ as well as the pH.', auto="sim:open id=ph-scale screen=2||sim:screen id=ph-scale screen=2"),
    task("sim-blood", 'Choose <b>Blood</b> from the list of liquids at the top. Read its pH, and the concentration of H₃O⁺ on the graph on the left (the graph shows concentrations when its switch is set to <b>Concentration</b>).', auto="sim:change id=ph-scale what=solution value~blood"),
    task("sim-water", 'Add water from the tap at the top right, and watch the pH and the concentrations as the blood is diluted.', auto="sim:change id=ph-scale what=water"),
])}
{q("sim-q-h", "Blood has a pH of 7.4. What is the concentration of H₃O⁺ in blood, in nanomoles per litre?", "About 40 nmol L⁻¹: 10<sup>−7.4</sup> mol L⁻¹ = 4.0 × 10<sup>−8</sup> mol L⁻¹ = 40 nmol L⁻¹. A fall in pH of only 0.3, to 7.1, doubles it (10<sup>0.3</sup> ≈ 2).", accept="num:40±2", placeholder="nmol per litre")}
{callout("warn", "A model is not the body", "<p>In the simulation, adding water to blood moves its pH towards 7, as it would for any solution of an acid or a base. Real blood resists such changes: its buffers – bicarbonate above all, with proteins such as haemoglobin, and phosphate – take up or release H⁺, and the lungs and kidneys adjust them. A simulation shows what its model predicts, and its model is simpler than the body. Use simulations to build a picture and to test your reasoning, and keep in mind what they leave out.</p>")}
{callout("tip", "More in the library", "<p>The library also has gases and their pressures (Gas Properties), diffusion, transport across membranes, the membrane as a capacitor (Capacitor Lab: Basics), lenses and how a microscope forms an image (Geometric Optics), colour vision, concentrations of solutions (Molarity), gene expression, and fitting a straight line to data (Least-Squares Regression). Each simulation’s <b>ⓘ</b> says what it is for in biomedical science, and links to PhET’s own activities for it.</p>")}
'''
    # (lib.chapter: this module's own chapter() is the one chapters.py calls)
    return lib.chapter("simulations", num, "Simulations", "sims", "Interactive simulations", 15,
                   "Models of the science behind the body that you can change and watch: the ions of an action potential, the light a solution absorbs, and the logarithmic scale of pH.", body)
