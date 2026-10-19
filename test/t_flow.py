"""The Diagrams tab (assets/js/flow.js): drawing with the mouse and the keyboard, the simulation against results worked
out by hand (a first-order step response, negative feedback, a delay that makes a loop oscillate, positive feedback
that runs away), what-if changes (knock-outs, fixed levels, blocked arrows), undo, files, pictures and tables, the
events that tasks tick on, the examples, and the layout at desktop and phone widths.
Run:  python3 test/t_flow.py   (screenshots in test/out/)"""
import json
import time

from h import Page, check, done

p = Page(width=1500, height=950)
p.open()
p.js("() => localStorage.clear()")
p.open()
P = p.p
p.js("() => { window.EV = []; MG.bus.on('*', (d, t) => { if (/^flow:/.test(t)) EV.push([t, JSON.parse(JSON.stringify(d))]); }); }")
p.js("() => MG.app.showWorkbench('flow')")
p.wait("() => MG.app.flow && MG.app.flow.D && MG.app.flow.D.nodes.length > 0", timeout=30000)
F = 'MG.app.flow'
check(p.js(f"() => {F}.D.title") == 'Negative feedback: body temperature', 'the first visit opens the negative feedback example')
check(p.js("() => EV.some(e => e[0] === 'flow:open' && e[1].example === 'negative-feedback-temperature')"), 'flow:open fired for the example')
check(not p.js(f"() => {F}.dirty()"), 'a freshly opened example has no unsaved changes')
n_ex = p.js("async () => (await MG.app.flow._examples()).length")
check(n_ex >= 7, f'the examples are listed ({n_ex})')


def until(cond, timeout=10):
    """waits (up to timeout seconds) for a condition in the page – a file or an example loads in its own time"""
    try:
        p.wait(cond, timeout=timeout * 1000)
        return True
    except Exception:
        return False


def ev(kind, cond='true'):
    return p.js(f"() => EV.filter(e => e[0] === '{kind}' && (d => {cond})(e[1])).length")


def node_box(nid):
    return P.locator(f'.fl-node[data-node="{nid}"]').bounding_box()


def centre(b):
    return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2


def edge_point(eid):
    """a point on an arrow (its middle), on the screen"""
    return tuple(p.js(f"""() => {{
        const path = document.querySelector('.fl-edge[data-edge="{eid}"] .fl-line');
        const q = path.getPointAtLength(path.getTotalLength() / 2), m = path.getScreenCTM();
        return [q.x * m.a + q.y * m.c + m.e, q.x * m.b + q.y * m.d + m.f];
    }}"""))


# ---------------------------------------------------------------- a blank diagram, drawn with the mouse
P.click('.fl-bar button[aria-label^="A new diagram"]')
P.click('.popmenu button:has-text("Blank diagram")')
time.sleep(0.2)
check(p.js(f"() => {F}.D.nodes.length") == 0 and p.js(f"() => {F}.D.title") == 'New diagram', 'New → Blank diagram gives an empty diagram')
check(P.locator('.fl-empty').is_visible(), 'an empty diagram says how to start')
svg = P.locator('.fl-svg').bounding_box()
P.mouse.dblclick(svg['x'] + 260, svg['y'] + 220)
time.sleep(0.15)
check(P.locator('.fl-edit').is_visible(), 'double-clicking the background adds a box and opens its text for editing')
P.keyboard.press('Control+A')
P.keyboard.type('Signal')
P.keyboard.press('Enter')
P.mouse.dblclick(svg['x'] + 600, svg['y'] + 220)
time.sleep(0.15)
P.keyboard.press('Control+A')
P.keyboard.type('Level')
P.keyboard.press('Enter')
texts = p.js(f"() => {F}.D.nodes.map(n => n.text)")
check(texts == ['Signal', 'Level'], f'two boxes, with the text typed: {texts}')
ids = p.js(f"() => {F}.D.nodes.map(n => n.id)")
a, b = ids
# an arrow: drag from the dot on the right edge of the first box to the second box
P.mouse.move(*centre(node_box(a)))
time.sleep(0.15)
hb = P.locator(f'.fl-node[data-node="{a}"] .fl-conn[data-side="e"]').bounding_box()
P.mouse.move(*centre(hb))
P.mouse.down()
tx, ty = centre(node_box(b))
P.mouse.move(tx, ty, steps=10)
P.mouse.up()
edges = p.js(f"() => {F}.D.edges.map(e => [e.from, e.to, e.sign])")
check(edges == [[a, b, '+']], f'dragging from a dot to another box draws a + arrow: {edges}')
check(ev('flow:node') >= 2 and ev('flow:edge', "d.sign === '+'") == 1, 'flow:node and flow:edge fired')

