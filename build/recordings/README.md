# The Recorder's recordings

The **Recorder** tab plays back real recordings of people: short excerpts of open-access databases of
[PhysioNet](https://physionet.org), the research resource for physiological signals. This folder makes them.

| File | What it is |
| --- | --- |
| `recordings.json` | The list of recordings: for each one, its title, group and texts (summary, description, what to look for), the database, record and excerpt it comes from, the channels it keeps (and their names, units and kinds), where its beats and annotations come from, how it opens (`view`), and what was changed |
| `make_recordings.py` | Downloads the source files from PhysioNet (into a cache, checking each against the database's `SHA256SUMS.txt`), cuts out each excerpt and writes `recordings/` |

`python3 build/recordings/make_recordings.py` makes them all (or name some: `… ecg-normal rsa`; `--preview` also draws a
picture of each into the cache's `previews/` folder). It needs Python 3 with numpy, scipy and wfdb
(`pip install numpy scipy wfdb`; matplotlib for `--preview`). The downloads (about 30 MB) are cached in
`~/.cache/bms-workbench/physionet` (`--cache DIR` to change it).

## What the site holds

For each recording, `recordings/<id>.json` (what it is: channels, sampling rate, beats, rhythms, events, the person it
comes from as the database describes them, the source, licence and citations) and `recordings/<id>.bin` (its samples,
little-endian 16-bit integers, one channel after another; a sample's value is `raw × scale + offset`, and −32768 is a
gap). `recordings/index.json` lists them for the Recorder. The 14 recordings take 2.3 MB, and a student downloads only
the ones they open (the largest is 0.36 MB).

## The recordings, and where they come from

Every database used is published on PhysioNet under the **Open Data Commons Attribution License v1.0** (ODC-By 1.0),
which allows anyone to copy, share and adapt the data, including on a public website, as long as the database is
credited. Each recording's **About** panel in the Recorder gives its database, record, licence and citations, as the
pictures it saves do; the list's **Where the recordings come from** gives them all.

| Recording | Database (record, excerpt) | What it shows | Beats |
| --- | --- | --- | --- |
| `ecg-normal` Sinus rhythm | MIT-BIH Arrhythmia Database (100, 480–540 s) | A two-lead ECG in sinus rhythm | labelled by cardiologists |
| `ecg-12lead` The 12-lead ECG | PTB Diagnostic ECG Database (patient182/s0308lre, 5–35 s) | A healthy 29-year-old man's 12-lead ECG | found by the build (lead II) |
| `ecg-ectopic` Ventricular ectopic beats | MIT-BIH Arrhythmia Database (119, 10–70 s) | Premature ventricular contractions, ventricular bigeminy | labelled by cardiologists |
| `ecg-af` Atrial fibrillation | MIT-BIH Atrial Fibrillation Database (04048, 8566–8615.5 s) | Sinus rhythm (R–R intervals 0.80–0.92 s), then atrial fibrillation from 27.9 s (0.34–1.30 s, heart rate 66 → 101 a minute) | found by the build (they match the database's 68 beat marks); the rhythms are the database's, marked by hand |
| `ecg-block` Second-degree heart block | MIT-BIH Arrhythmia Database (231, 85–160 s) | 2:1 AV block, with the blocked P waves marked | labelled by cardiologists |
| `heart-sounds` Heart sounds and the ECG | PhysioNet/CinC Challenge 2016 (training-a/a0029) | A phonocardiogram with S1 and S2 marked by hand, and the ECG (both in arbitrary units: the database calibrates neither) | found by the build |
| `bp-standing` Blood pressure on standing up | Physiologic Response to Changes in Posture (12744, 1510–1630 s) | Finger arterial pressure and the ECG as a healthy volunteer stands up | found by the build |
| `pulse-ppg` Pulse, ECG and breathing | BIDMC PPG and Respiration Dataset (bidmc43, 390–450 s) | A pulse oximeter's PPG, a chest ECG lead and impedance breathing (with breaths marked by hand), in intensive care | found by the build |
| `rsa` Heart rate and breathing | Fantasia Database (f1y01, 320–410 s) | Respiratory sinus arrhythmia in a healthy 23-year-old woman | the database's (automatic, checked by eye) |
| `exercise` Heart rate during exercise | Wrist PPG During Exercise (s1_high_resistance_bike, all) | Ten minutes of cycling: the heart rate climbs from about 85 to 130 a minute | the database's (marked by hand) |
| `emg-healthy`, `emg-myopathy`, `emg-neuropathy` | Examples of Electromyograms (emg_healthy, emg_myopathy, emg_neuropathy, all) | Needle EMG of tibialis anterior: healthy, myopathy, neuropathy (with sound), all opening on one scale (±3.5 mV) so that their sizes can be compared | – |
| `eeg-alpha` EEG: eyes open and closed | EEG Motor Movement/Imagery Dataset (S004R01 and S004R02, 10–40 s of each) | The alpha rhythm with the eyes closed; blinks with them open | – |

The excerpts were chosen by looking at the records: a clean stretch that shows the physiology well (for `rsa`, the
young volunteer and the 90 seconds in which the heart rate followed breathing most closely; for `eeg-alpha`, the
volunteer of the first eight with the strongest alpha rhythm with the eyes closed; for `ecg-af`, a change from a clean
stretch of sinus rhythm to atrial fibrillation – the MIT-BIH Arrhythmia Database's AF records have no clean sinus
rhythm next to their fibrillation – checked by measuring: the coefficient of variation of the R–R intervals is 0.025
in the sinus rhythm and 0.44 in the fibrillation. Its P waves are small, clearest in ECG 2; its fibrillation waves are
too small to see, and the texts say so).

What was changed, besides cutting out the excerpts and storing them as 16-bit numbers: the 12-lead ECG was resampled
from 1000 to 500 samples a second; the EEG's two runs were put one after the other (the Recorder shows the join, and
says which part is which), and filtered with a 0.5 Hz high-pass filter; in `rsa`, the ECG and the breathing trace were
moved to centre on zero (their baselines are not calibrated); the tilt-table angle of `bp-standing` and the wrist
sensors of `exercise` were left out. The AF database marks rhythms only as AF, flutter, junctional or "other": its
"other" before the fibrillation is shown as sinus rhythm, which its P waves and regular beats show it to be (the About
panel says so). Where a database has no beats, the build found the R waves itself (wfdb's XQRS
detector, each beat then moved to the peak of the QRS) and the beats were checked by eye on the previews; the About
panel says so.

### Citations

PhysioNet asks that its standard citation is given with each database's own:

- Goldberger AL, Amaral LAN, Glass L, Hausdorff JM, Ivanov PCh, Mark RG, Mietus JE, Moody GB, Peng C-K, Stanley HE.
  PhysioBank, PhysioToolkit, and PhysioNet: components of a new research resource for complex physiologic signals.
  Circulation 101(23):e215–e220 (2000). https://doi.org/10.1161/01.CIR.101.23.e215
- Pollard T, Moody BE, Lehman L, et al. PhysioNet as a global platform for biomedical research. Nature Health (2026).
  https://doi.org/10.1038/s44360-026-00096-z

The databases and their original publications:

- Moody G, Mark R. MIT-BIH Arrhythmia Database (version 1.0.0). PhysioNet (2005). https://doi.org/10.13026/C2F305 –
  Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database. IEEE Eng in Med and Biol 20(3):45–50 (2001).
- Moody G, Mark R. MIT-BIH Atrial Fibrillation Database (version 1.0.0). PhysioNet (2000).
  https://doi.org/10.13026/C2MW2D – Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R
  intervals. Computers in Cardiology 10:227–230 (1983).
- PTB Diagnostic ECG Database (version 1.0.0). PhysioNet. https://doi.org/10.13026/C28C71 – Bousseljot R, Kreiseler D,
  Schnabel A. Nutzung der EKG-Signaldatenbank CARDIODAT der PTB über das Internet. Biomedizinische Technik 40,
  Ergänzungsband 1, S 317 (1995).
- Classification of Heart Sound Recordings: the PhysioNet/Computing in Cardiology Challenge 2016 (version 1.0.0).
  PhysioNet. – Liu C, Springer D, Li Q, et al. An open access database for the evaluation of heart sound algorithms.
  Physiol Meas 37(12):2181–2213 (2016).
- Physiologic Response to Changes in Posture (version 1.0.0). PhysioNet. https://doi.org/10.13026/C2PC7R – Heldt T,
  Oefinger MB, Hoshiyama M, Mark RG. Circulatory response to passive and active changes in posture. Computers in
  Cardiology 30:263–266 (2003).
- BIDMC PPG and Respiration Dataset (version 1.0.0). PhysioNet. https://doi.org/10.13026/C2208R – Pimentel MAF,
  Johnson AEW, Charlton PH, et al. Towards a robust estimation of respiratory rate from pulse oximeters. IEEE Trans
  Biomed Eng 64(8):1914–1923 (2017).
- Fantasia Database (version 1.0.0). PhysioNet. https://doi.org/10.13026/C2RG61 – Iyengar N, Peng C-K, Morin R,
  Goldberger AL, Lipsitz LA. Age-related alterations in the fractal scaling of cardiac interbeat interval dynamics.
  Am J Physiol 271:R1078–R1084 (1996).
- Wrist PPG During Exercise (version 1.0.0). PhysioNet. https://doi.org/10.13026/C2PQ1X – Jarchi D, Casson AJ.
  Description of a database containing wrist PPG signals recorded during physical exercise with both accelerometer and
  gyroscope measures of motion. Data 2(1):1 (2017).
- Examples of Electromyograms (version 1.0.0). PhysioNet. https://doi.org/10.13026/C24S3D
- Schalk G. EEG Motor Movement/Imagery Dataset (version 1.0.0). PhysioNet (2009). https://doi.org/10.13026/C28G6P –
  Schalk G, McFarland DJ, Hinterberger T, Birbaumer N, Wolpaw JR. BCI2000: a general-purpose brain-computer interface
  (BCI) system. IEEE Trans Biomed Eng 51(6):1034–1043 (2004).

## Adding a recording

Copy an entry of `recordings.json` and change it: `source` names the database (one of those in `DBS` in
`make_recordings.py`, or add it there with its name, version, DOI and citations – after checking on its PhysioNet page
that its licence allows redistribution, as ODC-By and CC BY do; credentialed or restricted databases may not be put on a
public site), the record and the excerpt (`from`, `to`, in seconds; `parts` for an excerpt in several pieces); `channels`
the signals to keep, by their names in the record (`src`), with a name, a short name (used by the instructions' buttons:
`rec('rsa@0,60:ECG,Resp')`), units and a kind (`ecg`, `bp`, `ppg`, `pcg`, `resp`, `emg`, `eeg`, `scg`, `angle` – it
sets the colour, and an ECG in mV is drawn on ECG paper; `audio: true` lets the Recorder play it as sound; `hidden: true`
hides it at first; `range` sets the scale it opens with). `beats` takes the beats from an annotation file (`ann`; `labels`
and `rhythms` for the MIT-BIH style of labels) or finds them (`detect`: the channel); `rhythms` (`{"ann": "atr"}`)
takes the rhythms from an annotation file of their own, for beats that the build finds. Then run the script with
`--preview`, look at the picture, and rebuild the page.
