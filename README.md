# AI Developer Productivity Dashboard

A local HTML dashboard that shows how AI adoption (Cursor, GitHub Copilot, or both) relates to developer productivity (Jira, GitHub).
No backend and no hosting. Open `index.html` in a browser.

## Use it

1. Open `index.html` in Chrome, Edge, Safari, or Firefox.
2. Drop `developers.csv` and `developer_monthly_metrics.csv` on the page, or click **Choose CSV files**. You can also add the optional `team_monthly_metrics.csv`, with the other files or later.
3. Pick the AI tool in the filter bar: **Cursor**, **Copilot**, or **Both**. Every AI usage metric, the adoption month, the usage tiers, and the AI effect follow this choice.
4. Use the **Executive summary** and **Explore** tabs. The **Guide** tab explains how each number is calculated and how to read it.

To preview without real data, click **Explore with demo data** (or open `index.html?demo`).
The demo has about 500 synthetic developers in 3 orgs. **Download demo CSVs** gives you all three files in the exact expected format.

### Data privacy

- The browser reads the CSV files locally. The page uploads nothing.
- The page loads two libraries from cdnjs (Chart.js 4.4.1, PapaParse 5.4.1) with Subresource Integrity hashes. The page needs internet access for these files only.
- The page saves filters and settings in `localStorage`. It never saves your data. After a reload, choose the files again.

## Expected files

**developers.csv**: one row per developer. The dashboard needs `devId`. It also uses these columns:

| Column | Used as |
|---|---|
| `orgName` | Org (Senior Director level) |
| `department` | Product domain (Director level) |
| `squadId` | Product team (Manager level) |
| `jobLevel` | Job level (SDE1 / SDE2 / SDE3) |
| `manager` | Shown in the team tables |
| `isIC` | The "ICs only" filter (`true`/`false`, `yes`/`no`, `1`/`0`) |

The ingestion script owns the mapping from tool accounts (Cursor, Copilot, Jira, GitHub) to `devId`. Export `devId` only, so the dashboard never sees emails or account IDs. `name` is optional; the tables show `devId` without it.

**developer_monthly_metrics.csv**: one row per developer per month. The first two columns are the keys:

- A developer key: `devId` (preferred), `email`, `cursorUserId`, `jiraAccountId`, or `githubLogin`. The dashboard matches it to the same column in `developers.csv`. The match ignores case.
- A month: `month`, `period`, `yearMonth`, `monthStart`, or `date`. All of these formats work: `2025-03`, `2025-03-01`, `3/1/2025`, `03/2025`, `Mar 2025`, `202503`.

All other columns are the Cursor, Copilot, Jira, and GitHub metrics from the schema. The dashboard derives every rate itself: tab acceptance, AI acceptance, AI line share, churn rate (`churnedLines` ÷ `additions`), reopen rate (`reopenedTickets` ÷ `throughput`), and spend per merged PR. Send counts, not rates. The Copilot columns start with `copilot` (`copilotActiveDays`, `copilotTotalRequests`, …) and are optional. Without them, the **Copilot** and **Both** buttons are disabled. Column order does not matter. Spaces around headers are trimmed. The dashboard ignores extra columns, and a missing metric column shows as empty.

Optional GitHub columns. The Executive summary uses them to show whether extra output is real, and what it costs reviewers. Without them, their tiles say which column to add.

| Column | Definition |
|---|---|
| `medianPrSizeLines` | The median of (additions + deletions) for the developer's PRs merged in the month |
| `churnedLines` | The lines the developer added in the month that were deleted or rewritten within 21 days. The dashboard calculates churn rate = `churnedLines` ÷ `additions`. |
| `prsReviewed` | Other developers' PRs that the developer reviewed (approved, requested changes, or commented on) |
| `reviewCommentsGiven` | Review comments the developer wrote on other developers' PRs |
| `medianTimeToFirstReviewHours` | For the developer's own PRs: the median hours from PR opened to the first review |

