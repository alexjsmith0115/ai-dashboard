/* Executive summary: "Are developers more productive since AI adoption?" and "Which groups are most impacted?" */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el, select, seg, statusChip, answerChip, table, card, icon } = AID.ui;
  const F = AID.fmt;

  const HEADLINE_OPTIONS = ['prsMerged', 'throughput', 'storyPoints', 'thoughputWithSubtasks', 'medianCycleDays', 'medianTimeToMergeHours', 'prsOpened'];
  const GROUP_LEVELS = [{ value: 'org', label: 'Org' }, { value: 'domain', label: 'Domain' }, { value: 'team', label: 'Team' }, { value: 'level', label: 'Job level' }];
  const BAR_LIMIT = 20;

  function perDevLabel(key) {
    const m = AID.M[key];
    return m.unit === 'count' ? m.label + ' per developer per month' : m.label + ' (average per developer)';
  }
  function windowText(w) { return w ? AID.data.monthLabel(w[0], true) + ' – ' + AID.data.monthLabel(w[1], true) : 'none'; }
  function ciText(c) { return c && c.lo != null ? '95% CI ' + F.pct(c.lo) + ' to ' + F.pct(c.hi) : ''; }
  // Color for a change bar: blue = better, red = worse; pale when not statistically clear or low sample.
  function changeColor(c, t) {
    const pole = c.score >= 0 ? t.divPos : t.divNeg;
    return c.sig && !c.lowSample ? pole : AID.charts.mix(pole, t.divMid, 0.55);
  }

  function render(root, ctx, app) {
    const st = app.state.exec;
    const metric = st.metric;
    const meta = AID.M[metric];
    const t = AID.charts.theme();
    const page = el('div.page');
    root.appendChild(page);

    const head = ctx.compare(metric);
    const keyRes = AID.KEY_PRODUCTIVITY.map((k) => ctx.compare(k));
    const quality = ctx.compare(AID.QUALITY_GUARDRAIL);
    const tiers = ctx.TIERS.map((tier) => {
      const list = ctx.devs.filter((d) => ctx.tierOf(d) === tier);
      return Object.assign(ctx.compare(metric, list), { tier, devCount: list.length });
    });

    page.appendChild(el('div.section-head',
      el('h2', { text: 'Executive summary' }),
      el('div', { style: { marginLeft: 'auto' } }, select('Headline metric', AID.ui.metricOptions(HEADLINE_OPTIONS), metric, (v) => app.update({ exec: { metric: v } })))));

    page.appendChild(verdictCard(ctx, head, keyRes, quality, tiers, metric));
    page.appendChild(kpiGrid(ctx, keyRes, quality));

    // ---- Trends ----
    const grid = el('div.grid-2');
    page.appendChild(grid);
    grid.appendChild(adoptionCard(ctx, t));
    grid.appendChild(headlineTrendCard(ctx, metric, t));

    // ---- Groups ----
    page.appendChild(groupsSection(ctx, app, metric, meta, t));
    page.appendChild(crossSection(ctx, app, metric, meta, t));

    page.appendChild(el('p.card-foot', { text: 'Correlation is not causation. Before/after changes also include seasonality, re-orgs, and process changes. The usage-level comparison (heavy AI users vs non-adopters over the same months) is the best guide to how much of a change comes from AI.' }));
  }

  // ---------------- Verdict ----------------
  function verdictCard(ctx, head, keyRes, quality, tiers, metric) {
    const meta = AID.M[metric];
    const improved = keyRes.filter((c) => c.status === 'improved').length;
    const worse = keyRes.filter((c) => c.status === 'worse').length;
    const k = keyRes.filter((c) => c.status !== 'nodata').length;

    let kind, word;
    if (head.status === 'nodata' || !k) { kind = 'none'; word = 'Not enough data'; }
    else if (head.status === 'improved' && improved >= Math.ceil(k / 2)) { kind = 'yes'; word = 'Yes'; }
    else if (worse > improved || head.status === 'worse') { kind = 'no'; word = 'No'; }
    else if (improved > 0) { kind = 'mixed'; word = 'Partly'; }
    else { kind = 'none'; word = 'Not yet'; }

    const left = el('div',
      el('p.verdict-q', { text: 'Are we seeing improvements in developer productivity since the adoption of AI?' }),
      el('div.verdict-answer', answerChip(kind, word)),
      el('div.hero-row',
        el('div.hero', { text: head.pct != null ? F.pct(head.pct) : '—' }),
        el('div.hero-label', perDevLabel(metric), el('div', { style: { color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }, text: head.pct != null ? F.metric(head.before, metric) + ' → ' + F.metric(head.after, metric) + ' · ' + ciText(head) : '' }))));

    const parts = [];
    if (k) {
      parts.push(el('strong', { text: improved + ' of ' + k }), ' core productivity metrics improved');
      parts.push(worse ? [', ', el('strong', { text: String(worse) }), ' got worse. '] : ' and none got worse. ');
    }
    if (quality.status !== 'nodata') {
      const q = quality.status === 'worse' ? 'got worse' : quality.status === 'improved' ? 'improved' : 'held steady';
      parts.push('Quality (reopen rate) ', el('strong', { text: q }), ' (' + F.pct(quality.pct) + '). ');
    }
    // Compare heavy users with non-adopters; fall back to light users when there are too few non-adopters.
    const lo = tiers[0].n >= AID.analysis.MIN_GROUP_DEVS ? tiers[0] : tiers[1], hi = tiers[3];
    if (lo.pct != null && hi.pct != null) {
      const gap = hi.score - lo.score;
      const loName = lo === tiers[0] ? 'non-adopters' : 'light users';
      parts.push('Heavy AI users changed ', el('strong', { text: F.pct(hi.pct) }), ' vs ', el('strong', { text: F.pct(lo.pct) }),
        ' for ' + loName + ' over the same period — ', gap > 0.02 ? 'a sign that AI drives part of the change.' : gap < -0.02 ? 'so AI is not the likely cause.' : 'too small a gap to credit AI.');
    }
    left.appendChild(el('p.verdict-text', parts));

    const modeText = ctx.perDev
      ? 'Each developer is split at their own adoption month (first month with ' + ctx.thr + '+ Cursor active days). Non-adopters split at the median adoption month.'
      : 'Split at the company rollout month, ' + AID.data.monthLabel(ctx.rolloutIdx, true) + (ctx.state.settings.rollout ? '' : ' (auto-detected)') + '.';
    left.appendChild(el('p.method-note', {
      text: modeText + (ctx.ramp ? ' ' + ctx.ramp + ' ramp-up month(s) excluded.' : '') + ' Before: ' + windowText(ctx.beforeWindow) + '. After: ' + windowText(ctx.afterWindow) + '. ' +
        head.n + ' developers have ' + AID.analysis.MIN_MONTHS_PER_SIDE + '+ months on both sides; each is compared with their own baseline.',
    }));

    // Right side: change by AI usage tier
    const maxAbs = Math.max(0.01, ...tiers.map((x) => Math.abs(x.score || 0)));
    const t = AID.charts.theme();
    const rows = tiers.map((x, i) => {
      const w = x.score != null ? (Math.abs(x.score) / maxAbs) * 100 : 0;
      const bar = el('div', { style: { height: '8px', borderRadius: '4px', width: Math.max(2, w) + '%', background: t.tiers[i], marginTop: '5px' } });
      return el('div.score-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
        el('div', el('div.name', { text: x.tier }), el('div', { style: { fontSize: '11px', color: 'var(--muted)' }, text: x.n + ' developers' }), bar),
        el('div.val', { text: x.pct != null ? F.pct(x.pct) : '—' }));
    });
    const right = el('div.verdict-side',
      el('p.verdict-q', { text: 'Change in ' + meta.short + ' by AI usage level' }),
      el('div.scorecard', rows),
      el('p.method-note', { text: 'Usage level = average Cursor active days per month in the after period.' }));

    return el('section.card.verdict', left, right);
  }

  // ---------------- KPI tiles ----------------
  function kpiGrid(ctx, keyRes, quality) {
    const grid = el('div.kpi-grid');
    const t = AID.charts.theme();
    const adopt = ctx.adoptionSeries();
    const lastI = lastIndex(adopt.active);
    const markerIdx = ctx.perDev ? null : ctx.months.indexOf(ctx.rolloutIdx);

    // Adoption tile
    grid.appendChild(tile('AI adoption', 'Cursor', lastI >= 0 ? Math.round(adopt.active[lastI] * 100) + '%' : '—', 'active',
      [el('span', { text: 'used Cursor ' + ctx.thr + '+ days in ' + (lastI >= 0 ? AID.data.monthLabel(adopt.xs[lastI], true) : '—') })],
      AID.charts.sparkline(adopt.active, { color: t.series[0], markerIndex: markerIdx, zero: true })));

    // Spend tile
    const spend = ctx.series('spendDollars', { agg: 'mean' }).series[0];
    const sLast = spend ? lastIndex(spend.values) : -1;
    const cpp = ctx.series('costPerMergedPr', { agg: 'mean' }).series[0];
    grid.appendChild(tile('Cursor spend', 'Cursor', sLast >= 0 ? F.value(spend.values[sLast], 'usd') : '—', '/ dev / mo',
      [el('span', { text: 'Cost per merged PR: ' + (cpp && lastIndex(cpp.values) >= 0 ? F.value(cpp.values[lastIndex(cpp.values)], 'usd') : '—') })],
      spend ? AID.charts.sparkline(spend.values, { markerIndex: markerIdx, zero: true }) : null));

    for (const c of keyRes.concat([quality])) {
      const m = AID.M[c.key];
      const s = ctx.series(c.key, { agg: 'mean' }).series[0];
      const unit = m.unit === 'count' ? '/ dev / mo' : '';
      const value = c.after != null ? F.metric(c.after, c.key, { short: m.unit !== 'count' }) : '—';
      grid.appendChild(tile(m.label, m.source, value, unit,
        [statusChip(c), el('span', { text: c.pct != null ? F.pct(c.pct) + ' vs ' + F.metric(c.before, c.key, { short: true }) : 'Not enough data' })],
        s ? AID.charts.sparkline(s.values, { markerIndex: markerIdx }) : null,
        m.desc ? m.desc + (c.lo != null ? ' ' + ciText(c) + '.' : '') : ciText(c)));
    }
    return grid;
  }

  function tile(label, src, value, unit, meta, spark, title) {
    return el('div.card.kpi', { title: title || null },
      el('div.kpi-label', el('span', { text: label }), el('span.src', { text: src })),
      el('div.kpi-value', value, unit ? el('span.unit', { text: unit }) : null),
      el('div.kpi-meta', meta),
      el('div.kpi-spark', spark));
  }
  function lastIndex(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }

  // ---------------- Trend cards ----------------
  function adoptionCard(ctx, t) {
    const a = ctx.adoptionSeries();
    const c = card({ id: 'exec-adoption', title: 'AI adoption over time', sub: 'Share of developers using Cursor in each month.', height: 260 });
    const markerIdx = ctx.perDev ? -1 : ctx.months.indexOf(ctx.rolloutIdx);
    const series = [
      { name: 'Active (' + ctx.thr + '+ days)', values: a.active, color: t.series[0] },
      { name: 'Heavy (' + ctx.hi + '+ days)', values: a.high, color: t.series[1] },
    ];
    queueMicrotask(() => AID.charts.line(c.canvas, { labels: a.labels, series, pctAxis: true, marker: markerIdx >= 0 ? { index: markerIdx, label: 'AI rollout' } : null, endLabels: true }));
    c.setTable(() => table(
      [{ label: 'Month', value: (r) => r.i, format: (v) => a.labels[v], sortValue: (r) => r.i }, { label: 'Developers', num: true, value: (r) => a.n[r.i] },
        { label: series[0].name, num: true, value: (r) => a.active[r.i], format: (v) => (v == null ? '—' : Math.round(v * 100) + '%') },
        { label: series[1].name, num: true, value: (r) => a.high[r.i], format: (v) => (v == null ? '—' : Math.round(v * 100) + '%') }],
      a.xs.map((_, i) => ({ i })), { sortCol: 0, sortDir: 1 }));
    return c.el;
  }

  function headlineTrendCard(ctx, metric, t) {
    const meta = AID.M[metric];
    const rel = ctx.perDev;
    const s = ctx.series(metric, { groupKey: 'tier', xMode: rel ? 'relative' : 'calendar' });
    const c = card({
      id: 'exec-trend', height: 260,
      title: meta.label + ' by AI usage level',
      sub: (rel ? 'Months before and after each developer adopted AI. ' : 'Average per developer per month. ') + 'If AI drives the change, the heavy-usage line pulls away from the non-adopter line after adoption.',
    });
    const tierColor = (name) => { const i = ctx.TIERS.indexOf(name); return i >= 0 ? t.tiers[i] : t.other; };
    const series = s.series.filter((x) => x.name !== 'No data').map((x) => Object.assign(x, { color: tierColor(x.name) }));
    const markerIdx = rel ? s.xs.indexOf(0) : s.xs.indexOf(ctx.rolloutIdx);
    queueMicrotask(() => AID.charts.line(c.canvas, {
      labels: s.labels, series, unit: meta.unit, yZero: meta.unit === 'count', endLabels: true, showN: true,
      marker: markerIdx >= 0 ? { index: markerIdx, label: rel ? 'Adoption' : 'AI rollout' } : null,
      xTitle: rel ? (i) => 'Month ' + s.labels[i] + ' vs adoption' : null,
    }));
    c.setTable(() => seriesTable(s.labels, series, metric, rel ? 'Months since adoption' : 'Month'));
    return c.el;
  }

  function seriesTable(labels, series, metric, xName) {
    const cols = [{ label: xName, value: (r) => r, format: (v) => labels[v] }].concat(series.map((s) => ({
      label: s.name, num: true, value: (r) => s.values[r], format: (v) => F.metric(v, metric),
    })));
    return table(cols, labels.map((_, i) => i), { sortCol: 0, sortDir: 1 });
  }

  // ---------------- Groups ----------------
  function groupsSection(ctx, app, metric, meta, t) {
    const st = app.state.exec;
    const level = st.groupBy;
    const levelLabel = GROUP_LEVELS.find((g) => g.value === level).label.toLowerCase();
    const wrap = el('div.page');
    wrap.appendChild(el('div.section-head',
      el('h2', { text: 'Which groups are most impacted by AI?' }),
      el('div', { style: { marginLeft: 'auto' } }, seg('Group level', GROUP_LEVELS, level, (v) => app.update({ exec: { groupBy: v } })))));

    const rows = ctx.compareByGroup(metric, level).filter((r) => r.pct != null);
    if (!rows.length) { wrap.appendChild(el('div.card', el('p.empty-note', { text: 'Not enough before/after data for these groups.' }))); return wrap; }
    rows.sort((a, b) => b.score - a.score);
    const reliable = rows.filter((r) => !r.lowSample);

    // Insights
    const ins = el('ul.insights');
    const best = reliable[0], worst = reliable[reliable.length - 1];
    if (best) ins.appendChild(el('li', el('span', 'Largest improvement: ', el('strong', { text: best.group }), ' (' + F.pct(best.pct) + ', ' + Math.round((best.adoption || 0) * 100) + '% adoption).')));
    if (worst && worst !== best) ins.appendChild(el('li', el('span', 'Smallest change: ', el('strong', { text: worst.group }), ' (' + F.pct(worst.pct) + ', ' + Math.round((worst.adoption || 0) * 100) + '% adoption).')));
    const xs = reliable.map((r) => r.adoption), ys = reliable.map((r) => r.score);
    const corr = reliable.length >= 4 ? AID.analysis.correlate(xs, ys, 'pearson') : { r: null };
    if (corr.r != null) {
      const s = Math.abs(corr.r) >= 0.5 ? 'strongly' : Math.abs(corr.r) >= 0.3 ? 'moderately' : 'weakly';
      ins.appendChild(el('li', el('span', 'Across ' + levelLabel + 's, adoption and improvement are ', el('strong', { text: s + (corr.r >= 0 ? ' linked' : ' inversely linked') }), ' (r = ' + corr.r.toFixed(2) + '). ' +
        (corr.r >= 0.3 ? 'Groups that use AI more improved more.' : corr.r <= -0.3 ? 'Higher adoption did not bring larger gains.' : 'Adoption alone does not explain the differences.'))));
    }
    const small = rows.length - reliable.length;
    if (small) ins.appendChild(el('li', el('span', { text: small + ' ' + levelLabel + (small > 1 ? 's have' : ' has') + ' fewer than ' + AID.analysis.MIN_GROUP_DEVS + ' developers with before/after data. They are left out of the chart and ranking, and shown pale in the table.' })));
    wrap.appendChild(el('div.card', el('h3', { text: 'Key findings', style: { fontSize: '15px', marginBottom: '10px' } }), ins));

    const grid = el('div.grid-3-2');
    wrap.appendChild(grid);

    // Ranked diverging bars
    const ranked = reliable.length ? reliable : rows;
    let shown = ranked, note = '';
    if (ranked.length > BAR_LIMIT) {
      shown = ranked.slice(0, BAR_LIMIT / 2).concat(ranked.slice(-BAR_LIMIT / 2));
      note = 'Showing the top ' + BAR_LIMIT / 2 + ' and bottom ' + BAR_LIMIT / 2 + ' of ' + ranked.length + ' ' + levelLabel + 's. The table below lists all of them.';
    }
    const barCard = card({
      id: 'exec-groups', height: Math.max(180, shown.length * 26 + 50),
      title: 'Change in ' + meta.short + ' by ' + levelLabel,
      sub: 'Blue = better, red = worse. Pale bars are not statistically clear (the 95% confidence interval includes zero).',
    });
    grid.appendChild(barCard.el);
    if (note) barCard.foot.textContent = note;
    queueMicrotask(() => AID.charts.bars(barCard.canvas, {
      labels: shown.map((r) => r.group), values: shown.map((r) => r.pct), horizontal: true,
      colors: shown.map((r) => changeColor(r, t)), axisFmt: (v) => Math.round(v * 100) + '%', valueFmt: (v) => F.pct(v, 0),
      tooltipLines: (i) => { const r = shown[i]; return [F.metric(r.before, metric) + ' → ' + F.metric(r.after, metric), ciText(r), r.n + ' developers · ' + Math.round((r.adoption || 0) * 100) + '% adoption']; },
    }));
    barCard.setTable(() => groupTable(rows, metric, level));

    // Adoption vs impact scatter
    const sc = card({ id: 'exec-adopt-impact', height: Math.min(Math.max(260, shown.length * 26 + 50), 420), title: 'Adoption vs impact', sub: 'Each dot is a ' + levelLabel + '. Up and to the right = high adoption and a large improvement.' });
    grid.appendChild(sc.el);
    const pts = reliable.map((r) => ({ x: r.adoption * 100, y: r.score * 100, r }));
    const labelIdx = new Set(pts.length <= 8 ? pts.map((_, i) => i) : [0, 1, 2, pts.length - 1, pts.length - 2]);
    const fit = pts.length >= 4 ? AID.analysis.linearFit(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
    queueMicrotask(() => AID.charts.scatter(sc.canvas, {
      datasets: [{ name: levelLabel, points: pts, color: t.series[0] }], radius: 5, alpha: 0.85, zeroLines: true,
      xUnit: 'pct', yUnit: 'pct', xLabel: 'Adoption (share of months active)', yLabel: 'Improvement in ' + meta.short,
      fit: fit ? Object.assign(fit, { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)) }) : null,
      title: (p) => p.r.group,
      label: (p) => ['Adoption ' + Math.round(p.x) + '%', meta.short + ' ' + F.pct(p.r.pct), p.r.n + ' developers'],
      pointLabels: [...labelIdx].map((i) => ({ datasetIndex: 0, index: i, text: pts[i].r.group })),
    }));
    sc.setTable(() => groupTable(rows, metric, level));

    // Full table
    wrap.appendChild(el('div.card',
      el('div.card-head', el('div', el('h3', { text: 'All ' + levelLabel + 's' }), el('p.sub', { text: 'Click a column header to sort. Change = average per-developer change vs their own baseline.' }))),
      groupTable(rows, metric, level)));
    return wrap;
  }

  function groupTable(rows, metric, level) {
    const cols = [{ label: GROUP_LEVELS.find((g) => g.value === level).label, value: (r) => r.group }];
    if (level === 'team') cols.push({ label: 'Domain', value: (r) => r.parent }, { label: 'Manager', value: (r) => r.manager });
    if (level === 'domain') cols.push({ label: 'Org', value: (r) => r.parent });
    cols.push(
      { label: 'Developers', num: true, value: (r) => r.n, title: 'Developers with enough months before and after' },
      { label: 'Adoption', num: true, value: (r) => r.adoption, format: (v) => (v == null ? '—' : Math.round(v * 100) + '%') },
      { label: 'Avg active days', num: true, value: (r) => r.avgActiveDays, format: (v) => F.value(v, 'count') },
      { label: 'Before', num: true, value: (r) => r.before, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'After', num: true, value: (r) => r.after, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'Change', num: true, value: (r) => r.pct, sortValue: (r) => r.score, format: (v) => F.pct(v) },
      { label: '95% CI', num: true, value: (r) => r.lo, format: (v, r) => (r.lo == null ? '—' : F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0)) },
      { label: 'Status', value: (r) => r.status, cell: (r) => (r.lowSample ? el('span.chip', icon('warn'), 'Small sample') : statusChip(r)) });
    return table(cols, rows, { sortCol: cols.findIndex((c) => c.label === 'Change'), sortDir: -1, rowClass: (r) => (r.lowSample ? 'muted' : '') });
  }

  // ---------------- Dimension × AI usage tier ----------------
  const CROSS_DIMS = [{ value: 'level', label: 'Job level' }, { value: 'org', label: 'Org' }];
  const CROSS_MODES = [{ value: 'change', label: 'Change' }, { value: 'lift', label: 'Lift vs non-adopters' }];
  const fmtPts0 = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v * 100) + ' pts');

  function crossSection(ctx, app, metric, meta, t) {
    const st = app.state.exec;
    const dim = st.crossBy, lift = st.crossMode === 'lift';
    const dimLabel = CROSS_DIMS.find((d) => d.value === dim).label;
    const data = ctx.compareCross(metric, dim);
    const wrap = el('div.page');
    wrap.appendChild(el('div.section-head',
      el('h2', { text: 'Impact by ' + dimLabel.toLowerCase() + ' and AI usage' }),
      el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        seg('Rows', CROSS_DIMS, dim, (v) => app.update({ exec: { crossBy: v } })),
        seg('Measure', CROSS_MODES, st.crossMode, (v) => app.update({ exec: { crossMode: v } })))));
    if (!data.length) { wrap.appendChild(el('div.card', el('p.empty-note', { text: 'Not enough before/after data.' }))); return wrap; }

    // Findings: heavy users vs non-adopters in each row.
    const ins = el('ul.insights');
    const pairs = data.map((r) => ({ row: r.row, heavy: r.cells[3], none: r.cells[0] })).filter((x) => x.heavy.lift != null);
    for (const x of pairs) {
      const dir = x.heavy.lift >= 0 ? 'better' : 'worse';
      ins.appendChild(el('li', el('span', el('strong', { text: x.row }), ': heavy users ' + F.pct(x.heavy.pct) + ' vs ' + F.pct(x.none.pct) + ' for non-adopters → ',
        el('strong', { text: fmtPts0(Math.abs(x.heavy.lift)).replace('+', '') + ' ' + dir }),
        x.heavy.liftSig ? ' (95% CI ' + fmtPts0(x.heavy.liftLo) + ' to ' + fmtPts0(x.heavy.liftHi) + ').' : ' (not statistically clear).')));
    }
    if (pairs.length >= 2) {
      const sorted = pairs.slice().sort((a, b) => b.heavy.lift - a.heavy.lift);
      ins.appendChild(el('li', el('span', 'The apparent AI effect is largest for ', el('strong', { text: sorted[0].row }), ' and smallest for ', el('strong', { text: sorted[sorted.length - 1].row }), '.')));
    }
    if (!pairs.length) ins.appendChild(el('li', el('span', { text: 'Too few non-adopters (or heavy users) per ' + dimLabel.toLowerCase() + ' to measure lift. Use the Change view.' })));
    const hidden = data.reduce((s, r) => s + r.cells.filter((c) => c.lowSample && c.devCount > 0).length, 0);
    if (hidden) ins.appendChild(el('li', el('span', { text: hidden + ' cell' + (hidden > 1 ? 's have' : ' has') + ' fewer than ' + AID.analysis.MIN_GROUP_DEVS + ' developers with before/after data and ' + (hidden > 1 ? 'are' : 'is') + ' hidden from the chart.' })));

    // Grouped bars: one group per row value, one bar per usage tier.
    const tierIdx = lift ? [1, 2, 3] : [0, 1, 2, 3];
    const cellOf = (si, i) => data[i].cells[tierIdx[si]];
    const series = tierIdx.map((ti) => ({
      name: ctx.TIERS[ti], color: t.tiers[ti],
      values: data.map((r) => { const c = r.cells[ti]; return c.lowSample ? null : lift ? (c.lift ?? null) : c.pct; }),
      errors: data.map((r) => { const c = r.cells[ti]; if (c.lowSample) return null; return lift ? (c.lift != null ? [c.liftLo, c.liftHi] : null) : [c.lo, c.hi]; }),
    }));
    const c = card({
      id: 'exec-cross', height: 340,
      title: lift ? meta.short + ': improvement beyond non-adopters' : 'Change in ' + meta.short + ' by ' + dimLabel.toLowerCase() + ' and usage tier',
      sub: (lift
        ? 'Each bar = the tier\'s improvement minus the improvement of non-adopters in the same ' + dimLabel.toLowerCase() + ', in percentage points. Positive = better.'
        : 'Each bar = average per-developer change vs their own baseline.' + (meta.better === 'down' ? ' Lower is better for this metric, so a negative change is an improvement.' : '')) +
        ' Whiskers = 95% confidence interval.',
    });
    queueMicrotask(() => AID.charts.grouped(c.canvas, {
      labels: data.map((r) => r.row), series,
      axisFmt: (v) => Math.round(v * 100) + (lift ? ' pts' : '%'),
      valueFmt: lift ? fmtPts0 : (v) => F.pct(v),
      tooltipLines: (si, i) => {
        const x = cellOf(si, i);
        const lines = [F.metric(x.before, metric) + ' → ' + F.metric(x.after, metric) + ' (' + F.pct(x.pct) + ')', x.n + ' developers'];
        if (lift) lines.push('95% CI ' + fmtPts0(x.liftLo) + ' to ' + fmtPts0(x.liftHi));
        else { lines.push(ciText(x)); if (x.lift != null) lines.push('vs non-adopters: ' + fmtPts0(x.lift)); }
        return lines;
      },
    }));
    c.setTable(() => crossTable(ctx, data, dimLabel, lift));

    const side = el('section.card',
      el('h3', { text: 'Heavy users vs non-adopters', style: { fontSize: '15px', marginBottom: '10px' } }), ins,
      crossTable(ctx, data, dimLabel, lift),
      el('p.card-foot', { text: (lift ? 'Non-adopter column = their % change. Other columns = lift over non-adopters, in percentage points. ' : 'Values = % change vs own baseline. ') + 'Bold = statistically clear (95% CI excludes zero). n = developers with 2+ months before and after.' }));
    wrap.appendChild(el('div.grid-3-2', c.el, side));
    return wrap;
  }

  function crossTable(ctx, data, dimLabel, lift) {
    const cols = [{ label: dimLabel, value: (r) => r.row }];
    ctx.TIER_SHORT.forEach((name, ti) => {
      const useLift = lift && ti > 0;
      cols.push({
        label: name, num: true,
        value: (r) => { const x = r.cells[ti]; return x.lowSample ? null : useLift ? x.lift : x.pct; },
        cell: (r) => {
          const x = r.cells[ti];
          const v = x.lowSample ? null : useLift ? x.lift : x.pct;
          const sig = useLift ? x.liftSig : x.sig;
          return el('span', el(sig ? 'strong' : 'span', { text: v == null ? '—' : useLift ? fmtPts0(v).replace(' pts', '') : F.pct(v, 0) }),
            el('div', { style: { color: 'var(--muted)', fontSize: '11px' }, text: 'n=' + x.n }));
        },
      });
    });
    return table(cols, data, { sortCol: 0, sortDir: 1 });
  }

  AID.exec = { render, perDevLabel };
})(window.AID);
