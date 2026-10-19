# The organ bath: its model

The **Organ bath** tab (`assets/js/organbath.js`, with `assets/css/organbath.css`) simulates the pharmacology of isolated tissues: a length of guinea-pig ileum, or a ring of rat thoracic aorta, in an organ bath. It is a **teaching simulation**. Nothing in it is a recording of a real tissue: the tensions come from the model below, whose values are typical of those reported for these tissues, rounded and chosen for teaching. Responses measured in it should be described as simulated.

Everything is in the module: there are no data files. The code is the workbench's own (the workbench's licence); it uses no third-party code or data.

## What the student does

The student sets up a tissue, adds drugs to the bath by volume from stock solutions (10⁻² to 10⁻⁸ M; KCl from 0.5 to 4 M), watches the tension on a chart, washes the bath out, and builds concentration–response curves. Each agonist's response is measured automatically – the largest change in tension (averaged over about one cycle of the ileum's own movements) after the dose, above the baseline before it – when the bath is washed or the next dose of the same drug is added, so that single-dose and cumulative curves both work. The results are kept in `~/organbath/<tissue>.csv` and analysed by an R script (`~/organbath/<tissue>.R`, written by the tab: four-parameter logistic fits with `nls()`, dose ratios, pA₂ and a Schild plot, in base R).

Concentrations in the bath are exact: adding a volume *v* of a stock *C* to a bath of volume *V* that held *c* gives (*cV* + *Cv*)/(*V* + *v*), and the bath's volume grows until it is washed (it overflows, and refuses, 3 mL above its nominal volume). A wash drains the bath (2 % of the fluid is left behind) and refills it, three times by default, with the washing solution – which can hold an antagonist, so that a whole curve can be built in a constant concentration of it.

## The model

### Agonists, antagonists and receptors (the operational model)

For each receptor *r*, all the ligands that bind it compete for it. Each ligand *i* at concentration [*L*ᵢ] has *x*ᵢ = [*L*ᵢ]/*K*ᵢ (*K*ᵢ = *K*_A for an agonist, *K*_B for an antagonist), and occupies a fraction *x*ᵢ / (1 + Σ*x*). The receptor's **stimulus** is

  *S*_r = *q*_r · Σ_agonists τᵢ *x*ᵢ / (1 + Σ *x*)

where τ is the agonist's efficacy (in the operational model, the tissue's receptor density over the concentration of agonist–receptor complex that gives half the maximal response) and *q*_r the fraction of the receptors that is left (1, unless an irreversible antagonist has inactivated some). The stimuli of the receptors that contract the muscle add, and the response is

  *E* = *E*_m · *S*ⁿ / (1 + *S*ⁿ)

the operational model of agonism (Black & Leff 1983). For one agonist this is *E* = *E*_m τⁿ[A]ⁿ / ((*K*_A + [A])ⁿ + τⁿ[A]ⁿ), with EC₅₀ = *K*_A / ((2 + τⁿ)^(1/n) − 1) and a maximum of *E*_m τⁿ/(1 + τⁿ). From this:

- **Competitive antagonism** (Gaddum 1937; Schild 1947; Arunlakshana & Schild 1959): an antagonist multiplies *K*_A by (1 + [B]/*K*_B), so the curve shifts to the right in parallel, by the dose ratio DR = 1 + [B]/*K*_B, and its maximum is unchanged: a Schild plot has a slope of 1 and crosses the axis at pA₂ = p*K*_B.
- **Partial agonists** have a small τ: their maximum is below the tissue's, and they antagonise a full agonist.
- **Irreversible antagonism** (Furchgott 1966): phenoxybenzamine occupies α₁-adrenoceptors (*K*_B 32 nM) and inactivates those it occupies at 0.004 s⁻¹, so that *dq*/*dt* = −0.004 · occupancy · *q* (an agonist present at the same time protects the receptors). Losing receptors lowers τ: with a large receptor reserve the curve first shifts to the right, and its maximum falls only when the reserve is used up – sooner for phenylephrine (τ ≈ 20) than for noradrenaline (τ ≈ 60).
- **Non-competitive (functional) antagonism**: papaverine multiplies the response by 1 − *f*([B]), whatever the agonist; nifedipine cuts the stimulus of K⁺ by up to 95 % and that of the receptors by up to 35 % (depolarisation depends on Ca²⁺ entry through L-type channels more than receptor-mediated contraction does).
- **K⁺ (KCl)** contracts by depolarisation, without receptors: its own concentration–response curve (EC₅₀ about 30 mM K⁺ in all, Hill slope 4) is turned into a stimulus that adds to the receptors'.
- **The ganglia of the ileum**: nicotine acts at the nicotinic receptors of enteric neurones (an operational model of its own), which release acetylcholine onto the muscle's M₃ receptors – so atropine blocks nicotine's responses as well as acetylcholine's, hexamethonium (which blocks the receptors' ion channels, so that more nicotine doesn't overcome it) blocks only nicotine's, and an anticholinesterase potentiates both. The nicotinic receptors desensitise (*dD*/*dt* = 0.08 · occupancy · (1 − *D*) − *D*/240 s), so nicotine's contraction fades and repeated doses need about 10 minutes between them.
- **Cholinesterase**: acetylcholine's values are those seen with the tissue's cholinesterase active; neostigmine multiplies the concentration of acetylcholine (added, or released by the nerves) at the receptors by up to 8, a leftward shift of up to 0.9 log units (carbachol is not affected), and raises the ileum's tone a little by sparing the acetylcholine that its nerves release all the time.
- **The endothelium of the aorta** (Furchgott & Zawadzki 1980): acetylcholine acts at the endothelium's muscarinic receptors, and the nitric oxide they make relaxes the muscle: relaxation *R* = 0.9 · *S*ₑ/(1 + *S*ₑ). Rubbing the endothelium off leaves 0.3 % of it; L-NAME inhibits NO synthase; sodium nitroprusside releases NO directly, with or without the endothelium. Acetylcholine also acts weakly at the muscle's own muscarinic receptors, which contract it. The active tension is *E* × (1 − *R*).

