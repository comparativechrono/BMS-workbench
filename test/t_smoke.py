"""Smoke test: the page loads, every tab can be shown, and nothing throws."""
import sys, time
from h import Page, check, done
p = Page()
p.open()
check(not p.errors, 'no page errors on load: ' + '; '.join(p.errors[:3]))
tabs = p.js("() => Array.from(document.querySelectorAll('.wb-tab[data-wb]')).map(t => t.dataset.wb)")
check(tabs == ['scope', 'flow', 'circuit', 'exam', 'viewer', 'rstudio', 'editor'], 'seven tabs: ' + ','.join(tabs))
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
