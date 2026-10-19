/* =====================================================================
   The calculator: a floating scientific calculator for exam practice and
   for the workbench's calculations (MG.Calculator.open()).

   Type an expression in the box (or use the keys) and press Enter or =.
   It knows + − × ÷, powers (^, x², x⁻¹), roots (√, ∛), ln, log (base 10),
   eˣ, 10ˣ, sin cos tan and their inverses (in degrees or radians), π, e,
   brackets, scientific notation (EXP: 6.02E23), Ans (the last answer),
   n! and a memory (MC, MR, M+, M−). It works out the expression itself
   (nothing is sent anywhere, and nothing is run as JavaScript).

   Events (MG.bus): calc:open {}, calc:result {expr, value}
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const { h, esc, bus, store } = MG;

  /* ------------------------------------------------------------------
     the expression: tokens, then a recursive-descent parser
     ------------------------------------------------------------------ */
  const FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, ln: 1, log: 1, sqrt: 1, cbrt: 1, exp: 1, abs: 1
  };
  const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

  /** the text as typed → a plain form the tokenizer reads */
  function normalise(s) {
    return String(s)
      .replace(/[×✕·∙]/g, '*')
      .replace(/÷/g, '/')
      .replace(/[−–—]/g, '-')
      .replace(/π/g, 'pi')
      .replace(/√/g, 'sqrt')
      .replace(/∛/g, 'cbrt')
      .replace(/sin⁻¹/g, 'asin').replace(/cos⁻¹/g, 'acos').replace(/tan⁻¹/g, 'atan')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => '^(' + m.split('').map((c) => SUPER[c]).join('') + ')')
      .replace(/\*\*/g, '^')
      .replace(/\s+/g, '');
  }

  function tokenize(src) {
    const s = normalise(src);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      const rest = s.slice(i);
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) {
        out.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if ((m = /^[A-Za-z]+/.exec(rest))) {
        let w = m[0];
        // a word that is several names run together (2pie, sinpi): take the longest known name at the front
        const names = Object.keys(FUNCS).concat(['pi', 'Ans', 'ans', 'e', 'E']);
        const head = names.filter((n) => w.startsWith(n)).sort((a, b) => b.length - a.length)[0];
        if (!head) throw new SyntaxError(`I don’t know “${w}”.`);
        w = head;
        if (FUNCS[w]) out.push({ t: 'fn', v: w });
        else if (w === 'pi') out.push({ t: 'num', v: Math.PI, c: 'π' });
        else if (w === 'e') out.push({ t: 'num', v: Math.E, c: 'e' });
        else if (w === 'E') throw new SyntaxError('EXP needs a number before it and a whole number after it, as in 6.02E23.');
        else out.push({ t: 'ans' });
        i += w.length;
        continue;
      }
      if ('+-*/^()!%'.includes(c)) {
        out.push({ t: c });
        i++;
        continue;
      }
      if (c === ',') throw new SyntaxError('Use a full stop for the decimal point.');
      throw new SyntaxError(`I don’t understand “${c}”.`);
    }
    return out;
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) return NaN;
    if (n > 170) return Infinity;
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  /** evaluate an expression → a number. opts: {deg (trig in degrees), ans (the last answer)} */
  function evaluate(src, opts = {}) {
    const toks = tokenize(src);
    if (!toks.length) throw new SyntaxError('There is nothing to work out.');
    let k = 0;
    const deg = opts.deg !== false;
    const ans = opts.ans == null ? 0 : opts.ans;
    const peek = () => toks[k];
    const next = () => toks[k++];
    const startsPrimary = (t) => t && (t.t === 'num' || t.t === 'fn' || t.t === '(' || t.t === 'ans');

    function expr() {
      let v = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        const t = peek();
        if (t && (t.t === '*' || t.t === '/')) {
          next();
          const r = unary();
          v = t.t === '*' ? v * r : v / r;
        } else if (startsPrimary(t)) v *= unary(); // 2π, 3(4+1), 2sin(30)
        else break;
      }
      return v;
    }
    function unary() {
      const t = peek();
      if (t && (t.t === '-' || t.t === '+')) {
        next();
        const v = unary();
        return t.t === '-' ? -v : v;
      }
      return power();
    }
    function power() {
      const base = postfix();
      if (peek() && peek().t === '^') {
        next();
        const ex = unary(); // right-associative: 2^3^2 = 2^9; 2^-1 = 0.5
        return Math.pow(base, ex);
      }
      return base;
    }
    function postfix() {
      let v = primary();
      while (peek() && (peek().t === '!' || peek().t === '%')) {
        const t = next().t;
        v = t === '!' ? factorial(v) : v / 100;
      }
      return v;
    }
    function primary() {
      const t = next();
      if (!t) throw new SyntaxError('The expression is not finished.');
      if (t.t === 'num') return t.v;
      if (t.t === 'ans') return ans;
      if (t.t === '(') {
        const v = expr();
        if (peek() && peek().t === ')') next();
        else if (peek()) throw new SyntaxError('A bracket is missing.');
        return v; // (brackets left open at the end are closed for you)
      }
      if (t.t === 'fn') {
        let a;
        if (peek() && peek().t === '(') a = primary();
        else a = power(); // sin 30, √2
        return fn(t.v, a);
      }
      throw new SyntaxError(t.t === ')' ? 'There is a closing bracket without an opening one.' : `“${t.t}” is in the wrong place.`);
    }
    function fn(name, a) {
      const r = deg ? Math.PI / 180 : 1;
      switch (name) {
        case 'sin': return clean(Math.sin(a * r));
        case 'cos': return clean(Math.cos(a * r));
        case 'tan': {
          // tan 90° is undefined
          if (deg && Math.abs(((a % 180) + 180) % 180 - 90) < 1e-12) return NaN;
          return clean(Math.tan(a * r));
        }
        case 'asin': return Math.asin(a) / r;
        case 'acos': return Math.acos(a) / r;
        case 'atan': return Math.atan(a) / r;
        case 'ln': return a < 0 ? NaN : Math.log(a);
        case 'log': return a < 0 ? NaN : Math.log10(a);
        case 'sqrt': return a < 0 ? NaN : Math.sqrt(a);
        case 'cbrt': return Math.cbrt(a);
        case 'exp': return Math.exp(a);
        case 'abs': return Math.abs(a);
      }
      return NaN;
    }
    // sin 180° gives 1.2e-16 in floating point: a calculator shows 0
    function clean(x) {
      return Math.abs(x) < 1e-15 ? 0 : x;
    }
    const v = expr();
    if (k < toks.length) {
      const t = toks[k];
      throw new SyntaxError(t.t === ')' ? 'There is a closing bracket without an opening one.' : `“${t.t}” is in the wrong place.`);
    }
    return v;
  }

  /** a number as a calculator shows it: up to 10 significant figures, scientific notation when very large or small.
      → {text (plain, e.g. 6.02E23), html (6.02 × 10<sup>23</sup>)} */
  function format(x) {
    if (typeof x !== 'number' || Number.isNaN(x)) return { text: 'Maths error', html: 'Maths error', error: true };
    if (!Number.isFinite(x)) return { text: 'Maths error', html: 'Maths error (the answer is too large, or is a division by zero)', error: true };
    if (x === 0) return { text: '0', html: '0' };
    const a = Math.abs(x);
    if (a >= 1e10 || a < 1e-6) {
      let [m, e] = x.toExponential(9).split('e');
      m = m.replace(/\.?0+$/, '');
      const ex = parseInt(e, 10);
      return { text: `${m}E${ex}`, html: `${m.replace('-', '−')} × 10<sup>${String(ex).replace('-', '−')}</sup>` };
    }
    let s = parseFloat(x.toPrecision(10)).toString();
    if (/e/.test(s)) s = x.toFixed(10).replace(/\.?0+$/, '');
    return { text: s, html: s.replace('-', '−') };
  }

  /* ------------------------------------------------------------------
     the window
     ------------------------------------------------------------------ */
  const KEYS = [
    // [label, what is put in the box (or an action), title, class]
    ['sin', 'sin(', 'Sine'], ['cos', 'cos(', 'Cosine'], ['tan', 'tan(', 'Tangent'], ['(', '(', 'Opening bracket'], [')', ')', 'Closing bracket'],
    ['sin⁻¹', 'asin(', 'Inverse sine'], ['cos⁻¹', 'acos(', 'Inverse cosine'], ['tan⁻¹', 'atan(', 'Inverse tangent'], ['xʸ', '^', 'Power: x to the power y'], ['√', 'sqrt(', 'Square root'],
    ['ln', 'ln(', 'Natural logarithm (base e)'], ['log', 'log(', 'Logarithm, base 10'], ['eˣ', 'e^(', 'e to the power x'], ['10ˣ', '10^(', '10 to the power x'], ['x²', '^2', 'Square'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['DEL', ':del', 'Delete the last character (Backspace)', 'fn'], ['AC', ':clear', 'Clear (Esc)', 'fn ac'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'Multiply (*)', 'op'], ['÷', '÷', 'Divide (/)', 'op'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'Add', 'op'], ['−', '−', 'Subtract (-)', 'op'],
    ['0', '0'], ['.', '.', 'Decimal point'], ['EXP', 'E', 'Times ten to the power: 6.02 EXP 23 is 6.02 × 10²³'], ['(−)', '−', 'Negative number'], ['Ans', 'Ans', 'The last answer'],
    ['π', 'π', 'Pi'], ['e', 'e', 'e, the base of natural logarithms'], ['x⁻¹', '^(-1)', 'One over x (reciprocal)'], ['∛', 'cbrt(', 'Cube root'], ['=', ':eq', 'Work it out (Enter)', 'eq']
  ];

  const Calc = {
    el: null,
    st: null,
    open() {
      if (!this.el) this._build();
      // (where the keyboard goes back to when the calculator is closed)
      if (this.el.hidden && document.activeElement && !this.el.contains(document.activeElement)) this._back = document.activeElement;
      this.el.hidden = false;
      this._place();
      setTimeout(() => this.input.focus(), 20);
      bus.emit('calc:open', {});
      return this;
    },
    close() {
      if (this.el) this.el.hidden = true;
      if (this._back && this._back.isConnected) this._back.focus();
    },
    toggle() {
      return this.el && !this.el.hidden ? this.close() : this.open();
    },
    isOpen() {
      return !!(this.el && !this.el.hidden);
    },
    /** work out an expression as the window does (also used by the tests) → {value, text, html, error} */
    evaluate(expr, opts) {
      try {
        const st = this.st || load();
        const v = evaluate(expr, Object.assign({ deg: st.deg, ans: st.ans }, opts || {}));
        return Object.assign({ value: v }, format(v));
      } catch (e) {
        return { value: NaN, text: 'Syntax error', html: esc(e.message || 'Syntax error'), error: true };
      }
    },
    _build() {
      this.st = load();
      this._back = document.activeElement;
      const deg = h('button.calc-mode', { type: 'button', title: 'Angles in degrees or radians (for sin, cos and tan)' });
      const histBtn = h('button.calc-hbtn', { type: 'button', title: 'Show the earlier calculations', 'aria-pressed': 'false', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>' });
      const close = h('button.calc-x', { type: 'button', 'aria-label': 'Close the calculator', title: 'Close', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' });
      this.mem = h('span.calc-mem', { title: 'Something is in the memory' }, 'M');
      const head = h('div.calc-head', h('b', 'Calculator'), this.mem, h('span.calc-grow'), deg, histBtn, close);
      this.input = h('input.calc-in', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'The calculation (type it, then press Enter)', placeholder: 'Type a calculation, e.g. 2.5 × 10^3 ÷ 4' });
      this.out = h('div.calc-out', { 'aria-live': 'polite', role: 'status' }, '0');
      this.hist = h('ol.calc-hist', { hidden: true, 'aria-label': 'Earlier calculations' });
      const memRow = h('div.calc-memrow');
      [['MC', 'Clear the memory'], ['MR', 'Put the number in the memory into the calculation'], ['M+', 'Add the answer to the memory'], ['M−', 'Take the answer away from the memory']].forEach(([l, t]) => {
        const b = h('button.calc-k.mem', { type: 'button', title: t }, l);
        b.addEventListener('click', () => this._memory(l));
        memRow.appendChild(b);
      });
      const pad = h('div.calc-pad');
      KEYS.forEach(([label, ins, title, cls]) => {
        const b = h('button.calc-k' + (cls ? '.' + cls.split(' ').join('.') : /^[\d.]$/.test(label) ? '.num' : ''), { type: 'button', title: title || label, 'aria-label': title || label }, label);
        b.addEventListener('click', () => this._key(ins));
        pad.appendChild(b);
      });
      this.el = h('div.calc', { role: 'dialog', 'aria-label': 'Calculator', hidden: true }, head, this.input, this.out, this.hist, memRow, pad);
      document.body.appendChild(this.el);
      const setDeg = () => {
        deg.textContent = this.st.deg ? 'DEG' : 'RAD';
        deg.setAttribute('aria-label', this.st.deg ? 'Angles in degrees (click for radians)' : 'Angles in radians (click for degrees)');
      };
      setDeg();
      deg.addEventListener('click', () => {
        this.st.deg = !this.st.deg;
        setDeg();
        save(this.st);
      });
      histBtn.addEventListener('click', () => {
        this.hist.hidden = !this.hist.hidden;
        histBtn.setAttribute('aria-pressed', this.hist.hidden ? 'false' : 'true');
        this._renderHist();
      });
      close.addEventListener('click', () => this.close());
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || (e.key === '=' && !e.shiftKey)) {
          e.preventDefault();
          this._equals();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (this.input.value) this._key(':clear');
          else this.close();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const H = this.st.history;
          if (!H.length) return;
          e.preventDefault();
          this._hi = this._hi == null ? H.length : this._hi;
          this._hi = Math.max(0, Math.min(H.length, this._hi + (e.key === 'ArrowUp' ? -1 : 1)));
          this.input.value = this._hi < H.length ? H[this._hi].expr : '';
        }
      });
      this.el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.target !== this.input) {
          e.preventDefault();
          this.close();
        }
      });
      this._drag(head);
      this._showMem();
      this.out.innerHTML = this.st.last ? this.st.last.html : '0';
      window.addEventListener('resize', () => this.el && !this.el.hidden && this._place(true));
    },
    _key(ins) {
      const inp = this.input;
      if (ins === ':clear') {
        inp.value = '';
        this.out.innerHTML = '0';
        this.out.classList.remove('err');
      } else if (ins === ':del') {
        const s = inp.selectionStart, e = inp.selectionEnd;
        if (s !== e) inp.setRangeText('', s, e, 'end');
        else if (s > 0) inp.setRangeText('', s - 1, s, 'end');
      } else if (ins === ':eq') return this._equals();
      else {
        // after an answer, an operator carries on from it (Ans + …)
        if (this._fresh && /^[×÷+^*/]|^\^/.test(ins) && !inp.value) inp.value = 'Ans';
        const s = inp.selectionStart == null ? inp.value.length : inp.selectionStart, e = inp.selectionEnd == null ? s : inp.selectionEnd;
        inp.setRangeText(ins, s, e, 'end');
      }
      this._fresh = false;
      inp.focus();
    },
    _equals() {
      const expr = this.input.value.trim();
      if (!expr) return;
      const r = this.evaluate(expr);
      this.out.innerHTML = r.html;
      this.out.classList.toggle('err', !!r.error);
      if (!r.error) {
        this.st.ans = r.value;
        this.st.last = { html: r.html, text: r.text };
        this.st.history.push({ expr, text: r.text });
        if (this.st.history.length > 30) this.st.history.shift();
        save(this.st);
        this._renderHist();
        bus.emit('calc:result', { expr, value: r.value });
        this.input.value = '';
        this.input.placeholder = `${expr} =`;
        this._fresh = true;
      }
      this._hi = null;
    },
    _memory(k) {
      const a = this.st.ans || 0;
      if (k === 'MC') this.st.mem = 0;
      else if (k === 'MR') this._key(format(this.st.mem || 0).text);
      else if (k === 'M+') this.st.mem = (this.st.mem || 0) + a;
      else if (k === 'M−') this.st.mem = (this.st.mem || 0) - a;
      save(this.st);
      this._showMem();
      this.input.focus();
    },
    _showMem() {
      this.mem.hidden = !this.st.mem;
      this.mem.title = this.st.mem ? 'In the memory: ' + format(this.st.mem).text : '';
    },
    _renderHist() {
      if (this.hist.hidden) return;
      this.hist.innerHTML = '';
      if (!this.st.history.length) this.hist.appendChild(h('li.calc-none', 'Nothing yet.'));
      this.st.history.slice().reverse().forEach((x) => {
        const b = h('button', { type: 'button', title: 'Use this calculation again' }, h('span', x.expr), h('b', '= ' + x.text));
        b.addEventListener('click', () => {
          this.input.value = x.expr;
          this.input.focus();
        });
        this.hist.appendChild(h('li', b));
      });
    },
    _drag(handle) {
      let sx, sy, ox, oy, on = false;
      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        on = true;
        sx = e.clientX;
        sy = e.clientY;
        const r = this.el.getBoundingClientRect();
        ox = r.left;
        oy = r.top;
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!on) return;
        this._moveTo(ox + e.clientX - sx, oy + e.clientY - sy);
      });
      const end = () => {
        if (!on) return;
        on = false;
        const r = this.el.getBoundingClientRect();
        this.st.pos = { x: Math.round(r.left), y: Math.round(r.top) };
        save(this.st);
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      // the keyboard can move it too (Alt+arrows on the title bar)
      handle.tabIndex = 0;
      handle.setAttribute('aria-label', 'Calculator: Alt and the arrow keys move it');
      handle.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
        if (!d || !e.altKey) return;
        e.preventDefault();
        const r = this.el.getBoundingClientRect();
        this._moveTo(r.left + d[0], r.top + d[1]);
        end.call(this);
      });
    },
    _moveTo(x, y) {
      const w = this.el.offsetWidth, hgt = this.el.offsetHeight;
      x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
      y = Math.max(4, Math.min(window.innerHeight - Math.min(hgt, 120) - 4, y));
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    },
    _place(keep) {
      const p = this.st.pos;
      if (p && keep !== false) this._moveTo(p.x, p.y);
      else this._moveTo(window.innerWidth - this.el.offsetWidth - 24, 70);
    }
  };

  function load() {
    const d = (store && store.get('calc', null)) || {};
    return { deg: d.deg !== false, ans: typeof d.ans === 'number' ? d.ans : 0, mem: d.mem || 0, history: Array.isArray(d.history) ? d.history : [], pos: d.pos || null, last: d.last || null };
  }
  function save(st) {
    if (store) store.set('calc', { deg: st.deg, ans: st.ans, mem: st.mem, history: st.history, pos: st.pos, last: st.last });
  }

  MG.Calculator = Calc;
  MG.calcEval = evaluate;
  MG.calcFormat = format;
})();
