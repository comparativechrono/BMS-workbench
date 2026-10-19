"""Helpers that write the HTML of the instructions of the practicals (used by chapters.py)."""
import html


def esc(s):
    return html.escape(str(s), quote=True)


def c(s):
    """inline code"""
    return f'<code>{esc(s)}</code>'






def edit(path, label=None):
    return f'<button class="do showme" type="button" data-edit="{esc(path)}">{label or "open " + esc(path.split("/")[-1])}</button>'


def bench(name, label):
    return f'<button class="do showme" type="button" data-bench="{esc(name)}">{label}</button>'


def goto(target, label):
    return f'<button class="do showme" type="button" data-goto="{esc(target)}">{label}</button>'




def codefile(path, text, create=True, note=None, button='Create this file'):
    """a file shown in the instructions, with Create and Copy buttons"""
    b = f'<button class="do" type="button" data-file-create="{esc(path)}">{button}</button>' if create else ''
    n = f'<div class="cf-note">{note}</div>' if note else ''
    return (f'<div class="codefile" data-path="{esc(path)}"><div class="cf-head"><span class="cf-name">{esc(path)}</span>'
            f'<span class="grow"></span>{b}<button class="btn small" type="button" data-copy-code="1">Copy</button></div>'
            f'<pre class="codeblock">{esc(text.rstrip())}</pre>{n}</div>')


def task(tid, body, auto=None, check=None):
    a = f' data-auto="{esc(auto)}"' if auto else ''
    k = f' data-check="{esc(check)}"' if check else ''
    return f'<li data-task="{esc(tid)}"{a}{k}>{body}</li>'


def activity(title, tasks, extra=''):
    return f'<div class="activity">\n  <div class="act-t">{title}</div>\n  <ol class="steps">\n    ' + '\n    '.join(tasks) + f'\n  </ol>{extra}\n</div>'


def q(qid, text, model, accept=None, hint=None, placeholder=None):
    a = f' data-accept="{esc(accept)}"' if accept else ''
    h = f' data-hint="{esc(hint)}"' if hint else ''
    p = f' data-placeholder="{esc(placeholder)}"' if placeholder else ''
    return f'<div class="q" data-q="{esc(qid)}"{a}{h}{p}>\n  <div class="q-text">{text}</div>\n  <div class="q-model">{model}</div>\n</div>'


def mcq(qid, text, options, model=None):
    """options: list of (html, correct, why)"""
    labs = ''.join(f'<label{" data-correct" if ok else ""} data-why="{esc(why)}"><input type="radio"> {opt}</label>' for opt, ok, why in options)
    m = f'\n  <div class="q-model">{model}</div>' if model else ''
    return f'<div class="q" data-q="{esc(qid)}" data-type="mcq">\n  <div class="q-text">{text}</div>\n  <div class="mcq">{labs}</div>{m}\n</div>'


def callout(kind, title, body):
    return f'<div class="callout {kind}">\n  <div class="co-t">{title}</div>\n  {body}\n</div>'


def chapter(cid, num, title, bench_name, h1, minutes, lede, body):
    t = f'  <div class="meta-row"><span class="pill time">≈ {minutes} min</span></div>\n' if minutes else ''
    return (f'<section class="chapter" id="{cid}" data-num="{num}" data-title="{esc(title)}" data-bench="{bench_name}" hidden>\n'
            f'  <h1>{h1}</h1>\n{t}  <p class="lede">{lede}</p>\n{body}\n</section>\n')


def rcon(code, label='show me'):
    """a button that types R code into RStudio's Console (the student presses Enter to run it)"""
    return f'<button class="do showme" type="button" data-rcon="{esc(code)}">{label}</button>'


def rcode(code, label='show me'):
    """R code, with a button that types it into RStudio's Console"""
    return f'{c(code)} {rcon(code, label)}'


def rsopen(path, label=None):
    """a button that opens a file in RStudio"""
    return f'<button class="do showme" type="button" data-rs-open="{esc(path)}">{label or "open " + esc(path.split("/")[-1]) + " in RStudio"}</button>'


def rsrun(code, label='run it in RStudio'):
    return f'<button class="do" type="button" data-rs-run="{esc(code)}">{label}</button>'




# ---------------------------------------------------------------------------------------------------------------------
# the BMS workbench's own tabs
def _btn(attr, value, label, cls='do showme'):
    return f'<button class="{cls}" type="button" data-{attr}="{esc(value)}">{label}</button>'


def scope(spec, label='show me'):
    """a button that opens a slide in the microscope: 'kidney-cortex', or 'kidney-cortex@1.2,0.8,20x' (mm from the
    slide's top left, and the objective)"""
    return _btn('scope', spec, label)


def scopefind(spec, label='find it'):
    """a button that asks the student to find a labelled structure ('kidney-cortex:glomerulus') and click on it"""
    return _btn('scope-find', spec, label)


def scopetool(name, label):
    """a button that picks a tool of the microscope: measure, area, count, label, capture, eyepiece, labels.
    'measure:glomerulus' (or 'area:…') also labels the measurements that follow; 'count:Living cells,Dead cells' also
    sets the categories to count"""
    return _btn('scope-tool', name, label)


def scoper(what='measurements', label=None):
    """a button that opens the microscope's R script for the measurements (or 'counts') in RStudio"""
    return _btn('scope-r', what, label or f'open the script for the {what}')


def flow(ref, label='open it'):
    """a button that opens a diagram: 'example:negative-feedback-temperature', 'example:blank' (a new diagram) or
    '~/diagrams/my.flow.json'"""
    return _btn('flow', ref, label)


def flowrun(label='run it'):
    return _btn('flow-run', '1', label)


def circuit(ref, label='open it'):
    """a button that opens a circuit: 'example:rc-circuit' or '~/circuits/my.circuit.json'"""
    return _btn('circuit', ref, label)


def circuitrun(label='run it'):
    return _btn('circuit-run', '1', label)


def exam(paper, label='open the paper'):
    """a button that opens a paper of exam practice (its id), or 'free' for a free essay"""
    return _btn('exam', paper, label)


def calc(label='open the calculator'):
    return _btn('calc', '1', label)


def pdb(entry, label=None):
    """a button that opens a PDB entry in the 3D viewer (the bundled copy when there is one)"""
    return _btn('pdb', entry, label or 'open ' + esc(entry))


def viewer(cmds, label='show me'):
    """a button that runs commands of the 3D viewer, e.g. 'molecule cortisol; color element'"""
    return _btn('viewer', cmds, label)
