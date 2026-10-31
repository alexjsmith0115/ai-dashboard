/* Small DOM helpers: elements, controls, cards with a table view, status chips, sortable tables. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  // el('div.card#x', {attrs}, children...) — text children always go in as text nodes (never innerHTML).
  function el(spec, attrs, ...kids) {
    const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const node = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') node.classList.add(part.slice(1)); else node.id = part.slice(1);
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    append(node, kids);
    return node;
  }
  function append(node, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      node.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return node;
  }

  function select(label, options, value, onChange, opts) {
    const s = el('select', { 'aria-label': label });
    for (const o of options) {
      if (o.group) {
        const g = el('optgroup', { label: o.group });
        for (const c of o.options) g.appendChild(el('option', { value: c.value, text: c.label }));
        s.appendChild(g);
      } else s.appendChild(el('option', { value: o.value, text: o.label }));
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return el('label.field', (opts && opts.hideLabel) ? null : el('span', { text: label }), s);
  }

  function metricOptions(keys, grouped) {
    const list = (keys || AID.METRICS.map((m) => m.key)).filter(AID.available).map((k) => AID.M[k]);
    if (!grouped) return list.map((m) => ({ value: m.key, label: m.label }));
    const by = {};
    for (const m of list) (by[m.source] = by[m.source] || []).push({ value: m.key, label: m.label });
    return Object.entries(by).map(([g, options]) => ({ group: g, options }));
  }

  function seg(label, options, value, onChange) {
    const wrap = el('div.seg', { role: 'group', 'aria-label': label });
    for (const o of options) {
      wrap.appendChild(el('button', { type: 'button', 'aria-pressed': String(o.value === value), disabled: !!o.disabled, title: o.title || null, onclick: () => onChange(o.value), text: o.label }));
    }
    return wrap;
  }

  // ---------- Status chips: icon + label, never color alone ----------
  const ICONS = {
    up: 'M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5',
    down: 'M8 3v10m0 0l-4.5-4.5M8 13l4.5-4.5',
    flat: 'M3 8h10',
    warn: 'M8 2.5l6 10.5H2L8 2.5zM8 6.5v3M8 11.2v.3',
    check: 'M3 8.5l3.2 3L13 4.5',
  };
  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }
  // c = comparison result from analysis.compare
  function statusChip(c, big) {
    const cls = big ? '.chip.big' : '.chip';
    if (!c || c.status === 'nodata') return el('span' + cls, icon('flat'), 'Not enough data');
    const dirIcon = c.diff > 0 ? 'up' : 'down';
    // Tiers: clear (95% CI excludes 0; "slight" under 5%), likely (only the 80% CI excludes 0), possibly (only the 50% CI
    // excludes 0), no clear change.
    if (c.status === 'improved') return el('span' + cls + '.good', icon(dirIcon), c.slight ? 'Slight improvement' : 'Improved');
    if (c.status === 'worse') return el('span' + cls + '.bad', icon(dirIcon), c.slight ? 'Slightly worse' : 'Worse');
    if (c.status === 'up' || c.status === 'down') return el('span' + cls, icon(dirIcon), (c.slight ? 'Slightly ' : '') + (c.status === 'up' ? 'Increased' : 'Decreased').toLowerCase().replace(/^./, (ch) => (c.slight ? ch : ch.toUpperCase())));
    if (c.likely === 'improved') return el('span' + cls + '.likely-good', icon(dirIcon), 'Likely improved');
    if (c.likely === 'worse') return el('span' + cls + '.likely-bad', icon(dirIcon), 'Likely worse');
    if (c.likely === 'up' || c.likely === 'down') return el('span' + cls + '.likely', icon(dirIcon), c.likely === 'up' ? 'Likely increased' : 'Likely decreased');
    if (c.possible === 'improved') return el('span' + cls + '.possible-good', icon(dirIcon), 'Possibly improved');
    if (c.possible === 'worse') return el('span' + cls + '.possible-bad', icon(dirIcon), 'Possibly worse');
    if (c.possible === 'up' || c.possible === 'down') return el('span' + cls + '.possible', icon(dirIcon), c.possible === 'up' ? 'Possibly increased' : 'Possibly decreased');
    return el('span' + cls, icon('flat'), 'No clear change');
  }
  function answerChip(kind, text) {
    const map = { yes: ['.good', 'check'], mixed: ['.warn', 'warn'], no: ['.bad', 'down'], none: ['', 'flat'] };
    const [cls, ic] = map[kind] || map.none;
    return el('span.chip.big' + cls, icon(ic), text);
  }

  // ---------- Tables ----------
  // columns: [{label, value: row => any, format?: (v,row) => string, num?: bool, sortable?: bool, cell?: (row)=>Node}]
  function table(columns, rows, opts) {
    const o = opts || {};
    let sortCol = o.sortCol != null ? o.sortCol : -1, sortDir = o.sortDir || -1;
    const wrap = el('div.table-wrap', o.maxHeight ? { style: { maxHeight: o.maxHeight } } : null);
    const t = el('table.data');
    const thead = el('thead'), tbody = el('tbody');
    t.append(thead, tbody);
    wrap.appendChild(t);
    function draw() {
      thead.textContent = ''; tbody.textContent = '';
      const tr = el('tr');
      columns.forEach((c, i) => {
        const sortable = o.sortable !== false && c.sortable !== false;
        const th = el('th' + (c.num ? '.num' : '') + (sortable ? '.sortable' : ''), { scope: 'col', title: c.title || null });
        th.textContent = c.label + (i === sortCol ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
        if (sortable) th.addEventListener('click', () => { sortDir = i === sortCol ? -sortDir : (c.num ? -1 : 1); sortCol = i; draw(); });
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      let list = rows.slice();
      if (sortCol >= 0) {
        const get = columns[sortCol].sortValue || columns[sortCol].value;
        list.sort((a, b) => {
          const x = get(a), y = get(b);
          if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
          return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
        });
      }
      const limit = o.limit || 2000;
      for (const r of list.slice(0, limit)) {
        const row = el('tr' + (o.rowClass && o.rowClass(r) ? '.' + o.rowClass(r) : ''));
        for (const c of columns) {
          const td = el('td' + (c.num ? '.num' : ''));
          if (c.cell) append(td, [c.cell(r)]);
          else { const v = c.value(r); td.textContent = c.format ? c.format(v, r) : v == null ? '—' : String(v); }
          row.appendChild(td);
        }
        tbody.appendChild(row);
      }
    }
    draw();
    return wrap;
  }

  // ---------- Card with chart / table toggle ----------
  const tableMode = new Set();
  // A card title with an optional "?" help button (topic id from help.js).
  function titleRow(text, helpId, tag) {
    return el('div.card-title', el(tag || 'h3', { text }), helpId && AID.help ? AID.help.button(helpId) : null);
  }

  // o: {id, title, sub, help (topic id), height, controls, table}
  function card(o) {
    const canvas = el('canvas', { role: 'img', 'aria-label': o.title });
    const box = el('div.chart-box', { style: { height: (o.height || 280) + 'px' } }, canvas);
    const tableBox = el('div.table-box');
    const foot = el('div.card-foot');
    const controls = el('div.card-controls', o.controls || []);
    let toggle = null;
    if (o.table !== false) {
      toggle = el('button.btn.small', { type: 'button', 'aria-pressed': 'false', title: 'Switch between chart and table view' });
      controls.appendChild(toggle);
    }
    const node = el('section.card', { id: o.id ? 'card-' + o.id : null },
      el('header.card-head', el('div', titleRow(o.title, o.help), o.sub ? el('p.sub', { text: o.sub }) : null), controls),
      box, tableBox, foot);
    let tableFn = null;
    function sync() {
      const on = o.id && tableMode.has(o.id);
      box.hidden = !!on; tableBox.hidden = !on;
      if (toggle) { toggle.textContent = on ? 'Chart' : 'Table'; toggle.setAttribute('aria-pressed', String(!!on)); }
      if (on && tableFn) { tableBox.textContent = ''; tableBox.appendChild(tableFn()); }
    }
    if (toggle) toggle.addEventListener('click', () => { if (tableMode.has(o.id)) tableMode.delete(o.id); else tableMode.add(o.id); sync(); });
    return {
      el: node, canvas, box, foot, tableBox, controls,
      setTable(fn) { tableFn = fn; sync(); },
      empty(msg) { box.textContent = ''; box.style.height = 'auto'; box.appendChild(el('p.empty-note', { text: msg })); },
    };
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  AID.ui = { el, append, select, seg, metricOptions, icon, statusChip, answerChip, table, card, titleRow, download };
})(window.AID);