# the settings, in the panel on the right
P.mouse.click(*centre(node_box(a)))
P.select_option('.fl-side select[data-f="role"]', 'stimulus')
time.sleep(0.1)
check(p.js(f"() => {F}.node('{a}').role") == 'stimulus' and p.js(f"() => {F}.node('{a}').shape") == 'flag', 'the role is changed in the panel (and the box takes the stimulus shape)')
P.fill('.fl-side input[data-f="start"]', '0')
P.fill('.fl-side input[data-f="size"]', '1')
P.mouse.click(*centre(node_box(b)))
P.fill('.fl-side input[data-f="rest"]', '0')
P.fill('.fl-side input[data-f="tau"]', '2')
check(p.js(f"() => [{F}.node('{a}').start, {F}.node('{b}').rest, {F}.node('{b}').tau]") == [0, 0, 2], 'numbers typed in the panel go into the model')
P.fill('.fl-runbar input.fl-num', '20')
P.press('.fl-runbar input.fl-num', 'Enter')
P.select_option('.fl-runbar select[aria-label="Speed"]', 'instant')
p.js(f"() => {{ {F}.D.sim.clampZero = false; }}")
P.click('.fl-runbtn')
time.sleep(0.3)
x_tau = p.js(f"() => {F}._valueAt('{b}', 2)")
x_3tau = p.js(f"() => {F}._valueAt('{b}', 6)")
check(abs(x_tau - 0.6321) < 0.01, f'first order: after one response time the level has made 63% of the change ({x_tau:.4f})')
check(abs(x_3tau - 0.9502) < 0.01, f'first order: after three response times, 95% ({x_3tau:.4f})')
check(ev('flow:run', 'd.nodes === 2 && d.edges === 1 && !d.oscillates && !d.runaway') == 1, 'flow:run fired with what the run found')
check(P.locator('.fl-graph path').count() >= 2, 'the graphs are drawn')
check('settled' in P.inner_text('.fl-runmsg'), 'the message says that the levels settled')
P.screenshot(path='test/out/flow-first-order.png')
bar = P.locator('.fl-bar').bounding_box()
check(bar['height'] < 45, f'beside the instructions the toolbar keeps to one line ({bar["height"]:.0f} px high)')
check(P.locator('.fl-view').is_visible() and not P.locator('.fl-results').is_visible(), 'beside the instructions the graphs and the numbers take turns')
P.click('.fl-vbtn[data-view="numbers"]')
check(P.locator('.fl-results tbody tr').count() == 2 and not P.locator('.fl-plot').is_visible(), 'Numbers shows the lowest, highest and final levels')
P.click('.fl-vbtn[data-view="graphs"]')
time.sleep(0.2)
check(P.locator('.fl-plot').is_visible() and P.locator('.fl-graph path').count() >= 2, 'Graphs brings the graphs back')
P.set_viewport_size({'width': 1920, 'height': 950})
time.sleep(0.4)
bar = P.locator('.fl-bar').bounding_box()
check(P.locator('.fl-results').is_visible() and P.locator('.fl-plot').is_visible() and not P.locator('.fl-view').is_visible() and bar['height'] < 45,
      'in a wide window the graphs and the numbers are side by side, and the toolbar has its labels on one line')
check(P.locator('.fl-bar button[aria-label^="Open a diagram"] span').is_visible(), 'a wide toolbar has its labels')
P.set_viewport_size({'width': 1500, 'height': 950})
time.sleep(0.4)

