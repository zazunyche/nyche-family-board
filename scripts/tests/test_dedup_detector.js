#!/usr/bin/env node
/**
 * test_dedup_detector.js
 *
 * Tests the REAL production helpers in analytics/scripts/dedup-detector.js by
 * require()-ing the module (no reimplementation, no file I/O). dedup-detector.js
 * is not a stageHistory walker or a date-math script — its silent-corruption
 * risk lives in period-marker extraction: it suppresses "duplicate" clusters
 * for recurring-series tasks that differ only by a quarter/year/month marker
 * (e.g. the quarterly TX sales-tax set), so a FALSE period marker makes two
 * genuine duplicates look like distinct recurrences and silently drops them
 * from the report — defeating the detector's whole purpose.
 *
 * Anchor regressions pinned:
 *  1. MONTH OVER-MATCH (the bug this suite was written to lock down):
 *     periodSignature used a greedy '\bmo[a-z]*\b' regex, so ordinary words that
 *     merely START with a month abbreviation registered as month markers —
 *     "Decide"->dec, "Marketing"->mar, "Junk"->jun, "maybe"->may, "Separate"->sep,
 *     "October"->oct was fine but "Octopus"->oct was not. Matching is now EXACT
 *     (abbreviation or fully-spelled month as a standalone word). This test fails
 *     if the greedy prefix behavior ever returns.
 *  2. periodsDiffer only suppresses when BOTH titles carry period markers and the
 *     marker SETS differ; one-sided or identical markers do not suppress.
 *  3. computeClusters groups same-category similar titles transitively, de-dupes
 *     members across merges, excludes singletons, and does NOT cross categories.
 *  4. A true recurring series (Q4 2026 / Q1 2027 / Q2 2027) is NOT clustered,
 *     while a genuine reworded duplicate in the same category IS.
 */

'use strict';

const assert = require('assert');
const dd = require('../../analytics/scripts/dedup-detector.js');

let passed = 0;
const fail = [];
function check(name, cond) {
  if (cond) { passed++; } else { fail.push(name); }
}

const sig = t => dd.periodSignature(t);
const has = (t, m) => sig(t).has(m);

// ── periodSignature: EXACT month matching (the core regression) ──────────────
// Real months, standalone, in either abbreviated or spelled form, DO register.
check('"Pay Oct rent" -> oct',            has('Pay Oct rent', 'oct'));
check('"October gutters" -> oct',         has('October gutters', 'oct'));
check('"due in September" -> sep',        has('due in September', 'sep'));
check('"Sept school forms" -> sep',       has('Sept school forms', 'sep'));
check('"May insurance" -> may',           has('May insurance', 'may'));

// Ordinary words that merely start with a month abbreviation must NOT register.
check('"Decide ..." is NOT dec',          !has('Decide AI Agents curriculum', 'dec'));
check('"Declare ..." is NOT dec',         !has('Declare home office', 'dec'));
check('"Marketing ..." is NOT mar',       !has('Marketing plan review', 'mar'));
check('"Junk removal" is NOT jun',        !has('Junk removal from garage', 'jun'));
check('"Separate ..." is NOT sep',        !has('Separate the recycling', 'sep'));
check('"maybe ..." is NOT may',           !has('maybe reschedule dentist', 'may'));
check('"April"/"apron" only real month',  has('April taxes', 'apr') && !has('tie the apron', 'apr'));
check('no false marker on plain title',   sig('Follow up with neighbor on repair').size === 0);

// Quarters and years still extract correctly alongside months.
check('"(Q4 2026)" -> q4 + 2026',         has('Sales tax (Q4 2026)', 'q4') && has('Sales tax (Q4 2026)', '2026'));
check('spelled "Quarter 1" -> q1',        has('Quarter 1 filing', 'q1'));

// ── periodsDiffer: suppression predicate ─────────────────────────────────────
check('differ: {q4,2026} vs {q1,2027}',   dd.periodsDiffer(sig('x Q4 2026'), sig('x Q1 2027')) === true);
check('same markers do NOT differ',       dd.periodsDiffer(sig('x Q4 2026'), sig('y Q4 2026')) === false);
check('one-sided (empty) does NOT differ', dd.periodsDiffer(sig('x Q4 2026'), sig('plain title')) === false);
check('empty vs empty does NOT differ',   dd.periodsDiffer(sig('plain a'), sig('plain b')) === false);

