# Finance Dashboard — redesign proposal (Hermes research, 2026-10-11)

```
I have enough research (couldn't inspect the repo or run commands in this run — only web tools were available; the "current state" section is taken as given from your brief). Here is the proposal.

================================================================
REDESIGN PROPOSAL — FAMILY FINANCE DASHBOARD
UI/UX research + information architecture + wireframes
================================================================

0. WHAT THE REFERENCE APPS ACTUALLY DO (grounding)

- Monarch: left nav with a small number of destinations (Dashboard, Transactions, Cash Flow, Budget, Recurring, Reports, Net Worth, Goals, Calendar); its Reports area is three peer tabs — Cash Flow / Spending / Income — each with a chart-type selector (trend bars, pie, breakdown, treemap, Sankey) and click-to-drill-into-transactions. Recent redesigns were explicitly about information density: shorter transaction rows, smaller cash-flow bars, collapsible account groups, widgets "redesigned to better utilize space on both desktop and mobile." (help.monarch.com "Using Reports"; monarch.com/blog/monarch-brand-refresh)
- Copilot: dashboard-first ("summary first, spreadsheet never"). Home surfaces new transactions, trending categories, upcoming recurring, net income; recurring has its own view for spotting price increases/duplicates; net worth drills by account type. Consistent semantic color: green=income, red=spending, blue=net worth, yellow=pending. Reviewers cite ~8 seconds to first useful insight from the home screen alone. (forbes.com Copilot review; blakecrosley.com Copilot design breakdown; financialcalculate.com)
- YNAB: separate tabs — Home/Plan, Spending, Reflect (renamed from Reports). Reflect = spending breakdown by category/group with percentages, a simple 6-month income-vs-spending bar chart, and a net worth chart with a share button. Month navigation lives in a persistent header. (ynab.com/whats-new; support.ynab.com Plan Header)
- Empower (Personal Capital): dashboard cards (net worth w/ 1-day and 365-day change; cash flow bars for current vs previous month) where every card is a link that drills into the full page behind it. Net worth is the flagship view. (support-personalwealth.empower.com "Dashboard Overview"; nerdwallet.com)
- Perceptual research: bar/line/scatter are the easiest chart types to read; stacked bars have among the highest error rates; donuts/treemaps encode by area and are poor for comparing values, acceptable only for small part-to-whole sets (max ~6 slices, group the tail into "Other"); tables win when exact values matter. (nngroup.com "Choosing Chart Types" and "Dashboards: preattentive"; eui.elastic.co part-to-whole guide; observablehq.com "Truth about pie charts")
- Tabs research: tabs fit few (max ~7–8) peer views of one context, ordered high-use first, one default; they are bad when users must compare panels side by side, and horizontal-tab content has real discoverability problems (Baymard). If content groupings aren't distinct, use one page with headings instead. (nngroup.com "Tabs, Used Right"; baymard.com; cxl.com tabbed navigation)
- KPI card + sparkline canon: label, big value, delta against a NAMED baseline, optional sparkline of 7–30 points at the same period across all cards, dot on the latest point, color tied to meaning (not sign), and a "flat" state for tiny changes; never let sparklines auto-scale misleadingly. (getdashboardtemplates.com; chartload.com; fwdtools.com stat card)
- Number typography: tabular-nums everywhere numbers stack or update; right-align numeric columns AND their headers; consistent decimals per column; units in headers, not repeated on every cell; true minus signs; digit grouping; abbreviate big headline numbers (128.4K) but keep full precision in tables. (MDN font-variant-numeric; data.europa.eu number-formatting guide; websolutionmaster.com tabular figures)
- Color: never encode meaning by color alone (add arrows/words); ~8% of men have red-green CVD; keep the palette muted, one accent, reserve red for genuine bad news; WCAG contrast 4.5:1 text / 3:1 graphics. (gooddata.ai; uxdesign.cc color-blind dashboards; WTDesign system)

================================================================

1. TABS OR SUB-PAGES — AND THE TOP-LEVEL NAV

Recommendation: TABS, not separate sub-pages — but "nav tabs" with real URLs (hash routes), styled as a persistent tab strip on desktop and a bottom bar on mobile. Keep the count at 5–6.

Why not the current single long scroll:
- Six heterogeneous sections (KPIs, cash flow, category bars, biggest expenses, net worth, recurring) answered by different questions. Nobody opens a finance dashboard wanting all six at once; they come with one question ("did we overspend?", "what's our net worth?", "what are we still paying Netflix for?"). Empower/Monarch/Copilot all made "today's question" the default view and pushed the rest one click away.
- Progressive disclosure (summary first, detail one interaction deeper) is the consistent pattern across the best-reviewed apps (Copilot, Monarch); a uniform long scroll forces everyone to scroll past 80% of the content to reach their 20%.

Why not separate sub-pages:
- All sections are sibling analytical views over the same dataset and the same filters. Full page loads per view break the instant-switch expectation and duplicate the chrome (filters, nav, layout) for every view. NN/g: use tabs for parallel views in one context; separate pages only for unrelated destinations.

Guardrails against the known tab failure modes (Baymard/NN/g), and how this design satisfies them:
- Discoverability: 5–6 short labels that always fit one row; high-use tab first and selected by default (Overview); nothing important exists ONLY in a hidden tab — everything critical appears on Overview, which is what people land on.
- No mixing controls: one tab control, consistent styling, no stacked/secondary tab rows.
- Comparison concern (tabs hide things you might want side by side) is handled by the Overview tab, which is deliberately the cross-cutting "everything at a glance" view.

Proposed top-level nav (order = frequency of use):

    OVERVIEW · CASH FLOW · SPENDING · NET WORTH · SUBSCRIPTIONS · ACCOUNTS

Notes on the naming/grouping (this answers the "People" question):
- "People" is NOT a top-level tab. Per-person is a FILTER/dimension (like category), not a destination — the family's mental model is "who paid for what this month," which belongs inside Cash Flow/Spending as a grouping option, plus one "By person" card on Overview. Monarch handles members exactly this way (partner/account filters inside Reports), not as a nav item. A People tab would push us to 7 tabs and dilute the rest.
- "Subscriptions" keeps its own tab (Monarch and Copilot both give Recurring a dedicated page; it's the most actionable money-saving view for a family, and our recurring detection + duplicate flags deserve a home).
- "Accounts" holds the 8 accounts, balances-over-time, duplicate flags and data-health items (uncategorized count, last refresh).
- If the count ever grows past 6, move to a collapsed left sidebar (uxpatterns: >7–8 tabs → sidebar; Monarch uses a left rail on desktop), not a second tab row.

Implementation for simple HTML/CSS: `<nav>` of anchors to `#/overview`, `#/cash-flow`, etc.; all six panels exist in the initial HTML, hidden with a CSS `:target`/`.active` class toggled by ~15 lines of vanilla JS. Hash routes keep deep links and back-button working, and the current single-page content simply redistributes into the panels (nothing is lost — it all stays in the DOM, which also mitigates the "hidden tab" discoverability risk).

