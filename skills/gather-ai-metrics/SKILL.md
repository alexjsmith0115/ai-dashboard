---
name: gather-ai-metrics
description: Build the three CSV files that the AI Developer Productivity dashboard reads (developers.csv, developer_monthly_metrics.csv, team_monthly_metrics.csv) from Cursor, GitHub Copilot, Jira, GitHub, and LinearB. Use when writing or changing a data ingestion script for the dashboard, when a column is missing or wrong, or when the dashboard shows a "Missing metric columns" warning. Describes every column, where to get it, and how to check the result. It does not prescribe one pipeline.
---

# Gather AI metrics for the dashboard

The dashboard is a static page that reads CSV files in the browser. This skill describes what each file must contain and where the numbers usually come from. Each company has different tools, plans, and identity systems. Treat every source below as a recommendation and pick what fits.

## Rules that always apply

1. **Export `devId` only.** The ingestion script owns the table that maps tool accounts (Cursor email, GitHub login, Jira account ID, Copilot login) to `devId`. That table never leaves the company repo. The CSVs carry no emails and no account IDs.
2. **Aggregate before export.** One row per developer per month. The dashboard does no daily math except what it reads from `combinedActiveDays`.
3. **Send counts, not rates.** The dashboard derives tab acceptance, AI acceptance, AI line share, churn rate, reopen rate, and spend per PR.
4. **Use vendor APIs. Do not scan repositories.** With 10k+ repos, per-repo git history is not an option. LinearB (or a similar engineering-metrics product) already computes PR size, rework, review and pickup times.
5. **Blank means different things.** A blank Cursor or Copilot cell counts as 0. A blank Jira or GitHub cell counts as missing. Write 0 for a month with no bugs in the team file. Write blank for a median with no items (no issues done → no cycle time).
6. **Months.** `month` is `YYYY-MM`. Assign an item to the month it was *completed* (PR merged, issue resolved). Assign usage to the day it happened.

Reference files with the exact headers: `developers.csv` and `developer_monthly_metrics.csv` in the dashboard repo. `index.html?demo` → **Download demo CSVs** gives filled examples.

## developers.csv

One row per developer. Source: the HR system or the org chart export, not the tools.

| Column | Definition | Notes |
|---|---|---|
| `devId` | Stable internal ID | Employee ID or a hash of it. Must not change when someone moves team. |
| `squadId` | Team (manager level) | Matches `squadId` in the team file. |
| `department` | Product domain (director level) | |
| `orgName` | Org (senior director level) | |
| `manager` | Manager name or ID | Shown in team tables only. |
| `role` | Job family | e.g. Software Engineer, Engineering Manager. |
| `jobLevel` | Level | e.g. SDE1 / SDE2 / SDE3. Used for the level × usage comparison. |
| `isIC` | Individual contributor | `true`/`false`. Managers are filtered out by default. |
| `name` | Optional display name | Leave out for a stricter export; tables show `devId`. |

A developer who left keeps their row. Their metric rows simply stop. A developer who moved team gets the team they are in *now*. The dashboard has no team history.

## developer_monthly_metrics.csv

### Keys

| Column | Definition |
|---|---|
| `devId` | As in developers.csv |
| `month` | `YYYY-MM` |

### Cursor

Recommended source: the Cursor Admin API, `POST /teams/daily-usage-data` (per user per day, 30-day window per call, data refreshed hourly) and the spend endpoint under `/teams/`. Sum the days into the month. Access is by team admin API key; some endpoints need the Enterprise plan. Join on the user's email.

| Column | Definition | From the daily record |
|---|---|---|
| `activeDays` | Days in the month with any Cursor activity | count of days with `isActive` true |
| `totalRequests` | All AI requests | sum of `composerRequests + chatRequests + agentRequests + cmdkUsages`, or the API's total if it has one |
| `composerRequests` | Composer requests | `composerRequests` (Cursor folded Composer into Agent; may be 0 in recent months) |
| `agentRequests` | Agent requests | `agentRequests` |
| `chatRequests` | Chat requests | `chatRequests` |
| `cmdkUsages` | Cmd+K uses | `cmdkUsages` |
| `bugbotUsages` | Bugbot uses | `bugbotUsages` if present, else blank |
| `totalTabsShown` | Tab completions shown | `totalTabsShown` |
| `totalTabsAccepted` | Tab completions accepted | `totalTabsAccepted` |
| `totalAccepts` | Applied suggestions accepted | `totalAccepts` |
| `totalRejects` | Applied suggestions rejected | `totalRejects` |
| `acceptedLinesAdded` | Lines added from accepted suggestions | `acceptedLinesAdded` |
| `spendDollars` | Spend for the developer in the month | spend endpoint; cents ÷ 100. Include the seat price if you want cost per PR to show the full cost. |
| `primaryModel` | Most used model | `mostUsedModel` of the most active day, or the mode across days |

