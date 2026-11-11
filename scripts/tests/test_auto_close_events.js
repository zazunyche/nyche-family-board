#!/usr/bin/env node
/**
 * test_auto_close_events.js
 *
 * Tests the REAL production selection logic in board-tools/auto-close-events.js
 * (imports the module — no reimplementation, no file I/O, no mocking).
 *
 * The anchor case is the regression that motivated this test: a task with
 * taskType 'EVENT' (the value Zazu's inference backfill actually assigns) that
 * is past its dueDate MUST be selected for auto-close. The original filter
 * checked only 'EXTERNAL_EVENT', so real EVENT tasks were never closed — they
 * sat on the active board accruing resistance as false stalls (t_m2rnhvo
 * "Ally's Birthday" was briefed 33x and hand-closed 22 days after the event).
 */

'use strict';

const assert = require('assert');
const ace = require('../../board-tools/auto-close-events.js');

const TODAY = '2026-11-10';
let passed = 0;
const fail = [];

function check(name, cond) {
  if (cond) { passed++; console.log(`  [ok ] ${name}`); }
  else      { fail.push(name); console.log(`  [FAIL] ${name}`); }
}

// ── selectClosable ────────────────────────────────────────────────────────
console.log('selectClosable(tasks, today):');

// REGRESSION: an EVENT past due is selected (the bug: it never was).
{
  const t = { id: 't_evt_past', taskType: 'EVENT', stage: 'ACTIVE', dueDate: '2026-07-15' };
  const out = ace.selectClosable([t], TODAY);
  check('EVENT past dueDate IS selected (regression anchor)', out.length === 1 && out[0].id === 't_evt_past');
}

// Legacy EXTERNAL_EVENT spelling still works (back-compat).
{
  const t = { id: 't_ext_past', taskType: 'EXTERNAL_EVENT', stage: 'ACTIVE', dueDate: '2026-01-01' };
  const out = ace.selectClosable([t], TODAY);
  check('EXTERNAL_EVENT past dueDate still selected (back-compat)', out.length === 1);
}

// dueDate === today is selected (event ends tonight — boundary pin).
{
  const t = { id: 't_evt_today', taskType: 'EVENT', stage: 'ACTIVE', dueDate: TODAY };
  const out = ace.selectClosable([t], TODAY);
  check('EVENT due === today IS selected (boundary)', out.length === 1);
}

// Future EVENT is NOT selected (e.g. live Safe School Evacuation, Nov 18).
{
  const t = { id: 't_evt_future', taskType: 'EVENT', stage: 'ACTIVE', dueDate: '2026-11-18' };
  const out = ace.selectClosable([t], TODAY);
  check('EVENT due in future is NOT selected', out.length === 0);
}

// DONE event is NOT re-selected (idempotent).
{
  const t = { id: 't_evt_done', taskType: 'EVENT', stage: 'DONE', dueDate: '2026-07-15' };
  const out = ace.selectClosable([t], TODAY);
  check('DONE event is NOT selected', out.length === 0);
}

// Non-event past-due task is NOT selected (don't close real work).
{
  const t = { id: 't_errand', taskType: 'ERRAND', stage: 'ACTIVE', dueDate: '2026-01-01' };
  const out = ace.selectClosable([t], TODAY);
  check('non-event (ERRAND) past due is NOT selected', out.length === 0);
}

// Event with no dueDate is NOT selected (nothing to compare).
{
  const t = { id: 't_evt_nodue', taskType: 'EVENT', stage: 'ACTIVE', dueDate: null };
  const out = ace.selectClosable([t], TODAY);
  check('EVENT with no dueDate is NOT selected', out.length === 0);
}