Blank cells:
- A blank Cursor or Copilot usage cell counts as 0, because no usage means zero.
- A blank Jira or GitHub cell counts as missing, not as 0.

**team_monthly_metrics.csv** (optional): one row per team per month. The dashboard finds this file by its columns.

| Column | Definition |
|---|---|
| `squadId` | The team. It matches `squadId` in `developers.csv`. The match ignores case. |
| A month column | The month the bugs were found. The same names and formats as the metrics file. |
| `bugsDiscovered` | The bugs found in the team's code in the month |
| `escapedBugs` | The bugs from `bugsDiscovered` that were found in production |

A blank cell or a missing team-month counts as missing, not as 0. Write 0 for a month with no bugs.

## How the analysis works

**AI tool.** The usage metrics use the Cursor columns, the Copilot columns, or both:
- **Both** adds the two tools together for requests, lines, tabs, and spend. Active days = `combinedActiveDays`: the days with Cursor or Copilot activity, counted from daily data before you make the CSV. A day with both tools counts once (Cursor on Mon + Wed, Copilot on Tue + Wed = 3 days). If the column is missing or blank, the dashboard uses the higher of the two counts, which can be too low.
- Composer, Cmd+K, and Bugbot are Cursor features. The Copilot view hides them. The Both view uses the Cursor values.
- Copilot has no rejects column. Copilot rejects = `copilotTotalApplies` − `copilotTotalAccepts`.
- A tool in use from the first month of the data has no months before the split. Set the rollout month in Settings, or use the per-developer split.

