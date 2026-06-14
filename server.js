#!/usr/bin/env node
/**
 * Nyche Family Board — Local Web Server
 * Serves the board UI at http://localhost:3000
 * Serves board-data.json at /api/board
 * Accepts board updates via POST /api/board
 *
 * Run: node server.js
 * Keep alive: pm2 start server.js --name "family-board"
 */

const http    = require("http");
const fs      = require("fs");
const path    = require("path");
const url     = require("url");

const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "board-data.json");
const PUBLIC    = path.join(__dirname, "public");

// ── Auth ──────────────────────────────────────────────────────────────────────
// Both BOARD_BEARER_TOKEN and BOARD_GATE_PASSWORD loaded from ~/.zazu-config.
// Remote requests must provide both. Local (127.0.0.1) requests bypass auth.
function loadConfig() {
  try {
    const cfg = fs.readFileSync(path.join(process.env.HOME, ".zazu-config"), "utf8");
    const get = (key) => { const m = cfg.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m")); return m ? m[1].trim() : null; };
    return { token: get("BOARD_BEARER_TOKEN"), pass: get("BOARD_GATE_PASSWORD") };
  } catch { return { token: null, pass: null }; }
}

function isLocalRequest(req) {
  const ip = req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function checkAuth(req, res) {
  // Local requests always pass
  if (isLocalRequest(req)) return true;
  const { token, pass } = loadConfig();
  if (!token) { json(res, 503, { error: "Server not configured for remote access" }); return false; }
  const authHeader = req.headers["authorization"] || "";
  if (authHeader !== `Bearer ${token}`) {
    json(res, 401, { error: "Unauthorized" }); return false;
  }
  // Gate password check (optional second factor — send as X-Board-Pass header)
  if (pass) {
    const passHeader = req.headers["x-board-pass"] || "";
    if (passHeader !== pass) { json(res, 401, { error: "Unauthorized" }); return false; }
  }
  return true;
}

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function readBoard() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("[board] Failed to read board-data.json:", e.message);
    return null;
  }
}

function writeBoard(data) {
  // Atomic write: write to tmp then rename
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, payload) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// ── Request handler ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method   = req.method.toUpperCase();

  // Preflight
  if (method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  console.log(`[${new Date().toISOString()}] ${method} ${pathname}`);

  // ── API: GET /api/board ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/board") {
    if (!checkAuth(req, res)) return;
    const board = readBoard();
    if (!board) { json(res, 500, { error: "Could not read board-data.json" }); return; }
    json(res, 200, board);
    return;
  }

  // ── API: POST /api/board ─────────────────────────────────────────────────
  // Accepts a full board object and writes it atomically
  if (method === "POST" && pathname === "/api/board") {
    if (!checkAuth(req, res)) return;
    try {
      const incoming = await collectBody(req);
      if (!incoming || !incoming.tasks) {
        json(res, 400, { error: "Invalid board payload — must include tasks array" });
        return;
      }
      incoming.meta.lastUpdated    = new Date().toISOString();
      incoming.meta.lastUpdatedBy  = incoming._actor || "API";
      delete incoming._actor;
      writeBoard(incoming);
      console.log(`[board] Board saved by ${incoming.meta.lastUpdatedBy}`);
      json(res, 200, { ok: true, savedAt: incoming.meta.lastUpdated });
    } catch (e) {
      console.error("[board] POST error:", e.message);
      json(res, 400, { error: e.message });
    }
    return;
  }

  // ── API: GET /api/briefing ───────────────────────────────────────────────
  // Returns a pre-computed briefing object for Zazu to consume
  if (method === "GET" && pathname === "/api/briefing") {
    if (!checkAuth(req, res)) return;
    const board = readBoard();
    if (!board) { json(res, 500, { error: "Could not read board" }); return; }
    json(res, 200, buildBriefing(board));
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────
  let filePath = path.join(PUBLIC, pathname === "/" ? "index.html" : pathname);
  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Fall through to index.html for SPA routing
      filePath = path.join(PUBLIC, "index.html");
      fs.readFile(filePath, (err2, data) => {
        if (err2) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(data);
      });
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ── Briefing builder (mirrors board-tools/read.js logic) ─────────────────────
function buildBriefing(board) {
  const today = new Date().toISOString().split("T")[0];
  const staleThreshold = board.settings?.staleThresholdDays || 7;

  const daysSince = (dateStr) => {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  const open     = board.tasks.filter(t => t.stage !== "DONE");
  const overdue  = open.filter(t => t.dueDate && t.dueDate < today && !t.snoozedUntil);
  const stale    = open.filter(t => !overdue.includes(t) && daysSince(t.updatedAt) >= staleThreshold && !t.snoozedUntil);
  const snoozed  = open.filter(t => t.snoozedUntil && t.snoozedUntil > today);

  const inWeek   = open.filter(t => {
    if (!t.dueDate || overdue.includes(t)) return false;
    const diff = (new Date(t.dueDate) - new Date(today)) / 86400000;
    return diff >= 0 && diff <= 7;
  });

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      open: open.length,
      overdue: overdue.length,
      stale: stale.length,
      dueThisWeek: inWeek.length,
      done: board.tasks.filter(t => t.stage === "DONE").length,
    },
    overdue:  overdue.map(t => ({ id: t.id, title: t.title, owner: t.owner, dueDate: t.dueDate, daysOverdue: daysSince(t.dueDate), priority: t.priority, notes: t.notes })),
    stale:    stale.map(t  => ({ id: t.id, title: t.title, owner: t.owner, stage: t.stage, daysIdle: daysSince(t.updatedAt), priority: t.priority, notes: t.notes })),
    dueThisWeek: inWeek.map(t => ({ id: t.id, title: t.title, owner: t.owner, dueDate: t.dueDate })),
    snoozed:  snoozed.map(t => ({ id: t.id, title: t.title, snoozedUntil: t.snoozedUntil })),
    dadTasks: open.filter(t => t.owner === "DAD" || t.owner === "BOTH").map(t => ({ id: t.id, title: t.title, stage: t.stage, dueDate: t.dueDate, priority: t.priority })),
    momTasks: open.filter(t => t.owner === "MOM" || t.owner === "BOTH").map(t => ({ id: t.id, title: t.title, stage: t.stage, dueDate: t.dueDate, priority: t.priority })),
  };
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏠 Nyche Family Board`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   Board data:      ${DATA_FILE}`);
  console.log(`   Public dir:      ${PUBLIC}`);
  console.log(`\n   API endpoints:`);
  console.log(`   GET  /api/board     — full board JSON`);
  console.log(`   POST /api/board     — write board JSON`);
  console.log(`   GET  /api/briefing  — pre-computed briefing`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
