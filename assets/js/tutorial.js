/* =====================================================================
   The instructions: workbench tabs, chapters, the buttons in the text,
   tasks that tick themselves, questions, progress and "My answers".
   The text itself is in index.html (made by build/make_page.py); the
   workbench on the right is set up by workbench.js and page.js, which
   start this file's part (MG.tutorial.init) once the workbench is there.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store, $, $$ } = MG;
  const CFG = MG.config;
  const params = new URLSearchParams(location.search);
  const SHOW_ANSWERS = CFG.showModelAnswers || params.has('answers') || params.has('instructor');

  MG.app = MG.app || {};
  const MG_READY_FLAG = { ready: false };
  const state = store.get('progress', null) || { tasks: {}, answers: {}, name: '' };
  // If the page is open in two tabs, keep what the other tab saved (answers and ticks this
  // tab does not have) instead of overwriting it.
  const save = MG.debounce(() => {
    const stored = store.get('progress', null);
    if (stored) {
      Object.entries(stored.answers || {}).forEach(([k, v]) => {
        if (!(k in state.answers)) state.answers[k] = v;
      });
      Object.entries(stored.tasks || {}).forEach(([k, v]) => {
        if (!(k in state.tasks)) state.tasks[k] = v;
      });
      if (!state.name && stored.name) state.name = stored.name;
    }
    store.set('progress', state);
  }, 300);
  let warnedTabs = false;
  window.addEventListener('storage', (e) => {
    if (warnedTabs || !e.key || !/:(progress|files)$/.test(e.key)) return;
    warnedTabs = true;
    toast('This practical is also open in another tab or window. Please work in only one of them, so that your answers and files are not overwritten.', 'warn', 9000);
  });

  /* ------------------------------------------------------------------
     Chapters
     ------------------------------------------------------------------ */
  let chapters = [];
  function initChapters() {
    chapters = $$('.chapter');
    const nav = $('.ch-nav');
    chapters.forEach((ch, k) => {
      const b = h('button.ch-tab', { type: 'button', dataset: { ch: ch.id } }, h('span.num', ch.dataset.num || String(k)), h('span', ch.dataset.title || ch.id));
      b.addEventListener('click', () => showChapter(ch.id, true));
      nav.appendChild(b);
      // next / previous buttons
      const row = h('div.next-row');
      const prev = chapters[k - 1], next = chapters[k + 1];
      row.appendChild(prev ? mkNav('← ' + (prev.dataset.title || ''), prev.id) : h('span'));
      row.appendChild(next ? mkNav((next.dataset.title || '') + ' →', next.id, true) : h('span'));
      ch.appendChild(row);
    });
    window.addEventListener('hashchange', () => routeHash());
    routeHash(true);
  }
  function mkNav(label, id, primary) {
    const b = h('button.btn' + (primary ? '.primary' : ''), { type: 'button' }, label);
    b.addEventListener('click', () => showChapter(id, true));
    return b;
  }
  function routeHash(initial) {
    const id = decodeURIComponent(location.hash.replace('#', ''));
    const ch = chapters.find((c) => c.id === id) || (id && document.getElementById(id) && document.getElementById(id).closest('.chapter'));
    if (ch) {
      showChapter(ch.id, false);
      const el = document.getElementById(id);
      if (el && el !== ch) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50);
    } else if (initial) showChapter(store.get('chapter', chapters[0] && chapters[0].id), false);
  }
  function showChapter(id, push) {
    chapters.forEach((c) => (c.hidden = c.id !== id));
    $$('.ch-tab').forEach((b) => b.classList.toggle('on', b.dataset.ch === id));
    store.set('chapter', id);
    const tut = $('.tut');
    if (push) {
      history.replaceState(null, '', '#' + id);
      tut.scrollTop = 0;
      if (window.innerWidth <= 1000) $('.ch-nav').scrollIntoView({ block: 'start' });
    }
    const ch = chapters.find((c) => c.id === id);
    if (ch && ch.dataset.bench) MG.app.showWorkbench(ch.dataset.bench, { noOpen: true });
    bus.emit('app:chapter', { id });
    if (typeof evalTasks === 'function') setTimeout(() => evalTasks(null, null), 50);
  }
  MG.app.showChapter = showChapter;
  MG.app.currentChapter = () => {
    const c = chapters.find((x) => !x.hidden);
    return c ? c.id : '';
  };

  /* ------------------------------------------------------------------
     ▶ action buttons inside the tutorial
     ------------------------------------------------------------------ */
  /* buttons in the text: data-term (type a command), data-term-run (type and run it),
     data-bench (show a workbench tab), data-goto (a chapter), plus the page's own in MG.actions */
  MG.actions = MG.actions || {};
  function initActions() {
    const keys = () => ['term', 'termRun', 'bench', 'goto'].concat(Object.keys(MG.actions));
    document.addEventListener('click', async (e) => {
      // only real controls trigger actions. Chapters also carry data-bench (the workbench
      // tab to show with them), so a bare [data-bench] selector would catch every click
      // inside a chapter – blocking radio buttons and ticks and pulling focus to the terminal.
      const sel = keys()
        .map((k) => '[data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ']')
        .map((a) => `button${a},a${a},[role="button"]${a}`)
        .join(',');
      const b = e.target.closest(sel);
      if (!b || !b.closest('.tut, .modal')) return;
      e.preventDefault();
      const ds = b.dataset;
      if (ds.goto) {
        const ch = document.getElementById(ds.goto);
        if (ch && ch.classList.contains('chapter')) showChapter(ch.id, true);
        else if (ch) {
          showChapter(ch.closest('.chapter').id, true);
          setTimeout(() => ch.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        }
        return;
      }
      if (ds.bench) await MG.app.showWorkbench(ds.bench);
      const busy = async (fn) => {
        b.classList.add('running');
        try {
          await fn();
        } catch (err) {
          console.error(err);
          toast(esc(err.message || String(err)), 'error');
        } finally {
          b.classList.remove('running');
        }
      };
      if (ds.term != null || ds.termRun != null) {
        const line = ds.term != null ? ds.term : ds.termRun;
        await busy(async () => {
          await MG.app.showWorkbench('terminal');
          if (!MG.app.term) throw new Error('The terminal could not start.');
          await MG.app.term.type(line, ds.termRun != null);
        });
      }
      for (const k of Object.keys(MG.actions)) {
        if (ds[k] != null) await busy(() => MG.actions[k](ds[k], b));
      }
    });
  }
  /* ------------------------------------------------------------------
     Tasks (tick automatically when the matching thing happens)
     ------------------------------------------------------------------ */
  const taskEls = [];
  function parseSpec(spec) {
    return spec.split('||').map((one) => {
      const parts = one.trim().split(/\s+(?=[a-zA-Z_]+[=~<>])/);
      const ev = parts.shift();
      const conds = parts.map((p) => {
        const m = /^([a-zA-Z_]+)([=~<>])(.*)$/.exec(p.trim());
        return m ? { k: m[1], op: m[2], v: m[3] } : null;
      }).filter(Boolean);
      return { ev, conds };
    });
  }
  function matches(spec, type, d) {
    return spec.some((s) => s.ev === type && s.conds.every((c) => {
      const val = d[c.k];
      if (c.op === '=') return String(val).toLowerCase() === c.v.toLowerCase();
      if (c.op === '~') return String(val || '').toLowerCase().includes(c.v.toLowerCase());
      if (c.op === '>') return Number(val) > Number(c.v);
      if (c.op === '<') return Number(val) < Number(c.v);
      return false;
    }));
  }
  function initTasks() {
    $$('[data-task]').forEach((li) => {
      const id = li.dataset.task;
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Mark as done' });
      const lab = h('label.task-check', { title: 'Tick this when you have done it' }, cb, h('span', 'done'));
      li.prepend(lab);
      if (li.dataset.auto || li.dataset.check) lab.title = 'This ticks itself when you do the step, or you can tick it yourself';
      cb.addEventListener('change', () => setTask(id, cb.checked, false));
      const t = { id, li, cb, spec: li.dataset.auto ? parseSpec(li.dataset.auto) : null, check: li.dataset.check || null };
      taskEls.push(t);
      if (state.tasks[id]) mark(t, true);
    });
    bus.on('*', (d, type) => evalTasks(type, d));
  }
  /* Tasks only tick for the chapter the student is reading: a command typed in one chapter
     does not tick the same step in a later one. */
  /* What the terminal reports while it runs a command of the AI agent – a program that ran, a file a
     program made, a script that finished – is not something the student did: no task ticks for it. */
  const FROM_A_COMMAND = /^(tool:|vfs:|hash:|script:)/;
  function evalTasks(type, d) {
    if (type && FROM_A_COMMAND.test(type) && MG.app.term && MG.app.term.agentCmd) return;
    // events that remember the chapter they started in (e.g. a long notebook run) count for that chapter
    const active = (d && d._chapter && chapters.find((c) => c.id === d._chapter)) || chapters.find((c) => !c.hidden);
    taskEls.forEach((t) => {
      if (state.tasks[t.id]) return;
      if (active && !active.contains(t.li)) return;
      let ok = false;
      if (t.spec && type && matches(t.spec, type, d || {})) ok = true;
      // a state is not looked at while a command of the AI agent is under way: what it writes outside its folder is still to be put back
      if (!ok && t.check && !MG.app.agentBusy) {
        const cut = t.check.indexOf(':');
        const name = cut < 0 ? t.check : t.check.slice(0, cut);
        const arg = cut < 0 ? undefined : t.check.slice(cut + 1);
        const fn = MG.checks[name];
        if (fn) {
          try {
            ok = !!fn(type, d || {}, arg);
          } catch (e) {
            ok = false;
          }
        }
      }
      if (ok) setTask(t.id, true, true);
    });
  }
  function mark(t, on, auto) {
    t.cb.checked = on;
    t.li.classList.toggle('task-done', on);
    if (auto && on && !t.li.querySelector('.auto-tag')) t.li.querySelector('.task-check').appendChild(h('span.auto-tag', '✓ spotted'));
  }
  function setTask(id, on, auto) {
    const t = taskEls.find((x) => x.id === id);
    if (!t) return;
    if (on) state.tasks[id] = auto ? 'auto' : true;
    else delete state.tasks[id];
    mark(t, on, auto);
    save();
    updateProgress();
  }

  /* state checks used by data-check="name[:arg]" – pages add their own to MG.checks */
  MG.checks = MG.checks || {};

  /* ------------------------------------------------------------------
     Questions
     ------------------------------------------------------------------ */
  const qEls = [];
  function initQuestions() {
    let n = 0;
    $$('.q').forEach((q) => {
      n++;
      const id = q.dataset.q || 'q' + n;
      const text = q.querySelector('.q-text');
      const model = q.querySelector('.q-model');
      if (model) model.hidden = true;
      const num = q.dataset.label || 'Q' + (q.closest('.chapter') ? (q.closest('.chapter').dataset.num || '') + '.' : '') + (qEls.filter((x) => x.q.closest('.chapter') === q.closest('.chapter')).length + 1);
      const head = h('div.q-h', h('span.q-n', num));
      if (text) head.appendChild(text);
      q.prepend(head);
      const body = h('div.q-body');
      const actions = h('div.q-actions');
      const fb = h('span.q-feedback', { 'aria-live': 'polite' });
      const rec = { id, q, fb, model, type: q.dataset.type || (q.dataset.accept ? 'short' : 'text') };
      const saved = state.answers[id] || {};
      if (rec.type === 'mcq') {
        const opts = q.querySelector('.mcq');
        if (opts) {
          opts.querySelectorAll('input').forEach((inp, k) => {
            inp.name = 'mcq-' + id;
            inp.value = String(k);
            if (saved.choice === String(k)) inp.checked = true;
            inp.addEventListener('change', () => checkMCQ(rec, true));
          });
          body.appendChild(opts);
        }
      } else {
        const inp = rec.type === 'short' ? h('input', { type: 'text', 'aria-label': 'Your answer', placeholder: q.dataset.placeholder || 'Your answer' }) : h('textarea', { 'aria-label': 'Your answer', placeholder: q.dataset.placeholder || 'Type your answer here (it is saved in this browser)' });
        inp.value = saved.text || '';
        rec.input = inp;
        body.appendChild(inp);
        inp.addEventListener('input', () => {
          state.answers[id] = Object.assign(state.answers[id] || {}, { text: inp.value });
          if (rec.type !== 'short') {
            state.answers[id].done = inp.value.trim().length > 3;
            q.classList.toggle('answered', state.answers[id].done);
          }
          save();
          updateProgressSoon();
        });
        if (rec.type === 'short') {
          const chk = h('button.btn.small', { type: 'button', html: MG.icon('check') + '<span>Check</span>' });
          chk.addEventListener('click', () => checkShort(rec, true));
          inp.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), checkShort(rec, true)));
          actions.appendChild(chk);
        }
      }
      if (model && SHOW_ANSWERS) {
        const sb = h('button.btn.small', { type: 'button', text: 'Show answer' });
        sb.addEventListener('click', () => {
          model.hidden = !model.hidden;
          sb.textContent = model.hidden ? 'Show answer' : 'Hide answer';
          if (!model.hidden) {
            state.answers[id] = Object.assign(state.answers[id] || {}, { revealed: true });
            save();
          }
        });
        actions.appendChild(sb);
      }
      actions.appendChild(fb);
      body.appendChild(actions);
      if (model) {
        model.classList.add('q-answer');
        body.appendChild(model);
      }
      q.appendChild(body);
      qEls.push(rec);
      if (rec.type === 'short' && saved.text) checkShort(rec, false);
      if (rec.type === 'mcq' && saved.choice != null) checkMCQ(rec, false);
      if (rec.type === 'text' && saved.done) q.classList.add('answered');
    });
  }
  /* a number in an answer: 1200, 1,200, 1 200, 22,5 (a decimal comma), 1.2e3, 1.2 x 10^3, 1.2 × 10³, 1.2 million, four.
     It is the first number of the answer – or, when the answer is a working (100/0.25 = 400), of the side that is a
     number rather than a sum */
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
  const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const BIG = { hundred: 1e2, thousand: 1e3, million: 1e6, billion: 1e9 };
  function parseNumber(t) {
    let s = String(t || '').replace(/[−–]/g, '-').replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    // a working: the answer is the side of an = that is a number, not a sum (100/0.25 = 400, or 400 = 100/0.25)
    const segs = s.split(/[=≈]/).map((x) => x.trim()).filter((x) => /[\da-z]/i.test(x));
    if (segs.length > 1) {
      const num = (x) => /^[-+~]?\s*\.?\d/.test(x);
      const sum = (x) => /\d\s*(?:[/÷+]|[x×*·⋅](?!\s*10\s*\^))\s*[\d(.]/i.test(x) || /\d\s+-\s*\d/.test(x);
      const last = segs[segs.length - 1], first = segs[0];
      if (num(last) && !sum(last)) s = last;
      else if (num(first) && !sum(first)) s = first;
      else if (num(last)) s = last;
    }
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => '^' + m.split('').map((c) => SUP[c]).join(''));
    // a decimal comma after a lone 0 (0,25); thousands separated by commas or spaces (1,200 or 1 200); other decimal commas (22,5)
    s = s.replace(/(^|[^\d.,])(-?)0,(\d)/g, (m0, a, sign, d) => a + sign + '0.' + d);
    s = s.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1').replace(/(\d) (?=\d{3}(?:[^\d.,]|$))/g, '$1');
    s = s.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
    // a power of ten written without ^ (9.9 x 10-8, as typed without superscripts)
    s = s.replace(/((?:x|×|\*|·|⋅)\s*10)\s*([-+])\s*(\d+)/gi, '$1^$2$3');
    let m = /(-?\d*\.?\d+)\s*(?:x|×|\*|·|⋅)\s*10\s*\^\s*\(?\s*([-+]?\d+)/i.exec(s);
    if (m) return +m[1] * Math.pow(10, +m[2]);
    m = /^10\s*\^\s*\(?\s*([-+]?\d+)/.exec(s);
    if (m) return Math.pow(10, +m[1]);
    m = /(-?\d*\.?\d+(?:e[-+]?\d+)?)(?:\s*(hundred|thousand|million|billion)\b)?/i.exec(s);
    if (m) return parseFloat(m[1]) * (m[2] ? BIG[m[2].toLowerCase()] : 1);
    // a number in words ("four", "twenty-two", "two hundred")
    if (/\bpoint\b/i.test(s)) return null;
    let total = 0, cur = 0, any = false;
    for (const w of s.toLowerCase().split(/[^a-z]+/)) {
      if (w in WORDS) (cur += WORDS[w]), (any = true);
      else if (w === 'hundred' && any) cur *= 100;
      else if ((w === 'thousand' || w === 'million' || w === 'billion') && any) (total += cur * BIG[w]), (cur = 0);
    }
    return any ? total + cur : null;
  }
  /* a numeric answer: "num:120..300" (a range), "num:0.25±0.02", "num:1.2e6±5%" (a tolerance), "num:42" */
  function numOk(spec, text) {
    const x = parseNumber(text);
    if (x == null || !isFinite(x)) return false;
    const N = '(-?[\\d.]+(?:e[-+]?\\d+)?)';
    let m = new RegExp('^' + N + '\\s*\\.\\.\\s*' + N + '$', 'i').exec(spec.trim());
    if (m) return x >= +m[1] && x <= +m[2];
    m = new RegExp('^' + N + '\\s*(?:±|\\+-|\\+/-)\\s*' + N + '(%?)$', 'i').exec(spec.trim());
    if (m) {
      const c = +m[1], tol = m[3] ? (Math.abs(c) * +m[2]) / 100 : +m[2];
      return Math.abs(x - c) <= tol * (1 + 1e-9);
    }
    const c = parseFloat(spec);
    return isFinite(c) && Math.abs(x - c) <= 1e-9 * Math.max(1, Math.abs(c));
  }
  MG.tutorial_numOk = numOk;
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
  }
  function checkShort(rec, user) {
    const v = norm(rec.input.value);
    if (!v) {
      rec.fb.textContent = '';
      return;
    }
    const accept = (rec.q.dataset.accept || '').split('||').map((s) => s.trim()).filter(Boolean);
    const ok = accept.some((a) => {
      const num = /^num:\s*(.+)$/i.exec(a);
      if (num) return numOk(num[1], rec.input.value);
      try {
        return new RegExp(a, 'i').test(v);
      } catch (e) {
        return v === norm(a);
      }
    });
    rec.fb.className = 'q-feedback ' + (ok ? 'ok' : 'no');
    rec.fb.textContent = ok ? '✓ Correct' : '✗ Not quite – ' + (rec.q.dataset.hint || 'check again');
    rec.q.classList.toggle('answered', ok);
    state.answers[rec.id] = Object.assign(state.answers[rec.id] || {}, { text: rec.input.value, correct: ok, done: ok });
    save();
    if (user) {
      updateProgress();
      bus.emit('q:checked', { id: rec.id, ok });
    }
  }
  function checkMCQ(rec, user) {
    const inputs = Array.from(rec.q.querySelectorAll('.mcq input'));
    const chosen = inputs.find((i) => i.checked);
    if (!chosen) return;
    const label = chosen.closest('label');
    const right = label.hasAttribute('data-correct');
    rec.q.querySelectorAll('.mcq label').forEach((l) => l.classList.remove('right', 'wrong'));
    label.classList.add(right ? 'right' : 'wrong');
    rec.fb.className = 'q-feedback ' + (right ? 'ok' : 'no');
    const why = label.dataset.why || '';
    rec.fb.textContent = (right ? '✓ Correct. ' : '✗ Not quite. ') + why;
    rec.q.classList.toggle('answered', right);
    state.answers[rec.id] = { choice: chosen.value, correct: right, done: right, text: label.textContent.trim() };
    save();
    if (user) {
      updateProgress();
      bus.emit('q:checked', { id: rec.id, ok: right });
    }
  }

  /* ------------------------------------------------------------------
     Progress
     ------------------------------------------------------------------ */
  function updateProgress() {
    let done = 0, total = 0;
    chapters.forEach((ch) => {
      let d = 0, t = 0;
      taskEls.forEach((x) => {
        if (ch.contains(x.li) && !x.li.closest('.optional')) {
          t++;
          if (state.tasks[x.id]) d++;
        }
      });
      qEls.forEach((x) => {
        if (ch.contains(x.q) && !x.q.closest('.optional')) {
          t++;
          if ((state.answers[x.id] || {}).done) d++;
        }
      });
      done += d;
      total += t;
      const tab = $(`.ch-tab[data-ch="${ch.id}"]`);
      if (tab) {
        tab.classList.toggle('done', t > 0 && d === t);
        tab.title = t ? `${d} of ${t} done` : '';
      }
    });
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = $('.progress > i');
    if (bar) bar.style.width = pct + '%';
    const lab = $('.progress-label');
    if (lab) lab.textContent = pct + '% done';
  }
  const updateProgressSoon = MG.debounce(updateProgress, 400);

  /* ------------------------------------------------------------------
     Download answers / reset
     ------------------------------------------------------------------ */
  /** the student's name: the one set with the button at the top of the page */
  function studentName() {
    if (state.name) return state.name;
    const U = MG.user;
    return U && U.name && U.name() && U.name() !== U.DEFAULT ? U.name() : '';
  }
  function exportAnswers() {
    const name = studentName();
    const date = new Date().toLocaleString('en-GB');
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>My answers – ${esc(pageTitle())}</title>
<style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:30px auto;color:#222;line-height:1.45}h1{font-size:22px}h2{font-size:17px;border-bottom:1px solid #ccc;margin-top:28px}
.q{margin:12px 0}.qt{font-weight:bold}.a{white-space:pre-wrap;background:#f4f7fa;border-left:3px solid #0b6b8a;padding:6px 10px;margin-top:4px}.none{color:#999;font-style:italic}.ok{color:#16794a}.meta{color:#666}</style></head><body>
<h1>${esc(pageTitle())} – my answers</h1><p class="meta">${name ? 'Name: <b>' + esc(name) + '</b> · ' : ''}Saved ${esc(date)}</p>`;
    chapters.forEach((ch) => {
      const qs = qEls.filter((x) => ch.contains(x.q));
      const ts = taskEls.filter((x) => ch.contains(x.li));
      if (!qs.length && !ts.length) return;
      html += `<h2>${esc(ch.dataset.num ? ch.dataset.num + '. ' : '')}${esc(ch.dataset.title || '')}</h2>`;
      if (ts.length) html += `<p class="meta">Activities completed: ${ts.filter((t) => state.tasks[t.id]).length} of ${ts.length}</p>`;
      qs.forEach((x) => {
        const a = state.answers[x.id] || {};
        const qt = x.q.querySelector('.q-text');
        const num = x.q.querySelector('.q-n');
        html += `<div class="q"><div class="qt">${esc(num ? num.textContent : '')} ${esc(qt ? qt.textContent : '')}</div>${a.text ? `<div class="a">${esc(a.text)}</div>` : '<div class="a none">(no answer)</div>'}${a.correct ? '<div class="ok">✓ Checked and correct</div>' : ''}</div>`;
      });
    });
    html += '</body></html>';
    const fname = 'my-answers' + (name ? '-' + name.replace(/[^a-z0-9]+/gi, '-') : '') + '.html';
    MG.downloadText(html, fname, 'text/html');
    toast('Saved <b>' + esc(fname) + '</b>. You can open it in a web browser or in Word.' + (name ? '' : ' (To put your name on it, set your name with the button at the top of the page, then download it again.)'), null, name ? 4000 : 7000);
    bus.emit('answers:export', {});
  }
  async function copyAnswers() {
    let out = `${pageTitle()} – my answers${studentName() ? ' (' + studentName() + ')' : ''}\n\n`;
    chapters.forEach((ch) => {
      const qs = qEls.filter((x) => ch.contains(x.q));
      if (!qs.length) return;
      out += `== ${ch.dataset.num ? ch.dataset.num + '. ' : ''}${ch.dataset.title} ==\n`;
      qs.forEach((x) => {
        const a = state.answers[x.id] || {};
        out += `${x.q.querySelector('.q-n').textContent} ${x.q.querySelector('.q-text') ? x.q.querySelector('.q-text').textContent : ''}\n${a.text || '(no answer)'}\n\n`;
      });
    });
    (await MG.copyText(out)) ? toast('Your answers have been copied to the clipboard.') : toast('Your answers could not be copied to the clipboard.', 'error');
  }
  function resetProgress() {
    const extra = (MG.page && MG.page.resetNote) || '';
    const m = MG.modal('Start again?', `<p>This clears your ticks and answers <b>in this browser</b>${extra}. Download your answers first if you want to keep them.</p><div class="prompt-actions"><button class="btn" data-x="no" type="button">Cancel</button><button class="btn primary" data-x="yes" type="button">Clear everything</button></div>`);
    m.box.querySelector('[data-x="no"]').addEventListener('click', () => m.close());
    m.box.querySelector('[data-x="yes"]').addEventListener('click', () => {
      if (MG.page && MG.page.onReset) MG.page.onReset();
      store.remove('progress');
      store.remove('chapter');
      location.hash = '';
      location.reload();
    });
  }
  function initMenus() {
    const btn = $('#answersBtn');
    if (btn) btn.addEventListener('click', () => MG.popmenu(btn, [
      ['download', 'Download my answers (.html)', exportAnswers],
      ['copy', 'Copy my answers as text', copyAnswers],
      ['reset', 'Start again (clear my ticks and answers)', resetProgress]
    ]));
    const hb = $('#helpBtn');
    if (hb) hb.addEventListener('click', () => MG.page && MG.page.help && MG.page.help());
    $$('[data-student-name]').forEach((inp) => {
      inp.value = state.name || '';
      inp.addEventListener('input', () => {
        state.name = inp.value;
        save();
      });
    });
    $$('[data-export-answers]').forEach((b) => b.addEventListener('click', exportAnswers));
  }

  function pageTitle() {
    return (document.body.dataset.title || document.title || CFG.courseTitle || 'Practical').trim();
  }

  /* nudge: highlight a workbench tab when the tutorial needs it */
  function initNudges() {
    bus.on('app:chapter', ({ id }) => {
      const ch = document.getElementById(id);
      if (!ch || !ch.dataset.bench) return;
      const tab = $(`.wb-tab[data-wb="${ch.dataset.bench}"]`);
      if (tab && MG.app.currentBench !== ch.dataset.bench) tab.classList.add('attn');
    });
  }

  function init() {
    MG.app.state = state;
    initChapters();
    initActions();
    initTasks();
    initQuestions();
    initMenus();
    initNudges();
    updateProgress();
    if (!SHOW_ANSWERS) document.body.classList.add('no-answers');
    MG_READY_FLAG.ready = true;
    bus.emit('tutorial:ready', {});
  }
  MG.tutorial = { init, showChapter, exportAnswers, setTask: (id, on) => setTask(id, on, true), state };
})();
