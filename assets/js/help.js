/* Help content (methods, charts, metrics), the "?" popover next to each chart, and the Guide page.
   Text placeholders like {thr} are filled from the current settings when shown. */
window.AID = window.AID || {};
(function (AID) {
  'use strict';
  const { el } = AID.ui;

  // ---------- Content ----------
  // Topic fields: title, short (1–2 sentences), how / read / watch (lists of sentences), see (related topic ids).
  // `how` = how it is calculated. `read` = how to interpret it. `watch` = limits and traps.
  const METHODS = [
    {
      id: 'm-pipeline', title: 'From CSV files to results',
      short: 'The dashboard joins the two CSV files on developer and month, then calculates every result in the browser.',
      how: [
        'The optional team_monthly_metrics.csv has one row per team (squadId) per month, with bugsDiscovered and escapedBugs. It is only used by the team-level effect.',
        'Each row of developer_monthly_metrics.csv is one developer in one month. The dashboard matches it to developers.csv by devId (or email, cursorUserId, jiraAccountId, githubLogin).',
        'The month column can be in many formats (2025-03, 3/1/2025, Mar 2025). The dashboard converts all of them to one calendar month.',
        'A blank AI usage cell (Cursor or Copilot) counts as 0, because no usage means zero. A blank Jira or GitHub cell counts as missing, not 0. Missing values are left out of averages.',
        'Derived metrics (tab acceptance rate, AI acceptance rate, AI share of added lines, spend per merged PR) are calculated for each developer-month from the raw columns.',
        'Most results are an average per developer per month. For a group, the dashboard first averages each developer\'s months, then averages the developers. Thus each developer has the same weight, whatever their number of months.',
      ],
      read: ['"Per dev / mo" means: the average developer, in an average month.'],
      watch: ['Rows that do not match a developer, rows with a bad month, and duplicate rows are listed under "Data notes" after you load the files.'],
    },
    {
      id: 'm-tools', title: 'AI tool: Cursor, Copilot, or both',
      short: 'The AI tool switch in the filter bar sets where every AI usage metric comes from: Cursor, Copilot, or both tools together. The current tool is {tool}.',
      how: [
        'Cursor uses the plain columns (activeDays, totalRequests, …). Copilot uses the columns that start with copilot (copilotActiveDays, copilotTotalRequests, …).',
        'Cursor + Copilot adds the two tools together for requests, lines, tabs, and spend.',
        'Cursor + Copilot active days = combinedActiveDays: the days in the month with Cursor or Copilot activity, counted from daily data before the CSV is made. A day with both tools counts once. Example: Cursor on Monday and Wednesday, Copilot on Tuesday and Wednesday = 3 days.',
        'If combinedActiveDays is missing or blank, the dashboard uses the higher of the two counts (2 in the example). That value is too low when the tools are used on different days. Days are never added together, because that counts shared days twice.',
        'Composer, Cmd+K, and Bugbot are Cursor features. The Copilot view does not show them. The combined view uses the Cursor values.',
        'Copilot has no rejects column. For the AI acceptance rate, Copilot rejects = copilotTotalApplies − copilotTotalAccepts.',
        'In the combined view, the primary model of a month is the model of the tool with more active days.',
        'The adoption month, the usage tiers, and the AI effect all use the active days of the selected tool. Jira and GitHub metrics do not change.',
        'Cursor view: a developer who uses only Copilot is a non-adopter. The same is true for Cursor users in the Copilot view. Cursor + Copilot view: a developer adopts in the first month with {thr}+ combined active days. With combinedActiveDays, that can happen before either tool alone reaches {thr} days.',
        'In the Cursor or Copilot view, the AI effect leaves out every month with {thr}+ active days in the other tool. Before adoption, such a month is not a month without AI. After adoption, it mixes the two tools. Thus the effect compares the selected tool alone with no AI.',
        'The start month of a developer (for new-hire onboarding) uses both tools in every view, so the same months are left out in each view.',
      ],
      read: ['Compare the AI effect in the three views. A clear effect for one tool and none for the other means the two tools do not change output in the same way.'],
      watch: [
        'A developer who used the tool from the first month of the data has no months before adoption. That developer cannot add to the AI effect. This is common for Copilot, and for the combined view when Copilot came before Cursor.',
        'Developers who moved from Copilot to Cursor show a drop in Copilot use. That drop is a change of tool, not less AI use. Use the combined view to see total AI use.',
        'In the Cursor view, the AI effect of a developer who used Copilot before Cursor compares Cursor with their months without any AI. If all their months before Cursor had Copilot, they have no baseline and are left out.',
      ],
      see: ['m-adoption', 'm-tiers'],
    },
    {
      id: 'm-onboarding', title: 'New hires and onboarding',
      short: 'A new hire\'s first {onboard} months are left out of every result, because output is low while people learn the codebase.',
      how: [
        'A developer\'s start month is their first month with any work: PRs, Jira issues, story points, GitHub additions, or {tool} active days.',
        'A new hire is a developer whose start month comes after the first month in the data. Developers who already worked in the first month count as existing staff.',
        'The first {onboard} months after a new hire\'s start month are left out of every chart, table, and statistic. You can change this number in Settings.',
      ],
      read: ['The method note under the verdict says how many new hires are affected.'],
      watch: [
        'The input files have no hire date, so the start month is an estimate. A developer who moved in from another team also looks like a new hire.',
        'If new hires keep ramping up after {onboard} months, increase the setting.',
      ],
    },
    {
      id: 'm-adoption', title: 'Adoption month and adoption rate',
      short: 'A developer adopts AI in their first month with {thr}+ {tool} active days. The adoption rate is the share of developers (or months) at that level.',
      how: [
        'Adoption month = the first month (after onboarding) with {thr} or more {tool} active days. You can change {thr} in Settings (Active threshold).',
        'A developer who never reaches {thr} active days in one month is a non-adopter.',
        'The adoption month always comes from the full data, not only from the From–To range. Otherwise a developer who adopted before From would look as if they adopted in the From month.',
        'AI adoption over time = share of developers with {thr}+ active days in each month. High usage = share with {hi}+ active days.',
        'Adoption % for a group = share of that group\'s after-period developer-months with {thr}+ active days.',
      ],
      read: ['A high adoption rate with a small AI effect means people use the tool, but it does not (yet) change their output.'],
      watch: ['One month at {thr}+ days is enough to count as adopted. A developer who tried {toolAny} once and stopped is still an adopter. The usage tier shows how much they kept using it.'],
    },
    {
      id: 'm-tiers', title: 'AI usage tiers',
      short: 'Each developer gets one usage tier from their use of {tool} after adoption (or after the rollout month): by active days (default) or by spend.',
      how: [
        'Settings (Usage tier based on) sets the basis: Active days or Spend.',
        'Active days: usage = the average {tool} active days per month in the developer\'s after period. Non-adopter: under 1 day per month. Low: 1 to {hiMinus}. High: {hi}+. The threshold is in Settings.',
        'Spend: non-adopter is still under 1 active day per month. The other developers are split at the median of their average {tool} spend per month in the after period: Low = below the median, High = at or above it. The tier labels show the dollar cut point.',
        'The spend median comes from every developer in the date range, not only the filtered group. Thus a filter does not change the tier of a developer.',
        'Two tiers, not three: a light tier (1 to {thrMinus} days) held only developers who reached the active threshold once and then stopped. Too few to read. The five-bucket curve per developer-month is on the Explore tab (Productivity by monthly AI usage).',
      ],
      read: [
        'If AI causes the effect, the effect is larger for high-usage developers than for low-usage developers. This is called a dose-response pattern. It is one of the strongest signs of a real effect.',
        'If low- and high-usage developers improved by the same amount, something other than AI use (for example, a process change) is the more likely cause.',
      ],
      watch: [
        'Developers choose how much to use AI. High-usage developers may differ from low-usage developers in other ways (role, type of work, motivation).',
        'Spend also depends on model prices and pricing changes, not only on use. A developer who uses an expensive model looks heavier. Busy developers spend more, so heavy spenders can look more productive without an AI effect. Compare the result with active-day tiers.',
        'Many developers with the same spend (for example, the same seat price) make the halves uneven: equal values always go into the same tier.',
      ],
    },
    {
      id: 'm-did', title: 'AI effect (difference-in-differences)',
      short: 'The AI effect is the difference between what adopters actually produced and what they would have produced without AI.',
      how: [
        'Step 1. The dashboard fits a model on every month without AI. In the Cursor or Copilot view, months with {thr}+ days in the other tool are left out of all steps. The model has a developer effect (each developer\'s normal level) and a month effect (the company-wide change in that calendar month, for example a December dip).',
        'Step 2. For each adopter month after adoption: expected = developer effect + month effect. This is the value without AI.',
        'Step 3. AI effect for that month = actual − expected.',
        'Step 4. The dashboard averages the effect for each adopter, then across adopters. The % is the average effect divided by the average expected value.',
        'A median or a rate (cycle time, time to merge, PR size, reopen rate, churn rate) is weighted by its volume within a developer: a month with 30 issues counts more than a month with 1 in that developer\'s own average. Across developers each developer counts once. Counts are not weighted.',
        'Times (cycle time, time to merge, time to first review) are fitted on the log scale: the effect is a ratio for the typical developer, and one very long ticket cannot dominate. Counts and rates are linear. Settings (Log scale) can log the counts too; they use log(value + 1) because of zero months.',
        'When the selection has {minClusters}+ teams, the 95% CI treats each team as one unit: developers on one team share re-orgs, incidents, and code, so their effects are not independent. With fewer teams, each developer is one unit. Team clustering with few teams makes every CI unreadable.',
        'For a group, a usage tier, or a month since adoption, the % divides by the average expected value for all adopters in the selection. A group with a small expected value then does not get a very large % and CI, and all groups compare on one scale.',
        'Each adopter has their own adoption month. Adopters are never used as the comparison for each other after they adopt, so a staggered rollout gives correct results.',
        'The model uses every developer in the date range. The org, domain, team, and level filters only choose which adopters to average. This keeps the month effects stable for small groups.',
        'An adopter needs {minMonths}+ months before adoption and {minMonths}+ months after. A month needs {minCtrl}+ comparison developers, otherwise its adopter months are left out. Ramp-up months ({ramp}) after adoption count as neither side.',
      ],
      read: [
        '+12% means: adopters produced 12% more than expected without AI.',
        '"Actual vs expected" below a number gives the two averages behind the %.',
        'The effect removes seasonality and company-wide changes, and fixed differences between developers (skill, level, team).',
      ],
      watch: [
        'The model cannot remove a change that hits only adopters in the month they adopt, for example a team re-org in that month.',
        'Developers chose to adopt. If they adopted because they expected to become more productive, part of the effect may not come from AI. Check the event study and the dose-response pattern.',
      ],
      see: ['m-control', 'm-event', 'm-ci'],
    },
    {
      id: 'm-team', title: 'Team-level AI effect (team PRs and bugs)',
      short: 'Some results only exist per team (bugs), or can move between developers in a team (review work). The team-level effect checks these on team-months.',
      how: [
        'Team = squadId. For each team and month, the dashboard counts the developers, the developers with {thr}+ {tool} active days, and the PRs merged.',
        'Adoption share = developers with {thr}+ active days ÷ developers in the team that month.',
        'PRs merged per developer (team level) = the team\'s PRs merged ÷ its developers, with the adoption share of the same month.',
        'Bugs found per 100 PRs = 100 × bugsDiscovered ÷ PRs merged, over {bugWindow} months. Its adoption share is the average of the {bugWindow} months that end one month earlier, because bugs are found weeks or months after the code is merged. Production bugs per 100 PRs uses escapedBugs in the same way.',
        'The newest {bugSkip} months of the data are left out of bug rates: the bugs from their PRs are not found yet.',
        'The model: value = team effect + month effect + b × adoption share. Team effects remove fixed differences between teams. Month effects remove company-wide changes. Each team-month counts by its developers (or its PRs for bug rates).',
        'b is the change from 0% to 100% team adoption. The % is b ÷ the value expected at 0% adoption.',
        'The 95% CI treats each team as one unit, because the months of one team are not independent. The effect needs {minTeams}+ teams.',
        'The model uses every team in the selected org and domain. The team and job level filters do not apply.',
      ],
      read: [
        '−20% on bugs per 100 PRs means: a team with all developers using AI has 20% fewer bugs per PR than with none.',
        'Compare the team PRs per developer effect with the developer effect on PRs merged. A smaller team effect means part of the developer gain came from other people in the team, for example from their review time.',
      ],
      watch: [
        'There are far fewer teams than developers, so the CI is wider. "Too uncertain" is common for small selections.',
        'A team that moved between squadIds counts in its current team for all months.',
        'A missing team-month in the team file counts as missing, not as 0 bugs. Write 0 for a month with no bugs.',
        'If the effect differs between orgs, the number for all orgs leans toward the orgs whose adoption changed the most. Filter by org to compare.',
        'Teams chose how fast to adopt. A team that adopted early can differ in ways the team effect does not remove, for example a new codebase.',
      ],
      see: ['m-did', 'm-ci'],
    },
    {
      id: 'm-control', title: 'Comparison group and robustness check',
      short: 'The comparison group sets the company-wide change in each month. The verdict shows the effect with three different groups, to check that the choice does not drive the result.',
      how: [
        'All developers without AI yet (default): non-adopters, and adopters in the months before they adopt.',
        'In the Cursor or Copilot view, months with {thr}+ active days in the other tool are left out of every comparison group, and of the adopter months too.',
        'Adopters before adoption only: non-adopters are not used. In late months, almost everyone has adopted, so those months have too few comparison developers and are left out.',
        'Non-adopters only: only non-adopters set the month effects. Each adopter\'s own level still comes from their months before adoption.',
        'You choose the group in Settings (AI effect comparison group). The check in the verdict always shows all three.',
      ],
      read: [
        'Within 3 pts: the result does not depend on the comparison group.',
        'More than 3 pts apart: read the headline with care, and look at which group gives which result.',
        '"Adopters before adoption only" is often lower, because it loses the late months, where the effect is usually largest. That alone is not a sign that non-adopters are a bad comparison.',
      ],
      watch: ['Non-adopters are not a random group. Some do little coding, some are on leave. If they are few, "Non-adopters only" is noisy.'],
    },
    {
      id: 'm-event', title: 'Event study (effect by month since adoption)',
      short: 'The AI effect for each month before and after adoption. It shows whether adopters were already improving before AI, and how fast the effect builds.',
      how: [
        'The x-axis is time relative to each developer\'s own adoption month: 0 = adoption month, −3 = 3 months before, +6 = 6 months after.',
        'After adoption (0 and later): each point = the average of actual − expected for all adopters in that month, as a % of expected.',
        'Before adoption: each point = the average of actual − fitted value, as a % of actual. These months are part of the model fit, so they are a check, not a result.',
        'The band is the 95% confidence interval. A point needs {minCtrl}+ developers.',
      ],
      read: [
        'Before AI, the points should be near 0 with no trend. A trend toward 0 means adopters were already improving before AI, and the effect after adoption is less reliable.',
        'After AI, the points show the size of the effect and how many months it takes to build.',
        'The summary line above the chart gives the first month with a clear effect (the band does not include 0) and the average effect from then on.',
      ],
      watch: [
        'Later points include fewer developers: only those who adopted early enough to reach that month. So the band gets wider, and the later points describe early adopters.',
      ],
      see: ['m-did'],
    },
    {
      id: 'm-beforeafter', title: 'Before / after change',
      short: 'Each developer\'s average after the split minus their own average before it. Used on the Explore tab and in the Lift view.',
      how: [
        'The split is the company rollout month, or each developer\'s adoption month (Settings: Before / after split). In adoption-month mode, non-adopters split at the median adoption month.',
        'For each developer: after-period average − before-period average. A developer needs {minMonths}+ months on each side.',
        'The dashboard averages these per-developer changes. The % is the average change divided by the average before value.',
        'Ramp-up months ({ramp}) right after the split count as neither side.',
      ],
      read: [
        'Each developer is compared with themselves, so differences in skill and level do not affect the result.',
        '"from ~0" for an AI usage metric means usage started near zero. A % change from zero means nothing.',
      ],
      watch: [
        'Everything that changed over time counts as part of the change: seasonality, process changes, re-orgs, company growth. Use the AI effect on the Executive summary for a fair estimate.',
      ],
      see: ['m-did', 'm-lift'],
    },
    {
      id: 'm-lift', title: 'Lift vs non-adopters',
      short: 'A usage tier\'s before/after change minus the before/after change of non-adopters in the same group, in percentage points.',
      how: [
        'For each job level (or org): the before/after % change of each usage tier, minus the before/after % change of the non-adopters at the same level.',
        'The 95% CI uses the standard errors of both cells.',
        'The % changes divide by the average before value for all developers in the selection, so all cells use one scale.',
        'Cells with fewer than {minGroup} developers, or with a 95% CI wider than 200 pts, are hidden.',
      ],
      read: [
        '+20 pts for high-usage SDE2s means: high-usage SDE2s improved 20 percentage points more than non-adopter SDE2s over the same months.',
        'Changes that hit everyone (seasonality, re-orgs) cancel out, because both groups had them.',
      ],
      watch: ['Non-adopters per job level are often few, so the CIs are wide. If a level has fewer than {minGroup} non-adopters, its lift is not shown.'],
      see: ['m-beforeafter'],
    },
    {
      id: 'm-ci', title: 'Confidence intervals and status labels',
      short: 'The 95% confidence interval (CI) is the range that very likely holds the true value. "Improved" and "Worse" show only when the CI does not include 0.',
      how: [
        'The CI comes from the spread of the per-developer results: average ± t × standard deviation ÷ √n, with n = number of developers.',
        'Improved: the 95% CI is fully on the better side of 0. Worse: fully on the worse side. No clear change: the CI includes 0.',
        'Slight improvement / Slightly worse: the 95% CI excludes 0, but the effect is under {slight}%. Clear, but small.',
        'Likely improved / Likely worse: the 95% CI includes 0, but the 80% CI does not. The direction is probable, not established. The verdict does not count these.',
        'For cycle time, time to merge, reopen rate, and spend per merged PR, lower is better. A negative change there is "Improved".',
        'For metrics with no better direction (for example, lines added), the labels are "Increased" and "Decreased".',
      ],
      read: [
        'A narrow CI means the result is precise. A wide CI means few developers or a large spread between them.',
        '"No clear change" does not mean "no effect". It means the data cannot tell the effect apart from noise.',
        'Pale bars and pale heatmap cells are not statistically clear.',
      ],
      watch: ['The CI for the AI effect does not include the uncertainty in the month effects. In late months with few comparison developers, the true uncertainty is larger.'],
    },
    {
      id: 'm-samples', title: 'Small samples',
      short: 'Groups with fewer than {minGroup} developers with enough data are flagged "Small sample" and kept out of charts and rankings.',
      how: [
        'A developer counts toward n only with {minMonths}+ months on both sides (before and after the split, or before and after adoption).',
        'Groups and cells with n under {minGroup} are hidden from charts, left out of rankings, and shown pale in tables. You can change {minGroup} in Settings (Minimum developers per group).',
      ],
      read: ['n is always shown in tables and tooltips. Small n gives wide CIs.'],
      watch: ['A lower minimum shows more groups, but their results are less reliable.'],
    },
    {
      id: 'm-range', title: 'Date range (From / To)',
      short: 'From and To limit which months go into the calculations. The adoption month and the new-hire start month always come from the full data.',
      how: [
        'Every chart and statistic uses only months from From to To.',
        'The adoption month, the auto rollout month, and new-hire detection use the full data.',
      ],
      read: ['Use To to stop at a cut-off date, for example to leave out a partial last month.'],
      watch: [
        'A later From removes adopters\' baseline months. An adopter needs {minMonths}+ months before adoption in the range, so early adopters drop out of the AI effect. The result then describes only late adopters.',
        'Keep From at the first month of data, or at least 6 months before the rollout.',
      ],
    },
    {
      id: 'm-corr', title: 'Correlations',
      short: 'A number from −1 to +1 that shows how closely two metrics move together. It does not show cause.',
      how: [
        'Spearman (default) uses ranks. It is robust to outliers and to curved relationships. Pearson uses the raw values and measures a straight-line relationship.',
        'Per-dev change: one point per developer, the after − before change of each metric. Per developer: one point per developer, their average over the range. Per dev-month: one point per developer per month.',
        'A pair needs 5+ points with both values.',
      ],
      read: [
        'About 0.1 = weak, 0.3 = moderate, 0.5+ = strong.',
        'Per-dev change is the most useful level: it asks whether developers who increased AI use more also increased output more.',
      ],
      watch: [
        'Per developer and per dev-month correlations mix in differences between people and between months. Busy developers use more of every tool.',
        'Busy months can cause more AI use, not the other way round.',
      ],
    },
  ];

  const CHARTS = [
    // ---- Executive summary ----
    {
      id: 'c-verdict', title: 'Verdict', area: 'Executive summary',
      short: 'The answer to "Are we seeing improvements since the adoption of AI?", based on the AI effect for the headline metric and the 4 core productivity metrics.',
      how: [
        'Core metrics: PRs merged, Jira issues done, and median cycle time. Quality guardrail: reopen rate. Time to merge is a review-load metric: reviewers set it, not the author.',
        'Story points are not a core metric: each team sets its own point values, and teams can inflate them after AI arrives. Story points are still on the Explore tab.',
        'Yes: the headline metric improved, and at least half of the core metrics improved. No: more core metrics got worse than improved, or the headline got worse. Partly: some improved. Not yet: none clearly changed.',
        'The large number is the AI effect for the headline metric. You choose the headline metric at the top right.',
        'The usage-level scorecard shows the effect for low- and high-usage developers. The check below it shows the effect with each comparison group.',
      ],
      read: [
        'Look at three things: the headline effect and its CI, whether the effect grows with usage tier, and whether the comparison-group check agrees.',
        'A "Yes" with a reopen rate that got worse means more output with lower quality.',
      ],
      see: ['m-did', 'm-tiers', 'm-control'],
    },
    {
      id: 'c-kpi', title: 'KPI tiles', area: 'Executive summary',
      short: 'The change in each key metric, in groups. Output tiles sit next to the tiles that show whether the extra output is real, the review load, and quality.',
      how: [
        'The tiles are in five groups: AI use and cost, output and speed, whether the extra output is real (PR size, churn), review load, and quality.',
        'Developer tiles: the AI effect, with actual vs expected below it. Team tiles: the team-level effect, from 0% to 100% team adoption.',
        'A dashed tile with "No data" names the column to add to the CSV.',
        'AI adoption: the share of developer-months with {thr}+ active days, after the split minus before the split, in percentage points.',
        '{tool} spend: the average per-developer change in monthly spend, before vs after. Cost per merged PR = spend ÷ PRs merged in the after period.',
        'The sparkline is the monthly average per developer. The vertical line is the company rollout month.',
      ],
      read: ['Green = improved, red = worse. A plain number = no clear change. Hover over a tile for its 95% CI.'],
      see: ['m-did', 'm-team', 'm-ci'],
    },
    {
      id: 'c-event', title: 'AI effect by month since adoption', area: 'Executive summary',
      short: 'The AI effect for each month around adoption. Gray points before 0 are a check: they should be flat near 0. Blue points after 0 are the effect.',
      how: ['See "Event study" for the calculation.'],
      read: [
        'Flat gray points: adopters were not already improving before AI. Good.',
        'Gray points that climb toward 0: adopters were already improving. Part of the effect may not come from AI.',
        'Blue points: the size of the effect and how fast it builds. The summary line above the chart gives the first clear month and the average from then on.',
      ],
      watch: [
        'Later points have fewer developers and a wider band.',
        'A month with a 95% CI wider than 200 pts is not drawn. The axis stops near the points, so a very wide band is cut at the chart edge.',
      ],
      see: ['m-event', 'm-did'],
    },
    {
      id: 'c-adoption', title: 'AI adoption over time', area: 'Executive summary',
      short: 'The share of developers who used {toolAny} at least {thr} days (active) and at least {hi} days (high usage) in each month.',
      how: [
        'For each month: developers with {thr}+ {tool} active days ÷ all developers with data that month. The same for {hi}+ days.',
        'Cursor + Copilot: the solid lines use combined active days (a day with both tools counts once). The dashed lines show each tool on its own. One developer can be in both dashed lines, and a developer with fewer than {thr} days in each tool can still be in the solid line.',
        'New hires\' onboarding months are left out.',
        'The vertical line is the company rollout month.',
      ],
      read: ['The gap between the two lines shows how many active users became high-usage developers.'],
      see: ['m-adoption'],
    },
    {
      id: 'c-tier-trend', title: 'Headline metric by AI usage level', area: 'Executive summary',
      short: 'The headline metric over time, with one line per usage tier. These are raw monthly averages, not the AI effect.',
      how: [
        'For each month and tier: the average of the metric over developers in that tier.',
        'In rollout mode, the x-axis is calendar months. In adoption-month mode, the x-axis is months before and after each developer\'s adoption.',
      ],
      read: [
        'If AI drives the change, the high-usage line pulls away from the non-adopter line after adoption.',
        'Lines that move together are the company-wide changes (for example, the December dip) that the AI effect removes.',
      ],
      watch: ['Tiers differ in level before AI too (for example, more senior developers in one tier). Look at the gap changing, not at the gap itself.'],
      see: ['m-tiers'],
    },
    {
      id: 'c-groups', title: 'AI effect by group', area: 'Executive summary',
      short: 'The AI effect on the headline metric for each org, domain, team, or job level, ranked from largest to smallest.',
      how: [
        'Each bar is the AI effect averaged over the adopters in that group. The model itself is fitted on all developers.',
        'The % divides by the average expected value for all adopters, not the group\'s own, so groups compare on one scale.',
        'Each group\'s estimate is pulled toward its parent group (domain for teams, org for domains, all groups otherwise) in proportion to its own noise: a precise group keeps its value, a noisy group moves most of the way. The pull strength comes from the data: the spread between groups beyond their own noise. With no real differences every group goes to the pooled value; with large real differences nothing moves. The table shows the raw estimate and the pull. Settings (Group estimates) turns it off. The headline, tiles, tiers, and event study never move.',
        'Groups with fewer than {minGroup} adopters with enough data, or with a 95% CI wider than 200 pts, are left out of the chart and the ranking. If no group is left, the chart is empty.',
        'With more than 20 groups, the chart shows the top 10 and the bottom 10. The table lists all of them.',
      ],
      read: [
        'Blue = better, red = worse. Pale bars are not statistically clear.',
        'Key findings name the largest and smallest effect, and say whether groups with more adoption got a larger effect.',
      ],
      watch: [
        'Small teams have wide CIs. A team at the top or bottom of the ranking can be there by chance. Check its CI in the table.',
        'The pull toward the parent is a trade: a little bias toward the parent for much less noise. A team that is truly different from its domain, with few adopters, is pulled toward the domain too. The raw column shows how far.',
      ],
      see: ['m-did', 'm-samples'],
    },
    {
      id: 'c-adopt-impact', title: 'Adoption vs impact', area: 'Executive summary',
      short: 'Each dot is a group: x = adoption rate, y = AI effect. The line is the best straight-line fit.',
      how: [
        'x = share of the group\'s after-period developer-months with {thr}+ active days.',
        'y = the AI effect, with the sign set so that up is always better (for cycle time, a fall is shown as a positive value).',
      ],
      read: ['Dots up and to the right: high adoption and a large effect. A rising line means groups that use AI more got a larger effect.'],
      watch: ['Few groups (for example, 3 orgs) cannot show a reliable pattern.'],
      see: ['m-adoption'],
    },
    {
      id: 'c-groups-table', title: 'All groups table', area: 'Executive summary',
      short: 'The AI effect for every group, with adopters, adoption, average active days, expected and actual values, CI, and status.',
      how: [
        'Adopters = adopters with {minMonths}+ months before and after adoption.',
        'Expected = the average value without AI. Actual = the average value. AI effect = (actual − expected) ÷ the expected value for all adopters.',
      ],
      read: ['Click a column header to sort. Pale rows have a small sample ("Small sample") or a 95% CI wider than 200 pts ("Too uncertain").'],
      see: ['m-did', 'm-samples'],
    },
    {
      id: 'c-cross', title: 'Impact by job level (or org) and AI usage', area: 'Executive summary',
      short: 'The effect for each job level (or org) and usage tier. "AI effect" uses the DiD model. "Lift" compares each tier with non-adopters at the same level.',
      how: [
        'AI effect view: each bar = the AI effect for adopters at that level and tier. Non-adopters have no AI months, so they have no bar.',
        'Lift view: each bar = the tier\'s before/after change minus the change of non-adopters at the same level, in percentage points.',
        'Each % divides by the value for all adopters (AI effect) or all developers (Lift), so all cells use one scale.',
        'Whiskers = 95% CI. Cells with fewer than {minGroup} developers, or with a CI wider than 200 pts, are hidden. A whisker that goes past the axis ends in an arrow.',
      ],
      read: [
        'Compare the High bar with the Low bar at each level. A large gap at one level means AI helps that level most.',
        'In the table, bold values are statistically clear.',
      ],
      watch: ['Cells are small. A long whisker means the value is not reliable.'],
      see: ['m-did', 'm-lift', 'm-tiers'],
    },
    // ---- Explore ----
    {
      id: 'c-trend', title: 'Metric trends', area: 'Explore',
      short: 'Any metric over time, for all developers or one line per group.',
      how: [
        'Average per dev: the mean of developers\' values in each month. Median per dev: the middle value. Total: the sum.',
        'Months since split: the x-axis is months relative to each developer\'s split month. Points with fewer than 3 developer-months are hidden.',
        'With more than 8 groups, the 7 largest are shown and the rest are combined into "Other".',
      ],
      read: ['Use it to see seasonality, the rollout, and differences between groups.'],
      watch: ['Raw trends include everything that changed over time. A rise after the rollout is not by itself proof of an AI effect.'],
    },
    {
      id: 'c-allmetrics', title: 'Before vs after AI, every metric', area: 'Explore',
      short: 'The before/after change for every metric, with its 95% CI and status.',
      how: ['Uses the before/after method: each developer\'s after average minus their own before average, averaged over developers.'],
      read: ['"Better when" gives the direction. "from ~0" means an AI usage metric started near zero, so a % change means nothing.'],
      watch: ['These are before/after changes, not the AI effect. They include seasonality and company-wide changes.'],
      see: ['m-beforeafter', 'm-ci'],
    },
    {
      id: 'c-corr', title: 'Correlations', area: 'Explore',
      short: 'How closely each AI usage metric moves with each outcome metric. Blue = move together, red = move in opposite directions.',
      how: ['See "Correlations" for the levels and methods. Click a cell to plot that pair in the relationship explorer.'],
      read: ['Pale cells are weak. Start with the per-dev change level.'],
      watch: ['Correlation does not show cause.'],
      see: ['m-corr'],
    },
    {
      id: 'c-scatter', title: 'Relationship explorer', area: 'Explore',
      short: 'Any two metrics plotted against each other. Color = usage tier. The line is the best straight-line fit.',
      how: [
        'Points are per-dev change, per developer, or per dev-month (Level).',
        'The footer gives Spearman ρ, Pearson r, and the slope of the line: how much y changes for each +1 of x.',
      ],
      read: ['A cloud with no direction means no relationship. Check whether one tier drives the pattern.'],
      watch: ['A few extreme points can move Pearson r and the line. Spearman is less sensitive.'],
      see: ['m-corr'],
    },
    {
      id: 'c-groupheat', title: 'Impact by group, every key metric', area: 'Explore',
      short: 'The before/after change of each key metric for each group, as a colored table.',
      how: [
        'Each cell uses the before/after method for that group and metric. The % divides by the average before value for all developers, so groups compare on one scale.',
        'Color strength grows with the size of the change, up to ±30%. Pale cells are not statistically clear, have fewer than {minGroup} developers, or have a 95% CI wider than 200 pts.',
        'Level × usage gives one row per job level and usage tier.',
      ],
      read: ['Blue = better, red = worse. For cycle time, time to merge, and reopen rate, lower is better, so a fall is blue.'],
      watch: ['These are before/after changes, not the AI effect.'],
      see: ['m-beforeafter', 'm-samples'],
    },
    {
      id: 'c-dose', title: 'Productivity by monthly AI usage', area: 'Explore',
      short: 'The average of an outcome metric for developer-months with 0, 1–4, 5–9, 10–14, and 15+ {tool} active days.',
      how: [
        'Each developer-month goes into one bucket by its {tool} active days. Each bar is the average of the metric in that bucket.',
        'After only: uses only after-period months, so calendar trends mix in less.',
      ],
      read: ['A rising pattern means months with more AI use have more output.'],
      watch: [
        'This compares different people and different months. Developers who use AI more may already produce more.',
        'Busy months can cause more AI use.',
      ],
    },
    {
      id: 'c-mix', title: 'How developers use the AI tool', area: 'Explore',
      short: '{tool} AI requests by feature, per month. Cursor has agent, composer, chat, Cmd+K, and Bugbot. Copilot has agent and chat.',
      how: ['Share: each feature\'s requests ÷ all requests in the month. Per dev: average requests per developer per month.'],
      read: ['A growing agent share means developers hand over larger tasks to AI.'],
    },
    {
      id: 'c-usagedist', title: 'How much each developer uses AI', area: 'Explore',
      short: 'The number of developers at each level of average {tool} active days per month, or of average spend per month when usage tiers are based on spend.',
      how: ['Each developer is counted once, by their average active days per month in the after period. Color = usage tier.'],
      read: ['A tall bar at <1 means many non-adopters. A spread to the right means many high-usage developers.'],
      see: ['m-tiers'],
    },
    {
      id: 'c-model', title: 'Primary model', area: 'Explore',
      short: 'The share of active developer-months by the AI model used most in that month.',
      how: [
        'Counts the primaryModel value (copilotPrimaryModel for Copilot) of each developer-month. The top 7 models are shown, the rest are "Other".',
        'Cursor + Copilot: each month counts the model of the tool with more active days.',
      ],
      read: ['Shows how fast developers move to new models.'],
    },
    {
      id: 'c-devtable', title: 'Developers', area: 'Explore',
      short: 'One row per developer: usage tier, adoption month, and before/after values for key metrics.',
      how: ['Before and after are monthly averages, split as set in Settings. Δ = (after − before) ÷ before.'],
      read: ['Use it to find examples and check data problems.'],
      watch: [
        'One developer\'s numbers are very noisy from month to month.',
        'These metrics measure activity, not individual performance. Do not use this table to rate people.',
      ],
    },
  ];

  // Interpretation notes per metric (the Guide's metric reference and the KPI tile "?" use these).
  const METRIC_NOTES = {
    activeDays: 'The main measure of AI use. It drives the adoption month and the usage tiers.',
    totalRequests: 'The volume of AI use. It depends on how people work: one agent request can do as much as many chat requests.',
    agentRequests: 'Requests to the AI agent (Cursor agent or Copilot agent mode), which can edit many files. A growing share means larger tasks go to AI.',
    composerRequests: 'Requests to Composer, the multi-file editing mode.',
    chatRequests: 'Questions to the AI chat.',
    cmdkUsages: 'Inline edits with Cmd+K.',
    bugbotUsages: 'Automated PR reviews by Bugbot.',
    totalTabsAccepted: 'Tab completions accepted. A measure of how much AI autocomplete people use.',
    acceptedLinesAdded: 'Lines added from accepted AI suggestions. Not every accepted line reaches a merged PR.',
    tabAcceptRate: 'A high rate means the suggestions fit the code well.',
    aiAcceptRate: 'The share of applied AI edits that developers kept. A falling rate can mean the AI is used for harder tasks.',
    aiLineShare: 'A rough signal of how much of the new code comes from AI. Capped at 100%.',
    spendDollars: '{tool} cost. Use it with cost per merged PR to judge value.',
    throughput: 'Depends on how teams split work into issues. Compare it within a team or developer over time (the AI effect does this), not between teams.',
    thoughputWithSubtasks: 'Like throughput, but subtasks count too. Teams that split work into many subtasks get higher numbers.',
    storyPoints: 'Story points are team-relative estimates. Compare them within a team or developer over time, not between teams. Watch for estimate inflation. For this reason, the Executive summary does not use them.',
    storiesdone: 'Stories completed.',
    bugsDone: 'Bugs fixed. A rise can mean more capacity, or more bugs to fix.',
    tasksDone: 'Tasks completed.',
    subtasksDone: 'Subtasks completed.',
    medianCycleDays: 'Lower is better. The median for each developer-month, then averaged across developers. Months with no completed issues are blank.',
    meanCycleDays: 'Lower is better. A few long tickets can move the mean a lot, so the median is usually more reliable.',
    reopenedTickets: 'Lower is better. A raw count, so it grows with throughput. Reopen rate is fairer.',
    reopenRatePct: 'Lower is better. reopenedTickets ÷ throughput. The quality guardrail: more output with a higher reopen rate means lower quality.',
    prsMerged: 'The main output measure. AI can lead to more, smaller PRs, so check lines added and files changed too.',
    prsOpened: 'PRs opened. A large gap to PRs merged can mean abandoned or blocked work.',
    additions: 'More lines is not better. AI can add verbose code. No better direction.',
    deletions: 'Lines deleted. Clean-up work shows here. No better direction.',
    changedFiles: 'Files changed in merged PRs. No better direction.',
    medianTimeToMergeHours: 'Lower is better. A rise after AI adoption often means more PRs wait for review: the bottleneck moves to reviewers.',
    jiraLinkedPrs: 'PRs linked to a Jira issue. Shows how well work is tracked.',
    costPerMergedPr: 'Lower is better. {tool} spend ÷ PRs merged, for months with at least one merged PR.',
    medianPrSizeLines: 'Lower is better: small PRs are easier to review and safer to ship. If PRs merged rises with PR size, AI makes more code, not only more PRs.',
    churnedLines: 'Lower is better. A raw count, so it grows with lines added. Churn rate is fairer.',
    churnRatePct: 'Lower is better. A rise after adoption means more AI code is rewritten soon after it is merged: part of the extra output is rework.',
    prsReviewed: 'No better direction. A rise means more review work. If non-adopters review adopters\' extra PRs, their own output can drop, and the AI effect then looks too large.',
    reviewCommentsGiven: 'No better direction. Use it with PRs reviewed to see how much review work each PR needs.',
    medianTimeToFirstReviewHours: 'Lower is better. A rise means PRs wait longer for a reviewer: the bottleneck moves to review.',
  };
  const KPI_EXTRA = {
    'kpi-adoption': {
      title: 'AI adoption tile', short: 'The share of developer-months with {thr}+ {tool} active days, after the split minus before the split.',
      how: ['Before and after are split by the setting Before / after split. The value below gives the before and after shares.'], see: ['m-adoption'],
    },
    'kpi-spend': {
      title: 'AI spend tile', short: 'The average change in {tool} spend per developer per month, before vs after the split.',
      how: ['Each developer\'s after average minus their before average, averaged over developers. Cost per merged PR = spend ÷ PRs merged, after period.'], see: ['m-beforeafter'],
    },
  };

  function metricTopic(key) {
    const m = AID.M[key];
    if (!m) return null;
    const blank = m.derived ? null : m.empty === 'zero' ? 'A blank cell counts as 0.' : 'A blank cell counts as missing and is left out of averages.';
    const better = m.better === 'up' ? 'Higher is better.' : m.better === 'down' ? 'Lower is better.' : 'No better direction: the dashboard reports "Increased" or "Decreased".';
    return {
      id: 'metric:' + key, title: m.label, area: m.source + ' metric',
      short: (m.desc ? m.desc + ' ' : '') + better,
      how: [
        m.derived ? 'Calculated for each developer-month: ' + (m.desc || '') : columnText(key),
        blank, 'Unit: ' + ({ count: 'count per month', days: 'days', hours: 'hours', pct: 'percent', usd: 'US dollars' }[m.unit] || m.unit) + '.',
        AID.KEY_PRODUCTIVITY.includes(key) || key === AID.QUALITY_GUARDRAIL ? 'On the Executive summary, this metric shows the AI effect (actual vs expected without AI).' : null,
      ].filter(Boolean),
      read: METRIC_NOTES[key] ? [METRIC_NOTES[key]] : [],
      see: AID.KEY_PRODUCTIVITY.includes(key) || key === AID.QUALITY_GUARDRAIL ? ['m-did'] : [],
    };
  }

  // Where a raw metric comes from, for the selected AI tool.
  function columnText(key) {
    const m = AID.M[key], tool = AID.tool.key, cp = AID.COPILOT_KEYS.includes(key) ? AID.copilotKey(key) : null;
    const end = ' in developer_monthly_metrics.csv, one value per developer per month.';
    if (!m.usage || tool === 'cursor' || (tool === 'both' && !cp)) return 'Column ' + key + end;
    if (tool === 'copilot') return cp ? 'Column ' + cp + end : 'Cursor only. Copilot has no matching column.';
    if (key === 'activeDays') return 'Column combinedActiveDays' + end + ' If it is blank: the higher of activeDays and ' + cp + '.';
    return 'Columns ' + key + ' and ' + cp + end + ' The two are added together.';
  }
  function columnCell(key) {
    const m = AID.M[key];
    if (m.derived || !m.usage || AID.tool.key === 'cursor') return key;
    const cp = AID.COPILOT_KEYS.includes(key) ? AID.copilotKey(key) : null;
    if (AID.tool.key === 'copilot') return cp || '—';
    if (key === 'activeDays') return 'combinedActiveDays';
    return cp ? key + ' + ' + cp : key;
  }

  const TOPICS = new Map();
  for (const t of METHODS) TOPICS.set(t.id, Object.assign({ area: 'Method' }, t));
  for (const t of CHARTS) TOPICS.set(t.id, t);
  for (const [id, t] of Object.entries(KPI_EXTRA)) TOPICS.set(id, Object.assign({ id, area: 'Executive summary' }, t));
  function topic(id) { return TOPICS.get(id) || (id.startsWith('metric:') ? metricTopic(id.slice(7)) : null); }

  // ---------- Placeholders ----------
  function vars() {
    const s = (AID.app && AID.app.state && AID.app.state.settings) || {};
    const thr = s.activeDays || 5, hi = s.highDays || 12;
    return {
      tool: AID.tool.label, toolAny: AID.tool.any,
      thr, hi, thrMinus: thr - 1, hiMinus: hi - 1, onboard: s.onboard ?? 3, minGroup: s.minGroup || 5, ramp: s.ramp || 0,
      minCtrl: AID.analysis.MIN_CONTROL_DEVS, minMonths: AID.analysis.MIN_MONTHS_PER_SIDE, minClusters: AID.analysis.MIN_CLUSTERS, slight: AID.analysis.SLIGHT_PCT * 100,
      minTeams: AID.analysis.MIN_TEAMS, bugWindow: AID.analysis.BUG_WINDOW, bugSkip: AID.analysis.BUG_SKIP_LAST,
    };
  }
  function fill(text, v) { return text.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)); }

  // ---------- Popover ----------
  let pop = null, owner = null, pinned = false, hideTimer = null, showTimer = null;

  function ensurePop() {
    if (pop) return pop;
    pop = el('div.help-pop#help-pop', { role: 'dialog', 'aria-modal': 'false', hidden: true });
    pop.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    pop.addEventListener('mouseleave', () => { if (!pinned) scheduleHide(); });
    document.body.appendChild(pop);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && owner) { const o = owner; hide(); o.focus(); } });
    document.addEventListener('click', (e) => { if (owner && !pop.contains(e.target) && !owner.contains(e.target)) hide(); });
    window.addEventListener('resize', () => { if (owner) place(); });
    return pop;
  }

  function popContent(t) {
    const v = vars();
    const items = (t.read && t.read.length ? t.read : t.how || []).slice(0, 3);
    return [
      el('div.help-pop-area', { text: t.area || '' }),
      el('div.help-pop-title', { text: t.title }),
      el('p', { text: fill(t.short, v) }),
      items.length ? el('ul', items.map((x) => el('li', { text: fill(x, v) }))) : null,
      el('button.help-pop-link', { type: 'button', onclick: () => openGuide(t.id), text: 'Full explanation in the Guide →' }),
    ];
  }

  function show(btn, id) {
    const t = topic(id);
    if (!t) return;
    ensurePop();
    clearTimeout(hideTimer);
    if (owner && owner !== btn) owner.setAttribute('aria-expanded', 'false');
    owner = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.textContent = '';
    pop.append(...popContent(t).filter(Boolean));
    pop.setAttribute('aria-label', t.title);
    pop.hidden = false;
    place();
  }
  function place() {
    const r = owner.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    pop.style.width = w + 'px';
    let left = r.left + r.width / 2 - 24;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    const h = pop.offsetHeight;
    const below = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0;
    pop.style.left = left + window.scrollX + 'px';
    pop.style.top = (below ? r.bottom + 8 : r.top - 8 - h) + window.scrollY + 'px';
  }
  function hide() {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (pop) pop.hidden = true;
    if (owner) owner.setAttribute('aria-expanded', 'false');
    owner = null; pinned = false;
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 180); }

  // The "?" button. Hover or focus shows the explanation; click keeps it open (pinned) until Escape or a click outside.
  function button(id) {
    const t = topic(id);
    const b = el('button.help-btn', { type: 'button', 'aria-label': 'Explain: ' + (t ? t.title : id), 'aria-expanded': 'false', 'aria-controls': 'help-pop', text: '?' });
    b.addEventListener('mouseenter', () => { if (pinned) return; clearTimeout(showTimer); showTimer = setTimeout(() => show(b, id), 120); });
    b.addEventListener('mouseleave', () => { clearTimeout(showTimer); if (!pinned) scheduleHide(); });
    b.addEventListener('focus', () => { if (!pinned) show(b, id); });
    b.addEventListener('blur', () => { if (!pinned) scheduleHide(); });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned && owner === b) { hide(); return; }
      show(b, id); pinned = true;
    });
    return b;
  }

  function openGuide(id) {
    hide();
    AID.app.update({ tab: 'guide' });
    requestAnimationFrame(() => {
      const target = document.getElementById(anchor(id));
      if (target) { target.scrollIntoView({ block: 'start' }); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600); }
    });
  }
  const anchor = (id) => 'guide-' + id.replace(/[^a-zA-Z0-9-]/g, '-');

  // ---------- Guide page ----------
  function renderGuide(root) {
    hide();
    const v = vars();
    const page = el('div.page.guide');
    root.appendChild(page);
    page.appendChild(el('div.section-head', el('h2', { text: 'Guide' }),
      el('span.lede', { text: 'How each number is calculated, and how to read it. The numbers in this text match your current settings.' })));

    const sections = [
      { id: 'g-start', title: 'Start here', topics: null },
      { id: 'g-methods', title: 'Methods', topics: METHODS.map((t) => t.id) },
      { id: 'g-exec', title: 'Executive summary charts', topics: CHARTS.filter((t) => t.area === 'Executive summary').map((t) => t.id).concat(Object.keys(KPI_EXTRA)) },
      { id: 'g-explore', title: 'Explore charts', topics: CHARTS.filter((t) => t.area === 'Explore').map((t) => t.id) },
      { id: 'g-metrics', title: 'Metric reference', topics: AID.METRICS.filter((m) => AID.available(m.key)).map((m) => 'metric:' + m.key) },
    ];

    const toc = el('nav.guide-toc', { 'aria-label': 'Guide contents' },
      sections.map((s) => el('div.guide-toc-group',
        el('a.guide-toc-head', { href: '#' + s.id, text: s.title, onclick: jump(s.id) }),
        s.topics ? el('ul', s.topics.map((id) => { const t = topic(id); return el('li', el('a', { href: '#' + anchor(id), text: t.title, onclick: jump(anchor(id)) })); })) : null)));

    const body = el('div.guide-body');
    for (const s of sections) {
      body.appendChild(el('h2.guide-h2', { id: s.id, text: s.title }));
      if (!s.topics) { body.appendChild(startHere(v)); continue; }
      if (s.id === 'g-metrics') { body.appendChild(metricTable()); }
      for (const id of s.topics) body.appendChild(topicCard(topic(id), v));
    }
    page.appendChild(el('div.guide-layout', toc, body));
  }
  function jump(id) {
    return (e) => { e.preventDefault(); const t = document.getElementById(id); if (t) t.scrollIntoView({ block: 'start' }); };
  }

  function startHere(v) {
    const p = (text) => el('p', { text: fill(text, v) });
    return el('section.card.guide-card',
      p('The Executive summary answers two questions: are developers more productive since AI adoption, and which groups are most affected. Its main number is the AI effect: what adopters produced compared with what they would have produced without AI.'),
      p('The Explore tab shows raw trends, before/after changes, correlations, and detail per developer. Its numbers include changes that are not caused by AI, such as seasonality.'),
      el('p', el('strong', { text: 'To judge whether AI made a difference, check three things:' })),
      el('ol',
        el('li', { text: 'The AI effect on the headline metric, and whether its 95% CI excludes 0.' }),
        el('li', { text: 'The event study: the months before adoption are flat near 0.' }),
        el('li', { text: 'The effect grows with usage tier (low → high), and the comparison-group check agrees.' })),
      p('If all three hold, the result is strong evidence. Developers chose whether to use AI, so it is not proof.'),
      el('p.method-note', { text: 'Click the ? next to any chart to see its explanation. Every chart also has a Table button with its exact values.' }));
  }

  function topicCard(t, v) {
    const list = (label, items) => (items && items.length ? [el('h4', { text: label }), el('ul', items.map((x) => el('li', { text: fill(x, v) })))] : []);
    const see = (t.see || []).map((id) => topic(id)).filter(Boolean);
    return el('section.card.guide-card', { id: anchor(t.id) },
      el('div.guide-area', { text: t.area || '' }),
      el('h3', { text: t.title }),
      el('p.guide-short', { text: fill(t.short, v) }),
      ...list('How it is calculated', t.how),
      ...list('How to read it', t.read),
      ...list('Watch out for', t.watch),
      see.length ? el('p.guide-see', 'See also: ', see.map((s, i) => [i ? ', ' : '', el('a', { href: '#' + anchor(s.id), text: s.title, onclick: jump(anchor(s.id)) })])) : null);
  }

  function metricTable() {
    const rows = AID.METRICS.filter((m) => AID.available(m.key)).map((m) => el('tr',
      el('td', el('a', { href: '#' + anchor('metric:' + m.key), text: m.label, onclick: jump(anchor('metric:' + m.key)) })),
      el('td', el('code', { text: columnCell(m.key) })),
      el('td', { text: m.source }),
      el('td', { text: m.derived ? 'Derived' : m.empty === 'zero' ? 'Blank = 0' : 'Blank = missing' }),
      el('td', { text: { up: 'Higher', down: 'Lower', neutral: '—' }[m.better] })));
    return el('section.card.guide-card',
      el('div.table-wrap', el('table.data',
        el('thead', el('tr', ['Metric', 'Column', 'Source', 'Blank cells', 'Better when'].map((h) => el('th', { text: h })))),
        el('tbody', rows))));
  }

  AID.help = { button, topic, renderGuide, openGuide, hide };
})(window.AID);