# ---------------------------------------------------------------- negative feedback: 1 / (1 + G)
P.click('.fl-bar button[aria-label^="Add a box"]')
P.click('.popmenu button:has-text("A quantity")')
time.sleep(0.15)
P.keyboard.press('Control+A')
P.keyboard.type('Effector')
P.keyboard.press('Enter')
c = p.js(f"() => {F}.D.nodes[2].id")
p.js(f"() => {{ const n = {F}.node('{c}'); n.x = {F}.node('{b}').x; n.y = {F}.node('{b}').y + 160; {F}.render(); }}")
P.mouse.click(*centre(node_box(c)))
P.fill('.fl-side input[data-f="rest"]', '0')
P.fill('.fl-side input[data-f="tau"]', '0.5')
# b → c (+), then c → b (−): the − button first
P.mouse.move(*centre(node_box(b)))
time.sleep(0.15)
hb = P.locator(f'.fl-node[data-node="{b}"] .fl-conn[data-side="s"]').bounding_box()
P.mouse.move(*centre(hb))
P.mouse.down()
P.mouse.move(*centre(node_box(c)), steps=10)
P.mouse.up()
P.click('.fl-bar .fl-sign[data-sign="-"]')
P.mouse.move(*centre(node_box(c)))
time.sleep(0.15)
hb = P.locator(f'.fl-node[data-node="{c}"] .fl-conn[data-side="e"]').bounding_box()
P.mouse.move(*centre(hb))
P.mouse.down()
P.mouse.move(*centre(node_box(b)), steps=10)
P.mouse.up()
es = p.js(f"() => {F}.D.edges.map(e => [e.from, e.to, e.sign])")
check([b, c, '+'] in es and [c, b, '-'] in es, f'a + arrow down and a − arrow back up: {es}')
eid = p.js(f"() => {F}.D.edges.find(e => e.from === '{b}' && e.to === '{c}').id")
back = p.js(f"() => {F}.D.edges.find(e => e.from === '{c}' && e.to === '{b}').id")
check(p.js(f"() => {F}.edge('{back}').bend !== 0"), 'an arrow back the other way is curved, so that the two do not overlap')
# select the arrow b → c by clicking it, and set its strength to 3
P.mouse.click(*edge_point(eid))
check(p.js(f"() => {F}.selE.has('{eid}')"), 'clicking an arrow selects it')
# the selected arrow's bend handle sits on its middle: a right-click there gives the arrow's menu
hb = P.locator(f'circle.fl-bend[data-id="{eid}"]').bounding_box()
P.mouse.click(*centre(hb), button='right')
time.sleep(0.2)
check(P.locator('.popmenu button:has-text("Block this arrow")').count() == 1, 'a right-click on the bend handle of an arrow gives the arrow’s menu')
P.keyboard.press('Escape')
time.sleep(0.15)
P.mouse.click(*edge_point(eid))
P.fill('.fl-side input[data-f="gain"]', '3')
P.click('.fl-runbtn')
time.sleep(0.3)
fin = p.js(f"() => {F}.result.finals['{b}']")
check(abs(fin - 0.25) < 0.005, f'negative feedback with loop gain 3 settles at 1/(1+3) of the open-loop change ({fin:.4f})')
P.fill('.fl-side input[data-f="gain"]', '9')
P.click('.fl-runbtn')
time.sleep(0.3)
fin = p.js(f"() => {F}.result.finals['{b}']")
check(abs(fin - 0.1) < 0.005, f'… and with loop gain 9 at 1/10 ({fin:.4f})')

