#!/usr/bin/env node
/**
 * scripts/generate-snapshot.js
 * Generates a self-contained HTML snapshot of the board.
 * Zazu sends this when you or your wife ask "send me the board."
 *
 * Usage:
 *   node scripts/generate-snapshot.js                    → saves to snapshots/board-YYYY-MM-DD.html
 *   node scripts/generate-snapshot.js --out /tmp/board.html
 *   node scripts/generate-snapshot.js --open             → open in browser after generating
 *
 * The output is a single .html file with everything inline —
 * no external dependencies, opens directly in any browser.
 */

const fs   = require("fs");
const path = require("path");

const DATA_FILE     = path.join(__dirname, "..", "board-data.json");
const SNAPSHOT_DIR  = path.join(__dirname, "..", "snapshots");
const args          = process.argv.slice(2);
const argVal        = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };
const OPEN          = args.includes("--open");
const OUT           = argVal("--out");

// ── Load ──────────────────────────────────────────────────────────────────────
let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr  = () => new Date().toISOString().split("T")[0];
const daysSince = d  => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 0;
const staleN    = board.settings?.staleThresholdDays || 7;
const isOverdue = t  => t.dueDate && t.dueDate < todayStr() && t.stage !== "DONE" && !t.snoozedUntil;
const isStale   = t  => !isOverdue(t) && t.stage !== "DONE" && !t.snoozedUntil && daysSince(t.updatedAt) >= staleN;
const esc       = s  => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const STAGE_META = {
  IDEA:     { label:"💡 Idea",     color:"#1A4FCC", bg:"#EBF3FF" },
  RESEARCH: { label:"🔍 Research", color:"#92570D", bg:"#FFF8E6" },
  ACTIVE:   { label:"⚡ Active",   color:"#B91C1C", bg:"#FFF0F0" },
  ASSIGNED: { label:"📋 Assigned", color:"#0D7A52", bg:"#EDFCF5" },
  DONE:     { label:"✅ Done",     color:"#6B6860", bg:"#F5F5F4" },
};

const CAT_META = {
  HOME:     { label:"Home",     color:"#2563EB", bg:"#EFF6FF" },
  VEHICLES: { label:"Vehicles", color:"#D97706", bg:"#FFFBEB" },
  FAMILY:   { label:"Family",   color:"#059669", bg:"#ECFDF5" },
  ADMIN:    { label:"Admin",    color:"#DC2626", bg:"#FEF2F2" },
  YARD:     { label:"Yard",     color:"#16A34A", bg:"#F0FDF4" },
  GOALS:    { label:"Goals",    color:"#7C3AED", bg:"#F5F3FF" },
};

const OWNER_COLOR = {
  DAD:"#1A4FFF", MOM:"#0B9E8E", BOTH:"#7C3AED", ZAZU:"#B45309"
};

const PRI_COLOR = { HIGH:"#DC2626", MEDIUM:"#D97706", LOW:"#9CA3AF" };

// ── Stats ─────────────────────────────────────────────────────────────────────
const open    = board.tasks.filter(t => t.stage !== "DONE");
const overdue = board.tasks.filter(t => isOverdue(t));
const stale   = board.tasks.filter(t => isStale(t));
const done    = board.tasks.filter(t => t.stage === "DONE");

// ── Render card ───────────────────────────────────────────────────────────────
function renderCard(t) {
  const cat     = CAT_META[t.category]  || { label:t.category, color:"#888", bg:"#eee" };
  const oColor  = OWNER_COLOR[t.owner]  || "#888";
  const pColor  = PRI_COLOR[t.priority] || "#888";
  const ov      = isOverdue(t);
  const sl      = isStale(t);
  const border  = ov ? "#DC2626" : sl ? "#D97706" : "transparent";
  const initial = t.owner ? t.owner[0] : "?";

  let dateHtml = "";
  if (ov)          dateHtml = `<span style="color:#DC2626;font-weight:700">⚠ ${daysSince(t.dueDate)}d overdue</span>`;
  else if (t.dueDate) dateHtml = `<span>${t.dueDate}</span>`;
  if (sl && !ov)   dateHtml += `<span style="color:#D97706;margin-left:auto">💤 ${daysSince(t.updatedAt)}d</span>`;

  return `
    <div style="background:#fff;border:1px solid rgba(0,0,0,.1);border-left:3px solid ${border};border-radius:10px;padding:11px 13px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:7px">
        <span style="width:7px;height:7px;border-radius:50%;background:${pColor};flex-shrink:0;margin-top:4px;display:inline-block"></span>
        <strong style="font-size:12.5px;line-height:1.4">${esc(t.title)}</strong>
      </div>
      <div style="margin-bottom:6px">
        <span style="padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;color:${cat.color};background:${cat.bg}">${cat.label}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6B7280">
        <span style="width:17px;height:17px;border-radius:50%;background:${oColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:700">${initial}</span>
        ${dateHtml}
      </div>
      ${t.notes ? `<div style="margin-top:7px;font-size:11px;color:#9CA3AF;line-height:1.5">${esc(t.notes)}</div>` : ""}
    </div>`;
}

// ── Render columns ────────────────────────────────────────────────────────────
function renderColumns() {
  return Object.entries(STAGE_META).map(([stageId, meta]) => {
    const cards = board.tasks.filter(t => t.stage === stageId);
    return `
      <div style="min-width:220px;flex-shrink:0">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-radius:9px 9px 0 0;background:${meta.bg};color:${meta.color};font-size:11.5px;font-weight:700;margin-bottom:8px">
          <span>${meta.label}</span>
          <span style="background:rgba(0,0,0,.08);border-radius:20px;padding:1px 8px;font-size:11px">${cards.length}</span>
        </div>
        ${cards.map(renderCard).join("")}
        ${cards.length===0 ? `<div style="padding:14px;text-align:center;font-size:12px;color:#D1D5DB;font-style:italic">No tasks</div>` : ""}
      </div>`;
  }).join("");
}