**AI effect (difference-in-differences).** The Executive summary uses this method.
1. The dashboard fits a model with a *developer effect* (each developer's own level) and a *month effect* (company-wide change in that calendar month). It fits the model only on months without AI: all months of non-adopters, and the months before adoption for adopters.
2. For each adopter month after adoption, *expected* = developer effect + month effect. *AI effect* = actual − expected.
3. The dashboard averages the effect for each developer, then across developers. The 95% CI comes from the spread across developers. When the selection has 10+ teams, it is clustered by team: developers on one team share re-orgs and incidents, so one team counts as one unit. With fewer teams, each developer is one unit.
4. Times (cycle time, time to merge, time to first review) and PR size are fitted on the log scale. The effect is then a ratio for the typical developer, and one 40-day ticket or one 20,000-line PR cannot dominate a mean. Other counts and rates are linear. Settings (*Log scale for the AI effect*) can log the counts too, with `log(value + 1)` because of zero months.
5. Cycle time, time to merge, PR size, and time to first review are medians over a month's tickets or PRs, so one very slow ticket or one huge PR can give a developer-month an extreme value. Settings (*Cap extreme values*) sets every value above the 99th percentile (default) or the 95th percentile to that percentile. The cutoff comes from all developer-months, before and after adoption together, so it cannot make or hide an AI effect, and the filters do not move it. This applies to every view, not only the AI effect. For the three PR metrics, Settings (*Minimum merged PRs for a PR median*) also leaves out the developer-months with fewer merged PRs. Cycle time is not affected by this setting. The default is 1, which keeps every month.
6. A median or a rate (cycle time, time to merge, PR size, reopen rate, churn rate) is weighted by its volume within a developer: a month with 30 issues counts more than a month with 1 in that developer's own average. Across developers each developer counts once, so one busy developer cannot stand for a whole group. Counts (PRs merged, issues done) are not weighted.

Adoption month = the developer's first month with the active-days threshold. Each adopter has their own adoption month, so the model handles a staggered rollout. The month effects remove seasonality and company-wide changes. Developer effects remove fixed differences in skill, level, and team. The model uses every developer in the date range, and the org, domain, team, and level filters only select which adopters to average. A month needs 10+ developers who have not adopted yet. If a month has fewer, its adopter months are left out.

**Comparison group** (Settings: *AI effect comparison group*). These are the developer-months that set the company-wide change in each month:
- *All developers without AI yet* (default): non-adopters, and adopters in the months before they adopt.
- *Adopters before adoption only*: non-adopters are not used. When almost everyone has adopted, the late months have too few comparison developers and are left out.
- *Non-adopters only*: each adopter's own level still comes from their months before adoption.

The verdict shows the headline effect with all three groups. If the results are within 3 pts, the choice of group does not drive the result.

**Event study.** The chart shows the effect for each month from 6 months before adoption to 12 months after. Before adoption the points should be near 0 with no trend. A trend there means adopters were already improving before AI, and the effect is less reliable. A summary line above the chart says whether the months before adoption pass this check, the first month with a clear effect, and the average effect from that month on.

**Before / after split** (Explore and the *Lift* view; Settings):
- *Company rollout month*. All developers split at one month. The default is the first month with 20%+ of developers active.
- *Each developer's adoption month*. The split is the developer's first month with the active-days threshold. Non-adopters split at the median adoption month, so they become a comparison group.
- *Ramp-up months to skip*. This setting removes the months right after the split.

**New hires.** A new hire is a developer whose first month of work comes after the first month in the data. Work = any PRs, Jira issues, story points, GitHub additions, or active days of the selected AI tool. The dashboard leaves out each new hire's first 3 onboarding months from every chart, table, and statistic. You can change the number of months in Settings (*New-hire onboarding months to skip*).

**Paired comparison.** Each developer is compared with their own baseline: the after-period average minus the before-period average. Then the dashboard averages these per-developer changes. A developer needs 2+ months on each side. Thus new hires and leavers do not change the result. "Improved" or "Worse" shows only when the 95% confidence interval excludes zero. A clear effect under 5% reads "Slight improvement" or "Slightly worse". When only the 80% CI excludes zero, the status is "Likely improved" or "Likely worse": probable, not established, and not counted in the verdict. When only the 50% CI excludes zero, the status is "Possibly improved" or "Possibly worse": a weak sign, not counted in the verdict. With no real effect, about 3 results in 10 land in this tier by chance.

**Team-level effect.** Bugs exist only per team, and review work moves between developers in a team. Thus the dashboard also fits a model on team-months: value = team effect + month effect + b × adoption share. Adoption share = the team's developers with the active-days threshold ÷ its developers. b = the change from 0% to 100% team adoption. The 95% CI treats each team as one unit, and the effect needs 8+ teams.
- *PRs merged per developer (team level)*: the team's PRs ÷ its developers, with the adoption share of the same month. If this effect is smaller than the developer effect on PRs merged, part of the developer gain came from other people in the team.
- *Bugs found per 100 PRs* and *Production bugs per 100 PRs*: 100 × bugs ÷ PRs merged, over 3 months. The adoption share is the average of the 3 months that end one month earlier, because bugs are found after the code is merged. The newest 2 months of the data are left out: bugs from their PRs are not found yet.
- The model uses every team in the selected org and domain. The team and job level filters do not apply.

**AI usage tiers.** Each developer's tier comes from their average active days per month (selected AI tool) in the after period: Non-adopter (< 1), Low (1–11), High (12+). You can change the High threshold in Settings. With the spend basis, Low and High are split at the median spend. Two tiers, not three: a light tier held only developers who reached the active threshold once and then stopped, which was too few to read. The five-bucket curve per developer-month is on the Explore tab. The main evidence that AI causes a change is a comparison of tiers over the same months. If high-usage developers improved more than non-adopters, seasonality and org-wide changes cannot explain the gap.

**Lift.** Lift = a tier's improvement minus the improvement of non-adopters in the same group (for example, high-usage SDE2s vs non-adopter SDE2s), in percentage points. Positive = better. The 95% CI uses the standard errors of both cells. Cells with fewer developers than the *Minimum developers per group* setting (default 5) are hidden.

**Groups.** Groups with fewer developers who have before/after data than the *Minimum developers per group* setting (default 5) are flagged "Small sample". The executive charts do not rank them.

**Group estimates are pulled toward the parent group** (empirical Bayes shrinkage, *Which groups are most impacted?* only). A team's estimate moves toward its domain's pooled estimate by B = its own noise variance ÷ (its own noise variance + the real spread between teams). A precise team keeps its value; a noisy team moves most of the way. The spread between teams comes from the data, so with no real differences every team goes to the pooled value, and with large real differences nothing moves. The parent is the team's domain (or the domain's org) when it has 3+ groups, else all groups. The table shows the raw estimate and the pull. Settings (*Group estimates*) turns it off. The headline, tiles, tiers, and event study never move.