# ---------------------------------------------------------------- what if: knock out, fix, block; undo
P.mouse.click(*centre(node_box(c)), button='right')
P.click('.popmenu button:has-text("Knock it out")')
check(p.js(f"() => !!{F}.node('{c}').knocked"), 'right-click → Knock it out')
check(P.locator(f'.fl-node[data-node="{c}"] text:has-text("knocked out")').count() == 1, 'a knocked-out box is marked')
P.click('.fl-runbtn')
time.sleep(0.3)
res = p.js(f"() => {{ const r = {F}.result; return {{ fin: r.finals['{b}'], eff: r.finals['{c}'], t: r.changeAt }}; }}")
check(abs(res['fin'] - 1) < 0.01 and abs(res['eff']) < 1e-9, f'with the effector knocked out, the level goes to the open-loop change ({res})')
check(ev('flow:run', 'd.knocked === 1') >= 1, 'flow:run counts the knocked-out box')
P.locator('.fl-svg').focus()
P.keyboard.press('Control+Z')
check(not p.js(f"() => !!{F}.node('{c}').knocked"), 'Ctrl+Z undoes the knock-out')
P.keyboard.press('Control+Y')
check(p.js(f"() => !!{F}.node('{c}').knocked"), 'Ctrl+Y redoes it')
P.keyboard.press('Control+Z')
P.mouse.click(*edge_point(back))
P.check('.fl-side .fl-blk input')
check(p.js(f"() => !!{F}.edge('{back}').blocked"), 'an arrow is blocked from the panel')
P.click('.fl-runbtn')
time.sleep(0.3)
fin = p.js(f"() => {F}.result.finals['{b}']")
check(abs(fin - 1) < 0.01 and ev('flow:run', 'd.blocked === 1') >= 1, f'with the feedback arrow blocked, no feedback ({fin:.3f})')
P.uncheck('.fl-side .fl-blk input')
p.js(f"() => {F}.intervene('{c}', 'fix', 0.5)")
P.click('.fl-runbtn')
time.sleep(0.3)
res = p.js(f"() => {F}.result.finals")
check(abs(res[c] - 0.5) < 1e-9 and abs(res[b] - 0.5) < 0.01, f'a box fixed at a level ignores its inputs ({res[c]:.3f}; the level settles at 1 − 0.5 = {res[b]:.3f})')
p.js(f"() => {F}.intervene('{c}', null)")

# ---------------------------------------------------------------- keyboard: Tab, Enter, arrows, Delete
P.locator('.fl-svg').focus()
P.keyboard.press('Escape')
P.keyboard.press('Tab')
sel = p.js(f"() => [...{F}.selN]")
check(sel == [a], f'Tab selects the first box ({sel})')
P.keyboard.press('Tab')
check(p.js(f"() => [...{F}.selN]") == [b], 'Tab again: the next box')
x0 = p.js(f"() => {F}.node('{b}').x")
P.keyboard.press('ArrowRight')
check(p.js(f"() => {F}.node('{b}').x") == x0 + 10, 'the arrow keys move the selected box')
P.keyboard.press('Enter')
check(P.locator('.fl-edit').is_visible(), 'Enter edits the text of the selected box')
P.keyboard.press('Escape')
check(not P.locator('.fl-edit').is_visible() and p.js(f"() => {F}.node('{b}').text") == 'Level', 'Escape leaves the text as it was')

# ---------------------------------------------------------------- files: save, change, open again
P.click('.fl-bar button[aria-label^="Save the diagram"]')
P.wait_for_selector('.modal .prompt-input')
P.fill('.modal .prompt-input', '~/diagrams/my-loop')
P.press('.modal .prompt-input', 'Enter')
time.sleep(0.2)
path = '/home/user/diagrams/my-loop.flow.json'
check(p.js(f"() => MG.app.fs.exists('{path}')"), 'Save writes ~/diagrams/my-loop.flow.json (the ending is added)')
saved = json.loads(p.js(f"() => MG.app.fs.get('{path}').text"))
check(saved['format'] == 'bms-flow-1' and len(saved['nodes']) == 3 and len(saved['edges']) == 3, 'the file holds the diagram')
check(not p.js(f"() => {F}.dirty()") and ev('flow:save', f"d.path === '{path}'") == 1, 'after saving: no unsaved changes, and flow:save fired')
p.js(f"() => {F}.addNode({{ text: 'Extra' }})")
check(p.js(f"() => {F}.dirty()") and '•' in P.inner_text('.fl-title'), 'a change makes the diagram unsaved (a dot by its name)')
p.js(f"() => {{ {F}.open('{path}'); }}")
P.wait_for_selector('.modal [data-x="yes"]')
P.click('.modal [data-x="yes"]')
time.sleep(0.3)
check(p.js(f"() => {F}.D.nodes.length") == 3 and p.js(f"() => {F}.ref") == path, 'opening the file again (after confirming) gives the saved version')
check(ev('flow:open', f"d.path === '{path}'") == 1, 'flow:open fired with the path')

