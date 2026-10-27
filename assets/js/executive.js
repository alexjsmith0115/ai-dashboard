/* Executive summary: "Are developers more productive since AI adoption?" and "Which groups are most impacted?" */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el, select, seg, statusChip, answerChip, table, card, icon, titleRow } = AID.ui;
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

    // The executive page uses the difference-in-differences (DiD) effect. Explore keeps the plain before/after change.
    const head = ctx.did(metric);
    const keyRes = AID.KEY_PRODUCTIVITY.map((k) => ctx.did(k));
    const quality = ctx.did(AID.QUALITY_GUARDRAIL);
    const tiers = ctx.TIERS.map((tier) => {
      const list = ctx.devs.filter((d) => ctx.tierOf(d) === tier);
      return Object.assign(ctx.did(metric, list), { tier, devCount: list.length });
    });

    page.appendChild(el('div.section-head',
      el('h2', { text: 'Executive summary' }),
      el('div', { style: { marginLeft: 'auto' } }, select('Headline metric', AID.ui.metricOptions(HEADLINE_OPTIONS), metric, (v) => app.update({ exec: { metric: v } })))));

    page.appendChild(verdictCard(ctx, head, keyRes, quality, tiers, metric));
    page.appendChild(kpiGrid(ctx, keyRes, quality));
    page.appendChild(eventStudyCard(ctx, metric));

    // ---- Trends ----
    const grid = el('div.grid-2');
    page.appendChild(grid);
    grid.appendChild(adoptionCard(ctx, t));
    grid.appendChild(headlineTrendCard(ctx, metric, t));

    // ---- Groups ----
    page.appendChild(groupsSection(ctx, app, metric, meta, t));
    page.appendChild(crossSection(ctx, app, metric, meta, t));

    page.appendChild(el('p.card-foot', { text: 'AI effect = actual value minus the value expected without AI. The expected value comes from each developer\'s own level before adoption plus the company-wide change in that month, measured on developers who had not adopted AI yet. This removes seasonality and company-wide changes. It cannot remove changes that hit only the adopters at the time they adopted (for example, a team re-org in the same month). Developers chose how much to use AI, so read the effects as strong evidence, not proof.' }));
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
      el('div.card-title', el('p.verdict-q', { text: 'Are we seeing improvements in developer productivity since the adoption of AI?' }), AID.help.button('c-verdict')),
      el('div.verdict-answer', answerChip(kind, word)),
      el('div.hero-row',
        el('div.hero', { text: head.pct != null ? F.pct(head.pct) : '—' }),
        el('div.hero-label', 'AI effect on ' + perDevLabel(metric).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()), el('div', { style: { color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }, text: head.pct != null ? F.metric(head.after, metric) + ' actual vs ' + F.metric(head.before, metric) + ' expected without AI · ' + ciText(head) : '' }))));

    const parts = [];
    if (k) {
      parts.push('AI improved ', el('strong', { text: improved + ' of ' + k }), ' core productivity metrics');
      parts.push(worse ? [', ', el('strong', { text: String(worse) }), ' got worse. '] : ' and none got worse. ');
    }
    if (quality.status !== 'nodata') {
      const q = quality.status === 'worse' ? 'got worse' : quality.status === 'improved' ? 'improved' : 'held steady';
      parts.push('Quality (reopen rate) ', el('strong', { text: q }), ' (' + F.pct(quality.pct) + '). ');
    }
    // Dose: if AI drives the change, the effect grows with usage.
    const lt = tiers[1], hv = tiers[3];
    if (lt.pct != null && hv.pct != null) {
      const gap = hv.score - lt.score;
      parts.push('The effect is ', el('strong', { text: F.pct(hv.pct) }), ' for heavy AI users vs ', el('strong', { text: F.pct(lt.pct) }), ' for light users — ',
        gap > 0.02 ? 'it grows with usage, which is a sign that AI causes it.' : gap < -0.02 ? 'it does not grow with usage, so AI is not the likely cause.' : 'too small a gap to link the effect to usage.');
    }
    left.appendChild(el('p.verdict-text', parts));

    const fit = ctx.didFit(metric);
    left.appendChild(el('p.method-note', {
      text: 'Method: difference-in-differences. Each adopter is split at their own adoption month (first month with ' + ctx.thr + '+ Cursor active days). ' +
        'Their results after adoption are compared with the value expected from their own level before adoption plus the company-wide change in the same month. ' +
        'The company-wide change comes from ' + controlText(fit) + '. ' +
        head.n + ' adopters have ' + AID.analysis.MIN_MONTHS_PER_SIDE + '+ months on both sides.' +
        (ctx.ramp ? ' ' + ctx.ramp + ' ramp-up month(s) after adoption excluded.' : '') +
        (ctx.onboarding.months && ctx.onboarding.newHires ? ' The first ' + ctx.onboarding.months + ' month(s) of ' + ctx.onboarding.newHires + ' new hires are excluded as onboarding.' : '') +
        (fit.dropped ? ' ' + fit.dropped + ' adopter-months are left out because their month has fewer than ' + AID.analysis.MIN_CONTROL_DEVS + ' comparison developers.' : ''),
    }));

    // Right side: change by AI usage tier
    const maxAbs = Math.max(0.01, ...tiers.map((x) => Math.abs(x.score || 0)));
    const t = AID.charts.theme();
    const rows = tiers.map((x, i) => {
      if (i === 0) {
        return el('div.score-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
          el('div', el('div.name', { text: x.tier }), el('div', { style: { fontSize: '11px', color: 'var(--muted)' }, text: x.devCount + ' developers · ' + (ctx.control === 'notyet' ? 'not used' : ctx.control === 'never' ? 'the comparison group' : 'part of the comparison group') })),
          el('div.val', { text: '—', style: { color: 'var(--muted)' } }));
      }
      const w = x.score != null ? (Math.abs(x.score) / maxAbs) * 100 : 0;
      const bar = el('div', { style: { height: '8px', borderRadius: '4px', width: Math.max(2, w) + '%', background: t.tiers[i], marginTop: '5px' } });
      return el('div.score-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
        el('div', el('div.name', { text: x.tier }), el('div', { style: { fontSize: '11px', color: 'var(--muted)' }, text: x.n + ' developers' + (x.lo != null ? ' · ' + ciText(x) : '') }), bar),
        el('div.val', { text: x.pct != null ? F.pct(x.pct) : '—' }));
    });
    const right = el('div.verdict-side',
      el('div.card-title', el('p.verdict-q', { text: 'AI effect on ' + meta.short + ' by AI usage level' }), AID.help.button('m-tiers')),
      el('div.scorecard', rows),
      el('p.method-note', { text: 'Usage level = average Cursor active days per month in the after period.' }),
      robustness(ctx, metric));

    return el('section.card.verdict', left, right);
  }

  const CONTROL_LABELS = { all: 'All developers without AI yet', notyet: 'Adopters before adoption only', never: 'Non-adopters only' };
  function controlText(fit) {
    if (fit.control === 'notyet') return fit.notYet + ' adopters, in the months before they adopted (non-adopters are not used)';
    if (fit.control === 'never') return fit.nonAdopters + ' non-adopters only';
    return fit.nonAdopters + ' non-adopters and from adopters in the months before they adopted';
  }

  // Robustness check: the headline effect with each comparison group. If they agree, the choice of group does not drive the result.
  function robustness(ctx, metric) {
    const res = ctx.CONTROLS.map((c) => ctx.did(metric, null, c));
    const ok = res.filter((r) => r.pct != null);
    const spread = ok.length >= 2 ? Math.max(...ok.map((r) => r.score)) - Math.min(...ok.map((r) => r.score)) : null;
    const rows = res.map((r) => el('div.robust-row' + (r.control === ctx.control ? '.current' : ''),
      el('span', { text: CONTROL_LABELS[r.control] + (r.control === ctx.control ? ' (in use)' : '') }),
      el('span.robust-ci', { text: r.lo != null ? F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0) : '' }),
      el('strong', { text: r.pct != null ? F.pct(r.pct) : 'n/a' })));
    let verdict = 'Not enough data to compare.';
    if (spread != null) {
      verdict = spread <= 0.03
        ? 'The results agree (within ' + Math.max(1, Math.round(spread * 100)) + ' pts). The comparison group does not drive the result.'
        : 'The results differ by ' + Math.round(spread * 100) + ' pts. The comparison group changes the result, so treat the headline with care.';
    }
    return el('div.robust',
      el('div.card-title', el('p.verdict-q', { text: 'Check: ' + AID.M[metric].short + ' effect by comparison group' }), AID.help.button('m-control')),
      rows,
      el('p.method-note', { text: verdict + ' Change the group in Settings.' }));
  }

  // ---------------- KPI tiles ----------------
  // Each tile leads with the change. Productivity tiles show the DiD effect: actual vs expected without AI.
  function kpiGrid(ctx, keyRes, quality) {
    const grid = el('div.kpi-grid');
    const t = AID.charts.theme();
    const markerIdx = ctx.perDev ? null : ctx.months.indexOf(ctx.rolloutIdx);
    const signed = (v, f) => (v > 0 ? '+' : v < 0 ? '−' : '') + f(Math.abs(v));

    // Adoption tile: share of developer-months with the active threshold, before vs after.
    const adopt = ctx.adoptionSeries();
    const share = phaseShare(ctx, (r) => r.v.activeDays >= ctx.thr);
    const pts = share.b != null && share.a != null ? share.a - share.b : null;
    grid.appendChild(tile('AI adoption', 'Cursor', pts != null ? signed(Math.round(pts * 100), String) : '—', pts != null ? 'pts' : '', null,
      [el('span', { text: pts != null ? pct0(share.b) + ' → ' + pct0(share.a) + ' of developers used Cursor ' + ctx.thr + '+ days / mo' : 'Not enough data' })],
      AID.charts.sparkline(adopt.active, { color: t.series[0], markerIndex: markerIdx, zero: true }), null, 'kpi-adoption'));

    // Spend tile: change in Cursor spend per developer per month.
    const sp = ctx.compare('spendDollars');
    const cppRes = ctx.compare('costPerMergedPr');
    const spend = ctx.series('spendDollars', { agg: 'mean' }).series[0];
    grid.appendChild(tile('Cursor spend', 'Cursor', sp.diff != null ? signed(sp.diff, (v) => F.value(v, 'usd')) : '—', sp.diff != null ? '/ dev / mo' : '', null,
      [el('span', { text: sp.diff != null ? F.value(sp.before, 'usd') + ' → ' + F.value(sp.after, 'usd') + ' · ' + F.value(cppRes.after, 'usd') + ' per merged PR' : 'Not enough data' })],
      spend ? AID.charts.sparkline(spend.values, { markerIndex: markerIdx, zero: true }) : null, null, 'kpi-spend'));

    for (const c of keyRes.concat([quality])) {
      const m = AID.M[c.key];
      const s = ctx.series(c.key, { agg: 'mean' }).series[0];
      const unit = m.unit === 'count' ? ' / dev / mo' : '';
      const tone = c.status === 'improved' ? 'good' : c.status === 'worse' ? 'bad' : null;
      grid.appendChild(tile(m.label, m.source, c.pct != null ? F.pct(c.pct) : '—', '', tone,
        [statusChip(c), el('span', { text: c.pct != null ? F.metric(c.after, c.key, { short: true }) + ' vs ' + F.metric(c.before, c.key, { short: true }) + ' expected' + unit : 'Not enough data' })],
        s ? AID.charts.sparkline(s.values, { markerIndex: markerIdx }) : null,
        c.lo != null ? ciText(c) : null, 'metric:' + c.key));
    }
    return grid;
  }

  // Share of before-period and after-period developer-months that pass a test.
  function phaseShare(ctx, test) {
    const n = { before: 0, after: 0 }, k = { before: 0, after: 0 };
    for (const d of ctx.devs) for (const r of ctx.rowsOf(d)) {
      const p = ctx.phaseOf(r);
      if (!p) continue;
      n[p]++; if (test(r)) k[p]++;
    }
    return { b: n.before ? k.before / n.before : null, a: n.after ? k.after / n.after : null };
  }
  function pct0(v) { return Math.round(v * 100) + '%'; }

  function tile(label, src, value, unit, tone, meta, spark, title, helpId) {
    return el('div.card.kpi',
      el('div.kpi-label', el('span.kpi-name', el('span', { text: label }), helpId ? AID.help.button(helpId) : null), el('span.src', { text: src })),
      el('div.kpi-value' + (tone ? '.' + tone : ''), { title: title || null }, value, unit ? el('span.unit', { text: unit }) : null),
      el('div.kpi-meta', meta),
      el('div.kpi-spark', spark));
  }
  function lastIndex(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }

  // ---------------- Event study ----------------
  function eventStudyCard(ctx, metric) {
    const meta = AID.M[metric];
    const rows = ctx.eventStudy(metric);
    const labels = rows.map((r) => (r.k > 0 ? '+' + r.k : String(r.k)));
    const c = card({
      id: 'exec-event', height: 300, help: 'c-event',
      title: 'AI effect on ' + meta.short + ' by month since adoption',
      sub: 'Each point = actual vs expected without AI, as a % of expected. Band = 95% confidence interval.' + (meta.better === 'down' ? ' Lower is better for this metric.' : ''),
    });
    if (!rows.some((r) => r.pct != null)) { c.empty('Not enough adopters with months before and after adoption.'); return c.el; }
    c.box.before(el('p.chart-summary', eventSummary(rows, meta)));
    queueMicrotask(() => AID.charts.eventStudy(c.canvas, {
      labels, values: rows.map((r) => r.pct ?? null), lo: rows.map((r) => r.lo ?? null), hi: rows.map((r) => r.hi ?? null),
      post: rows.map((r) => r.post), markerIndex: rows.findIndex((r) => r.k === 0),
      xAxisTitle: 'Months before / after each developer started using AI',
      zones: { before: ['Before AI: should be flat near 0', 'Before AI'], after: ['After AI: the effect', 'After AI'] },
      xTitle: (i) => (rows[i].k === 0 ? 'Adoption month' : 'Month ' + labels[i] + ' vs adoption'),
      valueFmt: (v) => F.pct(v),
      tooltipLines: (i) => [rows[i].lo != null ? '95% CI ' + F.pct(rows[i].lo) + ' to ' + F.pct(rows[i].hi) : '', rows[i].n + ' developers'],
    }));
    c.setTable(() => table([
      { label: 'Months since adoption', value: (r) => r.k, format: (v, r) => (r.k > 0 ? '+' + r.k : String(r.k)) },
      { label: 'Effect', num: true, value: (r) => r.pct, format: (v) => F.pct(v) },
      { label: '95% CI', num: true, value: (r) => r.lo, format: (v, r) => (r.lo == null ? '—' : F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0)) },
      { label: 'Developers', num: true, value: (r) => r.n },
    ], rows, { sortCol: 0, sortDir: 1 }));
    return c.el;
  }

  // One-paragraph reading of the event study: was there a trend before AI, when does a clear effect start, and how big is it.
  function eventSummary(rows, meta) {
    const pre = rows.filter((r) => !r.post && r.pct != null), post = rows.filter((r) => r.post && r.pct != null);
    const parts = [el('strong', { text: 'In short: ' })];
    if (pre.length >= 3) {
      const lo = Math.min(...pre.map((r) => r.pct)), hi = Math.max(...pre.map((r) => r.pct));
      const fit = AID.analysis.linearFit(pre.map((r) => r.k), pre.map((r) => r.pct));
      const drift = fit.slope * (pre[pre.length - 1].k - pre[0].k);
      if (Math.max(Math.abs(lo), Math.abs(hi)) <= 0.05 && Math.abs(drift) <= 0.04) {
        parts.push('before AI, adopters were on track (between ' + F.pct(lo, 0) + ' and ' + F.pct(hi, 0) + ', no trend). ');
      } else {
        parts.push('before AI, adopters were already changing (' + F.pct(pre[0].pct, 0) + ' at month ' + pre[0].k + ', ' + F.pct(pre[pre.length - 1].pct, 0) + ' at month ' + pre[pre.length - 1].k + '). Part of the effect after adoption may not come from AI. ');
      }
    }
    const down = meta.better === 'down';
    const good = (r) => (down ? r.hi < 0 : r.lo > 0), bad = (r) => (down ? r.lo > 0 : r.hi < 0);
    const first = post.find((r) => good(r) || bad(r));
    if (!first) {
      parts.push('After adoption there is no clear effect in the ' + (post.length ? post[post.length - 1].k + 1 : 0) + ' months shown.');
    } else {
      const from = post.filter((r) => r.k >= first.k);
      const avg = from.reduce((x, r) => x + r.pct, 0) / from.length;
      const mo = first.k === 0 ? 'the adoption month' : 'month +' + first.k;
      parts.push(good(first) ? 'The effect is clear from ' + mo + ' and averages ' : meta.short + ' got worse from ' + mo + ', by ',
        el('strong', { text: F.pct(avg, 0) }), ' from then on' + (down ? ' (lower is better).' : '.'));
    }
    return parts;
  }

  // ---------------- Trend cards ----------------
  function adoptionCard(ctx, t) {
    const a = ctx.adoptionSeries();
    const c = card({ id: 'exec-adoption', help: 'c-adoption', title: 'AI adoption over time', sub: 'Share of developers using Cursor in each month.', height: 260 });
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
      id: 'exec-trend', height: 260, help: 'c-tier-trend',
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

    const rows = ctx.didByGroup(metric, level).filter((r) => r.pct != null);
    if (!rows.length) { wrap.appendChild(el('div.card', el('p.empty-note', { text: 'Not enough adopters with months before and after adoption in these groups.' }))); return wrap; }
    rows.sort((a, b) => b.score - a.score);
    const reliable = rows.filter((r) => !r.lowSample);

    // Insights
    const ins = el('ul.insights');
    const best = reliable[0], worst = reliable[reliable.length - 1];
    if (best) ins.appendChild(el('li', el('span', 'Largest AI effect: ', el('strong', { text: best.group }), ' (' + F.pct(best.pct) + ', ' + Math.round((best.adoption || 0) * 100) + '% adoption).')));
    if (worst && worst !== best) ins.appendChild(el('li', el('span', 'Smallest AI effect: ', el('strong', { text: worst.group }), ' (' + F.pct(worst.pct) + ', ' + Math.round((worst.adoption || 0) * 100) + '% adoption).')));
    const xs = reliable.map((r) => r.adoption), ys = reliable.map((r) => r.score);
    const corr = reliable.length >= 4 ? AID.analysis.correlate(xs, ys, 'pearson') : { r: null };
    if (corr.r != null) {
      const s = Math.abs(corr.r) >= 0.5 ? 'strongly' : Math.abs(corr.r) >= 0.3 ? 'moderately' : 'weakly';
      ins.appendChild(el('li', el('span', 'Across ' + levelLabel + 's, adoption and improvement are ', el('strong', { text: s + (corr.r >= 0 ? ' linked' : ' inversely linked') }), ' (r = ' + corr.r.toFixed(2) + '). ' +
        (corr.r >= 0.3 ? 'Groups that use AI more got a larger effect.' : corr.r <= -0.3 ? 'Higher adoption did not bring larger gains.' : 'Adoption alone does not explain the differences.'))));
    }
    const small = rows.length - reliable.length;
    if (small) ins.appendChild(el('li', el('span', { text: small + ' ' + levelLabel + (small > 1 ? 's have' : ' has') + ' fewer than ' + ctx.minGroup + ' adopters with months before and after adoption. They are left out of the chart and ranking, and shown pale in the table.' })));
    wrap.appendChild(el('div.card', el('div.card-title', { style: { marginBottom: '10px' } }, el('h3', { text: 'Key findings', style: { fontSize: '15px' } }), AID.help.button('c-groups')), ins));

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
      id: 'exec-groups', help: 'c-groups', height: Math.max(180, shown.length * 26 + 50),
      title: 'AI effect on ' + meta.short + ' by ' + levelLabel,
      sub: 'Blue = better, red = worse. Pale bars are not statistically clear (the 95% confidence interval includes zero).',
    });
    grid.appendChild(barCard.el);
    if (note) barCard.foot.textContent = note;
    queueMicrotask(() => AID.charts.bars(barCard.canvas, {
      labels: shown.map((r) => r.group), values: shown.map((r) => r.pct), horizontal: true,
      colors: shown.map((r) => changeColor(r, t)), axisFmt: (v) => Math.round(v * 100) + '%', valueFmt: (v) => F.pct(v, 0),
      tooltipLines: (i) => { const r = shown[i]; return [F.metric(r.after, metric) + ' actual vs ' + F.metric(r.before, metric) + ' expected', ciText(r), r.n + ' developers · ' + Math.round((r.adoption || 0) * 100) + '% adoption']; },
    }));
    barCard.setTable(() => groupTable(rows, metric, level));

    // Adoption vs impact scatter
    const sc = card({ id: 'exec-adopt-impact', help: 'c-adopt-impact', height: Math.min(Math.max(260, shown.length * 26 + 50), 420), title: 'Adoption vs impact', sub: 'Each dot is a ' + levelLabel + '. Up and to the right = high adoption and a large AI effect.' });
    grid.appendChild(sc.el);
    const pts = reliable.map((r) => ({ x: r.adoption * 100, y: r.score * 100, r }));
    const labelIdx = new Set(pts.length <= 8 ? pts.map((_, i) => i) : [0, 1, 2, pts.length - 1, pts.length - 2]);
    const fit = pts.length >= 4 ? AID.analysis.linearFit(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
    queueMicrotask(() => AID.charts.scatter(sc.canvas, {
      datasets: [{ name: levelLabel, points: pts, color: t.series[0] }], radius: 5, alpha: 0.85, zeroLines: true,
      xUnit: 'pct', yUnit: 'pct', xLabel: 'Adoption (share of months active)', yLabel: 'AI effect on ' + meta.short,
      fit: fit ? Object.assign(fit, { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)) }) : null,
      title: (p) => p.r.group,
      label: (p) => ['Adoption ' + Math.round(p.x) + '%', meta.short + ' ' + F.pct(p.r.pct), p.r.n + ' developers'],
      pointLabels: [...labelIdx].map((i) => ({ datasetIndex: 0, index: i, text: pts[i].r.group })),
    }));
    sc.setTable(() => groupTable(rows, metric, level));

    // Full table
    wrap.appendChild(el('div.card',
      el('div.card-head', el('div', titleRow('All ' + levelLabel + 's', 'c-groups-table'), el('p.sub', { text: 'Click a column header to sort. AI effect = actual vs expected without AI, averaged over adopters.' }))),
      groupTable(rows, metric, level)));
    return wrap;
  }

  function groupTable(rows, metric, level) {
    const cols = [{ label: GROUP_LEVELS.find((g) => g.value === level).label, value: (r) => r.group }];
    if (level === 'team') cols.push({ label: 'Domain', value: (r) => r.parent }, { label: 'Manager', value: (r) => r.manager });
    if (level === 'domain') cols.push({ label: 'Org', value: (r) => r.parent });
    cols.push(
      { label: 'Adopters', num: true, value: (r) => r.n, title: 'Adopters with enough months before and after adoption' },
      { label: 'Adoption', num: true, value: (r) => r.adoption, format: (v) => (v == null ? '—' : Math.round(v * 100) + '%') },
      { label: 'Avg active days', num: true, value: (r) => r.avgActiveDays, format: (v) => F.value(v, 'count') },
      { label: 'Expected', num: true, value: (r) => r.before, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'Actual', num: true, value: (r) => r.after, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'AI effect', num: true, value: (r) => r.pct, sortValue: (r) => r.score, format: (v) => F.pct(v) },
      { label: '95% CI', num: true, value: (r) => r.lo, format: (v, r) => (r.lo == null ? '—' : F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0)) },
      { label: 'Status', value: (r) => r.status, cell: (r) => (r.lowSample ? el('span.chip', icon('warn'), 'Small sample') : statusChip(r)) });
    return table(cols, rows, { sortCol: cols.findIndex((c) => c.label === 'AI effect'), sortDir: -1, rowClass: (r) => (r.lowSample ? 'muted' : '') });
  }

  // ---------------- Dimension × AI usage tier ----------------
  const CROSS_DIMS = [{ value: 'level', label: 'Job level' }, { value: 'org', label: 'Org' }];
  const CROSS_MODES = [{ value: 'did', label: 'AI effect' }, { value: 'lift', label: 'Lift vs non-adopters' }];
  const fmtPts0 = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v * 100) + ' pts');

  // 'did'  = DiD effect per cell (adopters only; non-adopters are the comparison group).
  // 'lift' = before/after change of each tier minus that of non-adopters in the same row.
  function crossSection(ctx, app, metric, meta, t) {
    const st = app.state.exec;
    const dim = st.crossBy, lift = st.crossMode === 'lift';
    const dimLabel = CROSS_DIMS.find((d) => d.value === dim).label;
    const data = ctx.compareCross(metric, dim, lift ? 'change' : 'did');
    const wrap = el('div.page');
    wrap.appendChild(el('div.section-head',
      el('h2', { text: 'Impact by ' + dimLabel.toLowerCase() + ' and AI usage' }),
      el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        seg('Rows', CROSS_DIMS, dim, (v) => app.update({ exec: { crossBy: v } })),
        seg('Measure', CROSS_MODES, lift ? 'lift' : 'did', (v) => app.update({ exec: { crossMode: v } })))));
    if (!data.length) { wrap.appendChild(el('div.card', el('p.empty-note', { text: 'Not enough data.' }))); return wrap; }

    const ins = el('ul.insights');
    if (lift) {
      // Heavy users vs non-adopters in each row.
      const pairs = data.map((r) => ({ row: r.row, heavy: r.cells[3], none: r.cells[0] })).filter((x) => x.heavy.lift != null);
      for (const x of pairs) {
        const dir = x.heavy.lift >= 0 ? 'better' : 'worse';
        ins.appendChild(el('li', el('span', el('strong', { text: x.row }), ': heavy users ' + F.pct(x.heavy.pct) + ' vs ' + F.pct(x.none.pct) + ' for non-adopters → ',
          el('strong', { text: fmtPts0(Math.abs(x.heavy.lift)).replace('+', '') + ' ' + dir }),
          x.heavy.liftSig ? ' (95% CI ' + fmtPts0(x.heavy.liftLo) + ' to ' + fmtPts0(x.heavy.liftHi) + ').' : ' (not statistically clear).')));
      }
      if (pairs.length >= 2) {
        const sorted = pairs.slice().sort((a, b) => b.heavy.lift - a.heavy.lift);
        ins.appendChild(el('li', el('span', 'The lift is largest for ', el('strong', { text: sorted[0].row }), ' and smallest for ', el('strong', { text: sorted[sorted.length - 1].row }), '.')));
      }
      if (!pairs.length) ins.appendChild(el('li', el('span', { text: 'Too few non-adopters (or heavy users) per ' + dimLabel.toLowerCase() + ' to measure lift. Use the AI effect view.' })));
    } else {
      // Heavy vs light users' effect in each row.
      const rowsH = data.filter((r) => !r.cells[3].lowSample);
      for (const r of rowsH) {
        const hv = r.cells[3], lt = r.cells[1];
        ins.appendChild(el('li', el('span', el('strong', { text: r.row }), ': heavy users ', el('strong', { text: F.pct(hv.pct) }),
          hv.sig ? ' (95% CI ' + F.pct(hv.lo, 0) + ' to ' + F.pct(hv.hi, 0) + ')' : ' (not statistically clear)',
          lt.lowSample ? '.' : ', light users ' + F.pct(lt.pct) + '.')));
      }
      if (rowsH.length >= 2) {
        const sorted = rowsH.slice().sort((a, b) => b.cells[3].score - a.cells[3].score);
        ins.appendChild(el('li', el('span', 'For heavy users, the AI effect is largest for ', el('strong', { text: sorted[0].row }), ' and smallest for ', el('strong', { text: sorted[sorted.length - 1].row }), '.')));
      }
      if (!rowsH.length) ins.appendChild(el('li', el('span', { text: 'Too few heavy users per ' + dimLabel.toLowerCase() + ' to measure the effect.' })));
    }
    const tierIdx = [1, 2, 3];
    const hidden = data.reduce((s, r) => s + tierIdx.filter((ti) => r.cells[ti].lowSample && r.cells[ti].devCount > 0).length, 0);
    if (hidden) ins.appendChild(el('li', el('span', { text: hidden + ' cell' + (hidden > 1 ? 's have' : ' has') + ' fewer than ' + ctx.minGroup + ' developers with enough data and ' + (hidden > 1 ? 'are' : 'is') + ' hidden from the chart.' })));

    // Grouped bars: one group per row value, one bar per usage tier.
    const cellOf = (si, i) => data[i].cells[tierIdx[si]];
    const series = tierIdx.map((ti) => ({
      name: ctx.TIERS[ti], color: t.tiers[ti],
      values: data.map((r) => { const c = r.cells[ti]; return c.lowSample ? null : lift ? (c.lift ?? null) : c.pct; }),
      errors: data.map((r) => { const c = r.cells[ti]; if (c.lowSample) return null; return lift ? (c.lift != null ? [c.liftLo, c.liftHi] : null) : [c.lo, c.hi]; }),
    }));
    const c = card({
      id: 'exec-cross', height: 340, help: 'c-cross',
      title: lift ? meta.short + ': improvement beyond non-adopters' : 'AI effect on ' + meta.short + ' by ' + dimLabel.toLowerCase() + ' and usage tier',
      sub: (lift
        ? 'Each bar = the tier\'s before/after change minus the change of non-adopters in the same ' + dimLabel.toLowerCase() + ', in percentage points. Positive = better.'
        : 'Each bar = actual vs expected without AI, for adopters in that tier. Non-adopters have no AI months, so they have no bar.' + (meta.better === 'down' ? ' Lower is better for this metric, so a negative effect is an improvement.' : '')) +
        ' Whiskers = 95% confidence interval.',
    });
    queueMicrotask(() => AID.charts.grouped(c.canvas, {
      labels: data.map((r) => r.row), series,
      axisFmt: (v) => Math.round(v * 100) + (lift ? ' pts' : '%'),
      valueFmt: lift ? fmtPts0 : (v) => F.pct(v),
      tooltipLines: (si, i) => {
        const x = cellOf(si, i);
        if (lift) return [F.metric(x.before, metric) + ' → ' + F.metric(x.after, metric) + ' (' + F.pct(x.pct) + ')', x.n + ' developers', '95% CI ' + fmtPts0(x.liftLo) + ' to ' + fmtPts0(x.liftHi)];
        return [F.metric(x.after, metric) + ' actual vs ' + F.metric(x.before, metric) + ' expected', x.n + ' adopters', ciText(x)];
      },
    }));
    c.setTable(() => crossTable(ctx, data, dimLabel, lift));

    const side = el('section.card',
      el('div.card-title', { style: { marginBottom: '10px' } }, el('h3', { text: lift ? 'Heavy users vs non-adopters' : 'AI effect by usage tier', style: { fontSize: '15px' } }), AID.help.button(lift ? 'm-lift' : 'c-cross')), ins,
      crossTable(ctx, data, dimLabel, lift),
      el('p.card-foot', { text: (lift
        ? 'Non-adopter column = their % change. Other columns = lift over non-adopters, in percentage points. n = developers with 2+ months before and after. '
        : 'Values = AI effect (actual vs expected without AI). n = adopters with 2+ months before and after adoption. ') + 'Bold = statistically clear (95% CI excludes zero).' }));
    wrap.appendChild(el('div.grid-3-2', c.el, side));
    return wrap;
  }

  function crossTable(ctx, data, dimLabel, lift) {
    const cols = [{ label: dimLabel, value: (r) => r.row }];
    ctx.TIER_SHORT.forEach((name, ti) => {
      if (!lift && ti === 0) return; // non-adopters are the DiD comparison group
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
