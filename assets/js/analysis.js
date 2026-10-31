/* Statistics + the before/after analysis model shared by both dashboards. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const MIN_MONTHS_PER_SIDE = 2; // a developer needs this many months before AND after to count
  const MIN_GROUP_DEVS = 5;      // default for settings.minGroup: groups smaller than this are flagged as low sample
  const NON_ADOPTER_DAYS = 1;    // average active days / month below this = non-adopter
  // Any of these raw columns > 0 in a month means the developer was working. The first such month is their start month.
  // Both AI tools count in every view, so the start month (and the onboarding months left out) is the same for each AI tool view.
  const WORK_KEYS = ['prsOpened', 'prsMerged', 'throughput', 'thoughputWithSubtasks', 'storyPoints', 'additions', 'activeDays', 'copilotActiveDays'];
  const MIN_CONTROL_DEVS = 10;
  const WIDE_CI = 2;             // a 95% CI wider than this (200 % points) is too uncertain to show as a bar or point   // DiD: a month needs this many untreated developer-months to estimate its month effect
  const OTHER = 'Other';
  const MIN_TEAMS = 8;           // team-level effect: fewer teams than this = not enough data
  const BUG_WINDOW = 3;          // bug rate = bugs found ÷ PRs merged, over this many months
  const BUG_SKIP_LAST = 2;       // the newest months are left out of the bug rate: bugs from recent PRs are not found yet

  // ---------- Basic stats ----------
  const isNum = (x) => x != null && isFinite(x);
  function mean(a) { let s = 0, n = 0; for (const x of a) if (isNum(x)) { s += x; n++; } return n ? s / n : null; }
  function sum(a) { let s = 0, n = 0; for (const x of a) if (isNum(x)) { s += x; n++; } return n ? s : null; }
  function median(a) {
    const b = a.filter(isNum).sort((x, y) => x - y);
    if (!b.length) return null;
    const h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }
  function sd(a) {
    const b = a.filter(isNum);
    if (b.length < 2) return null;
    const m = mean(b);
    return Math.sqrt(b.reduce((s, x) => s + (x - m) * (x - m), 0) / (b.length - 1));
  }
  // Two-sided 95% t critical values.
  const T95 = [[1, 12.71], [2, 4.30], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [25, 2.06], [30, 2.04], [40, 2.02], [60, 2.00], [120, 1.98]];
  function tCrit(df) {
    if (df < 1) return Infinity;
    let v = 1.96;
    for (let i = T95.length - 1; i >= 0; i--) if (df >= T95[i][0]) { v = T95[i][1]; break; }
    return df > 120 ? 1.96 : v;
  }
  // Weighted mean. All weights zero or missing = plain mean.
  function wmean(vals, w) {
    let s = 0, sw = 0;
    for (let i = 0; i < vals.length; i++) if (isNum(vals[i]) && w[i] > 0) { s += w[i] * vals[i]; sw += w[i]; }
    return sw > 0 ? s / sw : mean(vals);
  }
  // Standard error of a (weighted) mean, clustered by group (team). Developers on one team share re-orgs, incidents,
  // and code, so their effects are not independent. With fewer than 2 groups, the values are the clusters.
  function clusterSE(vals, groups, weights) {
    const n = vals.length;
    let w = weights || vals.map(() => 1);
    let sw = w.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    if (!(sw > 0)) { w = vals.map(() => 1); sw = n; }
    const m = wmean(vals, w);
    const byG = new Map();
    vals.forEach((v, i) => { if (w[i] > 0) byG.set(groups[i], (byG.get(groups[i]) || 0) + (w[i] * (v - m)) / sw); });
    let G = byG.size;
    if (G < 2) { byG.clear(); vals.forEach((v, i) => { if (w[i] > 0) byG.set(i, (w[i] * (v - m)) / sw); }); G = byG.size; }
    if (G < 2) return { se: Infinity, df: 1 };
    let s = 0;
    for (const x of byG.values()) s += x * x;
    return { se: Math.sqrt(s * (G / (G - 1))), df: G - 1 };
  }
  function pearson(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function correlate(x, y, method) {
    const px = [], py = [];
    for (let i = 0; i < x.length; i++) if (isNum(x[i]) && isNum(y[i])) { px.push(x[i]); py.push(y[i]); }
    if (px.length < 5) return { r: null, n: px.length };
    return { r: method === 'pearson' ? pearson(px, py) : pearson(ranks(px), ranks(py)), n: px.length };
  }
  function linearFit(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const slope = sxx ? sxy / sxx : 0;
    return { slope, intercept: my - slope * mx };
  }

  // ---------- Context: everything derived from dataset + filters + settings ----------
  function buildContext(ds, state) {
    const s = state.settings, f = state.filters;
    const thr = s.activeDays, hi = s.highDays;
    const onboard = s.onboard || 0;
    const minGroup = Math.max(2, s.minGroup || MIN_GROUP_DEVS);

    // Start month: first month with any work. A developer whose start is after the first month of the data is a new hire.
    // Their first `onboard` months are onboarding: those rows are left out of every calculation.
    const firstMonth = ds.months[0];
    for (const d of ds.devs) {
      const r0 = d.rows.find((r) => WORK_KEYS.some((k) => r.raw[k] > 0));
      d.startIdx = r0 ? r0.mi : null;
      d.isNewHire = d.startIdx != null && d.startIdx > firstMonth;
    }
    // In a one-tool view, a developer who uses the other AI tool is still a non-adopter (adoption, tiers). But a month with
    // the active threshold of days in the other tool is left out of the AI effect: before adoption it is not a month without AI,
    // and after adoption it mixes the two tools. Thus the effect compares the selected tool alone with no AI.
    const otherKey = ds.tool === 'cursor' ? AID.copilotKey('activeDays') : ds.tool === 'copilot' ? 'activeDays' : null;
    const otherTool = otherKey ? (ds.tool === 'cursor' ? 'Copilot' : 'Cursor') : null;
    const usesOther = (r) => !!otherKey && r.raw[otherKey] >= thr;
    const isOnboarding = (r) => r.dev.startIdx == null || r.mi < r.dev.startIdx || (r.dev.isNewHire && r.mi - r.dev.startIdx < onboard);

    // Per-developer adoption month: first month at or above the active-days threshold (unfiltered data).
    for (const d of ds.devs) {
      d.adoptIdx = null;
      for (const r of d.rows) if (!isOnboarding(r) && r.v.activeDays >= thr) { d.adoptIdx = r.mi; break; }
    }
    // Suggested company rollout: first month where >= 20% of developers with data are active.
    let autoRollout = null;
    for (const mi of ds.months) {
      let n = 0, a = 0;
      for (const r of ds.rows) if (r.mi === mi && r.dev.isIC && !isOnboarding(r)) { n++; if (r.v.activeDays >= thr) a++; }
      if (n && a / n >= 0.2) { autoRollout = mi; break; }
    }
    if (autoRollout == null) autoRollout = ds.months[Math.floor(ds.months.length / 2)];
    const rolloutIdx = s.rollout ? AID.data.monthIndex(s.rollout) : autoRollout;
    const medianAdopt = (() => { const m = median(ds.devs.map((d) => d.adoptIdx)); return m == null ? rolloutIdx : Math.round(m); })();

    const fromIdx = f.from ? AID.data.monthIndex(f.from) : ds.months[0];
    const toIdx = f.to ? AID.data.monthIndex(f.to) : ds.months[ds.months.length - 1];
    const months = ds.months.filter((m) => m >= fromIdx && m <= toIdx);

    const devsInScope = ds.devs.filter((d) => d.rows.length
      && (!f.org || d.org === f.org) && (!f.domain || d.domain === f.domain)
      && (!f.team || d.team === f.team) && (!f.level || d.level === f.level)
      && (!f.icOnly || d.isIC));

    const ramp = s.ramp || 0;
    const perDev = s.mode === 'perdev';
    const splitOf = (d) => (perDev ? (d.adoptIdx != null ? d.adoptIdx : medianAdopt) : rolloutIdx);
    const phaseOf = (r) => {
      const rel = r.mi - splitOf(r.dev);
      return rel < 0 ? 'before' : rel >= ramp ? 'after' : null;
    };

    const rowsCache = new Map();
    const rowsOf = (d) => {
      let rs = rowsCache.get(d);
      if (!rs) { rs = d.rows.filter((r) => r.mi >= fromIdx && r.mi <= toIdx && !isOnboarding(r)); rowsCache.set(d, rs); }
      return rs;
    };
    // Developers who are still onboarding for the whole date range have no rows left, so they drop out.
    const devs = devsInScope.filter((d) => rowsOf(d).length);
    const onboarding = {
      months: onboard,
      newHires: devsInScope.filter((d) => d.isNewHire).length,
      skippedRows: devsInScope.reduce((n, d) => n + d.rows.filter((r) => r.mi >= fromIdx && r.mi <= toIdx && isOnboarding(r)).length, 0),
    };

    const tierCache = new Map();
    // Usage tiers. Non-adopter = under NON_ADOPTER_DAYS average active days per month in the after period, for both bases.
    // Basis 'days': Low / High from average active days (of the selected AI tool), split at the high-usage threshold.
    // Basis 'spend': Low / High = the other developers split at the median of average monthly spend in the after period.
    // The median comes from every developer in the date range (ignoring org/domain/team/level filters), so a filter does not move a tier.
    const afterMean = (d, key) => {
      const after = rowsOf(d).filter((r) => phaseOf(r) === 'after');
      return mean((after.length ? after : rowsOf(d)).map((r) => r.v[key]));
    };
    const usageAfter = (d) => afterMean(d, 'activeDays');
    const spendAfter = (d) => afterMean(d, 'spendDollars');
    let tierBasis = s.tierBasis === 'spend' ? 'spend' : 'days';
    let spendCuts = null;
    if (tierBasis === 'spend') {
      const vals = ds.devs.filter((d) => rowsOf(d).length && (!f.icOnly || d.isIC) && usageAfter(d) >= NON_ADOPTER_DAYS)
        .map(spendAfter).filter(isNum).sort((a, b) => a - b);
      if (vals.length >= 2) spendCuts = [quantile(vals, 0.5)];
      else tierBasis = 'days'; // no spend data: fall back to active days
    }
    // Two usage tiers above non-adopter. A third (light) tier held only developers who reached the active threshold once and
    // then stopped: too few to read. The fine-grained dose curve is on the Explore tab (doseResponse, per developer-month).
    const TIER_SHORT = ['Non-adopter', 'Low', 'High'];
    const usd = (v) => '$' + Math.round(v);
    const TIERS = [
      'Non-adopter (<' + NON_ADOPTER_DAYS + ' d/mo)',
      ...(tierBasis === 'spend'
        ? ['Low (under ' + usd(spendCuts[0]) + '/mo)', 'High (' + usd(spendCuts[0]) + '+/mo)']
        : ['Low (' + NON_ADOPTER_DAYS + '–' + (hi - 1) + ' d/mo)', 'High (' + hi + '+ d/mo)']),
    ];
    const tierIndex = (d) => {
      if (tierCache.has(d)) return tierCache.get(d);
      const u = usageAfter(d);
      let i;
      if (u == null) i = -1;
      else if (u < NON_ADOPTER_DAYS) i = 0;
      else if (tierBasis === 'spend') { const sp = spendAfter(d); i = sp == null ? -1 : sp >= spendCuts[0] ? 2 : 1; }
      else i = u >= hi ? 2 : 1;
      tierCache.set(d, i);
      return i;
    };
    const tierOf = (d) => (tierIndex(d) < 0 ? 'No data' : TIERS[tierIndex(d)]);
    const groupOf = (d, key) => {
      if (key === 'tier') return tierOf(d);
      if (key === 'levelTier') return d.level + ' · ' + (tierIndex(d) < 0 ? 'No data' : TIER_SHORT[tierIndex(d)]);
      return key === 'all' ? 'All developers' : d[key];
    };

    const phaseCache = new Map();
    function phaseMeans(d, key) {
      const ck = key + '|' + d.id;
      if (phaseCache.has(ck)) return phaseCache.get(ck);
      const b = [], a = [];
      for (const r of rowsOf(d)) {
        const v = r.v[key];
        if (!isNum(v)) continue;
        const p = phaseOf(r);
        if (p === 'before') b.push(v); else if (p === 'after') a.push(v);
      }
      const res = { b: mean(b), a: mean(a), nb: b.length, na: a.length };
      phaseCache.set(ck, res);
      return res;
    }

    // Turns a mean difference (md), its standard error (se), and a baseline into the common result shape:
    // % change, 95% CI, statistical status, and score (positive = better, whatever the metric's direction).
    function finish(res, md, se, n, base, df) {
      const meta = AID.M[res.key] || {};
      const h = tCrit(df != null ? df : n - 1) * se;
      base = Math.abs(base);
      Object.assign(res, { diff: md, pct: md / base, lo: (md - h) / base, hi: (md + h) / base, sePct: se / base });
      res.wide = (2 * h) / base > WIDE_CI;
      // Usage that starts near zero (most AI usage metrics before rollout) makes % change meaningless.
      res.fromZero = !!meta.usage && base < 0.1 * Math.abs(res.after);
      const sig = md - h > 0 || md + h < 0;
      res.sig = sig;
      const good = meta.better === 'down' ? md < 0 : md > 0;
      res.good = good;
      res.status = !sig ? 'flat' : meta.better === 'neutral' ? (md > 0 ? 'up' : 'down') : good ? 'improved' : 'worse';
      res.score = meta.better === 'down' ? -res.pct : res.pct;
      return res;
    }

    // Paired before/after comparison across developers. Each developer is compared with their own baseline.
    // base = denominator for the % (default: this list's own before value). Subgroups pass the value for all developers
    // in the selection, so a group with a small before value does not get a very large % and CI.
    function compare(key, devList, base) {
      const list = devList || devs;
      const bs = [], as = [], diffs = [];
      for (const d of list) {
        const p = phaseMeans(d, key);
        if (p.nb >= MIN_MONTHS_PER_SIDE && p.na >= MIN_MONTHS_PER_SIDE) { bs.push(p.b); as.push(p.a); diffs.push(p.a - p.b); }
      }
      const n = diffs.length;
      const res = { key, n, before: mean(bs), after: mean(as), status: 'nodata' };
      if (n < 2 || !res.before) return res;
      return finish(res, mean(diffs), sd(diffs) / Math.sqrt(n), n, base || res.before);
    }

    // ---------- Difference-in-differences (imputation estimator) ----------
    // 1. Fit y = developer effect + calendar-month effect on untreated months only:
    //    every month of non-adopters, and the months before adoption for adopters.
    // 2. For each adopter month after adoption, expected = developer effect + month effect. Effect = actual − expected.
    // 3. Average the effect per developer, then across developers. The CI comes from the spread across developers, clustered by team.
    //    A median or rate (cycle time, reopen rate, PR size, ...) is weighted by its volume (issues, PRs), at both steps.
    // Developer effects remove fixed differences (skill, level, team). Month effects remove company-wide changes
    // (seasonality, re-orgs, process changes). Staggered adoption dates are handled because adopters are never
    // used as the comparison for each other after they adopt.
    // The model is fitted on every developer in the date range (ignoring org/domain/team/level filters), so that
    // month effects stay stable when a filter selects a small group.
    // Comparison group (settings.control) = the developer-months that set the month effects:
    //   'all'    every month without AI: non-adopters, and adopters before they adopt (default)
    //   'notyet' adopters before they adopt only (non-adopters are left out)
    //   'never'  non-adopters only (each adopter's own level still comes from their months before adoption)
    const CONTROLS = ['all', 'notyet', 'never'];
    const control = CONTROLS.includes(s.control) ? s.control : 'all';
    const didPool = ds.devs.filter((d) => d.rows.length && (!f.icOnly || d.isIC));
    const didCache = new Map();
    function didFit(key, ctl) {
      ctl = ctl || control;
      const ck = key + '|' + ctl;
      if (didCache.has(ck)) return didCache.get(ck);
      const devPos = new Map(), t0 = ds.months[0];
      const T = ds.months[ds.months.length - 1] - t0 + 1;
      // Volume weight: for a median or rate, the count it was measured over (AID.M[key].volume). Counts weigh 1.
      const vol = (AID.M[key] || {}).volume;
      const obs = [];
      for (const d of didPool) {
        const a = d.adoptIdx;
        for (const r of rowsOf(d)) {
          const y = r.v[key];
          if (!isNum(y)) continue;
          const k = a == null ? null : r.mi - a;
          const treated = k != null && k >= 0;
          if (treated && k < ramp) continue; // ramp-up months count as neither side
          if (!devPos.has(d)) devPos.set(d, devPos.size);
          const w = vol ? (r.v[vol] > 0 ? r.v[vol] : 0) : 1;
          obs.push({ d, i: devPos.get(d), t: r.mi - t0, y, k, treated, other: usesOther(r), w });
        }
      }
      const D = devPos.size;
      const inPool = (o) => !o.treated && !o.other && (ctl === 'all' || (ctl === 'notyet' ? o.k != null : o.k == null));
      const ctrl = obs.filter(inPool);
      const nI = new Float64Array(D), nT = new Float64Array(T);
      for (const o of ctrl) { nI[o.i]++; nT[o.t]++; }
      // Alternating projections: solve for both sets of effects on an unbalanced panel.
      const alpha = new Float64Array(D), lambda = new Float64Array(T);
      const sI = new Float64Array(D), sT = new Float64Array(T);
      for (let it = 0; it < 500; it++) {
        sI.fill(0);
        for (const o of ctrl) sI[o.i] += o.y - lambda[o.t];
        for (let i = 0; i < D; i++) alpha[i] = nI[i] ? sI[i] / nI[i] : 0;
        sT.fill(0);
        for (const o of ctrl) sT[o.t] += o.y - alpha[o.i];
        let delta = 0;
        for (let t = 0; t < T; t++) {
          const v = nT[t] ? sT[t] / nT[t] : 0;
          delta = Math.max(delta, Math.abs(v - lambda[t]));
          lambda[t] = v;
        }
        if (delta < 1e-9) break;
      }
      // 'never': adopters are not in the fit, so their own level = average of (actual − month effect) before adoption.
      if (ctl === 'never') {
        const sA = new Float64Array(D), nA = new Float64Array(D);
        for (const o of obs) if (!o.treated && !o.other && o.k != null && nT[o.t]) { sA[o.i] += o.y - lambda[o.t]; nA[o.i]++; }
        for (let i = 0; i < D; i++) if (nA[i]) { alpha[i] = sA[i] / nA[i]; nI[i] = nA[i]; }
      }
      // Usable observations: the developer has enough untreated months, and the month has enough comparison developers.
      const byDev = new Map(), pre = new Map(), post = new Map();
      let dropped = 0;
      for (const o of obs) {
        if (o.k == null || o.other) continue;
        if (nI[o.i] < MIN_MONTHS_PER_SIDE) continue;
        if (nT[o.t] < MIN_CONTROL_DEVS) { if (o.treated) dropped++; continue; }
        const yhat = alpha[o.i] + lambda[o.t], e = o.y - yhat;
        if (o.treated) {
          let rec = byDev.get(o.d);
          if (!rec) { rec = { tau: [], yhat: [], y: [], w: [] }; byDev.set(o.d, rec); }
          rec.tau.push(e); rec.yhat.push(yhat); rec.y.push(o.y); rec.w.push(o.w);
        }
        const bucket = o.treated ? post : pre;
        if (!bucket.has(o.k)) bucket.set(o.k, []);
        bucket.get(o.k).push({ d: o.d, e, yhat, y: o.y, w: o.w });
      }
      // Per developer: the volume-weighted average over their months after adoption. w = their total volume (1 for a count metric).
      const devEffects = new Map();
      for (const [d, rec] of byDev) {
        if (rec.tau.length < MIN_MONTHS_PER_SIDE) continue;
        devEffects.set(d, { tau: wmean(rec.tau, rec.w), yhat: wmean(rec.yhat, rec.w), y: wmean(rec.y, rec.w), months: rec.tau.length, w: vol ? rec.w.reduce((a, b) => a + b, 0) : 1 });
      }
      const minCtrl = Math.min(...[...nT].filter((n) => n > 0));
      // Developers with at least one month in the comparison group.
      const ctrlDevs = (adopter) => new Set(ctrl.filter((o) => (o.k != null) === adopter).map((o) => o.d)).size;
      const res = {
        key, control: ctl, devEffects, pre, post, dropped, minCtrl,
        nonAdopters: ctrlDevs(false), notYet: ctrlDevs(true), otherMonths: obs.filter((o) => o.other).length,
      };
      didCache.set(ck, res);
      return res;
    }

    // The average AI effect for a set of developers. Same result shape as compare():
    // before = expected value without AI, after = actual value, pct = effect as % of expected.
    // base: as in compare(). Subgroups pass the expected value for all adopters in the selection.
    function did(key, devList, ctl, base) {
      const fit = didFit(key, ctl);
      const per = [], teams = [];
      for (const d of devList || devs) { const x = fit.devEffects.get(d); if (x) { per.push(x); teams.push(d.team); } }
      const n = per.length, w = per.map((x) => x.w);
      const res = { key, n, method: 'did', control: fit.control, before: wmean(per.map((x) => x.yhat), w), after: wmean(per.map((x) => x.y), w), status: 'nodata' };
      if (n < 2 || !res.before) return res;
      const taus = per.map((x) => x.tau), c = clusterSE(taus, teams, w);
      res.teams = new Set(teams).size;
      return finish(res, wmean(taus, w), c.se, n, base || res.before, c.df);
    }

    // Effect by month relative to adoption. Months before adoption show the leftover difference from the fitted
    // path (should be near zero with no trend if adopters were not already improving). Months 0+ are the effect.
    function eventStudy(key, devList, opts) {
      const o = Object.assign({ from: -6, to: 12 }, opts);
      const fit = didFit(key);
      const inSet = new Set(devList || devs);
      // One denominator for every month: the average expected value for these adopters.
      const base = Math.abs(did(key, devList).before || 0);
      const out = [];
      for (let k = o.from; k <= o.to; k++) {
        const b = ((k < 0 ? fit.pre : fit.post).get(k) || []).filter((x) => inSet.has(x.d));
        const n = b.length;
        const row = { k, n, post: k >= 0 };
        if (n >= MIN_CONTROL_DEVS && base) {
          const es = b.map((x) => x.e), w = b.map((x) => x.w), c = clusterSE(es, b.map((x) => x.d.team), w);
          const m = wmean(es, w), h = tCrit(c.df) * c.se;
          Object.assign(row, { pct: m / base, lo: (m - h) / base, hi: (m + h) / base, wide: (2 * h) / base > WIDE_CI });
        }
        out.push(row);
      }
      return out;
    }

    // DiD effect per group, in the same shape as compareByGroup().
    // lowSample = too few developers, or a CI too wide to read (wide). Charts leave these groups out.
    function didByGroup(metric, groupKey) {
      const base = did(metric).before;
      const byG = new Map();
      for (const d of devs) {
        const g = groupOf(d, groupKey);
        if (!byG.has(g)) byG.set(g, []);
        byG.get(g).push(d);
      }
      const out = [];
      for (const [g, list] of byG) {
        const c = did(metric, list, null, base);
        const sample = list[0];
        out.push(Object.assign(c, {
          group: g, devCount: list.length, adoption: adoptionRate(list),
          avgActiveDays: mean(list.map(usageAfter)), lowSample: c.n < minGroup || !!c.wide,
          parent: groupKey === 'team' ? sample.domain : groupKey === 'domain' ? sample.org : '',
          manager: groupKey === 'team' ? sample.manager : '',
        }));
      }
      return out;
    }

    function groupValues(key, devList) {
      const counts = new Map();
      for (const d of devList || devs) { const g = groupOf(d, key); counts.set(g, (counts.get(g) || 0) + 1); }
      return counts;
    }

    // Share of a set of developers' after-period months at or above the active threshold.
    function adoptionRate(devList) {
      let n = 0, a = 0;
      for (const d of devList) for (const r of rowsOf(d)) if (phaseOf(r) === 'after') { n++; if (r.v.activeDays >= thr) a++; }
      return n ? a / n : null;
    }

    function compareByGroup(metric, groupKey) {
      const base = compare(metric).before;
      const byG = new Map();
      for (const d of devs) {
        const g = groupOf(d, groupKey);
        if (!byG.has(g)) byG.set(g, []);
        byG.get(g).push(d);
      }
      const out = [];
      for (const [g, list] of byG) {
        const c = compare(metric, list, base);
        const sample = list[0];
        out.push(Object.assign(c, {
          group: g, devCount: list.length, adoption: adoptionRate(list),
          avgActiveDays: mean(list.map(usageAfter)), lowSample: c.n < minGroup || !!c.wide,
          parent: groupKey === 'team' ? sample.domain : groupKey === 'domain' ? sample.org : '',
          manager: groupKey === 'team' ? sample.manager : '',
        }));
      }
      return out;
    }

    // Rows of a dimension (e.g. job level) × usage tier. Each cell is a paired before/after comparison.
    // lift = cell's improvement minus the same row's non-adopters' improvement (positive = better), in % points.
    // method 'did' uses the DiD effect in each cell instead of the before/after change (no lift: non-adopters are the comparison).
    function compareCross(metric, rowKey, method) {
      const measure = method === 'did' ? (list, base) => did(metric, list, null, base) : (list, base) => compare(metric, list, base);
      const denom = measure().before; // one denominator for every cell
      const rowVals = [...new Set(devs.map((d) => groupOf(d, rowKey)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return rowVals.map((rv) => {
        const inRow = devs.filter((d) => groupOf(d, rowKey) === rv);
        const cells = TIERS.map((tier, ti) => {
          const list = inRow.filter((d) => tierIndex(d) === ti);
          return Object.assign(measure(list, denom), { tier, tierShort: TIER_SHORT[ti], devCount: list.length });
        });
        for (const c of cells) c.lowSample = c.n < minGroup || c.pct == null || !!c.wide;
        const base = cells[0];
        for (const c of cells.slice(1)) {
          if (c.lowSample || base.lowSample) continue;
          const h = 1.96 * Math.sqrt(c.sePct ** 2 + base.sePct ** 2);
          c.lift = c.score - base.score;
          c.liftLo = c.lift - h; c.liftHi = c.lift + h;
          c.liftSig = c.liftLo > 0 || c.liftHi < 0;
          if (c.liftHi - c.liftLo > WIDE_CI) { c.lowSample = true; c.wide = true; } // lift too uncertain to show
        }
        return { row: rv, cells, devCount: inRow.length };
      });
    }

    // Time series. xMode 'calendar' = month; 'relative' = months since the developer's split month.
    function series(metric, opts) {
      const o = Object.assign({ groupKey: 'all', agg: 'mean', xMode: 'calendar', maxSeries: 8, relRange: 12 }, opts);
      const xs = o.xMode === 'relative' ? range(-o.relRange, o.relRange) : months.slice();
      const xPos = new Map(xs.map((x, i) => [x, i]));
      const counts = groupValues(o.groupKey);
      let names = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
      let fold = null;
      if (o.groupKey === 'tier') names = TIERS.filter((t) => counts.has(t)).concat(names.filter((t) => !TIERS.includes(t)));
      else if (names.length > o.maxSeries) { fold = new Set(names.slice(o.maxSeries - 1)); names = names.slice(0, o.maxSeries - 1).concat([OTHER]); }
      const buckets = new Map(names.map((n) => [n, xs.map(() => [])]));
      for (const d of devs) {
        let g = groupOf(d, o.groupKey);
        if (fold && fold.has(g)) g = OTHER;
        const b = buckets.get(g);
        if (!b) continue;
        const split = splitOf(d);
        for (const r of rowsOf(d)) {
          const x = o.xMode === 'relative' ? r.mi - split : r.mi;
          const i = xPos.get(x);
          if (i == null) continue;
          const v = r.v[metric];
          if (isNum(v)) b[i].push(v);
        }
      }
      const agg = o.agg === 'sum' ? sum : o.agg === 'median' ? median : mean;
      const minN = o.xMode === 'relative' ? 3 : 1;
      const out = names.map((n) => {
        const b = buckets.get(n);
        return { name: n, values: b.map((a) => (a.length >= minN ? agg(a) : null)), counts: b.map((a) => a.length), isOther: n === OTHER };
      }).filter((s) => s.counts.some((c) => c > 0));
      return { xs, labels: xs.map((x) => (o.xMode === 'relative' ? (x > 0 ? '+' + x : String(x)) : AID.data.monthLabel(x))), series: out, folded: fold ? fold.size : 0 };
    }

    // Share of developers per month at the active / high-usage thresholds. In the Both view, also each tool on its own.
    function adoptionSeries() {
      const rows = months.map(() => ({ n: 0, any: 0, act: 0, high: 0, cur: 0, cp: 0 }));
      const cpKey = AID.copilotKey('activeDays');
      const pos = new Map(months.map((m, i) => [m, i]));
      for (const d of devs) for (const r of rowsOf(d)) {
        const c = rows[pos.get(r.mi)];
        if (!c) continue;
        c.n++;
        const a = r.v.activeDays || 0;
        if (a >= 1) c.any++;
        if (a >= thr) c.act++;
        if (a >= hi) c.high++;
        if (r.raw.activeDays >= thr) c.cur++;
        if (r.raw[cpKey] >= thr) c.cp++;
      }
      return {
        xs: months, labels: months.map((m) => AID.data.monthLabel(m)),
        any: rows.map((c) => (c.n ? c.any / c.n : null)),
        active: rows.map((c) => (c.n ? c.act / c.n : null)),
        high: rows.map((c) => (c.n ? c.high / c.n : null)),
        cursor: rows.map((c) => (c.n ? c.cur / c.n : null)),
        copilot: rows.map((c) => (c.n ? c.cp / c.n : null)),
        n: rows.map((c) => c.n),
      };
    }

    // One value per developer: mean over the date range (level 'dev'), or after−before change (level 'change').
    function devValues(key, level) {
      return devs.map((d) => {
        if (level === 'change') {
          const p = phaseMeans(d, key);
          return p.nb >= MIN_MONTHS_PER_SIDE && p.na >= MIN_MONTHS_PER_SIDE ? p.a - p.b : null;
        }
        return mean(rowsOf(d).map((r) => r.v[key]));
      });
    }

    function pointsFor(xKey, yKey, level) {
      if (level === 'devmonth') {
        const pts = [];
        for (const d of devs) for (const r of rowsOf(d)) {
          const x = r.v[xKey], y = r.v[yKey];
          if (isNum(x) && isNum(y)) pts.push({ x, y, dev: d, month: r.mi });
        }
        return pts;
      }
      const xs = devValues(xKey, level), ys = devValues(yKey, level);
      const pts = [];
      devs.forEach((d, i) => { if (isNum(xs[i]) && isNum(ys[i])) pts.push({ x: xs[i], y: ys[i], dev: d }); });
      return pts;
    }

    function corrMatrix(keys, level, method) {
      let cols;
      if (level === 'devmonth') {
        const all = [];
        for (const d of devs) for (const r of rowsOf(d)) all.push(r);
        cols = keys.map((k) => all.map((r) => r.v[k]));
      } else {
        cols = keys.map((k) => devValues(k, level));
      }
      return keys.map((_, i) => keys.map((__, j) => (i === j ? { r: 1, n: null } : correlate(cols[i], cols[j], method))));
    }

    // Mean of a metric per bucket of monthly Cursor active days (dev-month level).
    function doseResponse(metric, afterOnly) {
      const B = [
        { label: '0 days', lo: 0, hi: 0 }, { label: '1–4', lo: 1, hi: 4 }, { label: '5–9', lo: 5, hi: 9 },
        { label: '10–14', lo: 10, hi: 14 }, { label: '15+', lo: 15, hi: Infinity },
      ];
      const vals = B.map(() => []), devSets = B.map(() => new Set());
      for (const d of devs) for (const r of rowsOf(d)) {
        if (afterOnly && phaseOf(r) !== 'after') continue;
        const a = r.v.activeDays || 0, v = r.v[metric];
        if (!isNum(v)) continue;
        const i = B.findIndex((b) => a >= b.lo && a <= b.hi);
        vals[i].push(v); devSets[i].add(d);
      }
      return B.map((b, i) => ({ label: b.label, mean: mean(vals[i]), median: median(vals[i]), n: vals[i].length, devs: devSets[i].size }));
    }

    function devSummary(d) {
      return {
        dev: d, tier: tierOf(d), usage: usageAfter(d), adoptIdx: d.adoptIdx,
        months: rowsOf(d).length,
        m: (k) => phaseMeans(d, k),
      };
    }

    // ---------- Team-level AI effect ----------
    // Bugs are counted per team, and review load moves between developers in a team. So this check runs on team-months.
    // Model: y = team effect + month effect + b × team adoption share, weighted (by developers, or by PRs for bug rates).
    // b = the change in y from 0% to 100% of the team using AI. The 95% CI is clustered by team.
    // It uses every team in the selected org and domain. The team and job level filters do not apply (one team has no comparison).
    // prsPerDev: PRs merged ÷ developers, with the adoption share in the same month.
    // bugRate / escapedBugRate: 100 × bugs found ÷ PRs merged over the BUG_WINDOW months ending in month t. Adoption share = the
    // average over the BUG_WINDOW months ending one month before t, because bugs are found weeks or months after the code is merged.
    const lastData = ds.months[ds.months.length - 1];
    let teamPanel = null;
    function teamMonths() {
      if (teamPanel) return teamPanel;
      teamPanel = new Map(); // team -> Map(month index -> { devs, adopted, prs })
      for (const d of ds.devs) {
        if ((f.icOnly && !d.isIC) || (f.org && d.org !== f.org) || (f.domain && d.domain !== f.domain)) continue;
        if (!teamPanel.has(d.team)) teamPanel.set(d.team, new Map());
        const byMonth = teamPanel.get(d.team);
        // New hires' onboarding months count here: their code and their bugs belong to the team.
        for (const r of d.rows) {
          let c = byMonth.get(r.mi);
          if (!c) byMonth.set(r.mi, (c = { devs: 0, adopted: 0, prs: 0 }));
          c.devs++;
          if (r.v.activeDays >= thr) c.adopted++;
          if (isNum(r.v.prsMerged)) c.prs += r.v.prsMerged;
        }
      }
      return teamPanel;
    }

    function teamObs(key) {
      const meta = AID.TM[key];
      const bugs = ds.teams && ds.teams.rows;
      if (meta.col && !(ds.teams && ds.teams.cols[meta.col])) return [];
      const obs = [];
      for (const [team, byMonth] of teamMonths()) {
        for (const mi of months) {
          const c = byMonth.get(mi);
          if (!c) continue;
          if (!meta.col) { if (c.devs >= 2) obs.push({ g: team, t: mi, y: c.prs / c.devs, s: c.adopted / c.devs, w: c.devs }); continue; }
          if (mi > lastData - BUG_SKIP_LAST) continue;
          const tb = bugs.get(team);
          if (!tb) continue;
          let nb = 0, np = 0, ok = true;
          for (let k = 0; k < BUG_WINDOW && ok; k++) {
            const b = tb.get(mi - k), p = byMonth.get(mi - k);
            if (!b || !isNum(b[meta.col]) || !p) ok = false; else { nb += b[meta.col]; np += p.prs; }
          }
          const shares = [];
          for (let k = 1; k <= BUG_WINDOW; k++) { const p = byMonth.get(mi - k); if (p && p.devs) shares.push(p.adopted / p.devs); }
          if (ok && np > 0 && shares.length >= 2) obs.push({ g: team, t: mi, y: (100 * nb) / np, s: mean(shares), w: np });
        }
      }
      return obs;
    }

    // Weighted within transform: removes team and month means from x (alternating projections, as in didFit).
    function demean(obs, x) {
      const out = Float64Array.from(x);
      for (let it = 0; it < 300; it++) {
        let delta = 0;
        for (const by of ['g', 't']) {
          const sw = new Map(), sx = new Map();
          obs.forEach((o, i) => { sw.set(o[by], (sw.get(o[by]) || 0) + o.w); sx.set(o[by], (sx.get(o[by]) || 0) + o.w * out[i]); });
          obs.forEach((o, i) => { const m = sx.get(o[by]) / sw.get(o[by]); out[i] -= m; delta = Math.max(delta, Math.abs(m)); });
        }
        if (delta < 1e-10) break;
      }
      return out;
    }

    const teamCache = new Map();
    // Same result shape as did(): before = expected at 0% adoption, after = expected at 100% adoption, pct = b ÷ before.
    function teamEffect(key) {
      if (teamCache.has(key)) return teamCache.get(key);
      const meta = AID.TM[key];
      const obs = teamObs(key);
      const G = new Set(obs.map((o) => o.g)).size;
      const res = { key, n: G, obs: obs.length, team: true, status: 'nodata', missingCol: meta.col && !(ds.teams && ds.teams.cols[meta.col]) ? meta.col : null };
      teamCache.set(key, res);
      if (G < MIN_TEAMS) return res;
      const yt = demean(obs, obs.map((o) => o.y)), st = demean(obs, obs.map((o) => o.s));
      let sxx = 0, sxy = 0;
      obs.forEach((o, i) => { sxx += o.w * st[i] * st[i]; sxy += o.w * st[i] * yt[i]; });
      if (sxx < 1e-9) return res; // adoption share never changed within a team
      const b = sxy / sxx;
      const score = new Map();
      obs.forEach((o, i) => score.set(o.g, (score.get(o.g) || 0) + o.w * st[i] * (yt[i] - b * st[i])));
      let v = 0;
      for (const x of score.values()) v += x * x;
      const se = Math.sqrt((v / (sxx * sxx)) * (G / (G - 1)));
      let sw = 0, sy = 0;
      for (const o of obs) { sw += o.w; sy += o.w * (o.y - b * o.s); }
      const base = sy / sw;
      if (!(Math.abs(base) > 0)) return res;
      const h = tCrit(G - 1) * se;
      const sig = b - h > 0 || b + h < 0;
      const good = meta.better === 'down' ? b < 0 : b > 0;
      Object.assign(res, {
        before: base, after: base + b, diff: b, pct: b / Math.abs(base), lo: (b - h) / Math.abs(base), hi: (b + h) / Math.abs(base), sePct: se / Math.abs(base),
        wide: (2 * h) / Math.abs(base) > WIDE_CI, sig, good, status: !sig ? 'flat' : good ? 'improved' : 'worse',
      });
      res.score = meta.better === 'down' ? -res.pct : res.pct;
      return res;
    }

    // Monthly value for all teams together (weighted the same way as the model), for the KPI sparklines.
    function teamSeries(key) {
      const obs = teamObs(key);
      return months.map((mi) => {
        let sw = 0, sy = 0;
        for (const o of obs) if (o.t === mi) { sw += o.w; sy += o.w * o.y; }
        return sw ? sy / sw : null;
      });
    }

    // Before/after windows for the method note.
    const allRowsInRange = devs.flatMap(rowsOf);
    const windowOf = (p) => { const m = allRowsInRange.filter((r) => phaseOf(r) === p).map((r) => r.mi); return m.length ? [Math.min(...m), Math.max(...m)] : null; };

    return {
      ds, state, devs, months, onboarding, minGroup, control, CONTROLS, otherTool, tierBasis, spendCuts, spendAfter, fromIdx, toIdx, rolloutIdx, autoRollout, medianAdopt, perDev, ramp, thr, hi, TIERS, TIER_SHORT,
      splitOf, phaseOf, rowsOf, tierOf, tierIndex, groupOf, usageAfter, phaseMeans, compare, compareByGroup, did, didFit, didByGroup, eventStudy, compareCross, groupValues,
      teamEffect, teamSeries, hasTeams: !!ds.teams,
      adoptionRate, series, adoptionSeries, devValues, pointsFor, corrMatrix, doseResponse, devSummary,
      beforeWindow: windowOf('before'), afterWindow: windowOf('after'),
      // Shown when the split leaves no months before it (e.g. the selected AI tool was in use from the first month).
      noBeforeText: windowOf('before') ? null : 'No months before the split: ' + AID.tool.label + ' was in use from the first month of the data. Set the rollout month in Settings, or use the per-developer split.',
    };
  }

  // Linear-interpolated quantile of a sorted array, p in 0..1.
  function quantile(sorted, p) {
    const x = (sorted.length - 1) * p, i = Math.floor(x);
    return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * (x - i) : sorted[i];
  }

  function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

  AID.analysis = { buildContext, mean, median, sd, correlate, linearFit, pearson, MIN_MONTHS_PER_SIDE, MIN_GROUP_DEVS, MIN_CONTROL_DEVS, NON_ADOPTER_DAYS, OTHER, WIDE_CI, MIN_TEAMS, BUG_WINDOW, BUG_SKIP_LAST };
})(window.AID);