# ---------------------------------------------------------------- pictures and tables
P.click('.fl-runbtn')
time.sleep(0.3)
p.js(f"() => {{ {F}.exportPNG(true); }}")
P.wait_for_selector('.modal .prompt-input')
P.press('.modal .prompt-input', 'Enter')
time.sleep(0.6)
png = '/home/user/diagrams/new-diagram.png'
check(p.js(f"() => MG.app.fs.exists('{png}')"), 'Export → PNG to my files')
head = p.js(f"async () => Array.from((await MG.app.fs.readBytes('{png}')).slice(0, 4))")
check(head == [0x89, 0x50, 0x4E, 0x47], 'the picture is a PNG file')
dims = p.js(f"async () => {{ const b = await MG.app.fs.toBlob('{png}'); const i = await createImageBitmap(b); return [i.width, i.height]; }}")
check(dims[0] > 300 and dims[1] > 150, f'the PNG has the size of the diagram, at twice the resolution ({dims})')
p.js(f"() => {{ {F}.exportSVG(true); }}")
P.wait_for_selector('.modal .prompt-input')
P.press('.modal .prompt-input', 'Enter')
time.sleep(0.3)
svgt = p.js("() => MG.app.fs.get('/home/user/diagrams/new-diagram.svg').text")
check(svgt.startswith('<?xml') and '<svg' in svgt and 'Signal' in svgt and 'fl-conn' not in svgt and 'data-handle' not in svgt, 'the SVG has the drawing and none of the handles')
p.js(f"() => {F}.exportCSV(true)")
time.sleep(0.3)
csv = p.js("() => MG.app.fs.get('/home/user/diagrams/new-diagram-run.csv').text").strip().split('\n')
check(csv[0].startswith('time_min,') and 'Level' in csv[0] and len(csv) > 500, f'the results table: a header and {len(csv) - 1} rows ({csv[0]})')
last = [float(x) for x in csv[-1].split(',')]
check(abs(last[0] - 20) < 1e-6, 'the table runs to the end of the run')
check(ev('flow:export', "d.format === 'png' && d.path") == 1 and ev('flow:export', "d.format === 'svg' && d.path") == 1 and ev('flow:export', "d.format === 'csv' && d.path") == 1, 'flow:export fired for each format')
check(ev('flow:edit') >= 1, 'flow:edit fired')

# ---------------------------------------------------------------- a delay makes the loop oscillate; positive feedback runs away
dl = {'title': 'Delay test', 'nodes': [
    {'id': 's', 'role': 'stimulus', 'kind': 'step', 'start': 0, 'size': 1, 'x': 100, 'y': 100},
    {'id': 'x', 'role': 'quantity', 'rest': 0, 'tau': 1, 'x': 300, 'y': 100},
    {'id': 'e', 'role': 'quantity', 'rest': 0, 'tau': 1, 'x': 300, 'y': 250}],
    'edges': [{'from': 's', 'to': 'x', 'sign': '+'}, {'from': 'x', 'to': 'e', 'sign': '+', 'gain': 1.6, 'delay': 2},
              {'from': 'e', 'to': 'x', 'sign': '-'}],
    'sim': {'duration': 80, 'timeUnit': 'min', 'clampZero': False}}
