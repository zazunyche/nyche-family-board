# Family Finance Audit — project state & plan

Durable record so any restart/new session can resume exactly. Updated 2026-10-11.

## Goal
Turn 2025–2026 bank + credit-card statements into a clean, queryable datastore →
monthly money-in vs money-out, where it's going, biggest/odd expenses, savings
opportunities. Household view with per-person (Dad / Nana Yaa) filters.

## Hard rules
- **100% LOCAL.** Raw statements + the datastore never leave the Mac. Only a
  de-identified *summary layer* (aggregates, no account numbers / raw transactions)
  may ever go to the cloud (e.g. Claude Dashboards), and only when Dad switches it on.
- **Code does the math; models never guess numbers.** Every statement reconciles
  (begin + summed txns == end) as an accuracy gate.

## Locations
- Raw PDFs: `~/Documents/Financial-Audit-2025-2026/ecFinanceDocsv1/` (7 folders, `<institution> - <type>`)
- Datastore: `~/Documents/Financial-Audit-2025-2026/finance.db`  (OUTSIDE the repo; gitignored)
- Code: `family-board/finance/build_db.py`  (tracked)
- Rebuild anytime: `python3 finance/build_db.py`  (idempotent)

## Accounts & card→person map
- Capital One 360 **checking ...2800** + **savings ...5904** — JOINT (cashflow in/out)
- Chase **checking ...2782**, Chase **savings ...3196** — (cashflow in/out)
- Credit cards (detail): Capital One **Venture X ...0666 = DAD, ...1168 = MOM**;
  Capital One **Venture ...4336 = DAD, other = MOM**; **Amex Delta ...81003 = DAD**
  (3 months only, mid-2026); Chase **Amazon ...8188**. Nana Yaa's Amex Platinum to be added later → MOM.
- Cap One CC statements break out transactions by cardholder (`<NAME> #<last4>:` sections) → per-person CC spend IS feasible. International (Ghana/GHS) spend appears with exchange-rate lines → convert to USD.

## Architecture (Dad-approved 2026-10-11)
PDFs → deterministic per-institution parsers → SQLite (facts + dimensions) →
**de-identified summary/semantic layer** (monthly in/out, by-category, by-merchant,
by-person, balances) + pinned category taxonomy + one-command refresh →
powers our LOCAL dashboard AND is "Claude Dashboards-ready" (cloud warehouse hookup = later flip-a-switch).

## Status
- ✅ **Phase 1 foundation DONE & verified:** pipeline + reconciliation gate; Capital One 360
  joint checking+savings — **40/40 statements reconcile to the penny** (2 accounts, 504 txns).
  `owner` dimension (DAD/MOM/JOINT) in place.
- ⬜ Parsers remaining: Chase checking/savings, Chase Amazon CC, Capital One cards
  (cardholder-aware + currency), Amex.
- ⬜ Tag internal transfers (incl. Capital One ↔ Chase + inter-account) so they're
  excluded from money-in/out and never double-counted.
- ⬜ Categorize (pinned taxonomy, merchant normalization). Hermes assists on fuzzy labeling/anomalies.
- ⬜ Build summary layer + local dashboard with person filters.
- ⬜ First deliverable: full reconciliation report + views (in vs out, where it's going, biggest/odd expenses).

## Who does what
- **Zazu (Claude Code):** architecture, parsers, schema, reconciliation, dashboard code. Primary builder.
- **Hermes (LOCAL model):** heavy categorization, merchant normalization, anomaly/opportunity analysis
  on the clean data — AFTER extraction. Runs on-demand via `board-tools/hermes-bridge.js` (not a daemon).
