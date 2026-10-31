/* Executive summary: "Are developers more productive since AI adoption?" and "Which groups are most impacted?" */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el, select, seg, statusChip, answerChip, table, card, icon, titleRow } = AID.ui;
  const F = AID.fmt;

  const HEADLINE_OPTIONS = ['prsMerged', 'throughput', 'medianCycleDays'];
  const GROUP_LEVELS = [{ value: 'org', label: 'Org' }, { value: 'domain', label: 'Domain' }, { value: 'team', label: 'Team' }, { value: 'level', label: 'Job level' }];
  const BAR_LIMIT = 20;
  let stickyObs = null;

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
    const metric = HEADLINE_OPTIONS.includes(st.metric) ? st.metric : HEADLINE_OPTIONS[0]; // a saved choice can be an option that was removed
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
      return Object.assign(ctx.did(metric, list, null, head.before), { tier, devCount: list.length }); // % of the headline's expected value
    });

    // The headline metric bar stays under the top bar while the page scrolls. When pinned, it also shows the headline effect.
    const sentinel = el('div.sticky-sentinel');
    const bar = el('div.section-head.exec-head',
      el('h2', { text: 'Executive summary' }),
      el('span.exec-head-effect', 'AI effect on ' + meta.label + ': ', el('strong', { text: head.pct != null ? F.pct(head.pct) : '—' })),
      el('div', { style: { marginLeft: 'auto' } }, select('Headline metric', AID.ui.metricOptions(HEADLINE_OPTIONS), metric, (v) => app.update({ exec: { metric: v } }))));
    page.append(sentinel, bar);
    if (stickyObs) stickyObs.disconnect();
    if (window.IntersectionObserver) {
      const top = document.getElementById('tabs').closest('.topbar').offsetHeight;
      stickyObs = new IntersectionObserver(([e]) => bar.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < top + 1), { rootMargin: -(top + 1) + 'px 0px 0px 0px' });
      stickyObs.observe(sentinel);
    }

    page.appendChild(verdictCard(ctx, head, keyRes, quality, tiers, metric));
    page.appendChild(kpiSection(ctx, keyRes, quality));
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
      const q = quality.status === 'worse' ? (quality.slight ? 'got slightly worse' : 'got worse') : quality.status === 'improved' ? (quality.slight ? 'improved slightly' : 'improved')
        : quality.likely === 'worse' ? 'likely got worse' : quality.likely === 'improved' ? 'likely improved' : 'held steady';
      parts.push('Quality (reopen rate) ', el('strong', { text: q }), ' (' + F.pct(quality.pct) + '). ');
    }
    const bugs = ctx.teamEffect('bugRate');
    if (bugs.pct != null && !bugs.wide) {
      const q = bugs.status === 'worse' ? 'rose' : bugs.status === 'improved' ? 'fell' : bugs.likely === 'worse' ? 'likely rose' : bugs.likely === 'improved' ? 'likely fell' : 'did not clearly change';
      parts.push('Bugs per 100 PRs ', el('strong', { text: q }), ' as teams adopted AI (' + F.pct(bugs.pct) + ' at full adoption). ');
    }
    // Dose: if AI drives the change, the effect grows with usage.
    const lt = tiers[1], hv = tiers[2];
    if (lt.pct != null && hv.pct != null && !lt.wide && !hv.wide) {
      const gap = hv.score - lt.score;
      parts.push('The effect is ', el('strong', { text: F.pct(hv.pct) }), ' for high-usage developers vs ', el('strong', { text: F.pct(lt.pct) }), ' for low-usage developers — ',
        gap > 0.02 ? 'it grows with usage, which supports AI as the cause. Developers who got value may also have used it more, so this is support, not proof.' : gap < -0.02 ? 'it does not grow with usage, so something other than AI use is the more likely cause.' : 'too small a gap to link the effect to usage.');
    }
    left.appendChild(el('p.verdict-text', parts));

    const fit = ctx.didFit(metric);
    left.appendChild(el('p.method-note', {
      text: 'Method: difference-in-differences. Each adopter is split at their own adoption month (first month with ' + ctx.thr + '+ ' + AID.M.activeDays.label + '). ' +
        'Their results after adoption are compared with the value expected from their own level before adoption plus the company-wide change in the same month. ' +
        'The company-wide change comes from ' + controlText(fit) + '. ' +
        head.n + ' adopters have ' + AID.analysis.MIN_MONTHS_PER_SIDE + '+ months on both sides.' +
        (ctx.ramp ? ' ' + ctx.ramp + ' ramp-up month(s) after adoption excluded.' : '') +
        (ctx.onboarding.months && ctx.onboarding.newHires ? ' The first ' + ctx.onboarding.months + ' month(s) of ' + ctx.onboarding.newHires + ' new hires are excluded as onboarding.' : '') +
        (fit.dropped ? ' ' + fit.dropped + ' adopter-months are left out because their month has fewer than ' + AID.analysis.MIN_CONTROL_DEVS + ' comparison developers.' : '') +
        (fit.otherMonths ? ' ' + fit.otherMonths + ' developer-months with ' + ctx.thr + '+ ' + ctx.otherTool + ' active days are left out, so the effect compares ' + AID.tool.label + ' alone with no AI.' : ''),
    }));

    // Right side: change by AI usage tier. The bars share one scale with zero marked: right = positive, left = negative.
    // Color = better (blue) or worse (red), pale when not statistically clear, as in the group charts.
    const shown = (x) => x.pct != null && !x.wide;
    const vals = tiers.slice(1).filter(shown).map((x) => x.pct);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = Math.max(0.01, hi - lo);
    const pos = (v) => ((v - lo) / span) * 100;
    const t = AID.charts.theme();
    const rows = tiers.map((x, i) => {
      if (i === 0) {
        return el('div.score-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
          el('div', el('div.name', { text: x.tier }), el('div', { style: { fontSize: '11px', color: 'var(--muted)' }, text: x.devCount + ' developers · ' + (ctx.control === 'notyet' ? 'not used' : (ctx.control === 'never' ? 'the comparison group' : 'part of the comparison group') + (ctx.otherTool ? ' (months without ' + ctx.otherTool + ')' : '')) })),
          el('div.val', { text: '—', style: { color: 'var(--muted)' } }));
      }
      const bar = el('div.tier-track', lo < 0 ? el('div.tier-zero', { style: { left: pos(0) + '%' } }) : null,
        shown(x) ? el('div.tier-bar', { style: { left: Math.min(pos(0), pos(x.pct)) + '%', width: Math.max(1, Math.abs(pos(x.pct) - pos(0))) + '%', background: changeColor(x, t) } }) : null);
      return el('div.score-row', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
        el('div', el('div.name', { text: x.tier }), el('div', { style: { fontSize: '11px', color: 'var(--muted)' }, text: x.n + ' developers' + (x.lo != null ? ' · ' + ciText(x) : '') }), bar),
        el('div.val', { text: x.wide ? 'Too uncertain' : x.pct != null ? F.pct(x.pct) : '—', style: x.wide ? { color: 'var(--muted)', fontSize: '12px' } : null }));
    });
    const right = el('div.verdict-side',
      el('div.card-title', el('p.verdict-q', { text: 'AI effect on ' + meta.short + ' by AI usage level' }), AID.help.button('m-tiers')),
      el('div.scorecard', rows),
      el('p.method-note', { text: (ctx.tierBasis === 'spend'
        ? 'Usage level = the adopters split at the median of average ' + AID.M.spendDollars.label + ' per month in the after period. Non-adopter = under ' + AID.analysis.NON_ADOPTER_DAYS + ' active day per month.'
        : 'Usage level = average ' + AID.M.activeDays.label + ' per month in the after period.') + ' Each effect is a % of the expected value for all adopters. Blue = better, red = worse' + (meta.better === 'down' ? ' (lower is better for this metric)' : '') + '. Pale = not statistically clear.' }),
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
  // Tiles in five groups. AI can raise PR counts by making PRs larger, by adding rework, or by moving work to reviewers,
  // so output tiles sit next to the tiles that show whether the extra output is real, what it costs reviewers, and its quality.
  // Developer tiles show the DiD effect (actual vs expected without AI). Team tiles show the team-level effect (0% vs 100% adoption).
  // Ordered so that each row is full on wide screens: 4 (wider tiles, span = the full row) | 2 + 3 | 3 + 2.
  const KPI_GROUPS = [
    { title: 'Output and speed', sub: 'AI effect: actual vs expected without AI. The developer tiles here set the verdict.', span: 5, tiles: ['prsMerged', 'throughput', 'medianCycleDays', 'team:prsPerDev'] },
    { title: 'Is the extra output real?', sub: 'More PRs can come from larger PRs, or from code that is soon rewritten.', tiles: ['medianPrSizeLines', 'churnRatePct'] },
    { title: 'Review load', sub: 'More code needs more review. Slower first reviews or merges mean reviewers are the bottleneck.', tiles: ['prsReviewed', 'medianTimeToFirstReviewHours', 'medianTimeToMergeHours'] },
    { title: 'Quality', sub: 'More output with more bugs or reopened tickets is not a gain.', tiles: ['reopenRatePct', 'team:bugRate', 'team:escapedBugRate'] },
    { title: 'AI use and cost', sub: 'Before vs after the split.', tiles: ['adoption', 'spend'] },
  ];

  function kpiSection(ctx, keyRes, quality) {
    const t = AID.charts.theme();
    const markerIdx = ctx.perDev ? null : ctx.months.indexOf(ctx.rolloutIdx);
    const known = new Map(keyRes.concat([quality]).map((c) => [c.key, c]));
    const make = (id) => {
      if (id === 'adoption') return adoptionTile(ctx, t, markerIdx);
      if (id === 'spend') return spendTile(ctx, markerIdx);
      if (id.startsWith('team:')) return teamTile(ctx, id.slice(5), markerIdx);
      return devTile(ctx, known.get(id) || ctx.did(id), markerIdx);
    };
    return el('div.kpi-groups', KPI_GROUPS.map((g) => el('section.kpi-group', { style: '--span: ' + (g.span || g.tiles.length) + '; --cols: ' + g.tiles.length },
      el('div.kpi-group-head', el('h3', { text: g.title }), el('p', { text: g.sub })),
      el('div.kpi-grid', g.tiles.map(make)))));
  }
  const kpiChip = (c) => (c.wide ? el('span.chip', icon('warn'), '95% CI too wide') : statusChip(c));
  const signed = (v, f) => (v > 0 ? '+' : v < 0 ? '−' : '') + f(Math.abs(v));

  // Adoption tile: share of developer-months with the active threshold, before vs after.
  function adoptionTile(ctx, t, markerIdx) {
    const adopt = ctx.adoptionSeries();
    const share = phaseShare(ctx, (r) => r.v.activeDays >= ctx.thr);
    const pts = share.b != null && share.a != null ? share.a - share.b : null;
    return tile('AI adoption', AID.tool.label, pts != null ? signed(Math.round(pts * 100), String) : '—', pts != null ? 'pts' : '', null,
      [el('span', { text: pts != null ? pct0(share.b) + ' → ' + pct0(share.a) + ' of developers used ' + AID.tool.any + ' ' + ctx.thr + '+ days / mo' : (ctx.noBeforeText ? 'No months before the split. See Settings.' : 'Not enough data') })],
      AID.charts.sparkline(adopt.active, { color: t.series[0], markerIndex: markerIdx, zero: true }), null, 'kpi-adoption');
  }

  // Spend tile: change in AI tool spend per developer per month.
  function spendTile(ctx, markerIdx) {
    const sp = ctx.compare('spendDollars');
    const cppRes = ctx.compare('costPerMergedPr');
    const spend = ctx.series('spendDollars', { agg: 'mean' }).series[0];
    return tile(AID.M.spendDollars.label, AID.tool.label, sp.diff != null ? signed(sp.diff, (v) => F.value(v, 'usd')) : '—', sp.diff != null ? '/ dev / mo' : '', null,
      [el('span', { text: sp.diff != null ? F.value(sp.before, 'usd') + ' → ' + F.value(sp.after, 'usd') + ' · ' + F.value(cppRes.after, 'usd') + ' per merged PR' : (ctx.noBeforeText ? 'No months before the split. See Settings.' : 'Not enough data') })],
      spend ? AID.charts.sparkline(spend.values, { markerIndex: markerIdx, zero: true }) : null, null, 'kpi-spend');
  }

  // The CSV column a developer metric needs, if no row has a value for it.
  function missingColumn(ctx, key) {
    const col = key === 'churnRatePct' ? 'churnedLines' : key;
    if (!AID.M[col] || !AID.M[col].optional) return null;
    return ctx.ds.rows.some((r) => r.raw[col] != null) ? null : col;
  }

  function devTile(ctx, c, markerIdx) {
    const m = AID.M[c.key];
    const col = missingColumn(ctx, c.key);
    if (col) return missingTile(m.label, m.source, 'Add the ' + col + ' column to developer_monthly_metrics.csv.', 'metric:' + c.key);
    const s = ctx.series(c.key, { agg: 'mean' }).series[0];
    const unit = m.unit === 'count' ? ' / dev / mo' : '';
    const tone = c.wide ? null : c.status === 'improved' ? 'good' : c.status === 'worse' ? 'bad' : null;
    return tile(m.label, m.source, c.wide ? 'Too uncertain' : c.pct != null ? F.pct(c.pct) : '—', '', tone,
      [kpiChip(c), el('span', { text: c.pct != null ? F.metric(c.after, c.key, { short: true }) + ' vs ' + F.metric(c.before, c.key, { short: true }) + ' expected' + unit : 'Not enough data' })],
      s ? AID.charts.sparkline(s.values, { markerIndex: markerIdx }) : null,
      c.lo != null ? ciText(c) : null, 'metric:' + c.key);
  }

  function teamTile(ctx, key, markerIdx) {
    const m = AID.TM[key];
    const c = ctx.teamEffect(key);
    if (c.missingCol) {
      return missingTile(m.label, 'Team', ctx.hasTeams ? 'Add the ' + c.missingCol + ' column to team_monthly_metrics.csv.' : 'Load team_monthly_metrics.csv with a ' + m.col + ' column.', 'm-team');
    }
    const tone = c.wide ? null : c.status === 'improved' ? 'good' : c.status === 'worse' ? 'bad' : null;
    const v = (x) => F.value(x, 'count');
    return tile(m.label, 'Team', c.wide ? 'Too uncertain' : c.pct != null ? F.pct(c.pct) : '—', '', tone,
      [kpiChip(c), el('span', { text: c.pct != null ? v(c.before) + ' → ' + v(c.after) + ' from 0% to 100% team adoption · ' + c.n + ' teams' : c.n ? 'Not enough data: ' + c.n + ' teams (needs ' + AID.analysis.MIN_TEAMS + '+)' : 'Not enough data' })],
      AID.charts.sparkline(ctx.teamSeries(key), { markerIndex: markerIdx }),
      c.lo != null ? ciText(c) : null, 'm-team');
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

  function missingTile(label, src, text, helpId) {
    return el('div.card.kpi.missing',
      el('div.kpi-label', el('span.kpi-name', el('span', { text: label }), helpId ? AID.help.button(helpId) : null), el('span.src', { text: src })),
      el('div.kpi-value', { text: 'No data' }),
      el('div.kpi-meta', el('span', { text })));
  }

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
    // Months with a CI wider than WIDE_CI are not drawn: their value says nothing.
    const rows = ctx.eventStudy(metric).map((r) => (r.wide ? Object.assign({}, r, { pct: null, lo: null, hi: null }) : r));
    const wide = rows.filter((r) => r.wide).length;
    const labels = rows.map((r) => (r.k > 0 ? '+' + r.k : String(r.k)));
    const c = card({
      id: 'exec-event', height: 300, help: 'c-event',
      title: 'AI effect on ' + meta.short + ' by month since adoption',
      sub: 'Each point = actual minus expected without AI, as a % of the average expected value for all adopters. Band = 95% confidence interval.' + (meta.better === 'down' ? ' Lower is better for this metric.' : '') +
        (wide ? ' ' + wide + ' month' + (wide > 1 ? 's are' : ' is') + ' not drawn: too uncertain.' : ''),
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
      { label: 'Effect', num: true, value: (r) => r.pct, format: (v, r) => (r.wide ? 'Too uncertain' : F.pct(v)) },
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
    const c = card({ id: 'exec-adoption', help: 'c-adoption', title: 'AI adoption over time', sub: 'Share of developers using ' + AID.tool.any + ' in each month.', height: 260 });
    const markerIdx = ctx.perDev ? -1 : ctx.months.indexOf(ctx.rolloutIdx);
    const both = AID.tool.key === 'both';
    const series = [
      { name: (both ? 'Either tool' : 'Active') + ' (' + ctx.thr + '+ days)', values: a.active, color: t.series[0] },
      { name: 'High usage (' + ctx.hi + '+ days)', values: a.high, color: t.series[1] },
    ];
    // Both view: each tool on its own (dashed), so a move from one tool to the other is visible.
    if (both) series.push({ name: 'Cursor (' + ctx.thr + '+)', values: a.cursor, color: t.series[2], dash: [5, 4] }, { name: 'Copilot (' + ctx.thr + '+)', values: a.copilot, color: t.series[3], dash: [5, 4] });
    if (both) c.box.before(el('p.chart-summary', { text: ctx.ds.tools.combined
      ? 'Either tool = ' + ctx.thr + '+ days with Cursor or Copilot activity (combinedActiveDays). A day with both tools counts once, so a developer can reach ' + ctx.thr + ' days without ' + ctx.thr + ' days in one tool.'
      : 'Either tool = ' + ctx.thr + '+ days in Cursor or in Copilot. The file has no combinedActiveDays column, so days with each tool on different days are not added together.' }));
    queueMicrotask(() => AID.charts.line(c.canvas, { labels: a.labels, series, pctAxis: true, marker: markerIdx >= 0 ? { index: markerIdx, label: 'AI rollout' } : null, endLabels: true }));
    const pctCol = (s) => ({ label: s.name, num: true, value: (r) => s.values[r.i], format: (v) => (v == null ? '—' : Math.round(v * 100) + '%') });
    c.setTable(() => table(
      [{ label: 'Month', value: (r) => r.i, format: (v) => a.labels[v], sortValue: (r) => r.i }, { label: 'Developers', num: true, value: (r) => a.n[r.i] }].concat(series.map(pctCol)),
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
      sub: (rel ? 'Months before and after each developer adopted AI. ' : 'Average per developer per month. ') + 'If AI drives the change, the high-usage line pulls away from the non-adopter line after adoption.',
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
    const shrunk = rows.filter((r) => r.raw);
    if (shrunk.length) {
      const moved = shrunk.filter((r) => r.shrink >= 0.5).length;
      ins.appendChild(el('li', el('span', 'Each ' + levelLabel + '\'s estimate is pulled toward its ' + (level === 'team' ? 'domain' : level === 'domain' ? 'org' : 'parent group') + ' in proportion to its own noise. ',
        el('strong', { text: moved + ' of ' + shrunk.length }), ' moved more than half way. The table shows the raw estimate next to the pulled one. Settings turns this off.')));
    }
    const small = rows.filter((r) => r.n < ctx.minGroup).length, wide = rows.length - reliable.length - small;
    if (small) ins.appendChild(el('li', el('span', { text: small + ' ' + levelLabel + (small > 1 ? 's have' : ' has') + ' fewer than ' + ctx.minGroup + ' adopters with months before and after adoption. They are left out of the chart and ranking, and shown pale in the table.' })));
    if (wide) ins.appendChild(el('li', el('span', { text: wide + ' ' + levelLabel + (wide > 1 ? 's have' : ' has') + ' a 95% CI wider than ' + AID.analysis.WIDE_CI * 100 + ' pts, which is too uncertain to read. They are left out of the chart and ranking, and shown pale in the table.' })));
    wrap.appendChild(el('div.card', el('div.card-title', { style: { marginBottom: '10px' } }, el('h3', { text: 'Key findings', style: { fontSize: '15px' } }), AID.help.button('c-groups')), ins));

    const grid = el('div.grid-3-2');
    wrap.appendChild(grid);

    // Ranked diverging bars. Groups with a small sample or a very wide CI are never drawn.
    const ranked = reliable;
    let shown = ranked, note = '';
    if (ranked.length > BAR_LIMIT) {
      shown = ranked.slice(0, BAR_LIMIT / 2).concat(ranked.slice(-BAR_LIMIT / 2));
      note = 'Showing the top ' + BAR_LIMIT / 2 + ' and bottom ' + BAR_LIMIT / 2 + ' of ' + ranked.length + ' ' + levelLabel + 's. The table below lists all of them.';
    }
    const barCard = card({
      id: 'exec-groups', help: 'c-groups', height: Math.max(180, shown.length * 26 + 50),
      title: 'AI effect on ' + meta.short + ' by ' + levelLabel,
      sub: 'Effect as a % of the expected value for all adopters, so groups compare on one scale. Blue = better, red = worse. Pale bars are not statistically clear (the 95% confidence interval includes zero).',
    });
    grid.appendChild(barCard.el);
    if (!ranked.length) barCard.empty('No ' + levelLabel + ' has ' + ctx.minGroup + '+ adopters and a readable CI. Use a higher group level, or lower the minimum group size in Settings.');
    if (note) barCard.foot.textContent = note;
    if (ranked.length) queueMicrotask(() => AID.charts.bars(barCard.canvas, {
      labels: shown.map((r) => r.group), values: shown.map((r) => r.pct), horizontal: true,
      colors: shown.map((r) => changeColor(r, t)), axisFmt: (v) => Math.round(v * 100) + '%', valueFmt: (v) => F.pct(v, 0),
      tooltipLines: (i) => { const r = shown[i]; return [F.metric(r.after, metric) + ' actual vs ' + F.metric(r.before, metric) + ' expected', ciText(r), r.n + ' developers · ' + Math.round((r.adoption || 0) * 100) + '% adoption'].concat(r.raw ? ['Raw ' + F.pct(r.raw.pct) + ' (' + F.pct(r.raw.lo, 0) + ' to ' + F.pct(r.raw.hi, 0) + '), pulled ' + Math.round(r.shrink * 100) + '% toward ' + r.shrinkTo] : []); },
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
      { label: 'Active d/mo', num: true, value: (r) => r.avgActiveDays, format: (v) => F.value(v, 'count'), title: 'Average active days per month in the after period' },
      { label: 'Expected', num: true, value: (r) => r.before, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'Actual', num: true, value: (r) => r.after, format: (v) => F.metric(v, metric, { short: true }) },
      { label: 'AI effect', num: true, value: (r) => r.pct, sortValue: (r) => r.score, format: (v) => F.pct(v), title: rows.some((r) => r.raw) ? 'Pulled toward the parent group in proportion to the group\'s own noise' : '' },
      { label: '95% CI', num: true, value: (r) => r.lo, format: (v, r) => (r.lo == null ? '—' : F.pct(r.lo, 0) + ' to ' + F.pct(r.hi, 0)) });
    if (rows.some((r) => r.raw)) cols.push(
      { label: 'Raw', num: true, value: (r) => (r.raw ? r.raw.pct : null), format: (v, r) => (r.raw ? F.pct(r.raw.pct) : '—'), title: 'Before the pull toward the parent group. Its 95% CI is in the bar tooltip.' },
      { label: 'Pulled', num: true, value: (r) => r.shrink, format: (v, r) => (r.shrink == null ? '—' : Math.round(r.shrink * 100) + '%'), title: 'Share of the distance to the parent group that the estimate moved' });
    cols.push(
      { label: 'Status', value: (r) => r.status, cell: (r) => (r.lowSample ? el('span.chip', icon('warn'), r.wide ? 'Too uncertain' : 'Small sample') : statusChip(r)) });
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
      // High-usage developers vs non-adopters in each row.
      const pairs = data.map((r) => ({ row: r.row, heavy: r.cells[2], none: r.cells[0] })).filter((x) => x.heavy.lift != null);
      for (const x of pairs) {
        const dir = x.heavy.lift >= 0 ? 'better' : 'worse';
        ins.appendChild(el('li', el('span', el('strong', { text: x.row }), ': high-usage developers ' + F.pct(x.heavy.pct) + ' vs ' + F.pct(x.none.pct) + ' for non-adopters → ',
          el('strong', { text: fmtPts0(Math.abs(x.heavy.lift)).replace('+', '') + ' ' + dir }),
          x.heavy.liftSig ? ' (95% CI ' + fmtPts0(x.heavy.liftLo) + ' to ' + fmtPts0(x.heavy.liftHi) + ').' : ' (not statistically clear).')));
      }
      if (pairs.length >= 2) {
        const sorted = pairs.slice().sort((a, b) => b.heavy.lift - a.heavy.lift);
        ins.appendChild(el('li', el('span', 'The lift is largest for ', el('strong', { text: sorted[0].row }), ' and smallest for ', el('strong', { text: sorted[sorted.length - 1].row }), '.')));
      }
      if (!pairs.length) ins.appendChild(el('li', el('span', { text: 'Too few non-adopters (or high-usage developers) per ' + dimLabel.toLowerCase() + ' to measure lift. Use the AI effect view.' })));
    } else {
      // High vs low usage effect in each row.
      const rowsH = data.filter((r) => !r.cells[2].lowSample);
      for (const r of rowsH) {
        const hv = r.cells[2], lt = r.cells[1];
        ins.appendChild(el('li', el('span', el('strong', { text: r.row }), ': high-usage developers ', el('strong', { text: F.pct(hv.pct) }),
          hv.sig ? ' (95% CI ' + F.pct(hv.lo, 0) + ' to ' + F.pct(hv.hi, 0) + ')' : ' (not statistically clear)',
          lt.lowSample ? '.' : ', low-usage developers ' + F.pct(lt.pct) + '.')));
      }
      if (rowsH.length >= 2) {
        const sorted = rowsH.slice().sort((a, b) => b.cells[2].score - a.cells[2].score);
        ins.appendChild(el('li', el('span', 'For high-usage developers, the AI effect is largest for ', el('strong', { text: sorted[0].row }), ' and smallest for ', el('strong', { text: sorted[sorted.length - 1].row }), '.')));
      }
      if (!rowsH.length) ins.appendChild(el('li', el('span', { text: 'Too few high-usage developers per ' + dimLabel.toLowerCase() + ' to measure the effect.' })));
    }
    const tierIdx = [1, 2];
    const hidden = data.reduce((s, r) => s + tierIdx.filter((ti) => r.cells[ti].lowSample && r.cells[ti].devCount > 0).length, 0);
    if (hidden) ins.appendChild(el('li', el('span', { text: hidden + ' cell' + (hidden > 1 ? 's are' : ' is') + ' hidden from the chart: fewer than ' + ctx.minGroup + ' developers with enough data, or a 95% CI wider than ' + AID.analysis.WIDE_CI * 100 + ' pts.' })));

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
        ? 'Each bar = the tier\'s before/after change minus the change of non-adopters in the same ' + dimLabel.toLowerCase() + ', in percentage points of the before value for all developers. Positive = better.'
        : 'Each bar = actual minus expected without AI, for adopters in that tier, as a % of the expected value for all adopters. Non-adopters have no AI months, so they have no bar.' + (meta.better === 'down' ? ' Lower is better for this metric, so a negative effect is an improvement.' : '')) +
        ' Whiskers = 95% confidence interval.',
    });
    if (!series.some((x) => x.values.some((v) => v != null))) c.empty(ctx.noBeforeText && lift ? ctx.noBeforeText : 'Every cell has fewer than ' + ctx.minGroup + ' developers with enough data, or a 95% CI wider than ' + AID.analysis.WIDE_CI * 100 + ' pts. See the table.');
    else queueMicrotask(() => AID.charts.grouped(c.canvas, {
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
      el('div.card-title', { style: { marginBottom: '10px' } }, el('h3', { text: lift ? 'High-usage developers vs non-adopters' : 'AI effect by usage tier', style: { fontSize: '15px' } }), AID.help.button(lift ? 'm-lift' : 'c-cross')), ins,
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
