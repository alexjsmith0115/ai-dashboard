/* Chart.js wrappers that apply the dataviz mark specs (2px lines, ≤24px bars, 4px rounded ends, hairline grid). */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const registry = new Map(); // canvas -> Chart
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function theme() {
    return {
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css('--s' + i)),
      other: css('--other'), text: css('--text'), text2: css('--text-2'), muted: css('--muted'),
      grid: css('--grid'), axis: css('--axis'), surface: css('--surface'), border: css('--border'),
      divPos: css('--div-pos'), divNeg: css('--div-neg'), divMid: css('--div-mid'),
      ord: [css('--ord-1'), css('--ord-2'), css('--ord-3')],
      font: css('--font') || 'system-ui, sans-serif',
    };
  }

  function applyDefaults() {
    const t = theme();
    Chart.defaults.font.family = t.font;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = t.text2;
    Chart.defaults.borderColor = t.grid;
    Chart.defaults.animation = false;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.responsive = true;
  }

  function destroyAll() { for (const c of registry.values()) c.destroy(); registry.clear(); }
  function mount(canvas, config) {
    if (registry.has(canvas)) registry.get(canvas).destroy();
    const c = new Chart(canvas, config);
    registry.set(canvas, c);
    return c;
  }
  // Drop charts whose canvas left the DOM.
  function gc() { for (const [cv, c] of registry) if (!cv.isConnected) { c.destroy(); registry.delete(cv); } }

  // Stable color per entity: if the dimension has ≤ 8 values in the full dataset, color follows the name.
  function colorFor(name, idx, allNames) {
    const t = theme();
    if (name === AID.analysis.OTHER) return t.other;
    if (allNames && allNames.length <= 8) {
      const i = allNames.indexOf(name);
      if (i >= 0) return t.series[i];
    }
    return t.series[idx % 8];
  }

  // ---------- Plugins ----------
  const crosshair = {
    id: 'crosshair',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.enabled) return;
      const act = chart.tooltip && chart.tooltip.getActiveElements();
      if (!act || !act.length) return;
      const x = act[0].element.x, { top, bottom } = chart.chartArea, ctx = chart.ctx;
      ctx.save(); ctx.strokeStyle = theme().axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, bottom); ctx.stroke(); ctx.restore();
    },
  };

  // Vertical event markers, e.g. the AI rollout month. opts.items = [{index, label}]
  const markers = {
    id: 'markers',
    beforeDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.items || !opts.items.length) return;
      const t = theme(), ctx = chart.ctx, xs = chart.scales.x, { top, bottom } = chart.chartArea;
      ctx.save();
      for (const m of opts.items) {
        if (m.index == null || m.index < 0) continue;
        const x = Math.round(xs.getPixelForValue(m.index)) + 0.5;
        if (x < chart.chartArea.left || x > chart.chartArea.right) continue;
        ctx.strokeStyle = t.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.fillStyle = t.text2; ctx.font = '500 11px ' + t.font; ctx.textBaseline = 'top';
        const w = ctx.measureText(m.label).width;
        const lx = x + 5 + w > chart.chartArea.right ? x - 5 - w : x + 5;
        ctx.fillStyle = t.surface; ctx.fillRect(lx - 2, top + 1, w + 4, 15);
        ctx.fillStyle = t.text2; ctx.fillText(m.label, lx, top + 3);
      }
      ctx.restore();
    },
  };

  // Direct labels at line ends (≤ 4 series). Skipped when labels would collide.
  const endLabels = {
    id: 'endLabels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.enabled) return;
      const t = theme(), ctx = chart.ctx;
      const items = [];
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden || ds.isFit) return;
        for (let j = ds.data.length - 1; j >= 0; j--) {
          if (ds.data[j] != null) { const p = meta.data[j]; items.push({ y: p.y, x: p.x, text: ds.label, color: ds.borderColor }); break; }
        }
      });
      if (!items.length || items.length > 4) return;
      items.sort((a, b) => a.y - b.y);
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) return;
      ctx.save(); ctx.font = '500 11px ' + t.font; ctx.textBaseline = 'middle';
      for (const it of items) {
        ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(it.x, it.y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = t.text2; ctx.fillText(it.text, it.x + 8, it.y);
      }
      ctx.restore();
    },
  };

  // Value labels at bar tips. opts.format(value, index) -> string
  const barLabels = {
    id: 'barLabels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.format) return;
      const t = theme(), ctx = chart.ctx, horiz = chart.options.indexAxis === 'y';
      ctx.save(); ctx.font = '500 11px ' + t.font; ctx.fillStyle = t.text2;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v == null) return;
          const s = opts.format(v, i);
          if (!s) return;
          if (horiz) {
            ctx.textBaseline = 'middle';
            const neg = v < 0;
            ctx.textAlign = neg ? 'right' : 'left';
            ctx.fillText(s, bar.x + (neg ? -6 : 6), bar.y);
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = v < 0 ? 'top' : 'bottom';
            ctx.fillText(s, bar.x, bar.y + (v < 0 ? 4 : -4));
          }
        });
      });
      ctx.restore();
    },
  };

  // Text labels next to selected scatter points. opts.items = [{datasetIndex, index, text}]
  const pointLabels = {
    id: 'pointLabels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.items || !opts.items.length) return;
      const t = theme(), ctx = chart.ctx;
      ctx.save(); ctx.font = '500 11px ' + t.font; ctx.fillStyle = t.text2; ctx.textBaseline = 'middle';
      const placed = []; // drawn label boxes; a label that would overlap one is skipped (tooltip still has it)
      const hits = (b) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
      for (const it of opts.items) {
        const p = chart.getDatasetMeta(it.datasetIndex).data[it.index];
        if (!p) continue;
        const w = ctx.measureText(it.text).width;
        const left = p.x + 8 + w > chart.chartArea.right;
        const x0 = left ? p.x - 8 - w : p.x + 8;
        const box = { x0: x0 - 2, x1: x0 + w + 2, y0: p.y - 8, y1: p.y + 8 };
        if (hits(box)) continue;
        placed.push(box);
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(it.text, p.x + (left ? -8 : 8), p.y);
      }
      ctx.restore();
    },
  };

  let registered = false;
  function ensure() {
    if (registered) return;
    Chart.register(crosshair, markers, endLabels, barLabels, pointLabels);
    registered = true;
  }

  function tooltip(t, extra) {
    return Object.assign({
      backgroundColor: t.surface, borderColor: t.axis, borderWidth: 1, titleColor: t.text2, bodyColor: t.text,
      footerColor: t.muted, titleFont: { weight: '500' }, bodyFont: { weight: '600' }, footerFont: { weight: '400', size: 11 },
      padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true, caretSize: 0, displayColors: true,
    }, extra || {});
  }

  function axisCommon(t) {
    return {
      grid: { color: t.grid, drawTicks: false, lineWidth: 1 },
      border: { display: false },
      ticks: { color: t.muted, padding: 6 },
    };
  }

  // ---------- Line chart ----------
  // o: {labels, series:[{name, values, color, counts?}], unit, marker, yZero, pctAxis(0..1 values), title}
  function line(canvas, o) {
    ensure();
    const t = theme();
    const fmtY = o.pctAxis ? (v) => Math.round(v * 100) + '%' : (v) => AID.fmt.value(v, o.unit, { short: true });
    const n = o.series.length;
    const cfg = {
      type: 'line',
      data: {
        labels: o.labels,
        datasets: o.series.map((s) => ({
          label: s.name, data: s.values, borderColor: s.color, backgroundColor: s.color,
          borderWidth: s.isOther ? 1.5 : 2, borderDash: s.dash || undefined, pointRadius: 0, pointHoverRadius: 4.5, pointHoverBorderWidth: 2,
          pointHoverBorderColor: t.surface, spanGaps: true, tension: 0.25, cubicInterpolationMode: 'monotone', counts: s.counts,
        })),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { right: o.endLabels && n <= 4 ? 110 : 8, top: 4 } },
        scales: {
          x: Object.assign(axisCommon(t), { grid: { display: false }, border: { display: true, color: t.axis }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 14 } }),
          y: Object.assign(axisCommon(t), { beginAtZero: o.yZero !== false, ticks: { color: t.muted, padding: 6, maxTicksLimit: 6, callback: fmtY } }),
        },
        plugins: {
          legend: legend(t, n > 1, 'line'),
          tooltip: tooltip(t, {
            itemSort: (a, b) => (b.raw ?? -Infinity) - (a.raw ?? -Infinity),
            callbacks: {
              title: (items) => (o.xTitle ? o.xTitle(items[0].dataIndex) : items[0].label),
              label: (c) => (c.raw == null ? null : fmtY(c.raw) + '   ' + c.dataset.label + (c.dataset.counts && o.showN ? '  (n=' + c.dataset.counts[c.dataIndex] + ')' : '')),
              labelPointStyle: () => ({ pointStyle: 'line', rotation: 0 }),
            },
          }),
          crosshair: { enabled: true },
          markers: { items: o.marker ? [o.marker] : [] },
          endLabels: { enabled: !!o.endLabels },
        },
      },
    };
    if (o.unit === 'pct' && !o.pctAxis) cfg.options.scales.y.ticks.callback = (v) => v + '%';
    return mount(canvas, cfg);
  }

  function legend(t, show, style) {
    return {
      display: show, position: 'top', align: 'start',
      labels: {
        color: t.text2, usePointStyle: style !== 'line', pointStyle: 'rectRounded', padding: 14, font: { size: 12 },
        boxWidth: style === 'line' ? 16 : 10, boxHeight: style === 'line' ? 2 : 10,
        // Line legends: a short 2px stroke in the series color (no box).
        generateLabels: style === 'line' ? (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((l) => Object.assign(l, { fillStyle: l.strokeStyle, lineWidth: 0 })) : undefined,
      },
    };
  }

  // ---------- Bar chart (single series, vertical or horizontal) ----------
  // o: {labels, values, colors (array or string), horizontal, unit, valueFmt, axisFmt, tooltipLines(i) -> [strings], zeroLine}
  function bars(canvas, o) {
    ensure();
    const t = theme();
    const horiz = !!o.horizontal;
    const axisFmt = o.axisFmt || ((v) => AID.fmt.value(v, o.unit, { short: true }));
    const valueAxis = Object.assign(axisCommon(t), {
      beginAtZero: true,
      ticks: { color: t.muted, maxTicksLimit: 6, callback: axisFmt },
      grid: { color: (c) => (c.tick && c.tick.value === 0 ? t.axis : t.grid), drawTicks: false },
      grace: o.grace || '12%',
    });
    const catAxis = Object.assign(axisCommon(t), { grid: { display: false }, border: { display: !horiz, color: t.axis }, ticks: { color: t.text2, autoSkip: false, maxRotation: 0 } });
    const cfg = {
      type: 'bar',
      data: {
        labels: o.labels,
        datasets: [{
          label: o.name || '', data: o.values, backgroundColor: o.colors, hoverBackgroundColor: o.colors,
          borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, categoryPercentage: 0.8, barPercentage: 0.9,
        }],
      },
      options: {
        indexAxis: horiz ? 'y' : 'x',
        layout: { padding: { right: horiz ? 8 : 0, top: 4 } },
        scales: horiz ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
        plugins: {
          legend: { display: false },
          tooltip: tooltip(t, {
            displayColors: false,
            callbacks: {
              label: (c) => (o.valueFmt ? o.valueFmt(c.raw, c.dataIndex) : axisFmt(c.raw)),
              afterLabel: (c) => (o.tooltipLines ? o.tooltipLines(c.dataIndex) : null),
            },
          }),
          barLabels: o.labels.length <= 40 ? { format: o.valueFmt || axisFmt } : {},
        },
        onHover: (e, els) => { e.native.target.style.cursor = els.length && o.onClick ? 'pointer' : 'default'; },
        onClick: o.onClick ? (e, els) => { if (els.length) o.onClick(els[0].index); } : undefined,
      },
    };
    return mount(canvas, cfg);
  }

  // ---------- Stacked bars ----------
  // o: {labels, series:[{name, values, color}], unit, percent}
  function stacked(canvas, o) {
    ensure();
    const t = theme();
    const fmtV = o.percent ? (v) => Math.round(v) + '%' : (v) => AID.fmt.value(v, o.unit, { short: true });
    const cfg = {
      type: 'bar',
      data: {
        labels: o.labels,
        datasets: o.series.map((s) => ({
          label: s.name, data: s.values, backgroundColor: s.color, hoverBackgroundColor: s.color,
          borderColor: t.surface, borderWidth: { top: 2, bottom: 0, left: 1, right: 1 }, borderSkipped: false, maxBarThickness: 24,
          categoryPercentage: 0.85, barPercentage: 0.92,
        })),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: Object.assign(axisCommon(t), { stacked: true, grid: { display: false }, border: { display: true, color: t.axis }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 14 } }),
          y: Object.assign(axisCommon(t), { stacked: true, beginAtZero: true, max: o.percent ? 100 : undefined, ticks: { color: t.muted, maxTicksLimit: 6, callback: fmtV } }),
        },
        plugins: {
          legend: legend(t, true, 'rect'),
          tooltip: tooltip(t, {
            itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
            callbacks: { label: (c) => fmtV(c.raw) + '   ' + c.dataset.label, labelPointStyle: () => ({ pointStyle: 'rectRounded', rotation: 0 }) },
          }),
        },
      },
    };
    return mount(canvas, cfg);
  }

  // ---------- Scatter ----------
  // o: {datasets:[{name, points:[{x,y,...}], color}], xUnit, yUnit, xLabel, yLabel, fit:{slope, intercept, x0, x1}, label(pt)->[lines], pointLabels, radius}
  function scatter(canvas, o) {
    ensure();
    const t = theme();
    const fx = (v) => AID.fmt.value(v, o.xUnit, { short: true }), fy = (v) => AID.fmt.value(v, o.yUnit, { short: true });
    const r = o.radius || 4;
    const datasets = o.datasets.map((d) => ({
      label: d.name, data: d.points, backgroundColor: hexA(d.color, o.alpha != null ? o.alpha : 0.75), borderColor: t.surface, borderWidth: r > 3 ? 1.5 : 0.5,
      pointRadius: r, pointHoverRadius: r + 2, pointHoverBorderWidth: 2, pointHitRadius: 6, pointHoverBackgroundColor: d.color,
    }));
    if (o.fit) {
      datasets.push({
        type: 'line', label: 'Trend', isFit: true, data: [{ x: o.fit.x0, y: o.fit.intercept + o.fit.slope * o.fit.x0 }, { x: o.fit.x1, y: o.fit.intercept + o.fit.slope * o.fit.x1 }],
        borderColor: t.text2, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0,
      });
    }
    const cfg = {
      type: 'scatter',
      data: { datasets },
      options: {
        interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
        layout: { padding: { top: 4, right: 8 } },
        scales: {
          x: Object.assign(axisCommon(t), { beginAtZero: !!o.xZero, title: { display: !!o.xLabel, text: o.xLabel, color: t.muted }, ticks: { color: t.muted, maxTicksLimit: 7, callback: fx }, grid: { color: (c) => (c.tick && c.tick.value === 0 && o.zeroLines ? t.axis : t.grid), drawTicks: false } }),
          y: Object.assign(axisCommon(t), { beginAtZero: !!o.yZero, title: { display: !!o.yLabel, text: o.yLabel, color: t.muted }, ticks: { color: t.muted, maxTicksLimit: 6, callback: fy }, grid: { color: (c) => (c.tick && c.tick.value === 0 && o.zeroLines ? t.axis : t.grid), drawTicks: false } }),
        },
        plugins: {
          legend: Object.assign(legend(t, o.datasets.length > 1, 'circle'), { labels: Object.assign(legend(t, true, 'circle').labels, { pointStyle: 'circle', boxWidth: 8, boxHeight: 8, filter: (it, data) => !data.datasets[it.datasetIndex].isFit }) }),
          tooltip: tooltip(t, {
            filter: (c) => !c.dataset.isFit,
            callbacks: {
              title: (items) => (o.title ? o.title(items[0].raw) : ''),
              label: (c) => (o.label ? o.label(c.raw) : fx(c.raw.x) + ', ' + fy(c.raw.y)),
              labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
            },
          }),
          pointLabels: { items: o.pointLabels || [] },
        },
      },
    };
    return mount(canvas, cfg);
  }

  // ---------- Colors ----------
  function hexToRgb(h) {
    const s = h.replace('#', '');
    const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function hexA(h, a) { if (!h || h[0] !== '#') return h; const [r, g, b] = hexToRgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
  function mix(a, b, w) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + A.map((x, i) => Math.round(x + (B[i] - x) * w)).join(',') + ')';
  }
  // v in [-1, 1] -> diverging color (neg pole … gray mid … pos pole). Returns {bg, fg}.
  function diverging(v) {
    const t = theme();
    if (v == null || !isFinite(v)) return { bg: 'transparent', fg: t.muted };
    const w = Math.min(1, Math.abs(v));
    const bg = mix(t.divMid, v >= 0 ? t.divPos : t.divNeg, Math.pow(w, 0.85));
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return { bg, fg: lum > 0.55 ? '#0b0b0b' : '#ffffff' };
  }

  // Sparkline SVG: values array, highlights last point. markerIndex draws a hairline.
  function sparkline(values, opts) {
    const o = opts || {};
    const t = theme();
    const ns = 'http://www.w3.org/2000/svg';
    const W = 200, H = 34, pad = 4;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    const pts = values.map((v, i) => [i, v]).filter((p) => p[1] != null && isFinite(p[1]));
    if (pts.length < 2) return svg;
    const ys = pts.map((p) => p[1]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (o.zero) lo = Math.min(0, lo);
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = (i) => pad + (i / (values.length - 1)) * (W - 2 * pad);
    const Y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
    if (o.markerIndex != null && o.markerIndex >= 0 && o.markerIndex < values.length) {
      const m = document.createElementNS(ns, 'line');
      m.setAttribute('x1', X(o.markerIndex)); m.setAttribute('x2', X(o.markerIndex)); m.setAttribute('y1', 0); m.setAttribute('y2', H);
      m.setAttribute('stroke', t.axis); m.setAttribute('stroke-width', '1'); m.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(m);
    }
    const path = document.createElementNS(ns, 'polyline');
    path.setAttribute('points', pts.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' '));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', o.color || t.muted); path.setAttribute('stroke-width', '1.5');
    path.setAttribute('vector-effect', 'non-scaling-stroke'); path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  AID.charts = { theme, applyDefaults, destroyAll, gc, colorFor, line, bars, stacked, scatter, diverging, hexA, mix, sparkline };
})(window.AID);
