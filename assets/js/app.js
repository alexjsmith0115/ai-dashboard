/* App shell: state, persistence, file loading, filter row, settings, tabs, theme. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el, select, seg } = AID.ui;
  const STORE_KEY = 'ai-dev-dashboard:v1';

  const DEFAULTS = {
    tab: 'exec',
    theme: 'auto',
    showSettings: false,
    tool: 'cursor',
    filters: { org: '', domain: '', team: '', level: '', icOnly: true, from: '', to: '' },
    settings: { mode: 'rollout', rollout: '', ramp: 0, onboard: 3, minGroup: 5, control: 'all', activeDays: 5, highDays: 12, tierBasis: 'days', logScale: 'times', shrink: true, outlierCap: 'p99', minPrs: 1 },
    exec: { metric: 'prsMerged', groupBy: 'org', crossBy: 'level', crossMode: 'did' },
    explore: {
      trendMetric: 'prsMerged', trendGroup: 'tier', trendX: 'calendar', trendAgg: 'mean',
      corrLevel: 'change', corrMethod: 'spearman', corrSet: 'usage',
      sx: 'activeDays', sy: 'prsMerged', sLevel: 'change',
      gcGroup: 'domain', doseMetric: 'prsMerged', doseAfter: true, mixMode: 'share', devSearch: '',
    },
  };

  const state = loadState();
  let dataset = null;
  let sourceName = '';
  let pending = { developers: null, metrics: null, devName: '', metName: '' };
  // The optional team file from the user's files. It stays loaded when the other two files are loaded again.
  let teamFile = null;
  let messages = { error: null, warnings: [] };

  // ---------- Persistence (settings only, never data) ----------
  function loadState() {
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) for (const k of Object.keys(s)) {
        if (saved[k] == null) continue;
        s[k] = typeof s[k] === 'object' ? Object.assign(s[k], saved[k]) : saved[k];
      }
    } catch (e) { /* storage unavailable */ }
    s.explore.devSearch = '';
    return s;
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function update(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof state[k] === 'object') Object.assign(state[k], v);
      else state[k] = v;
    }
    saveState();
    render();
  }

  // ---------- Data loading ----------
  async function handleFiles(files) {
    messages.error = null;
    let newTeams = false;
    for (const f of files) {
      try {
        const parsed = AID.data.parseCsv(await AID.data.readFile(f));
        const kind = AID.data.classify(parsed.fields);
        if (!kind) { messages.error = '"' + f.name + '" does not look like developers.csv, the monthly metrics file, or the team file.'; continue; }
        if (kind === 'teams') { teamFile = { parsed, name: f.name }; newTeams = true; continue; }
        pending[kind] = parsed;
        if (kind === 'developers') pending.devName = f.name; else pending.metName = f.name;
      } catch (e) { messages.error = 'Could not read "' + f.name + '": ' + e.message; }
    }
    if (pending.developers && pending.metrics) {
      ingest(pending.developers, pending.metrics, pending.devName + ' + ' + pending.metName, teamFile);
    } else {
      // A team file alone is added to the data already loaded.
      if (newTeams && dataset) { addTeams(dataset, teamFile); messages.warnings = dataset.warnings; }
      render();
    }
  }

  function addTeams(ds, team) {
    try { AID.data.attachTeams(ds, team.parsed); } catch (e) { ds.teams = null; ds.warnings.push(team.name + ': ' + e.message); }
  }

  function ingest(devParsed, metParsed, name, team) {
    try {
      dataset = AID.data.buildDataset(devParsed, metParsed);
      if (team) addTeams(dataset, team);
      sourceName = name;
      messages = { error: null, warnings: dataset.warnings };
      pending = { developers: null, metrics: null, devName: '', metName: '' };
      sanitizeFilters();
    } catch (e) {
      messages.error = e.message;
      if (!dataset) pending.metrics = null;
    }
    render();
  }

  function loadDemo() {
    const d = AID.demo.generate();
    ingest(d.dev, d.met, 'Demo data (synthetic)', { parsed: d.team, name: 'Demo team file' });
  }

  function downloadDemo() {
    const d = AID.demo.generate();
    AID.ui.download('developers.csv', AID.data.toCsv(d.dev.fields, d.dev.rows));
    setTimeout(() => AID.ui.download('developer_monthly_metrics.csv', AID.data.toCsv(d.met.fields, d.met.rows)), 400);
    setTimeout(() => AID.ui.download('team_monthly_metrics.csv', AID.data.toCsv(d.team.fields, d.team.rows)), 800);
  }

  function sanitizeFilters() {
    const f = state.filters, devs = dataset.devs;
    const has = (key, v) => devs.some((d) => d[key] === v);
    if (f.org && !has('org', f.org)) f.org = '';
    if (f.domain && !has('domain', f.domain)) f.domain = '';
    if (f.team && !has('team', f.team)) f.team = '';
    if (f.level && !has('level', f.level)) f.level = '';
    const keys = dataset.months.map(AID.data.monthKey);
    if (f.from && !keys.includes(f.from)) f.from = '';
    if (f.to && !keys.includes(f.to)) f.to = '';
    if (state.settings.rollout && !keys.includes(state.settings.rollout)) state.settings.rollout = '';
    saveState();
  }

  // ---------- AI tool ----------
  const hasTool = (t) => !!dataset && (t === 'both' ? dataset.tools.cursor && dataset.tools.copilot : dataset.tools[t]);

  // Points the AI usage metrics at the selected tool. If the loaded data does not have that tool, uses one it has.
  function syncTool() {
    let tool = state.tool;
    if (dataset && !hasTool(tool)) tool = hasTool('cursor') ? 'cursor' : hasTool('copilot') ? 'copilot' : 'cursor';
    AID.setTool(tool);
    if (dataset && dataset.tool !== tool) AID.data.applyTool(dataset, tool);
    if (dataset) AID.data.applyOutliers(dataset, state.settings);
    // A saved metric choice can be a Cursor-only metric that the Copilot view does not have.
    for (const k of ['trendMetric', 'sx', 'sy']) if (!AID.available(state.explore[k])) state.explore[k] = DEFAULTS.explore[k];
  }

  function toolPicker() {
    const opts = AID.TOOLS.map((t) => ({
      value: t.key, label: t.short || t.label, disabled: !hasTool(t.key),
      title: !hasTool(t.key) ? (t.key === 'both' ? 'The metrics file needs both Cursor and Copilot columns.' : 'The metrics file has no ' + t.label + ' columns.') : t.short ? t.label + ' combined' : null,
    }));
    return el('div.field', el('span', { text: 'AI tool' }), seg('AI tool', opts, AID.tool.key, (v) => update({ tool: v })));
  }

  // ---------- Chrome ----------
  const $ = (id) => document.getElementById(id);

  function renderTopbar() {
    for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
    $('tabs').hidden = !dataset && state.tab !== 'guide';
    $('btn-settings').hidden = !dataset;
    $('btn-settings').setAttribute('aria-pressed', String(state.showSettings));
    $('btn-load').hidden = !dataset;
    const status = $('data-status');
    status.textContent = dataset
      ? sourceName + (dataset.teams && teamFile && !/^Demo/.test(sourceName) ? ' + ' + teamFile.name : '') + ' · ' + dataset.devsWithData + ' developers · ' + AID.data.monthLabel(dataset.months[0], true) + ' – ' + AID.data.monthLabel(dataset.months[dataset.months.length - 1], true)
      : '';
    $('btn-theme').textContent = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' }[state.theme];
  }

  function renderFilters() {
    const bar = $('filterbar');
    bar.hidden = !dataset || state.tab === 'guide';
    if (bar.hidden) return;
    const inner = $('filterbar-inner');
    inner.textContent = '';
    const f = state.filters, devs = dataset.devs.filter((d) => d.rows.length);
    const uniq = (list, key) => [...new Set(list.map((d) => d[key]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const opt = (all, vals) => [{ value: '', label: all }].concat(vals.map((v) => ({ value: v, label: v })));
    const inOrg = devs.filter((d) => !f.org || d.org === f.org);
    const inDomain = inOrg.filter((d) => !f.domain || d.domain === f.domain);
    const months = dataset.months.map((m) => ({ value: AID.data.monthKey(m), label: AID.data.monthLabel(m, true) }));
    const setF = (patch) => update({ filters: patch });

    inner.append(
      toolPicker(),
      el('div.filter-sep'),
      select('Org', opt('All orgs', uniq(devs, 'org')), f.org, (v) => setF({ org: v, domain: '', team: '' })),
      select('Domain', opt('All domains', uniq(inOrg, 'domain')), f.domain, (v) => setF({ domain: v, team: '' })),
      select('Team', opt('All teams', uniq(inDomain, 'team')), f.team, (v) => setF({ team: v })),
      select('Job level', opt('All levels', uniq(devs, 'level')), f.level, (v) => setF({ level: v })),
      el('label.check', el('input', { type: 'checkbox', checked: f.icOnly, onchange: (e) => setF({ icOnly: e.target.checked }) }), 'ICs only'),
      el('div.filter-sep'),
      select('From', [{ value: '', label: 'First month' }].concat(months), f.from, (v) => setF({ from: v })),
      select('To', [{ value: '', label: 'Last month' }].concat(months), f.to, (v) => setF({ to: v })),
      el('button.btn.ghost', { type: 'button', onclick: () => update({ filters: Object.assign({}, DEFAULTS.filters) }), text: 'Reset filters' }));
  }

  function renderSettings(ctx) {
    const wrap = $('settings-wrap');
    wrap.hidden = !dataset || !state.showSettings;
    if (wrap.hidden) return;
    const box = $('settings');
    box.textContent = '';
    const s = state.settings;
    const setS = (patch) => update({ settings: patch });
    const months = dataset.months.map((m) => ({ value: AID.data.monthKey(m), label: AID.data.monthLabel(m, true) }));
    const numField = (label, value, min, max, onChange, help) => el('div',
      el('label.field', el('span', { text: label }), el('input', { type: 'number', min, max, value, onchange: (e) => { const n = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)); onChange(n); } })),
      el('p.help', { text: help }));
    box.append(
      el('div', select('Before / after split', [{ value: 'rollout', label: 'Company rollout month' }, { value: 'perdev', label: 'Each developer\'s adoption month' }], s.mode, (v) => setS({ mode: v })),
        el('p.help', { text: (s.mode === 'rollout' ? 'All developers split at one month.' : 'Each developer splits at their first month with ' + s.activeDays + '+ active days. Non-adopters split at the median adoption month.') + ' Used on Explore and in the Lift view. The AI effect on the Executive summary always uses each developer\'s adoption month.' })),
      el('div', select('Rollout month', [{ value: '', label: 'Auto (' + AID.data.monthLabel(ctx ? ctx.autoRollout : dataset.months[0], true) + ')' }].concat(months), s.rollout, (v) => setS({ rollout: v })),
        el('p.help', { text: 'Auto = first month when 20%+ of developers were active. Used in rollout mode.' })),
      el('div', select('AI effect comparison group', [{ value: 'all', label: 'All developers without AI yet' }, { value: 'notyet', label: 'Adopters before adoption only' }, { value: 'never', label: 'Non-adopters only' }], s.control, (v) => setS({ control: v })),
        el('p.help', { text: 'The developer-months that set the company-wide change each month, for the AI effect. "Adopters before adoption only" leaves out non-adopters; late months with too few of them are dropped.' })),
      numField('Ramp-up months to skip', s.ramp, 0, 6, (n) => setS({ ramp: n }), 'Months right after the split that count as neither before nor after.'),
      numField('New-hire onboarding months to skip', s.onboard, 0, 12, (n) => setS({ onboard: n }), 'A new hire is a developer whose first month of work is after the first month in the data. Their first months are left out of all results.'),
      numField('Minimum developers per group', s.minGroup, 2, 30, (n) => setS({ minGroup: n }), 'Groups and job level × usage cells with fewer developers (with enough months before and after) are hidden from charts and flagged "Small sample". Small groups give wide, unreliable confidence intervals.'),
      el('div', select('Cap extreme values', [{ value: 'p99', label: '99th percentile' }, { value: 'p95', label: '95th percentile' }, { value: 'none', label: 'No cap' }], s.outlierCap || 'p99', (v) => setS({ outlierCap: v })),
        el('p.help', { text: 'For ' + trimLabels() + '. A developer-month above the percentile is set to the percentile, so one huge PR or one very slow PR or ticket cannot skew the results. The cutoff uses all months, before and after adoption together.' + capNote() })),
      numField('Minimum merged PRs for a PR median', s.minPrs || 1, 1, 10, (n) => setS({ minPrs: n }), 'For ' + trimLabels(true) + '. A developer-month with fewer merged PRs has no value: its median is one or two PRs, not a typical PR. 1 = use every month.' + dropNote()),
      el('div', select('Log scale for the AI effect', [{ value: 'times', label: 'Times and PR size' }, { value: 'all', label: 'Times, PR size, and counts' }, { value: 'none', label: 'None' }], s.logScale || 'times', (v) => setS({ logScale: v })),
        el('p.help', { text: 'On the log scale the effect is a ratio for the typical developer, and one very long ticket or one huge month cannot dominate. Times and PR size are always positive, so log is their natural scale. Counts use log(value + 1) because of zero months, which adds a small dependence on the +1. Rates are never logged.' })),
      el('div', select('Group estimates', [{ value: 'shrink', label: 'Pulled toward the parent group (recommended)' }, { value: 'raw', label: 'Raw' }], s.shrink === false ? 'raw' : 'shrink', (v) => setS({ shrink: v !== 'raw' })),
        el('p.help', { text: 'For the "Which groups" section only. A noisy team\'s estimate moves toward its domain in proportion to its own noise; a precise one stays. The table shows the raw value next to it. The headline and tiles never move.' })),
      el('div', select('Usage tier based on', [{ value: 'days', label: 'Active days' }, { value: 'spend', label: 'Spend' }], s.tierBasis, (v) => setS({ tierBasis: v })),
        el('p.help', { text: s.tierBasis === 'spend'
          ? 'Low and High = the developers split at the median of average ' + AID.M.spendDollars.label + ' per month in the after period' + (ctx && ctx.spendCuts ? ' (' + AID.fmt.value(ctx.spendCuts[0], 'usd') + ')' : '') + '. Non-adopter = under ' + AID.analysis.NON_ADOPTER_DAYS + ' active day per month.' + (ctx && ctx.tierBasis !== 'spend' ? ' The data has no spend values, so active days are used.' : '')
          : 'Low and High from average active days per month in the after period, split at the high-usage threshold below.' })),
      numField('Active threshold (days / month)', s.activeDays, 2, 20, (n) => setS({ activeDays: n, highDays: Math.max(n + 1, s.highDays) }), 'A developer counts as an active AI user in a month with this many ' + AID.M.activeDays.label + '. Their first such month is their adoption month.'),
      numField('High-usage threshold (days / month)', s.highDays, 2, 25, (n) => setS({ highDays: Math.max(n, s.activeDays + 1) }), s.tierBasis === 'spend' ? 'Not used: usage tiers are based on spend.' : 'Average active days per month for the "High" usage tier. Under ' + AID.analysis.NON_ADOPTER_DAYS + ' day = non-adopter.'));
  }

  // Labels and notes for the outlier settings, from the cutoffs in dataset.caps (AID.data.applyOutliers).
  const trimMetrics = () => AID.METRICS.filter((m) => m.trim && dataset && dataset.caps && dataset.caps.get(m.key).n);
  const trimLabels = (prOnly) => (trimMetrics().filter((m) => !prOnly || m.volume === 'prsMerged').map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1)).join(', ') || 'the per-PR medians');
  function capNote() {
    const parts = trimMetrics().map((m) => { const c = dataset.caps.get(m.key); return c.cut == null ? null : m.short + ' ' + AID.fmt.value(c.cut, m.unit) + (m.unit === 'count' ? ' lines' : '') + ' (' + c.capped + ' months)'; }).filter(Boolean);
    return parts.length ? ' Current cutoffs: ' + parts.join(', ') + '.' : '';
  }
  function dropNote() {
    const parts = trimMetrics().filter((m) => m.volume === 'prsMerged').map((m) => { const c = dataset.caps.get(m.key); return c.dropped ? m.short + ' ' + c.dropped : null; }).filter(Boolean);
    return parts.length ? ' Months left out: ' + parts.join(', ') + '.' : '';
  }

  function renderMessages(main) {
    if (messages.error) main.appendChild(el('div.alert.error', { role: 'alert', text: messages.error }));
    if (dataset && messages.warnings.length) {
      main.appendChild(el('div.alert', { style: { marginBottom: '16px' } },
        el('strong', { text: 'Data notes' }),
        el('button.btn.small.ghost', { type: 'button', style: { float: 'right' }, onclick: () => { messages.warnings = []; render(); }, text: 'Dismiss' }),
        el('ul', messages.warnings.map((w) => el('li', { text: w })))));
    }
  }

  function renderWelcome(main) {
    const slot = (label, ok, name) => el('div.file-slot' + (ok ? '.ok' : ''), AID.ui.icon(ok ? 'check' : 'flat'), ok ? label + ': ' + name : label + ': not loaded');
    const dz = el('div.dropzone#dropzone',
      el('h2', { text: 'Load your data' }),
      el('p', { text: 'Drop the CSV files here, or choose them. The files stay in this browser tab. Nothing is uploaded.' }),
      el('div.file-slots', slot('Developers', !!pending.developers, pending.devName), slot('Monthly metrics', !!pending.metrics, pending.metName), slot('Team bugs (optional)', !!teamFile, teamFile && teamFile.name)),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
        el('button.btn.primary', { type: 'button', onclick: () => $('file-input').click(), text: 'Choose CSV files' }),
        el('button.btn', { type: 'button', onclick: loadDemo, text: 'Explore with demo data' }),
        el('button.btn.ghost', { type: 'button', onclick: downloadDemo, text: 'Download demo CSVs' }),
        el('button.btn.ghost', { type: 'button', onclick: () => update({ tab: 'guide' }), text: 'How the dashboard works' })));
    const req = el('div.card.req-list',
      el('h3', { text: 'Expected files', style: { fontSize: '15px', marginBottom: '8px' } }),
      el('p', 'developers.csv — one row per developer. Needs ', el('code', { text: 'devId' }), '. The dashboard also uses ',
        el('code', { text: 'orgName' }), ' (org), ', el('code', { text: 'department' }), ' (domain), ', el('code', { text: 'squadId' }), ' (team), ',
        el('code', { text: 'jobLevel' }), ', ', el('code', { text: 'manager' }), ', and ', el('code', { text: 'isIC' }), '.'),
      el('p', { style: { marginTop: '8px' } }, 'developer_monthly_metrics.csv — one row per developer per month. Needs a developer key (',
        el('code', { text: 'devId' }), ', ', el('code', { text: 'email' }), ', ', el('code', { text: 'cursorUserId' }), ', ', el('code', { text: 'jiraAccountId' }), ', or ',
        el('code', { text: 'githubLogin' }), ') and a month column (', el('code', { text: 'month' }), ' or ', el('code', { text: 'period' }),
        '; formats like 2025-03, 2025-03-01, 3/1/2025, or Mar 2025 all work), plus the Cursor, Jira, and GitHub columns. Copilot columns (',
        el('code', { text: 'copilotActiveDays' }), ', ', el('code', { text: 'copilotTotalRequests' }), ', …) are optional. With them, the AI tool switch shows Copilot or both tools. Add ', el('code', { text: 'combinedActiveDays' }),
        ' (days with either tool, counted from daily data) for exact active days in the Cursor + Copilot view.'),
      el('p', { style: { marginTop: '8px' } }, 'team_monthly_metrics.csv (optional) — one row per team per month: ', el('code', { text: 'squadId' }), ', a month column, ',
        el('code', { text: 'bugsDiscovered' }), ' (bugs found in the team\'s code), and ', el('code', { text: 'escapedBugs' }), ' (the bugs found in production). Adds bug rates to the Executive summary.'),
      el('p', { style: { marginTop: '8px', color: 'var(--muted)' }, text: 'Column order does not matter. Extra columns are ignored. Missing metric columns show as empty. Download the demo CSVs to see the exact format.' }));
    main.append(el('div.welcome', dz, req));
  }

  // ---------- Main render ----------
  function render() {
    applyTheme();
    syncTool();
    renderTopbar();
    renderFilters();
    const main = $('main');
    const y = window.scrollY;
    AID.charts.destroyAll();
    main.textContent = '';
    renderMessages(main);
    if (state.tab === 'guide') { renderSettings(null); AID.help.renderGuide(main); requestAnimationFrame(() => window.scrollTo(0, y)); return; }
    if (!dataset) { renderSettings(null); renderWelcome(main); return; }
    if (typeof Chart === 'undefined') {
      main.appendChild(el('div.alert.error', { text: 'Chart.js did not load from the CDN. Check your internet connection or network policy, then reload the page.' }));
      return;
    }
    AID.charts.applyDefaults();
    let ctx;
    try {
      ctx = AID.analysis.buildContext(dataset, state);
    } catch (e) {
      main.appendChild(el('div.alert.error', { text: 'Analysis failed: ' + e.message }));
      throw e;
    }
    renderSettings(ctx);
    if (!ctx.devs.length) {
      main.appendChild(el('div.card', el('p.empty-note', { text: 'No developers match the current filters.' })));
      return;
    }
    const app = { state, update };
    if (state.tab === 'exec') AID.exec.render(main, ctx, app); else AID.explore.render(main, ctx, app);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  // ---------- Theme ----------
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', state.theme);
  }

  // ---------- Wiring ----------
  function init() {
    if (typeof Papa === 'undefined') {
      $('main').appendChild(el('div.alert.error', { text: 'PapaParse did not load from the CDN. Check your internet connection or network policy, then reload the page.' }));
      return;
    }
    for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => { update({ tab: b.dataset.tab }); window.scrollTo(0, 0); });
    $('btn-settings').addEventListener('click', () => update({ showSettings: !state.showSettings }));
    $('btn-load').addEventListener('click', () => $('file-input').click());
    $('btn-theme').addEventListener('click', () => update({ theme: { auto: 'light', light: 'dark', dark: 'auto' }[state.theme] }));
    $('file-input').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = ''; });
    let depth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; const dz = $('dropzone'); if (dz) dz.classList.add('over'); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); const dz = $('dropzone'); if (dz && !depth) dz.classList.remove('over'); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0;
      const files = [...(e.dataTransfer.files || [])].filter((f) => /\.(csv|txt)$/i.test(f.name));
      if (files.length) handleFiles(files);
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'auto') render(); });
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => AID.charts.gc(), 200); });
    // Sticky bars below the top bar (the Executive summary headline metric) need its height, which changes when it wraps.
    const topbar = document.querySelector('.topbar');
    const setTopbarH = () => document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
    setTopbarH();
    if (window.ResizeObserver) new ResizeObserver(setTopbarH).observe(topbar);
    if (/[?&]demo\b/.test(location.search)) loadDemo(); else render();
  }

  AID.app = { init, state, update, loadDemo };
  document.addEventListener('DOMContentLoaded', init);
})(window.AID);