### Time

Each drug reaches the receptors from the bath with first-order kinetics, d[L]ₑ/d*t* = *k*([L]_bath − [L]ₑ), with its own rate going on and coming off (for example atropine 1/90 s and 1/500 s: it washes out slowly). The muscle follows the response with time constants of its own (ileum 2.2 s contracting and 4.5 s relaxing; aorta 30 s and 60 s), so that the ileum contracts in seconds and recovers in about a minute, while the aorta takes several minutes to contract and some 15 minutes to relax after a wash. The model is stepped every 0.05 s (exactly the same steps whatever the speed of the clock), and the tension is sampled 10 times a second.

### Noise, drift and tissue-to-tissue variation

The tension is the resting tension (which falls by about 10 % over the first half hour, as a stretched tissue relaxes), plus slow drift (an Ornstein–Uhlenbeck process), plus the active tension, plus – in the ileum – small irregular spontaneous movements at about 0.3 Hz (a lightly damped oscillator driven by noise, damped by relaxants and by contraction), plus a small artefact while the bath is drained, plus transducer noise. Each tissue's maximum varies by about 15 % (log-normal), its resting tension by 6 %, each agonist's τ by 20 % and each p*K* by 0.04 log units. All of this comes from a seed – by default made from the student's name and the tissue's number, so that students get different tissues and a tissue is replayed exactly. The tab keeps only what was done to each tissue and when; the trace is made again from the seed when a tissue is opened.

## The values

Typical values for these preparations, rounded. *n* is the transducer slope of the operational model; τ is given for the tissue as a whole. **pEC₅₀** is what the model gives (before tissue-to-tissue variation).

