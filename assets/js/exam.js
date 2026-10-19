/* =====================================================================
   Exam practice: writing answers as in an online exam.

   The tab works like the candidate's view of a typical online exam system: a top bar with the candidate number and
   the time remaining, one question at a time with an essay editor (formatting, lists, tables, special characters,
   formulas, drawings, backup copies, a word count with a limit), flags, a bar of question tiles, a calculator, and a
   submission page; then a receipt, downloads (Word, PDF by printing, a web page, text) and a review with the marking
   guidance. Everything is kept in the student's browser: each attempt is a file, ~/essays/<paper>-<n>.exam.json.

   ---------------------------------------------------------------------
   PAPERS (exams/<id>.json; build/make_page.py lists them in exams/index.json)
   {
     "id": "calculations",                 a short name (letters, digits, -)
     "title": "Calculations",
     "description": "One line for the list of papers",
     "order": 3,                           the order in the list
     "minutes": 30,                        the time allowed (leave it out, or null, for no time limit)
     "autoSubmit": false,                  true: the answers are submitted when the time is up
     "spellcheck": false,                  is the browser's spelling checker on at the start? (students can switch it)
     "showWordCount": true,                show "Words: …" under essays
     "toolbar": "default",                 the essay toolbar: "default", "basic" (bold, italic, underline, lists,
                                           undo and redo) or "plain" (plain text); a question can have its own
     "instructions": "<p>…</p>",           HTML, on the paper's first page
     "resources": [ {"type": "calculator"},
                    {"type": "slide", "label": "Kidney", "spec": "kidney-cortex@1.2,0.8,10x"},   opens the Microscope
                    {"type": "link", "label": "…", "url": "https://…"} ],
     "questions": [
       {"id": "intro", "type": "info", "title": "About this paper", "text": "<p>…</p>"},
       {"id": "q1", "type": "essay", "title": "…", "text": "<p>…</p>", "marks": 10,
        "words": {"min": 200, "max": 300, "hard": true},   hard: no more words can be typed at the maximum
        "lines": 12,                                        the height of the box, in lines
        "split": true,                                      the question on the left, the answer on the right
        "guidance": "<p>…</p>"},                            shown when the student reviews a submitted attempt
       {"id": "q2", "type": "short", …}                     a short essay (a smaller box)
       {"id": "q3", "type": "numeric", "title": "…", "text": "…", "marks": 2, "units": "µm",
        "answer": 12.5, "tolerance": 0.1,                   right if within ± tolerance (or "tolerancePct": 2, or
                                                            "sigfigs": 3: right when the same to 3 significant figures;
                                                            with none of them, within 1%)
        "guidance": "<p>The worked answer…</p>"},
       {"id": "q4", "type": "mcq", "title": "…", "text": "…", "marks": 1,
        "options": ["…", "…", "…"], "correct": 1, "guidance": "…"}       correct: the number of the right option, from 0
     ]
   }

   ATTEMPTS (~/essays/<paper>-<n>.exam.json): {format, paper (a copy), candidate, started, deadline, submitted,
   timeUp, current, answers: {qid: {html, words} | {value} | {choice}, flag}, backups: {qid: [{time, html, words}]},
   settings: {spellcheck}}.

   EVENTS (MG.bus), for the practicals' steps that tick themselves:
     exam:open     {paper, title}            a paper's first page, or an attempt, is opened
     exam:start    {paper}                   an attempt starts
     exam:words    {paper, q, words}         the number of words of an answer (as the student types; debounced)
     exam:format   {cmd}                     a command of the editor's toolbar: bold, italic, underline, subscript,
                                             superscript, removeFormat, heading, copy, paste, undo, redo, ol, ul, indent,
                                             outdent, special, table, drawing, formula, backup, restore, expand
     exam:flag     {paper, q, on}            a question is flagged or unflagged
     exam:nav      {paper, q}                another question (or 'submission', 'contents') is shown
     exam:timeup   {paper}                   the time allowed has run out
     exam:submit   {paper, answered, total}  the answers are submitted
     exam:download {paper, format}           a submission is downloaded (docx, pdf, html, txt) or saved (docx-file)
     exam:saved    {path}                    the attempt is saved to its file
     (the calculator: calc:open {}, calc:result {expr, value})

   THE PROGRAM: MG.ExamApp(root, {fs}) → .ready (a promise), .shown(), .openPaper(id), .newEssay(), .openFile(path),
   .home(), .submissionPage(), .download(attempt, 'docx' | 'docx-file' | 'pdf' | 'html' | 'txt'), .review(attempt, path);
   .att is the open attempt, .ed its essay editor (MG.ExamEditor: .setHTML(html), .getHTML(), .words(), .command(name)),
   and .skew moves the exam's clock on, in milliseconds (for tests). MG.ExamTeX turns the formulas' TeX into HTML
   (.html), runs of text for Word (.runs) or plain text (.text); MG.examUtil has the word count and numbers' reading.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, toast, store } = MG;
  const CFG = MG.config || {};
  const ESSAYS = () => MG.app.HOME + '/essays';
  const STORE_KEY = 'exam';

  /* ------------------------------------------------------------------
     small helpers
     ------------------------------------------------------------------ */
  const pad2 = (n) => String(n).padStart(2, '0');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtClock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${fmtClock(d)} on ${fmtDate(d)}`;
  };
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;
  /** "1 hour, 57 minutes remaining"; seconds in the last 5 minutes */
  function fmtRemaining(ms) {
    if (ms <= 0) return 'Time is up';
    if (ms <= 5 * 60000) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60), r = s % 60;
      return (m ? plural(m, 'minute') + ', ' : '') + plural(r, 'second') + ' remaining';
    }
    const total = Math.ceil(ms / 60000);
    const hh = Math.floor(total / 60), mm = total % 60;
    return [hh ? plural(hh, 'hour') : '', mm ? plural(mm, 'minute') : ''].filter(Boolean).join(', ') + ' remaining';
  }
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'essay';
  const svg = (body, w = 18) => `<svg class="ic" viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  /* the icons of the exam's own (the toolbar's letters are text) */
  const IC = {
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    flag: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
    flagOn: svg('<path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/>'),
    prev: svg('<path d="M15 6l-6 6 6 6"/>', 22),
    next: svg('<path d="M9 6l6 6-6 6"/>', 22),
    list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    saved: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z"/><path d="M9.5 13l2 2 3.5-3.5"/>'),
    saving: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z"/><path d="M12 11v4M10 13h4"/>'),
    notSaved: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z"/><path d="M10 11l4 4M14 11l-4 4"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'),
    send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
    help: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>'),
    slide: svg('<path d="M9.5 2.8l3.6 1.4-3 7.6-3.6-1.4z"/><path d="M4 16.5h9"/><path d="M13.6 7.6a6.5 6.5 0 0 1 1.9 11.2"/><path d="M5 21h14"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    // the toolbar
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    paste: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
    backup: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>'),
    ol: svg('<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M4 14.5c0-.8.7-1.5 1.5-1.5S7 13.7 7 14.5c0 1.5-3 2-3 3.5h3"/>'),
    ul: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>'),
    outdent: svg('<path d="M21 5H3M21 19H3M21 12h-9M7 9l-3 3 3 3"/>'),
    indent: svg('<path d="M21 5H3M21 19H3M21 12h-9M4 9l3 3-3 3"/>'),
    table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'),
    draw: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    shrink: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
    eraser: svg('<path d="M7 21h10M5.5 15.5l9-9a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L12 17H8z"/>'),
    line: svg('<path d="M5 19L19 5"/>'),
    arrow: svg('<path d="M5 19L19 5M10 5h9v9"/>'),
    rect: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
    ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="6"/>'),
    text: svg('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    pencil: svg('<path d="M4 20c2-6 4-9 6-9s1 6 4 6 4-8 6-11"/>')
  };

  /* ------------------------------------------------------------------
     text: what is in an answer, and how many words
     ------------------------------------------------------------------ */
  const BLOCKS = /^(P|DIV|H[1-6]|LI|UL|OL|TABLE|TR|PRE|BLOCKQUOTE|SECTION)$/;
  /** the text of a node, with a new line between blocks; a formula counts as one word (ƒ) */
  function plainText(node, forCount) {
    let out = '';
    const walk = (n) => {
      if (n.nodeType === 3) {
        out += n.nodeValue;
        return;
      }
      if (n.nodeType !== 1) return;
      if (n.classList.contains('ex-formula')) {
        out += forCount ? ' ƒ ' : ' ' + (TeX.text(n.getAttribute('data-tex') || '') || n.textContent) + ' ';
        return;
      }
      if (n.tagName === 'IMG') {
        out += forCount ? ' ' : ' [drawing] ';
        return;
      }
      if (n.tagName === 'BR') {
        out += '\n';
        return;
      }
      const block = BLOCKS.test(n.tagName);
      if (block) out += '\n';
      if (n.tagName === 'TD' || n.tagName === 'TH') out += ' ';
      Array.from(n.childNodes).forEach(walk);
      if (block) out += '\n';
      if (n.tagName === 'TD' || n.tagName === 'TH') out += ' \t';
    };
    walk(node);
    return out;
  }
  const WORDISH = /[\p{L}\p{N}]/u;
  function countWords(text) {
    const m = String(text || '').match(/\S+/g) || [];
    return m.filter((w) => WORDISH.test(w)).length;
  }
  function wordsOfHTML(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return countWords(plainText(d, true));
  }
  /** the first n words of a text (for pasting into an answer that has a word limit) */
  function firstWords(text, n) {
    if (n <= 0) return '';
    const re = /\S+/g;
    let m, k = 0, end = 0;
    while ((m = re.exec(text))) {
      if (WORDISH.test(m[0])) k++;
      end = m.index + m[0].length;
      if (k >= n) break;
    }
    return text.slice(0, end);
  }

  /** HTML from outside (pasted, or kept in a file) → the few tags an answer may contain */
  const ALLOWED = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'img', 'div'];
  function cleanHTML(html, opts = {}) {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html || ''}</body>`, 'text/html');
    const B = doc.body;
    B.querySelectorAll('script,style,meta,link,title,xml,o\\:p').forEach((n) => n.remove());
    if (opts.foreign) {
      // what the styles of other programs mean, as tags (Word, Google Docs, web pages)
      B.querySelectorAll('[style]').forEach((el) => {
        const st = el.style;
        const fw = String(st.fontWeight || '');
        const bold = fw === 'bold' || fw === 'bolder' || (+fw && +fw >= 600);
        const notBold = fw === 'normal' || (+fw && +fw < 600);
        const wrapWith = (tag) => {
          const w = doc.createElement(tag);
          while (el.firstChild) w.appendChild(el.firstChild);
          el.appendChild(w);
        };
        if (bold && !/^(B|STRONG|H\d|TH)$/.test(el.tagName)) wrapWith('b');
        if (el.tagName === 'B' && notBold) el.setAttribute('data-unwrap', '1');
        if (st.fontStyle === 'italic' && !/^(I|EM)$/.test(el.tagName)) wrapWith('i');
        if (/underline/.test(st.textDecoration || st.textDecorationLine || '') && el.tagName !== 'U') wrapWith('u');
        if (st.verticalAlign === 'super') wrapWith('sup');
        if (st.verticalAlign === 'sub') wrapWith('sub');
      });
      B.querySelectorAll('[data-unwrap]').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
      // our own formulas and drawings may come back (copied from another answer); other pictures may not
      B.querySelectorAll('img:not(.ex-drawing)').forEach((n) => n.remove());
    }
    let out = window.DOMPurify
      ? window.DOMPurify.sanitize(B.innerHTML, { ALLOWED_TAGS: ALLOWED, ALLOWED_ATTR: ['class', 'data-tex', 'data-drawing', 'data-indent', 'src', 'alt', 'title', 'width', 'height', 'contenteditable'], ALLOW_DATA_ATTR: false })
      : B.innerHTML;
    const t = document.createElement('template');
    t.innerHTML = out;
    const R = t.content;
    R.querySelectorAll('img').forEach((im) => {
      if (!im.classList.contains('ex-drawing') || !/^data:image\/png;base64,/.test(im.getAttribute('src') || '')) im.remove();
      else im.className = 'ex-drawing';
    });
    // a formula is kept (as its TeX: what is inside it is drawn again below); other spans go, their text stays
    const isFormula = (s) => s.classList.contains('ex-formula') && !!s.getAttribute('data-tex');
    R.querySelectorAll('span').forEach((s) => {
      if (isFormula(s) || (s.parentElement && s.parentElement.closest('.ex-formula'))) return;
      s.replaceWith(...Array.from(s.childNodes));
    });
    R.querySelectorAll('h4,h5,h6').forEach((x) => {
      const n = document.createElement('h3');
      n.append(...Array.from(x.childNodes));
      x.replaceWith(n);
    });
    R.querySelectorAll('div').forEach((x) => {
      if (Array.from(x.children).some((c) => BLOCKS.test(c.tagName))) x.replaceWith(...Array.from(x.childNodes));
      else {
        const p = document.createElement('p');
        p.append(...Array.from(x.childNodes));
        if (x.getAttribute('data-indent')) p.setAttribute('data-indent', x.getAttribute('data-indent'));
        x.replaceWith(p);
      }
    });
    R.querySelectorAll('[class]').forEach((x) => {
      if (/^(ex-formula|ex-drawing|ex-table)$/.test(x.className)) return;
      if (x.parentElement && x.parentElement.closest('.ex-formula')) return;
      x.removeAttribute('class');
    });
    R.querySelectorAll('[contenteditable]').forEach((x) => {
      if (!x.classList.contains('ex-formula')) x.removeAttribute('contenteditable');
    });
    R.querySelectorAll('table').forEach((x) => (x.className = 'ex-table'));
    R.querySelectorAll('span.ex-formula').forEach((s) => {
      if (!isFormula(s)) return s.replaceWith(...Array.from(s.childNodes));
      s.className = 'ex-formula';
      s.setAttribute('contenteditable', 'false');
      s.innerHTML = TeX.html(s.getAttribute('data-tex'));
    });
    const d = document.createElement('div');
    d.appendChild(R);
    return d.innerHTML;
  }
  const textToHTML = (text) =>
    String(text || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n{2,}/)
      .map((para) => `<p>${esc(para).replace(/\n/g, '<br>') || '<br>'}</p>`)
      .join('');

  /* ------------------------------------------------------------------
     numbers in answers
     ------------------------------------------------------------------ */
  const SUPD = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
  /** what a student typed as a number → a number, or NaN ("1.2 × 10^-3", "1.2e-3", "1,200", "−4") */
  function parseNumber(s) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return NaN;
    t = t.replace(/[−–—]/g, '-').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => '^' + m.split('').map((c) => SUPD[c]).join(''));
    t = t.replace(/\s+/g, '');
    t = t.replace(/^(-?[\d.,]+)(?:[x×*·]10\^?\(?([+-]?\d+)\)?)/i, '$1e$2').replace(/^(-?)10\^\(?([+-]?\d+)\)?/, (m0, sign, e) => `${sign}1e${e}`);
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    const m = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(t);
    if (!m) return NaN;
    return parseFloat(m[0]);
  }
  function numericRight(q, value) {
    const v = parseNumber(value);
    if (!Number.isFinite(v) || q.answer == null) return null;
    const a = +q.answer;
    if (q.tolerancePct != null) return Math.abs(v - a) <= Math.abs(a) * q.tolerancePct / 100 + 1e-12;
    if (q.sigfigs) {
      const r = (x) => +Number(x).toPrecision(q.sigfigs);
      return r(v) === r(a);
    }
    const tol = q.tolerance != null ? +q.tolerance : Math.abs(a) * 0.01;
    return Math.abs(v - a) <= tol + 1e-12;
  }

  /* ------------------------------------------------------------------
     formulas: a small part of TeX, drawn with HTML and CSS
     \frac{a}{b}  x^{2}  x_{i}  \sqrt{x}  \sqrt[3]{x}  \alpha … \Omega  \times \div \pm \leq \geq \approx \neq
     \rightarrow \rightleftharpoons \Delta \infty \propto \cdot  \ln \log \exp \sin …  \text{…}  \left( \right)
     ------------------------------------------------------------------ */
  const TeX = (() => {
    const SYM = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
      times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼', equiv: '≡', propto: '∝', infty: '∞', degree: '°', circ: '°',
      rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftrightarrow: '⇔', rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓',
      partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', ldots: '…', cdots: '⋯', prime: '′', ell: 'ℓ', hbar: 'ℏ', AA: 'Å', micro: 'µ', permil: '‰', percent: '%',
      lbrack: '[', rbrack: ']', langle: '⟨', rangle: '⟩', vert: '|', '%': '%', '{': '{', '}': '}', _: '_', '#': '#', '&': '&', $: '$'
    };
    const OPS = new Set(['+', '−', '=', '<', '>', '×', '÷', '±', '∓', '·', '≤', '≥', '≠', '≈', '∼', '≡', '∝', '→', '←', '↔', '⇒', '⇔', '⇌']);
    const FN = new Set(['ln', 'log', 'exp', 'sin', 'cos', 'tan', 'lim', 'max', 'min', 'det']);
    const SPACE = { ',': ' ', ';': ' ', ' ': ' ', quad: '  ', qquad: '    ', '!': '' };
    function tokenize(src) {
      const out = [];
      let i = 0;
      const s = String(src || '');
      while (i < s.length) {
        const c = s[i];
        if (c === '\\') {
          const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
          if (!m) {
            out.push({ t: 'ch', v: '\\' });
            i++;
            continue;
          }
          i += m[0].length;
          // ordinary words (\text{…}): taken as typed, spaces and all
          if (/^(text|textrm|textit|mathrm|mbox)$/.test(m[1])) {
            const open = /^\s*\{/.exec(s.slice(i));
            if (!open) throw new Error(`\\${m[1]} needs its words in braces: \\${m[1]}{…}.`);
            let j = i + open[0].length, depth = 1, raw = '';
            for (; j < s.length; j++) {
              const ch = s[j];
              if (ch === '\\' && j + 1 < s.length && /[{}%_#&$\\ ]/.test(s[j + 1])) {
                raw += s[j + 1] === '\\' ? ' ' : s[j + 1];
                j++;
                continue;
              }
              if (ch === '{') depth++;
              if (ch === '}' && --depth === 0) break;
              raw += ch;
            }
            if (depth) throw new Error('A } is missing.');
            out.push({ t: 'text', v: raw, it: m[1] === 'textit' });
            i = j + 1;
            continue;
          }
          out.push({ t: 'cmd', v: m[1] });
          continue;
        }
        if (/\s/.test(c)) {
          i++;
          continue;
        }
        if ('{}^_[]'.includes(c)) out.push({ t: c });
        else if (/\d/.test(c)) {
          const m = /^\d+(\.\d+)?/.exec(s.slice(i));
          out.push({ t: 'num', v: m[0] });
          i += m[0].length;
          continue;
        } else out.push({ t: 'ch', v: c });
        i++;
      }
      return out;
    }
    function parse(src) {
      const toks = tokenize(src);
      let k = 0;
      const peek = () => toks[k];
      const next = () => toks[k++];
      function list(end) {
        const items = [];
        while (k < toks.length && !(end && peek().t === end)) {
          const t = peek();
          if (t.t === '}' && end !== '}') throw new Error('There is a } without a {.');
          const a = atom();
          if (!a) continue;
          for (;;) {
            const p = peek();
            if (p && p.t === '^') {
              next();
              if (a.sup) throw new Error('Two superscripts in a row: put them in braces, as in x^{ab}.');
              a.sup = arg();
            } else if (p && p.t === '_') {
              next();
              if (a.sub) throw new Error('Two subscripts in a row: put them in braces, as in x_{ab}.');
              a.sub = arg();
            } else break;
          }
          items.push(a);
        }
        if (end) {
          if (k >= toks.length) throw new Error(end === '}' ? 'A } is missing.' : 'A ] is missing.');
          next();
        }
        return items;
      }
      function arg() {
        const t = peek();
        if (!t) throw new Error('Something is missing after ^ or _ or a command.');
        if (t.t === '{') {
          next();
          return list('}');
        }
        if (t.t === 'num' && t.v.length > 1) {
          // x^23 means x²3, as in TeX: only the first digit
          next();
          toks.splice(k, 0, { t: 'num', v: t.v.slice(1) });
          return [{ k: 'mn', s: t.v[0] }];
        }
        const a = atom();
        return a ? [a] : [];
      }
      function atom() {
        const t = next();
        if (t.t === '{') return { k: 'grp', c: list('}') };
        if (t.t === 'num') return { k: 'mn', s: t.v };
        if (t.t === 'text') return { k: 'mt', s: t.v, it: t.it };
        if (t.t === '^' || t.t === '_') throw new Error(`${t.t} needs something before it.`);
        if (t.t === '[' || t.t === ']') return { k: 'mt', s: t.t };
        if (t.t === 'ch') {
          const v = t.v === '-' ? '−' : t.v === '*' ? '×' : t.v;
          if (/[A-Za-z]/.test(v)) return { k: 'mi', s: v };
          if (OPS.has(v)) return { k: 'mo', s: v };
          return { k: 'mt', s: v };
        }
        if (t.t === 'cmd') {
          const c = t.v;
          if (c === 'frac' || c === 'dfrac' || c === 'tfrac') return { k: 'frac', n: arg(), d: arg() };
          if (c === 'sqrt') {
            let idx = null;
            if (peek() && peek().t === '[') {
              next();
              idx = list(']');
            }
            return { k: 'sqrt', b: arg(), idx };
          }
          if (c === 'left' || c === 'right') {
            const d = next();
            if (!d) throw new Error(`\\${c} needs a bracket after it.`);
            const v = d.t === 'cmd' ? SYM[d.v] || '' : d.v || d.t;
            return v === '.' ? null : { k: 'mt', s: v };
          }
          if (FN.has(c)) return { k: 'fn', s: c };
          if (c in SPACE) return { k: 'sp', s: SPACE[c] };
          if (SYM[c]) return OPS.has(SYM[c]) ? { k: 'mo', s: SYM[c] } : /[α-ωΑ-Ω]/.test(SYM[c]) ? { k: 'mg', s: SYM[c] } : { k: 'mt', s: SYM[c] };
          throw new Error(`I don’t know \\${c}.`);
        }
        return null;
      }
      return list(null);
    }
    function htmlOf(items) {
      return items.map(item).join('');
    }
    function item(a) {
      let base;
      switch (a.k) {
        case 'mi': base = `<i>${esc(a.s)}</i>`; break;
        case 'mn': base = esc(a.s); break;
        case 'mo': base = `<span class="mo">${esc(a.s)}</span>`; break;
        case 'mg': base = `<span class="mg">${esc(a.s)}</span>`; break;
        case 'mt': base = `<span class="mt${a.it ? ' it' : ''}">${esc(a.s)}</span>`; break;
        case 'fn': base = `<span class="mfn">${esc(a.s)}</span>`; break;
        case 'sp': base = a.s ? `<span class="msp">${a.s.replace(/ /g, '&#8201;')}</span>` : ''; break;
        case 'grp': base = htmlOf(a.c); break;
        case 'frac': base = `<span class="mfrac"><span class="mnum">${htmlOf(a.n) || '&#8203;'}</span><span class="mden">${htmlOf(a.d) || '&#8203;'}</span></span>`; break;
        case 'sqrt': base = `<span class="msqrt">${a.idx ? `<span class="mroot">${htmlOf(a.idx)}</span>` : ''}<span class="msurd">√</span><span class="mrad">${htmlOf(a.b) || '&#8203;'}</span></span>`; break;
        default: base = '';
      }
      if (a.sup && a.sub) return `${base}<span class="msubsup"><span class="msup">${htmlOf(a.sup)}</span><span class="msub">${htmlOf(a.sub)}</span></span>`;
      if (a.sup) return `${base}<sup>${htmlOf(a.sup)}</sup>`;
      if (a.sub) return `${base}<sub>${htmlOf(a.sub)}</sub>`;
      return base;
    }
    /* runs of text (for Word and plain text): {s, sup, sub, i} */
    function runsOf(items, f = {}) {
      const out = [];
      const push = (s, g) => s && out.push(Object.assign({ s }, f, g || {}));
      const simple = (list) => list.length <= 1 && !(list[0] && (list[0].k === 'frac' || list[0].k === 'grp' || list[0].sup || list[0].sub)) && !(list[0] && list[0].k === 'mo');
      items.forEach((a) => {
        switch (a.k) {
          case 'mi': push(a.s, { i: true }); break;
          case 'mn': case 'mt': case 'mg': push(a.s); break;
          case 'mo': push(` ${a.s} `); break;
          case 'fn': push(a.s + ' '); break;
          case 'sp': push(a.s); break;
          case 'grp': out.push(...runsOf(a.c, f)); break;
          case 'frac': {
            const sn = simple(a.n), sd = simple(a.d);
            if (!sn) push('(');
            out.push(...runsOf(a.n, f));
            if (!sn) push(')');
            push('/');
            if (!sd) push('(');
            out.push(...runsOf(a.d, f));
            if (!sd) push(')');
            break;
          }
          case 'sqrt':
            if (a.idx) out.push(...runsOf(a.idx, Object.assign({}, f, { sup: true, sub: false })));
            push('√');
            if (!simple(a.b)) push('(');
            out.push(...runsOf(a.b, f));
            if (!simple(a.b)) push(')');
            break;
          default:
        }
        if (a.sup) out.push(...runsOf(a.sup, Object.assign({}, f, { sup: true, sub: false })));
        if (a.sub) out.push(...runsOf(a.sub, Object.assign({}, f, { sub: true, sup: false })));
      });
      return out;
    }
    const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', i: 'ⁱ' };
    const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋' };
    function textOf(runs) {
      let s = '';
      for (let k = 0; k < runs.length; ) {
        const r = runs[k];
        if (!r.sup && !r.sub) {
          s += r.s;
          k++;
          continue;
        }
        // a stretch of superscript (or subscript)
        let j = k, t = '';
        while (j < runs.length && !!runs[j].sup === !!r.sup && !!runs[j].sub === !!r.sub) t += runs[j++].s;
        const map = r.sup ? SUP : SUB;
        const all = t.split('').every((c) => map[c]);
        s += all ? t.split('').map((c) => map[c]).join('') : (r.sup ? '^' : '_') + (t.length > 1 ? `(${t.trim()})` : t);
        k = j;
      }
      return s.replace(/\s+/g, ' ').trim();
    }
    return {
      parse,
      html: (src) => {
        try {
          return htmlOf(parse(src));
        } catch (e) {
          return `<span class="merr">${esc(src)}</span>`;
        }
      },
      check: (src) => {
        try {
          parse(src);
          return null;
        } catch (e) {
          return e.message;
        }
      },
      runs: (src) => runsOf(parse(src)),
      text: (src) => {
        try {
          return textOf(runsOf(parse(src)));
        } catch (e) {
          return src;
        }
      }
    };
  })();
  MG.ExamTeX = TeX;

  /* ------------------------------------------------------------------
     dialogs of the editor
     ------------------------------------------------------------------ */
  function dialog(title, body, opts = {}) {
    const m = MG.modal(title, '', { onClose: opts.onClose });
    m.box.classList.add('ex-dlg');
    if (opts.wide) m.box.classList.add('wide');
    m.box.querySelector('.modal-b').appendChild(body);
    return m;
  }
  const SPECIAL = [
    ['Greek', 'α β γ δ ε ζ η θ κ λ μ ν ξ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω'],
    ['Maths', '± ∓ × ÷ − · = ≠ ≈ ∼ ≡ < > ≤ ≥ ∝ ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ ′ ″ … ½ ¼ ¾ ⅓ %'],
    ['Arrows', '→ ← ↑ ↓ ↔ ⇌ ⇒ ⇔ ⟶ ↗ ↘'],
    ['Science', '° ℃ µ Å Ω ‰ ℓ ⊕ ⊖ • ∘ ✓ ✗'],
    ['Superscript', '⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁽ ⁾ ⁿ'],
    ['Subscript', '₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋ ₍ ₎'],
    ['Letters', 'à á â ä æ ç è é ê ë í ï ñ ó ô ö ø œ ß ú ü ý Å É Ö Ü']
  ];
  const NAMES = { '−': 'minus sign', '·': 'middle dot', '±': 'plus or minus', '×': 'times', '÷': 'divided by', '≈': 'approximately equal to', '≠': 'not equal to', '≤': 'less than or equal to', '≥': 'greater than or equal to', '∝': 'proportional to', '⇌': 'equilibrium', '→': 'right arrow', '°': 'degree', 'µ': 'micro', 'Å': 'ångström', 'Ω': 'ohm, or capital omega', '∆': 'increment (delta)', '‰': 'per thousand', '℃': 'degrees Celsius' };
  function specialDialog(onPick) {
    const wrap = h('div.ex-special');
    SPECIAL.forEach(([name, chars]) => {
      const grid = h('div.ex-sgrid', { role: 'group', 'aria-label': name });
      chars.split(' ').forEach((c) => {
        const b = h('button', { type: 'button', title: NAMES[c] || c, 'aria-label': NAMES[c] || c }, c);
        b.addEventListener('click', () => {
          m.close();
          onPick(c);
        });
        grid.appendChild(b);
      });
      wrap.append(h('h4', name), grid);
    });
    const cancel = h('button.btn', { type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => m.close());
    wrap.appendChild(h('div.prompt-actions', cancel));
    const m = dialog('Select a special character', wrap);
    setTimeout(() => wrap.querySelector('button').focus(), 30);
  }
  function tableDialog(onInsert) {
    const rows = h('input', { type: 'number', min: 1, max: 30, value: 3 });
    const cols = h('input', { type: 'number', min: 1, max: 10, value: 3 });
    const head = h('input', { type: 'checkbox', checked: true });
    const ok = h('button.btn.primary', { type: 'submit' }, 'Insert the table');
    const cancel = h('button.btn', { type: 'button' }, 'Cancel');
    const form = h('form.ex-form', h('label', 'Rows ', rows), h('label', 'Columns ', cols), h('label.check', head, ' The first row is a header row'), h('div.prompt-actions', cancel, ok));
    const m = dialog('Table', form);
    cancel.addEventListener('click', () => m.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = Math.max(1, Math.min(30, +rows.value || 1)), c = Math.max(1, Math.min(10, +cols.value || 1));
      m.close();
      onInsert(r, c, head.checked);
    });
    setTimeout(() => rows.focus(), 30);
  }
  function tableHTML(r, c, head) {
    const cell = (tag) => `<${tag}><br></${tag}>`;
    let x = '<table class="ex-table">';
    if (head) x += `<thead><tr>${cell('th').repeat(c)}</tr></thead>`;
    x += '<tbody>';
    for (let i = 0; i < (head ? r - 1 : r); i++) x += `<tr>${cell('td').repeat(c)}</tr>`;
    return x + '</tbody></table><p><br></p>';
  }

  /* the formula editor */
  const F_BTNS = [
    ['Structures', [['a/b', '\\frac{}{}', 'Fraction'], ['xⁿ', '^{}', 'Superscript (power)'], ['xₙ', '_{}', 'Subscript'], ['√', '\\sqrt{}', 'Square root'], ['ⁿ√', '\\sqrt[]{}', 'Root'], ['( )', '\\left(  \\right)', 'Brackets that grow'], ['[ ]', '[]', 'Square brackets (concentrations)'], ['abc', '\\text{}', 'Ordinary words']]],
    ['Greek', 'alpha beta gamma delta epsilon theta lambda mu pi rho sigma tau phi omega Delta Sigma Omega'.split(' ').map((n) => [TeXSym(n), '\\' + n + ' ', n])],
    ['Operators', [['×', '\\times ', 'times'], ['÷', '\\div ', 'divided by'], ['±', '\\pm ', 'plus or minus'], ['·', '\\cdot ', 'dot'], ['≤', '\\leq ', 'less than or equal'], ['≥', '\\geq ', 'greater than or equal'], ['≈', '\\approx ', 'approximately'], ['≠', '\\neq ', 'not equal'], ['∝', '\\propto ', 'proportional to'], ['→', '\\rightarrow ', 'arrow'], ['⇌', '\\rightleftharpoons ', 'equilibrium'], ['∞', '\\infty ', 'infinity'], ['°', '\\degree ', 'degree']]],
    ['Functions', [['ln', '\\ln ', 'natural logarithm'], ['log', '\\log ', 'logarithm'], ['exp', '\\exp ', 'exponential'], ['sin', '\\sin ', 'sine'], ['cos', '\\cos ', 'cosine'], ['∑', '\\sum ', 'sum'], ['∫', '\\int ', 'integral']]]
  ];
  function TeXSym(n) {
    return { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω' }[n];
  }
  const F_EXAMPLES = [
    ['Ohm’s law', 'V = IR'],
    ['Flow, pressure and resistance', 'Q = \\frac{\\Delta P}{R}'],
    ['Nernst equation', 'E = \\frac{RT}{zF} \\ln \\frac{[X]_{o}}{[X]_{i}}'],
    ['Time constant', '\\tau = RC'],
    ['Concentration × volume', 'C_{1}V_{1} = C_{2}V_{2}'],
    ['Exponential decay', 'N = N_{0} e^{-kt}']
  ];
  function formulaDialog(start, onDone) {
    const ta = h('textarea.ex-ftex', { rows: 3, spellcheck: 'false', 'aria-label': 'The formula, written with \\ commands', placeholder: 'e.g. Q = \\frac{\\Delta P}{R}' }, start || '');
    const prev = h('div.ex-fprev', { 'aria-live': 'polite' });
    const err = h('div.ex-ferr', { role: 'status' });
    const insert = (s) => {
      const a = ta.selectionStart, b = ta.selectionEnd;
      ta.setRangeText(s, a, b, 'end');
      // the cursor into the first empty braces of what was put in
      const hole = s.indexOf('{}');
      if (hole >= 0) ta.selectionStart = ta.selectionEnd = a + hole + 1;
      else if (s.indexOf('[]') >= 0) ta.selectionStart = ta.selectionEnd = a + s.indexOf('[]') + 1;
      else if (s.indexOf('(  ') >= 0) ta.selectionStart = ta.selectionEnd = a + s.indexOf('(  ') + 2;
      ta.focus();
      update();
    };
    const pal = h('div.ex-fpal');
    F_BTNS.forEach(([name, list]) => {
      const g = h('div.ex-fgroup', { role: 'group', 'aria-label': name }, h('span.ex-fname', name));
      list.forEach(([label, ins, title]) => {
        const b = h('button', { type: 'button', title, 'aria-label': title }, label);
        b.addEventListener('click', () => insert(ins));
        g.appendChild(b);
      });
      pal.appendChild(g);
    });
    const ex = h('select.ex-fex', { 'aria-label': 'Examples' }, h('option', { value: '' }, 'Start from an example…'), F_EXAMPLES.map(([n, t]) => h('option', { value: t }, n)));
    ex.addEventListener('change', () => {
      if (ex.value) {
        ta.value = ex.value;
        update();
        ta.focus();
      }
      ex.value = '';
    });
    const ok = h('button.btn.primary', { type: 'button' }, start ? 'Done' : 'Insert');
    const cancel = h('button.btn', { type: 'button' }, 'Cancel');
    function update() {
      const s = ta.value.trim();
      const e = s ? TeX.check(s) : null;
      prev.innerHTML = s ? (e ? '' : TeX.html(s)) : '<span class="muted">The formula appears here.</span>';
      err.textContent = e || '';
      ok.disabled = !s || !!e;
    }
    ta.addEventListener('input', update);
    const help = h('p.hint', 'Type the formula, or use the buttons. Braces {} group things: x^{2a}, \\frac{top}{bottom}. Square brackets for concentrations: [Na^{+}]. Ordinary words: \\text{mmHg}.');
    const body = h('div.ex-formula-dlg', h('div.ex-ftop', ex), pal, ta, help, h('div.ex-fprevwrap', h('span.ex-fname', 'Preview'), prev), err, h('div.prompt-actions', cancel, ok));
    const m = dialog('Edit formula', body, { wide: true });
    cancel.addEventListener('click', () => m.close());
    ok.addEventListener('click', () => {
      const s = ta.value.trim();
      if (!s || TeX.check(s)) return;
      m.close();
      onDone(s);
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ok.click();
      }
    });
    update();
    setTimeout(() => ta.focus(), 30);
  }

  /* the drawing tool: shapes kept as data, so that a drawing can be changed later */
  const D_COLOURS = ['#111111', '#c92a2a', '#1864ab', '#2b8a3e', '#e67700', '#862e9c'];
  function drawShapes(g, shapes, W, H) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    shapes.forEach((s) => {
      g.save();
      g.strokeStyle = s.c;
      g.fillStyle = s.c;
      g.lineWidth = s.w;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (s.t === 'pen' || s.t === 'eraser') {
        if (s.t === 'eraser') {
          g.strokeStyle = '#ffffff';
          g.lineWidth = s.w * 4;
        }
        g.beginPath();
        s.p.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.01, s.p[0][1]);
        g.stroke();
      } else if (s.t === 'line' || s.t === 'arrow') {
        g.beginPath();
        g.moveTo(s.x1, s.y1);
        g.lineTo(s.x2, s.y2);
        g.stroke();
        if (s.t === 'arrow') {
          const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), L = 8 + s.w * 3;
          g.beginPath();
          g.moveTo(s.x2, s.y2);
          g.lineTo(s.x2 - L * Math.cos(a - 0.45), s.y2 - L * Math.sin(a - 0.45));
          g.lineTo(s.x2 - L * Math.cos(a + 0.45), s.y2 - L * Math.sin(a + 0.45));
          g.closePath();
          g.fill();
        }
      } else if (s.t === 'rect') {
        g.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
      } else if (s.t === 'ellipse') {
        g.beginPath();
        g.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2 || 0.5, Math.abs(s.y2 - s.y1) / 2 || 0.5, 0, 0, Math.PI * 2);
        g.stroke();
      } else if (s.t === 'text') {
        g.font = `${12 + s.w * 3}px system-ui, -apple-system, Segoe UI, sans-serif`;
        g.textBaseline = 'top';
        g.fillText(s.s, s.x1, s.y1);
      }
      g.restore();
    });
  }
  function drawingDialog(start, onDone) {
    const W = 640, H = 400;
    const data = start ? JSON.parse(JSON.stringify(start)) : { w: W, h: H, shapes: [] };
    let tool = 'pen', colour = D_COLOURS[0], width = 2;
    const cv = h('canvas.ex-dcanvas', { width: W, height: H, 'aria-label': 'The drawing area' });
    const g = cv.getContext('2d');
    const redraw = (extra) => drawShapes(g, extra ? data.shapes.concat([extra]) : data.shapes, W, H);
    const tools = h('div.ex-dtools', { role: 'toolbar', 'aria-label': 'Drawing tools' });
    const TOOLS = [['pen', 'Pencil', IC.pencil], ['line', 'Line', IC.line], ['arrow', 'Arrow', IC.arrow], ['rect', 'Rectangle', IC.rect], ['ellipse', 'Ellipse', IC.ellipse], ['text', 'Text', IC.text], ['eraser', 'Eraser', IC.eraser]];
    const tbtn = {};
    TOOLS.forEach(([id, label, ic]) => {
      const b = h('button.ex-dt', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': id === tool ? 'true' : 'false', html: ic });
      b.addEventListener('click', () => {
        tool = id;
        Object.entries(tbtn).forEach(([k, x]) => x.setAttribute('aria-pressed', k === id ? 'true' : 'false'));
      });
      tbtn[id] = b;
      tools.appendChild(b);
    });
    tools.appendChild(h('span.ex-dsep'));
    const sw = {};
    D_COLOURS.forEach((c) => {
      const b = h('button.ex-dcol', { type: 'button', title: 'Colour', 'aria-label': 'Colour ' + c, 'aria-pressed': c === colour ? 'true' : 'false', style: { background: c } });
      b.addEventListener('click', () => {
        colour = c;
        Object.entries(sw).forEach(([k, x]) => x.setAttribute('aria-pressed', k === c ? 'true' : 'false'));
      });
      sw[c] = b;
      tools.appendChild(b);
    });
    tools.appendChild(h('span.ex-dsep'));
    const wsel = h('select', { 'aria-label': 'Line width' }, h('option', { value: 2 }, 'Thin'), h('option', { value: 4 }, 'Medium'), h('option', { value: 7 }, 'Thick'));
    wsel.addEventListener('change', () => (width = +wsel.value));
    tools.appendChild(wsel);
    const undo = h('button.tbtn', { type: 'button', html: IC.undo + '<span>Undo</span>' });
    undo.addEventListener('click', () => {
      data.shapes.pop();
      redraw();
    });
    const clear = h('button.tbtn', { type: 'button', html: IC.trash + '<span>Clear</span>' });
    clear.addEventListener('click', () => {
      data.shapes = [];
      redraw();
    });
    tools.append(h('span.grow'), undo, clear);
    // drawing with the pointer
    let cur = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [Math.round(((e.clientX - r.left) * W) / r.width), Math.round(((e.clientY - r.top) * H) / r.height)];
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      if (tool === 'text') {
        const inp = h('input.ex-dtext', { type: 'text', placeholder: 'Type, then Enter', style: { left: (e.clientX - cv.getBoundingClientRect().left) + 'px', top: (e.clientY - cv.getBoundingClientRect().top) + 'px' } });
        cv.parentNode.appendChild(inp);
        let finished = false;
        const fin = (keep) => {
          // (once: taking the box away makes it lose the focus, which would finish it again)
          if (finished) return;
          finished = true;
          const s = inp.value.trim();
          inp.remove();
          if (keep && s) {
            data.shapes.push({ t: 'text', c: colour, w: width, x1: x, y1: y, s });
            redraw();
          }
        };
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            fin(true);
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            fin(false);
          }
        });
        inp.addEventListener('blur', () => fin(true));
        setTimeout(() => inp.focus(), 0);
        return;
      }
      cv.setPointerCapture(e.pointerId);
      cur = tool === 'pen' || tool === 'eraser' ? { t: tool, c: colour, w: width, p: [[x, y]] } : { t: tool, c: colour, w: width, x1: x, y1: y, x2: x, y2: y };
      redraw(cur);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const [x, y] = pos(e);
      if (cur.p) cur.p.push([x, y]);
      else {
        cur.x2 = x;
        cur.y2 = y;
      }
      redraw(cur);
    });
    const up = () => {
      if (!cur) return;
      const s = cur;
      cur = null;
      if (!s.p && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3) return redraw();
      data.shapes.push(s);
      redraw();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    redraw();
    const discard = h('button.btn', { type: 'button' }, 'Discard changes');
    const save = h('button.btn.primary', { type: 'button' }, 'Save and close');
    const body = h('div.ex-draw', tools, h('div.ex-dwrap', cv), h('div.prompt-actions', discard, save));
    const m = dialog('Drawing tool', body, { wide: true });
    discard.addEventListener('click', () => m.close());
    save.addEventListener('click', () => {
      m.close();
      if (!data.shapes.length) return onDone(null);
      redraw();
      // the picture is cut to what was drawn (with a margin), so that a small sketch is not a large white space
      const box = inkBox(g, W, H);
      if (!box) return onDone(null);
      const c2 = document.createElement('canvas');
      c2.width = box.w;
      c2.height = box.h;
      c2.getContext('2d').drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      onDone({ data, png: c2.toDataURL('image/png'), w: box.w, h: box.h });
    });
  }
  /** the part of the drawing area that has something drawn on it (not white), with a margin → {x, y, w, h}, or null */
  function inkBox(g, W, H) {
    const px = g.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const M = 14;
    const span = (a, b, min, max) => {
      a = Math.max(0, a - M);
      b = Math.min(max - 1, b + M);
      const short = min - (b - a + 1);
      if (short > 0) {
        a = Math.max(0, a - Math.ceil(short / 2));
        b = Math.min(max - 1, a + min - 1);
        a = Math.max(0, b - min + 1);
      }
      return [a, b - a + 1];
    };
    const [x, w] = span(x0, x1, 160, W);
    const [y, h] = span(y0, y1, 90, H);
    return { x, y, w, h };
  }

  /* ------------------------------------------------------------------
     The essay editor
     ------------------------------------------------------------------ */
  const FORMATS = [['p', 'Normal'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['pre', 'Formatted']];
  let edCount = 0;
  class Editor {
    /* opts: html, words {min, max, hard}, showWords, spellcheck, lines, toolbar ('default'|'basic'|'plain'), readonly,
       label, onInput(editor), onFormat(cmd), onBackup(), getBackups() → [...], restoreBackup(b), onExpand(on) */
    constructor(opts) {
      this.o = opts || {};
      this.id = 'exed' + ++edCount;
      this.mode = this.o.toolbar || 'default';
      this.el = h('div.ex-ed', { 'data-mode': this.mode });
      this.area = h('div.ex-area', { id: this.id, contenteditable: this.o.readonly ? 'false' : 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': this.o.label || 'Your answer', spellcheck: this.o.spellcheck ? 'true' : 'false', lang: 'en-GB' });
      if (this.o.lines) this.area.style.minHeight = (this.o.lines * 1.6 + 1.2) + 'em';
      this.wc = h('span.ex-wc', { 'aria-live': 'polite' });
      this.note = h('span.ex-ednote', { role: 'status' });
      this.foot = h('div.ex-edfoot', this.note, h('span.grow'), this.wc);
      if (this.mode !== 'plain') this._toolbar();
      this.el.append(...[this.tb, this.area, this.foot].filter(Boolean));
      this.setHTML(this.o.html || '', true);
      this._wire();
      this._updateWords(true);
      this.setReadonly(!!this.o.readonly);
      this._states();
    }

    /* ---------- the toolbar ---------- */
    _toolbar() {
      const basic = this.mode === 'basic';
      const tb = (this.tb = h('div.ex-tb', { role: 'toolbar', 'aria-label': 'Formatting (Alt+F10)', 'aria-controls': this.id }));
      this.btns = {};
      const btn = (id, html, title, fn) => {
        const b = h('button.ex-tbb', { type: 'button', title, 'aria-label': title, tabindex: '-1', dataset: { cmd: id }, html });
        b.addEventListener('mousedown', (e) => e.preventDefault()); // (keep the selection in the answer)
        b.addEventListener('click', () => {
          if (this.readonly && !/^(copy|expand)$/.test(id)) return;
          fn();
        });
        this.btns[id] = b;
        tb.appendChild(b);
        return b;
      };
      const sep = () => tb.appendChild(h('span.ex-tbsep', { 'aria-hidden': 'true' }));
      if (!basic) {
        this.fmt = h('select.ex-fmt', { title: 'Paragraph format', 'aria-label': 'Paragraph format', tabindex: '-1' }, FORMATS.map(([v, l]) => h('option', { value: v }, l)));
        this.fmt.addEventListener('change', () => this.command('heading', this.fmt.value));
        tb.appendChild(this.fmt);
        sep();
      }
      btn('bold', '<b>B</b>', 'Bold (Ctrl+B)', () => this.command('bold'));
      btn('italic', '<i>I</i>', 'Italic (Ctrl+I)', () => this.command('italic'));
      btn('underline', '<u>U</u>', 'Underline (Ctrl+U)', () => this.command('underline'));
      if (!basic) {
        btn('subscript', 'x<sub>2</sub>', 'Subscript', () => this.command('subscript'));
        btn('superscript', 'x<sup>2</sup>', 'Superscript', () => this.command('superscript'));
        btn('removeFormat', '<span class="ex-rf">T<sub>×</sub></span>', 'Remove format', () => this.command('removeFormat'));
        sep();
        btn('copy', IC.copy, 'Copy (Ctrl+C)', () => this.command('copy'));
        btn('paste', IC.paste, 'Paste (Ctrl+V)', () => this.command('paste'));
      } else sep();
      btn('undo', IC.undo, 'Undo (Ctrl+Z)', () => this.undo(true));
      btn('redo', IC.redo, 'Redo (Ctrl+Y)', () => this.redo(true));
      if (!basic) btn('backup', IC.backup, 'Backup copies of this answer', () => this.command('backup'));
      sep();
      btn('ol', IC.ol, 'Insert/remove numbered list', () => this.command('ol'));
      btn('ul', IC.ul, 'Insert/remove bulleted list', () => this.command('ul'));
      if (!basic) {
        btn('outdent', IC.outdent, 'Decrease indent', () => this.command('outdent'));
        btn('indent', IC.indent, 'Increase indent', () => this.command('indent'));
        sep();
        btn('special', '<span class="ex-om">Ω</span>', 'Insert special character', () => this.command('special'));
        btn('table', IC.table, 'Table', () => this.command('table'));
        btn('drawing', IC.draw, 'Insert drawing', () => this.command('drawing'));
        btn('formula', '<span class="ex-sig">Σ</span>', 'Edit formula', () => this.command('formula'));
        sep();
        btn('expand', IC.expand, 'Expand (full screen)', () => this.command('expand'));
      }
      // roving focus: one button is in the Tab order; arrows move along; Esc goes back to the answer
      const items = () => Array.from(tb.querySelectorAll('button,select')).filter((x) => !x.disabled);
      const first = items()[0];
      if (first) first.tabIndex = 0;
      tb.addEventListener('keydown', (e) => {
        const list = items();
        const i = list.indexOf(document.activeElement);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          if (document.activeElement.tagName === 'SELECT' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const n = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
          list.forEach((x) => (x.tabIndex = -1));
          n.tabIndex = 0;
          n.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.focus();
        }
      });
    }
    _wire() {
      const A = this.area;
      A.addEventListener('beforeinput', (e) => this._beforeInput(e));
      A.addEventListener('input', (e) => this._input(e));
      A.addEventListener('keydown', (e) => this._keydown(e));
      A.addEventListener('paste', (e) => {
        e.preventDefault();
        if (this.readonly) return;
        const cd = e.clipboardData;
        this.insertPasted(cd ? cd.getData('text/html') : '', cd ? cd.getData('text/plain') : '');
      });
      // (text dragged from one place in the answer to another: the browser moves it, and the word limit is checked)
      A.addEventListener('dragstart', () => (this._dragInside = true));
      A.addEventListener('dragend', () => (this._dragInside = false));
      A.addEventListener('drop', (e) => {
        if (this._dragInside && !this.readonly) return;
        e.preventDefault();
        if (this.readonly) return;
        const dt = e.dataTransfer;
        if (!dt || dt.files && dt.files.length) return this._note('Files and pictures cannot be put into an answer. Use the drawing tool for a diagram.');
        const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (r) {
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        }
        this.insertPasted(dt.getData('text/html'), dt.getData('text/plain'));
      });
      A.addEventListener('dblclick', (e) => {
        const f = e.target.closest && e.target.closest('.ex-formula');
        const d = e.target.closest && e.target.closest('img.ex-drawing');
        if (this.readonly) return;
        if (f && A.contains(f)) this._editFormula(f);
        else if (d && A.contains(d)) this._editDrawing(d);
      });
      A.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest && e.target.closest('td,th');
        if (!cell || !A.contains(cell) || this.readonly) return;
        e.preventDefault();
        this._tableMenu(cell, e);
      });
      A.addEventListener('blur', () => this.o.onBlur && this.o.onBlur(this));
      A.addEventListener('keyup', () => this._keepRange());
      A.addEventListener('mouseup', () => setTimeout(() => this._keepRange(), 0));
      A.addEventListener('focus', () => {
        // (Enter makes a new paragraph, <p>, rather than a <div>)
        try {
          document.execCommand('defaultParagraphSeparator', false, 'p');
        } catch (e) {
          /* (an old browser) */
        }
        // an empty answer starts with a paragraph
        if (!A.firstChild) {
          A.innerHTML = '<p><br></p>';
          this._caretTo(A.firstChild);
        }
      });
      this._onSel = () => {
        const s = window.getSelection();
        if (!s.rangeCount || !A.contains(s.anchorNode)) return;
        this._range = s.getRangeAt(0).cloneRange();
        this._states();
      };
      document.addEventListener('selectionchange', this._onSel);
    }
    destroy() {
      document.removeEventListener('selectionchange', this._onSel);
      clearTimeout(this._t);
    }
    /** the keyboard to the answer, with the cursor where it was before a button or a dialog took the focus. (Where it
        was is kept as it moves: on each change of the selection, and at once as the student types or clicks, since
        the browser tells of a change of the selection a moment later.) */
    focus() {
      this.area.focus();
      this._restoreRange();
    }
    _keepRange() {
      const s = window.getSelection();
      if (s.rangeCount && this.area.contains(s.anchorNode)) this._range = s.getRangeAt(0).cloneRange();
    }
    setReadonly(on) {
      this.readonly = !!on;
      this.area.setAttribute('contenteditable', on ? 'false' : 'true');
      this.area.setAttribute('aria-readonly', on ? 'true' : 'false');
      this.el.classList.toggle('ro', !!on);
      if (this.tb) this.tb.querySelectorAll('button,select').forEach((b) => (b.disabled = on && !/^(copy|expand)$/.test(b.dataset.cmd || '')));
    }
    setSpellcheck(on) {
      this.area.setAttribute('spellcheck', on ? 'true' : 'false');
      // (the browser checks the words again when the text is focused)
      if (document.activeElement === this.area) {
        this.area.blur();
        this.area.focus();
      }
    }
    getHTML() {
      const A = this.area;
      if (!A.textContent.trim() && !A.querySelector('img,.ex-formula,table')) return '';
      return A.innerHTML;
    }
    setHTML(html, initial) {
      this.area.innerHTML = html ? cleanHTML(html) : '';
      this._range = null;
      this.hist = [{ html: this.area.innerHTML, sel: null }];
      this.hi = 0;
      this._good = { html: this.area.innerHTML, sel: null };
      if (!initial) this._changed();
    }
    words() {
      return countWords(plainText(this.area, true));
    }

    /* ---------- history (undo and redo) ---------- */
    _sel() {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      const r = s.getRangeAt(0);
      if (!this.area.contains(r.startContainer)) return null;
      const path = (n) => {
        const p = [];
        while (n && n !== this.area) {
          const par = n.parentNode;
          if (!par) return null;
          p.unshift(Array.prototype.indexOf.call(par.childNodes, n));
          n = par;
        }
        return n === this.area ? p : null;
      };
      return { sp: path(r.startContainer), so: r.startOffset, ep: path(r.endContainer), eo: r.endOffset };
    }
    _setSel(sel) {
      const A = this.area;
      const at = (p) => {
        let n = A;
        for (const i of p || []) {
          if (!n.childNodes[i]) return null;
          n = n.childNodes[i];
        }
        return n;
      };
      const len = (n) => (n.nodeType === 3 ? n.nodeValue.length : n.childNodes.length);
      try {
        const a = sel && at(sel.sp), b = sel && at(sel.ep);
        if (!a || !b) throw new Error('no selection');
        const r = document.createRange();
        r.setStart(a, Math.min(sel.so, len(a)));
        r.setEnd(b, Math.min(sel.eo, len(b)));
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        this._range = r.cloneRange();
      } catch (e) {
        this._caretToEnd();
      }
    }
    _caretToEnd() {
      const r = document.createRange();
      r.selectNodeContents(this.area);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      this._range = r.cloneRange();
    }
    _caretTo(node) {
      const r = document.createRange();
      r.setStart(node, 0);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    _restoreRange() {
      const r = this._range;
      const s = window.getSelection();
      if (r && this.area.contains(r.startContainer) && this.area.contains(r.endContainer)) {
        s.removeAllRanges();
        s.addRange(r);
      } else if (!s.rangeCount || !this.area.contains(s.anchorNode)) this._caretToEnd();
    }
    record() {
      clearTimeout(this._t);
      this._pending = false;
      const html = this.area.innerHTML;
      const cur = this.hist[this.hi];
      if (cur && cur.html === html) {
        cur.sel = this._sel() || cur.sel;
        return;
      }
      this.hist = this.hist.slice(0, this.hi + 1);
      this.hist.push({ html, sel: this._sel() });
      if (this.hist.length > 300) this.hist.shift();
      this.hi = this.hist.length - 1;
    }
    flush() {
      if (this._pending) this.record();
    }
    undo(fromButton) {
      this.flush();
      if (this.hi <= 0) return;
      this.hi--;
      this._apply(this.hist[this.hi]);
      if (fromButton) this._format('undo');
    }
    redo(fromButton) {
      this.flush();
      if (this.hi >= this.hist.length - 1) return;
      this.hi++;
      this._apply(this.hist[this.hi]);
      if (fromButton) this._format('redo');
    }
    _apply(snap) {
      this.area.innerHTML = snap.html;
      this.area.focus();
      if (snap.sel) this._setSel(snap.sel);
      else this._caretToEnd();
      this._good = { html: snap.html, sel: snap.sel };
      this._changed();
    }

    /* ---------- typing ---------- */
    _limit() {
      const w = this.o.words || {};
      return w.hard && w.max ? +w.max : 0;
    }
    _beforeInput(e) {
      if (e.inputType === 'historyUndo') {
        e.preventDefault();
        return this.undo();
      }
      if (e.inputType === 'historyRedo') {
        e.preventDefault();
        return this.redo();
      }
      if (this.readonly) {
        e.preventDefault();
        return;
      }
      const max = this._limit();
      if (max && e.inputType === 'insertText' && /\S/.test(e.data || '') && this.words() >= max && !this._insideWord()) {
        e.preventDefault();
        this._atLimit();
      }
    }
    _insideWord() {
      const s = window.getSelection();
      if (!s.rangeCount) return false;
      const r = s.getRangeAt(0);
      if (!r.collapsed) return false;
      const n = r.startContainer;
      if (n.nodeType === 3 && r.startOffset > 0) return /\S/.test(n.nodeValue[r.startOffset - 1]);
      return false;
    }
    _input(e) {
      const max = this._limit();
      if (max && !(e && e.isComposing) && this.words() > max) {
        // more than the limit (pasting, joining words …): back to how it was
        this.area.innerHTML = this._good.html;
        if (this._good.sel) this._setSel(this._good.sel);
        this._atLimit();
        return;
      }
      this._good = { html: this.area.innerHTML, sel: this._sel() };
      this._keepRange();
      this._pending = true;
      clearTimeout(this._t);
      // a step of its own for undo: a new paragraph, the end of a word, a paste, a change of format; letters typed
      // and deleted are kept together (until a pause)
      const type = (e && e.inputType) || '';
      const typing = type === 'insertText' || type === 'insertCompositionText' || /^delete/.test(type);
      const boundary = !typing || (type === 'insertText' && /\s/.test(e.data || ''));
      if (boundary) this.record();
      else this._t = setTimeout(() => this.record(), 700);
      this._changed();
    }
    _atLimit() {
      this.el.classList.remove('ex-limit-flash');
      void this.el.offsetWidth;
      this.el.classList.add('ex-limit-flash');
      this._note(`You have reached the limit of ${this._limit()} words.`);
    }
    _note(text) {
      this.note.textContent = text;
      clearTimeout(this._nt);
      this._nt = setTimeout(() => (this.note.textContent = ''), 5000);
    }
    _keydown(e) {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.altKey && e.key === 'F10' && this.tb) {
        e.preventDefault();
        const b = this.tb.querySelector('[tabindex="0"]') || this.tb.querySelector('button');
        if (b) b.focus();
        return;
      }
      if (mod && !e.altKey && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        return this.undo();
      }
      if (mod && !e.altKey && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        return this.redo();
      }
      if (this.mode === 'plain' && mod && /^[biu]$/.test(k)) {
        e.preventDefault();
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && /^[biu]$/.test(k)) {
        e.preventDefault();
        if (this.readonly) return;
        return this.command({ b: 'bold', i: 'italic', u: 'underline' }[k]);
      }
      if (e.key === 'Escape' && this.el.closest('.ex-expanded')) {
        e.preventDefault();
        return this.command('expand');
      }
      if (e.key === 'Tab' && !this.readonly) {
        const li = this._closest('LI');
        if (li) {
          e.preventDefault();
          return this.command(e.shiftKey ? 'outdent' : 'indent');
        }
      }
    }
    _closest(tag) {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      let n = s.getRangeAt(0).startContainer;
      while (n && n !== this.area) {
        if (n.nodeType === 1 && (tag instanceof RegExp ? tag.test(n.tagName) : n.tagName === tag)) return n;
        n = n.parentNode;
      }
      return null;
    }
    _states() {
      if (!this.tb) return;
      const st = (c) => {
        try {
          return document.queryCommandState(c);
        } catch (e) {
          return false;
        }
      };
      [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['subscript', 'subscript'], ['superscript', 'superscript'], ['ol', 'insertOrderedList'], ['ul', 'insertUnorderedList']].forEach(([id, c]) => {
        const b = this.btns[id];
        if (b) b.setAttribute('aria-pressed', st(c) ? 'true' : 'false');
      });
      if (this.fmt) {
        const blk = this._closest(/^(P|H1|H2|H3|PRE)$/);
        this.fmt.value = blk ? blk.tagName.toLowerCase() : 'p';
      }
      const s = window.getSelection();
      if (this.btns.copy) this.btns.copy.disabled = !s.rangeCount || s.isCollapsed;
      if (this.btns.undo) this.btns.undo.disabled = this.readonly || (this.hi <= 0 && !this._pending);
      if (this.btns.redo) this.btns.redo.disabled = this.readonly || this.hi >= this.hist.length - 1;
    }
    _changed() {
      this._updateWords();
      this._states();
      if (this.o.onInput) this.o.onInput(this);
    }
    _updateWords(initial) {
      const n = this.words();
      this.count = n;
      const w = this.o.words || {};
      if (this.o.showWords === false) {
        this.wc.textContent = '';
        return;
      }
      this.wc.textContent = w.max ? `Words: ${n}/${w.max}` : `Words: ${n}`;
      this.wc.classList.toggle('over', !!(w.max && n >= w.max));
      this.wc.classList.toggle('under', !!(w.min && n > 0 && n < w.min));
      this.wc.title = w.min && w.max ? `Write between ${w.min} and ${w.max} words.` : w.max ? `At most ${w.max} words.` : w.min ? `At least ${w.min} words.` : '';
      if (!initial) this.wc.setAttribute('aria-label', this.wc.textContent);
    }

    /* ---------- commands ---------- */
    _format(cmd) {
      if (this.o.onFormat) this.o.onFormat(cmd);
    }
    command(cmd, arg) {
      const A = this.area;
      if (this.readonly && !/^(copy|expand)$/.test(cmd)) return;
      if (cmd === 'expand') {
        this._format('expand');
        if (this.o.onExpand) this.o.onExpand();
        return setTimeout(() => this.focus(), 30);
      }
      if (cmd === 'special') return specialDialog((c) => this._insertText(c, 'special'));
      if (cmd === 'table') {
        const cell = this._closest(/^T[DH]$/);
        if (cell) {
          const r = cell.getBoundingClientRect();
          return this._tableMenu(cell, { clientX: r.left, clientY: r.bottom });
        }
        return tableDialog((r, c, head) => this._insertHTML(tableHTML(r, c, head), 'table'));
      }
      if (cmd === 'formula') {
        // a formula that is selected (with the keyboard: Shift and an arrow) is changed; else a new one is put in
        const f = this._selected('.ex-formula');
        if (f) return this._editFormula(f);
        return formulaDialog('', (tex) => this._insertInline(this._formulaHTML(tex) + '&nbsp;', 'formula'));
      }
      if (cmd === 'drawing') {
        const d = this._selected('img.ex-drawing');
        if (d) return this._editDrawing(d);
        return drawingDialog(null, (x) => x && this._insertHTML(this._drawingHTML(x) + '<br>', 'drawing'));
      }
      if (cmd === 'backup') {
        this._format('backup');
        return this.o.onBackups && this.o.onBackups();
      }
      if (cmd === 'paste') return this._pasteButton();
      this.focus();
      this.flush();
      if (cmd === 'copy') {
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        if (!ok) this._note('Use Ctrl+C (⌘+C on a Mac) to copy.');
        return this._format('copy');
      }
      if (cmd === 'heading') {
        document.execCommand('formatBlock', false, `<${arg || 'p'}>`);
        this.record();
        this._changed();
        return this._format('heading');
      }
      if (cmd === 'indent' || cmd === 'outdent') {
        if (this._closest('LI')) document.execCommand(cmd);
        else this._indentBlocks(cmd === 'indent' ? 1 : -1);
        this.record();
        this._changed();
        return this._format(cmd);
      }
      const native = { bold: 'bold', italic: 'italic', underline: 'underline', subscript: 'subscript', superscript: 'superscript', removeFormat: 'removeFormat', ol: 'insertOrderedList', ul: 'insertUnorderedList' }[cmd];
      if (native) {
        if (cmd === 'subscript' && document.queryCommandState('superscript')) document.execCommand('superscript');
        if (cmd === 'superscript' && document.queryCommandState('subscript')) document.execCommand('subscript');
        document.execCommand(native);
        if (cmd === 'removeFormat') this._removeScripts();
        this.record();
        this._good = { html: A.innerHTML, sel: this._sel() };
        this._changed();
        this._format(cmd);
      }
    }
    /** the formula or drawing (sel) that the selection is on, or holds */
    _selected(sel) {
      const s = window.getSelection();
      if (!s.rangeCount || !this.area.contains(s.anchorNode)) return null;
      const r = s.getRangeAt(0);
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      const inside = n && n.closest && n.closest(sel);
      if (inside && this.area.contains(inside)) return inside;
      if (r.collapsed) return null;
      return Array.from(this.area.querySelectorAll(sel)).find((x) => r.intersectsNode(x)) || null;
    }
    _removeScripts() {
      // (some browsers leave <sub> and <sup> after "remove format")
      const s = window.getSelection();
      if (!s.rangeCount) return;
      const r = s.getRangeAt(0);
      this.area.querySelectorAll('sub,sup').forEach((el) => {
        if (r.intersectsNode(el)) el.replaceWith(...Array.from(el.childNodes));
      });
    }
    _indentBlocks(d, again) {
      const s = window.getSelection();
      if (!s.rangeCount) return;
      const r = s.getRangeAt(0);
      const blocks = Array.from(this.area.querySelectorAll('p,h1,h2,h3,pre')).filter((b) => r.intersectsNode(b));
      if (!blocks.length) {
        // text straight inside the answer: into a paragraph first
        if (again) return;
        document.execCommand('formatBlock', false, '<p>');
        return this._indentBlocks(d, true);
      }
      blocks.forEach((b) => {
        const n = Math.max(0, Math.min(8, (+b.getAttribute('data-indent') || 0) + d));
        if (n) b.setAttribute('data-indent', n);
        else b.removeAttribute('data-indent');
      });
    }
    _insertText(text, cmd) {
      this.focus();
      this.flush();
      document.execCommand('insertText', false, text);
      this.record();
      this._changed();
      if (cmd) this._format(cmd);
    }
    _insertHTML(html, cmd) {
      this.focus();
      this.flush();
      const max = this._limit();
      if (max && this.words() + wordsOfHTML(html) > max) return this._atLimit();
      document.execCommand('insertHTML', false, html);
      this.record();
      this._good = { html: this.area.innerHTML, sel: this._sel() };
      this._changed();
      if (cmd) this._format(cmd);
    }
    /** inline content (a formula) put in where the cursor is, by hand: the browser's insertHTML moves a block that
        cannot be typed into out of its paragraph */
    _insertInline(html, cmd) {
      this.focus();
      this.flush();
      const max = this._limit();
      if (max && this.words() + wordsOfHTML(html) > max) return this._atLimit();
      const s = window.getSelection();
      if (!s.rangeCount || !this.area.contains(s.anchorNode)) this._caretToEnd();
      const r = s.getRangeAt(0);
      r.deleteContents();
      // (into the paragraph the cursor is in, rather than straight into the answer)
      if (r.startContainer === this.area) {
        const p = document.createElement('p');
        r.insertNode(p);
        r.selectNodeContents(p);
      }
      const t = document.createElement('template');
      t.innerHTML = html;
      const last = t.content.lastChild;
      r.insertNode(t.content);
      const after = document.createRange();
      after.setStartAfter(last);
      after.collapse(true);
      s.removeAllRanges();
      s.addRange(after);
      this._range = after.cloneRange();
      this.record();
      this._good = { html: this.area.innerHTML, sel: this._sel() };
      this._changed();
      if (cmd) this._format(cmd);
    }
    _formulaHTML(tex) {
      const s = document.createElement('span');
      s.className = 'ex-formula';
      s.setAttribute('contenteditable', 'false');
      s.setAttribute('data-tex', tex);
      s.setAttribute('title', 'A formula (double-click to change it)');
      s.innerHTML = TeX.html(tex);
      return s.outerHTML;
    }
    _editFormula(el) {
      formulaDialog(el.getAttribute('data-tex') || '', (tex) => {
        this.flush();
        const tmp = document.createElement('div');
        tmp.innerHTML = this._formulaHTML(tex);
        el.replaceWith(tmp.firstChild);
        this.record();
        this._changed();
        this._format('formula');
      });
    }
    _drawingHTML(d) {
      const im = document.createElement('img');
      im.className = 'ex-drawing';
      im.src = d.png;
      im.width = d.w;
      im.height = d.h;
      im.alt = 'A drawing';
      im.title = 'A drawing (double-click to change it)';
      // (the shapes, so that the drawing can be changed later; encoded: no < > " in the attribute)
      im.setAttribute('data-drawing', encodeURIComponent(JSON.stringify(d.data)));
      return im.outerHTML;
    }
    _editDrawing(img) {
      let data = null;
      try {
        const v = img.getAttribute('data-drawing') || '';
        data = v ? JSON.parse(/^%7B/i.test(v) ? decodeURIComponent(v) : v) : null;
      } catch (e) {
        data = null;
      }
      drawingDialog(data, (d) => {
        this.flush();
        if (!d) img.remove();
        else {
          const tmp = document.createElement('div');
          tmp.innerHTML = this._drawingHTML(d);
          img.replaceWith(tmp.firstChild);
        }
        this.record();
        this._changed();
        this._format('drawing');
      });
    }
    async _pasteButton() {
      this.focus();
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          for (const it of items) {
            if (it.types.includes('text/html')) return this.insertPasted(await (await it.getType('text/html')).text(), '');
            if (it.types.includes('text/plain')) return this.insertPasted('', await (await it.getType('text/plain')).text());
          }
        }
        if (navigator.clipboard && navigator.clipboard.readText) return this.insertPasted('', await navigator.clipboard.readText());
        throw new Error('no clipboard');
      } catch (e) {
        this._note('Your browser does not let the page read the clipboard: use Ctrl+V (⌘+V on a Mac) to paste.');
      }
    }
    insertPasted(html, text) {
      if (this.readonly) return;
      if (!html && !text) return this._note('Only text can be pasted into an answer. Use the drawing tool for a diagram.');
      this.focus();
      this.flush();
      let frag = this.mode !== 'plain' && html ? cleanHTML(html, { foreign: true }) : textToHTML(text);
      // one paragraph pasted into a paragraph: its text only, not a new paragraph
      const tmp = document.createElement('div');
      tmp.innerHTML = frag;
      if (tmp.children.length === 1 && tmp.firstElementChild.tagName === 'P') frag = tmp.firstElementChild.innerHTML;
      if (this.mode === 'plain') frag = esc(text || tmp.textContent).replace(/\n/g, '<br>');
      const max = this._limit();
      if (max) {
        const avail = max - this.words();
        const plain = text || plainText(tmp);
        if (wordsOfHTML(frag) > avail) {
          if (avail <= 0) return this._atLimit();
          frag = esc(firstWords(plain.replace(/\s+/g, ' '), avail));
          this._note(`Only the first ${avail} words were pasted: the limit is ${max} words.`);
        }
      }
      if (!frag) return;
      document.execCommand('insertHTML', false, frag);
      this.record();
      this._good = { html: this.area.innerHTML, sel: this._sel() };
      this._changed();
      this._format('paste');
    }

    /* ---------- tables ---------- */
    _tableMenu(cell, ev) {
      const table = cell.closest('table');
      const row = cell.parentNode;
      const col = Array.prototype.indexOf.call(row.children, cell);
      const op = (fn) => () => {
        this.flush();
        fn();
        this.record();
        this._changed();
        this._format('table');
      };
      const newCell = (tag) => {
        const c = document.createElement(tag);
        c.innerHTML = '<br>';
        return c;
      };
      const rowsOf = () => Array.from(table.querySelectorAll('tr'));
      const items = [
        ['plus', 'Insert a row above', op(() => {
          const r = document.createElement('tr');
          Array.from(row.children).forEach(() => r.appendChild(newCell(row.parentNode.tagName === 'THEAD' ? 'th' : 'td')));
          row.before(r);
        })],
        ['plus', 'Insert a row below', op(() => {
          const r = document.createElement('tr');
          Array.from(row.children).forEach(() => r.appendChild(newCell('td')));
          if (row.parentNode.tagName === 'THEAD') {
            let tb = table.querySelector('tbody');
            if (!tb) table.appendChild((tb = document.createElement('tbody')));
            tb.prepend(r);
          } else row.after(r);
        })],
        ['plus', 'Insert a column before', op(() => rowsOf().forEach((r) => r.children[col] && r.children[col].before(newCell(r.parentNode.tagName === 'THEAD' ? 'th' : 'td'))))],
        ['plus', 'Insert a column after', op(() => rowsOf().forEach((r) => (r.children[col] ? r.children[col].after(newCell(r.parentNode.tagName === 'THEAD' ? 'th' : 'td')) : r.appendChild(newCell('td')))))],
        ['minus', 'Delete the row', op(() => (rowsOf().length > 1 ? row.remove() : table.remove()))],
        ['minus', 'Delete the column', op(() => (row.children.length > 1 ? rowsOf().forEach((r) => r.children[col] && r.children[col].remove()) : table.remove()))],
        ['trash', 'Delete the table', op(() => table.remove())]
      ];
      const anchor = h('span', { style: { position: 'fixed', left: (ev.clientX || 0) + 'px', top: (ev.clientY || 0) + 'px', width: '1px', height: '1px' } });
      document.body.appendChild(anchor);
      MG.popmenu(anchor, items);
      setTimeout(() => anchor.remove(), 0);
    }
  }

  /* ------------------------------------------------------------------
     The app
     ------------------------------------------------------------------ */
  const CONTRASTS = [['default', 'Default'], ['inverted', 'Inverted'], ['yellow', 'Yellow on black'], ['cream', 'Black on cream'], ['blue', 'Black on light blue']];
  const SIZES = [['regular', 'Regular'], ['large', 'Large'], ['xlarge', 'Extra large']];
  const TYPES = { essay: 'Essay', short: 'Short answer', numeric: 'Numerical answer', mcq: 'Multiple choice', info: 'Information' };

  class ExamApp {
    constructor(root, opts = {}) {
      this.root = root;
      this.fs = opts.fs || MG.app.fs;
      this.skew = 0; // (the tests move the clock on with this)
      this.prefs = Object.assign({ size: 'regular', contrast: 'default', hideTime: false, candidate: '', name: '' }, store.get(STORE_KEY, {}) || {});
      root.classList.add('ex-app');
      root.innerHTML = '';
      this.view = h('div.ex-view');
      root.appendChild(this.view);
      this.papers = [];
      this._wordsEv = MG.debounce((q, n) => this.att && bus.emit('exam:words', { paper: this.att.paper.id, q, words: n }), 800);
      window.addEventListener('pagehide', () => this._saveNow(true));
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this._saveNow(true));
      this.ready = this._init();
    }
    now() {
      return Date.now() + this.skew;
    }
    _savePrefs() {
      store.set(STORE_KEY, this.prefs);
    }
    async _init() {
      await this._loadIndex();
      const open = this.prefs.open;
      if (open && this.fs.exists(open)) {
        try {
          const att = await this._read(open);
          if (att && !att.submitted) return this.play(att, open, { resume: true });
        } catch (e) {
          /* (a damaged file: the start page) */
        }
      }
      this.home();
    }
    /** the tab is shown again (page.js) */
    shown() {
      if (this.ed) this.ed._updateWords();
      if (this.timerEl) this._tickNow();
    }

    /* ---------------- papers and attempts ---------------- */
    async _loadIndex() {
      try {
        const r = await fetch((CFG.examBase || 'exams/') + 'index.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.papers = (await r.json()).papers || [];
      } catch (e) {
        this.papers = [];
        this._indexError = e.message || String(e);
      }
    }
    async _paper(id) {
      this._cache = this._cache || {};
      if (this._cache[id]) return JSON.parse(JSON.stringify(this._cache[id]));
      const p = this.papers.find((x) => x.id === id);
      const file = p ? p.file : id + '.json';
      const r = await fetch((CFG.examBase || 'exams/') + file, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`There is no paper called “${id}” (HTTP ${r.status}).`);
      const paper = await r.json();
      if (!paper || !Array.isArray(paper.questions)) throw new Error(`The paper “${id}” has no questions.`);
      paper.id = paper.id || id;
      this._cache[id] = paper;
      return JSON.parse(JSON.stringify(paper));
    }
    _attemptFiles() {
      const dir = ESSAYS();
      if (!this.fs.isDir(dir)) return [];
      return this.fs.list(dir).filter((x) => x.entry.kind !== 'dir' && /\.exam\.json$/.test(x.name)).map((x) => x.path);
    }
    async _read(path) {
      const t = await this.fs.readText(path);
      const a = JSON.parse(t);
      if (!a || !a.paper || !Array.isArray(a.paper.questions)) throw new Error('This is not an attempt of exam practice.');
      a.answers = a.answers || {};
      a.backups = a.backups || {};
      a.settings = a.settings || {};
      return a;
    }
    async _attempts() {
      const out = [];
      for (const p of this._attemptFiles()) {
        try {
          out.push({ path: p, att: await this._read(p) });
        } catch (e) {
          out.push({ path: p, att: null, error: e.message });
        }
      }
      out.sort((a, b) => String((b.att && b.att.started) || '').localeCompare(String((a.att && a.att.started) || '')));
      return out;
    }
    _newPath(paperId) {
      const dir = ESSAYS();
      this.fs.mkdirp(dir);
      let n = 1;
      while (this.fs.exists(`${dir}/${paperId}-${n}.exam.json`)) n++;
      return `${dir}/${paperId}-${n}.exam.json`;
    }
    _write(quiet) {
      if (!this.att || !this.path) return;
      try {
        this.att.saved = new Date(this.now()).toISOString();
        this.fs.mkdirp(ESSAYS());
        this.fs.writeText(this.path, JSON.stringify(this.att, null, 1));
        this._dirty = false;
        this._status('saved');
        if (!quiet) bus.emit('exam:saved', { path: this.path });
      } catch (e) {
        console.error(e);
        this._status('error');
      }
    }
    _saveNow(flush) {
      if (!this.att || !this.path) return;
      this._collect();
      if (this._dirty) this._write();
      if (flush && MG.project && MG.project.flush) MG.project.flush();
    }
    _status(s) {
      const el = this.statusEl;
      if (!el) return;
      const when = this.att && this.att.saved ? new Date(this.att.saved) : null;
      if (s === 'saving') el.innerHTML = IC.saving + '<span>Saving…</span>';
      else if (s === 'error') el.innerHTML = IC.notSaved + '<span>Not saved</span>';
      else el.innerHTML = IC.saved + '<span>Saved</span>';
      el.className = 'ex-status ' + (s || 'saved');
      el.title = s === 'error' ? 'Your answer could not be saved: the browser may be out of space. Download your answers.' : when ? `Saved in this browser at ${fmtClock(when)}:${pad2(when.getSeconds())}` : 'Saved in this browser';
    }

    /* ---------------- the start view ---------------- */
    _clear() {
      clearInterval(this._tick);
      clearInterval(this._auto);
      clearTimeout(this._quick);
      clearTimeout(this._navT);
      if (this.ed) this.ed.destroy();
      this.ed = null;
      this.att = null;
      this.path = null;
      this.qcur = null;
      this.page = null;
      this.player = null;
      this.statusEl = null;
      this.timerEl = null;
      this.root.classList.remove('ex-expanded');
      document.querySelectorAll('.ex-menu').forEach((x) => x.remove());
      this.view.innerHTML = '';
      this.view.className = 'ex-view';
      return (this._tok = (this._tok || 0) + 1);
    }
    async home() {
      this._saveNow();
      const tok = this._clear();
      this.prefs.open = null;
      this._savePrefs();
      const V = this.view;
      V.classList.add('ex-home');
      const num = h('input', { type: 'text', value: this.prefs.candidate || '', maxlength: 20, autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. 1234A' });
      const name = h('input', { type: 'text', value: this.prefs.name || '', maxlength: 60, autocomplete: 'off', placeholder: 'optional' });
      const keep = () => {
        this.prefs.candidate = num.value.trim();
        this.prefs.name = name.value.trim();
        this._savePrefs();
      };
      num.addEventListener('input', keep);
      name.addEventListener('input', keep);
      V.append(
        h('header.ex-hhead', h('h2', 'Exam practice'), h('p', 'Write answers as you will in an online exam: one question at a time, with a word count, a timer, a calculator and a page to check your answers before you submit them. Everything is saved as you type, in this browser.')),
        h('div.ex-cand', h('label', h('span', 'Candidate number'), num), h('label', h('span', 'Name'), name), h('p.hint', 'They appear at the top of the exam and on your downloads. In a real exam you would use your candidate number.'))
      );
      const attempts = await this._attempts();
      // (the papers themselves, for the number of questions – information pages are not questions – and the marks)
      await Promise.all(this.papers.map((p) => this._paper(p.id).then((x) => (p.full = x), () => null)));
      if (tok !== this._tok) return;
      const inProg = (id) => attempts.find((a) => a.att && a.att.paper.id === id && !a.att.submitted);
      // the papers
      const list = h('div.ex-papers');
      if (!this.papers.length) list.appendChild(h('p.muted', this._indexError ? `The list of papers could not be loaded (${this._indexError}).` : 'There are no papers yet.'));
      this.papers.forEach((p) => {
        const going = inProg(p.id);
        const b = h('button.btn' + (going ? '' : '.primary'), { type: 'button', 'aria-label': `${going ? 'Continue' : 'Start'}: ${p.title}` }, going ? 'Continue' : 'Start');
        b.addEventListener('click', () => this.openPaper(p.id));
        const qs = p.full ? p.full.questions.filter((q) => q.type !== 'info') : null;
        const nq = qs ? qs.length : p.questions || 0;
        const marks = qs ? qs.reduce((s, q) => s + (+q.marks || 0), 0) : 0;
        const meta = [p.minutes ? `${p.minutes} minutes` : 'No time limit', plural(nq, 'question'), marks ? plural(marks, 'mark') : ''].filter(Boolean).join(' · ');
        list.appendChild(h('div.ex-card', { dataset: { paper: p.id } }, h('h4', p.title), p.description ? h('p', p.description) : null, h('p.ex-cmeta', meta), h('div.ex-cact', b, going ? h('span.ex-pill', 'In progress') : null)));
      });
      const free = h('button.btn', { type: 'button' }, 'Write an essay…');
      free.addEventListener('click', () => this.newEssay());
      V.append(h('h3', 'Practice papers'), list, h('h3', 'An essay of your own'), h('p.ex-sub2', 'Give it a title, and if you like a word limit and a time limit: for a weekly essay, or to practise writing to time.'), free);
      // the attempts
      V.appendChild(h('h3', 'My attempts'));
      if (!attempts.length) V.appendChild(h('p.muted', 'None yet. Your attempts are kept in Files, in the folder essays.'));
      else {
        const tb = h('tbody');
        attempts.forEach(({ path, att, error }) => {
          if (!att) {
            tb.appendChild(h('tr', h('td', { colspan: 4 }, `${this.fs.pretty(path)}: ${error}`)));
            return;
          }
          const answered = this._answeredCount(att), total = this._questions(att).filter((q) => q.type !== 'info').length;
          const status = att.submitted ? `Submitted ${fmtWhen(att.submitted)}` : att.timeUp ? 'Time is up – not submitted' : 'In progress';
          const acts = h('td.ex-acts');
          const add = (label, fn, cls) => {
            const b = h('button.btn.small' + (cls || ''), { type: 'button' }, label);
            b.addEventListener('click', fn);
            acts.appendChild(b);
          };
          if (!att.submitted) add('Continue', () => this.openFile(path), '.primary');
          else add('Review', () => this.review(att, path));
          add('Download', (e) => this._downloadMenu(e.currentTarget, att));
          add('Delete', () => this._delete(path, att));
          tb.appendChild(h('tr', h('td', h('b', att.paper.title), h('div.ex-small', fmtWhen(att.started))), h('td', status), h('td', `${answered} of ${total} answered`), acts));
        });
        V.appendChild(h('div.ex-tablewrap', h('table.ex-list', h('thead', h('tr', h('th', 'Paper'), h('th', 'Status'), h('th', 'Answers'), h('th', h('span.sr-only', 'Actions')))), tb)));
      }
      V.appendChild(h('p.hint', 'Exam practice copies the way an online exam system works, so that you can get used to it. It is not the real system, and nothing is sent to your examiners: download your answers if you need to hand them in.'));
    }
    async _delete(path, att) {
      if (!(await MG.confirmBox('Delete this attempt?', `<p>Delete your attempt at <b>${esc(att.paper.title)}</b> (${esc(fmtWhen(att.started))})? Its answers will be lost.</p>`, 'Delete', { danger: true }))) return;
      this.fs.remove(path);
      this.home();
    }

    /** a paper's first page */
    async openPaper(id) {
      let paper;
      try {
        paper = await this._paper(id);
      } catch (e) {
        toast(esc(e.message), 'error');
        throw e;
      }
      this._saveNow();
      const tok = this._clear();
      this.prefs.open = null;
      this._savePrefs();
      const attempts = await this._attempts();
      if (tok !== this._tok) return;
      const going = attempts.find((a) => a.att && a.att.paper.id === paper.id && !a.att.submitted);
      bus.emit('exam:open', { paper: paper.id, title: paper.title });
      this._startPage(paper, going);
    }
    _startPage(paper, going) {
      const V = this.view;
      V.classList.add('ex-startpage');
      const qs = paper.questions.filter((q) => q.type !== 'info');
      const marks = qs.reduce((s, q) => s + (+q.marks || 0), 0);
      const dl = h('dl.ex-facts',
        h('dt', 'Time allowed'), h('dd', paper.minutes ? `${paper.minutes} minutes` : 'No time limit'),
        h('dt', 'Questions'), h('dd', String(qs.length)),
        marks ? [h('dt', 'Marks'), h('dd', String(marks))] : null,
        h('dt', 'Spelling checker'), h('dd', paper.spellcheck ? 'On (you can switch it off)' : 'Off (you can switch it on)'));
      const back = h('button.btn', { type: 'button', html: IC.back + '<span>All papers</span>' });
      back.addEventListener('click', () => this.home());
      const acts = h('div.ex-startacts');
      if (going) {
        const c = h('button.btn.primary', { type: 'button' }, 'Continue');
        c.addEventListener('click', () => this.openFile(going.path));
        const again = h('button.btn', { type: 'button' }, 'Start again (a new attempt)');
        again.addEventListener('click', () => this._start(paper));
        const nq = this._questions(going.att).filter((q) => q.type !== 'info').length;
        acts.append(h('p', `You have an attempt in progress, started ${fmtWhen(going.att.started)}: ${this._answeredCount(going.att)} of ${nq} ${nq === 1 ? 'question' : 'questions'} answered.`), c, again);
      } else {
        const s = h('button.btn.primary', { type: 'button' }, 'Start');
        s.addEventListener('click', () => this._start(paper));
        acts.append(s);
      }
      const ins = h('div.ex-instr');
      ins.innerHTML = paper.instructions ? cleanTrusted(paper.instructions) : '';
      V.append(h('div.ex-startcard', h('p.ex-kicker', 'Exam practice'), h('h2', paper.title), paper.description ? h('p', paper.description) : null, dl, ins, paper.minutes ? h('p.hint', `The time starts when you press Start, and keeps running if you leave the page. ${paper.autoSubmit ? 'Your answers are submitted when the time is up.' : 'When the time is up your answers are locked, and you submit them.'}`) : null, acts, h('div.ex-startback', back)));
    }
    _start(paper) {
      const now = this.now();
      const path = this._newPath(paper.id);
      const att = {
        format: 'bms-exam-attempt-1',
        paper,
        candidate: { number: this.prefs.candidate || '', name: this.prefs.name || '' },
        started: new Date(now).toISOString(),
        deadline: paper.minutes ? new Date(now + paper.minutes * 60000).toISOString() : null,
        submitted: null,
        timeUp: false,
        current: 0,
        answers: {},
        backups: {},
        settings: { spellcheck: paper.spellcheck != null ? !!paper.spellcheck : !!CFG.spellcheckDefault }
      };
      this.path = path;
      this.att = att;
      this._write();
      bus.emit('exam:start', { paper: paper.id });
      this.play(att, path);
    }
    /** free writing: an essay with a title of the student's own */
    newEssay() {
      const title = h('input', { type: 'text', required: true, maxlength: 200, placeholder: 'e.g. How do cells keep their volume constant?' });
      const words = h('input', { type: 'number', min: 50, max: 10000, step: 50, placeholder: 'none' });
      const hard = h('input', { type: 'checkbox' });
      const mins = h('input', { type: 'number', min: 5, max: 600, step: 5, placeholder: 'none' });
      const spell = h('input', { type: 'checkbox', checked: !!CFG.spellcheckDefault });
      const ok = h('button.btn.primary', { type: 'submit' }, 'Start writing');
      const cancel = h('button.btn', { type: 'button' }, 'Cancel');
      const form = h('form.ex-form',
        h('label.wide', h('span', 'Title (the question you are answering)'), title),
        h('label', h('span', 'Word limit'), words), h('label.check', hard, ' Stop me at the limit'),
        h('label', h('span', 'Time limit (minutes)'), mins), h('label.check', spell, ' Spelling checker on'),
        h('div.prompt-actions', cancel, ok));
      const m = dialog('An essay of your own', form);
      cancel.addEventListener('click', () => m.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = title.value.trim();
        if (!t) return title.focus();
        m.close();
        const max = +words.value || null;
        const paper = {
          id: 'essay-' + slug(t), title: t, kind: 'free', minutes: +mins.value || null, autoSubmit: false, spellcheck: spell.checked, showWordCount: true,
          questions: [{ id: 'essay', type: 'essay', title: t, text: '', lines: 18, words: max ? { max, hard: hard.checked } : null }]
        };
        this._saveNow();
        bus.emit('exam:open', { paper: paper.id, title: t });
        this._clear();
        this._start(paper);
      });
      setTimeout(() => title.focus(), 30);
    }
    /** an attempt kept in the files */
    async openFile(path) {
      const p = this.fs.resolve(path);
      let att;
      try {
        att = await this._read(p);
      } catch (e) {
        toast(`${esc(this.fs.pretty(p))} could not be opened: ${esc(e.message)}`, 'error');
        return;
      }
      this._saveNow();
      bus.emit('exam:open', { paper: att.paper.id, title: att.paper.title });
      if (att.submitted) return this.receipt(att, p);
      return this.play(att, p, { resume: true });
    }

    /* ---------------- the player ---------------- */
    _questions(att) {
      return (att || this.att).paper.questions;
    }
    _attempted(q, att) {
      const a = (att || this.att).answers[q.id] || {};
      if (q.type === 'essay' || q.type === 'short') return !!(a.words || (a.html && a.html.replace(/<[^>]*>/g, '').trim()) || (a.html && /<img|ex-formula|<table/.test(a.html)));
      if (q.type === 'numeric') return a.value != null && String(a.value).trim() !== '';
      if (q.type === 'mcq') return a.choice != null;
      return false;
    }
    _answeredCount(att) {
      return this._questions(att).filter((q) => q.type !== 'info' && this._attempted(q, att)).length;
    }
    play(att, path, opts = {}) {
      if (!att.paper.questions.length) {
        toast('This paper has no questions.', 'error');
        return this.home();
      }
      this._clear();
      this.att = att;
      this.path = path;
      this.prefs.open = path;
      this._savePrefs();
      const V = this.view;
      V.classList.add('ex-playview');
      const P = (this.player = h('div.ex-player'));
      this._applyPrefs();
      // top bar
      const c = att.candidate || {};
      const who = [c.number, c.name].filter(Boolean).join(' ') || this.prefs.candidate || 'Candidate';
      this.timerEl = h('div.ex-timer', { role: 'timer', 'aria-live': 'off' });
      this.statusEl = h('span.ex-status');
      const menuBtn = h('button.ex-menubtn', { type: 'button', title: 'Options', 'aria-label': 'Options', 'aria-haspopup': 'true', html: IC.menu });
      menuBtn.addEventListener('click', () => this._options(menuBtn));
      // (the resources – the calculator, slides, links – are in the top bar, as buttons)
      this.res = h('div.ex-res', { role: 'toolbar', 'aria-label': 'Resources' });
      P.appendChild(h('div.ex-ptop', h('div.ex-who', h('b.ex-cname', who), this.timerEl), h('span.ex-ptitle', att.paper.title), h('div.ex-ptools', this.res, this.statusEl, menuBtn)));
      // the question (or submission page)
      this.main = h('div.ex-pmain', { tabindex: '-1', role: 'region', 'aria-label': 'Question' });
      const prev = h('button.ex-fab.prev', { type: 'button', title: 'Previous', 'aria-label': 'Previous question', html: IC.prev });
      const next = h('button.ex-fab.next', { type: 'button', title: 'Next', 'aria-label': 'Next question', html: IC.next });
      prev.addEventListener('click', () => this._step(-1));
      next.addEventListener('click', () => this._step(1));
      this.fabPrev = prev;
      this.fabNext = next;
      // (Previous and Next are in the bar along the bottom, by the tiles: never over the answer and its word count)
      this.fabs = h('div.ex-fabs', { role: 'group', 'aria-label': 'Previous and next' }, prev, next);
      P.appendChild(h('div.ex-pbody', this.main));
      // navigation
      this.nav = h('nav.ex-nav', { 'aria-label': 'Questions' });
      P.appendChild(this.nav);
      V.appendChild(P);
      this._renderResources();
      this._status('saved');
      // the clock and autosave
      this._tickNow();
      this._tick = setInterval(() => this._tickNow(), 1000);
      this._auto = setInterval(() => this._saveNow(), Math.max(2, +CFG.autosaveSeconds || 5) * 1000);
      if (att.timeUp || this._timeLeft() === 0) return this._timeUp(att.timeUp);
      const qi = Math.min(Math.max(0, att.current || 0), this._questions().length - 1);
      if (att.current === 'submission') this.submissionPage();
      else this.go(qi, { silent: opts.resume });
    }
    _applyPrefs() {
      const P = this.player;
      if (!P) return;
      P.dataset.size = this.prefs.size;
      P.dataset.contrast = this.prefs.contrast;
      P.classList.toggle('ex-notime', !!this.prefs.hideTime);
    }
    _timeLeft() {
      if (!this.att || !this.att.deadline) return null;
      return Math.max(0, Date.parse(this.att.deadline) - this.now());
    }
    _tickNow() {
      const el = this.timerEl;
      if (!el || !this.att) return;
      const left = this._timeLeft();
      if (this.att.submitted) {
        el.textContent = 'Submitted';
        return;
      }
      if (left == null) {
        el.textContent = 'No time limit';
        el.className = 'ex-timer';
        return;
      }
      el.textContent = this.prefs.hideTime ? 'Time hidden' : fmtRemaining(left);
      el.className = 'ex-timer' + (left <= 60000 ? ' last' : left <= 5 * 60000 ? ' soon' : '');
      // (a screen reader hears the time at the half hours, at 5 minutes and in the last minute)
      const mins = Math.ceil(left / 60000);
      el.setAttribute('aria-live', (mins % 30 === 0 && left % 60000 > 59000) || mins === 5 || left <= 60000 ? 'polite' : 'off');
      if (left === 0 && !this.att.timeUp) this._timeUp();
    }
    _timeUp(already) {
      const att = this.att;
      this._collect();
      att.timeUp = true;
      this._lock(true);
      if (!already) bus.emit('exam:timeup', { paper: att.paper.id });
      // (the student may be in another tab, looking at a slide: say so there)
      if (!already && !this.root.offsetParent) toast(`<b>Exam practice:</b> the time for “${esc(att.paper.title)}” is up.${att.paper.autoSubmit ? ' Your answers have been submitted.' : ''}`, 'warn', 9000);
      this._write();
      if (att.paper.autoSubmit && !att.submitted) return this._submit(true);
      this.submissionPage();
    }
    _lock(on) {
      if (this.ed) this.ed.setReadonly(on);
      if (this.main) this.main.querySelectorAll('input,select,textarea').forEach((x) => (x.disabled = on));
    }
    _locked() {
      return !!(this.att && (this.att.timeUp || this.att.submitted));
    }
    /** what is on the page into the attempt */
    _collect() {
      const att = this.att;
      if (!att || !this.qcur) return;
      const q = this.qcur;
      const a = (att.answers[q.id] = att.answers[q.id] || {});
      if (this.ed && (q.type === 'essay' || q.type === 'short')) {
        const html = this.ed.getHTML();
        if (html !== (a.html || '')) {
          a.html = html;
          a.words = this.ed.words();
          a.updated = new Date(this.now()).toISOString();
          this._dirty = true;
        }
        this._maybeBackup(q, a);
      }
    }
    _maybeBackup(q, a, force) {
      const list = (this.att.backups[q.id] = this.att.backups[q.id] || []);
      const last = list[list.length - 1];
      const now = this.now();
      if (!a.html) return;
      if (!force && last && (last.html === a.html || now - Date.parse(last.time) < 5 * 60000)) return;
      if (last && last.html === a.html) return;
      list.push({ time: new Date(now).toISOString(), html: a.html, words: a.words || 0 });
      while (list.length > 12) list.shift();
      this._dirty = true;
    }
    go(i, opts = {}) {
      this._collect();
      if (this._dirty) this._write();
      const qs = this._questions();
      i = Math.max(0, Math.min(qs.length - 1, i));
      this.att.current = i;
      this.page = 'question';
      if (this.ed) this.ed.destroy();
      this.ed = null;
      this.root.classList.remove('ex-expanded');
      const q = (this.qcur = qs[i]);
      const M = this.main;
      M.innerHTML = '';
      M.className = 'ex-pmain';
      const num = this._numberOf(i);
      const a = this.att.answers[q.id] || {};
      const flagged = !!a.flag;
      const head = h('div.ex-qhead', h('span.ex-qn', q.type === 'info' ? 'i' : String(num)), h('h2.ex-qt', q.title || (q.type === 'info' ? 'Information' : 'Question ' + num)));
      if (q.type !== 'info') {
        const fb = h('button.ex-flag', { type: 'button', 'aria-pressed': flagged ? 'true' : 'false', title: flagged ? 'Unflag this question' : 'Flag this question', 'aria-label': flagged ? 'Unflag this question' : 'Flag this question', html: flagged ? IC.flagOn : IC.flag });
        fb.addEventListener('click', () => this._flag(q, fb));
        head.append(h('span.grow'), fb);
      }
      const text = h('div.ex-qtext');
      text.innerHTML = cleanTrusted(q.text || '');
      const box = h('div.ex-q' + (q.split ? '.split' : ''), head);
      const answer = h('div.ex-answer');
      if (q.type === 'info') box.appendChild(text);
      else {
        if (q.split) {
          const left = h('div.ex-left', text), right = h('div.ex-right', answer);
          const div = h('div.ex-divider', { role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to change the widths', tabindex: '0' });
          this._splitter(div, box);
          box.appendChild(h('div.ex-splitwrap', left, div, right));
        } else {
          if (q.text) box.appendChild(text);
          box.appendChild(answer);
        }
        const help = h('button.ex-helplink', { type: 'button', html: IC.help + '<span>Help</span>' });
        help.addEventListener('click', () => this.keyboardHelp());
        answer.appendChild(h('div.ex-explain', h('b', q.type === 'mcq' ? 'Select one alternative' : q.type === 'numeric' ? 'Type your answer as a number' : 'Write your answer here'), h('span.grow'), q.type === 'essay' || q.type === 'short' ? help : null));
        this._answerBox(q, a, answer);
        if (q.marks) answer.appendChild(h('p.ex-marks', `Maximum marks: ${q.marks}`));
        if (q.words && (q.words.min || q.words.max) && (q.type === 'essay' || q.type === 'short')) answer.appendChild(h('p.ex-wlimit', q.words.min && q.words.max ? `Write between ${q.words.min} and ${q.words.max} words.` : q.words.max ? `Write at most ${q.words.max} words${q.words.hard ? ' (you cannot type more)' : ''}.` : `Write at least ${q.words.min} words.`));
      }
      M.appendChild(box);
      if (this._locked()) this._lock(true);
      this._renderNav();
      this.fabPrev.disabled = i === 0;
      this.fabPrev.hidden = false;
      this.fabNext.hidden = false;
      this.fabNext.title = i === qs.length - 1 ? 'Review your answers' : 'Next';
      this.fabNext.setAttribute('aria-label', i === qs.length - 1 ? 'Review your answers (the submission page)' : 'Next question');
      M.scrollTop = 0;
      if (!opts.silent) bus.emit('exam:nav', { paper: this.att.paper.id, q: q.id });
      this._dirty = true;
      this._write(true);
      // the focus goes to the answer – or, for a question without an editor, to the question, so that Tab goes on
      // through it (and not from the top of the page)
      if (!opts.noFocus) {
        setTimeout(() => {
          if (this.main !== M || !M.isConnected) return;
          if (this.ed && !this._locked()) this.ed.focus();
          else if (!M.contains(document.activeElement)) M.focus({ preventScroll: true });
        }, 50);
      }
    }
    _numberOf(i) {
      // information pages have no number
      return this._questions().slice(0, i + 1).filter((q) => q.type !== 'info').length;
    }
    _answerBox(q, a, wrap) {
      const paper = this.att.paper;
      if (q.type === 'essay' || q.type === 'short') {
        const ed = (this.ed = new Editor({
          html: a.html || '',
          words: q.words || null,
          showWords: paper.showWordCount !== false || !!(q.words && q.words.max),
          spellcheck: !!this.att.settings.spellcheck,
          lines: q.lines || (q.type === 'short' ? 6 : 14),
          toolbar: q.toolbar || paper.toolbar || 'default',
          label: `Your answer to question ${this._numberOf(this._questions().indexOf(q))}`,
          readonly: this._locked(),
          onInput: (e) => {
            this._dirty = true;
            this._status('saving');
            clearTimeout(this._quick);
            this._quick = setTimeout(() => this._saveNow(), 1500);
            this._wordsEv(q.id, e.count);
            this._renderNavSoon();
          },
          onBlur: () => this._saveNow(),
          onFormat: (cmd) => bus.emit('exam:format', { cmd }),
          onBackups: () => this._backups(q),
          onExpand: () => this._expand()
        }));
        wrap.appendChild(ed.el);
      } else if (q.type === 'numeric') {
        const inp = h('input.ex-num', { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: a.value || '', 'aria-label': 'Your answer' + (q.units ? ' in ' + q.units : '') });
        inp.addEventListener('input', () => {
          (this.att.answers[q.id] = this.att.answers[q.id] || {}).value = inp.value;
          this._dirty = true;
          this._status('saving');
          clearTimeout(this._quick);
          this._quick = setTimeout(() => this._saveNow(), 1000);
          this._renderNavSoon();
        });
        const note = h('span.ex-numnote', { 'aria-live': 'polite' });
        inp.addEventListener('blur', () => {
          const v = inp.value.trim();
          note.textContent = v && !Number.isFinite(parseNumber(v)) ? 'This does not look like a number.' : '';
          this._saveNow();
        });
        wrap.appendChild(h('div.ex-numrow', h('label', inp, q.units ? h('span.ex-units', q.units) : null), note));
        if (!this._locked()) setTimeout(() => inp.focus(), 50);
      } else if (q.type === 'mcq') {
        const g = h('div.ex-mcq', { role: 'radiogroup', 'aria-label': 'Alternatives' });
        (q.options || []).forEach((opt, k) => {
          const r = h('input', { type: 'radio', name: 'mcq-' + q.id, value: k, checked: a.choice === k });
          r.addEventListener('change', () => {
            (this.att.answers[q.id] = this.att.answers[q.id] || {}).choice = k;
            this._dirty = true;
            this._saveNow();
            this._renderNav();
          });
          const lab = h('label.ex-opt', r, h('span'));
          lab.lastChild.innerHTML = cleanTrusted(opt);
          g.appendChild(lab);
        });
        const clr = h('button.linkbtn', { type: 'button' }, 'Clear my choice');
        clr.addEventListener('click', () => {
          if (this._locked()) return;
          const x = this.att.answers[q.id];
          if (x) delete x.choice;
          g.querySelectorAll('input').forEach((r) => (r.checked = false));
          this._dirty = true;
          this._saveNow();
          this._renderNav();
        });
        wrap.append(g, h('div', clr));
      }
    }
    _splitter(div, box) {
      let on = false;
      div.addEventListener('pointerdown', (e) => {
        on = true;
        div.setPointerCapture(e.pointerId);
      });
      div.addEventListener('pointermove', (e) => {
        if (!on) return;
        const wrap = div.parentNode.getBoundingClientRect();
        const f = Math.max(0.2, Math.min(0.8, (e.clientX - wrap.left) / wrap.width));
        div.parentNode.style.setProperty('--ex-left', f * 100 + '%');
      });
      div.addEventListener('pointerup', () => (on = false));
      div.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const cur = parseFloat(div.parentNode.style.getPropertyValue('--ex-left')) || 50;
        div.parentNode.style.setProperty('--ex-left', Math.max(20, Math.min(80, cur + (e.key === 'ArrowRight' ? 5 : -5))) + '%');
      });
    }
    _flag(q, btn) {
      if (this._locked()) return;
      const a = (this.att.answers[q.id] = this.att.answers[q.id] || {});
      a.flag = !a.flag;
      btn.innerHTML = a.flag ? IC.flagOn : IC.flag;
      btn.setAttribute('aria-pressed', a.flag ? 'true' : 'false');
      btn.title = btn.ariaLabel = a.flag ? 'Unflag this question' : 'Flag this question';
      btn.setAttribute('aria-label', btn.title);
      this._dirty = true;
      this._saveNow();
      this._renderNav();
      bus.emit('exam:flag', { paper: this.att.paper.id, q: q.id, on: !!a.flag });
    }
    _step(d) {
      if (this.page === 'submission' || this.page === 'contents') {
        if (d < 0) return this.go(this._questions().length - 1);
        return;
      }
      const i = this.att.current;
      if (d > 0 && i >= this._questions().length - 1) return this.submissionPage();
      this.go(i + d);
    }
    _renderNavSoon() {
      clearTimeout(this._navT);
      this._navT = setTimeout(() => this._renderNav(), 400);
    }
    _renderNav() {
      const N = this.nav;
      if (!N || !this.att) return;
      this._collect();
      N.innerHTML = '';
      const qs = this._questions();
      const toc = h('button.ex-tile.toc' + (this.page === 'contents' ? '.on' : ''), { type: 'button', title: 'Contents', 'aria-label': 'Contents: all the questions', html: IC.list });
      toc.addEventListener('click', () => this.contents());
      const tiles = h('div.ex-tiles');
      let all = true;
      qs.forEach((q, i) => {
        const info = q.type === 'info';
        const done = !info && this._attempted(q);
        if (!info && !done) all = false;
        const a = this.att.answers[q.id] || {};
        const cur = this.page === 'question' && this.att.current === i;
        const label = info ? 'Information' : `Question ${this._numberOf(i)}, ${done ? 'Attempted' : 'Not attempted'}${a.flag ? ', Flagged' : ''}${cur ? ', Active' : ''}`;
        const t = h('button.ex-tile' + (cur ? '.on' : '') + (done ? '.done' : '') + (a.flag ? '.flagged' : '') + (info ? '.info' : ''), { type: 'button', 'aria-label': label, title: label, 'aria-current': cur ? 'step' : null }, info ? 'i' : String(this._numberOf(i)));
        t.addEventListener('click', () => this.go(i));
        tiles.appendChild(t);
      });
      const rev = h('button.ex-tile.review' + (all ? '.all' : '') + (this.page === 'submission' ? '.on' : ''), { type: 'button', title: 'Review your answers', 'aria-label': 'Review your answers (the submission page)', html: IC.check });
      rev.addEventListener('click', () => this.submissionPage());
      N.append(toc, tiles, this.fabs, rev);
      // (the tile of the question that is shown, in view: the bar scrolls sideways when there are many)
      const on = tiles.querySelector('.on');
      if (on) {
        const a = on.offsetLeft, b = a + on.offsetWidth;
        if (a < tiles.scrollLeft) tiles.scrollLeft = a - 8;
        else if (b > tiles.scrollLeft + tiles.clientWidth) tiles.scrollLeft = b - tiles.clientWidth + 8;
      }
    }
    _renderResources() {
      const R = this.res;
      R.innerHTML = '';
      const list = (this.att.paper.resources || [{ type: 'calculator' }]).slice();
      if (!list.some((r) => r.type === 'calculator')) list.unshift({ type: 'calculator' });
      list.forEach((r) => {
        let b;
        if (r.type === 'calculator') {
          b = h('button.ex-resbtn.calcbtn', { type: 'button', title: 'Calculator', 'aria-label': 'Calculator', html: IC.calc + '<span>Calculator</span>' });
          b.addEventListener('click', () => MG.Calculator && MG.Calculator.toggle());
        } else if (r.type === 'slide') {
          const label = r.label || 'Slide';
          b = h('button.ex-resbtn', { type: 'button', title: `${label}: opens the slide in the Microscope tab (come back to Exam practice afterwards)`, 'aria-label': `${label} (opens the Microscope)`, html: IC.slide + `<span>${esc(label)}</span>` });
          b.addEventListener('click', () => (MG.actions && MG.actions.scope ? MG.actions.scope(r.spec) : toast('The microscope is not part of this page.', 'warn')));
        } else if (r.type === 'link' && /^https?:\/\//.test(r.url || '')) {
          const label = r.label || r.url;
          b = h('a.ex-resbtn', { href: r.url, target: '_blank', rel: 'noopener', title: label, 'aria-label': `${label} (opens in a new browser tab)`, html: IC.link + `<span>${esc(label)}</span>` });
        }
        if (b) R.appendChild(b);
      });
    }
    _expand() {
      const on = !this.root.classList.contains('ex-expanded');
      this.root.classList.toggle('ex-expanded', on);
      if (this.ed && this.ed.btns && this.ed.btns.expand) {
        this.ed.btns.expand.innerHTML = on ? IC.shrink : IC.expand;
        this.ed.btns.expand.title = on ? 'Back to the normal view (Esc)' : 'Expand (full screen)';
        this.ed.btns.expand.setAttribute('aria-label', this.ed.btns.expand.title);
        this.ed.btns.expand.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    _backups(q) {
      this._collect();
      const a = this.att.answers[q.id] || {};
      const list = (this.att.backups[q.id] || []).slice().reverse();
      const body = h('div.ex-backups');
      body.appendChild(h('p', 'A copy of your answer is kept every five minutes while you write, for this attempt. If something goes wrong, you can go back to one. Restoring a copy keeps your current answer as a copy first.'));
      const now = h('button.btn.small', { type: 'button' }, 'Keep a copy now');
      now.addEventListener('click', () => {
        this._collect();
        this._maybeBackup(q, this.att.answers[q.id] || {}, true);
        this._write();
        m.close();
        this._backups(q);
      });
      body.appendChild(h('div', now));
      if (!list.length) body.appendChild(h('p.muted', 'There are no copies of this answer yet.'));
      else {
        const ul = h('ul.ex-bklist');
        list.forEach((b) => {
          const prev = h('div.ex-bkprev');
          prev.textContent = plainText(Object.assign(document.createElement('div'), { innerHTML: b.html })).replace(/\s+/g, ' ').trim().slice(0, 160) || '(no text)';
          const r = h('button.btn.small', { type: 'button', disabled: this._locked() }, 'Restore this copy');
          r.addEventListener('click', () => {
            this._collect();
            this._maybeBackup(q, this.att.answers[q.id] || {}, true);
            const cur = this.att.answers[q.id] || (this.att.answers[q.id] = {});
            cur.html = b.html;
            cur.words = wordsOfHTML(b.html);
            if (this.ed) {
              this.ed.flush();
              this.ed.area.innerHTML = cleanHTML(b.html);
              this.ed.record();
              this.ed._good = { html: this.ed.area.innerHTML, sel: null };
              this.ed._changed();
            }
            this._dirty = true;
            this._write();
            m.close();
            bus.emit('exam:format', { cmd: 'restore' });
            toast('The copy has been restored. Your previous answer is kept as a copy too.', 'ok');
          });
          const d = new Date(b.time);
          ul.appendChild(h('li', h('div', h('b', `${fmtClock(d)}:${pad2(d.getSeconds())}`), ` · ${plural(b.words || 0, 'word')}`, b.html === a.html ? h('span.ex-pill', 'The same as now') : null), prev, r));
        });
        body.appendChild(ul);
      }
      const m = dialog('Backup copies', body);
    }

    /* ---------------- the options menu ---------------- */
    _options(btn) {
      if (Date.now() - (this._menuJustClosed || 0) < 400) return;
      document.querySelectorAll('.ex-menu').forEach((x) => x.remove());
      btn.setAttribute('aria-expanded', 'true');
      const menu = h('div.ex-menu', { role: 'menu', 'aria-label': 'Options' });
      const close = (refocus) => {
        menu.remove();
        document.removeEventListener('pointerdown', off, true);
        btn.setAttribute('aria-expanded', 'false');
        if (refocus && btn.isConnected) btn.focus();
      };
      const off = (e) => {
        if (menu.contains(e.target)) return;
        close(false);
        // (the button itself: closed, not opened again)
        if (btn.contains(e.target)) this._menuJustClosed = Date.now();
      };
      const item = (label, fn) => {
        const b = h('button.ex-mi', { type: 'button', role: 'menuitem' }, label);
        b.addEventListener('click', () => {
          close(true);
          fn();
        });
        menu.appendChild(b);
      };
      const choice = (title, list, cur, fn) => {
        const g = h('div.ex-mgroup', { role: 'group', 'aria-label': title }, h('span.ex-mlabel', title));
        const row = h('div.ex-mrow');
        list.forEach(([v, l]) => {
          const b = h('button.ex-mchoice', { type: 'button', role: 'menuitemradio', 'aria-checked': v === cur ? 'true' : 'false' }, l);
          b.addEventListener('click', () => {
            fn(v);
            row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
          });
          row.appendChild(b);
        });
        g.appendChild(row);
        menu.appendChild(g);
      };
      item('Go to submission page', () => this.submissionPage());
      choice('Text size', SIZES, this.prefs.size, (v) => {
        this.prefs.size = v;
        this._savePrefs();
        this._applyPrefs();
      });
      choice('Contrast', CONTRASTS, this.prefs.contrast, (v) => {
        this.prefs.contrast = v;
        this._savePrefs();
        this._applyPrefs();
      });
      choice('Remaining time', [['show', 'Show'], ['hide', 'Hide']], this.prefs.hideTime ? 'hide' : 'show', (v) => {
        this.prefs.hideTime = v === 'hide';
        this._savePrefs();
        this._applyPrefs();
        this._tickNow();
      });
      choice('Spelling checker', [['on', 'On'], ['off', 'Off']], this.att.settings.spellcheck ? 'on' : 'off', (v) => {
        this.att.settings.spellcheck = v === 'on';
        if (this.ed) this.ed.setSpellcheck(v === 'on');
        this._dirty = true;
        this._saveNow();
      });
      item('Keyboard help', () => this.keyboardHelp());
      item('Save and leave (back to all papers)', () => this.home());
      document.body.appendChild(menu);
      const r = btn.getBoundingClientRect();
      menu.style.top = r.bottom + 4 + 'px';
      menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
      menu.addEventListener('keydown', (e) => {
        const bs = Array.from(menu.querySelectorAll('button'));
        const i = bs.indexOf(document.activeElement);
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          close(true);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
        }
      });
      setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
      menu.querySelector('button').focus();
    }
    keyboardHelp() {
      MG.modal('Keyboard help', `<ul class="ex-keys">
<li>To get to the toolbar from your answer, press <kbd>Alt</kbd>+<kbd>F10</kbd> (on a Mac, <kbd>Fn</kbd>+<kbd>Option</kbd>+<kbd>F10</kbd>). Move along it with <kbd>←</kbd> and <kbd>→</kbd>, press <kbd>Enter</kbd> to use a button, and <kbd>Esc</kbd> to go back to your answer.</li>
<li><kbd>Ctrl</kbd>+<kbd>B</kbd> bold, <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, <kbd>Ctrl</kbd>+<kbd>U</kbd> underline (<kbd>⌘</kbd> on a Mac).</li>
<li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo; <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>X</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> copy, cut and paste.</li>
<li>In a list, <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> indent and outdent an item. Right-click in a table for its rows and columns.</li>
<li>Double-click a formula or a drawing to change it. <kbd>Esc</kbd> leaves the expanded view.</li>
<li>The calculator: type a calculation and press <kbd>Enter</kbd>; <kbd>↑</kbd> brings back the earlier ones, <kbd>Esc</kbd> clears it.</li>
</ul>`);
    }

    /* ---------------- the submission page and the contents ---------------- */
    contents() {
      this._listPage('contents');
    }
    submissionPage() {
      this._listPage('submission');
    }
    _listPage(kind) {
      this._collect();
      if (this._dirty) this._write(true);
      if (this.ed) this.ed.destroy();
      this.ed = null;
      this.root.classList.remove('ex-expanded');
      this.page = kind;
      this.qcur = null;
      if (kind === 'submission') this.att.current = 'submission';
      const M = this.main;
      M.innerHTML = '';
      M.className = 'ex-pmain ex-listpage';
      const qs = this._questions().map((q, i) => ({ q, i })).filter((x) => x.q.type !== 'info');
      const att = this.att;
      const not = qs.filter((x) => !this._attempted(x.q));
      const fl = qs.filter((x) => (att.answers[x.q.id] || {}).flag);
      if (kind === 'submission') {
        const box = h('div.ex-subhead');
        if (att.timeUp && !att.submitted) box.appendChild(h('div.ex-timeup', { role: 'alert' }, h('b', 'Time is up.'), ' Your answers can no longer be changed. Press Submit now to hand them in.'));
        box.append(h('h2', 'Ready to submit?'), h('p', not.length ? `You have ${plural(not.length, 'unattempted question')}.` : 'You have attempted all questions in this test.'));
        const sub = h('button.btn.primary.ex-submit', { type: 'button', html: IC.send + '<span>Submit now</span>' });
        sub.addEventListener('click', () => this._confirmSubmit());
        box.appendChild(sub);
        M.appendChild(box);
      } else M.appendChild(h('div.ex-subhead', h('h2', 'Contents')));
      const tabs = h('div.ex-tabs', { role: 'tablist' });
      const body = h('div.ex-tablewrap');
      const show = (which) => {
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.k === which ? 'true' : 'false'));
        const rows = which === 'not' ? not : which === 'flag' ? fl : qs;
        const tb = h('tbody');
        rows.forEach(({ q, i }) => {
          const done = this._attempted(q);
          const flag = (att.answers[q.id] || {}).flag;
          const tr = h('tr' + (done ? '.done' : ''), { tabindex: '0', title: 'Go to the question' },
            h('td', String(this._numberOf(i))),
            h('td', q.title || '', !done ? h('span.ex-badge', 'Not attempted') : null, flag ? h('span.ex-badge.flag', 'Flagged') : null),
            h('td', q.marks != null ? String(q.marks) : '–'),
            h('td', TYPES[q.type] || q.type));
          const goq = () => {
            this.page = 'question';
            this.go(i);
          };
          tr.addEventListener('click', goq);
          tr.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), goq()));
          tb.appendChild(tr);
        });
        if (!rows.length) tb.appendChild(h('tr', h('td.muted', { colspan: 4 }, which === 'flag' ? 'No question is flagged.' : 'Every question has an answer.')));
        body.innerHTML = '';
        body.appendChild(h('table.ex-qtable', h('thead', h('tr', h('th', 'Question'), h('th', 'Question title'), h('th', 'Marks'), h('th', 'Question type'))), tb));
      };
      [['all', `All questions (${qs.length})`], ['not', `Not attempted (${not.length})`], ['flag', `Flagged (${fl.length})`]].forEach(([k, l]) => {
        const b = h('button.ex-tab', { type: 'button', role: 'tab', dataset: { k } }, l);
        b.addEventListener('click', () => show(k));
        tabs.appendChild(b);
      });
      M.append(tabs, body);
      show('all');
      this._renderNav();
      this.fabPrev.disabled = false;
      this.fabNext.hidden = true;
      this._write(true);
      bus.emit('exam:nav', { paper: att.paper.id, q: kind });
    }
    async _confirmSubmit() {
      const n = this._questions().filter((q) => q.type !== 'info' && !this._attempted(q)).length;
      const ok = await MG.confirmBox('Submit your answers?', `<p>${n ? `You have <b>${plural(n, 'unattempted question')}</b>. ` : ''}After you submit, you cannot change your answers in this attempt.</p>`, 'Submit now', { cancel: 'Go back' });
      if (ok) this._submit();
    }
    _submit(auto) {
      const att = this.att;
      this._collect();
      att.submitted = new Date(this.now()).toISOString();
      att.autoSubmitted = !!auto;
      this._dirty = true;
      this._write();
      if (MG.project && MG.project.flush) MG.project.flush();
      bus.emit('exam:submit', { paper: att.paper.id, answered: this._answeredCount(att), total: this._questions(att).filter((q) => q.type !== 'info').length });
      this.receipt(att, this.path);
    }

    /* ---------------- after submitting ---------------- */
    receipt(att, path) {
      this._clear();
      this.att = att;
      this.path = path;
      this.page = null;
      this.prefs.open = null;
      this._savePrefs();
      const V = this.view;
      V.classList.add('ex-receiptview');
      const when = new Date(att.submitted);
      const total = this._questions(att).filter((q) => q.type !== 'info').length;
      const dl = h('button.btn.primary', { type: 'button', html: IC.download + '<span>Download submission</span>', 'aria-haspopup': 'true' });
      dl.addEventListener('click', () => this._downloadMenu(dl, att));
      const save = h('button.btn', { type: 'button' }, 'Save a Word copy in my files');
      save.addEventListener('click', () => this.download(att, 'docx-file'));
      const rev = h('button.btn', { type: 'button' }, 'Review my answers');
      rev.addEventListener('click', () => this.review(att, path));
      const again = h('button.btn', { type: 'button' }, 'Start a new attempt');
      again.addEventListener('click', () => (att.paper.kind === 'free' ? this._start(att.paper) : this.openPaper(att.paper.id)));
      const back = h('button.btn', { type: 'button', html: IC.back + '<span>All papers</span>' });
      back.addEventListener('click', () => this.home());
      const essays = this._questions(att).filter((q) => q.type === 'essay' || q.type === 'short');
      V.appendChild(h('div.ex-receipt',
        h('div.ex-tick', { 'aria-hidden': 'true', html: IC.check }),
        h('h2', `You submitted at ${fmtClock(when)} on ${fmtDate(when)}`),
        h('p', h('b', att.paper.title), ` · ${this._answeredCount(att)} of ${total} ${total === 1 ? 'question' : 'questions'} answered${att.autoSubmitted ? ' · submitted when the time ran out' : ''}`),
        essays.length ? h('p.muted', essays.map((q) => `${q.title || 'Essay'}: ${plural((att.answers[q.id] || {}).words || 0, 'word')}`).join(' · ')) : null,
        h('div.ex-recacts', dl, save, rev, again, back),
        h('p.hint', `Your attempt is kept in Files: ${this.fs.pretty(path)}. Nothing has been sent anywhere: to hand your answers in, download them.`)));
    }
    _downloadMenu(anchor, att) {
      MG.popmenu(anchor, [
        ['file', 'Word document (.docx)', () => this.download(att, 'docx')],
        ['print', 'Print, or save as PDF', () => this.download(att, 'pdf')],
        ['site', 'Web page (.html)', () => this.download(att, 'html')],
        ['text', 'Plain text (.txt)', () => this.download(att, 'txt')]
      ]);
    }
    _fileBase(att) {
      const c = att.candidate || {};
      return [slug(att.paper.title), c.number ? slug(c.number) : ''].filter(Boolean).join('-');
    }
    /** the submission as HTML (the body: headings, the questions, the answers) */
    exportBody(att, opts = {}) {
      const c = att.candidate || {};
      const who = [c.number && `Candidate ${c.number}`, c.name].filter(Boolean).join(' · ');
      let x = `<h1 class="title">${esc(att.paper.title)}</h1>`;
      if (who) x += `<p class="meta">${esc(who)}</p>`;
      x += `<p class="meta">Started ${esc(fmtWhen(att.started))}${att.submitted ? ' · submitted ' + esc(fmtWhen(att.submitted)) : ' · not submitted'}. Exam practice, BMS workbench.</p>`;
      this._questions(att).forEach((q, i) => {
        if (q.type === 'info') return;
        const n = this._questions(att).slice(0, i + 1).filter((z) => z.type !== 'info').length;
        const a = att.answers[q.id] || {};
        x += `<h2>Question ${n}${q.title ? ': ' + esc(q.title) : ''}</h2>`;
        if (q.text) x += `<div class="qtext">${cleanTrusted(q.text)}</div>`;
        if (q.type === 'essay' || q.type === 'short') {
          x += `<h3>Answer</h3>${a.html ? cleanHTML(a.html) : '<p><i>(no answer)</i></p>'}`;
          x += `<p class="meta">Words: ${a.words || 0}${q.words && q.words.max ? ' (limit ' + q.words.max + ')' : ''}</p>`;
        } else if (q.type === 'numeric') {
          x += `<p><b>Answer:</b> ${a.value != null && String(a.value).trim() ? esc(String(a.value).trim()) + (q.units ? ' ' + esc(q.units) : '') : '<i>(no answer)</i>'}</p>`;
        } else if (q.type === 'mcq') {
          x += `<p><b>Answer:</b> ${a.choice != null && q.options ? esc(String.fromCharCode(65 + a.choice)) + '. ' + cleanTrusted(q.options[a.choice]) : '<i>(no answer)</i>'}</p>`;
        }
        if (opts.guidance) x += this._guidanceHTML(q, a);
      });
      return x;
    }
    _guidanceHTML(q, a) {
      let x = '';
      if (q.type === 'numeric' && q.answer != null) {
        const ok = numericRight(q, a.value);
        x += `<p class="${ok ? 'right' : 'wrong'}"><b>${ok ? '✓ Right' : ok === false ? '✗ Not right' : 'No answer'}.</b> The answer is ${esc(String(q.answer))}${q.units ? ' ' + esc(q.units) : ''}${q.tolerance != null ? ` (answers within ±${esc(String(q.tolerance))} are accepted)` : q.tolerancePct != null ? ` (answers within ±${esc(String(q.tolerancePct))}% are accepted)` : ''}.</p>`;
      }
      if (q.type === 'mcq' && q.correct != null) {
        const ok = a.choice === q.correct;
        x += `<p class="${ok ? 'right' : 'wrong'}"><b>${ok ? '✓ Right' : a.choice == null ? 'No answer' : '✗ Not right'}.</b> The answer is ${String.fromCharCode(65 + q.correct)}.</p>`;
      }
      if (q.guidance) x += `<div class="guidance"><h3>Guidance</h3>${cleanTrusted(q.guidance)}</div>`;
      return x;
    }
    exportDocument(att, opts = {}) {
      return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(att.paper.title)}</title><style>${EXPORT_CSS}</style></head><body>${this.exportBody(att, opts)}</body></html>`;
    }
    exportText(att) {
      const d = document.createElement('div');
      d.innerHTML = this.exportBody(att);
      // lists as - and 1.
      d.querySelectorAll('ul > li').forEach((li) => li.prepend('- '));
      d.querySelectorAll('ol').forEach((ol) => Array.from(ol.children).forEach((li, k) => li.prepend(`${k + 1}. `)));
      d.querySelectorAll('h2').forEach((x) => x.before(document.createTextNode('\n')));
      return plainText(d).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }
    async download(att, format) {
      const base = this._fileBase(att);
      try {
        if (format === 'docx' || format === 'docx-file') {
          if (!MG.Docx) await MG.loadScript('assets/js/docx.js');
          const c = att.candidate || {};
          const blob = await MG.Docx.fromHTML(this.exportBody(att), { title: att.paper.title, creator: [c.number, c.name].filter(Boolean).join(' ') });
          if (format === 'docx-file') {
            const p = await MG.app.saveToFiles(base + '.docx', blob, { folder: '~/essays', ask: false });
            if (p) bus.emit('exam:download', { paper: att.paper.id, format: 'docx-file', path: p });
            return p;
          }
          MG.downloadBlob(blob, base + '.docx');
        } else if (format === 'html') {
          MG.downloadText(this.exportDocument(att), base + '.html', 'text/html');
        } else if (format === 'txt') {
          MG.downloadText(this.exportText(att), base + '.txt', 'text/plain');
        } else if (format === 'pdf') {
          this._print(att);
        }
        bus.emit('exam:download', { paper: att.paper.id, format });
      } catch (e) {
        console.error(e);
        toast('The download could not be made: ' + esc(e.message || e), 'error');
      }
    }
    _print(att) {
      const f = h('iframe.ex-printframe', { title: 'Printing', 'aria-hidden': 'true' });
      document.body.appendChild(f);
      const d = f.contentDocument;
      d.open();
      d.write(this.exportDocument(att).replace('</style>', '@page{size:A4;margin:2cm}</style>'));
      d.close();
      setTimeout(() => {
        try {
          f.contentWindow.focus();
          f.contentWindow.print();
        } catch (e) {
          toast('Printing did not start: use Download → Web page, open it and print it.', 'warn', 7000);
        }
        setTimeout(() => f.remove(), 60000);
      }, 250);
    }

    /** a submitted attempt, read-only, with the right answers and the guidance */
    review(att, path) {
      this._clear();
      this.att = att;
      this.path = path;
      this.page = null;
      const V = this.view;
      V.classList.add('ex-reviewview');
      const back = h('button.btn', { type: 'button', html: IC.back + '<span>Back</span>' });
      back.addEventListener('click', () => (att.submitted ? this.receipt(att, path) : this.home()));
      const dl = h('button.btn', { type: 'button', html: IC.download + '<span>Download</span>' });
      dl.addEventListener('click', () => this._downloadMenu(dl, att));
      const auto = this._questions(att).filter((q) => (q.type === 'numeric' && q.answer != null) || (q.type === 'mcq' && q.correct != null));
      const got = auto.filter((q) => (q.type === 'numeric' ? numericRight(q, (att.answers[q.id] || {}).value) : (att.answers[q.id] || {}).choice === q.correct));
      const marks = (list) => list.reduce((s, q) => s + (+q.marks || 1), 0);
      const doc = h('article.ex-review');
      doc.innerHTML = this.exportBody(att, { guidance: true });
      V.append(h('div.ex-revbar', back, h('span.grow'), auto.length ? h('span.ex-score', `Marked automatically: ${marks(got)} of ${marks(auto)} marks`) : null, dl), doc);
      doc.querySelectorAll('.ex-formula').forEach((f) => (f.innerHTML = TeX.html(f.getAttribute('data-tex') || '')));
    }
  }

  /** HTML written by the teacher (papers): safe tags, with pictures and links */
  function cleanTrusted(html) {
    if (!window.DOMPurify) return html;
    return window.DOMPurify.sanitize(String(html || ''), { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'input', 'button'] });
  }

  const EXPORT_CSS = `body{font-family:Calibri,Carlito,Arial,sans-serif;max-width:800px;margin:30px auto;padding:0 20px;color:#222;line-height:1.5}
h1{font-size:24px;color:#3b1c42;margin:0 0 6px}h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:3px}h3{font-size:15px;margin:16px 0 6px}
.meta{color:#666;font-size:13px;margin:2px 0}.qtext{color:#555;font-style:italic}.qtext img{max-width:100%}
table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}th{background:#eee}
img.ex-drawing{max-width:100%;height:auto;border:1px solid #ddd}.ex-formula{font-family:'Cambria Math','STIX Two Math',Cambria,serif}
.mfrac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 .1em}.mnum{border-bottom:1px solid currentColor;padding:0 .15em}.mden{padding:0 .15em}
.msqrt{display:inline-flex;align-items:flex-start}.mrad{border-top:1px solid currentColor;padding:0 .1em}.mroot{font-size:.65em;margin-right:-.3em}
.msubsup{display:inline-flex;flex-direction:column;vertical-align:middle;font-size:.75em;line-height:1}.mo{padding:0 .2em}.mfn{padding-right:.15em}
[data-indent="1"]{margin-left:2em}[data-indent="2"]{margin-left:4em}[data-indent="3"]{margin-left:6em}[data-indent="4"]{margin-left:8em}
.right{color:#16794a}.wrong{color:#b3261e}.guidance{background:#f6f2f8;border-left:3px solid #6b2f78;padding:4px 12px;margin:8px 0}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}}`;

  MG.ExamApp = ExamApp;
  MG.ExamEditor = Editor;
  MG.examUtil = { countWords, plainText, wordsOfHTML, parseNumber, numericRight, cleanHTML, fmtRemaining, firstWords };
})();