Alternative: the CSV export from the Cursor admin dashboard has the same fields.

### GitHub Copilot

Recommended source: the Copilot usage metrics API. It returns signed links to NDJSON reports with one line per user: `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD` (daily) or `users-28-day`. The organization form exists too. The old `/copilot/metrics` and `/copilot/usage` endpoints were shut down in April 2026. Per-user data needs an enterprise or organization admin token.

Fetch the daily report for every day of the month and sum. The field names below are the dashboard's; map them from the report's per-user totals and `totals_by_feature`. Check the report schema for your API version. Join on `user_login`.

| Column | Definition | Report source |
|---|---|---|
| `copilotActiveDays` | Days with any Copilot activity | count of days the user appears with activity |
| `copilotTotalRequests` | All Copilot requests | chat requests (all modes) + code completion requests |
| `copilotAgentRequests` | Agent-mode chat requests | chat requests with mode Agent |
| `copilotChatRequests` | Chat requests (Ask + Edit) | chat requests minus agent |
| `copilotTotalTabsShown` | Completions shown | code suggestions |
| `copilotTotalTabsAccepted` | Completions accepted | code acceptances |
| `copilotTotalApplies` | Chat code blocks offered | chat insertion events offered, if reported; else blank |
| `copilotTotalAccepts` | Chat code blocks accepted | chat insertion events accepted |
| `copilotAcceptedLinesAdded` | Lines accepted | code lines accepted |
| `copilotSpendDollars` | Seat price plus premium request overage | billing seats API × seat price, plus overage from the billing usage report |
| `copilotPrimaryModel` | Most used model | from `totals_by_model` if present |

Alternative when the per-user report is not available on your plan: `GET /orgs/{org}/copilot/billing/seats` gives `last_activity_at` per user. That supports `copilotActiveDays` only as "active this month = 1 day", which is a weak signal. Say so in the export notes.

### Both tools

| Column | Definition | Source |
|---|---|---|
| `combinedActiveDays` | Days with Cursor **or** Copilot activity | Union of the two daily active-day sets. A day with both counts once. Compute it from the daily records before summing. |

Without it the dashboard uses the higher of the two counts, which is too low when the tools are used on different days.

### Jira

Recommended source: Jira Cloud REST API, `GET /rest/api/3/search/jql` with `expand=changelog`. One query per month, paged, for all issues resolved in the month. Group by assignee. Join on `accountId`.

Definitions use the *assignee at resolution*. Exclude Epics. Subtasks are their own column.

| Column | Definition | How |
|---|---|---|
| `throughput` | Issues done, no subtasks | `statusCategory = Done AND resolved >= start AND resolved < end AND issuetype not in subtaskTypes()` |
| `thoughputWithSubtasks` | Issues done, subtasks included | same without the subtask filter (the column name keeps its typo) |
| `storyPoints` | Story points done | sum of the story points field over `throughput` issues |
| `storiesdone` / `bugsDone` / `tasksDone` / `subtasksDone` | Done issues by type | `issuetype` of the same result |
| `medianCycleDays` | Median days from In Progress to Done | from the changelog: first transition into the In Progress status category → the resolution date. Blank when `throughput` is 0. |
| `meanCycleDays` | Mean of the same | |
| `reopenedTickets` | Done issues that were reopened | issues resolved in the month whose changelog has a transition from Done back to another status category at any time. The reopen can happen in a later month; re-export the last 2–3 months each run. |

Alternatives: LinearB's Jira integration has cycle time per project but not per assignee. A Jira data lake (Atlassian Analytics, BigQuery export) is easier at scale than paging the API.

