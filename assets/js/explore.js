/* Explore: open-ended metric trends, before/after for every metric, correlations, group heatmap, usage detail, developer table. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el, select, seg, statusChip, table, card } = AID.ui;
  const F = AID.fmt;

  const GROUP_OPTS = [{ value: 'all', label: 'None' }].concat(AID.GROUPS.map((g) => ({ value: g.key, label: g.label })));
  const CORR_USAGE = ['activeDays', 'totalRequests', 'agentRequests', 'acceptedLinesAdded', 'tabAcceptRate', 'aiAcceptRate', 'aiLineShare', 'spendDollars'];
  const CORR_OUTCOME = ['prsMerged', 'prsOpened', 'throughput', 'storyPoints', 'medianCycleDays', 'medianTimeToMergeHours', 'reopenRatePct', 'additions'];
  const HEAT_METRICS = ['prsMerged', 'throughput', 'storyPoints', 'medianCycleDays', 'medianTimeToMergeHours', 'reopenRatePct', 'additions'];
  const LEVEL_OPTS = [
    { value: 'change', label: 'Per-dev change' },
    { value: 'dev', label: 'Per developer' },
    { value: 'devmonth', label: 'Per dev-month' },
  ];
  const LEVEL_HELP = {
    change: 'Each point is one developer: after-period average minus before-period average. This asks: did developers who changed usage more also change output more?',
    dev: 'Each point is one developer: the average over the selected date range.',
    devmonth: 'Each point is one developer in one month.',
  };

  function render(root, ctx, app) {
    const st = app.state.explore;
    const set = (patch) => app.update({ explore: patch });
    const t = AID.charts.theme();
    const page = el('div.page');
    root.appendChild(page);

    page.appendChild(el('div.section-head', el('h2', { text: 'Explore' }),
      el('span.lede', { text: ctx.devs.length + ' developers · ' + ctx.months.length + ' months in range. Global filters at the top apply to every chart.' })));

    page.appendChild(trendCard(ctx, st, set, t));
    page.appendChild(allMetricsCard(ctx));

    const g1 = el('div.grid-2');
    g1.append(corrCard(ctx, st, set), scatterCard(ctx, st, set, t));
    page.appendChild(g1);

    page.appendChild(groupHeatCard(ctx, st, set));

    const g2 = el('div.grid-2');
    g2.append(doseCard(ctx, st, set, t), mixCard(ctx, st, set, t));
    page.appendChild(g2);

    const g3 = el('div.grid-2');
    g3.append(usageDistCard(ctx, t), ctx.ds.hasModel ? modelCard(ctx, st, set, t) : el('div'));
    page.appendChild(g3);

    page.appendChild(devTableCard(ctx, st, set));
    page.appendChild(definitions());
  }

  // ---------------- Trends ----------------
  function trendCard(ctx, st, set, t) {
    const meta = AID.M[st.trendMetric];
    const controls = [
      select('Metric', AID.ui.metricOptions(null, true), st.trendMetric, (v) => set({ trendMetric: v })),
      select('Group by', GROUP_OPTS, st.trendGroup, (v) => set({ trendGroup: v })),
      select('X axis', [{ value: 'calendar', label: 'Calendar month' }, { value: 'relative', label: 'Months since split' }], st.trendX, (v) => set({ trendX: v })),
      select('Aggregate', [{ value: 'mean', label: 'Average per dev' }, { value: 'median', label: 'Median per dev' }, { value: 'sum', label: 'Total' }], st.trendAgg, (v) => set({ trendAgg: v })),
    ];
    const rel = st.trendX === 'relative';
    const c = card({
      id: 'x-trend', height: 340, controls,
      title: 'Metric trends',
      sub: rel ? 'X axis = months relative to the split month (company rollout or each developer\'s adoption month, per the setting). Points with fewer than 3 developer-months are hidden.' : (meta.desc || 'Monthly value for the selected metric.'),
    });
    const s = ctx.series(st.trendMetric, { groupKey: st.trendGroup, agg: st.trendAgg, xMode: st.trendX });
    const allNames = st.trendGroup === 'all' || st.trendGroup === 'tier' ? null : [...new Set(ctx.ds.devs.map((d) => d[st.trendGroup]))].sort();
    const series = s.series.map((x, i) => Object.assign(x, {
      color: st.trendGroup === 'tier' ? (ctx.TIERS.indexOf(x.name) >= 0 ? t.tiers[ctx.TIERS.indexOf(x.name)] : t.other) : AID.charts.colorFor(x.name, i, allNames),
    }));
    if (s.folded) c.foot.textContent = 'Showing the 7 largest groups. The other ' + s.folded + ' are combined into "Other". Filter or use the table view for detail.';
    const mIdx = rel ? s.xs.indexOf(0) : (ctx.perDev ? -1 : s.xs.indexOf(ctx.rolloutIdx));
    queueMicrotask(() => AID.charts.line(c.canvas, {
      labels: s.labels, series, unit: meta.unit, yZero: meta.unit === 'count', endLabels: series.length <= 4, showN: true,
      marker: mIdx >= 0 ? { index: mIdx, label: rel ? 'Split' : 'AI rollout' } : null,
    }));
    c.setTable(() => table([{ label: rel ? 'Months since split' : 'Month', value: (r) => r, format: (v) => s.labels[v] }].concat(series.map((x) => ({
      label: x.name, num: true, value: (r) => x.values[r], format: (v) => F.metric(v, st.trendMetric),
    }))), s.labels.map((_, i) => i), { sortCol: 0, sortDir: 1 }));
    return c.el;
  }

  // ---------------- Before / after for every metric ----------------
  function allMetricsCard(ctx) {
    // Outcomes (GitHub, Jira) first, then Cursor usage.
    const order = { GitHub: 0, Jira: 1, Cursor: 2 };
    const rows = AID.METRICS.slice().sort((a, b) => order[a.source] - order[b.source])
      .map((m) => Object.assign(ctx.compare(m.key), { meta: m })).filter((r) => r.status !== 'nodata');
    return el('section.card',
      el('div.card-head', el('div',
        el('h3', { text: 'Before vs after AI, every metric' }),
        el('p.sub', { text: 'Average per developer per month. Each developer is compared with their own baseline. Status is "Improved" or "Worse" only when the 95% confidence interval excludes zero.' }))),
      table([
        { label: 'Source', value: (r) => r.meta.source },
        { label: 'Metric', value: (r) => r.meta.label },
        { label: 'Better when', value: (r) => ({ up: 'Higher', down: 'Lower', neutral: '—' }[r.meta.better]) },
        { label: 'Developers', num: true, value: (r) => r.n },
        { label: 'Before', num: true, value: (r) => r.before, format: (v, r) => F.metric(v, r.key, { short: true }) },
        { label: 'After', num: true, value: (r) => r.after, format: (v, r) => F.metric(v, r.key, { short: true }) },
        { label: 'Change', num: true, value: (r) => (r.fromZero ? null : r.pct), format: (v, r) => (r.fromZero ? 'from ~0' : F.pct(v)) },
        { label: '95% CI', num: true, value: (r) => r.lo, format: (v, r) => (r.lo == null || r.fromZero ? '—' : F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0)) },
        { label: 'Status', value: (r) => r.status, cell: (r) => statusChip(r) },
      ], rows, { maxHeight: '420px' }));
  }

  // ---------------- Correlation heatmap ----------------
  function corrCard(ctx, st, set) {
    const all = st.corrSet === 'all';
    const rowsK = all ? CORR_USAGE.concat(CORR_OUTCOME) : CORR_USAGE;
    const colsK = all ? rowsK : CORR_OUTCOME;
    const keys = [...new Set(rowsK.concat(colsK))];
    const m = ctx.corrMatrix(keys, st.corrLevel, st.corrMethod);
    const at = (a, b) => m[keys.indexOf(a)][keys.indexOf(b)];

    const c = el('section.card');
    c.appendChild(el('div.card-head',
      el('div', el('h3', { text: 'Correlations' }), el('p.sub', { text: LEVEL_HELP[st.corrLevel] + ' Click a cell to plot it.' })),
      el('div.card-controls',
        select('Level', LEVEL_OPTS, st.corrLevel, (v) => set({ corrLevel: v, sLevel: v })),
        select('Method', [{ value: 'spearman', label: 'Spearman (rank)' }, { value: 'pearson', label: 'Pearson' }], st.corrMethod, (v) => set({ corrMethod: v })),
        select('Matrix', [{ value: 'usage', label: 'AI usage × outcomes' }, { value: 'all', label: 'All × all' }], st.corrSet, (v) => set({ corrSet: v })))));

    const tbl = el('table.heat');
    const hr = el('tr', el('th'));
    for (const k of colsK) hr.appendChild(el('th.col', { scope: 'col', text: AID.M[k].short }));
    tbl.appendChild(el('thead', hr));
    const tb = el('tbody');
    for (const rk of rowsK) {
      const tr = el('tr', el('th.row', { scope: 'row', text: AID.M[rk].short }));
      for (const ck of colsK) {
        const cell = at(rk, ck);
        const col = AID.charts.diverging(cell.r);
        const same = rk === ck;
        const td = el('td' + (same ? '' : '.click'), {
          style: { background: col.bg, color: col.fg },
          tabindex: same ? null : '0',
          title: AID.M[rk].label + ' × ' + AID.M[ck].label + (cell.r == null ? ': not enough data' : ': r = ' + cell.r.toFixed(2) + (cell.n ? ' (n = ' + cell.n + ')' : '')),
          text: cell.r == null ? '·' : cell.r.toFixed(2).replace('0.', '.'),
        });
        if (st.sx === rk && st.sy === ck) td.classList.add('sel');
        if (!same) {
          const go = () => set({ sx: rk, sy: ck, sLevel: st.corrLevel });
          td.addEventListener('click', go);
          td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        }
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    c.appendChild(el('div.heat-wrap', tbl));
    c.appendChild(rampLegend('−1 (opposite)', '0', '+1 (together)'));
    return c;
  }

  function rampLegend(lo, mid, hi) {
    const tt = AID.charts.theme();
    return el('div.legend-ramp', el('span', { text: lo }),
      el('span.bar', { style: { background: 'linear-gradient(90deg,' + tt.divNeg + ',' + tt.divMid + ',' + tt.divPos + ')' } }),
      el('span', { text: hi }), el('span', { style: { marginLeft: '8px' }, text: 'Middle = ' + mid }));
  }

  // ---------------- Scatter ----------------
  function scatterCard(ctx, st, set, t) {
    const opts = AID.ui.metricOptions(null, true);
    const c = card({
      id: 'x-scatter', height: 360,
      title: 'Relationship explorer',
      sub: LEVEL_HELP[st.sLevel],
      controls: [
        select('X', opts, st.sx, (v) => set({ sx: v })),
        select('Y', opts, st.sy, (v) => set({ sy: v })),
        select('Level', LEVEL_OPTS, st.sLevel, (v) => set({ sLevel: v })),
      ],
    });
    const pts = ctx.pointsFor(st.sx, st.sy, st.sLevel);
    if (pts.length < 3) { c.empty('Not enough data points for this pair.'); return c.el; }
    const xm = AID.M[st.sx], ym = AID.M[st.sy];
    const dense = pts.length > 1500;
    const groups = ctx.TIERS.map((tier, i) => ({ name: tier, color: t.tiers[i], points: pts.filter((p) => ctx.tierOf(p.dev) === tier) })).filter((g) => g.points.length);
    const fit = AID.analysis.linearFit(pts.map((p) => p.x), pts.map((p) => p.y));
    const xs = pts.map((p) => p.x);
    const sp = AID.analysis.correlate(xs, pts.map((p) => p.y), 'spearman');
    const pe = AID.analysis.correlate(xs, pts.map((p) => p.y), 'pearson');
    const delta = st.sLevel === 'change' ? 'Change in ' : '';
    c.foot.textContent = pts.length.toLocaleString() + ' points · Spearman ρ = ' + (sp.r == null ? '—' : sp.r.toFixed(2)) + ' · Pearson r = ' + (pe.r == null ? '—' : pe.r.toFixed(2)) +
      ' · Trend: each +1 ' + xm.short + ' ≈ ' + (fit.slope >= 0 ? '+' : '') + F.value(fit.slope, ym.unit === 'pct' ? 'count' : ym.unit, { short: true }) + (ym.unit === 'pct' ? ' pts' : '') + ' ' + ym.short + '. Color = AI usage tier.';
    queueMicrotask(() => AID.charts.scatter(c.canvas, {
      datasets: groups, radius: dense ? 2 : 4, alpha: dense ? 0.35 : 0.75, zeroLines: st.sLevel === 'change',
      xUnit: xm.unit, yUnit: ym.unit, xLabel: delta + xm.label, yLabel: delta + ym.label,
      fit: Object.assign(fit, { x0: Math.min(...xs), x1: Math.max(...xs) }),
      title: (p) => p.dev.name + (p.month != null ? ' · ' + AID.data.monthLabel(p.month, true) : ''),
      label: (p) => [xm.short + ': ' + F.metric(p.x, st.sx), ym.short + ': ' + F.metric(p.y, st.sy), p.dev.team + ' · ' + p.dev.level],
    }));
    c.setTable(() => table([
      { label: 'Developer', value: (p) => p.dev.name }, { label: 'Team', value: (p) => p.dev.team },
      st.sLevel === 'devmonth' ? { label: 'Month', value: (p) => p.month, format: (v) => AID.data.monthLabel(v, true) } : { label: 'Level', value: (p) => p.dev.level },
      { label: delta + xm.short, num: true, value: (p) => p.x, format: (v) => F.metric(v, st.sx) },
      { label: delta + ym.short, num: true, value: (p) => p.y, format: (v) => F.metric(v, st.sy) },
    ], pts, { limit: 1000 }));
    return c.el;
  }

  // ---------------- Group × metric heatmap ----------------
  function groupHeatCard(ctx, st, set) {
    const level = st.gcGroup;
    const res = HEAT_METRICS.map((k) => ctx.compareByGroup(k, level));
    const groups = [...new Set(res[0].map((r) => r.group))];
    const head = res[0].reduce((acc, r) => { acc[r.group] = r; return acc; }, {});
    if (level === 'levelTier') {
      // Keep each level's tiers together, in tier order: SDE1 · Non-adopter, SDE1 · Light, …
      const ti = (g) => ctx.TIER_SHORT.indexOf(g.split(' · ')[1]);
      groups.sort((a, b) => a.split(' · ')[0].localeCompare(b.split(' · ')[0], undefined, { numeric: true }) || ti(a) - ti(b));
    } else groups.sort((a, b) => (head[b].score ?? -9) - (head[a].score ?? -9));
    const look = res.map((list) => Object.fromEntries(list.map((r) => [r.group, r])));

    const c = el('section.card');
    c.appendChild(el('div.card-head',
      el('div', el('h3', { text: 'Impact by group, every key metric' }),
        el('p.sub', { text: 'Before → after change per group. Blue = better, red = worse (lower is better for cycle time, time to merge, and reopen rate). Pale cells are not statistically clear. Rows are sorted by PRs merged (Level × usage: by level, then usage tier).' })),
      el('div.card-controls', seg('Group', AID.GROUPS.map((g) => ({ value: g.key, label: g.label })).concat([{ value: 'levelTier', label: 'Level × usage' }]), level, (v) => set({ gcGroup: v })))));

    const tbl = el('table.heat');
    const hr = el('tr', el('th'), el('th.col', { text: 'Developers' }), el('th.col', { text: 'Adoption' }));
    for (const k of HEAT_METRICS) hr.appendChild(el('th.col', { scope: 'col', text: AID.M[k].short }));
    tbl.appendChild(el('thead', hr));
    const tb = el('tbody');
    for (const g of groups) {
      const tr = el('tr', el('th.row', { scope: 'row', text: g }), el('td', { style: { color: 'var(--text-2)' }, text: String(head[g].n) }),
        el('td', { style: { color: 'var(--text-2)' }, title: 'Share of after-period months with ' + ctx.thr + '+ Cursor active days', text: head[g].adoption == null ? '·' : Math.round(head[g].adoption * 100) + '%' }));
      HEAT_METRICS.forEach((k, i) => {
        const r = look[i][g];
        const neutral = AID.M[k].better === 'neutral';
        const s = r && r.pct != null ? (neutral ? r.pct : r.score) : null;
        const strength = s == null ? null : Math.max(-1, Math.min(1, s / 0.3)) * (r.sig && !r.lowSample ? 1 : 0.35);
        const col = neutral && s != null ? { bg: 'var(--surface-2)', fg: 'var(--text)' } : AID.charts.diverging(strength);
        tr.appendChild(el('td', {
          style: { background: col.bg, color: col.fg, minWidth: '64px' },
          title: g + ' · ' + AID.M[k].label + (r && r.pct != null ? ': ' + F.metric(r.before, k) + ' → ' + F.metric(r.after, k) + ' (' + F.pct(r.pct) + (r.lo != null ? ', 95% CI ' + F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0) : '') + ', n=' + r.n + ')' : ': not enough data'),
          text: r && r.pct != null ? F.pct(r.pct, 0) : '·',
        }));
      });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    c.appendChild(el('div.heat-wrap', tbl));
    c.appendChild(rampLegend('Worse', 'no change', 'Better'));
    return c;
  }

  // ---------------- Dose-response ----------------
  function doseCard(ctx, st, set, t) {
    const meta = AID.M[st.doseMetric];
    const c = card({
      id: 'x-dose', height: 280,
      title: meta.short + ' by monthly AI usage',
      sub: 'Average per developer-month, grouped by Cursor active days that month.' + (st.doseAfter ? ' After-period months only, so calendar trends do not mix in.' : ''),
      controls: [
        select('Metric', AID.ui.metricOptions(AID.OUTCOME_METRICS, true), st.doseMetric, (v) => set({ doseMetric: v })),
        seg('Period', [{ value: true, label: 'After only' }, { value: false, label: 'All months' }], st.doseAfter, (v) => set({ doseAfter: v })),
      ],
    });
    const d = ctx.doseResponse(st.doseMetric, st.doseAfter);
    const ramp = [t.tiers[0], t.tiers[1], t.tiers[2], t.tiers[2], t.tiers[3]];
    queueMicrotask(() => AID.charts.bars(c.canvas, {
      labels: d.map((b) => b.label), values: d.map((b) => b.mean), colors: d.map((b, i) => ramp[i]), unit: meta.unit,
      valueFmt: (v) => F.metric(v, st.doseMetric, { short: true }),
      tooltipLines: (i) => [d[i].n.toLocaleString() + ' developer-months · ' + d[i].devs + ' developers', 'Median ' + F.metric(d[i].median, st.doseMetric, { short: true })],
    }));
    c.foot.textContent = 'X axis: Cursor active days in the month.';
    c.setTable(() => table([
      { label: 'Active days', value: (r) => r.label, sortable: false }, { label: 'Dev-months', num: true, value: (r) => r.n },
      { label: 'Developers', num: true, value: (r) => r.devs },
      { label: 'Mean', num: true, value: (r) => r.mean, format: (v) => F.metric(v, st.doseMetric) },
      { label: 'Median', num: true, value: (r) => r.median, format: (v) => F.metric(v, st.doseMetric) },
    ], d, { sortable: false }));
    return c.el;
  }

  // ---------------- Cursor feature mix ----------------
  function mixCard(ctx, st, set, t) {
    const keys = ['agentRequests', 'composerRequests', 'chatRequests', 'cmdkUsages', 'bugbotUsages'];
    const share = st.mixMode === 'share';
    const c = card({
      id: 'x-mix', height: 280, title: 'How developers use Cursor',
      sub: share ? 'Share of all AI requests by feature, per month.' : 'Average requests per developer per month, by feature.',
      controls: [seg('Mode', [{ value: 'share', label: 'Share' }, { value: 'abs', label: 'Per dev' }], st.mixMode, (v) => set({ mixMode: v }))],
    });
    const per = keys.map((k) => ctx.series(k, { agg: share ? 'sum' : 'mean' }).series[0]);
    if (!per[0]) { c.empty('No Cursor data in range.'); return c.el; }
    const labels = ctx.months.map((m) => AID.data.monthLabel(m));
    const totals = labels.map((_, i) => per.reduce((s, x) => s + ((x && x.values[i]) || 0), 0));
    const series = keys.map((k, i) => ({
      name: AID.M[k].short, color: t.series[i],
      values: per[i] ? per[i].values.map((v, j) => (v == null ? null : share ? (totals[j] ? (100 * v) / totals[j] : null) : v)) : [],
    }));
    queueMicrotask(() => AID.charts.stacked(c.canvas, { labels, series, percent: share, unit: 'count' }));
    c.setTable(() => table([{ label: 'Month', value: (r) => r, format: (v) => labels[v] }].concat(series.map((s) => ({
      label: s.name, num: true, value: (r) => s.values[r], format: (v) => (v == null ? '—' : share ? v.toFixed(1) + '%' : F.value(v, 'count')),
    }))), labels.map((_, i) => i), { sortCol: 0, sortDir: 1 }));
    return c.el;
  }

  // ---------------- Usage distribution ----------------
  function usageDistCard(ctx, t) {
    const c = card({ id: 'x-dist', height: 260, title: 'How much each developer uses AI', sub: 'Developers by average Cursor active days per month in the after period.' });
    const bins = [];
    // One-day bins, so bin edges line up with the tier thresholds.
    for (let i = 0; i <= 22; i++) bins.push({ lo: i, hi: i + 1, label: i ? String(i) : '<1', n: 0 });
    bins[bins.length - 1].hi = Infinity; bins[bins.length - 1].label = '22+';
    for (const d of ctx.devs) {
      const u = ctx.usageAfter(d);
      if (u == null) continue;
      const b = bins.find((x) => u >= x.lo && u < x.hi);
      if (b) b.n++;
    }
    const colorOf = (b) => t.tiers[b.lo >= ctx.hi ? 3 : b.lo >= ctx.thr ? 2 : b.lo >= AID.analysis.NON_ADOPTER_DAYS ? 1 : 0];
    queueMicrotask(() => AID.charts.bars(c.canvas, {
      labels: bins.map((b) => b.label), values: bins.map((b) => b.n), colors: bins.map(colorOf), unit: 'count',
      valueFmt: (v) => (v ? String(v) : ''), tooltipLines: () => ['developers'],
    }));
    c.foot.textContent = 'X axis: average active days per month. Color = usage tier (gray = non-adopter, then light / medium / heavy). Change the tier thresholds in Settings.';
    c.setTable(() => table([{ label: 'Avg active days', value: (b) => b.label, sortable: false }, { label: 'Developers', num: true, value: (b) => b.n }], bins, { sortable: false }));
    return c.el;
  }

  // ---------------- Model mix ----------------
  function modelCard(ctx, st, set, t) {
    const c = card({ id: 'x-model', height: 260, title: 'Primary model', sub: 'Share of active developer-months by the model used most. Top 7 models; the rest are "Other".' });
    const counts = new Map();
    for (const d of ctx.devs) for (const r of ctx.rowsOf(d)) if (r.model) counts.set(r.model, (counts.get(r.model) || 0) + 1);
    if (!counts.size) { c.empty('No primaryModel values in range.'); return c.el; }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map((e) => e[0]);
    const names = top.concat(counts.size > 7 ? [AID.analysis.OTHER] : []);
    const pos = new Map(ctx.months.map((m, i) => [m, i]));
    const grid = names.map(() => ctx.months.map(() => 0));
    const tot = ctx.months.map(() => 0);
    for (const d of ctx.devs) for (const r of ctx.rowsOf(d)) {
      if (!r.model) continue;
      const i = pos.get(r.mi); let k = top.indexOf(r.model); if (k < 0) k = names.length - 1;
      grid[k][i]++; tot[i]++;
    }
    const labels = ctx.months.map((m) => AID.data.monthLabel(m));
    const series = names.map((n, k) => ({ name: n, color: n === AID.analysis.OTHER ? t.other : t.series[k], values: grid[k].map((v, i) => (tot[i] ? (100 * v) / tot[i] : null)) }));
    queueMicrotask(() => AID.charts.stacked(c.canvas, { labels, series, percent: true }));
    c.setTable(() => table([{ label: 'Month', value: (r) => r, format: (v) => labels[v] }].concat(series.map((s) => ({
      label: s.name, num: true, value: (r) => s.values[r], format: (v) => (v == null ? '—' : v.toFixed(1) + '%'),
    }))), labels.map((_, i) => i), { sortCol: 0, sortDir: 1 }));
    return c.el;
  }

  // ---------------- Developer table ----------------
  function devTableCard(ctx, st, set) {
    const q = (st.devSearch || '').toLowerCase();
    const list = ctx.devs.filter((d) => !q || [d.name, d.team, d.domain, d.manager, d.githubLogin, d.email].some((x) => (x || '').toLowerCase().includes(q)));
    const rows = list.map((d) => ctx.devSummary(d));
    const pct = (k) => (r) => { const p = r.m(k); return p.nb && p.na && p.b ? (p.a - p.b) / Math.abs(p.b) : null; };
    const val = (k, side) => (r) => r.m(k)[side];
    const search = el('input.search', { type: 'search', placeholder: 'Search name, team, manager…', value: st.devSearch || '', 'aria-label': 'Search developers' });
    let timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set({ devSearch: search.value }), 250); });
    const box = el('section.card',
      el('div.card-head',
        el('div', el('h3', { text: 'Developers' }), el('p.sub', { text: rows.length + ' developers. Before/after values are monthly averages. Click a header to sort.' })),
        el('div.card-controls', search)),
      table([
        { label: 'Name', value: (r) => r.dev.name },
        { label: 'Team', value: (r) => r.dev.team },
        { label: 'Domain', value: (r) => r.dev.domain },
        { label: 'Level', value: (r) => r.dev.level },
        { label: 'Usage tier', value: (r) => r.tier },
        { label: 'Avg active days', num: true, value: (r) => r.usage, format: (v) => F.value(v, 'count') },
        { label: 'Adopted', num: true, value: (r) => r.adoptIdx, format: (v) => (v == null ? 'Never' : AID.data.monthLabel(v, true)) },
        { label: 'PRs before', num: true, value: val('prsMerged', 'b'), format: (v) => F.value(v, 'count') },
        { label: 'PRs after', num: true, value: val('prsMerged', 'a'), format: (v) => F.value(v, 'count') },
        { label: 'PRs Δ', num: true, value: pct('prsMerged'), format: (v) => F.pct(v, 0) },
        { label: 'Throughput Δ', num: true, value: pct('throughput'), format: (v) => F.pct(v, 0) },
        { label: 'Cycle time before', num: true, value: val('medianCycleDays', 'b'), format: (v) => F.value(v, 'days', { short: true }) },
        { label: 'Cycle time after', num: true, value: val('medianCycleDays', 'a'), format: (v) => F.value(v, 'days', { short: true }) },
      ], rows, { sortCol: 5, sortDir: -1, limit: 600, maxHeight: '480px' }));
    if (rows.length > 600) box.appendChild(el('p.card-foot', { text: 'Showing the first 600 rows. Use search or the global filters to narrow the list.' }));
    return box;
  }

  function definitions() {
    const dl = el('dl');
    for (const m of AID.METRICS) {
      dl.appendChild(el('dt', { text: m.label }));
      dl.appendChild(el('dd', { text: m.source + ' · ' + (m.desc || ('Column ' + m.key + '.')) + (m.better !== 'neutral' ? ' ' + (m.better === 'up' ? 'Higher' : 'Lower') + ' is better.' : '') }));
    }
    return el('section.card', el('details.defs', el('summary', { text: 'Metric definitions' }), dl));
  }

  AID.explore = { render };
})(window.AID);