p.js(f"() => {{ MG.app.fs.mkdirp('/home/user/diagrams'); MG.app.fs.writeText('/home/user/diagrams/delay.flow.json', {json.dumps(json.dumps(dl))}); }}")
P.click('.fl-bar button[aria-label^="Open a diagram"]')
P.click('.modal .fl-dlg-item:has-text("delay.flow.json")')
until(f"() => {F}.D.title === 'Delay test'")
check(P.locator('.modal [data-x="yes"]').count() == 0, 'a diagram with no unsaved changes is left without asking')
check(p.js(f"() => {F}.D.title") == 'Delay test', 'Open lists the files in ~/diagrams and opens one')
P.click('.fl-runbtn')
time.sleep(0.3)
osc = p.js(f"() => {F}.result.oscillating")
check(any(o['id'] == 'x' and o['trend'] == 'dying away' for o in osc), f'a delay of 2 in a loop of gain 1.6 makes it oscillate, dying away ({osc})')
check('went up and down' in P.inner_text('.fl-runmsg'), 'the message says that it went up and down')
check(ev('flow:run', "d.oscillates === true") >= 1, 'flow:run reports the oscillation')
p.js(f"() => {{ {F}.setEdge({F}.D.edges[1].id, {{ delay: 0.1 }}); }}")
P.click('.fl-runbtn')
time.sleep(0.3)
check(not p.js(f"() => {F}.result.oscillating.length"), 'with a short delay, no oscillation')
pf = {'title': 'Runaway test', 'nodes': [
    {'id': 's', 'role': 'stimulus', 'kind': 'pulse', 'start': 1, 'length': 1, 'size': 1},
    {'id': 'a', 'role': 'quantity', 'rest': 1, 'tau': 1}, {'id': 'b', 'role': 'quantity', 'rest': 1, 'tau': 1}],
    'edges': [{'from': 's', 'to': 'a', 'sign': '+'}, {'from': 'a', 'to': 'b', 'sign': '+', 'gain': 2}, {'from': 'b', 'to': 'a', 'sign': '+'}],
    'sim': {'duration': 30}}
r = p.js(f"() => {{ const r = MG.flowSim.simulate({json.dumps(pf)}); return {{ run: r.runaway, max: Math.max(...r.series.a), osc: r.oscillating.length }}; }}")
check(r['run'] is not None and abs(r['max'] - 11) < 1e-6, f'positive feedback with loop gain 2 runs away and is stopped at ten times its size ({r})')
p.js(f"() => {{ {F}._load(MG.flowSim.normDiagram({json.dumps(pf)}), {{}}); {F}.run(); }}")
time.sleep(0.3)
check('ran away' in P.inner_text('.fl-runmsg') and 'warn' in P.get_attribute('.fl-runmsg', 'class'), 'the message says that it ran away')
check(ev('flow:run', "d.runaway === true") >= 1, 'flow:run reports the runaway')

# ---------------------------------------------------------------- labels on arrows; the instructions' buttons; help
p.js(f"() => {F}.open('example:blood-glucose', {{ force: true }})")
until(f"() => {F}.example === 'blood-glucose'")
time.sleep(0.1)
e1 = p.js(f"() => {F}.D.edges[0].id")
P.mouse.dblclick(*edge_point(e1))
time.sleep(0.15)
check(P.locator('.fl-edit').is_visible(), 'double-clicking an arrow edits its label')
P.keyboard.type('absorbed')
P.keyboard.press('Enter')
check(p.js(f"() => {F}.edge('{e1}').label") == 'absorbed' and P.locator(f'.fl-edge[data-edge="{e1}"] text:has-text("absorbed")').count() == 1, 'the label is kept and drawn')
P.click('.fl-bar button[aria-label^="A new diagram"]')
P.click('.popmenu button:has-text("Example: An endocrine axis")')
P.wait_for_selector('.modal [data-x="yes"]')
P.click('.modal [data-x="yes"]')
until(f"() => {F}.D.title === 'An endocrine axis (template)'")
check(p.js(f"() => {F}.D.title") == 'An endocrine axis (template)', 'New → an example (after confirming that the changes may go)')
p.js("() => MG.actions.flow('example:delay-oscillation')")
until(f"() => {F}.example === 'delay-oscillation'")
p.js("() => MG.actions.flowRun()")
until(f"() => {F}.result && {F}.result.oscillating.length > 0")
check(p.js(f"() => {F}.D.title") == 'Negative feedback with a delay' and p.js(f"() => {F}.result.oscillating.length") > 0, 'the instructions’ buttons (MG.actions.flow, flowRun) open and run a diagram')
P.click('.fl-bar button[aria-label^="How to draw"]')
check(P.locator('.modal:has-text("Response time")').count() == 1, 'Help explains the simulation')
P.keyboard.press('Escape')