Pitfalls: teams define "In Progress" with different statuses. Map by status *category*, not status name. Bulk-closed issues (sprint clean-ups) inflate throughput and shrink cycle time in that month; the month effect absorbs company-wide clean-ups but not one team's.

### GitHub and LinearB

Recommended source: LinearB Measurements V2, `POST /api/v2/measurements` with `roll_up: "1m"` and `group_by: "unified_user"` (the docs also show `contributor`; test which your tenant accepts). Times come back in minutes; sizes in lines. Business or Enterprise plan. Join on the unified user's primary email.

| Column | Definition | LinearB metric | Without LinearB |
|---|---|---|---|
| `prsMerged` | PRs merged in the month, authored by the developer | `pr.merged` | GitHub search: `is:pr is:merged author:LOGIN merged:YYYY-MM-01..YYYY-MM-31` (1000-result cap per query, rate limited) |
| `prsOpened` | PRs opened in the month | `pr.new` | GraphQL `contributionsCollection(from,to).totalPullRequestContributions` |
| `additions` / `deletions` | Lines added / deleted in merged PRs | `commit.total_changes` gives one number; split only if your plan exposes it | sum of `additions`/`deletions` from the PR list |
| `changedFiles` | Files changed | not in LinearB | sum of `changed_files` from the PR list |
| `medianPrSizeLines` | Median (additions + deletions) per merged PR | `pr.merged.size` agg `p50` | median over the PR list |
| `churnedLines` | Lines written in the month and rewritten within 21 days | `commit.activity.rework.count` (LinearB's rework definition is the same 21-day window) | needs per-repo git history; leave blank instead |
| `prsReviewed` | Other people's PRs the developer reviewed | `pr.reviewed` | GraphQL `contributionsCollection.totalPullRequestReviewContributions` |
| `reviewCommentsGiven` | Review comments written on others' PRs | `pr.reviews` (review events) | GitHub search `reviewed-by:LOGIN` and count review comments |
| `medianTimeToFirstReviewHours` | Hours from PR open to first review, own PRs | `branch.time_to_review` agg `p50` ÷ 60 | first review timestamp from the PR's reviews list |
| `medianTimeToMergeHours` | Hours from PR open to merge, own PRs | `branch.time_to_merge` agg `p50` ÷ 60 | `merged_at − created_at` |
| `jiraLinkedPrs` | Merged PRs linked to a Jira issue | not in LinearB | PR title or branch matches an issue key |

Pitfalls: bot PRs (dependabot, renovate) must be excluded. Mono-repo squash merges make one PR per feature; multi-repo setups make several. The developer effect in the model absorbs that as long as a developer's repos do not change.

## team_monthly_metrics.csv (optional)

One row per team per month. The dashboard uses it for bugs per 100 PRs and production bugs per 100 PRs.

| Column | Definition | Recommended source |
|---|---|---|
| `squadId` | Team | as developers.csv |
| `month` | Month the bug was **found**, not fixed | Jira `created` |
| `bugsDiscovered` | Bugs found in the team's code | Jira: `issuetype = Bug AND created in month`, grouped by the team's project or component. Write 0 for none. |
| `escapedBugs` | The subset found in production | A label, a field, or a priority rule your company already uses for "customer found" or "production incident". Keep the rule in the script and document it. |

The attribution of a bug to a team is the hard part. Use the Jira project or component that the team owns. Do not try to attribute by the developer who fixed it.

## Checks before handing the files over

1. Row count = developers × months, minus developers not yet hired or already gone. A developer-month with no activity at all can be left out; a developer-month with usage but no work keeps its row.
2. Exactly one row per `devId` + `month`. The dashboard keeps the first duplicate and warns.
3. `grep -i '@'` on both files returns nothing. No emails, no logins.
4. Spot-check three developers against the tool UIs for one month: Cursor active days, PRs merged, issues done.
5. Load the files in the dashboard. The status line must show no "Missing metric columns" warning. "Optional columns not in the file" is fine if you chose to skip those.
6. Sum `spendDollars` over a month and compare with the invoice.
7. Keep a `SOURCES.md` next to the script that says, per column, which API and which definition you used. The dashboard's Guide tab describes the definitions it assumes; where yours differ, say so there.
