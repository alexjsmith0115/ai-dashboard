/* CSV parsing, file detection, and the developer ⨝ monthly-metrics join. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const DEV_HINTS = ['squadid', 'orgname', 'department', 'joblevel', 'githublogin'];
  const METRIC_HINTS = ['activedays', 'prsmerged', 'storypoints', 'totalrequests', 'throughput'];
  // Metric-file key column -> developers.csv column it joins to (all compared case-insensitively).
  const KEY_CANDIDATES = [
    ['devid', 'devId'], ['dev_id', 'devId'], ['developerid', 'devId'], ['developer_id', 'devId'],
    ['email', 'email'], ['cursoruserid', 'cursorUserId'], ['jiraaccountid', 'jiraAccountId'], ['githublogin', 'githubLogin'],
  ];
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
      project: F('primaryProject'), repo: F('primaryRepo'),
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
        rows: [],
      });
    }
    if (dup) warnings.push(dup + ' duplicate devId rows in developers.csv were skipped.');
    return devs;
  }

  function derive(v) {
    v.tabAcceptRate = v.totalTabsShown > 0 && v.totalTabsAccepted != null ? (100 * v.totalTabsAccepted) / v.totalTabsShown : null;
    const ar = (v.totalAccepts || 0) + (v.totalRejects || 0);
    v.aiAcceptRate = ar > 0 ? (100 * (v.totalAccepts || 0)) / ar : null;
    v.aiLineShare = v.additions > 0 && v.acceptedLinesAdded != null ? Math.min(100, (100 * v.acceptedLinesAdded) / v.additions) : null;
    v.costPerMergedPr = v.prsMerged > 0 && v.spendDollars != null ? v.spendDollars / v.prsMerged : null;
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
    const rawCols = AID.METRICS.filter((m) => !m.derived).map((m) => m.key)
      .concat(['contractTotalSpend', 'totalLinesAdded', 'totalLinesDeleted', 'acceptedLinesDeleted', 'totalTabsShown', 'totalApplies', 'totalAccepts', 'totalRejects']);
    for (const k of rawCols) {
      const f = findField(metParsed.fields, k.toLowerCase());
      if (f) present.set(k, f);
    }
    const missing = AID.METRICS.filter((m) => !m.derived && !present.has(m.key)).map((m) => m.key);
    if (missing.length) warnings.push('Missing metric columns (shown as empty): ' + missing.join(', ') + '.');
    const modelField = findField(metParsed.fields, 'primarymodel');

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
      const v = {};
      for (const [k, f] of present) {
        let n = num(r[f]);
        const meta = AID.M[k];
        if (n == null && meta && meta.empty === 'zero') n = 0;
        v[k] = n;
      }
      derive(v);
      const row = { dev, month, mi: monthIndex(month), v, model: modelField ? clean(r[modelField], '') : '' };
      rows.push(row);
      dev.rows.push(row);
    }
    if (unmatched.size) warnings.push(unmatched.size + ' metric ' + keyField + ' values did not match any developer and were skipped.');
    if (badMonth) warnings.push(badMonth + ' metric rows had an unreadable ' + monthField + ' value and were skipped.');
    if (dupRows) warnings.push(dupRows + ' duplicate developer-month rows were skipped (first row kept).');
    if (!rows.length) throw new Error('No metric rows matched a developer. Check that ' + keyField + ' values match developers.csv.');

    for (const d of devs) d.rows.sort((a, b) => a.mi - b.mi);
    const idxs = rows.map((r) => r.mi);
    const minI = Math.min(...idxs), maxI = Math.max(...idxs);
    const months = [];
    for (let i = minI; i <= maxI; i++) months.push(i);

    return {
      devs, rows, months, warnings, keyField, monthField,
      hasModel: !!modelField,
      devsWithData: devs.filter((d) => d.rows.length).length,
    };
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

  AID.data = { parseCsv, classify, buildDataset, readFile, normalizeMonth, monthIndex, monthKey, monthLabel, toCsv };
})(window.AID);
