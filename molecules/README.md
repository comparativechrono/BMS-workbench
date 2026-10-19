# The 3D viewer's library

The proteins and small molecules that the 3D viewer's **Library** opens, kept with the site so that they load quickly and
without the Protein Data Bank's servers. The list that the viewer shows, with a sentence about each molecule, is in
[assets/js/viewer-bms.js](../assets/js/viewer-bms.js) (`PROTEINS` and `SMALL`).

All of the files come from the [Protein Data Bank](https://www.rcsb.org) (RCSB PDB) and were downloaded on 19 October 2026.
**PDB data are free of all copyright restrictions (CC0 1.0).** The PDB asks users to cite the PDB itself (Berman et al.
2000, *Nucleic Acids Res* 28: 235–242) and the primary publication of each entry they use, given below.

## Proteins: `ID.bcif`

Each file is the whole entry in BinaryCIF, the compact binary form of mmCIF, as RCSB's ModelServer gives it:
`https://models.rcsb.org/v1/ID/full?encoding=bcif`. (The ModelServer writes an identifier of each request into the file,
so a new download differs from these in a few bytes, but its content is the same.)

| PDB ID | Molecule | Method | Primary citation | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| [4HHB](https://www.rcsb.org/structure/4HHB) | Haemoglobin (human, deoxy) | X-ray, 1.74 Å | Fermi et al. (1984) *J Mol Biol* 175: 159 | 123,272 | `e1f6ce1c5a3a4808…` |
| [1MBN](https://www.rcsb.org/structure/1MBN) | Myoglobin (sperm whale) | X-ray, 2.0 Å | Watson (1969) *Prog Stereochem* 4: 299 | 71,045 | `c44d436f06580e15…` |
| [4INS](https://www.rcsb.org/structure/4INS) | Insulin (pig; two of the six molecules of the 2-zinc hexamer, with both zinc ions) | X-ray, 1.5 Å | Baker et al. (1988) *Phil Trans R Soc Lond B* 319: 369 | 80,862 | `d797d1a5cb3670af…` |
| [3SN6](https://www.rcsb.org/structure/3SN6) | β₂-adrenergic receptor with the Gs protein | X-ray, 3.2 Å | Rasmussen et al. (2011) *Nature* 477: 549 | 207,446 | `0fcd4972889f6cd7…` |
| [1M2Z](https://www.rcsb.org/structure/1M2Z) | Glucocorticoid receptor ligand-binding domain with dexamethasone | X-ray, 2.5 Å | Bledsoe et al. (2002) *Cell* 110: 93 | 120,406 | `8524480e3e9e0679…` |
| [1A52](https://www.rcsb.org/structure/1A52) | Oestrogen receptor α ligand-binding domain with oestradiol | X-ray, 2.8 Å | Tanenbaum et al. (1998) *Proc Natl Acad Sci U S A* 95: 5998 | 114,535 | `9b5d052b75ea5399…` |
| [2ROX](https://www.rcsb.org/structure/2ROX) | Transthyretin with thyroxine (two of its four subunits) | X-ray, 2.0 Å | Wojtczak et al. (1996) *Acta Crystallogr D Biol Crystallogr* 52: 758 | 78,476 | `44a650ab7aa95631…` |
| [1BM0](https://www.rcsb.org/structure/1BM0) | Human serum albumin | X-ray, 2.5 Å | Sugio et al. (1999) *Protein Eng* 12: 439 | 183,082 | `7947f0e126079f99…` |
| [1J4N](https://www.rcsb.org/structure/1J4N) | Aquaporin-1 (cow; one of its four subunits) | X-ray, 2.2 Å | Sui et al. (2001) *Nature* 414: 872 | 76,782 | `32cdd546fddafdfa…` |
| [4PYP](https://www.rcsb.org/structure/4PYP) | Glucose transporter GLUT1 (human) | X-ray, 3.166 Å | Deng et al. (2014) *Nature* 510: 121 | 93,557 | `0f9941ca832ea337…` |
| [3WGU](https://www.rcsb.org/structure/3WGU) | Na⁺/K⁺-ATPase (pig kidney) | X-ray, 2.8 Å | Kanai et al. (2013) *Nature* 502: 201 | 372,812 | `ee2423df57b79e6d…` |
| [1BL8](https://www.rcsb.org/structure/1BL8) | Potassium channel KcsA (Streptomyces lividans) | X-ray, 3.2 Å | Doyle et al. (1998) *Science* 280: 69 | 93,897 | `d4e2af06b5cba6e8…` |
| [2BG9](https://www.rcsb.org/structure/2BG9) | Nicotinic acetylcholine receptor (Torpedo) | cryo-EM, 4.0 Å | Unwin (2005) *J Mol Biol* 346: 967 | 250,416 | `c67e73e514a9840c…` |
| [3HHR](https://www.rcsb.org/structure/3HHR) | Growth hormone with its receptor (human) | X-ray, 2.8 Å | de Vos et al. (1992) *Science* 255: 306 | 120,673 | `04e944f4033f3901…` |
| [1CLL](https://www.rcsb.org/structure/1CLL) | Calmodulin with four Ca²⁺ | X-ray, 1.7 Å | Chattopadhyaya et al. (1992) *J Mol Biol* 228: 1177 | 80,669 | `10222a340623fa24…` |
| [1ATP](https://www.rcsb.org/structure/1ATP) | Protein kinase A catalytic subunit (mouse), with ATP | X-ray, 2.2 Å | Zheng et al. (1993) *Acta Crystallogr D Biol Crystallogr* 49: 362 | 107,680 | `be40a385c3ca5162…` |
| [1CGD](https://www.rcsb.org/structure/1CGD) | Collagen-like peptide (triple helix; one glycine replaced by alanine) | X-ray, 1.85 Å | Bella et al. (1995) *Structure* 3: 893 | 65,185 | `4d574078cb5ac62d…` |

## Small molecules: `CODE.sdf`

The *ideal* coordinates of each molecule (a model with hydrogens, computed for the PDB's Chemical Component Dictionary,
not taken from any one crystal structure), as SDF files: `https://files.rcsb.org/ligands/download/CODE_ideal.sdf`.

| Code | Molecule | Formula | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| [HCY](https://www.rcsb.org/ligand/HCY) | Cortisol | C21H30O5 | 3,943 | `6881083f8673750a…` |
| [AS4](https://www.rcsb.org/ligand/AS4) | Aldosterone | C21H28O5 | 3,807 | `de976bd441b96eb8…` |
| [DEX](https://www.rcsb.org/ligand/DEX) | Dexamethasone | C22H29FO5 | 4,011 | `d7aa8ba2bd66311a…` |
| [TES](https://www.rcsb.org/ligand/TES) | Testosterone | C19H28O2 | 3,467 | `102262ac9002bb7e…` |
| [EST](https://www.rcsb.org/ligand/EST) | Oestradiol | C18H24O2 | 3,127 | `9b3fe86469dd8155…` |
| [STR](https://www.rcsb.org/ligand/STR) | Progesterone | C21H30O2 | 3,739 | `9c43a91b19f5ecaf…` |
| [CLR](https://www.rcsb.org/ligand/CLR) | Cholesterol | C27H46O | 5,167 | `fae6d6bf3769ef1c…` |
| [T44](https://www.rcsb.org/ligand/T44) | Thyroxine (T₄) | C15H11I4NO4 | 2,477 | `d5966c108a3c0eaf…` |
| [T3](https://www.rcsb.org/ligand/T3) | Triiodothyronine (T₃) | C15H12I3NO4 | 2,476 | `84cb491910124f10…` |
| [ALE](https://www.rcsb.org/ligand/ALE) | Adrenaline | C9H13NO3 | 1,846 | `bdd08c945ccc0645…` |
| [LNR](https://www.rcsb.org/ligand/LNR) | Noradrenaline | C8H11NO3 | 1,642 | `545a2c72977acc7a…` |
| [LDP](https://www.rcsb.org/ligand/LDP) | Dopamine | C8H11NO2 | 1,574 | `7e3e10767e8dd7ed…` |
| [ML1](https://www.rcsb.org/ligand/ML1) | Melatonin | C13H16N2O2 | 2,341 | `090ec1aa85bdf7dd…` |
| [ACH](https://www.rcsb.org/ligand/ACH) | Acetylcholine | C7H16NO2 | 1,845 | `60b6bfcf9aa31efa…` |
| [GLC](https://www.rcsb.org/ligand/GLC) | Glucose (α-D-glucopyranose) | C6H12O6 | 1,710 | `31ff81b4dc00447f…` |
| [ATP](https://www.rcsb.org/ligand/ATP) | ATP | C10H16N5O13P3 | 3,312 | `49771f22888401cc…` |
| [CMP](https://www.rcsb.org/ligand/CMP) | Cyclic AMP | C10H12N5O6P | 2,447 | `cb31c445d47e8c53…` |
| [HEM](https://www.rcsb.org/ligand/HEM) | Haem | C34H32FeN4O4 | 5,383 | `e30f0722b52b64c0…` |

## Adding a molecule

1. Download it: a protein with `curl -o molecules/1ABC.bcif "https://models.rcsb.org/v1/1ABC/full?encoding=bcif"`, a small
   molecule with `curl -o molecules/XYZ.sdf "https://files.rcsb.org/ligands/download/XYZ_ideal.sdf"` (find the code of a
   small molecule by searching for it on [rcsb.org](https://www.rcsb.org)).
2. Add it to `PROTEINS` (`['1ABC', 'Name', 'A sentence about it.']`) or `SMALL` (`['key', 'XYZ', 'Name', 'What it is']`) in
   `assets/js/viewer-bms.js`. A protein in the list is then loaded from `molecules/` whenever it is asked for
   (`load 1ABC`, or `pdb('1ABC')` in the instructions), and a small molecule with `molecule key`.
3. Add it to the tables above.

The files hold what the PDB calls the *asymmetric unit* – the atoms in each entry's file – which is not always the whole working molecule: the crystal's symmetry makes the rest. The library's descriptions say where that is the case (insulin, aquaporin-1 and transthyretin).

Structures that are not in the library are still available: the viewer loads any PDB ID from RCSB PDB, and AlphaFold
models from AlphaFold DB, when students ask for them.