// ── Build full HTML ───────────────────────────────────────────────────────────
const generatedAt = new Date().toLocaleString("en-US", {
  weekday:"short", month:"short", day:"numeric",
  hour:"numeric", minute:"2-digit"
});

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nyche Family Board — ${todayStr()}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#F0EDE8; color:#1A1714; font-size:14px; }
  .snap-notice { background:#1A1714; color:rgba(255,255,255,.6); text-align:center; padding:7px; font-size:11px; }
  nav { background:#1A1714; padding:0 20px; height:50px; display:flex; align-items:center; gap:12px; }
  .nav-logo { font-size:16px; font-weight:700; color:#fff; }
  .nav-meta { font-size:11px; color:rgba(255,255,255,.4); }
  .stat-bar { background:#fff; border-bottom:1px solid rgba(0,0,0,.08); padding:10px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
  .stat-n { font-size:22px; font-weight:700; }
  .stat-l { font-size:10px; color:#9CA3AF; text-transform:uppercase; letter-spacing:.06em; }
  .board-wrap { padding:16px 20px; overflow-x:auto; }
  .board { display:flex; gap:14px; }
  .section-head { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#6B7280; margin:20px 20px 10px; }
  .summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin:0 20px 20px; }
  .summary-card { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:10px; padding:14px 16px; }
  .summary-card h4 { font-size:13px; font-weight:600; margin-bottom:6px; }
  .summary-card ul { padding-left:16px; font-size:12px; color:#6B7280; line-height:1.8; }
  footer { background:#fff; border-top:1px solid rgba(0,0,0,.08); padding:8px 20px; font-size:11px; color:#9CA3AF; text-align:center; }
</style>
</head>
<body>
<div class="snap-notice">📸 Board snapshot generated ${generatedAt} — view the live board at <strong>http://macmini.local:3000</strong></div>

<nav>
  <span class="nav-logo">🏠 Nyche Family Board</span>
  <span class="nav-meta">${todayStr()}</span>
</nav>

<div class="stat-bar">
  <div class="stat"><div class="stat-n" style="color:${overdue.length?"#DC2626":"#10B981"}">${overdue.length}</div><div class="stat-l">Overdue</div></div>
  <div class="stat"><div class="stat-n" style="color:${stale.length?"#D97706":"#10B981"}">${stale.length}</div><div class="stat-l">Stalled</div></div>
  <div class="stat"><div class="stat-n" style="color:#3B82F6">${open.length}</div><div class="stat-l">Open</div></div>
  <div class="stat"><div class="stat-n" style="color:#6B7280">${done.length}</div><div class="stat-l">Done</div></div>
  ${overdue.length===0&&stale.length===0 ? `<span style="margin-left:auto;color:#10B981;font-size:13px;font-weight:600">✅ Board is clean</span>` : ""}
</div>

${overdue.length || stale.length ? `
<div class="section-head">⚡ Needs attention</div>
<div class="summary-grid">
  ${overdue.length ? `
  <div class="summary-card" style="border-left:3px solid #DC2626">
    <h4 style="color:#DC2626">🚨 Overdue (${overdue.length})</h4>
    <ul>${overdue.map(t=>`<li>${esc(t.title)} — ${daysSince(t.dueDate)}d · ${t.owner}</li>`).join("")}</ul>
  </div>` : ""}
  ${stale.length ? `
  <div class="summary-card" style="border-left:3px solid #D97706">
    <h4 style="color:#D97706">💤 Stalled (${stale.length})</h4>
    <ul>${stale.map(t=>`<li>${esc(t.title)} — ${daysSince(t.updatedAt)}d idle · ${t.owner}</li>`).join("")}</ul>
  </div>` : ""}
</div>` : ""}

<div class="section-head">📋 Full board</div>
<div class="board-wrap">
  <div class="board">
    ${renderColumns()}
  </div>
</div>

${board.vehicles.length ? `
<div class="section-head">🚗 Vehicles</div>
<div class="summary-grid">
  ${board.vehicles.map(v => `
    <div class="summary-card">
      <h4>${esc(v.nickname || v.make + " " + v.model)}</h4>
      <ul>
        <li>Registration due: ${v.registrationDue || "not set"}</li>
        <li>Insurance due: ${v.insuranceDue || "not set"}</li>
        ${v.notes ? `<li>${esc(v.notes)}</li>` : ""}
      </ul>
    </div>`).join("")}
</div>` : ""}

<footer>Nyche Family Board · Generated ${generatedAt} · Managed by Zazu</footer>
</body>
</html>`;

// ── Write output ──────────────────────────────────────────────────────────────
const dateStr  = todayStr();
const outPath  = OUT || path.join(SNAPSHOT_DIR, `board-${dateStr}.html`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");

console.log(outPath);
process.stderr.write(`✓ Snapshot saved: ${outPath}\n`);
process.stderr.write(`  Size: ${(html.length/1024).toFixed(1)} KB\n`);

// ── Open in browser (optional) ────────────────────────────────────────────────
if (OPEN) {
  const { execSync } = require("child_process");
  try {
    execSync(`open "${outPath}"`);
    process.stderr.write(`✓ Opened in browser\n`);
  } catch(e) {
    process.stderr.write(`  Could not open browser: ${e.message}\n`);
  }
}
