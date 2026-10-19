"""The workbench's tabs at every size of screen: on a phone held upright, turned sideways or turned while in use, on a
tablet and on a computer, every tab must show its icon, the tabs and the button back to the instructions must fit
across the screen, and every tab must open when it is tapped. (On a phone held upright only the open tab used to show:
the rule for phones hid the tabs' icons, and the rule for a narrow workbench the names of all but the open tab.)
Run:  python3 test/t_tabs.py   (screenshots in test/out/tabs-*.png)"""
import time
from h import Page, check, done

TABS = ['scope', 'flow', 'circuit', 'exam', 'viewer', 'rstudio', 'editor']
STATE = """() => { const bar = document.querySelector('.wb-tabs'), W = innerWidth;
  const tabs = [...document.querySelectorAll('.wb-tab[data-wb]')].map((t) => { const r = t.getBoundingClientRect(), ic = t.querySelector('.ic').getBoundingClientRect(), l = t.querySelector('.lbl');
    return { id: t.dataset.wb, on: t.classList.contains('on'), left: r.left, right: r.right, ic: ic.width, icIn: ic.left >= r.left - 0.5 && ic.right <= r.right + 0.5, lbl: l.getBoundingClientRect().width, cut: l.scrollWidth > l.clientWidth + 1 }; });
  const cb = document.querySelector('.bench-close'), c = cb.getBoundingClientRect(), shown = getComputedStyle(cb).display !== 'none';
  return { W, fits: bar.scrollWidth <= bar.clientWidth + 1, tabs, close: shown ? { left: c.left, right: c.right, w: c.width } : null }; }"""


def look(p, label, narrow):
    st = p.js(STATE)
    W = st['W']
    tabs = st['tabs']
    ok_icons = all(t['ic'] >= 14 and t['icIn'] for t in tabs)
    ok_in = st['fits'] and all(t['left'] >= -0.5 and t['right'] <= W + 0.5 for t in tabs)
    if st['close']:
        ok_in = ok_in and st['close']['left'] >= max(t['right'] for t in tabs) - 0.5 and st['close']['right'] <= W + 0.5
    check(ok_icons, f'{label}: every tab shows its icon')
    check(ok_in, f'{label}: the tabs{" and the button back" if st["close"] else ""} fit across the screen (bar fits: {st["fits"]}; last tab ends at {max(t["right"] for t in tabs):.0f}, close {st["close"]}, width {W})')
    on = [t for t in tabs if t['on']][0]
    if narrow:
        check(all(t['lbl'] == 0 for t in tabs if not t['on']), f'{label}: the other tabs show only their icons')
    if W >= 360:
        check(on['lbl'] > 20, f'{label}: the open tab ({on["id"]}) shows its name ({on["lbl"]:.0f} px{", shortened" if on["cut"] else ""})')
    return st


def tap_all(p, label, touch):
    """tap (or click) each tab in turn: it opens, and the bar still fits with its name"""
    bad = []
    for t in TABS:
        loc = p.p.locator(f'.wb-tab[data-wb="{t}"]')
        (loc.tap if touch else loc.click)()
        time.sleep(0.25)
        st = p.js(STATE)
        cur = p.js("() => MG.app.currentBench")
        if cur != t or not st['fits'] or any(x['ic'] < 14 for x in st['tabs']):
            bad.append((t, cur, st['fits']))
    check(not bad, f'{label}: every tab opens when it is {"tapped" if touch else "clicked"}, and the tabs still fit with its name: {bad}')


def open_bench(p):
    if p.js("() => getComputedStyle(document.querySelector('.bench-fab')).display !== 'none'"):
        p.p.locator('.bench-fab').click()
        time.sleep(0.5)
        return True
    return False


# ---------------------------------------------------------------- phones held upright, and sideways
phones = [(280, 653), (320, 568), (360, 740), (375, 667), (390, 844), (414, 896), (430, 932), (540, 720)]
for (w, hgt) in phones:
    p = Page(width=w, height=hgt, mobile=True)
    p.open()
    narrow = open_bench(p)
    check(narrow, f'{w} × {hgt}: on a phone the workbench opens over the instructions')
    look(p, f'{w} × {hgt}', narrow=True)
    tap_all(p, f'{w} × {hgt}', touch=True)
    if w in (320, 390):
        p.shot(f'tabs-{w}')
    if w == 390:
        # the help shows each tab's icon with its name: on a phone the icons are all that the tabs show
        p.js("() => MG.page.help()")
        time.sleep(0.3)
        n = p.js("() => document.querySelectorAll('.help-ic').length")
        check(n == 7, f'the help shows the seven tabs’ icons beside their names ({n})')
        p.p.keyboard.press('Escape')
        time.sleep(0.2)
    # turned sideways while in use, and back
    p.p.set_viewport_size({'width': hgt, 'height': w})
    time.sleep(0.5)
    look(p, f'{w} × {hgt} turned sideways ({hgt} × {w})', narrow=hgt <= 760)
    p.p.set_viewport_size({'width': w, 'height': hgt})
    time.sleep(0.5)
    look(p, f'{w} × {hgt} turned upright again', narrow=True)
    check(not p.errors, f'{w} × {hgt}: no page errors: ' + '; '.join(p.errors[:2]))
    p.close()

# ---------------------------------------------------------------- tablets and computers
for (w, hgt, mob) in [(768, 1024, True), (820, 1180, True), (1024, 768, True), (1366, 768, False), (1920, 1080, False)]:
    p = Page(width=w, height=hgt, mobile=mob)
    p.open()
    narrow = open_bench(p)
    bw = p.js("() => document.querySelector('.bench').getBoundingClientRect().width")
    look(p, f'{w} × {hgt}', narrow=bw <= 760)
    tap_all(p, f'{w} × {hgt}', touch=mob)
    if w == 1366:
        # with the instructions beside it the workbench is narrow: icons, and the open tab's name
        st = p.js(STATE)
        check(all(t['lbl'] == 0 for t in st['tabs'] if not t['on']) == (bw <= 760), f'1366 × 768: the names of the other tabs are hidden only when the workbench is narrow ({bw:.0f} px)')
        p.js("() => document.querySelector('#tutToggle').click()")
        time.sleep(0.5)
        st = p.js(STATE)
        check(all(t['lbl'] > 20 for t in st['tabs']) and st['fits'], '1366 × 768 with the instructions hidden: every tab has its icon and its name')
        p.shot('tabs-1366-wide')
    check(not p.errors, f'{w} × {hgt}: no page errors: ' + '; '.join(p.errors[:2]))
    p.close()
done()
