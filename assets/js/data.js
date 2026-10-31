/* CSV parsing, file detection, and the developer ⨝ monthly-metrics join. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const DEV_HINTS = ['squadid', 'orgname', 'department', 'joblevel', 'githublogin'];
  const METRIC_HINTS = ['activedays', 'prsmerged', 'storypoints', 'totalrequests', 'throughput'];
  const TEAM_HINTS = ['bugsdiscovered', 'escapedbugs'];
  // Metric-file key column -> developers.csv column it joins to (all compared case-insensitively).
  const KEY_CANDIDATES = [
    ['devid', 'devId'], ['dev_id', 'devId'], ['developerid', 'devId'], ['developer_id', 'devId'],
    ['email', 'email'], ['cursoruserid', 'cursorUserId'], ['jiraaccountid', 'jiraAccountId'], ['githublogin', 'githubLogin'],
  ];
  // Raw AI usage columns that are not in the metric catalog, but feed derived metrics or the combined view.
  const USAGE_EXTRA = ['contractTotalSpend', 'totalLinesAdded', 'totalLinesDeleted', 'acceptedLinesDeleted', 'totalTabsShown', 'totalApplies', 'totalAccepts', 'totalRejects'];
  const MONTH_CANDIDATES = ['month', 'period', 'yearmonth', 'year_month', 'monthstart', 'month_start', 'reportmonth', 'date'];
  const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function parseCsv(text) {
    const out = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^﻿/, '').trim(),
      transform: (v) => (typeof v === 'string' ? v.trim() : v),
    });
    return { fields: (out.meta.fields || []).filter(Boolean), rows: out.data, errors: out.errors };
  }

  function classify(fields) {
    const lower = fields.map((f) => f.toLowerCase());
    if (lower.includes('squadid') && TEAM_HINTS.some((h) => lower.includes(h))) return 'teams';
    const devScore = DEV_HINTS.filter((h) => lower.includes(h)).length;
    const metScore = METRIC_HINTS.filter((h) => lower.includes(h)).length;
    if (devScore === 0 && metScore === 0) return null;
    return devScore >= metScore ? 'developers' : 'metrics';
  }

  function findField(fields, lowerName) {
    return fields.find((f) => f.toLowerCase() === lowerName) || null;
  }

  // Normalizes many month formats to 'YYYY-MM'. Returns null if the value is not a date.
  function normalizeMonth(raw) {
    if (raw == null) return null;
    const v = String(raw).trim();
    if (!v) return null;
    let m;
    const ok = (y, mo) => (y > 1990 && y < 2200 && mo >= 1 && mo <= 12 ? y + '-' + String(mo).padStart(2, '0') : null);
    if ((m = v.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[T ].*)?$/))) return ok(+m[1], +m[2]);
    if ((m = v.match(/^(\d{4})(\d{2})$/))) return ok(+m[1], +m[2]);
    if ((m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) return ok(+m[3], +m[1]); // US m/d/yyyy
    if ((m = v.match(/^(\d{1,2})[/-](\d{4})$/))) return ok(+m[2], +m[1]);
    if ((m = v.match(/^([A-Za-z]{3,9})[\s\-,']*(\d{2,4})$/))) {
      const mo = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
      const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
      return mo ? ok(y, mo) : null;
    }
    const d = new Date(v);
    return isNaN(d) ? null : ok(d.getFullYear(), d.getMonth() + 1);
  }

  function num(v) {
    if (v == null) return null;
    const s = String(v).replace(/[$,%\s]/g, '');
    if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  const truthy = (v) => /^(true|t|yes|y|1)$/i.test(String(v || '').trim());
  const clean = (v, fallback) => (v == null || String(v).trim() === '' ? fallback : String(v).trim());

  function monthIndex(key) {
    const [y, m] = key.split('-').map(Number);
    return y * 12 + (m - 1);
  }
  function monthKey(idx) {
    return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
  }
  function monthLabel(idx, long) {
    const d = new Date(Math.floor(idx / 12), idx % 12, 1);
    return d.toLocaleDateString(undefined, { month: 'short', year: long ? 'numeric' : '2-digit' });
  }

  function buildDevelopers(parsed, warnings) {
    const F = (name) => findField(parsed.fields, name.toLowerCase());
    const col = {
      id: F('devId'), squad: F('squadId'), email: F('email'), name: F('name'), orgLeader: F('orgLeader'),
      org: F('orgName'), dept: F('department'), manager: F('manager'), role: F('role'), level: F('jobLevel'),
      isIC: F('isIC'), cursor: F('cursorUserId'), jira: F('jiraAccountId'), gh: F('githubLogin'),
      project: F('primaryProject'), repo: F('primaryRepo'), copilot: F('copilotUserId'), copilotSpend: F('copilotTotalSpend'),
    };
    if (!col.id) throw new Error('developers.csv has no devId column.');
    const devs = [];
    const seen = new Set();
    let dup = 0;
    for (const r of parsed.rows) {
      const id = clean(r[col.id], null);
      if (!id) continue;
      if (seen.has(id)) { dup++; continue; }
      seen.add(id);
      const g = (c, fb) => (c ? clean(r[c], fb) : fb);
      devs.push({
        id,
        name: g(col.name, id),
        email: g(col.email, ''),
        org: g(col.org, '(no org)'),
        orgLeader: g(col.orgLeader, ''),
        domain: g(col.dept, '(no domain)'),
        team: g(col.squad, '(no team)'),
        manager: g(col.manager, ''),
        role: g(col.role, '(no role)'),
        level: g(col.level, '(no level)'),
        isIC: col.isIC ? truthy(r[col.isIC]) : true,
        cursorUserId: g(col.cursor, ''),
        jiraAccountId: g(col.jira, ''),
        githubLogin: g(col.gh, ''),
        project: g(col.project, ''),
        repo: g(col.repo, ''),
        copilotUserId: g(col.copilot, ''),
        copilotTotalSpend: col.copilotSpend ? num(r[col.copilotSpend]) : null,
        rows: [],
      });
    }
    if (dup) warnings.push(dup + ' duplicate devId rows in developers.csv were skipped.');
    return devs;
  }

  const isNum = (x) => x != null && isFinite(x);
  const addN = (a, b) => (isNum(a) || isNum(b) ? (a || 0) + (b || 0) : null);
  const maxN = (a, b) => (isNum(a) || isNum(b) ? Math.max(a || 0, b || 0) : null);

  // Days with either tool. combinedActiveDays (counted from daily data) is exact. Without it, the higher of the two counts is the
  // lowest possible value. The true value is at least the higher count and at most the sum, so a value outside that range is limited to it.
  function combinedDays(w) {
    const c = w.activeDays, p = w[AID.copilotKey('activeDays')], u = w.combinedActiveDays;
    if (!isNum(u)) return maxN(c, p);
    return Math.min(Math.max(u, c || 0, p || 0), (c || 0) + (p || 0));
  }

  // Fills each row's AI usage values (r.v) from the Cursor columns, the Copilot columns, or both ('cursor' | 'copilot' | 'both').
  // Both: counts and spend are added, active days = days with either tool (combinedDays), never the sum.
  // Cursor-only features are blank for Copilot. Copilot has no rejects column, so its rejects = applies − accepts.
  function applyTool(ds, tool) {
    const keys = AID.METRICS.filter((m) => m.usage && !m.derived).map((m) => m.key).concat(USAGE_EXTRA);
    const cpOf = new Map(AID.COPILOT_KEYS.map((k) => [k, AID.copilotKey(k)]));
    const cpA = cpOf.get('activeDays'), cpAp = cpOf.get('totalApplies'), cpAc = cpOf.get('totalAccepts');
    for (const r of ds.rows) {
      const w = r.raw, v = r.v;
      const cpRejects = isNum(w[cpAp]) && isNum(w[cpAc]) ? Math.max(0, w[cpAp] - w[cpAc]) : null;
      for (const k of keys) {
        const c = w[k], p = cpOf.has(k) ? w[cpOf.get(k)] : null;
        if (tool === 'copilot') v[k] = cpOf.has(k) ? p : k === 'totalRejects' ? cpRejects : null;
        else if (tool === 'both') v[k] = !cpOf.has(k) ? (k === 'totalRejects' ? addN(c, cpRejects) : c) : k === 'activeDays' ? combinedDays(w) : addN(c, p);
        else v[k] = c;
      }
      derive(v);
      const cur = r.models.cursor, cp = r.models.copilot;
      r.model = tool === 'copilot' ? cp : tool === 'both' ? ((w.activeDays || 0) >= (w[cpA] || 0) ? cur || cp : cp || cur) : cur;
    }
    ds.tool = tool;
    ds.hasModel = tool === 'copilot' ? ds.models.copilot : tool === 'both' ? ds.models.cursor || ds.models.copilot : ds.models.cursor;
  }

  function derive(v) {
    v.tabAcceptRate = v.totalTabsShown > 0 && v.totalTabsAccepted != null ? (100 * v.totalTabsAccepted) / v.totalTabsShown : null;
    const ar = (v.totalAccepts || 0) + (v.totalRejects || 0);
    v.aiAcceptRate = ar > 0 ? (100 * (v.totalAccepts || 0)) / ar : null;
    v.aiLineShare = v.additions > 0 && v.acceptedLinesAdded != null ? Math.min(100, (100 * v.acceptedLinesAdded) / v.additions) : null;
    v.costPerMergedPr = v.prsMerged > 0 && v.spendDollars != null ? v.spendDollars / v.prsMerged : null;
    v.churnRatePct = v.additions > 0 && v.churnedLines != null ? Math.min(100, (100 * v.churnedLines) / v.additions) : null;
    v.reopenRatePct = v.throughput > 0 && v.reopenedTickets != null ? Math.min(100, (100 * v.reopenedTickets) / v.throughput) : null;
  }

  function buildDataset(devParsed, metParsed) {
    const warnings = [];
    const devs = buildDevelopers(devParsed, warnings);

    // Join key
    let keyField = null, devField = null;
    for (const [cand, target] of KEY_CANDIDATES) {
      const f = findField(metParsed.fields, cand);
      if (f) { keyField = f; devField = target; break; }
    }
    if (!keyField) throw new Error('The metrics file needs a developer key column (devId, email, cursorUserId, jiraAccountId, or githubLogin). Found: ' + metParsed.fields.slice(0, 8).join(', ') + '…');
    const fieldMap = { devId: 'id', email: 'email', cursorUserId: 'cursorUserId', jiraAccountId: 'jiraAccountId', githubLogin: 'githubLogin' };
    const lookup = new Map();
    for (const d of devs) {
      const k = String(d[fieldMap[devField]] || '').toLowerCase();
      if (k) lookup.set(k, d);
    }

    // Month column
    let monthField = null;
    for (const cand of MONTH_CANDIDATES) {
      const f = findField(metParsed.fields, cand);
      if (f) { monthField = f; break; }
    }
    if (!monthField) throw new Error('The metrics file needs a month column (month, period, yearMonth, monthStart, or date).');

    // Numeric columns present in the file
    const present = new Map(); // metric key -> field name in file
    const copilotCols = AID.COPILOT_KEYS.map(AID.copilotKey);
    const rawCols = AID.METRICS.filter((m) => !m.derived).map((m) => m.key).concat(USAGE_EXTRA, copilotCols, ['combinedActiveDays']);
    for (const k of rawCols) {
      const f = findField(metParsed.fields, k.toLowerCase());
      if (f) present.set(k, f);
    }
    // A Copilot column takes its blank-cell rule from its Cursor column.
    const metaOf = new Map(AID.COPILOT_KEYS.map((k, i) => [copilotCols[i], AID.M[k]]));
    const tools = { cursor: present.has('activeDays'), copilot: present.has(AID.copilotKey('activeDays')), combined: present.has('combinedActiveDays') };
    if (tools.cursor && tools.copilot && !tools.combined) warnings.push('No combinedActiveDays column. The Cursor + Copilot view uses the higher of Cursor and Copilot active days, which can be too low when the tools are used on different days.');
    const missing = AID.METRICS.filter((m) => !m.derived && !m.optional && !present.has(m.key) && (tools.cursor || !m.usage)).map((m) => m.key);
    if (missing.length) warnings.push('Missing metric columns (shown as empty): ' + missing.join(', ') + '.');
    const optMissing = AID.METRICS.filter((m) => m.optional && !present.has(m.key)).map((m) => m.key);
    if (optMissing.length) warnings.push('Optional columns not in the file: ' + optMissing.join(', ') + '. The Executive summary tiles for them say which column to add.');
    const modelField = findField(metParsed.fields, 'primarymodel');
    const copilotModelField = findField(metParsed.fields, 'copilotprimarymodel');

    const rows = [];
    const unmatched = new Set();
    let badMonth = 0, dupRows = 0;
    const seen = new Set();
    for (const r of metParsed.rows) {
      const dev = lookup.get(String(r[keyField] || '').trim().toLowerCase());
      if (!dev) { if (r[keyField]) unmatched.add(r[keyField]); continue; }
      const month = normalizeMonth(r[monthField]);
      if (!month) { badMonth++; continue; }
      const sk = dev.id + '|' + month;
      if (seen.has(sk)) { dupRows++; continue; }
      seen.add(sk);
      const raw = {};
      for (const [k, f] of present) {
        let n = num(r[f]);
        const meta = AID.M[k] || metaOf.get(k);
        if (n == null && meta && meta.empty === 'zero') n = 0;
        raw[k] = n;
      }
      const models = { cursor: modelField ? clean(r[modelField], '') : '', copilot: copilotModelField ? clean(r[copilotModelField], '') : '' };
      // raw = every column as loaded. v = the values the analysis reads, with AI usage from the selected tool (applyTool).
      const row = { dev, month, mi: monthIndex(month), raw, v: Object.assign({}, raw), models, model: '' };
      rows.push(row);
      dev.rows.push(row);
    }
    if (unmatched.size) warnings.push(unmatched.size + ' metric ' + keyField + ' values did not match any developer and were skipped.');
    if (badMonth) warnings.push(badMonth + ' metric rows had an unreadable ' + monthField + ' value and were skipped.');
    if (dupRows) warnings.push(dupRows + ' duplicate developer-month rows were skipped (first row kept).');
    const cpA = AID.copilotKey('activeDays');
    const badUnion = rows.filter((r) => isNum(r.raw.combinedActiveDays) && r.raw.combinedActiveDays !== combinedDays(r.raw)).length;
    if (badUnion) warnings.push(badUnion + ' rows have a combinedActiveDays value below the higher of activeDays and ' + cpA + ', or above their sum. The dashboard limits these values to that range.');
    if (!rows.length) throw new Error('No metric rows matched a developer. Check that ' + keyField + ' values match developers.csv.');

    for (const d of devs) d.rows.sort((a, b) => a.mi - b.mi);
    const idxs = rows.map((r) => r.mi);
    const minI = Math.min(...idxs), maxI = Math.max(...idxs);
    const months = [];
    for (let i = minI; i <= maxI; i++) months.push(i);

    const ds = {
      devs, rows, months, warnings, keyField, monthField, tools,
      models: { cursor: !!modelField, copilot: !!copilotModelField },
      devsWithData: devs.filter((d) => d.rows.length).length,
    };
    applyTool(ds, tools.cursor || !tools.copilot ? 'cursor' : 'copilot');
    return ds;
  }

  // team_monthly_metrics.csv: one row per team (squadId) per month, with bugsDiscovered and/or escapedBugs.
  // squadId matches developers.csv, ignoring case. A blank cell or a missing team-month counts as missing, not 0.
  // Sets ds.teams = { rows: Map(team -> Map(month index -> { bugsDiscovered, escapedBugs })), cols: { bugsDiscovered, escapedBugs } }.
  function attachTeams(ds, parsed) {
    const teamField = findField(parsed.fields, 'squadid');
    if (!teamField) throw new Error('The team file needs a squadId column.');
    let monthField = null;
    for (const cand of MONTH_CANDIDATES) {
      const f = findField(parsed.fields, cand);
      if (f) { monthField = f; break; }
    }
    if (!monthField) throw new Error('The team file needs a month column (month, period, yearMonth, monthStart, or date).');
    const cols = { bugsDiscovered: findField(parsed.fields, 'bugsdiscovered'), escapedBugs: findField(parsed.fields, 'escapedbugs') };
    const teamOf = new Map(ds.devs.map((d) => [d.team.toLowerCase(), d.team]));
    const rows = new Map();
    const unmatched = new Set();
    let badMonth = 0, dup = 0;
    for (const r of parsed.rows) {
      const team = teamOf.get(String(r[teamField] || '').trim().toLowerCase());
      if (!team) { if (r[teamField]) unmatched.add(r[teamField]); continue; }
      const month = normalizeMonth(r[monthField]);
      if (!month) { badMonth++; continue; }
      const mi = monthIndex(month);
      if (!rows.has(team)) rows.set(team, new Map());
      const byMonth = rows.get(team);
      if (byMonth.has(mi)) { dup++; continue; }
      byMonth.set(mi, { bugsDiscovered: cols.bugsDiscovered ? num(r[cols.bugsDiscovered]) : null, escapedBugs: cols.escapedBugs ? num(r[cols.escapedBugs]) : null });
    }
    if (!rows.size) throw new Error('No team rows matched a squadId in developers.csv.');
    if (unmatched.size) ds.warnings.push(unmatched.size + ' team file squadId values did not match any team in developers.csv and were skipped.');
    if (badMonth) ds.warnings.push(badMonth + ' team file rows had an unreadable ' + monthField + ' value and were skipped.');
    if (dup) ds.warnings.push(dup + ' duplicate team-month rows in the team file were skipped (first row kept).');
    ds.teams = { rows, cols: { bugsDiscovered: !!cols.bugsDiscovered, escapedBugs: !!cols.escapedBugs } };
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });
  }

  function toCsv(fields, rows) {
    return Papa.unparse({ fields, data: rows.map((r) => fields.map((f) => r[f])) });
  }

  AID.data = { parseCsv, classify, buildDataset, attachTeams, applyTool, readFile, normalizeMonth, monthIndex, monthKey, monthLabel, toCsv };
})(window.AID);