**Guinea-pig ileum** (Tyrode's solution, 37 °C, air; resting tension 1 g; *E*_m 3 g; *n* = 1.2)

| Drug | Action in the model | Values | pEC₅₀ / max |
| --- | --- | --- | --- |
| Acetylcholine | M₃ agonist (cholinesterase active) | p*K*_A 5.5, τ 40 | 7.1, 98 % |
| Carbachol | M₃ agonist | p*K*_A 5.3, τ 30 | 6.8, 98 % |
| Histamine | H₁ agonist | p*K*_A 5.0, τ 40 | 6.6, 98 % |
| Pilocarpine | M₃ partial agonist | p*K*_A 5.6, τ 1.2 | 5.8, 55 % |
| Nicotine | nicotinic agonist on enteric neurones → acetylcholine | p*K*_A 4.7, τ 3 | 5.7, 67 %, then fades |
| KCl | depolarisation | EC₅₀ 32 mM K⁺ in all (Tyrode has 2.7 mM), *n*H 4 | 29 mM added, 83 % |
| Atropine | competitive M₃ antagonist | p*K*_B 9.0 | |
| Mepyramine | competitive H₁ antagonist | p*K*_B 9.3 | |
| Hexamethonium | blocks the channels of the ganglia's nicotinic receptors (insurmountable) | pIC₅₀ 5.0 | |
| Papaverine | relaxant (phosphodiesterase inhibitor) | pIC₅₀ 5.0 | |
| Neostigmine | anticholinesterase | pIC₅₀ 7.5, up to 8× | |
| Drugs X and Y | unknowns, made from the tissue's seed | X: a competitive antagonist at M₃ or H₁ (p*K*_B 7.8–9.4); Y: a relaxant, a ganglion blocker, an H₁ agonist or a partial M₃ agonist | |

**Rat thoracic aorta** (Krebs–Henseleit solution, 37 °C, 95 % O₂ + 5 % CO₂; resting tension 2 g; *E*_m 1.8 g; *n* = 1.3)

| Drug | Action in the model | Values | pEC₅₀ / max |
| --- | --- | --- | --- |
| Phenylephrine | α₁ agonist | p*K*_A 5.7, τ 20 | 7.0, 98 % |
| Noradrenaline | α₁ agonist | p*K*_A 6.0, τ 60 | 7.8, 99 % |
| KCl | depolarisation | EC₅₀ 28 mM K⁺ in all (Krebs has 5.9 mM), *n*H 4 | 22 mM added, 94 % |
| Acetylcholine | endothelial M₃ → NO (relaxation); weak smooth-muscle M₃ (contraction) | p*K*_A 6.3, τ 10 (endothelium); p*K*_A 5.5, τ 0.6 (muscle) | relaxation pEC₅₀ 7.3, about 80 % of the tone (phenylephrine 10⁻⁶ M); 2 % without endothelium |
| Sodium nitroprusside | NO donor | pEC₅₀ 8.0 | 8.0, 100 % relaxation |
| Prazosin | competitive α₁ antagonist | p*K*_B 9.8 | |
| Phenoxybenzamine | irreversible α₁ antagonist | *K*_B 32 nM; inactivation 0.004 s⁻¹ | |
| Atropine | competitive M₃ antagonist | p*K*_B 9.0 | |
| L-NAME | NO synthase inhibitor | pIC₅₀ 5.5 | |
| Nifedipine | L-type Ca²⁺-channel blocker | pIC₅₀ 8.5 | |

## Sources

The equations are standard; the values were chosen to be close to commonly reported ones (they are not taken from any one paper):

- Black JW, Leff P (1983). Operational models of pharmacological agonism. *Proc R Soc Lond B* 220: 141–162.
- Gaddum JH (1937). The quantitative effects of antagonistic drugs. *J Physiol* 89: 7P–9P.
- Schild HO (1947). pA, a new scale for the measurement of drug antagonism. *Br J Pharmacol* 2: 189–206.
- Arunlakshana O, Schild HO (1959). Some quantitative uses of drug antagonists. *Br J Pharmacol* 14: 48–58.
- Furchgott RF (1966). The use of β-haloalkylamines in the differentiation of receptors and in the determination of dissociation constants of receptor–agonist complexes. *Adv Drug Res* 3: 21–55.
- Furchgott RF, Zawadzki JV (1980). The obligatory role of endothelial cells in the relaxation of arterial smooth muscle by acetylcholine. *Nature* 288: 373–376.
- Kenakin T. *A Pharmacology Primer*. Academic Press – the operational model, receptor reserve and Schild analysis.
- The IUPHAR/BPS Guide to PHARMACOLOGY (<https://www.guidetopharmacology.org>) – the affinities of atropine, mepyramine and prazosin at their receptors.

## Changing it

The tissues and their drugs are the `TISSUES` table near the top of `organbath.js` (and the drugs' names and descriptions the `DRUGS` table). To add a drug, give it an entry in `DRUGS` and, in a tissue's `act`, what it does: `rec` (at each receptor, `pKA` and `tau` for an agonist, `pKB` for an antagonist), `kind` (`'contraction'` or `'relaxation'`, for an agonist whose responses are measured), its rates `kOn`/`kOff`, and any of `kcl`, `relax`, `ache`, `irrev`, `no`, `nos`, `ccb` (see the comments there). `MG.OrganBath.steady(P, concentrations)` gives the steady-state tension of a tissue (`MG.OrganBath.makeParams(type, seed)`), which is a quick way to check a new drug's curve; `test/t_organbath.py` checks the model's EC₅₀s, dose ratios and maxima against the equations above.
