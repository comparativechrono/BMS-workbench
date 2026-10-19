"""Exam practice (assets/js/exam.js, calc.js and docx.js): the papers, the start page, the player (typing, the word
count and its hard limit, every button of the essay toolbar, pasting, flags and the tiles, the options menu), saving
and carrying on after a reload with the clock still running, the time running out (with a clock moved on), the
submission page, submitting, the downloads (the Word file is opened with zipfile), the review with the marking of
numerical answers, a free essay, the list of attempts, the calculator against Python, the events, and the layout at
desktop and phone widths.
Run:  python3 test/t_exam.py   (screenshots in test/out/exam-*.png)"""
import io
import json
import math
import os
import re
import time
import zipfile

from h import Page, check, done, OUT, SITE

p = Page(width=1500, height=950)
P = p.p
p.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='https://bms.test')
p.open()
p.js("() => localStorage.clear()")
p.open()
E = 'MG.app.exam'
EVJS = "() => { window.EV = []; MG.bus.on('*', (d, t) => { if (/^(exam|calc):/.test(t)) EV.push([t, JSON.parse(JSON.stringify(d))]); }); }"
p.js(EVJS)
ALL_EV = []  # (the events of the pages before a reload)


def ev(kind, cond='true'):
    return p.js(f"() => EV.filter(e => e[0] === '{kind}' && (d => {cond})(e[1])).length")


def evs():
    return p.js("() => EV.slice()")


def sleep(s=0.15):
    time.sleep(s)


def area_html():
    return p.js("() => document.querySelector('.ex-area').innerHTML")


def area_text():
    return p.js("() => document.querySelector('.ex-area').textContent")


def words_text():
    return p.js("() => document.querySelector('.ex-wc').textContent")


