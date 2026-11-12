#!/usr/bin/env node
/**
 * test_completion_rate.js
 *
 * Tests the REAL production helpers in analytics/scripts/completion-rate.js by
 * require()-ing the module (no reimplementation, no file I/O). completion-rate.js
 * is NOT a stageHistory walker (its four tested peers are board-health /
 * staleness-triage / wait-ratio / cycle-time) — it does creation→completion date
 * math, the same class of silent-corruption risk. The 2026-11-11 refactor
 * extracted a pure computeReport(board, now), routed every lead-time computation
 * through one leadDays() helper, and guarded the CLI behind require.main so these
 * assertions can drive it deterministically.
 *
 * Anchor regressions pinned:
 *  1. NEGATIVE-LEAD-TIME CONSISTENCY (the bug this suite was written to lock down):
 *     a DONE task with completedAt BEFORE createdAt is a data error. Its lead time
 *     is never meaningful, so it must be dropped from BOTH the overall leadTimeStats
 *     AND every per-dimension breakdown — not counted in one and excluded from the
 *     other. Before the fix, ratesByDimension filtered `days >= 0` but the overall
 *     leadTimes array did not, so a single bad timestamp could drag the overall
 *     min/median negative while the category tables stayed clean. leadDays() now
 *     gates both paths; this test fails if that single choke point is bypassed.
 *  2. DONE tasks missing completedAt or createdAt are excluded from lead-time stats
 *     (not charged a bogus value), but STILL counted toward total/done/rate.
 *  3. Completion rate = round(done / total * 100); ARCHIVED tasks excluded from
 *     the denominator entirely (removed, not completed).
 */

'use strict';

const assert = require('assert');
const cr = require('../../analytics/scripts/completion-rate.js');

let passed = 0;
const fail = [];
function check(name, cond) {
  if (cond) { passed++; } else { fail.push(name); }
}

const DAY = 24 * 60 * 60 * 1000;
const T0  = Date.parse('2026-01-01T00:00:00.000Z');
const d   = n => new Date(T0 + n * DAY).toISOString();
const NOW = T0 + 100 * DAY;

// ── Pure helper math ─────────────────────────────────────────────────────────
check('msDays(1 day) === 1',       cr.msDays(DAY) === 1);
check('msDays(0) === 0',           cr.msDays(0) === 0);
check('msDays rounds to 0.1d',     cr.msDays(DAY * 1.25) === 1.3);

check('median([]) is null',        cr.median([]) === null);
check('median odd picks middle',   cr.median([10, 30, 20]) === 20);
check('median even averages pair', cr.median([10, 20]) === 15);

// leadDays: the single choke point for all lead-time math.
check('leadDays normal (10d)',          cr.leadDays({ createdAt: d(0), completedAt: d(10) }) === 10);
check('leadDays zero (same instant)',   cr.leadDays({ createdAt: d(5), completedAt: d(5) }) === 0);
check('leadDays negative -> null',      cr.leadDays({ createdAt: d(10), completedAt: d(3) }) === null);
check('leadDays missing completedAt',   cr.leadDays({ createdAt: d(0) }) === null);
check('leadDays missing createdAt',     cr.leadDays({ completedAt: d(0) }) === null);

