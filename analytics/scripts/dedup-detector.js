#!/usr/bin/env node
/**
 * dedup-detector.js — Likely duplicate task clusters
 *
 * Tier 1 script from analytics/plan-v1.md. Flags pairs/clusters of tasks
 * whose titles are highly similar (token overlap) and which share a category,
 * so Zazu can catch repeat-email-triage duplicates (e.g. Charge Express was
 * created 3x from the same thread across separate heartbeats) before they
 * pile up and need manual merging.
 *
 * Usage:
 *   node analytics/scripts/dedup-detector.js
 *   node analytics/scripts/dedup-detector.js --json
 *   node analytics/scripts/dedup-detector.js --save   (writes to analytics/outputs/dedup-report.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BOARD_PATH = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

// Tasks with title similarity >= this threshold (and same category) are flagged.
// 0.6 was chosen empirically against the live board: it catches genuine
// reworded duplicates (e.g. "Restock wipes..." vs "Bring wipes...") while
// excluding same-trip/same-project tasks that just share a few keywords
// (e.g. "Book Airbnb for Kojo wedding" vs "Book rental car ... Kojo wedding").
const SIMILARITY_THRESHOLD = 0.6;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'on', 'in', 'and', 'or', 'with',
  'review', 'follow', 'up', 'send', 'get', 'confirm', 'check',
]);

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function tokenize(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w))
  );
}

// Jaccard similarity: |intersection| / |union|
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  const tasks = (data.tasks || []).filter(t => t.stage !== 'ARCHIVED');

  const tokenized = tasks.map(t => ({ task: t, tokens: tokenize(t.title || '') }));

  // Union-find style clustering: pairwise compare, group transitively.
  const clusters = [];
  const assigned = new Map(); // task id -> cluster index

  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = tokenized[i];
      const b = tokenized[j];
      if (a.task.category !== b.task.category) continue;
      const sim = similarity(a.tokens, b.tokens);
      if (sim < SIMILARITY_THRESHOLD) continue;

      const aCluster = assigned.get(a.task.id);
      const bCluster = assigned.get(b.task.id);

      if (aCluster === undefined && bCluster === undefined) {
        const idx = clusters.length;
        clusters.push({ members: [a.task, b.task], maxSimilarity: sim });
        assigned.set(a.task.id, idx);
        assigned.set(b.task.id, idx);
      } else if (aCluster !== undefined && bCluster === undefined) {
        clusters[aCluster].members.push(b.task);
        clusters[aCluster].maxSimilarity = Math.max(clusters[aCluster].maxSimilarity, sim);
        assigned.set(b.task.id, aCluster);
      } else if (aCluster === undefined && bCluster !== undefined) {
        clusters[bCluster].members.push(a.task);
        clusters[bCluster].maxSimilarity = Math.max(clusters[bCluster].maxSimilarity, sim);
        assigned.set(a.task.id, bCluster);
      } else if (aCluster !== bCluster) {
        // Merge two existing clusters
        const keep = Math.min(aCluster, bCluster);
        const drop = Math.max(aCluster, bCluster);
        clusters[keep].members.push(...clusters[drop].members);
        clusters[keep].maxSimilarity = Math.max(clusters[keep].maxSimilarity, clusters[drop].maxSimilarity, sim);
        for (const [id, idx] of assigned) {
          if (idx === drop) assigned.set(id, keep);
        }
        clusters[drop].members = [];
      }
    }
  }

  const result = clusters
    .filter(c => c.members.length >= 2)
    .map(c => {
      // De-dupe members (a task can be pushed twice during merges)
      const seen = new Set();
      const members = c.members.filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      return {
        maxSimilarity: Math.round(c.maxSimilarity * 100) / 100,
        members: members.map(t => ({
          id: t.id,
          title: t.title,
          stage: t.stage,
          owner: t.owner,
          createdAt: t.createdAt,
        })),
      };
    })
    .filter(c => c.members.length >= 2)
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

  const report = {
    generatedAt: new Date().toISOString(),
    threshold: SIMILARITY_THRESHOLD,
    clustersFound: result.length,
    clusters: result,
  };

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'dedup-report.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Dedup Report — ${ts}`);
  lines.push('');
  lines.push(`Title-similarity threshold: ${SIMILARITY_THRESHOLD} (Jaccard, same category required)`);
  lines.push('');

  if (result.length === 0) {
    lines.push('No likely duplicate clusters found.');
  } else {
    lines.push(`## Likely Duplicate Clusters (${result.length})`);
    lines.push('');
    result.forEach((c, idx) => {
      lines.push(`### Cluster ${idx + 1} — similarity ${c.maxSimilarity}`);
      lines.push('');
      lines.push('| ID | Title | Stage | Owner | Created |');
      lines.push('|----|-------|-------|-------|---------|');
      c.members.forEach(t => {
        lines.push(`| ${t.id} | ${t.title.slice(0, 60)} | ${t.stage} | ${t.owner} | ${t.createdAt ? t.createdAt.slice(0, 10) : ''} |`);
      });
      lines.push('');
    });
    lines.push('> Review each cluster manually — merge into one canonical task, carrying forward the highest-value fields (priority, notes detail, briefCount) before removing duplicates.');
    lines.push('');
  }

  const md = lines.join('\n');

  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'dedup-report.md');
    fs.writeFileSync(p, md);
    console.error(`Saved to ${p}`);
  }

  console.log(md);
}

run();
