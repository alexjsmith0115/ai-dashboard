# AI Developer Productivity Dashboard

A local HTML dashboard that shows how AI adoption (Cursor) relates to developer productivity (Jira, GitHub).
No backend and no hosting. Open `index.html` in a browser.

## Use it

1. Open `index.html` in Chrome, Edge, Safari, or Firefox.
2. Drop `developers.csv` and `developer_monthly_metrics.csv` on the page, or click **Choose CSV files**.
3. Use the **Executive summary** and **Explore** tabs. The **Guide** tab explains how each number is calculated and how to read it.

To preview without real data, click **Explore with demo data** (or open `index.html?demo`).
The demo has about 500 synthetic developers in 3 orgs. **Download demo CSVs** gives you files in the exact expected format.

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

**developer_monthly_metrics.csv**: one row per developer per month. The file needs two columns that the schema does not show:

- A developer key: `devId` (preferred), `email`, `cursorUserId`, `jiraAccountId`, or `githubLogin`. The dashboard matches it to the same column in `developers.csv`. The match ignores case.
- A month: `month`, `period`, `yearMonth`, `monthStart`, or `date`. All of these formats work: `2025-03`, `2025-03-01`, `3/1/2025`, `03/2025`, `Mar 2025`, `202503`.

All other columns are the Cursor, Jira, and GitHub metrics from the schema. Column order does not matter. Spaces around headers are trimmed. The dashboard ignores extra columns, and a missing metric column shows as empty.

Blank cells:
- A blank Cursor usage cell counts as 0, because no usage means zero.
- A blank Jira or GitHub cell counts as missing, not as 0.

## How the analysis works

**AI effect (difference-in-differences).** The Executive summary uses this method.
1. The dashboard fits a model with a *developer effect* (each developer's own level) and a *month effect* (company-wide change in that calendar month). It fits the model only on months without AI: all months of non-adopters, and the months before adoption for adopters.
2. For each adopter month after adoption, *expected* = developer effect + month effect. *AI effect* = actual − expected.
3. The dashboard averages the effect for each developer, then across developers. The 95% CI comes from the spread across developers.

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

**New hires.** A new hire is a developer whose first month of work comes after the first month in the data. Work = any PRs, Jira issues, story points, GitHub additions, or Cursor active days. The dashboard leaves out each new hire's first 3 onboarding months from every chart, table, and statistic. You can change the number of months in Settings (*New-hire onboarding months to skip*).

**Paired comparison.** Each developer is compared with their own baseline: the after-period average minus the before-period average. Then the dashboard averages these per-developer changes. A developer needs 2+ months on each side. Thus new hires and leavers do not change the result. "Improved" or "Worse" shows only when the 95% confidence interval excludes zero.

**AI usage tiers.** Each developer's tier comes from their average Cursor active days per month in the after period: Non-adopter (< 1), Light (1–4), Medium (5–11), Heavy (12+). You can change the Medium and Heavy thresholds in Settings. The main evidence that AI causes a change is a comparison of tiers over the same months. If heavy users improved more than non-adopters, seasonality and org-wide changes cannot explain the gap.

**Lift.** Lift = a tier's improvement minus the improvement of non-adopters in the same group (for example, heavy-user SDE2s vs non-adopter SDE2s), in percentage points. Positive = better. The 95% CI uses the standard errors of both cells. Cells with fewer developers than the *Minimum developers per group* setting (default 5) are hidden.

**Groups.** Groups with fewer developers who have before/after data than the *Minimum developers per group* setting (default 5) are flagged "Small sample". The executive charts do not rank them.

## Dashboards

**Executive summary**
- A verdict (Yes / Partly / Not yet / No) with the headline AI effect, its 95% CI, and the effect by usage tier.
- KPI tiles: adoption, spend, PRs merged, Jira throughput, story points, cycle time, time to merge, and reopen rate (the quality guardrail). Each tile shows the change as the large number: green = improved, red = worse. Productivity tiles show the AI effect, with the actual and expected values below it.
- The AI effect by month since adoption (event study).
- Adoption over time, and the headline metric by usage tier over time.
- **Which groups are most impacted?** for Org, Domain, Team, or Job level. This section has key findings, a ranked change chart (top/bottom 10 when there are many teams), adoption vs impact, and a full table.
- **Impact by job level and AI usage**: grouped bars for each job level (or org) × usage tier, with 95% CI whiskers. Switch between *AI effect* and *Lift vs non-adopters* (the before/after change minus that of non-adopters). A findings list and a matrix table compare heavy users with non-adopters at each level.

**Explore**
- Metric trends for any metric. You can group by org, domain, team, level, role, or usage tier. The x-axis can be calendar months or months since adoption.
- A before/after table for every metric.
- A correlation heatmap with three levels: per-developer change, per developer, or per developer-month. Click a cell to plot that pair in the relationship explorer.
- A group × metric heatmap. Use *Level × usage* to see every key metric for each level and tier.
- Productivity by monthly AI usage, the Cursor feature mix, the usage distribution, and the primary model mix.
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

- `contractTotalSpend` is read but not charted. It is an account-level figure, not a per-developer figure.
- `aiLineShare` (AI lines accepted ÷ GitHub additions) is a rough signal. Not every accepted line reaches a merged PR.
- The AI effect removes seasonality and company-wide changes. It does not remove a change that hits only the adopters in the month they adopt (for example, a team re-org in that month). Developers chose how much to use AI. Thus the effect is strong evidence, not proof. Check that the event-study points before adoption are flat, and that the effect grows with usage tier.
