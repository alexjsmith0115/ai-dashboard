/* Metric catalog + number formatting. Every metric the dashboard knows about is declared here. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  // better: 'up' = higher is better, 'down' = lower is better, 'neutral' = no direction.
  // empty: value used when the CSV cell is blank ('zero' or 'null').
  // unit: drives formatting (count | days | hours | pct | usd).
  // usage: an AI tool metric. Its source, label, and desc follow the selected AI tool ({tool} = tool name; descBy = desc per tool).
  // cursorOnly: Cursor has the feature, Copilot does not.
  const METRICS = [
    // ---- AI usage (Cursor, Copilot, or both) ----
    { key: 'activeDays', label: '{tool} active days', short: 'Active days', usage: true, unit: 'days', better: 'neutral', empty: 'zero', desc: 'Days in the month with any {tool} activity.',
      descBy: { both: 'The higher of Cursor active days and Copilot active days in the month. The data has no daily detail, so the days with either tool can be more.' } },
    { key: 'totalRequests', label: 'AI requests', short: 'Requests', usage: true, unit: 'count', better: 'neutral', empty: 'zero', desc: 'All {tool} AI requests in the month.' },
    { key: 'agentRequests', label: 'Agent requests', short: 'Agent', usage: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'composerRequests', label: 'Composer requests', short: 'Composer', usage: true, cursorOnly: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'chatRequests', label: 'Chat requests', short: 'Chat', usage: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'cmdkUsages', label: 'Cmd+K uses', short: 'Cmd+K', usage: true, cursorOnly: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'bugbotUsages', label: 'Bugbot uses', short: 'Bugbot', usage: true, cursorOnly: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'totalTabsAccepted', label: 'Tab completions accepted', short: 'Tabs accepted', usage: true, unit: 'count', better: 'neutral', empty: 'zero' },
    { key: 'acceptedLinesAdded', label: 'AI lines accepted', short: 'AI lines', usage: true, unit: 'count', better: 'neutral', empty: 'zero', desc: 'Lines added from accepted AI suggestions.' },
    { key: 'tabAcceptRate', label: 'Tab acceptance rate', short: 'Tab accept %', usage: true, unit: 'pct', better: 'neutral', derived: true, desc: 'totalTabsAccepted ÷ totalTabsShown.' },
    { key: 'aiAcceptRate', label: 'AI suggestion acceptance rate', short: 'AI accept %', usage: true, unit: 'pct', better: 'neutral', derived: true, desc: 'totalAccepts ÷ (totalAccepts + totalRejects).',
      descBy: { copilot: 'totalAccepts ÷ totalApplies. Copilot has no rejects column.', both: 'totalAccepts ÷ (totalAccepts + totalRejects), both tools added together. Copilot rejects = applies − accepts.' } },
    { key: 'aiLineShare', label: 'AI share of added lines', short: 'AI line share', usage: true, unit: 'pct', better: 'neutral', derived: true, desc: 'acceptedLinesAdded ÷ GitHub additions, capped at 100%. A rough signal: not every accepted line reaches a PR.' },
    { key: 'spendDollars', label: '{tool} spend', short: 'Spend', usage: true, unit: 'usd', better: 'neutral', empty: 'zero', desc: '{tool} spend for the developer in the month.' },
    // ---- Jira ----
    { key: 'throughput', label: 'Jira issues done', short: 'Throughput', source: 'Jira', unit: 'count', better: 'up', desc: 'Issues completed in the month (no subtasks).' },
    { key: 'thoughputWithSubtasks', label: 'Jira issues done (incl. subtasks)', short: 'Throughput+sub', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'storyPoints', label: 'Story points done', short: 'Story points', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'storiesdone', label: 'Stories done', short: 'Stories', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'bugsDone', label: 'Bugs done', short: 'Bugs', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'tasksDone', label: 'Tasks done', short: 'Tasks', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'subtasksDone', label: 'Subtasks done', short: 'Subtasks', source: 'Jira', unit: 'count', better: 'up' },
    { key: 'medianCycleDays', label: 'Median cycle time', short: 'Cycle time', source: 'Jira', unit: 'days', better: 'down', desc: 'Median days from In Progress to Done.' },
    { key: 'meanCycleDays', label: 'Mean cycle time', short: 'Mean cycle', source: 'Jira', unit: 'days', better: 'down' },
    { key: 'reopenedTickets', label: 'Reopened tickets', short: 'Reopened', source: 'Jira', unit: 'count', better: 'down' },
    { key: 'reopenRatePct', label: 'Reopen rate', short: 'Reopen %', source: 'Jira', unit: 'pct', better: 'down', desc: 'Share of done tickets that were reopened. Used as the quality guardrail.' },
    // ---- GitHub ----
    { key: 'prsMerged', label: 'PRs merged', short: 'PRs merged', source: 'GitHub', unit: 'count', better: 'up' },
    { key: 'prsOpened', label: 'PRs opened', short: 'PRs opened', source: 'GitHub', unit: 'count', better: 'up' },
    { key: 'additions', label: 'Lines added (GitHub)', short: 'Additions', source: 'GitHub', unit: 'count', better: 'neutral' },
    { key: 'deletions', label: 'Lines deleted (GitHub)', short: 'Deletions', source: 'GitHub', unit: 'count', better: 'neutral' },
    { key: 'changedFiles', label: 'Files changed', short: 'Files', source: 'GitHub', unit: 'count', better: 'neutral' },
    { key: 'medianTimeToMergeHours', label: 'Median time to merge', short: 'Time to merge', source: 'GitHub', unit: 'hours', better: 'down', desc: 'Median hours from PR open to merge.' },
    { key: 'jiraLinkedPrs', label: 'Jira-linked PRs', short: 'Linked PRs', source: 'GitHub', unit: 'count', better: 'neutral' },
    { key: 'costPerMergedPr', label: '{tool} spend per merged PR', short: '$ / PR', usage: true, unit: 'usd', better: 'down', derived: true, desc: '{tool} spend ÷ PRs merged, for months with at least one merged PR.' },
  ];
  for (const m of METRICS) if (m.usage) { m.labelT = m.label; m.descT = m.desc; }

  const BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

  // ---------- AI tool ----------
  // The usage metrics use the Cursor column names. The AI tool setting picks where their values come from: the Cursor
  // column, the Copilot column (copilot + Key), or both together. AID.data.applyTool writes the values into each row.
  const TOOLS = [
    { key: 'cursor', label: 'Cursor', any: 'Cursor' },
    { key: 'copilot', label: 'Copilot', any: 'Copilot' },
    { key: 'both', label: 'Cursor + Copilot', short: 'Both', any: 'Cursor or Copilot' },
  ];
  const COPILOT_KEYS = ['spendDollars', 'contractTotalSpend', 'activeDays', 'totalRequests', 'agentRequests', 'chatRequests', 'totalLinesAdded', 'acceptedLinesAdded',
    'totalLinesDeleted', 'acceptedLinesDeleted', 'totalTabsShown', 'totalTabsAccepted', 'totalApplies', 'totalAccepts'];
  const copilotKey = (k) => 'copilot' + k[0].toUpperCase() + k.slice(1);

  function setTool(key) {
    const tool = TOOLS.find((t) => t.key === key) || TOOLS[0];
    AID.tool = tool;
    for (const m of METRICS) {
      if (!m.usage) continue;
      const desc = (m.descBy && m.descBy[tool.key]) || m.descT;
      m.source = tool.label;
      m.label = m.labelT.replace('{tool}', tool.label);
      m.desc = desc ? desc.replace(/\{tool\}/g, tool.label) : desc;
    }
    AID.USAGE_METRICS = METRICS.filter((m) => m.usage && m.key !== 'costPerMergedPr' && available(m.key)).map((m) => m.key);
  }
  // False for a Cursor-only metric in the Copilot view.
  function available(key) { const m = BY_KEY[key]; return !!m && !(m.cursorOnly && AID.tool.key === 'copilot'); }

  // The metrics that answer "are developers more productive?" on the executive page.
  const KEY_PRODUCTIVITY = ['prsMerged', 'throughput', 'storyPoints', 'medianCycleDays', 'medianTimeToMergeHours'];
  const QUALITY_GUARDRAIL = 'reopenRatePct';
  const OUTCOME_METRICS = METRICS.filter((m) => !m.usage).map((m) => m.key).concat(['costPerMergedPr']);

  const GROUPS = [
    { key: 'org', label: 'Org' },
    { key: 'domain', label: 'Domain' },
    { key: 'team', label: 'Team' },
    { key: 'level', label: 'Job level' },
    { key: 'role', label: 'Role' },
    { key: 'tier', label: 'AI usage tier' },
  ];

  // ---------- Formatting ----------
  const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return nf1.format(v / 1e6) + 'M';
    if (a >= 1e4) return nf1.format(v / 1e3) + 'K';
    if (a >= 100) return nf0.format(v);
    return nf1.format(v);
  }

  function fmt(v, unit, opts) {
    if (v == null || !isFinite(v)) return '—';
    const short = opts && opts.short;
    switch (unit) {
      case 'pct': return nf1.format(v) + '%';
      case 'days': return nf1.format(v) + (short ? 'd' : ' days');
      case 'hours': return nf1.format(v) + (short ? 'h' : ' hrs');
      case 'usd': return '$' + (Math.abs(v) >= 1000 ? compact(v) : (Math.abs(v) >= 100 ? nf0.format(v) : v.toFixed(2)));
      default: return compact(v);
    }
  }

  function fmtMetric(v, key, opts) { return fmt(v, (BY_KEY[key] || {}).unit, opts); }

  function fmtPct(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    const d = digits == null ? 1 : digits;
    const s = (v * 100).toFixed(d);
    if (Number(s) === 0) return (0).toFixed(d) + '%'; // no "-0%" or "+0%"
    return (v > 0 ? '+' : '') + s + '%';
  }

  function fmtPts(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts';
  }

  AID.METRICS = METRICS;
  AID.M = BY_KEY;
  AID.KEY_PRODUCTIVITY = KEY_PRODUCTIVITY;
  AID.QUALITY_GUARDRAIL = QUALITY_GUARDRAIL;
  AID.OUTCOME_METRICS = OUTCOME_METRICS;
  AID.GROUPS = GROUPS;
  AID.TOOLS = TOOLS;
  AID.COPILOT_KEYS = COPILOT_KEYS;
  AID.copilotKey = copilotKey;
  AID.setTool = setTool;
  AID.available = available;
  AID.fmt = { value: fmt, metric: fmtMetric, pct: fmtPct, pts: fmtPts, compact };
  setTool('cursor');
})(window.AID);
