/* =====================================================================
   A small writer of Word documents (.docx) from simple HTML, for exam
   practice: MG.Docx.fromHTML(html, {title, creator}) → a Promise of a Blob.

   It understands what the essay editor makes: headings (h1–h3; an h1 of
   class "title" becomes the document's title), paragraphs, line breaks,
   bold, italic, underline, subscript and superscript, bulleted and
   numbered lists (nested), indented paragraphs (data-indent), tables (a
   header row in <th>), pictures (drawings, as PNG data) and formulas
   (span.ex-formula with data-tex, written as text with real sub- and
   superscripts). Elements of class "qtext" are written in the style
   "Question text" (italic, grey). Paper size A4.
   Needs JSZip (assets/vendor/jszip/jszip.min.js, loaded when needed).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // eslint-disable-next-line no-control-regex
  const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  const xe = (s) => String(s == null ? '' : s).replace(BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const EMU_PX = 9525; // English Metric Units in a CSS pixel (96 per inch)
  const MAX_W = 6 * 914400; // pictures at most 6 inches wide

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'PRE', 'BLOCKQUOTE', 'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'DL', 'DT', 'DD']);

  class Writer {
    constructor() {
      this.rels = []; // {id, target}
      this.media = []; // {name, bytes}
      this.nums = []; // numbering instances: {id, abstract}
      this.nextNum = 2; // 1 is the shared bulleted list
      this.docPr = 1;
    }

    /* ---- runs (inline content) ---- */
    run(text, f, pre) {
      if (!text) return '';
      const props = [];
      if (f.b) props.push('<w:b/><w:bCs/>');
      if (f.i) props.push('<w:i/><w:iCs/>');
      if (f.u) props.push('<w:u w:val="single"/>');
      if (f.mono) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
      if (f.sup) props.push('<w:vertAlign w:val="superscript"/>');
      else if (f.sub) props.push('<w:vertAlign w:val="subscript"/>');
      const rpr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
      if (pre) {
        // keep the line breaks of formatted text
        return text.split('\n').map((line, k) => (k ? `<w:r>${rpr}<w:br/></w:r>` : '') + (line ? `<w:r>${rpr}<w:t xml:space="preserve">${xe(line)}</w:t></w:r>` : '')).join('');
      }
      return `<w:r>${rpr}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
    }
    /** the inline content of a node → an array of run XML strings (with the first and last text trimmed later) */
    inline(node, f, out, pre) {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3) {
          const t = pre ? c.nodeValue : c.nodeValue.replace(/\s+/g, ' ');
          if (t) out.push({ text: t, f: Object.assign({}, f), pre });
          continue;
        }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (tag === 'BR') {
          out.push({ xml: '<w:r><w:br/></w:r>' });
          continue;
        }
        if (tag === 'IMG') {
          const x = this.picture(c);
          if (x) out.push({ xml: x });
          continue;
        }
        if (c.classList && c.classList.contains('ex-formula')) {
          const runs = formulaRuns(c);
          runs.forEach((r) => out.push({ text: r.s, f: Object.assign({}, f, { sup: r.sup, sub: r.sub, i: f.i || r.i }), keep: true }));
          continue;
        }
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        const g = Object.assign({}, f);
        if (tag === 'B' || tag === 'STRONG' || tag === 'TH') g.b = true;
        if (tag === 'I' || tag === 'EM') g.i = true;
        if (tag === 'U' || tag === 'INS') g.u = true;
        if (tag === 'SUP') {
          g.sup = true;
          g.sub = false;
        }
        if (tag === 'SUB') {
          g.sub = true;
          g.sup = false;
        }
        if (tag === 'CODE' || tag === 'KBD') g.mono = true;
        this.inline(c, g, out, pre || tag === 'PRE');
      }
      return out;
    }
    runsXml(parts) {
      // trim the white space at the two ends of the paragraph, and runs of spaces between pieces
      const texts = parts.filter((p) => p.text != null && !p.pre);
      if (texts.length) {
        texts[0].text = texts[0].text.replace(/^\s+/, '');
        texts[texts.length - 1].text = texts[texts.length - 1].text.replace(/\s+$/, '');
      }
      let prevSpace = true;
      return parts
        .map((p) => {
          if (p.xml) {
            prevSpace = false;
            return p.xml;
          }
          let t = p.text;
          if (!p.pre && !p.keep && prevSpace) t = t.replace(/^ /, '');
          if (!t) return '';
          prevSpace = !p.pre && / $/.test(t);
          return this.run(t, p.f, p.pre);
        })
        .join('');
    }

    /* ---- paragraphs ---- */
    para(runs, opts = {}) {
      const ppr = [];
      if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
      if (opts.num) ppr.push(`<w:numPr><w:ilvl w:val="${opts.num.level}"/><w:numId w:val="${opts.num.id}"/></w:numPr>`);
      if (opts.border) ppr.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>');
      if (opts.indent) ppr.push(`<w:ind w:left="${720 * opts.indent}"/>`);
      if (opts.keepNext) ppr.push('<w:keepNext/>');
      return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
    }
    styleOf(el, ctx) {
      const t = el.tagName;
      if (t === 'H1') return el.classList.contains('title') ? 'Title' : 'Heading1';
      if (t === 'H2') return 'Heading2';
      if (t === 'H3' || t === 'H4' || t === 'H5' || t === 'H6') return 'Heading3';
      if (t === 'PRE') return 'Formatted';
      if (el.classList && el.classList.contains('meta')) return 'Subtitle';
      return ctx.style || null;
    }
    /** the block content of a node → XML */
    blocks(node, ctx = {}) {
      let out = '';
      let pending = []; // inline nodes waiting to be a paragraph
      const flush = () => {
        if (!pending.length) return;
        const wrap = document.createElement('p');
        pending.forEach((n) => wrap.appendChild(n.cloneNode(true)));
        pending = [];
        if (!wrap.textContent.trim() && !wrap.querySelector('img,.ex-formula')) return;
        out += this.para(this.runsXml(this.inline(wrap, {}, [])), { style: ctx.style, indent: ctx.indent });
      };
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3) {
          if (c.nodeValue.trim()) pending.push(c);
          else if (pending.length) pending.push(c);
          continue;
        }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (!BLOCK.has(tag) && !(tag === 'IMG' && !pending.length && c.classList.contains('ex-drawing'))) {
          pending.push(c);
          continue;
        }
        flush();
        const ind = (+(c.getAttribute && c.getAttribute('data-indent')) || 0) + (ctx.indent || 0);
        const sub = Object.assign({}, ctx, { indent: ind || undefined });
        if (c.classList && c.classList.contains('qtext')) sub.style = 'QuestionText';
        if (tag === 'UL' || tag === 'OL') out += this.list(c, 0, sub);
        else if (tag === 'TABLE') out += this.table(c);
        else if (tag === 'HR') out += this.para('', { border: true });
        else if (tag === 'IMG') out += this.para(this.picture(c) || '', {});
        else if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'BLOCKQUOTE' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'FIGURE' || tag === 'DL') {
          if (tag === 'BLOCKQUOTE') sub.indent = (sub.indent || 0) + 1;
          if (Array.from(c.children).some((k) => BLOCK.has(k.tagName))) out += this.blocks(c, sub);
          else {
            const runs = this.runsXml(this.inline(c, {}, []));
            if (runs) out += this.para(runs, { style: this.styleOf(c, sub), indent: sub.indent });
          }
        } else {
          const style = this.styleOf(c, sub);
          const runs = this.runsXml(this.inline(c, tag === 'PRE' ? { mono: true } : {}, [], tag === 'PRE'));
          out += this.para(runs, { style, indent: sub.indent, keepNext: /^Heading/.test(style || '') });
        }
      }
      flush();
      return out;
    }
    list(el, level, ctx) {
      let id;
      if (el.tagName === 'UL') id = 1;
      else {
        id = this.nextNum++;
        this.nums.push({ id, level });
      }
      let out = '';
      for (const li of Array.from(el.children)) {
        if (li.tagName !== 'LI') continue;
        // the item's own text, then any lists inside it
        const own = document.createElement('div');
        const nested = [];
        Array.from(li.childNodes).forEach((n) => {
          if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) nested.push(n);
          else own.appendChild(n.cloneNode(true));
        });
        // (paragraphs inside an item: their text, one after the other)
        const runs = this.runsXml(this.inline(own, {}, []));
        out += this.para(runs, { style: 'ListParagraph', num: { id, level: Math.min(level, 8) } });
        nested.forEach((n) => (out += this.list(n, level + 1, ctx)));
      }
      return out;
    }
    table(el) {
      const rows = Array.from(el.querySelectorAll('tr')).filter((tr) => tr.closest('table') === el);
      if (!rows.length) return '';
      const cols = Math.max(...rows.map((tr) => Array.from(tr.children).filter((c) => /^T[HD]$/.test(c.tagName)).length), 1);
      const total = 9026; // twentieths of a point across an A4 page with 1-inch margins
      const w = Math.floor(total / cols);
      const border = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
      let x = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${('<w:gridCol w:w="' + w + '"/>').repeat(cols)}</w:tblGrid>`;
      rows.forEach((tr) => {
        const cells = Array.from(tr.children).filter((c) => /^T[HD]$/.test(c.tagName));
        const head = cells.length && cells.every((c) => c.tagName === 'TH');
        x += `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
        for (let k = 0; k < cols; k++) {
          const c = cells[k];
          let inner = '';
          if (c) {
            const hasBlocks = Array.from(c.children).some((n) => BLOCK.has(n.tagName));
            inner = hasBlocks ? this.blocks(c, {}) : this.para(this.runsXml(this.inline(c, c.tagName === 'TH' ? { b: true } : {}, [])), {});
          }
          if (!inner) inner = '<w:p/>';
          x += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${c && c.tagName === 'TH' ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ''}</w:tcPr>${inner}</w:tc>`;
        }
        x += '</w:tr>';
      });
      return x + '</w:tbl>' + this.para('', {});
    }
    picture(img) {
      const src = img.getAttribute('src') || '';
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src);
      if (!m) return '';
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = /jpe?g/i.test(m[1]) ? 'jpeg' : 'png';
      const n = this.media.length + 1;
      const name = `image${n}.${ext}`;
      this.media.push({ name, bytes });
      const rid = 'rIdImg' + n;
      this.rels.push({ id: rid, target: 'media/' + name });
      let w = +img.getAttribute('width') || +img.dataset.w || 480;
      let hgt = +img.getAttribute('height') || +img.dataset.h || 300;
      let cx = w * EMU_PX, cy = hgt * EMU_PX;
      if (cx > MAX_W) {
        cy = Math.round((cy * MAX_W) / cx);
        cx = MAX_W;
      }
      const id = this.docPr++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Drawing ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }

    /* ---- the package ---- */
    numberingXml() {
      const bullets = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
      const fmts = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
      const lvl = (k, fmt, text) => `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (k + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
      let x = `${HDR}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`;
      x += `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets.map((b, k) => lvl(k, 'bullet', b)).join('')}</w:abstractNum>`;
      x += `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${fmts.map((f, k) => lvl(k, f, `%${k + 1}.`)).join('')}</w:abstractNum>`;
      x += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
      this.nums.forEach((n) => (x += `<w:num w:numId="${n.id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${Math.min(n.level, 8)}"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`));
      return x + '</w:numbering>';
    }
  }

  const STYLES = `${HDR}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="3B1C42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="3B1C42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="QuestionText"><w:name w:val="Question text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Formatted"><w:name w:val="Formatted"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

  /** a formula (span.ex-formula) → runs of text with superscripts and subscripts */
  function formulaRuns(el) {
    const tex = el.getAttribute('data-tex');
    if (tex && MG.ExamTeX) {
      try {
        return MG.ExamTeX.runs(tex);
      } catch (e) {
        /* fall back to the text */
      }
    }
    return [{ s: el.textContent }];
  }

  async function fromHTML(html, opts = {}) {
    if (!window.JSZip) await MG.loadScript('assets/vendor/jszip/jszip.min.js');
    const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
    const W = new Writer();
    const body = W.blocks(doc.body, {});
    const zip = new window.JSZip();
    const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('[Content_Types].xml', `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    zip.file('_rels/.rels', `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.file('docProps/core.xml', `${HDR}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(opts.title || 'Exam practice')}</dc:title><dc:creator>${xe(opts.creator || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', `${HDR}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>BMS workbench – exam practice</Application></Properties>`);
    zip.file('word/styles.xml', STYLES);
    zip.file('word/numbering.xml', W.numberingXml());
    zip.file('word/_rels/document.xml.rels', `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${W.rels.map((r) => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('')}</Relationships>`);
    W.media.forEach((m) => zip.file('word/media/' + m.name, m.bytes));
    zip.file('word/document.xml', `${HDR}<w:document ${NS}><w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  MG.Docx = { fromHTML };
})();