// ── computeReport integration over a synthetic board ─────────────────────────
// 5 tasks:
//   a1 DONE  FAMILY  lead 10d
//   a2 DONE  FAMILY  lead 20d
//   a3 DONE  ADMIN   completedAt BEFORE createdAt  → lead invalid (negative)
//   a4 DONE  ADMIN   missing completedAt            → counted done, no lead time
//   a5 ACTIVE ADMIN  not done
//   a6 ARCHIVED FAMILY done-ish but excluded from everything
const board = {
  tasks: [
    { id: 'a1', title: 'A1', stage: 'DONE',     category: 'FAMILY', createdAt: d(0),  completedAt: d(10) },
    { id: 'a2', title: 'A2', stage: 'DONE',     category: 'FAMILY', createdAt: d(0),  completedAt: d(20) },
    { id: 'a3', title: 'A3', stage: 'DONE',     category: 'ADMIN',  createdAt: d(30), completedAt: d(2)  }, // negative!
    { id: 'a4', title: 'A4', stage: 'DONE',     category: 'ADMIN',  createdAt: d(0)                       }, // no completedAt
    { id: 'a5', title: 'A5', stage: 'ACTIVE',   category: 'ADMIN',  createdAt: d(0)                       },
    { id: 'a6', title: 'A6', stage: 'ARCHIVED', category: 'FAMILY', createdAt: d(0),  completedAt: d(1)   },
  ],
};

const rep = cr.computeReport(board, NOW);

// Overall: 5 non-archived tasks, 4 DONE → rate 80%. (a6 archived, fully excluded.)
check('overall.total excludes archived (5)',  rep.overall.total === 5);
check('overall.done counts all DONE (4)',      rep.overall.done === 4);
check('overall.rate = round(4/5) = 80%',       rep.overall.rate === 80);

// Lead-time stats: ONLY a1(10) and a2(20) are valid. a3 negative dropped, a4 no
// completedAt dropped, a6 archived gone. median 15, min 10, max 20, n=2.
check('leadTimeStats.count = 2 valid',         rep.leadTimeStats.count === 2);
check('leadTimeStats.median = 15d',            rep.leadTimeStats.medianDays === 15);
check('leadTimeStats.min = 10d (NOT negative)', rep.leadTimeStats.minDays === 10);
check('leadTimeStats.max = 20d',               rep.leadTimeStats.maxDays === 20);
// Regression teeth: the old bug let the a3 negative lead time into the overall
// pool, which would make min negative. Assert it never does.
check('overall min is never negative',         rep.leadTimeStats.minDays >= 0);

// Per-dimension: ADMIN has a3(done,invalid) + a4(done,no-ts) + a5(active).
// done=2, total=3, rate=round(2/3)=67%, and NO valid lead times → medianLeadDays null.
const admin = rep.byCategory.find(r => r.category === 'ADMIN');
check('ADMIN total = 3',                        admin.total === 3);
check('ADMIN done = 2 (a3 + a4)',               admin.done === 2);
check('ADMIN rate = 67%',                       admin.rate === 67);
check('ADMIN median lead null (no valid ts)',   admin.medianLeadDays === null);

// FAMILY: a1 + a2 both done, a6 archived excluded → done=2, total=2, rate 100, median 15.
const family = rep.byCategory.find(r => r.category === 'FAMILY');
check('FAMILY total = 2 (archived a6 excluded)', family.total === 2);
check('FAMILY done = 2',                         family.done === 2);
check('FAMILY rate = 100%',                      family.rate === 100);
check('FAMILY median lead = 15d',                family.medianLeadDays === 15);

// generatedAt is derived from the injected `now`, not wall clock (determinism).
check('generatedAt reflects injected now',       rep.generatedAt === new Date(NOW).toISOString());

// Markdown render is a pure function of (report, now) and names the real numbers.
const md = cr.renderMarkdown(rep, NOW);
check('md states 80% overall rate',              md.includes('overall rate: **80%**'));
check('md states median 15 days',                md.includes('median **15 days**'));
check('md never prints a negative min',          !/min -\d/.test(md));

console.log('');
console.log(`test_completion_rate: ${passed} passed, ${fail.length} failed`);
if (fail.length) {
  fail.forEach(f => console.log(`  [FAIL] ${f}`));
  process.exit(1);
}
assert.strictEqual(fail.length, 0);
console.log('All assertions passed — negative/incomplete lead times are dropped from BOTH ' +
  'overall stats and per-dimension breakdowns via the single leadDays() choke point; ' +
  'ARCHIVED tasks excluded from rate denominators.');
