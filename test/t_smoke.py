"""Smoke test: the page loads, every tab can be shown, and nothing throws."""
import sys, time
from h import Page, check, done
p = Page()
p.open()
check(not p.errors, 'no page errors on load: ' + '; '.join(p.errors[:3]))
tabs = p.js("() => Array.from(document.querySelectorAll('.wb-tab[data-wb]')).map(t => t.dataset.wb)")
check(tabs == ['scope', 'anatomy', 'viewer', 'recorder', 'bath', 'flow', 'circuit', 'sims', 'exam', 'rstudio', 'editor'], 'eleven tabs: ' + ','.join(tabs))
# numerical answers in the instructions, written as students (and model answers) write them
cases = [('num:9.8e5±1%', '980 000', True), ('num:1.145e6±4%', '1 145 000 cells per mL', True), ('num:400±2', '20000/50 = 400', True),
         ('num:22.5±0.5', '22,5', True), ('num:1.145e6±4%', '1.1 million', True), ('num:4', 'four chains', True), ('num:4±0.2', '4 µm', True),
         ('num:1.145e6±4%', '1.145 × 10⁶', True), ('num:89.8±0.3', '89.8%', True), ('num:4', '5', False), ('num:400±2', '400 = 20000/40', True),
         ('num:2.5±0.1', '2.5 mL (from C1V1 = C2V2)', True), ('num:9.8e5±1%', '9,8 × 10^5', True), ('num:60..300', 'about 150 µm', True)]
got = p.js("(cs) => cs.map(([spec, text]) => MG.tutorial_numOk(spec.slice(4), text))", [[a, b] for a, b, _ in cases])
bad = [(c[1], g) for c, g in zip(cases, got) if g != c[2]]
check(not bad, f'numbers in answers are read as students write them (spaces, decimal commas, workings, words): {bad}')
for t in ['editor', 'rstudio']:
    p.js(f"() => MG.app.showWorkbench('{t}')")
    time.sleep(2)
    p.shot('smoke-' + t)
check(not p.errors, 'no page errors after showing tabs: ' + '; '.join(p.errors[:3]))
# R starts in RStudio
try:
    p.wait("() => MG.app.rstudio && MG.app.rstudio.S && MG.app.rstudio.S.ready", timeout=180000)
    check(True, 'R started in RStudio')
except Exception as e:
    check(False, 'R started in RStudio: ' + str(e)[:200])
p.shot('smoke-rstudio-ready')
print('\n'.join(l for l in p.logs if 'error' in l.lower())[:2000])
p.close()
done()
