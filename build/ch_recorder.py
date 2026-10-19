"""The chapter of the Recorder tab: real recordings of people, played back and measured as on a chart recorder."""
import lib
from lib import *


def chapter(num):
    body = f'''
<p>In a physiology practical, a <em>chart recorder</em> (on a computer, with an amplifier and a data-acquisition unit) records signals from the body – the ECG, the pulse, breathing, blood pressure, muscle – as traces against time. The <b>Recorder</b> tab works the same way, with real recordings of people from <a href="https://physionet.org" target="_blank" rel="noopener">PhysioNet</a>, a collection of open databases of physiological signals. Each recording's <b>About</b> panel (click its name above the trace) says what it shows, who it comes from and how to cite it.</p>
<p>The traces of a recording are its <em>channels</em>, one above the other, all on the same time axis. You move along a recording by dragging the trace (or with the strip at the bottom, which shows the whole recording), and zoom with the <b>−</b> and <b>+</b> buttons, or the menu of the time across the screen between them.</p>

<h2 id="rec-ecg">Measuring the ECG</h2>
<p>Each heartbeat shows in the ECG as a P wave (the atria depolarising), a QRS complex (the ventricles depolarising) and a T wave (the ventricles repolarising). The time from one R wave to the next, the <em>R–R interval</em>, gives the heart rate: <b>heart rate (beats per minute) = 60 ÷ R–R interval (s)</b>. The <b>Calipers</b> measure the time between two cursors and work out this rate for you.</p>
{activity("Measure a heart rate", [
    task("rec-open", f'Open the recording of sinus rhythm {rec("ecg-normal", "show me")}. The upper channel is close to lead II, and the letters above the beats are the labels cardiologists gave them (N: a normal beat).', auto="rec:open id=ecg-normal"),
    task("rec-zoom", f'Zoom in until about 2 seconds fit across the screen {rec("ecg-normal@2,4", "show me")}. Find the P wave, the QRS complex and the T wave of a beat. At this scale the ECG is drawn on ECG paper: a small square is 0.04 s across and 0.1 mV high.', auto="rec:view id=ecg-normal span<3"),
    task("rec-calipers", f'Choose the <b>Calipers</b> {rectool("calipers", "show me")} and drag from the peak of one R wave to the peak of the next. The bar above the trace shows the time between the cursors (Δt) and the rate it corresponds to. (You can drag the cursors’ flags, A and B, to put them exactly on the peaks.)', auto="rec:measure id=ecg-normal dt>0.5 dt<1.2"),
    task("rec-pad", f'Add the measurement to the <b>data pad</b> with the button at the right of the bar (or press <kbd>Enter</kbd>). Measure two more R–R intervals and add them too {rectool("datapad", "show the data pad")}.', auto="rec:datapad id=ecg-normal n>2"),
    task("rec-pr", 'Zoom in further (about 1 s across the screen) and measure the <b>PR interval</b>, from the start of the P wave to the start of the QRS, and the <b>QT interval</b>, from the start of the QRS to the end of the T wave. Add both to the data pad, and type a note beside each in the data pad (PR, QT).', auto="rec:measure id=ecg-normal dt<0.3"),
])}
{q("rec-q-rate", "An ECG has an R–R interval of 0.80 s. What is the heart rate, in beats per minute?", "75 beats per minute: 60 ÷ 0.80 s = 75. (A normal PR interval is 0.12–0.20 s, mostly the delay in the atrioventricular node; the QT interval is about 0.35–0.45 s, and shortens as the heart rate rises.)", accept="num:75±1", placeholder="beats per minute")}

<h2 id="rec-arr">When the rhythm changes</h2>
<p>The strip at the top of the chart names the rhythm, as the cardiologists who labelled these recordings did. Compare two arrhythmias with sinus rhythm.</p>
{activity("Compare two arrhythmias", [
    task("rec-ectopic", f'Open the <b>ventricular ectopic beats</b> {rec("ecg-ectopic", "show me")}. The beats labelled V are premature ventricular contractions: they come early, their QRS is wide and oddly shaped, and no P wave comes before them.', auto="rec:open id=ecg-ectopic"),
    task("rec-pause", 'Measure the R–R interval before an ectopic beat and the one after it. The pause after an ectopic beat is longer than the normal interval: the next beat of the sinoatrial node finds the ventricles still refractory, so it is not conducted.', auto="rec:measure id=ecg-ectopic"),
    task("rec-af", f'Open the <b>atrial fibrillation</b> {rec("ecg-af", "show me")}. Compare the first 20 seconds with the stretch of sinus rhythm after the pause (the strip at the top shows where each rhythm begins).', auto="rec:open id=ecg-af"),
])}
{mcq("rec-q-af", "Which features show that the first part of this recording is atrial fibrillation?", [
    ("No P waves, a wavering baseline, and R–R intervals that vary without any pattern", True, "Yes. The atria fibrillate instead of contracting together, so there are no P waves, and impulses reach the ventricles at random intervals: the rhythm is irregularly irregular."),
    ("Early, wide QRS complexes with no P wave before them, each followed by a pause", False, "No: those are ventricular ectopic beats, as in the previous recording."),
    ("Regular P waves, only every other one followed by a QRS", False, "No: that is a 2:1 heart block (there is a recording of it in the list: Second-degree heart block)."),
])}

<h2 id="rec-rsa">Heart rate and breathing</h2>
<p>The <b>Heart rate</b> button adds a channel of the heart rate, worked out beat by beat from the R–R intervals: each dot is one beat.</p>
{activity("Watch the heart rate with each breath", [
    task("rec-rsa", f'Open <b>Heart rate and breathing</b> {rec("rsa", "show me")}: an ECG and the breathing of a healthy young woman lying still.', auto="rec:open id=rsa"),
    task("rec-hr", f'Switch on the heart-rate channel {rectool("hr", "show me")}.', auto="rec:hr id=rsa on=true"),
    task("rec-all", f'Show the whole 90 seconds {rec("rsa@0,90", "show me")} and compare the heart rate with the breathing trace, which rises as she breathes in.', auto="rec:view id=rsa span>80"),
    task("rec-play", f'Press <b>Play</b> {rectool("play", "show me")}: the recording is replayed in real time, as it was recorded, with the pen moving across the chart. Press <b>Stop</b> (or the space bar) to stop.', auto="rec:play on=true"),
])}
{q("rec-q-rsa", "Does her heart rate rise as she breathes in or as she breathes out? What causes this?", "It rises as she breathes in and falls as she breathes out: a respiratory sinus arrhythmia. During inspiration the activity of the vagus nerves to the sinoatrial node falls (the cardiac vagal neurones in the brainstem are inhibited with each inspiration, and the stretch of the lungs and the changing venous return add to this), so the heart speeds up; during expiration the vagal activity returns and the heart slows. It is a normal finding, largest in young, fit people, and it shrinks with age.")}

<h2 id="rec-eeg">The brain: the EEG</h2>
{activity("Find the alpha rhythm", [
    task("rec-eeg", f'Open the <b>EEG</b> {rec("eeg-alpha", "show me")}. The first half was recorded with the eyes open, the second with the eyes closed: the double line marks where one part ends and the other begins. Compare O1, Oz and O2, at the back of the head, before and after it.', auto="rec:open id=eeg-alpha"),
    task("rec-alpha", f'Zoom in on the eyes-closed part, with about 1 s across the screen {rec("eeg-alpha@40,41", "show me")}, and use the calipers to measure the time taken by ten alpha waves in O1 (from the peak of one wave to the peak of the eleventh).', auto="rec:measure id=eeg-alpha"),
])}
{q("rec-q-alpha", "Ten alpha waves take 0.95 s. What is the frequency of the alpha rhythm, in hertz (waves a second)?", "10.5 Hz: one wave takes 0.95 ÷ 10 = 0.095 s, and 1 ÷ 0.095 s = 10.5 waves a second. The alpha rhythm (8–13 Hz) is strongest over the back of the head with the eyes closed and the person relaxed, and opening the eyes blocks it.", accept="num:10.5±0.3", placeholder="Hz")}
{callout("tip", "Muscle: listen to the EMG", "<p>The list has three recordings of the electrical activity of a muscle (EMG), recorded with a needle electrode: a healthy muscle, a myopathy and a neuropathy. Compare the size and the rate of firing of their motor unit potentials at the same time scale. Switch on <b>Sound</b> and press <b>Play</b> to hear them, as clinicians do (headphones help). The recording of <b>heart sounds</b> can be heard in the same way.</p>")}

<h2 id="rec-r">Your measurements in R</h2>
<p>Everything in the data pad is kept in <code>recorder/measurements.csv</code>, one row for each measurement, which R can read. A whole recording can be saved as a CSV file too, with a column of times and a column for each channel.</p>
{activity("Analyse the data pad", [
    task("rec-padview", f'Look at your measurements in the data pad {rectool("datapad", "show me")}: each row has the recording, the channel, Δt, the rate and your note.', auto="rec:panel name=datapad"),
    task("rec-script", f'Open the script for the data pad in RStudio {recr("measurements", "show me")} and run it line by line with <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on a Mac). It works out the mean interval of each recording, and the heart rate that it gives.', auto="rstudio:doc name=recorder-measurements.R"),
    task("rec-plot", f'Plot a whole recording in R {recr("rsa", "show me")}: this saves <code>recorder/rsa.csv</code> and the beats (<code>rsa-beats.csv</code>, with the R–R interval and heart rate of each beat), and opens a script that plots them.', auto="rstudio:doc name=rsa.R"),
])}
'''
    return lib.chapter("recordings", num, "Recordings", "recorder", "Real recordings of the body", 20,
                   "The Recorder plays back real recordings of people, as a chart recorder does in a physiology practical – the ECG, heart sounds, blood pressure, breathing, muscle and the brain. Measure intervals, work out rates, and keep your measurements for R.", body)