def caret_end():
    p.js("""() => { const A = document.querySelector('.ex-area'); A.focus(); const r = document.createRange();
        let n = A; while (n.lastChild && !(n.lastChild.nodeType === 1 && /^(TABLE|IMG)$/.test(n.lastChild.tagName))) n = n.lastChild;
        if (n.nodeType === 3) { r.setStart(n, n.nodeValue.length); } else { r.selectNodeContents(n); r.collapse(false); }
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    sleep(0.1)


def new_paragraph_at_end(text=None):
    """a new paragraph at the end of the answer (after a table or a drawing too)"""
    p.js("""() => { const A = document.querySelector('.ex-area'); A.focus(); const q = document.createElement('p'); q.innerHTML = '<br>';
        A.appendChild(q); const r = document.createRange(); r.setStart(q, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    sleep(0.1)
    if text:
        P.keyboard.type(text)
        sleep(0.1)


def select_text(t):
    ok = p.js("""(t) => { const A = document.querySelector('.ex-area'); A.focus(); const w = document.createTreeWalker(A, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { const i = n.nodeValue.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } } return false; }""", t)
    sleep(0.12)
    return ok


def tb(cmd):
    P.click(f'.ex-tb [data-cmd="{cmd}"]')
    sleep(0.15)


def has(sel):
    return p.js("(s) => !!document.querySelector(s)", sel)


def count(sel):
    return p.js("(s) => document.querySelectorAll(s).length", sel)


def text(sel):
    return p.js("(s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }", sel)


def visible(sel):
    return P.locator(sel).first.is_visible()


def att(expr='a'):
    return p.js(f"() => {{ const a = {E}.att; return {expr}; }}")


def skew_to_left(ms):
    """move the exam's clock on so that ms are left"""
    p.js(f"(ms) => {{ const a = {E}.att; {E}.skew = Date.parse(a.deadline) - Date.now() - ms; {E}._tickNow(); }}", ms)


def no_errors(what):
    check(not p.errors, f'no errors on the page ({what}): ' + '; '.join(p.errors[:3]))


# ====================================================================== the papers (the files themselves)
index = json.load(open(os.path.join(SITE, 'exams', 'index.json'), encoding='utf-8'))
papers = {x['id']: json.load(open(os.path.join(SITE, 'exams', x['file']), encoding='utf-8')) for x in index['papers']}
check(set(papers) == {'tour', 'practice-essay', 'calculations'}, f'three papers are listed in exams/index.json: {sorted(papers)}')
for pid, paper in papers.items():
    qs = paper['questions']
    ids = [q['id'] for q in qs]
    ok = len(ids) == len(set(ids)) and all(q['type'] in ('info', 'essay', 'short', 'numeric', 'mcq') for q in qs)
    ok = ok and all(q.get('guidance') for q in qs if q['type'] != 'info')
    ok = ok and all(isinstance(q.get('answer'), (int, float)) and q.get('units') and (q.get('tolerance') is not None or q.get('tolerancePct') is not None) for q in qs if q['type'] == 'numeric')
    ok = ok and all(0 <= q['correct'] < len(q['options']) for q in qs if q['type'] == 'mcq')
    check(ok, f'the paper {pid} is well formed (unique ids, guidance, numeric answers with units and tolerances)')
t = papers['tour']
check(t['minutes'] == 20 and [q['type'] for q in t['questions']] == ['info', 'short', 'numeric', 'mcq'] and t['questions'][1]['words'] == {'max': 300, 'hard': True},
      'paper 1 (20 minutes): an information page, a 300-word short essay, a numerical question and a multiple-choice question')
e2 = papers['practice-essay']
check(e2['minutes'] == 45 and len(e2['questions']) == 1 and e2['questions'][0]['words']['max'] == 1000 and 'marks' in e2['questions'][0]['guidance'].lower(),
      'paper 2: one essay of at most 1000 words in 45 minutes, with marking guidance')
cq = {q['id']: q for q in papers['calculations']['questions']}
check(6 <= len(cq) <= 8 and all(q['type'] == 'numeric' for q in cq.values()) and {'type': 'calculator'} in papers['calculations']['resources'],
      f'paper 3: {len(cq)} numerical questions, with the calculator among its resources')
# every answer worked out again here
R, F = 8.314462618, 96485.33212
expect = {
    'graticule': 6 * 100 / 25,
    'mito': 50e3 / 25000,
    'c1v1': 0.15 * 50 / 2.0,
    'dilution': 5000 * 20 / (20 + 980),
    'haemocytometer': (52 + 47 + 55 + 46) / 4 / (1 * 1 * 0.1 * 1e-3) * 2,
    'flow': 90 / (2 + 1 / (1 / 6 + 1 / 3) + 1),
    'tau': 50e6 * 200e-12 * 1e3,
    'nernst': R * 310.15 / F * math.log(5 / 140) * 1e3,
}
for k, v in expect.items():
    q = cq[k]
    tol = q.get('tolerance', abs(q['answer']) * q.get('tolerancePct', 0) / 100)
    check(abs(q['answer'] - v) <= tol, f'the answer to {k} is right: {q["answer"]} {q["units"]} (worked out here: {v:.4g})')
check(abs(t['questions'][2]['answer'] - 3.0e3 / (20e3 / 50)) < 1e-9, 'the answer to the scale-bar question of paper 1 is right (7.5 µm)')

# ====================================================================== the start view
p.js("() => MG.app.showWorkbench('exam')")
p.wait(f"() => {E} && document.querySelectorAll('.ex-card').length === 3", timeout=30000)
cards = p.js("() => Array.from(document.querySelectorAll('.ex-card')).map(c => [c.querySelector('h4').textContent, c.querySelector('.ex-cmeta').textContent])")
check(cards == [['Getting to know exam practice', '20 minutes · 3 questions · 13 marks'], ['Practice essay (45 minutes)', '45 minutes · 1 question · 25 marks'],
                ['Calculations', '40 minutes · 8 questions · 16 marks']], f'the papers are listed with their time, questions and marks: {cards}')
check(has('.ex-home button.btn') and 'None yet' in text('.ex-home'), 'there is a free essay, and no attempts yet')
P.fill('.ex-cand input >> nth=0', 'B4827')
P.fill('.ex-cand input >> nth=1', 'Ada Lovelace')
sleep()
check(p.js("() => MG.store.get('exam').candidate") == 'B4827' and p.js("() => MG.store.get('exam').name") == 'Ada Lovelace', 'the candidate number and name are kept')
p.shot('exam-home')

# ====================================================================== paper 1: the start page
P.click('.ex-card[data-paper="tour"] .btn')
p.wait("() => document.querySelector('.ex-startcard')")
facts = p.js("() => Array.from(document.querySelectorAll('.ex-facts dd')).map(d => d.textContent)")
check(facts[:3] == ['20 minutes', '3', '13'], f'the start page gives the time, the questions and the marks: {facts}')
check(ev('exam:open', "d.paper === 'tour' && d.title === 'Getting to know exam practice'") == 1, 'exam:open fired for the paper')
p.shot('exam-start')
P.click('.ex-startacts .btn.primary')
p.wait("() => document.querySelector('.ex-player .ex-q')")
check(ev('exam:start', "d.paper === 'tour'") == 1, 'exam:start fired')
check(text('.ex-cname') == 'B4827 Ada Lovelace', f'the candidate number and name are at the top, in bold: {text(".ex-cname")}')
check(text('.ex-timer') == '20 minutes remaining', f'the time remaining is under them: {text(".ex-timer")}')
check(att('a.deadline && Date.parse(a.deadline) - Date.parse(a.started)') == 20 * 60000, 'the attempt has a deadline 20 minutes after it started')
check(p.js("() => MG.app.fs.exists('~/essays/tour-1.exam.json')"), 'the attempt is a file: ~/essays/tour-1.exam.json')
tiles = p.js("() => Array.from(document.querySelectorAll('.ex-tiles .ex-tile')).map(t => t.textContent)")
check(tiles == ['i', '1', '2', '3'], f'the tiles: an information page (i), then the questions: {tiles}')
check(p.js("() => document.querySelector('.ex-tiles .ex-tile').classList.contains('on')") and has('.ex-tile.toc') and has('.ex-tile.review'),
      'the information tile is the current one; the contents button is on the left, the review tile on the right')
res = p.js("() => Array.from(document.querySelectorAll('.ex-res .ex-resbtn')).map(b => b.textContent)")
check(res == ['Calculator', 'Lung', 'Small intestine'], f'the resources: the calculator and the paper’s slides: {res}')
check(p.js("() => document.querySelector('.ex-fab.prev').disabled") and visible('.ex-fab.next'), 'Previous is greyed out on the first page; Next is there')
p.js("() => { window.SC = []; window._scope = MG.actions.scope; MG.actions.scope = (s) => { SC.push(s); }; }")
P.click('.ex-resbtn:has-text("Lung")')
check(p.js("() => SC") == ['lung'], 'a slide among the resources opens in the microscope (MG.actions.scope)')
p.js("() => { MG.actions.scope = window._scope; }")
P.click('.ex-resbtn.calcbtn')
check(p.js("() => MG.Calculator.isOpen()"), 'the Calculator button opens the calculator')
P.click('.ex-resbtn.calcbtn')
check(not p.js("() => MG.Calculator.isOpen()"), 'and closes it again')
# the timer's words
fr = p.js("() => [117*60000, 7200000, 56*60000 + 1, 3600000, 4*60000 + 37000, 61000, 1000, 0].map(MG.examUtil.fmtRemaining)")
check(fr == ['1 hour, 57 minutes remaining', '2 hours remaining', '57 minutes remaining', '1 hour remaining', '4 minutes, 37 seconds remaining',
             '1 minute, 1 second remaining', '1 second remaining', 'Time is up'], f'the time is written out as in the exam: {fr}')

# ====================================================================== question 1: typing and the word count
P.click('.ex-fab.next')
p.wait("() => document.querySelector('.ex-area')")
check(ev('exam:nav', "d.paper === 'tour' && d.q === 'tissue'") >= 1, 'exam:nav fired for question 1')
check(text('.ex-qn') == '1' and text('.ex-qt') == 'A tissue under the microscope' and has('.ex-q.split .ex-left .ex-qtext') and has('.ex-right .ex-ed'),
      'question 1: the number, the title, the question on the left and the answer on the right')
check(text('.ex-explain b') == 'Write your answer here' and text('.ex-marks') == 'Maximum marks: 10', 'it says "Write your answer here" and "Maximum marks: 10"')
check(p.js("() => { const a = document.querySelector('.ex-area'); return a.getAttribute('spellcheck') === 'false' && a.getAttribute('lang') === 'en-GB' && a.getAttribute('role') === 'textbox'; }"),
      'the answer box is a text box in British English, with the spelling checker off (as in most exams)')
check(words_text() == 'Words: 0/300', f'the word count starts at 0 of 300: {words_text()}')
caret_end()
P.keyboard.type('The lung is made of many alveoli. ')
sleep(0.3)
check(words_text() == 'Words: 7/300', f'the word count counts the words typed: {words_text()}')
p.wait("() => EV.some(e => e[0] === 'exam:words' && e[1].q === 'tissue' && e[1].words === 7)", timeout=5000)
check(True, 'exam:words fired with the number of words (debounced)')
# the hard limit: 298 words, then three more typed – the third is refused
w298 = ' '.join(f'w{i}' for i in range(298))
p.js(f"(h) => {E}.ed.setHTML(h)", f'<p>{w298}</p>')
caret_end()
P.keyboard.type(' alpha beta gamma delta')
sleep(0.3)
check(words_text() == 'Words: 300/300', f'typing stops at the limit of 300 words: {words_text()}')
check('beta' in area_html() and 'gamma' not in area_html() and 'delta' not in area_html(), 'the words after the limit were not typed')
check(p.js("() => document.querySelector('.ex-wc').classList.contains('over') && getComputedStyle(document.querySelector('.ex-wc')).color === 'rgb(164, 22, 26)'"),
      'the word count turns red at the limit')
check('limit of 300 words' in text('.ex-ednote'), f'a note says the limit is reached: {text(".ex-ednote")}')
p.wait("() => EV.some(e => e[0] === 'exam:words' && e[1].paper === 'tour' && e[1].q === 'tissue' && e[1].words === 300)", timeout=4000)
check(ev('exam:words', "d.paper === 'tour' && d.words > 59") >= 1, 'exam:words fired with the new count when the typing paused (paper=tour words>59)')
# pasting at the limit: nothing goes in; with room for 2 words, 2 go in
PASTE = """(a) => { const A = document.querySelector('.ex-area'); A.focus(); const dt = new DataTransfer(); if (a.html) dt.setData('text/html', a.html);
    dt.setData('text/plain', a.text || ''); A.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""
p.js(PASTE, {'text': 'one two three'})
sleep(0.2)
check(words_text() == 'Words: 300/300' and 'three' not in area_html(), 'pasting at the limit puts nothing in')
p.js(f"(h) => {E}.ed.setHTML(h)", '<p>' + ' '.join(f'w{i}' for i in range(298)) + '</p>')
caret_end()
P.keyboard.type(' ')
p.js(PASTE, {'text': 'one two three four'})  # (at once: the paste goes where the cursor is now)
sleep(0.2)
check(words_text() == 'Words: 300/300' and 'two' in area_html() and 'three' not in area_html(), f'a paste is cut to the words that fit: {words_text()}')
# back to an empty answer
P.keyboard.press('Control+A')
P.keyboard.press('Delete')
sleep(0.2)
check(words_text() == 'Words: 0/300', f'deleting everything leaves 0 words: {words_text()}')
p.js(f"() => {E}.ed.setHTML('')")
p.js("() => document.querySelector('.ex-area').focus()")
sleep(0.1)

# ====================================================================== the toolbar, button by button
P.keyboard.type('Alveoli are thin walled sacs where gas exchange happens')
sleep(0.2)
select_text('thin')
tb('bold')
check(p.js("() => { const b = document.querySelector('.ex-area b, .ex-area strong'); return b && b.textContent === 'thin'; }"), 'Bold makes the selected word bold')
check(p.js("() => document.querySelector('.ex-tb [data-cmd=bold]').getAttribute('aria-pressed')") == 'true', 'the Bold button shows that the selection is bold')
select_text('walled')
P.keyboard.press('Control+i')
sleep(0.15)
check(p.js("() => { const b = document.querySelector('.ex-area i, .ex-area em'); return b && b.textContent === 'walled'; }"), 'Ctrl+I makes the selection italic')
select_text('sacs')
tb('underline')
check(p.js("() => { const b = document.querySelector('.ex-area u'); return b && b.textContent === 'sacs'; }"), 'Underline underlines the selection')
select_text('happens')
tb('italic')
tb('removeFormat')
check(not p.js("() => [...document.querySelectorAll('.ex-area i, .ex-area em')].some(x => x.textContent.includes('happens'))"), 'Remove format takes the formatting away again')
new_paragraph_at_end('CO2 diffuses out and the volume is 5 cm3')
select_text('2 diffuses')
p.js("""() => { const s = getSelection(); const r = s.getRangeAt(0); r.setEnd(r.startContainer, r.startOffset + 1); s.removeAllRanges(); s.addRange(r); }""")
sleep(0.12)
tb('subscript')
check(p.js("() => { const x = document.querySelector('.ex-area sub'); return x && x.textContent === '2'; }"), 'Subscript: CO₂')
select_text('cm3')
p.js("""() => { const s = getSelection(); const r = s.getRangeAt(0); r.setStart(r.startContainer, r.startOffset + 2); s.removeAllRanges(); s.addRange(r); }""")
sleep(0.12)
tb('superscript')
check(p.js("() => { const x = document.querySelector('.ex-area sup'); return x && x.textContent === '3'; }"), 'Superscript: cm³')
# headings
new_paragraph_at_end('Structure')
P.select_option('.ex-fmt', 'h2')
sleep(0.15)
check(p.js("() => { const x = document.querySelector('.ex-area h2'); return x && x.textContent === 'Structure'; }"), 'Paragraph format → Heading 2 makes a heading')
check(p.js("() => document.querySelector('.ex-fmt').value") == 'h2', 'the paragraph format box shows the heading')
new_paragraph_at_end()
P.select_option('.ex-fmt', 'p')
sleep(0.1)
# a numbered list, indented and outdented
tb('ol')
P.keyboard.type('first point')
P.keyboard.press('Enter')
P.keyboard.type('second point')
sleep(0.15)
check(p.js("() => { const o = document.querySelector('.ex-area ol'); return !!o && o.querySelectorAll('li').length === 2; }"), 'the numbered list button makes a numbered list')
tb('indent')
check(p.js("() => !!document.querySelector('.ex-area ol ol, .ex-area ol ul, .ex-area li ol')"), 'Increase indent in a list makes a list inside the list')
tb('outdent')
check(p.js("() => !document.querySelector('.ex-area ol ol, .ex-area li ol') && document.querySelectorAll('.ex-area ol > li').length === 2"), 'Decrease indent brings it back')
P.keyboard.press('Enter')
P.keyboard.press('Enter')
tb('ul')
P.keyboard.type('a bullet')
sleep(0.15)
check(p.js("() => { const u = document.querySelector('.ex-area ul'); return !!u && u.textContent.includes('a bullet'); }"), 'the bulleted list button makes a bulleted list')
tb('ul')
check(p.js("() => ![...document.querySelectorAll('.ex-area ul li')].some(li => li.textContent.includes('a bullet'))"), 'pressing it again takes the bullet away')
# indenting a paragraph
new_paragraph_at_end('An indented paragraph')
tb('indent')
check(p.js("() => [...document.querySelectorAll('.ex-area p')].some(x => x.textContent === 'An indented paragraph' && x.getAttribute('data-indent') === '1')"), 'Increase indent indents a paragraph')
tb('indent')
tb('outdent')
check(p.js("() => [...document.querySelectorAll('.ex-area p')].some(x => x.textContent === 'An indented paragraph' && x.getAttribute('data-indent') === '1')"), 'Decrease indent moves it back one step')
# a special character
new_paragraph_at_end('Resistance in ')
tb('special')
check(visible('.ex-special') and count('.ex-sgrid button') > 80, 'Ω opens the special characters')
P.click('.ex-sgrid button[aria-label="ohm, or capital omega"]')
sleep(0.15)
check('Resistance in Ω' in area_html(), 'a special character is put in where the cursor was')
# a table, and its menu
new_paragraph_at_end()
tb('table')
check(visible('.ex-dlg form.ex-form'), 'the table button asks for the rows and columns')
P.fill('.ex-dlg input[type=number] >> nth=0', '3')
P.fill('.ex-dlg input[type=number] >> nth=1', '2')
P.click('.ex-dlg button.primary')
sleep(0.2)
shape = p.js("() => { const t = document.querySelector('.ex-area table'); return t ? [t.querySelectorAll('thead th').length, t.querySelectorAll('tbody tr').length, t.querySelectorAll('tr').length] : null; }")
check(shape == [2, 2, 3], f'a table of 3 rows (a header row) and 2 columns: {shape}')
P.click('.ex-area table th >> nth=0')
P.keyboard.type('Vessel')
P.click('.ex-area table th >> nth=1')
P.keyboard.type('Wall')
P.click('.ex-area table td >> nth=0')
P.keyboard.type('Capillary')
P.click('.ex-area table td >> nth=1')
P.keyboard.type('One cell thick')
sleep(0.1)
P.click('.ex-area table td >> nth=1', button='right')
sleep(0.15)
check(visible('.popmenu') and 'Insert a row below' in text('.popmenu'), 'right-clicking a cell opens the table menu')
P.click('.popmenu button:has-text("Insert a row below")')
sleep(0.15)
check(count('.ex-area table tr') == 4, 'Insert a row below adds a row')
P.click('.ex-area table td >> nth=0', button='right')
P.click('.popmenu button:has-text("Insert a column after")')
sleep(0.15)
check(p.js("() => document.querySelector('.ex-area table tr').children.length") == 3, 'Insert a column after adds a column')
P.click('.ex-area table td >> nth=1', button='right')
P.click('.popmenu button:has-text("Delete the column")')
sleep(0.15)
check(p.js("() => [...document.querySelectorAll('.ex-area table tr')].every(r => r.children.length === 2)") and 'One cell thick' in area_html(), 'Delete the column removes the (empty) column')
check(-1 < area_text().find('Resistance in Ω') < area_text().find('Vessel'), 'the table was put in where the cursor was (after the last paragraph)')
P.click('.ex-area table td >> nth=2', button='right')
P.click('.popmenu button:has-text("Delete the row")')
sleep(0.15)
check(count('.ex-area table tr') == 3, 'Delete the row removes a row')
# a drawing
new_paragraph_at_end()
tb('drawing')
check(visible('.ex-draw canvas'), 'the pencil opens the drawing tool')
box = P.locator('.ex-dcanvas').bounding_box()
x0, y0 = box['x'], box['y']
P.mouse.move(x0 + 60, y0 + 60)
P.mouse.down()
P.mouse.move(x0 + 160, y0 + 120, steps=8)
P.mouse.up()
P.click('.ex-dt[aria-label="Rectangle"]')
P.mouse.move(x0 + 220, y0 + 50)
P.mouse.down()
P.mouse.move(x0 + 380, y0 + 160, steps=6)
P.mouse.up()
P.click('.ex-dt[aria-label="Arrow"]')
P.click('.ex-dcol >> nth=1')
P.mouse.move(x0 + 420, y0 + 200)
P.mouse.down()
P.mouse.move(x0 + 300, y0 + 120, steps=6)
P.mouse.up()
P.click('.ex-dt[aria-label="Text"]')
P.mouse.click(x0 + 230, y0 + 180)
sleep(0.15)
P.keyboard.type('Alveolus')
P.keyboard.press('Enter')
sleep(0.1)
p.shot('exam-drawing')
P.click('.ex-draw button:has-text("Save and close")')
sleep(0.25)
sleep(0.2)
dr = p.js("""() => { const i = document.querySelector('.ex-area img.ex-drawing'); if (!i) return null;
    return [+i.getAttribute('width'), +i.getAttribute('height'), i.naturalWidth, i.naturalHeight, i.src.slice(0, 22), JSON.parse(decodeURIComponent(i.getAttribute('data-drawing'))).shapes.map(s => s.t)]; }""")
check(dr and dr[4:] == ['data:image/png;base64,', ['pen', 'rect', 'arrow', 'text']], f'Save and close puts the drawing in as a picture that remembers its shapes: {dr}')
check(dr and 160 <= dr[0] < 600 and 90 <= dr[1] < 380 and dr[0] == dr[2] and dr[1] == dr[3], f'the picture is cut to what was drawn (not the whole 640 × 400 area): {dr[:4] if dr else dr}')
check(p.js("() => !!(document.querySelector('.ex-area table').compareDocumentPosition(document.querySelector('.ex-area img.ex-drawing')) & Node.DOCUMENT_POSITION_FOLLOWING)"),
      'the drawing was put in where the cursor was (after the table)')
P.dblclick('.ex-area img.ex-drawing')
sleep(0.2)
check(visible('.ex-draw canvas'), 'double-clicking the drawing opens it again')
P.click('.ex-draw button:has-text("Undo")')
P.click('.ex-draw button:has-text("Discard changes")')
sleep(0.15)
check(p.js("() => JSON.parse(decodeURIComponent(document.querySelector('.ex-area img.ex-drawing').getAttribute('data-drawing'))).shapes.length") == 4, 'Discard changes leaves the drawing as it was')
# the other tools: line, ellipse, eraser; then Clear takes a drawing away
new_paragraph_at_end()
tb('drawing')
box = P.locator('.ex-dcanvas').bounding_box()
x0, y0 = box['x'], box['y']
for tool, a, b in [('Line', (40, 40), (200, 60)), ('Ellipse', (250, 60), (400, 160)), ('Eraser', (60, 45), (120, 52))]:
    P.click(f'.ex-dt[aria-label="{tool}"]')
    P.mouse.move(x0 + a[0], y0 + a[1])
    P.mouse.down()
    P.mouse.move(x0 + b[0], y0 + b[1], steps=5)
    P.mouse.up()
P.select_option('.ex-dtools select', '7')
P.click('.ex-draw button:has-text("Save and close")')
sleep(0.25)
check(p.js("() => [...document.querySelectorAll('.ex-area img.ex-drawing')].map(i => JSON.parse(decodeURIComponent(i.getAttribute('data-drawing'))).shapes.map(s => s.t).join(','))") == ['pen,rect,arrow,text', 'line,ellipse,eraser'],
      'the line, ellipse and eraser tools draw')
P.dblclick('.ex-area img.ex-drawing >> nth=1')
sleep(0.2)
P.click('.ex-draw button:has-text("Clear")')
P.click('.ex-draw button:has-text("Save and close")')
sleep(0.2)
check(count('.ex-area img.ex-drawing') == 1, 'Clear, then Save and close, takes the drawing away')
# a formula
new_paragraph_at_end('The flow is ')
tb('formula')
check(visible('.ex-formula-dlg') and text('.ex-dlg .modal-h h3') == 'Edit formula', 'Σ opens the formula editor')
P.fill('.ex-ftex', '\\frac{a')
sleep(0.1)
check(p.js("() => document.querySelector('.ex-formula-dlg .btn.primary').disabled") and text('.ex-ferr') == 'A } is missing.', 'a formula with a mistake says what is wrong, and cannot be put in')
P.fill('.ex-ftex', '')
P.click('.ex-fgroup button[aria-label="Fraction"]')
P.keyboard.type('\\Delta P')
P.keyboard.press('Tab')  # (out of the box: the fraction's bottom is put in by typing it again)
P.fill('.ex-ftex', 'Q = \\frac{\\Delta P}{R}')
sleep(0.15)
check(has('.ex-fprev .mfrac') and 'Δ' in text('.ex-fprev'), 'the preview draws the fraction as you type')
P.click('.ex-formula-dlg .btn.primary')
sleep(0.2)
check(p.js("() => { const f = document.querySelector('.ex-area .ex-formula'); return f && f.getAttribute('data-tex') === 'Q = \\\\frac{\\\\Delta P}{R}' && f.getAttribute('contenteditable') === 'false' && !!f.querySelector('.mfrac'); }"),
      'Insert puts the formula in, as a block that remembers its source and cannot be typed into')
check(p.js("() => document.querySelector('.ex-area .ex-formula').parentElement.textContent.startsWith('The flow is')"), 'the formula was put in where the cursor was')
P.dblclick('.ex-area .ex-formula')
sleep(0.2)
check(p.js("() => document.querySelector('.ex-ftex').value") == 'Q = \\frac{\\Delta P}{R}' and text('.ex-formula-dlg .btn.primary') == 'Done', 'double-clicking a formula opens it again, with Done')
P.fill('.ex-ftex', '\\tau = RC')
P.click('.ex-formula-dlg .btn.primary')
sleep(0.2)
check(p.js("() => [...document.querySelectorAll('.ex-area .ex-formula')].map(f => f.getAttribute('data-tex'))") == ['\\tau = RC'], 'Done changes the formula')
p.js("""() => { const f = document.querySelector('.ex-area .ex-formula'); document.querySelector('.ex-area').focus(); const r = document.createRange(); r.selectNode(f);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
sleep(0.12)
tb('formula')
check(p.js("() => document.querySelector('.ex-ftex').value") == '\\tau = RC', 'a selected formula is opened by the Σ button (for the keyboard)')
P.keyboard.press('Escape')
tx = p.js("() => [MG.ExamTeX.text('x^{2}'), MG.ExamTeX.text('C_{1}V_{1} = C_{2}V_{2}'), MG.ExamTeX.text('\\\\frac{a}{b}'), MG.ExamTeX.text('\\\\text{mm Hg}'), MG.ExamTeX.check('[X]_{o}')]")
check(tx == ['x²', 'C₁V₁ = C₂V₂', 'a/b', 'mm Hg', None], f'formulas as text: {tx}')
# copy and paste with the buttons
select_text('Alveoli')
tb('copy')
clip = p.js("async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR ' + e.message; } }")
check(clip == 'Alveoli', f'Copy copies the selection: {clip!r}')
new_paragraph_at_end()
p.js("async () => navigator.clipboard.writeText('pasted from the clipboard')")
tb('paste')
sleep(0.3)
check('pasted from the clipboard' in area_html(), 'Paste puts in what is on the clipboard')
# pasting from a word processor: the formatting stays, the rest goes
new_paragraph_at_end()
p.js(PASTE, {'html': '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-1"><p style="font-family:Arial;color:red"><span style="font-weight:700">Strong</span> and <span style="font-style:italic">slanted</span> words <img src="https://example.com/x.png"><script>window.HACK=1</script><a href="javascript:alert(1)">link</a></p></b>',
             'text': 'Strong and slanted words link'})
sleep(0.2)
h = area_html()
check('<b>Strong</b>' in h and '<i>slanted</i>' in h, 'pasted bold and italic text keeps its bold and italic')
check('style=' not in h and 'example.com' not in h and 'script' not in h and 'javascript' not in h and 'HACK' not in h and not p.js("() => window.HACK"),
      'pasting removes the styles, pictures, scripts and links of other programs')
# undo and redo
caret_end()
P.keyboard.type(' zzz')
sleep(0.1)
P.keyboard.press('Control+z')
sleep(0.15)
check('zzz' not in area_text(), 'Ctrl+Z undoes the typing')
P.keyboard.press('Control+y')
sleep(0.15)
check('zzz' in area_text(), 'Ctrl+Y redoes it')
tb('undo')
check('zzz' not in area_text(), 'the Undo button undoes')
tb('redo')
check('zzz' in area_text(), 'the Redo button redoes')
tb('undo')
# the backups
tb('backup')
check(visible('.ex-backups'), 'the backup button shows the backup copies')
P.click('.ex-backups button:has-text("Keep a copy now")')
sleep(0.2)
n_bk = att("(a.backups.tissue || []).length")
check(n_bk >= 1 and count('.ex-bklist li') >= 1, f'a copy is kept ({n_bk})')
P.keyboard.press('Escape')
sleep(0.1)
caret_end()
P.keyboard.type(' RUINED')
sleep(0.2)
tb('backup')
P.click('.ex-bklist li >> nth=0 >> button:has-text("Restore this copy")')
sleep(0.25)
check('RUINED' not in area_text() and 'Alveoli' in area_text(), 'Restore this copy brings the copy back')
check(att("(a.backups.tissue || []).some(b => b.html.includes('RUINED'))"), 'the answer that was there is kept as a copy first')
check(ev('exam:format', "d.cmd === 'restore'") == 1, 'exam:format fired for the restore')
# expand
tb('expand')
sleep(0.2)
bb = P.locator('.ex-player').bounding_box()
check(p.js("() => document.querySelector('.ex-app').classList.contains('ex-expanded')") and bb['x'] == 0 and bb['width'] == 1500 and not visible('.ex-left .ex-qtext'),
      'Expand fills the window with the answer, without the question')
p.shot('exam-expanded')
p.js("() => document.querySelector('.ex-area').focus()")
P.keyboard.press('Escape')
sleep(0.15)
check(not p.js("() => document.querySelector('.ex-app').classList.contains('ex-expanded')"), 'Esc goes back to the normal view')
# the keyboard: Alt+F10 to the toolbar, the arrows along it, Esc back
p.js("() => document.querySelector('.ex-area').focus()")
P.keyboard.press('Alt+F10')
sleep(0.1)
check(p.js("() => !!document.activeElement.closest('.ex-tb')"), 'Alt+F10 goes to the toolbar')
P.keyboard.press('ArrowRight')
check(p.js("() => document.activeElement.dataset.cmd") == 'bold', 'the right arrow moves along the toolbar')
P.keyboard.press('Escape')
check(p.js("() => document.activeElement.classList.contains('ex-area')"), 'Esc goes back to the answer')
cmds = sorted(set(e[1]['cmd'] for e in evs() if e[0] == 'exam:format'))
want = ['backup', 'bold', 'copy', 'drawing', 'expand', 'formula', 'heading', 'indent', 'italic', 'ol', 'outdent', 'paste', 'redo', 'removeFormat', 'restore',
        'special', 'subscript', 'superscript', 'table', 'ul', 'underline', 'undo']
check(all(c in cmds for c in want), f'exam:format fired for every button: missing {[c for c in want if c not in cmds]}')
wc = p.js(f"() => {E}.ed.words()")
check(wc == p.js("() => MG.examUtil.countWords(MG.examUtil.plainText(document.querySelector('.ex-area'), true))") and 40 < wc < 120, f'the word count of the whole answer ({wc}); a formula counts as one word')
p.shot('exam-essay')
st = p.js("""() => { const m = document.querySelector('.ex-pmain'); m.scrollTop = 450; const t = document.querySelector('.ex-tb').getBoundingClientRect().top;
    return [Math.round(t - m.getBoundingClientRect().top), m.scrollTop]; }""")
check(st[1] > 0 and 0 <= st[0] <= 2, f'the toolbar stays at the top while a long answer scrolls: {st}')
p.js("() => { document.querySelector('.ex-pmain').scrollTop = 0; }")
p.js(PASTE, {})
check('Only text can be pasted' in (text('.ex-ednote') or ''), 'pasting a picture says that only text can be pasted')
no_errors('the toolbar')

# ====================================================================== flags and navigation
P.click('.ex-flag')
sleep(0.15)
check(p.js("() => document.querySelector('.ex-flag').getAttribute('aria-pressed')") == 'true' and text('.ex-flag') == '' and
      p.js("() => document.querySelector('.ex-flag').getAttribute('aria-label')") == 'Unflag this question', 'the flag marks the question ("Unflag this question")')
check(p.js("() => document.querySelectorAll('.ex-tiles .ex-tile')[1].classList.contains('flagged')"), 'its tile shows the flag')
check(ev('exam:flag', "d.q === 'tissue' && d.on === true") == 1, 'exam:flag fired')
P.click('.ex-flag')
check(ev('exam:flag', "d.q === 'tissue' && d.on === false") == 1 and not p.js("() => document.querySelectorAll('.ex-tiles .ex-tile')[1].classList.contains('flagged')"), 'and unmarks it')
check(p.js("() => document.querySelectorAll('.ex-tiles .ex-tile')[1].classList.contains('done')"), 'the tile of an answered question has a bar along the top')
P.click('.ex-fab.next')
p.wait("() => document.querySelector('.ex-num')")
check(text('.ex-qn') == '2' and text('.ex-units') == 'µm' and text('.ex-marks') == 'Maximum marks: 2', 'question 2 asks for a number, in µm')
P.click('.ex-flag')
P.fill('.ex-num', '7.5')
p.wait("() => document.querySelectorAll('.ex-tiles .ex-tile')[2].classList.contains('done')", timeout=3000)
check(True, 'a number typed counts as an answer (its tile has the bar)')
P.click('.ex-tiles .ex-tile >> nth=3')
p.wait("() => document.querySelector('.ex-mcq')")
check(text('.ex-qn') == '3' and count('.ex-opt') == 4 and ev('exam:nav', "d.q === 'formula'") >= 1, 'clicking a tile goes to that question (a multiple-choice one)')
P.click('.ex-fab.prev')
p.wait("() => document.querySelector('.ex-num')")
check(p.js("() => document.querySelector('.ex-num').value") == '7.5', 'Previous goes back, and the answer is still there')
P.click('.ex-tile.toc')
sleep(0.2)
check(text('.ex-subhead h2') == 'Contents' and count('.ex-qtable tbody tr') == 3, 'the contents button lists the questions')
P.click('.ex-qtable tbody tr >> nth=0')
p.wait("() => document.querySelector('.ex-area')")
check(text('.ex-qn') == '1' and 'Alveoli' in area_html(), 'a row of the contents goes to its question, with its answer')

# ====================================================================== the options menu
P.click('.ex-menubtn')
sleep(0.15)
mt = text('.ex-menu')
check(all(x in mt for x in ['Go to submission page', 'Text size', 'Regular', 'Large', 'Extra large', 'Contrast', 'Default', 'Inverted', 'Yellow on black', 'Black on cream',
                            'Black on light blue', 'Remaining time', 'Show', 'Hide', 'Spelling checker', 'On', 'Off', 'Keyboard help']), 'the menu ☰ has everything')
p.shot('exam-menu')
P.click('.ex-mchoice:has-text("Extra large")')
check(p.js("() => getComputedStyle(document.querySelector('.ex-player')).fontSize") == '22px', 'Text size → Extra large makes the text larger')
P.click('.ex-mchoice:has-text("Yellow on black")')
check(p.js("() => [getComputedStyle(document.querySelector('.ex-q')).backgroundColor, getComputedStyle(document.querySelector('.ex-qt')).color]") == ['rgb(0, 0, 0)', 'rgb(255, 255, 0)'],
      'Contrast → Yellow on black')
p.shot('exam-contrast-yellow')
for name, attr in [('Inverted', 'inverted'), ('Black on cream', 'cream'), ('Black on light blue', 'blue')]:
    P.click(f'.ex-mchoice:has-text("{name}")')
    check(p.js("() => document.querySelector('.ex-player').dataset.contrast") == attr, f'Contrast → {name}')
p.shot('exam-contrast-blue')
P.click('.ex-mchoice:has-text("Default")')
P.click('.ex-mchoice:has-text("Regular")')
P.click('.ex-mgroup[aria-label="Remaining time"] .ex-mchoice:has-text("Hide")')
check(text('.ex-timer') == 'Time hidden', 'the remaining time can be hidden')
P.click('.ex-mgroup[aria-label="Remaining time"] .ex-mchoice:has-text("Show")')
check(text('.ex-timer').endswith('remaining'), 'and shown again')
P.click('.ex-mgroup[aria-label="Spelling checker"] .ex-mchoice:has-text("On")')
check(p.js("() => document.querySelector('.ex-area').getAttribute('spellcheck')") == 'true' and att('a.settings.spellcheck') is True, 'the spelling checker can be switched on')
P.click('.ex-mi:has-text("Keyboard help")')
sleep(0.15)
check('Alt' in text('.modal .ex-keys') and 'F10' in text('.modal .ex-keys'), 'Keyboard help tells how to reach the toolbar (Alt+F10)')
P.keyboard.press('Escape')
check(p.js("() => MG.store.get('exam').size") == 'regular' and p.js("() => MG.store.get('exam').contrast") == 'default', 'the settings are kept')
no_errors('the menu')

# ====================================================================== saving, and carrying on after a reload
p.wait("() => document.querySelector('.ex-status').textContent === 'Saved'", timeout=10000)
check(p.js("() => /^Saved in this browser at \\d\\d:\\d\\d:\\d\\d$/.test(document.querySelector('.ex-status').title)"), f'the saved sign says when: {p.js("() => document.querySelector(\'.ex-status\').title")}')
saved = p.js("async () => JSON.parse(await MG.app.fs.readText('~/essays/tour-1.exam.json'))")
check('Alveoli' in saved['answers']['tissue']['html'] and saved['answers']['scale-bar']['value'] == '7.5' and saved['answers']['scale-bar']['flag'] is True,
      'the answers and the flags are saved in the file')
check(ev('exam:saved', "d.path === '/home/user/essays/tour-1.exam.json'") >= 1, 'exam:saved fired with the path')
caret_end()
P.keyboard.type(' Saved before the reload.')
sleep(0.1)
p.js("() => document.querySelector('.ex-area').blur()")  # (saved when the answer box is left)
sleep(0.2)
check('Saved before the reload' in p.js("async () => (await MG.app.fs.readText('~/essays/tour-1.exam.json'))"), 'leaving the answer box saves at once')
deadline = att('a.deadline')
p.js("async () => { await MG.project.flush(); }")
ALL_EV += evs()
p.open()
p.js(EVJS)
p.js("() => MG.app.showWorkbench('exam')")
p.wait(f"() => {E} && document.querySelector('.ex-player .ex-area')", timeout=30000)
check('Saved before the reload' in area_html() and text('.ex-qn') == '1', 'after a reload the attempt is open again, at the same question, with the answer')
check(att('a.deadline') == deadline, 'the deadline is the same')
left = p.js(f"() => Date.parse({E}.att.deadline) - {E}.now()")
check(text('.ex-timer') == p.js("(ms) => MG.examUtil.fmtRemaining(ms)", left) and left < 20 * 60000, f'the clock carried on: {text(".ex-timer")}')
check(p.js("() => document.querySelectorAll('.ex-tiles .ex-tile')[2].classList.contains('flagged')"), 'the flag is still there')

# ====================================================================== the submission page
P.click('.ex-tile.review')
p.wait("() => document.querySelector('.ex-subhead h2')")
check(text('.ex-subhead h2') == 'Ready to submit?' and 'You have 1 unattempted question.' in text('.ex-subhead'), 'the submission page: "Ready to submit?" and one unattempted question')
tabs = p.js("() => [...document.querySelectorAll('.ex-tab')].map(b => b.textContent)")
check(tabs == ['All questions (3)', 'Not attempted (1)', 'Flagged (1)'], f'the tabs count the questions: {tabs}')
heads = p.js("() => [...document.querySelectorAll('.ex-qtable th')].map(b => b.textContent)")
check(heads == ['Question', 'Question title', 'Marks', 'Question type'], f'the table: {heads}')
rows = p.js("() => [...document.querySelectorAll('.ex-qtable tbody tr')].map(r => [...r.children].map(c => c.textContent))")
check(rows == [['1', 'A tissue under the microscope', '10', 'Short answer'], ['2', 'Real size from a scale barFlagged', '2', 'Numerical answer'],
               ['3', 'MagnificationNot attempted', '1', 'Multiple choice']], f'all questions: {rows}')
P.click('.ex-tab:has-text("Not attempted")')
check(p.js("() => [...document.querySelectorAll('.ex-qtable tbody tr')].map(r => r.children[0].textContent)") == ['3'], 'Not attempted lists question 3')
P.click('.ex-tab:has-text("Flagged")')
check(p.js("() => [...document.querySelectorAll('.ex-qtable tbody tr')].map(r => r.children[0].textContent)") == ['2'], 'Flagged lists question 2')
check(not p.js("() => document.querySelector('.ex-tile.review').classList.contains('all')"), 'the review tile is not filled in while a question has no answer')
check(ev('exam:nav', "d.q === 'submission'") >= 1, 'exam:nav fired for the submission page')
p.shot('exam-submission')
P.click('.ex-qtable tbody tr >> nth=0')
p.wait("() => document.querySelector('.ex-num')")
P.click('.ex-tiles .ex-tile >> nth=3')
p.wait("() => document.querySelector('.ex-mcq')")
P.click('.ex-opt >> nth=1')
sleep(0.2)
P.click('.ex-fab.next')
p.wait("() => document.querySelector('.ex-subhead h2')")
check('You have attempted all questions in this test.' in text('.ex-subhead') and p.js("() => document.querySelector('.ex-tile.review').classList.contains('all')"),
      'with every question answered: "You have attempted all questions in this test." and the review tile is filled in')
check(p.js("() => document.querySelector('.ex-fab.next').hidden") and visible('.ex-submit'), 'Next leads to the submission page, where "Submit now" is')

# ====================================================================== the time running out (the clock moved on)
skew_to_left(4 * 60000 + 37000 - 300)
sleep(0.3)
tt = text('.ex-timer')
check(re.fullmatch(r'4 minutes, 3[67] seconds remaining', tt) and p.js("() => document.querySelector('.ex-timer').classList.contains('soon')"), f'in the last 5 minutes the seconds are shown: {tt}')
skew_to_left(45000)
sleep(0.2)
st = p.js("() => { const c = getComputedStyle(document.querySelector('.ex-timer')); return [c.color, c.fontWeight]; }")
check(st == ['rgb(164, 22, 26)', '800'] and text('.ex-timer').startswith('4'), f'in the last minute it is bold and dark red: {st} {text(".ex-timer")}')
p.shot('exam-lastminute')
skew_to_left(-1000)
p.wait("() => EV.some(e => e[0] === 'exam:timeup')", timeout=5000)
check(ev('exam:timeup', "d.paper === 'tour'") == 1, 'exam:timeup fired')
sleep(0.2)
check(text('.ex-timer') == 'Time is up' and visible('.ex-timeup') and text('.ex-subhead h2') == 'Ready to submit?', 'time is up: the submission page says so')
check(att('a.timeUp') is True and att('a.submitted') is None, 'the attempt is locked, not yet submitted (this paper is not submitted for you)')
P.click('.ex-tiles .ex-tile >> nth=1')
p.wait("() => document.querySelector('.ex-area')")
check(p.js("() => document.querySelector('.ex-area').getAttribute('contenteditable')") == 'false' and p.js("() => document.querySelector('.ex-tb [data-cmd=bold]').disabled"),
      'after the time is up an answer cannot be changed')
P.click('.ex-tiles .ex-tile >> nth=2')
p.wait("() => document.querySelector('.ex-num')")
check(p.js("() => document.querySelector('.ex-num').disabled"), 'nor can a number')
P.click('.ex-tile.review')
p.wait("() => document.querySelector('.ex-submit')")
p.shot('exam-timeup')

# ====================================================================== submitting
P.click('.ex-submit')
sleep(0.15)
check(visible('.modal') and 'cannot change your answers' in text('.modal'), 'Submit now asks first')
P.click('.modal button:has-text("Submit now")')
p.wait("() => document.querySelector('.ex-receipt')")
rh = text('.ex-receipt h2')
check(re.fullmatch(r'You submitted at \d\d:\d\d on \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}', rh), f'the receipt: {rh}')
check(ev('exam:submit', "d.paper === 'tour' && d.answered === 3 && d.total === 3") == 1, 'exam:submit fired with the numbers of questions')
check(att('!!a.submitted') is True, 'the attempt is submitted')
p.shot('exam-receipt')


def download(label, name):
    P.click('.ex-recacts .btn.primary')
    sleep(0.1)
    with P.expect_download() as d:
        P.click(f'.popmenu button:has-text("{label}")')
    path = os.path.join(OUT, name)
    d.value.save_as(path)
    return path, d.value.suggested_filename


dpath, dname = download('Word document', 'exam-tour.docx')
check(dname == 'getting-to-know-exam-practice-b4827.docx', f'the Word file is named after the paper and the candidate: {dname}')
z = zipfile.ZipFile(dpath)
names = z.namelist()
doc = z.read('word/document.xml').decode('utf-8')
plain = re.sub(r'<[^>]+>', '', doc)
check(all(n in names for n in ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/media/image1.png']), f'the .docx has its parts: {names}')
check('Getting to know exam practice' in plain and 'Alveoli are' in plain and 'Saved before the reload' in plain and 'B4827' in plain, 'the Word file has the title, the candidate and the answer')
bold = re.findall(r'<w:r><w:rPr>(?:(?!</w:rPr>).)*<w:b/>(?:(?!</w:rPr>).)*</w:rPr><w:t[^>]*>([^<]*)</w:t>', doc)
check('thin' in bold, f'"thin" is a bold run: {bold[:8]}')
check('<w:i/>' in doc and '<w:u w:val="single"/>' in doc and '<w:vertAlign w:val="subscript"/>' in doc and '<w:vertAlign w:val="superscript"/>' in doc,
      'italic, underlined, subscript and superscript runs')
check(doc.count('<w:numPr>') >= 2 and 'first point' in plain, 'the numbered list is a list in Word')
check('<w:tbl>' in doc and 'One cell thick' in plain and '<w:tblHeader/>' in doc, 'the table is a table in Word, with its header row')
check(re.search(r'<w:tblGrid>(<w:gridCol w:w="\d+"/>){2}</w:tblGrid>', doc) is not None, 'the table has its two columns')
import xml.dom.minidom
bad = []
for n in names:
    if n.endswith('.xml') or n.endswith('.rels'):
        try:
            xml.dom.minidom.parseString(z.read(n))
        except Exception as ex:
            bad.append(f'{n}: {ex}')
check(not bad, f'every part of the Word file is well-formed XML: {bad}')
check('<w:drawing>' in doc and z.read('word/media/image1.png')[:4] == b'\x89PNG', 'the drawing is a picture in Word')
check('τ = RC' in plain, 'the formula is written as text')
check('Heading2' in doc and 'Structure' in plain, 'the heading is a heading')
check(ev('exam:download', "d.format === 'docx'") == 1, 'exam:download fired (docx)')
hpath, hname = download('Web page', 'exam-tour.html')
html = open(hpath, encoding='utf-8').read()
check(hname.endswith('.html') and '<h1 class="title">Getting to know exam practice</h1>' in html and '<b>thin</b>' in html and 'ex-formula' in html and '<table' in html,
      'the web page has the title, the formatting, the formula and the table')
tpath, tname = download('Plain text', 'exam-tour.txt')
txt = open(tpath, encoding='utf-8').read()
check(tname.endswith('.txt') and 'Alveoli are thin walled' in txt and '1. first point' in txt and 'τ = RC' in txt and '[drawing]' in txt and 'Answer: 7.5 µm' in txt,
      'the text file has the answers (lists numbered, formula as text)')
order = [txt.find(x) for x in ['Alveoli are thin', 'Resistance in Ω', 'Vessel', '[drawing]', 'The flow is', 'pasted from the clipboard']]
check(order == sorted(order) and order[0] > 0 and re.search(r'The flow is\s+τ = RC', txt), f'everything is in the order it was written: {order}')
P.click('.ex-recacts .btn.primary')
P.click('.popmenu button:has-text("Print")')
sleep(0.6)
check(p.js("() => { const f = document.querySelector('.ex-printframe'); return !!f && f.contentDocument.body.textContent.includes('Alveoli are thin'); }"), 'Print, or save as PDF prints the submission (a page of its own)')
check(ev('exam:download', "d.format === 'pdf'") == 1 and ev('exam:download', "d.format === 'html'") == 1 and ev('exam:download', "d.format === 'txt'") == 1, 'exam:download fired for each format')
P.click('.ex-recacts button:has-text("Save a Word copy")')
p.wait("() => MG.app.fs.exists('~/essays/getting-to-know-exam-practice-b4827.docx')", timeout=10000)
check(ev('exam:download', "d.format === 'docx-file' && d.path === '/home/user/essays/getting-to-know-exam-practice-b4827.docx'") == 1, 'Save a Word copy in my files saves it in ~/essays')
# the review
P.click('.ex-recacts button:has-text("Review my answers")')
p.wait("() => document.querySelector('.ex-review')")
rv = text('.ex-review')
check('Guidance' in rv and '✓ Right' in rv and 'The answer is 7.5 µm' in rv and 'The answer is B' in rv, 'the review shows the guidance and the right answers')
check(text('.ex-score') == 'Marked automatically: 3 of 3 marks', f'the numerical and multiple-choice questions are marked: {text(".ex-score")}')
check(p.js("() => document.querySelector('.ex-review .ex-area, .ex-review [contenteditable=true]') === null"), 'the review cannot be changed')
p.shot('exam-review')
P.click('.ex-revbar button:has-text("Back")')
p.wait("() => document.querySelector('.ex-receipt')")
P.click('.ex-recacts button:has-text("Start a new attempt")')
p.wait("() => document.querySelector('.ex-startcard')")
check(text('.ex-startcard h2') == 'Getting to know exam practice', 'Start a new attempt goes to the paper’s first page')
no_errors('submitting')

# ====================================================================== numerical marking
pn = p.js("""() => ['1.2 × 10^-3', '1.2e-3', '1,200', '1,5', '−4', '3.4×10⁻³', '2.5e6 cells/mL', '10^6', 'abc', '', '−89.06 mV', '7.5µm']
    .map(MG.examUtil.parseNumber).map(x => Number.isNaN(x) ? 'NaN' : x)""")
check(pn == [0.0012, 0.0012, 1200, 1.5, -4, 0.0034, 2.5e6, 1e6, 'NaN', 'NaN', -89.06, 7.5], f'numbers are read as students type them: {pn}')
nr = p.js("""() => { const R = MG.examUtil.numericRight; return [
    R({answer: 3.75, tolerance: 0.02}, '3.77'), R({answer: 3.75, tolerance: 0.02}, '3.78'), R({answer: 3.75, tolerance: 0.02}, '3.73'),
    R({answer: 1e6, tolerancePct: 1}, '1.01 x 10^6'), R({answer: 1e6, tolerancePct: 1}, '1.02e6'),
    R({answer: -89, tolerance: 1}, '−88'), R({answer: -89, tolerance: 1}, '-87.9'), R({answer: 0.0267, sigfigs: 2}, '0.027'), R({answer: 0.0267, sigfigs: 2}, '0.026'),
    R({answer: 5}, 'nothing')]; }""")
check(nr == [True, False, True, True, False, True, False, True, False, None], f'numerical answers are marked with their tolerance: {nr}')

mw = p.js("""() => { const ed = new MG.ExamEditor({ words: { min: 5, max: 10 }, showWords: true }); document.body.appendChild(ed.el); const out = [];
    for (const n of [3, 6, 10]) { ed.setHTML('<p>' + 'word '.repeat(n) + '</p>'); out.push([ed.wc.textContent, ed.wc.classList.contains('under'), ed.wc.classList.contains('over')]); }
    ed.destroy(); ed.el.remove(); return out; }""")
check(mw == [['Words: 3/10', True, False], ['Words: 6/10', False, False], ['Words: 10/10', False, True]], f'a minimum number of words is shown too: {mw}')

# ====================================================================== paper 3: calculations, marked
p.js(f"() => {E}.openPaper('calculations')")
p.wait("() => document.querySelector('.ex-startcard h2') && document.querySelector('.ex-startcard h2').textContent === 'Calculations'")
P.click('.ex-startacts .btn.primary')
p.wait("() => document.querySelector('.ex-num')")
answers = {'graticule': '24', 'mito': '2.0 µm', 'c1v1': '3.6', 'dilution': '100', 'haemocytometer': '1.0 × 10^6', 'flow': '18', 'tau': '0.01', 'nernst': '−89.06'}
for i, (k, v) in enumerate(answers.items()):
    if p.js(f"() => {E}.qcur.id") != k:
        check(False, f'question {i + 1} is {k}')
    P.fill('.ex-num', v)
    P.click('.ex-fab.next')
    sleep(0.12)
p.wait("() => document.querySelector('.ex-subhead')")
check('You have attempted all questions in this test.' in text('.ex-subhead') and text('.ex-tab') == 'All questions (8)', 'all eight answered')
check(text('.ex-res .calcbtn') == 'Calculator', 'the calculator is among the resources')
P.click('.ex-submit')
P.click('.modal button:has-text("Submit now")')
p.wait("() => document.querySelector('.ex-receipt')")
P.click('.ex-recacts button:has-text("Review my answers")')
p.wait("() => document.querySelector('.ex-review')")
check(text('.ex-score') == 'Marked automatically: 12 of 16 marks', f'six of the eight are right (12 of 16 marks): {text(".ex-score")}')
marks = p.js("() => [...document.querySelectorAll('.ex-review .right, .ex-review .wrong')].map(x => x.className)")
check(marks == ['right', 'right', 'wrong', 'right', 'right', 'right', 'wrong', 'right'], f'each answer is marked right or wrong: {marks}')
check('V1 = C2V2 ÷ C1' in text('.ex-review').replace('V<sub>1</sub>', 'V1') or 'C1V1' in text('.ex-review').replace('\u200b', '') or 'V1 = C2V2' in text('.ex-review'), 'the review shows the worked answers')
no_errors('calculations')

# ====================================================================== paper 2: submitted when the time is up
p.js(f"() => {E}.openPaper('practice-essay')")
p.wait("() => document.querySelector('.ex-startcard h2') && document.querySelector('.ex-startcard h2').textContent.startsWith('Practice essay')")
check('Your answers are submitted when the time is up' in text('.ex-startcard'), 'the start page says the answers are submitted when the time is up')
P.click('.ex-startacts .btn.primary')
p.wait("() => document.querySelector('.ex-area')")
check(words_text() == 'Words: 0/1000' and text('.ex-timer') == '45 minutes remaining', 'the essay: 0 of 1000 words, 45 minutes')
caret_end()
P.keyboard.type('Arteries carry blood away from the heart at high pressure.')
sleep(0.2)
skew_to_left(-500)
p.wait("() => document.querySelector('.ex-receipt')", timeout=6000)
check(ev('exam:timeup', "d.paper === 'practice-essay'") == 1 and ev('exam:submit', "d.paper === 'practice-essay'") == 1, 'when the time is up the essay is submitted by itself')
check('submitted when the time ran out' in text('.ex-receipt') and 'Blood vessels: 10 words' in text('.ex-receipt'), 'the receipt says so, with the number of words')
check('high pressure' in p.js("async () => JSON.parse(await MG.app.fs.readText('~/essays/practice-essay-1.exam.json')).answers.vessels.html"), 'the essay is in its file')

# ====================================================================== a free essay
p.js(f"() => {E}.home()")
p.wait("() => document.querySelector('.ex-home .ex-list')")
check(count('.modal') == 0, f'no dialog is left open: {p.js("() => [...document.querySelectorAll(`.modal h3`)].map(x => x.textContent)")}')
P.click('.ex-home button:has-text("Write an essay")')
DLG = '.modal[aria-label="An essay of your own"]'
p.wait(f"() => document.querySelector('{DLG} form')")
P.fill(f'{DLG} input[type=text]', 'How do red blood cells carry oxygen?')
P.fill(f'{DLG} input[type=number] >> nth=0', '200')
P.click(f'{DLG} button:has-text("Start writing")')
p.wait("() => document.querySelector('.ex-area') && document.querySelector('.ex-qt').textContent.startsWith('How do')")
fe = [text('.ex-timer'), words_text(), text('.ex-qt')]
check(fe == ['No time limit', 'Words: 0/200', 'How do red blood cells carry oxygen?'], f'a free essay: its title, no time limit, a word limit of 200: {fe}')
fe = [att('a.paper.id'), ev('exam:start', "d.paper === 'essay-how-do-red-blood-cells-carry-oxygen'"), p.js(f"() => {E}.path")]
check(fe == ['essay-how-do-red-blood-cells-carry-oxygen', 1, '/home/user/essays/essay-how-do-red-blood-cells-carry-oxygen-1.exam.json'], f'it is an attempt of its own: {fe}')
caret_end()
P.keyboard.type('Haemoglobin binds oxygen in the lungs.')
sleep(0.2)
check(words_text() == 'Words: 6/200', f'the words are counted: {words_text()}')
p.js(f"(h) => {E}.ed.setHTML(h)", '<p>' + ' '.join(['word'] * 205) + '</p>')
sleep(0.1)
check(words_text() == 'Words: 205/200' and p.js("() => document.querySelector('.ex-wc').classList.contains('over')"), 'over a limit that does not stop typing, the count is red')
P.click('.ex-tile.review')
P.click('.ex-submit')
P.click('.modal button:has-text("Submit now")')
p.wait("() => document.querySelector('.ex-receipt')")
check(p.js("() => MG.app.fs.exists('~/essays/essay-how-do-red-blood-cells-carry-oxygen-1.exam.json')"), 'the free essay is saved as a file')

# ====================================================================== the attempts on the start view
p.js(f"() => {E}.openPaper('tour')")
p.wait("() => document.querySelector('.ex-startcard')")
P.click('.ex-startacts .btn.primary')
p.wait("() => document.querySelector('.ex-player')")
check(att('a.paper.id') == 'tour' and p.js(f"() => {E}.path") == '/home/user/essays/tour-2.exam.json', 'a second attempt of the same paper is a new file (tour-2)')
P.click('.ex-menubtn')
P.click('.ex-mi:has-text("Save and leave")')
p.wait("() => document.querySelector('.ex-home .ex-list')")
rows = p.js("() => [...document.querySelectorAll('.ex-list tbody tr')].map(r => [r.children[0].querySelector('b').textContent, r.children[1].textContent, [...r.querySelectorAll('.ex-acts button')].map(b => b.textContent).join(',')])")
check(len(rows) == 5 and rows[0] == ['Getting to know exam practice', 'In progress', 'Continue,Download,Delete'], f'the attempts are listed, the newest first: {rows[0]}')
check(sum(1 for r in rows if r[1].startswith('Submitted ') and r[2] == 'Review,Download,Delete') == 4, 'submitted attempts can be reviewed, downloaded and deleted')
check(p.js("() => document.querySelector('.ex-card[data-paper=tour] .btn').textContent") == 'Continue' and has('.ex-card[data-paper=tour] .ex-pill'), 'the paper with an attempt in progress says "Continue"')
p.shot('exam-home-attempts')
P.click('.ex-card[data-paper="tour"] .btn')
p.wait("() => document.querySelector('.ex-startcard')")
check('You have an attempt in progress' in text('.ex-startacts') and visible('.ex-startacts button:has-text("Start again")'), 'the paper’s first page offers to continue or to start again')
P.click('.ex-startacts .btn.primary')
p.wait("() => document.querySelector('.ex-player')")
check(p.js(f"() => {E}.path") == '/home/user/essays/tour-2.exam.json', 'Continue opens the attempt in progress')
p.js(f"() => {E}.home()")
p.wait("() => document.querySelector('.ex-home .ex-list')")
n0 = count('.ex-list tbody tr')
P.click('.ex-list tbody tr:has-text("How do red blood cells") button:has-text("Delete")')
sleep(0.1)
P.click('.modal button.danger')
p.wait(f"() => document.querySelectorAll('.ex-list tbody tr').length === {n0 - 1}")
check(not p.js("() => MG.app.fs.exists('~/essays/essay-how-do-red-blood-cells-carry-oxygen-1.exam.json')"), 'Delete removes the attempt and its file')
with P.expect_download() as d:
    P.click('.ex-list tbody tr:has-text("Calculations") button:has-text("Download")')
    P.click('.popmenu button:has-text("Plain text")')
check(d.value.suggested_filename == 'calculations-b4827.txt', f'an attempt can be downloaded from the list: {d.value.suggested_filename}')
# a file opened from Files goes to its place
p.js("() => MG.app.openFile('~/essays/tour-1.exam.json')")
p.wait("() => document.querySelector('.ex-receipt')")
check('Getting to know exam practice' in text('.ex-receipt'), 'opening a submitted attempt from the files shows its receipt')
no_errors('the attempts')

# ====================================================================== the calculator
p.js("() => MG.Calculator.open()")
p.wait("() => document.querySelector('.calc') && !document.querySelector('.calc').hidden")
check(ev('calc:open') >= 1, 'calc:open fired')
cases = [('2+3*4', 14), ('(2+3)×4', 20), ('2^10', 1024), ('2^3^2', 512), ('-3^2', -9), ('√16+∛27', 7), ('ln(e^2)', 2), ('log(1000)', 3), ('sin(30)', 0.5),
         ('cos 60', 0.5), ('5!', 120), ('2.5E3÷4', 625), ('3(4+1)', 15), ('2π', 2 * math.pi), ('1/(1/6+1/3)', 2), ('50E6*200E-12', 0.01),
         ('8.314*310/96485*ln(5/140)*1000', 8.314 * 310 / 96485 * math.log(5 / 140) * 1000), ('0.15*50/2', 3.75), ('50%', 0.5), ('tan(45)', 1)]
got = p.js("(c) => c.map(([x]) => MG.Calculator.evaluate(x, { deg: true }).value)", [[c[0]] for c in cases])
bad = [(c[0], g, c[1]) for c, g in zip(cases, got) if not (g is not None and abs(g - c[1]) <= 1e-9 * max(1, abs(c[1])))]
check(not bad, f'the calculator agrees with Python on {len(cases)} calculations: {bad}')
errs = p.js("() => ['2+', '1/0', '2,5', '(1+2))', 'sqrt(-1)'].map(x => MG.Calculator.evaluate(x).text)")
check(errs == ['Syntax error', 'Maths error', 'Syntax error', 'Syntax error', 'Maths error'], f'mistakes give errors: {errs}')
fm = p.js("() => [1.5e-7, 6.02e23, 1/3, -42, 1e10].map(x => MG.calcFormat(x).text)")
check(fm == ['1.5E-7', '6.02E23', '0.3333333333', '-42', '1E10'], f'very large and small numbers in scientific notation: {fm}')
check(p.js("() => MG.calcFormat(1.5e-7).html") == '1.5 × 10<sup>−7</sup>', 'and written as × 10 to a power')
P.click('.calc-k.ac')
for k in ['7', 'Multiply (*)', '6']:
    P.click(f'.calc-pad .calc-k[aria-label="{k}"]')
P.click('.calc-k.eq')
sleep(0.1)
check(text('.calc-out') == '42' and ev('calc:result', "d.expr === '7×6' && d.value === 42") == 1, 'the keys work: 7 × 6 = 42 (calc:result)')
P.click('.calc-pad .calc-k[aria-label="Add"]')
P.click('.calc-pad .calc-k[aria-label="8"]')
P.press('.calc-in', 'Enter')
sleep(0.1)
check(text('.calc-out') == '50', 'an operator after an answer carries on from it (Ans + 8 = 50)')
P.fill('.calc-in', 'sin(90)')
P.press('.calc-in', 'Enter')
P.click('.calc-mode')
P.fill('.calc-in', 'sin(pi/2)')
P.press('.calc-in', 'Enter')
sleep(0.1)
check(text('.calc-out') == '1' and text('.calc-mode') == 'RAD', 'DEG / RAD switches the angles to radians')
P.click('.calc-mode')
P.click('.calc-memrow .calc-k:has-text("M+")')
check(visible('.calc-mem'), 'M+ puts the answer in the memory (M is shown)')
P.click('.calc-hbtn')
check(count('.calc-hist li') >= 3, 'the earlier calculations are listed')
p.shot('exam-calculator')
P.keyboard.press('Escape')
p.js("() => document.querySelector('.calc-in').focus()")
P.keyboard.press('Escape')
sleep(0.1)
check(p.js("() => document.querySelector('.calc').hidden"), 'Esc closes the calculator')
no_errors('the calculator')

# ====================================================================== the events, all together
ALL_EV += evs()
kinds = set(e[0] for e in ALL_EV)
want = ['exam:open', 'exam:start', 'exam:words', 'exam:format', 'exam:flag', 'exam:nav', 'exam:timeup', 'exam:submit', 'exam:download', 'exam:saved', 'calc:open', 'calc:result']
check(all(k in kinds for k in want), f'every event fired: missing {[k for k in want if k not in kinds]}')

# ====================================================================== the layout: a desktop's dialogs, then a phone
p.js(f"() => {E}.openPaper('tour')")
p.wait("() => document.querySelector('.ex-startcard')")
P.click('.ex-startacts .btn.primary')  # (Continue: tour-2)
p.wait("() => document.querySelector('.ex-player')")
p.js(f"() => {E}.go(1)")
p.wait("() => document.querySelector('.ex-area')")
tb('formula')
P.fill('.ex-ftex', 'E = \\frac{RT}{zF} \\ln \\frac{[K^{+}]_{o}}{[K^{+}]_{i}}')
sleep(0.15)
p.shot('exam-formula')
check(not p.js("() => document.querySelector('.ex-formula-dlg .btn.primary').disabled"), 'the Nernst equation can be written in the formula editor')
P.click('.ex-formula-dlg .btn.primary')
tb('special')
p.shot('exam-special')
P.keyboard.press('Escape')
# a laptop with the instructions open: the exam is about 800 px wide, and the essay is beside its question
P.set_viewport_size({'width': 1366, 'height': 800})
sleep(0.4)
p.js(f"() => {E}.go(1)")
p.wait("() => document.querySelector('.ex-q.split .ex-wc')")
sleep(0.3)
bw = p.js("() => Math.round(document.querySelector('.ex-app').getBoundingClientRect().width)")
p.shot('exam-1366')
seen = p.js("""() => { const w = document.querySelector('.ex-wc'); w.scrollIntoView({ block: 'nearest' }); const r = w.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const n = document.querySelector('.ex-nav').getBoundingClientRect();
    return [!!e && (e === w || w.contains(e)), r.bottom <= n.top, w.textContent]; }""")
check(seen[0] and seen[1] and seen[2].startswith('Words: '), f'at 1366 × 800 with the instructions open (the exam {bw} px wide) the word count is not covered: {seen}')
fb = p.js("() => { const n = document.querySelector('.ex-nav'); return [...document.querySelectorAll('.ex-fab')].every(b => n.contains(b)); }")
check(fb, 'Previous and Next are in the bar along the bottom, not over the answer')
for w, hgt in [(390, 844), (360, 740)]:
    P.set_viewport_size({'width': w, 'height': hgt})
    p.js("() => document.body.classList.add('bench-open')")
    sleep(0.4)
    over = p.js("() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelector('.ex-app').scrollWidth, document.querySelector('.ex-app').clientWidth]")
    check(over[2] <= over[3] + 1, f'at {w} px the exam fits the width: {over}')
    tops = p.js("() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return [r('.ex-ptop').right <= innerWidth + 1, r('.ex-nav').bottom <= innerHeight + 1, r('.ex-menubtn').right <= innerWidth]; }")
    check(all(tops), f'at {w} px the top bar, the menu button and the tiles are on the screen: {tops}')
    tbw = p.js("() => { const t = document.querySelector('.ex-tb'); return [t.scrollWidth > t.clientWidth, getComputedStyle(t).overflowX]; }")
    check(tbw[1] == 'auto', f'at {w} px the toolbar scrolls sideways: {tbw}')
    p.shot(f'exam-phone-{w}-essay')
    P.click('.ex-menubtn')
    sleep(0.2)
    mr = p.js("() => { const r = document.querySelector('.ex-menu').getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth]; }")
    check(all(mr), f'at {w} px the menu is on the screen: {mr}')
    p.shot(f'exam-phone-{w}-menu')
    P.keyboard.press('Escape')
    tb('formula')
    P.fill('.ex-ftex', 'Q = \\frac{\\Delta P}{R}')
    sleep(0.15)
    p.shot(f'exam-phone-{w}-formula')
    P.keyboard.press('Escape')
    tb('drawing')
    sleep(0.15)
    dr = p.js("() => { const r = document.querySelector('.ex-dcanvas').getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth, Math.round(r.width)]; }")
    check(dr[0] and dr[1], f'at {w} px the drawing area fits: {dr}')
    p.shot(f'exam-phone-{w}-drawing')
    P.keyboard.press('Escape')
    P.click('.ex-tile.review')
    sleep(0.3)
    p.shot(f'exam-phone-{w}-submission')
    check(p.js("() => document.querySelector('.ex-qtable').getBoundingClientRect().right <= innerWidth + 1"), f'at {w} px the submission table fits')
    p.js("() => MG.Calculator.open()")
    sleep(0.2)
    cr = p.js("() => { const r = document.querySelector('.calc').getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth, r.width]; }")
    check(cr[0] and cr[1], f'at {w} px the calculator is on the screen: {cr}')
    p.shot(f'exam-phone-{w}-calculator')
    p.js("() => MG.Calculator.close()")
    p.js(f"() => {E}.home()")
    sleep(0.5)
    p.shot(f'exam-phone-{w}-home')
    check(p.js("() => document.querySelector('.ex-list').getBoundingClientRect().right <= innerWidth + 1"), f'at {w} px the list of attempts fits')
    P.click('.ex-card[data-paper="tour"] .btn')
    p.wait("() => document.querySelector('.ex-startcard')")
    P.click('.ex-startacts .btn.primary')
    p.wait("() => document.querySelector('.ex-player')")
    p.js(f"() => {E}.go(1)")
    sleep(0.3)
no_errors('phone width')
p.close()
done()