# ---------------------------------------------------------------- a reload keeps unsaved work
p.js(f"() => {{ {F}.open('{path}', {{ force: true }}); }}")
until(f"() => {F}.ref === '{path}'")
p.js(f"() => {F}.addNode({{ text: 'Kept over a reload' }})")
time.sleep(0.6)
p.open()
p.js("() => MG.app.showWorkbench('flow')")
p.wait("() => MG.app.flow && MG.app.flow.D", timeout=30000)
time.sleep(0.3)
check(p.js(f"() => {F}.D.nodes.some(n => n.text === 'Kept over a reload')") and p.js(f"() => {F}.ref") == path and p.js(f"() => {F}.dirty()"), 'after a reload the diagram comes back, with its unsaved change, still tied to its file')
p.js("() => { window.EV = []; MG.bus.on('*', (d, t) => { if (/^flow:/.test(t)) EV.push([t, JSON.parse(JSON.stringify(d))]); }); }")

# ---------------------------------------------------------------- every example opens and runs
for ex in p.js("async () => (await MG.app.flow._examples()).map(e => e.id)"):
    p.js(f"() => {F}.open('example:{ex}', {{ force: true }})")
    until(f"() => {F}.example === '{ex}'")
    time.sleep(0.1)
    if ex == 'blank':
        check(p.js(f"() => {F}.D.nodes.length") == 0, 'the blank example is empty')
        continue
    p.js(f"() => {F}.run()")
    r = p.js(f"() => {{ const r = {F}.result; return {{ run: !!r.runaway, osc: r.oscillating.length, settled: r.settled }}; }}")
    want = {'positive-feedback-clotting': (True, 0), 'delay-oscillation': (False, 2)}.get(ex, (False, 0))
    check(r['run'] == want[0] and (r['osc'] > 0) == (want[1] > 0), f'example {ex} runs as it should ({r})')
    if ex == 'negative-feedback-temperature':
        t = p.js(f"() => {F}.result.finals.temp")
        check(abs(t - (37 - 2 / 6)) < 0.01, f'the temperature example settles at 37 − 2/(1+5) = 36.67 °C ({t:.3f})')
        P.screenshot(path='test/out/flow-desktop.png')
check(not p.errors, 'no errors in the page: ' + '; '.join(p.errors[:3]))

# ---------------------------------------------------------------- the size of a phone
P.set_viewport_size({'width': 390, 'height': 844})
p.js("() => document.body.classList.add('bench-open')")
p.js(f"() => {F}.open('example:negative-feedback-temperature', {{ force: true }})")
until(f"() => {F}.example === 'negative-feedback-temperature'")
time.sleep(0.4)
over = p.js("() => { const b = document.querySelector('.fl-bar'); return [b.scrollWidth, b.clientWidth]; }")
check(over[0] <= over[1] + 1, f'at phone width the toolbar fits ({over})')
check(P.locator('.fl-sidehead').is_visible() and not P.locator('.fl-sidebody').is_visible(), 'at phone width the settings fold away under the drawing')
cv = P.locator('.fl-svg').bounding_box()
check(cv['width'] > 300 and cv['height'] > 150, f'the drawing has room ({cv["width"]:.0f} × {cv["height"]:.0f})')
p.js(f"() => {F}.run()")
time.sleep(0.3)
P.screenshot(path='test/out/flow-phone.png')
P.click('.fl-sidehead')
time.sleep(0.2)
check(P.locator('.fl-sidebody').is_visible(), 'tapping the heading opens the settings')
P.screenshot(path='test/out/flow-phone-settings.png')
check(not p.errors, 'no errors at phone width: ' + '; '.join(p.errors[:3]))
p.close()
done()
