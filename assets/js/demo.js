/* Synthetic demo data in the exact CSV shape the dashboard expects. Seeded, so the output is the same every time.
   Shape: 3 orgs (~150 devs each), 4–8 domains per org, 2–5 teams per domain, teams of 4–8 (2× SDE1, 4× SDE2, 2× SDE3). */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const DEV_FIELDS = ['devId', 'squadId', 'name', 'orgName', 'department', 'manager', 'role', 'jobLevel', 'isIC'];
  const MET_FIELDS = ['devId', 'month', 'spendDollars', 'activeDays', 'totalRequests', 'composerRequests', 'agentRequests', 'chatRequests', 'cmdkUsages', 'bugbotUsages', 'acceptedLinesAdded', 'totalTabsShown', 'totalTabsAccepted', 'totalAccepts', 'totalRejects', 'primaryModel', 'storyPoints', 'throughput', 'thoughputWithSubtasks', 'storiesdone', 'bugsDone', 'tasksDone', 'subtasksDone', 'medianCycleDays', 'meanCycleDays', 'reopenedTickets', 'prsOpened', 'prsMerged', 'additions', 'deletions', 'changedFiles', 'medianTimeToMergeHours', 'jiraLinkedPrs', 'copilotSpendDollars', 'copilotActiveDays', 'copilotTotalRequests', 'copilotAgentRequests', 'copilotChatRequests', 'copilotAcceptedLinesAdded', 'copilotTotalTabsShown', 'copilotTotalTabsAccepted', 'copilotTotalApplies', 'copilotTotalAccepts', 'copilotPrimaryModel', 'combinedActiveDays',
    'medianPrSizeLines', 'churnedLines', 'prsReviewed', 'reviewCommentsGiven', 'medianTimeToFirstReviewHours'];
  const TEAM_FIELDS = ['squadId', 'month', 'bugsDiscovered', 'escapedBugs'];

  const ORGS = [
    { name: 'Commerce', leader: 'Dana Whitfield', effect: 0.24, speed: 0.33,
      domains: ['Checkout', 'Catalog', 'Payments', 'Pricing', 'Search & Discovery', 'Fulfillment', 'Merchant Tools'] },
    { name: 'Platform', leader: 'Rafael Ortega', effect: 0.38, speed: 0.5,
      domains: ['Developer Experience', 'Data Platform', 'Identity', 'Cloud Infrastructure', 'Observability'] },
    { name: 'Customer Experience', leader: 'Priya Natarajan', effect: 0.10, speed: 0.22,
      domains: ['Mobile', 'Web App', 'Messaging', 'Support Tools', 'Personalization', 'Accessibility'] },
  ];
  const TEAM_WORDS = ['Atlas', 'Beacon', 'Comet', 'Delta', 'Ember', 'Falcon', 'Garnet', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen', 'Meridian', 'Nova', 'Orchid', 'Pioneer', 'Quartz', 'Rover', 'Summit', 'Tundra', 'Umbra', 'Vertex', 'Willow', 'Zephyr'];
  const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Skyler', 'Devon', 'Emerson', 'Hayden', 'Kai', 'Logan', 'Noor', 'Parker', 'Reese', 'Sasha', 'Tatum', 'Wren', 'Yuki', 'Arjun', 'Mei', 'Omar', 'Lena', 'Mateo', 'Ines', 'Tomas', 'Aisha', 'Kenji', 'Zara', 'Felix', 'Nadia', 'Hugo', 'Leila', 'Ravi', 'Sofia'];
  const LAST = ['Chen', 'Patel', 'Garcia', 'Kim', 'Nguyen', 'Smith', 'Johnson', 'Okafor', 'Silva', 'Müller', 'Rossi', 'Haddad', 'Tanaka', 'Kowalski', 'Andersen', 'Dubois', 'Ivanova', 'Mensah', 'Reyes', 'Sato', 'Brooks', 'Fischer', 'Lopez', 'Moreau', 'Novak', 'Osei', 'Park', 'Quinn', 'Rahman', 'Schmidt', 'Torres', 'Varga', 'Weber', 'Yilmaz', 'Zhang'];

  const START = { y: 2024, m: 10 }; // first month
  const N_MONTHS = 24;
  const PILOT = 4;   // month offset of the pilot (Feb 2025)
  const ROLLOUT = 6; // month offset of the company-wide rollout (Apr 2025)
  const CP_AGENT = 6; // month offset when Copilot agent mode became available (Apr 2025)

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(seed) {
    const rnd = mulberry32(seed || 20251026);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const normal = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const poisson = (l) => {
      if (l <= 0) return 0;
      if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * normal()));
      const L = Math.exp(-l); let k = 0, p = 1;
      do { k++; p *= rnd(); } while (p > L);
      return k - 1;
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    // Copilot values use their own random stream, so the Cursor, Jira, and GitHub values stay the same as before.
    const crnd = mulberry32((seed || 20251026) ^ 0x5eed);
    const cri = (a, b) => a + Math.floor(crnd() * (b - a + 1));
    const cpick = (arr) => arr[Math.floor(crnd() * arr.length)];
    const cnormal = () => { let u = 0, v = 0; while (!u) u = crnd(); while (!v) v = crnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    // combinedActiveDays: days with either tool. Each tool's active days go on random work days of the month (own random stream).
    const drnd = mulberry32((seed || 20251026) ^ 0xda75);
    const WORK_DAYS = 22;
    const pickDays = (n) => { const all = [...Array(WORK_DAYS).keys()]; for (let i = 0; i < n; i++) { const j = i + Math.floor(drnd() * (WORK_DAYS - i)); [all[i], all[j]] = [all[j], all[i]]; } return all.slice(0, n); };
    const unionDays = (a, b) => (a && b ? new Set(pickDays(a).concat(pickDays(b))).size : Math.max(a, b));
    // PR size, churn, review, and team bug values: one more stream, so all earlier values stay the same.
    const xrnd = mulberry32((seed || 20251026) ^ 0xb065);
    const xnormal = () => { let u = 0, v = 0; while (!u) u = xrnd(); while (!v) v = xrnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const xpoisson = (l) => {
      if (l <= 0) return 0;
      if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * xnormal()));
      const L = Math.exp(-l); let k = 0, p = 1;
      do { k++; p *= xrnd(); } while (p > L);
      return k - 1;
    };
    const r1 = (v) => Math.round(v * 10) / 10;
    const monthKey = (off) => { const i = START.y * 12 + START.m - 1 + off; return Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0'); };
    const calMonth = (off) => (START.m - 1 + off) % 12; // 0 = Jan

    const usedNames = new Set();
    const personName = () => { let n; do { n = pick(FIRST) + ' ' + pick(LAST); } while (usedNames.has(n) && usedNames.size < 1300); usedNames.add(n); return n; };

    const devRows = [], people = [];
    let devNum = 1000, teamWord = 0;
    for (const org of ORGS) {
      const nDomains = clamp(org.domains.length - ri(0, 1), 4, 8);
      for (const domain of org.domains.slice(0, nDomains)) {
        const director = personName();
        const domainEffect = 0.75 + rnd() * 0.5;
        const nTeams = ri(2, 5);
        for (let t = 0; t < nTeams; t++) {
          const tw = TEAM_WORDS[teamWord++ % TEAM_WORDS.length];
          const squadId = (org.name.slice(0, 3) + '-' + domain.replace(/[^A-Za-z]/g, '').slice(0, 4) + '-' + tw).toUpperCase();
          const manager = personName();
          const repo = domain.toLowerCase().replace(/[^a-z]+/g, '-') + '-' + tw.toLowerCase();
          const teamEffect = domainEffect * (0.85 + rnd() * 0.3);
          const size = rnd() < 0.7 ? 8 : ri(4, 7);
          const levels = ['SDE1', 'SDE1', 'SDE2', 'SDE2', 'SDE2', 'SDE2', 'SDE3', 'SDE3'];
          while (levels.length > size) levels.splice(rnd() < 0.5 ? 2 : 0, 1);
          const members = levels.map((lv) => ({ lv, ic: true }));
          members.push({ lv: 'M1', ic: false });
          for (const mem of members) {
            const id = 'D' + devNum++;
            const name = mem.ic ? personName() : manager;
            devRows.push({
              devId: id, squadId, name, orgName: org.name, department: domain,
              manager: mem.ic ? manager : director, role: mem.ic ? 'Software Engineer' : 'Engineering Manager', jobLevel: mem.lv,
              isIC: mem.ic ? 'true' : 'false',
            });
            people.push({ id, org, lv: mem.lv, ic: mem.ic, teamEffect, dev: devRows[devRows.length - 1] });
          }
        }
      }
    }

    const metRows = [];
    const levelBase = { SDE1: { pr: 4.2, tp: 5, cyc: 7 }, SDE2: { pr: 6, tp: 7, cyc: 6 }, SDE3: { pr: 6.4, tp: 6, cyc: 5 }, M1: { pr: 1.2, tp: 2, cyc: 6 } };
    const levelEffect = { SDE1: 1.3, SDE2: 1.0, SDE3: 0.7, M1: 0.5 };
    for (const p of people) {
      const base = levelBase[p.lv];
      const skill = Math.exp(0.22 * normal());
      const propensity = Math.pow(rnd(), 0.75);
      const never = rnd() < (p.org.name === 'Customer Experience' ? 0.16 : 0.07);
      const pilot = p.org.name === 'Platform' && rnd() < 0.3;
      let adopt = Infinity;
      if (!never) {
        if (pilot) adopt = PILOT + ri(0, 1);
        else { adopt = ROLLOUT; while (rnd() > p.org.speed && adopt < N_MONTHS - 2) adopt++; }
      }
      const startM = rnd() < 0.15 ? ri(3, 18) : 0; // ~15% are new hires during the window
      const endM = rnd() < 0.05 ? ri(12, N_MONTHS - 2) : N_MONTHS - 1;
      const quality = p.org.name === 'Customer Experience' ? 1 : -0.4;
      // Copilot: some developers already have a seat. Most use it less after they adopt Cursor, and half lose the seat.
      const cpSeat = crnd() < (never ? 0.6 : 0.35);
      const cpStart = cpSeat ? (crnd() < 0.7 ? 0 : cri(1, ROLLOUT)) : Infinity;
      const cpDrop = crnd() < 0.5 ? cri(2, 6) : Infinity; // months after Cursor adoption when the seat is removed
      const cpPropensity = Math.pow(crnd(), 0.8);
      let cpSpendTotal = 0;
      for (let m = startM; m <= endM; m++) {
        const cm = calMonth(m);
        const season = cm === 11 ? 0.74 : cm === 6 || cm === 7 ? 0.92 : 1;
        const trend = 1 + 0.003 * m;
        const since = m - adopt;
        let activeDays = 0;
        if (since >= 0) {
          const ramp = Math.min(1, (since + 1) / 4);
          activeDays = clamp(Math.round(3 + 17 * propensity * ramp * season + 2.2 * normal()), 1, 22);
        } else if (m >= PILOT && rnd() < 0.08) activeDays = ri(1, 3);
        const intensity = activeDays / 20;
        const maturity = since >= 0 ? Math.min(1, (since + 1) / 6) : 0;
        const effect = p.org.effect * p.teamEffect * levelEffect[p.lv] * intensity * (0.4 + 0.6 * maturity);
        // New hires ramp up from ~30% output in their first month to full output by their fourth month.
        const onboarding = startM > 0 ? Math.min(1, 0.3 + (0.7 * (m - startM)) / 3) : 1;
        const prod = skill * season * trend * onboarding;

        const prsMerged = poisson(base.pr * prod * (1 + effect));
        const prsOpened = prsMerged + poisson(0.8 + 0.4 * intensity);
        const throughput = poisson(base.tp * prod * (1 + 0.6 * effect));
        const subtasks = poisson(2.5 * season);
        const stories = Math.round(throughput * (0.45 + 0.1 * rnd()));
        const bugs = Math.round((throughput - stories) * (0.4 + 0.2 * rnd()));
        const storyPoints = Math.max(0, Math.round(throughput * (2.4 + 0.6 * rnd()) * (1 + 0.15 * effect)));
        const cycle = throughput ? r1(clamp(base.cyc * (1 - 0.45 * effect) * Math.exp(0.25 * normal()), 0.5, 30)) : '';
        const reopenRate = throughput ? r1(clamp(6 + quality * 6 * intensity * maturity + 2.5 * normal(), 0, 40)) : '';
        const linesPerPr = 170 * (1 + 0.6 * intensity) * Math.exp(0.3 * normal());
        const additions = Math.round(prsMerged * linesPerPr);
        const ttm = prsMerged ? r1(clamp(20 * (1 + 0.3 * intensity * maturity) * Math.exp(0.35 * normal()), 1, 200)) : '';

        const reviews = xpoisson({ SDE1: 3, SDE2: 5, SDE3: 6.5, M1: 1.5 }[p.lv] * season * onboarding * (1 + 0.35 * clamp((m - ROLLOUT) / 12, 0, 1)));

        // Cursor usage
        const req = activeDays ? Math.round(activeDays * (6 + 14 * propensity) * Math.exp(0.2 * normal())) : 0;
        const agentShare = clamp(0.08 + 0.025 * Math.max(0, m - PILOT), 0.08, 0.6);
        const agent = Math.round(req * agentShare), composer = Math.round(req * (0.3 - agentShare * 0.35)), chat = Math.round(req * 0.3), cmdk = Math.max(0, req - agent - composer - chat);
        const bugbot = activeDays && m >= 11 ? poisson(prsOpened * 0.7) : 0;
        const tabsShown = activeDays * ri(60, 140);
        const tabsAcc = Math.round(tabsShown * clamp(0.28 + 0.12 * propensity + 0.03 * normal(), 0.1, 0.6));
        const applies = Math.round((agent + composer) * 0.8), accepts = Math.round(applies * (0.62 + 0.15 * rnd()));
        const totalLinesAdded = Math.round(tabsAcc * 1.6 + agent * 30 + composer * 12);
        const acceptedLinesAdded = Math.round(totalLinesAdded * (0.55 + 0.15 * rnd()));
        const seat = m >= (pilot ? PILOT : ROLLOUT) ? 20 : 0;
        const spend = seat + req * 0.04 + agent * 0.09;
        let model = '';
        if (activeDays) {
          if (m < 8) model = pick(['claude-3.7-sonnet', 'claude-3.7-sonnet', 'gpt-4o', 'cursor-small']);
          else if (m < 14) model = pick(['claude-4-sonnet', 'claude-4-sonnet', 'gpt-4.1', 'gemini-2.5-pro', 'auto']);
          else model = pick(['claude-4.5-sonnet', 'claude-4.5-sonnet', 'gpt-5', 'claude-4.5-opus', 'auto', 'gemini-2.5-pro']);
        }

        // Copilot usage
        const cpActive = m >= cpStart && since < cpDrop;
        const cpFade = since >= 0 ? Math.max(0.15, 1 - 0.2 * (since + 1)) : 1;
        const cpDays = cpActive ? clamp(Math.round(2 + 16 * cpPropensity * cpFade * season + 2 * cnormal()), 0, 22) : 0;
        const cpReq = cpDays ? Math.round(cpDays * (3 + 8 * cpPropensity) * Math.exp(0.2 * cnormal())) : 0;
        const cpAgent = m >= CP_AGENT ? Math.round(cpReq * clamp(0.05 + 0.03 * (m - CP_AGENT), 0.05, 0.5)) : 0;
        const cpChat = cpReq - cpAgent;
        const cpTabsShown = cpDays * cri(80, 160);
        const cpTabsAcc = Math.round(cpTabsShown * clamp(0.25 + 0.1 * cpPropensity + 0.03 * cnormal(), 0.1, 0.5));
        const cpApplies = Math.round((cpAgent + cpChat * 0.3) * 0.8), cpAccepts = Math.round(cpApplies * (0.55 + 0.15 * crnd()));
        const cpLinesAdded = Math.round(cpTabsAcc * 1.4 + cpAgent * 25 + cpChat * 4);
        const cpAcceptedLines = Math.round(cpLinesAdded * (0.5 + 0.15 * crnd()));
        const cpSpend = cpActive ? 19 + cpAgent * 0.04 : 0; // seat + premium requests
        cpSpendTotal += cpSpend;
        let cpModel = '';
        if (cpDays) {
          if (m < 8) cpModel = cpick(['gpt-4o', 'gpt-4o', 'claude-3.5-sonnet']);
          else if (m < 14) cpModel = cpick(['gpt-4.1', 'gpt-4.1', 'claude-sonnet-4', 'gemini-2.5-pro']);
          else cpModel = cpick(['gpt-5', 'claude-sonnet-4.5', 'claude-sonnet-4.5', 'gpt-5-mini', 'auto']);
        }

        metRows.push({
          devId: p.id, month: monthKey(m), spendDollars: spend.toFixed(2), activeDays, totalRequests: req,
          composerRequests: composer, agentRequests: agent, chatRequests: chat, cmdkUsages: cmdk, bugbotUsages: bugbot, acceptedLinesAdded,
          totalTabsShown: tabsShown, totalTabsAccepted: tabsAcc, totalAccepts: accepts, totalRejects: applies - accepts, primaryModel: model,
          storyPoints, throughput, thoughputWithSubtasks: throughput + subtasks, storiesdone: stories, bugsDone: bugs, tasksDone: Math.max(0, throughput - stories - bugs),
          subtasksDone: subtasks, medianCycleDays: cycle, meanCycleDays: cycle === '' ? '' : r1(cycle * (1.25 + 0.2 * rnd())),
          reopenedTickets: reopenRate === '' ? '' : Math.round((throughput * reopenRate) / 100),
          prsOpened, prsMerged, additions, deletions: Math.round(additions * (0.3 + 0.2 * rnd())), changedFiles: Math.round(prsMerged * (4 + 4 * rnd())),
          medianTimeToMergeHours: ttm, jiraLinkedPrs: Math.round(prsMerged * (0.7 + 0.25 * rnd())),
          copilotSpendDollars: cpSpend.toFixed(2), copilotActiveDays: cpDays, copilotTotalRequests: cpReq,
          copilotAgentRequests: cpAgent, copilotChatRequests: cpChat, copilotAcceptedLinesAdded: cpAcceptedLines,
          copilotTotalTabsShown: cpTabsShown, copilotTotalTabsAccepted: cpTabsAcc, copilotTotalApplies: cpApplies, copilotTotalAccepts: cpAccepts, copilotPrimaryModel: cpModel,
          combinedActiveDays: unionDays(activeDays, cpDays),
          // AI makes PRs larger and adds rework (more where quality > 0). Review load grows as the whole company adopts.
          medianPrSizeLines: prsMerged ? Math.round(linesPerPr * 1.35 * Math.exp(0.15 * xnormal())) : '',
          churnedLines: Math.round(additions * clamp(0.035 + intensity * maturity * (quality > 0 ? 0.05 : 0.02) + 0.008 * xnormal(), 0, 0.3)),
          prsReviewed: reviews, reviewCommentsGiven: Math.round(reviews * (1.5 + 2 * xrnd())),
          medianTimeToFirstReviewHours: prsMerged ? r1(clamp(5 * (1 + 0.5 * intensity * maturity) * Math.exp(0.4 * xnormal()), 0.2, 120)) : '',
        });
      }
    }

    // Team bugs: bugs found in a month come from the team's PRs of that month and the two before it.
    // At full adoption the bug rate rises 35% for Customer Experience and falls 14% elsewhere (the same quality signs as reopen rate).
    const teamOf = new Map(people.map((p) => [p.id, p]));
    const teams = new Map();
    for (const r of metRows) {
      const p = teamOf.get(r.devId), squadId = p.dev.squadId;
      if (!teams.has(squadId)) teams.set(squadId, { quality: p.org.name === 'Customer Experience' ? 1 : -0.4, months: new Map() });
      const t = teams.get(squadId);
      const c = t.months.get(r.month) || { prs: 0, devs: 0, adopted: 0 };
      c.prs += r.prsMerged; c.devs++; if (r.activeDays >= 5) c.adopted++;
      t.months.set(r.month, c);
    }
    const teamRows = [];
    const LAG = [0.4, 0.35, 0.25];
    for (const [squadId, t] of teams) {
      for (let m = 0; m < N_MONTHS; m++) {
        if (!t.months.has(monthKey(m))) continue;
        let l = 0;
        LAG.forEach((w, k) => { const c = t.months.get(monthKey(m - k)); if (c) l += w * c.prs * 0.1 * (1 + 0.35 * t.quality * (c.adopted / c.devs)); });
        const bugs = xpoisson(l);
        let escaped = 0;
        for (let i = 0; i < bugs; i++) if (xrnd() < 0.3) escaped++;
        teamRows.push({ squadId, month: monthKey(m), bugsDiscovered: bugs, escapedBugs: escaped });
      }
    }

    return {
      dev: { fields: DEV_FIELDS, rows: devRows },
      met: { fields: MET_FIELDS, rows: metRows },
      team: { fields: TEAM_FIELDS, rows: teamRows },
    };
  }

  AID.demo = { generate, DEV_FIELDS, MET_FIELDS, TEAM_FIELDS };
})(window.AID);