================================================================

2. SECTION BREAKDOWN — WHAT EACH TAB SHOWS

OVERVIEW (default; the 10-second check-in; timebox = "this month")
  - KPI row (3 cards): Income / Spent / Net — each with headline number, delta vs same day-count last month, and a 12-month sparkline. (Copilot's "net income" card, Empower's cash-flow card.)
  - "Needs attention" strip: N unreviewed transactions, N possible duplicates, recurring items whose price went up, category up >25% vs 3-mo average. This is the Mint/Copilot "insights at a glance" layer the current page lacks.
  - Net-worth mini line (23 mo) with period change, linking to Net Worth tab.
  - Top-5 categories this month (horizontal bars w/ % of spend and MoM delta), linking to Spending.
  - Subscriptions mini card: total $/mo + next 3 charges, linking to Subscriptions.
  - Small "By person" pair of numbers (you spent X, partner spent Y) if tagging covers it.
  Rule: nothing on Overview needs scrolling more than ~1.5 screens; every card is a link deeper.

CASH FLOW (money in vs out over time)
  - Month-by-month grouped bars: income vs spending (23 mo window, zoomable to 6/12), PLUS net/savings as an overlaid line or a second small chart. (Monarch's "Trend Bars", YNAB's 6-month income-vs-spending, Empower's current-vs-previous bars.)
  - Savings-rate strip (% of income kept) by month — the one derived stat that decides everything.
  - Current month vs same month last year ("Oct 2026 vs Oct 2025") — answers seasonality, which 23 months of data lets us do.
  - Optional: income mix (which payers/accounts), since 2 banks vs 4 cards means money in arrives from few sources.
  - Global filters here matter most: person + month range; category filter mostly irrelevant (income has no spend categories) — dim it.

SPENDING (the deep-dive workhorse; absorbs today's "spend by category" + "biggest expenses")
  - Category totals for selected period: horizontal bars, descending, with $, % of total, MoM delta pill, and a tiny 12-mo sparkline per row. This replaces vertical bars — with ~22 categories, horizontal bars give labels room and support sorting.
  - Part-to-whole at-a-glance: one donut for top-5 + "Other" (≤6 slices — the only regime where pies are defensible per the research; Monarch/Copilot both lead with one).
  - Group-by switch: Category / Merchant / Person (Copilot's month-over-month & year-over-year category trends; Monarch's grouping controls).
  - Click a category row → detail panel below: 23-mo trend line for that category + its transaction table (the Monarch "click chart → transactions underneath" pattern, achievable with anchor links + a JS template).
  - Biggest expenses: sortable table (date, merchant, category chip, account, person, $), which today is a chart — research says exact-value lookups belong in tables.
  - Treemap toggle for the 22-category tail (exploratory "which blocks are big" browsing) — labeled as secondary, since area encoding is weak for precise reading.

NET WORTH (the long game)
  - Assets vs liabilities vs net worth: three lines (or line + two component lines) over 23 mo; headline current value + change badges (Empower-style: period change AND last-refresh change).
  - Composition at end of period: assets-by-account and liabilities-by-card as two horizontal bar columns (NOT a stacked area or one giant pie — comparisons need aligned bars).
  - "What moved net worth": monthly decomposition — income − spending = change from cash flow vs balance corrections (transfers excluded; the dashboard already nets reversals, so this is a labeling job).
  - Savings rate trend and a "months of expenses in cash" stat if bank balances allow (emergency-fund readout; Empower surfaces this).

SUBSCRIPTIONS / RECURRING
  - Summary header: total $/mo, total $/yr, count, next-7-days total (Monarch added exactly this income/expense summary to its Recurring page).
  - Table: merchant, amount, cadence, next charge date, first-seen date, spark of last 6 charges, "price changed" flag, person, account.
  - Suspect items surfaced: price increases (amount changed vs history), possible duplicates (two similar recurring merchants), dormant/unused (charged on one card only), cancellables. These map 1:1 to your existing duplicate/recurring detection.
  - No big chart needed — this tab is a list with flags; actionability over analytics.

ACCOUNTS (data health + balances)
  - 8 rows: account, type badge (bank/credit), current balance, 23-mo balance sparkline, transaction count, last refresh, uncategorized count.
  - Credit cards: utilization or payment-vs-balance mini view; banks: cash-on-hand line.
  - Duplicate-flag inbox lives here (or as a badge on the row) — it's a data-quality concern, not a spending story.
  - Collapsible grouping bank/credit (Monarch's accounts-page density fix).

================================================================

3. CHART TYPE PER DATA

  Trend over time (net worth, monthly income/spend, category history)
    → LINE chart (thin 23-pt lines, dots on endpoints; area fill only for single-series). Lines are the correct encoding for continuous change; keep y-axis from a stable baseline so trends aren't exaggerated.
  Income vs spend per month (two related series compared per period)
    → GROUPED (side-by-side) vertical bars, 12–23 months. Avoid stacked bars for this (NN/g: highest error rates; also stacks mask which side wins). A diverging variant (income above axis, spend below) is an acceptable alternative if space is tight.
  Category mix, single period (part-to-whole)
    → Primary: descending HORIZONTAL BARS with $ + % labels. Secondary: ONE donut limited to top-5 + "Other" (≤6 slices). Treemap only as an exploratory toggle for the long tail. No stacked "100% bar" of 22 categories — unreadable.
  Category trend over time (composition AND level together)
    → small multiples: 1 line per top-5 category + "Other", direct labels at line ends (no floating legend); or a category×month HEATMAP table (CSS grid of tinted cells) which is cheap in HTML and excellent for spotting seasonals across 23 months.
  Biggest expenses / exact amounts / any list the user reads row-by-row
    → TABLE, right-aligned numerics, sparkline column allowed. (Research: tables beat charts whenever exact values are the point.)
  KPI card context
    → SPARKLINE (12 mo, same period across all cards, dot on latest point, no axis chrome) beside the delta, never below a full chart.
  Account balances over time
    → inline sparkline per row in the Accounts table; full-size line only when drilled in.
  Recurring/subscriptions
    → no chart for the list; per-row charge history as micro-sparkline; the tab's headline is a NUMBER ($/mo), not a picture.
  Deltas/comparison (MoM, vs last year)
    → paired bars or a slope/before-after dot pair for a handful of categories; for many categories, a table column of ±% pills.

One rule that makes all of this implementable: every one of these is either an SVG polyline/rect, a div-bar, a conic-gradient donut, or a `<table>`. No charting library needed.

================================================================

4. NUMBER FORMATTING & READABILITY

  Abbreviation levels
    - KPI headlines: abbreviate at 4+ digits, 1 decimal: $4.8K, $214.8K; millions only if they ever occur ($1.2M). Never abbreviate below 1,000.
    - Tables/axes/transactions: full precision $4,821.63 (tables) or $4,822 (axis labels, no cents).
    - Don't mix precisions in one column; format via Intl.NumberFormat in one helper.
    - Screen-reader caveat (FinancialTimes dropped "m"): keep aria-label or a visually-hidden full value on abbreviated figures.
  Digit mechanics
    - Thousands separators always; true minus sign (−), not hyphen.
    - CSS one-liner that fixes most "sloppy finance table" feelings: font-variant-numeric: tabular-nums; plus lining figures; apply to every element containing money.
    - Right-align ALL numeric cells and their headers; label/merchant columns left-aligned; consistent decimals so dots line up.
  Deltas and percents
    - Every delta names its baseline: "vs Sep", "vs same month last yr", "vs 12-mo avg" — a bare "+8%" is trivia.
    - Three states, not two: up / down / FLAT (grey) below a threshold (~±0.5% or <$10), so nothing shows a misleading "▲0.0%".
    - Color follows MEANING, not sign: spending down = green; spending up = red; income up = green. Income/spend cards therefore don't share a palette rule naively.
    - Muted, desaturated green/red (#2E7D52 / #B3452F-ish), not neon; red reserved for genuinely bad news so it keeps its alarm value; add ▲/▼ glyph + words so color is never the only channel (color-blind + print-safe).
    - Percent precision: one decimal under 10%, zero above ("+4.2% vs Sep", "+18% vs Sep").
  Chart chrome
    - Direct-label series at the endpoint instead of legends wherever possible; legend only when >~4 series.
    - Sparklines: same period length across all cards; fixed comparability (don't let each auto-scale into fake drama); one dot on the latest point.
    - Gridlines: 2–3 faint horizontal lines max, no vertical grid, no chart-junk (borders, 3D, heavy fills) — high data-ink ratio.
    - Axis money labels abbreviated ("4K"), dates as "Aug", "Sep" with year markers at Jan boundaries ("Jan '26").
  Typography/contrast
    - One font family with tnum support (system stack or Inter); numbers in lining tabular; headline KPI at ~28–32px, labels at ~11–12px muted uppercase or sentence case, body 14–16px — never 12px table text.
    - Label → value → delta is the fixed card anatomy; whitespace and weight do the hierarchy, not boxes/borders.
    - WCAG: 4.5:1 text contrast, 3:1 for chart marks on both light and (if you add it) dark mode.

================================================================

5. MOBILE VS DESKTOP

  Same codebase, three breakpoints. The tab strip is the pivot: top strip ≥900px; on ≤640px it becomes a fixed BOTTOM bar with icon+label for the 4 highest-use tabs (Overview, Spending, Net Worth, Subscriptions) with Cash Flow and Accounts folded into a "More" chip — 3–5 bottom destinations is the mobile standard (Material/Apple), and bottom placement sits in the thumb zone.
  Desktop
    - Full-width 2-column card grids; hover tooltips on charts and delta pills; wide tables with all columns; the filter bar always visible inline.
    - Density moves copied from Monarch's redesign notes: shorter transaction rows, smaller bar heights, collapsible groups.
  Mobile
    - ONE question per screen, 3–5 data points above the fold max (fuselab/four-chunk guidance): KPI row becomes a 2-up grid, chart cards become full-width single charts sized to fit.
    - No hover: every chart tooltip becomes tap-on-element with an explicit hint ("Tap a bar for details"), bars are thinned to ~12 months and horizontally scroll-paged by time, not squished.
    - Wide tables degrade to stacked cards (row → card: merchant big, amount right, chips below) EXCEPT the biggest-expenses table, which is genuinely comparative — allow one horizontal scroll region there with a sticky first column instead.
    - Filters: behind a sticky "Filters" button opening a bottom sheet; applied filters shown as removable chips + count near results so state is never silent.
    - Touch targets ≥44–48px; ≥8px gaps; sparkline cards are ideal for mobile precisely because they carry context without requiring interaction.
    - Net-worth/cash-flow big charts: show the headline number + sparkline on mobile, full chart behind "Expand".
  Print/export: hash-tabs mean only the active panel prints — acceptable for a family dashboard, but add a "Print this view" button that prints the panel cleanly (all panels are already in the DOM, so a simple @media print rule on .active suffices).

================================================================

6. MOCKUPS (rough wireframes — desktop widths ~78ch)

6a. OVERVIEW TAB — desktop (the default landing view)

 +----------------------------------------------------------------------------+
 | Family Money    OVERVIEW   Cash Flow   Spending   Net Worth   Subs  Accts  |
 | Everyone v | All categories v | Last 12 months v | Refreshed 2h ago    (?)  |
 +----------------------------------------------------------------------------+
 |  OCTOBER 2026 (11 days in)                                vs September      |
 |  +------------------+  +------------------+  +------------------+            |
 |  | INCOME           |  | SPENT            |  | NET              |            |
 |  | $ 4,318          |  | $ 3,127          |  | + $ 1,191        |            |
 |  | ▼ 6.2% vs Sep    |  | ▲ 18.4% vs Sep   |  | ▼ 41% vs Sep     |            |
 |  | ~~/\_/\/\_~ •    |  | __/\_/\__/\_~ •  |  | ~~~\_/\/\~~~  •  |            |
 |  +------------------+  +------------------+  +------------------+            |
 |                                                                             |
 |  NEEDS ATTENTION  ------------------------------------------------------------
 |   • 14 transactions unreviewed            • 2 possible duplicates            |
 |   • Netflix $15.49 → $19.99  (▲ 29%)      • Dining out up 32% vs 3-mo avg    |
 |  --------------------------------------------------------------------------------
 |                                                                             |
 |  +-------------------------------------+  +---------------------------------+|
 |  | NET WORTH          $214,800         |  | TOP CATEGORIES — Oct            ||
 |  | ▲ $2,110 this month   (+1.0%)       |  | Groceries   ████████████ $940  ||
 |  |  _/_/_/_/_/_/_/_/_/_/_/•  (23 mo)   |  |   30.1% ▲4% vs Sep              ||
 |  |  Assets 231.4K · Debt 16.6K         |  | Housing     ████████▌   $610    ||
 |  |                     [Full view →]   |  |   19.5% ▬                     |  |
 |  +-------------------------------------+  | Dining      █████▌    $380    |  |
 |                                            |   12.2% ▲32%                |  |
 |  +-------------------------------------+  | Transport   ███▌      $240    |  |
 |  | SUBSCRIPTIONS   $186 / mo            |  | Utilities   ███       $215    |  |
 |  | next 7 days: Netflix 19.99 · Spotify |  |  [All 22 categories →]        |  |
 |  | 11.99 · Gym 45.00                    |  +---------------------------------+|
 |  |         [Manage subscriptions →]     |                                     |
 |  +-------------------------------------+                                     |
 |                                                                             |
 |  BY PERSON (Oct)      Ana █████████████ $1,712 · Sam ██████████ $1,415      |
 |                                                                             |
 |  RECENT LARGE SPENDS                                          [See all →]   |
 |  Date      Merchant        Category     Account        $                    |
 |  Oct 3     Costco          Groceries    Chase card     214.32               |
 |  Oct 1     Auto repair     Car         Checking       190.00                |
 +----------------------------------------------------------------------------+

 (Delta pills: ▲/▼ + word, color muted; ▬ = flat grey state. Sparkline dot = latest point. Everything bracketed "[... →]" is a hash link to the deep-dive tab.)

6b. SPENDING TAB — deep dive (desktop), showing the drill-down state on "Groceries"

 +----------------------------------------------------------------------------+
 | Family Money    Overview   Cash Flow   SPENDING   Net Worth   Subs  Accts  |
 | Group by: [Category v|Merchant|Person]  Period: [Jul–Oct 2026 v]  (?)       |
 | Filter: Everyone | All accounts | Last 4 months                    10 chips |
 +----------------------------------------------------------------------------+
 |  SPEND $12,480 over 4 mo      vs same months last year  ▲ 9.2%              |
 |                                                                             |
 |  SHARE OF SPEND              CATEGORIES (total · share · trend · Δ vs prior)|
 |       ____                   +------------------------------------------------+
 |      /  G  \  Groceries 30%  | Groceries    $3,752  30.1% ~~/\/\~~ ▲ 4.2%   |
 |     |  30%  |  Housing   20% | Housing      $2,441  19.6% ~~~~~~~~ ▬ 0.3%   |
 |     | D 12% |  Dining    12% | Dining       $1,489  12.0% _/_/\/\  ▲ 18.4%  |
 |      \ H / \ T              | Transport  $ 980    7.9% ~/\_/\~~ ▼ 6.1%   |
 |       ‾‾‾‾‾                   | Utilities   $ 861    6.9% ~~~~/\~~ ▬ 1.0%   |
 |     Other 18.3%             | Kids        $ 640    5.1% _/_/‾‾\  ▲ 22%    |
 |     (donut = top 5           | Health      $ 512    4.1% ~~/\~~~ ▼ 11%    |
 |      + "Other" only)        |  ... 14 more            [Treemap view ⌄]     |
 |                             +------------------------------------------------+
 |                                                                             |
 |  GROceries — selected (tap another row to switch)              [× clear]   |
 |  $3,752 total   avg $341/mo   46 transactions   Ana $2,180 · Sam $1,572    |
 |                                                                             |
 |   900 |            *                                        /               |
 |   600 |     *   *        *         *               *      /   *  ← Oct MTD  |
 |   300 |  /       /\/  /\/    /\/ /\/    /\/\/\  /\/                       |
 |        +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+        |
 |          N  D  J  F  M  A  M  J  J  A  S  O     (23 months, '24–'26)        |
 |                                                                             |
 |   TRANSACTIONS — Groceries, Jul–Oct 2026            sort: Date ▼ $ ▼        |
 |   Date      Merchant              Person  Account      $                    |
 |   Oct 03    Costco                Ana     Chase        214.32              |
 |   Oct 01    Trader Joe's          Sam     Amex          87.15              |
 |   Sep 28    Costco                Ana     Chase        201.44  ⚑ dup?      |
 |   ...                                    [28 more]      3,752.60 total      |
 +----------------------------------------------------------------------------+

 6c. OVERVIEW — mobile (≤640px), same HTML reflowed

 +----------------------------+
 | Family Money        (?) Oct|
 | +-------------+ +---------+|
 | | INCOME      | | SPENT   ||
 | | $4,318      | | $3,127  ||
 | | ▼6% ~~/\~•  | | ▲18% ~\~||
 | +-------------+ +---------+|
 | +-------------+ +---------+|
 | | NET +$1,191 | | NW $215K||
 | +-------------+ +---------+|
 | ⚑ 3 things need attention  |
 |----------------------------|
 | TOP CATEGORIES             |
 | Groceries ███████ 940  ▲4% |
 | Housing   █████ 610    ▬   |
 | Dining    ███▌ 380   ▲32%  |
 |----------------------------|
 | SUBSCRIPTIONS $186/mo [→]  |
 |----------------------------|
 | [⌂Over] [Spending][NetW][⋯]|  ← fixed bottom bar, 44px targets
 +----------------------------+

================================================================

7. IMPLEMENTATION NOTES (stays in plain HTML/CSS/JS)

- Layout: CSS grid, `grid-template-columns: repeat(auto-fit, minmax(300px,1fr))` card grids; tab strip = flex; bottom-bar transform is one media query swapping the same `<nav>`.
- Tabs in DOM: all panels rendered server-side into one page; `location.hash` + class toggle (~15 LoC JS); anchors remain real links (works with JS off, degrades to in-page jump links — which quietly preserves the old scroll-page behavior).
- Charts: hand-built inline SVG — polylines (lines/sparklines), rects (bars), `<circle>` + `stroke-dasharray` or a conic-gradient div (donut), CSS grid tinted cells (heatmap). No canvas, no library.
- Formatting: one `fmtMoney(n, {compact})` helper over Intl.NumberFormat; one `deltaPill(cur, prev, higherIsBetter)` helper that returns ▲/▼/▬ + muted color + named baseline. Set `font-variant-numeric: tabular-nums lining-nums` globally on `.num` cells.
- Migration from the current page: KPIs → Overview; in-vs-out bars → Cash Flow (regroup, un-stack); category bars → Spending (horizontal + share donut); biggest expenses → Spending table; net worth line → Overview mini + Net Worth tab; recurring/subscriptions → its own tab; filters → per-tab context bar; person filter → Spending "Group by: Person" + Overview card.
- Accessibility pass: sparklines aria-hidden when the text delta already states the trend; text alternatives for chart cards ("Net worth up 1.0% this month, highest in 23 months"); focus styles on tabs; arrow-key tablist semantics (role=tablist/tab/tabpanel) — a small JS handler.

SOURCES
- help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports (tab structure, chart selector, drill-through)
- monarch.com/blog/monarch-brand-refresh (density/nav/collapsible accounts/recurring summary)
- blakecrosley.com/guides/design/copilot-money (semantic color, progressive disclosure)
- forbes.com/advisor/banking/copilot-budget-app-review (dashboard/recurring/net-worth layout)
- financialcalculate.com/reviews/copilot-money-ios-2026 (time-to-insight, recurring view)
- ynab.com/whats-new + support.ynab.com (Reflect tab, income-vs-spending bars, plan header)
- support-personalwealth.empower.com "Dashboard Overview" (net-worth & cash-flow drill-through cards)
- nngroup.com/articles/choosing-chart-types/ ; nngroup.com/articles/dashboards-preattentive/ (bar/line > stacked/donut/treemap)
- nngroup.com/articles/tabs-used-right/ ; baymard.com/research-articles/avoid-horizontal-tabs ; cxl.com/blog/tabbed-navigation/ (tab rules)
- eui.elastic.co part-to-whole guide ; observablehq.com/blog/truth-about-pie-charts (donut ≤6 slices, "Other")
- getdashboardtemplates.com/learn/kpi-card-design ; chartload.com/charts/sparkline-kpi ; fwdtools.com stat card (KPI card anatomy, delta baselines, flat state)
- MDN font-variant-numeric ; websolutionmaster.com tabular figures ; data.europa.eu number formatting (tnum, right align, k/M, screen-reader note)
- gooddata.ai accessible dashboards ; uxdesign.cc color-blind dashboards (color+glyph, contrast)
- toptal.com/designers/dashboard-design/mobile-dashboard-ui ; fuselabcreative.com mobile dashboard (stacked cards, tap-vs-hover, 44–48px, chunk limit)

Caveat: I could not open the repo in this run (only web tools were available), so section 0/2 assumptions about the current page come from your brief — worth a 10-minute code skim before finalizing the migration list in section 7.
```