## Dashboards

**Executive summary**
- A verdict (Yes / Partly / Not yet / No) with the headline AI effect, its 95% CI, and the effect by usage tier.
- KPI tiles in five groups. Each tile shows the change as the large number: green = improved, red = worse. Developer tiles show the AI effect, with the actual and expected values below it. Team tiles show the team-level effect.
  - *Output and speed*: PRs merged, Jira throughput, cycle time, and PRs merged per developer (team level). Story points are not on the Executive summary: each team sets its own point values, and teams can inflate them. They are still on the Explore tab.
  - *Is the extra output real?*: median PR size and churn rate.
  - *Review load*: PRs reviewed, time to first review, and time to merge.
  - *Quality*: reopen rate, bugs per 100 PRs, and production bugs per 100 PRs.
  - *AI use and cost*: adoption and spend.
- The AI effect by month since adoption (event study).
- Adoption over time, and the headline metric by usage tier over time.
- **Which groups are most impacted?** for Org, Domain, Team, or Job level. This section has key findings, a ranked change chart (top/bottom 10 when there are many teams), adoption vs impact, and a full table.
- **Impact by job level and AI usage**: grouped bars for each job level (or org) × usage tier, with 95% CI whiskers. Switch between *AI effect* and *Lift vs non-adopters* (the before/after change minus that of non-adopters). A findings list and a matrix table compare high-usage developers with non-adopters at each level.

**Explore**
- Metric trends for any metric. You can group by org, domain, team, level, role, or usage tier. The x-axis can be calendar months or months since adoption.
- A before/after table for every metric.
- A correlation heatmap with three levels: per-developer change, per developer, or per developer-month. Click a cell to plot that pair in the relationship explorer.
- A group × metric heatmap. Use *Level × usage* to see every key metric for each level and tier.
- Productivity by monthly AI usage, the AI feature mix, the usage distribution, and the primary model mix.
- A developer table with search and sorting.

**Guide**
- Methods, a section for each chart, and a reference for every metric. The text uses your current settings (thresholds, onboarding months, minimum group size).
- The **?** next to each chart title and KPI tile shows a short explanation. Hover or focus shows it. Click keeps it open. Its link opens the full section in the Guide.

Every chart has a **Table** button that shows the chart data as a table.

## Files

```
index.html               page shell
assets/styles.css        theme tokens (light + dark) and layout
assets/js/metrics.js     metric catalog: labels, units, "better" direction
assets/js/data.js        CSV parsing, month parsing, join
assets/js/analysis.js    statistics, before/after model, series, correlations
assets/js/charts.js      Chart.js wrappers and plugins
assets/js/ui.js          DOM helpers, tables, cards, status chips
assets/js/help.js        help text, the ? popover, the Guide page
assets/js/executive.js   Executive summary
assets/js/explore.js     Explore
assets/js/demo.js        synthetic demo data
assets/js/app.js         state, filters, settings, loading
```

To add or change a metric, edit `assets/js/metrics.js`, and add its reading note to `METRIC_NOTES` in `assets/js/help.js`. Derived metrics are calculated in `derive()` in `data.js`.

## Notes

- Time to merge is not a core metric. Reviewers set it, not the author's AI use. It is in the *Review load* group.
- `aiLineShare` (AI lines accepted ÷ GitHub additions) is a rough signal. Not every accepted line reaches a merged PR.
- The AI effect removes seasonality and company-wide changes. It does not remove a change that hits only the adopters in the month they adopt (for example, a team re-org in that month). Developers chose how much to use AI. Thus the effect is strong evidence, not proof. Check that the event-study points before adoption are flat, and that the effect grows with usage tier.