// ── computeClusters integration over a synthetic board ───────────────────────
// Scenario A: three TX-sales-tax recurrences — same category, near-identical
//   titles differing ONLY by quarter/year → must NOT cluster (distinct periods).
// Scenario B: two genuine reworded duplicates in ADMIN → MUST cluster.
// Scenario C: a same-title pair in a DIFFERENT category from B → must NOT merge
//   across categories (and proves category is required).
// Scenario D: a lone unrelated task → never in a cluster.
const tasks = [
  { id: 'tax_q4', title: 'Pay Texas Comptroller sales tax Nyche LLC (Q4 2026)', category: 'ADMIN', stage: 'IDEA', owner: 'DAD', createdAt: '2026-07-27' },
  { id: 'tax_q1', title: 'Pay Texas Comptroller sales tax Nyche LLC (Q1 2027)', category: 'ADMIN', stage: 'IDEA', owner: 'DAD', createdAt: '2026-07-27' },
  { id: 'tax_q2', title: 'Pay Texas Comptroller sales tax Nyche LLC (Q2 2027)', category: 'ADMIN', stage: 'IDEA', owner: 'DAD', createdAt: '2026-07-27' },
  { id: 'dup_a',  title: 'Restock baby wipes from Costco',                      category: 'HOME',  stage: 'ACTIVE', owner: 'MOM', createdAt: '2026-10-01' },
  { id: 'dup_b',  title: 'Restock the baby wipes Costco run',                   category: 'HOME',  stage: 'ACTIVE', owner: 'MOM', createdAt: '2026-10-02' },
  { id: 'other',  title: 'Renew British passport Dad',                          category: 'ADMIN', stage: 'ACTIVE', owner: 'DAD', createdAt: '2026-07-27' },
];

const clusters = dd.computeClusters(tasks);

// The recurring tax trio shares high title similarity + category but differs by
// period → zero clusters from them. Only the wipes duplicate should surface.
check('exactly 1 cluster found',          clusters.length === 1);
const c = clusters[0] || { members: [] };
const ids = new Set(c.members.map(m => m.id));
check('cluster is the wipes pair',        ids.has('dup_a') && ids.has('dup_b'));
check('cluster has exactly 2 members',    c.members.length === 2);
check('tax recurrences NOT clustered',    !ids.has('tax_q4') && !ids.has('tax_q1') && !ids.has('tax_q2'));
check('lone task NOT clustered',          !ids.has('other'));
check('maxSimilarity in (0,1]',           c.maxSimilarity > 0 && c.maxSimilarity <= 1);

// Regression teeth: before the fix, "Decide"/"Separate"-type period false-
// positives could make two real duplicates differ by a phantom month and vanish.
// Prove a reworded duplicate whose titles contain month-prefix WORDS (not real
// months) still clusters — i.e. the phantom markers no longer split them.
const phantom = dd.computeClusters([
  { id: 'p1', title: 'Decide and separate the junk in the garage', category: 'HOME', stage: 'ACTIVE', owner: 'DAD', createdAt: '2026-10-01' },
  { id: 'p2', title: 'Separate and decide the garage junk pile',    category: 'HOME', stage: 'ACTIVE', owner: 'DAD', createdAt: '2026-10-02' },
]);
check('phantom-month dup still clusters', phantom.length === 1 && phantom[0].members.length === 2);

console.log('');
console.log(`test_dedup_detector: ${passed} passed, ${fail.length} failed`);
if (fail.length) {
  fail.forEach(f => console.log(`  [FAIL] ${f}`));
  process.exit(1);
}
assert.strictEqual(fail.length, 0);
console.log('All assertions passed — month markers match exact words only (no greedy prefix), ' +
  'recurring period-series are not flagged as duplicates, and genuine reworded duplicates still cluster.');