// Mixed board: only the two past-due events come back, order preserved.
{
  const tasks = [
    { id: 'a', taskType: 'EVENT',          stage: 'ACTIVE', dueDate: '2026-07-15' },
    { id: 'b', taskType: 'ERRAND',         stage: 'ACTIVE', dueDate: '2026-07-15' },
    { id: 'c', taskType: 'EVENT',          stage: 'ACTIVE', dueDate: '2026-11-18' },
    { id: 'd', taskType: 'EXTERNAL_EVENT', stage: 'ACTIVE', dueDate: '2026-11-10' },
    { id: 'e', taskType: 'EVENT',          stage: 'DONE',   dueDate: '2026-01-01' },
  ];
  const out = ace.selectClosable(tasks, TODAY).map(t => t.id);
  check('mixed board selects exactly [a, d]', JSON.stringify(out) === JSON.stringify(['a', 'd']));
}

// Empty / missing input is safe.
check('empty array -> []',   ace.selectClosable([], TODAY).length === 0);
check('undefined -> []',     ace.selectClosable(undefined, TODAY).length === 0);

// ── isEventType ───────────────────────────────────────────────────────────
console.log('isEventType(taskType):');
check('EVENT is event type',          ace.isEventType('EVENT') === true);
check('EXTERNAL_EVENT is event type', ace.isEventType('EXTERNAL_EVENT') === true);
check('ERRAND is not event type',     ace.isEventType('ERRAND') === false);
check('undefined is not event type',  ace.isEventType(undefined) === false);

// ── closeTask ─────────────────────────────────────────────────────────────
console.log('closeTask(task, nowISO):');
{
  const nowISO = '2026-11-10T05:00:00.000Z';
  const task = {
    id: 't_close', taskType: 'EVENT', stage: 'ACTIVE', dueDate: '2026-07-15',
    stageHistory: [{ stage: 'ACTIVE', enteredAt: '2026-06-29T22:00:00.000Z', exitedAt: null, durationMs: null }],
    history: [],
  };
  ace.closeTask(task, nowISO);
  check('closeTask sets stage DONE',                 task.stage === 'DONE');
  check('closeTask sets completedAt',                task.completedAt === nowISO);
  check('closeTask closes the open stageHistory row', task.stageHistory[0].exitedAt === nowISO && task.stageHistory[0].durationMs > 0);
  check('closeTask appends DONE stageHistory row',   task.stageHistory[task.stageHistory.length - 1].stage === 'DONE');
  check('closeTask logs ZAZU auto-close history',    task.history.length === 1 && task.history[0].actor === 'ZAZU' && /auto-closed: EVENT/.test(task.history[0].change));
}

// REGRESSION: the open stageHistory row has NO exitedAt key (the live on-board
// shape, e.g. t_insure01's ACTIVE row). closeTask must still close it, leaving
// exactly one open entry — a strict `=== null` check missed it and left two.
{
  const nowISO = '2026-11-10T05:00:00.000Z';
  const task = {
    id: 't_close_noexit', taskType: 'EVENT', stage: 'ACTIVE', dueDate: '2026-07-15',
    stageHistory: [{ stage: 'ACTIVE', enteredAt: '2026-06-29T22:00:00.000Z' }], // no exitedAt key
    history: [],
  };
  ace.closeTask(task, nowISO);
  const open = task.stageHistory.filter(s => s.exitedAt === null || s.exitedAt === undefined);
  check('closeTask closes a keyless-exitedAt open row', task.stageHistory[0].exitedAt === nowISO && task.stageHistory[0].durationMs > 0);
  check('closeTask leaves exactly one open entry (keyless case)', open.length === 1 && open[0].stage === 'DONE');
}

// ── todayLocal (injected clock) ───────────────────────────────────────────
console.log('todayLocal(now):');
check('todayLocal formats injected date', ace.todayLocal(new Date('2026-11-10T12:00:00.000Z')) === '2026-11-10');

// ── report ────────────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`FAILED: ${fail.length} case(s): ${fail.join(', ')} (${passed} passed)`);
  process.exit(1);
}
console.log(`All ${passed} cases pass — EVENT (and legacy EXTERNAL_EVENT) tasks past dueDate are selected for auto-close; future/DONE/non-event/no-dueDate tasks are left untouched.`);
