/* Synthetic demo data in the exact CSV shape the dashboard expects. Seeded, so the output is the same every time.
   Shape: 3 orgs (~150 devs each), 4–8 domains per org, 2–5 teams per domain, teams of 4–8 (2× SDE1, 4× SDE2, 2× SDE3). */
window.AID = window.AID || {};
(function (AID) {
  'use strict';

  const DEV_FIELDS = ['devId', 'squadId', 'email', 'name', 'orgLeader', 'orgName', 'department', 'manager', 'role', 'jobLevel', 'isIC', 'cursorUserId', 'jiraAccountId', 'githubLogin', 'primaryProject', 'primaryRepo'];
  const MET_FIELDS = ['devId', 'month', 'spendDollars', 'contractTotalSpend', 'activeDays', 'totalRequests', 'composerRequests', 'agentRequests', 'chatRequests', 'cmdkUsages', 'bugbotUsages', 'totalLinesAdded', 'acceptedLinesAdded', 'totalLinesDeleted', 'acceptedLinesDeleted', 'totalTabsShown', 'totalTabsAccepted', 'totalApplies', 'totalAccepts', 'totalRejects', 'primaryModel', 'storyPoints', 'throughput', 'thoughputWithSubtasks', 'storiesdone', 'bugsDone', 'tasksDone', 'subtasksDone', 'medianCycleDays', 'meanCycleDays', 'reopenedTickets', 'reopenRatePct', 'prsOpened', 'prsMerged', 'additions', 'deletions', 'changedFiles', 'medianTimeToMergeHours', 'jiraLinkedPrs'];

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
            const handle = name.toLowerCase().replace(/[^a-z]+/g, '.');
            devRows.push({
              devId: id, squadId, email: handle + '@example.com', name, orgLeader: org.leader, orgName: org.name, department: domain,
              manager: mem.ic ? manager : director, role: mem.ic ? 'Software Engineer' : 'Engineering Manager', jobLevel: mem.lv,
              isIC: mem.ic ? 'true' : 'false', cursorUserId: 'cu_' + id.toLowerCase(), jiraAccountId: '5f' + (devNum * 7919).toString(16),
              githubLogin: handle.replace(/\./g, '-'), primaryProject: domain.replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase(), primaryRepo: repo,
            });
            people.push({ id, org, lv: mem.lv, ic: mem.ic, teamEffect });
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
      const startM = rnd() < 0.07 ? ri(3, 16) : 0;
      const endM = rnd() < 0.05 ? ri(12, N_MONTHS - 2) : N_MONTHS - 1;
      const quality = p.org.name === 'Customer Experience' ? 1 : -0.4;
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
        const prod = skill * season * trend;

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

        metRows.push({
          devId: p.id, month: monthKey(m), spendDollars: spend.toFixed(2), contractTotalSpend: '', activeDays, totalRequests: req,
          composerRequests: composer, agentRequests: agent, chatRequests: chat, cmdkUsages: cmdk, bugbotUsages: bugbot,
          totalLinesAdded, acceptedLinesAdded, totalLinesDeleted: Math.round(totalLinesAdded * 0.35), acceptedLinesDeleted: Math.round(acceptedLinesAdded * 0.3),
          totalTabsShown: tabsShown, totalTabsAccepted: tabsAcc, totalApplies: applies, totalAccepts: accepts, totalRejects: applies - accepts, primaryModel: model,
          storyPoints, throughput, thoughputWithSubtasks: throughput + subtasks, storiesdone: stories, bugsDone: bugs, tasksDone: Math.max(0, throughput - stories - bugs),
          subtasksDone: subtasks, medianCycleDays: cycle, meanCycleDays: cycle === '' ? '' : r1(cycle * (1.25 + 0.2 * rnd())),
          reopenedTickets: reopenRate === '' ? 0 : Math.round((throughput * reopenRate) / 100), reopenRatePct: reopenRate,
          prsOpened, prsMerged, additions, deletions: Math.round(additions * (0.3 + 0.2 * rnd())), changedFiles: Math.round(prsMerged * (4 + 4 * rnd())),
          medianTimeToMergeHours: ttm, jiraLinkedPrs: Math.round(prsMerged * (0.7 + 0.25 * rnd())),
        });
      }
    }
    // contractTotalSpend: company-wide spend for the month, repeated on each row (as an aggregate field usually is).
    const byMonth = {};
    for (const r of metRows) byMonth[r.month] = (byMonth[r.month] || 0) + Number(r.spendDollars);
    for (const r of metRows) r.contractTotalSpend = byMonth[r.month].toFixed(2);

    return {
      dev: { fields: DEV_FIELDS, rows: devRows },
      met: { fields: MET_FIELDS, rows: metRows },
    };
  }

  AID.demo = { generate, DEV_FIELDS, MET_FIELDS };
})(window.AID);
