# AI Agents Day 27: Tool use in the Earnventory context

**Mini-Module 2.1 — Tools and Function Calling | Day 8 of 8**

---

Eight days ago you learned that tool calls are structured text — that Claude outputs a `tool_use` block, your code executes, and you return a `tool_result`. Since then you've covered tool description craft, client vs. server-side tools, MCP standardization, parallel and sequential chains, and the minimal-surface security principle.

Today is the synthesis. What does all of that look like when applied to an actual Earnventory inventory agent? Not a toy example, not a demo — a tool set you could ship to a system that touches real suppliers and real money.

---

## The Design Constraint: Earnventory Is Not a Chatbot

The framing matters. When you build a Claude-powered search assistant or a Q&A feature, the worst case for a mistake is a bad answer. You correct it, the user tries again.

When you build an agent against Earnventory, the worst case for a mistake is a purchase order sent to the wrong supplier for the wrong quantity at the wrong price. That mistake has financial and relationship consequences. It may not be correctable in time. The supplier may already be processing the order before you catch the error.

This asymmetry — between "wrong answer" risk and "wrong action" risk — is what drives every tool design decision in this email. You're designing an agent with real authority over a business process, not a system that gives advice.

---

## The Three-Tier Architecture

The most useful mental model for Earnventory tool design is a consequence-based hierarchy. Every tool belongs to one of three tiers, and tier membership determines how freely the agent can call it.

```
┌────────────────────────────────────────────────────────────┐
│  TIER 1 — READ TOOLS                                        │
│  Safe. Idempotent. No external effects.                     │
│  The agent can call these freely and repeatedly.            │
├────────────────────────────────────────────────────────────┤
│  TIER 2 — INTERNAL WRITE TOOLS                              │
│  Modify internal state only. Logged. Reversible.            │
│  Agent stages work; a human or approval step finalizes it.  │
├────────────────────────────────────────────────────────────┤
│  TIER 3 — EXTERNAL / IRREVERSIBLE TOOLS                     │
│  Cross the system boundary. Hard or impossible to undo.     │
│  Not in the agent's tool set. Human-only.                   │
└────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Read Tools

These are the green-button tools. Call them ten times — you get the same result (assuming no concurrent writes). If the agent retries a Tier 1 call after a failure, nothing bad happens. Design them to fail gracefully and be idempotent by default.

```json
{
  "name": "get_sku_stock",
  "description": "Returns current on-hand inventory for a given SKU. Read-only — safe to call multiple times. Returns null if SKU not found.",
  "input_schema": {
    "type": "object",
    "properties": {
      "sku_id": {
        "type": "string",
        "description": "The SKU identifier (e.g., 'WN-RIES-750')"
      }
    },
    "required": ["sku_id"]
  }
}
```

The full Tier 1 manifest for a reorder monitoring agent:

```
✅ get_sku_stock(sku_id)
   → Returns { on_hand: int, unit: string, last_updated: ISO8601 }

✅ get_reorder_threshold(sku_id)
   → Returns { min_stock: int, reorder_qty: int, supplier_id: string }

✅ get_supplier_pricing(supplier_id, sku_ids: list[str])
   → Returns list of { sku_id, unit_cost, currency, valid_until }

✅ get_supplier_lead_time(supplier_id)
   → Returns { avg_days: int, min_days: int, max_days: int }

✅ calculate_days_of_stock(sku_id, daily_velocity: float)
   → Returns { days_remaining: float, stockout_date: ISO8601 }

✅ search_pending_pos(supplier_id, status: "draft"|"sent"|"all")
   → Returns list of pending purchase orders — prevents duplicate ordering
```

One design note on `calculate_days_of_stock`: you might be tempted to make this pure logic in the system prompt rather than a tool ("just divide inventory by velocity"). Resist that. A tool call is logged. A tool result is inspectable. An arithmetic operation done silently in the model's reasoning is neither. Make the computation explicit and traceable.

---

## Tier 2: Internal Write Tools

These tools modify internal state — they create records, update queues, log recommendations. But they don't cross the boundary to external parties. Mistakes here are recoverable: you can delete a draft PO, remove a flag, clear a note.

The key design pattern for Tier 2: **propose, don't commit.**

```json
{
  "name": "create_draft_po",
  "description": "Creates a draft purchase order in the review queue. The PO is NOT sent to the supplier — it requires human approval before transmission. Call this when analysis confirms a reorder is warranted and you want to stage the request. Include your reasoning in the notes field.",
  "input_schema": {
    "type": "object",
    "properties": {
      "supplier_id": { "type": "string" },
      "line_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "sku_id":     { "type": "string" },
            "quantity":   { "type": "integer" },
            "unit_cost":  { "type": "number" }
          },
          "required": ["sku_id", "quantity"]
        }
      },
      "notes": {
        "type": "string",
        "description": "Agent's reasoning: why this reorder is recommended, key data points used, urgency level."
      }
    },
    "required": ["supplier_id", "line_items"]
  }
}
```

Notice the `notes` field. This is intentional. You want the agent to document its reasoning inside the draft PO, so the human reviewer sees not just "reorder 500 units" but "current stock: 3 days of supply at current velocity; lead time: 14 days; stockout projected 2026-07-17 without reorder; unit cost $4.20 vs. last order $4.10 — slight increase, still within margin threshold." That context is how a human makes a fast, informed approval decision.

Full Tier 2 manifest:

```
⚠️  create_draft_po(supplier_id, line_items, notes)
    → Stages PO for review; returns draft_id

⚠️  flag_sku_for_review(sku_id, reason, urgency: "low"|"medium"|"high")
    → Routes SKU to human attention queue; returns ticket_id

⚠️  log_reorder_recommendation(sku_id, recommended_qty, rationale)
    → Immutable audit log entry; returns log_id
```

The third tool — `log_reorder_recommendation` — is worth calling even when you're also creating a draft PO. It creates a permanent record of every recommendation the agent made, regardless of what the human decides. Six months later, when you want to evaluate the agent's accuracy, that log is your ground truth.

---

## Tier 3: Locked Panel

These tools do not appear in the agent's tool definitions. Full stop.

```
🔒 send_purchase_order(po_id)
   → Emails commitment to supplier. Irreversible once supplier acknowledges.

🔒 release_payment(invoice_id, amount)
   → Initiates payment. Financial commitment.

🔒 send_supplier_rejection(supplier_id, product_id, reason)
   → External communication with relationship impact.

🔒 update_public_pricing(sku_id, new_price)
   → Visible to customers immediately.
```

When a draft PO is approved by a human, your application code calls `send_purchase_order` directly — not the agent. The agent never has this capability. This is the hard architectural guarantee: no prompt injection, no model error, no unexpected reasoning path can trigger an order. The execution gate is your code, not the model's judgment.

---

## The Complete Tool Manifest

```
┌──────────────────────────────────────────────────────────────┐
│  EARNVENTORY REORDER AGENT — COMPLETE TOOL MANIFEST           │
│                                                              │
│  TIER 1 (READ — call freely)                                 │
│  ✅ get_sku_stock(sku_id)                                     │
│  ✅ get_reorder_threshold(sku_id)                             │
│  ✅ get_supplier_pricing(supplier_id, sku_ids)                │
│  ✅ get_supplier_lead_time(supplier_id)                       │
│  ✅ calculate_days_of_stock(sku_id, daily_velocity)           │
│  ✅ search_pending_pos(supplier_id, status)                   │
│                                                              │
│  TIER 2 (INTERNAL WRITE — stage, don't execute)              │
│  ⚠️  create_draft_po(supplier_id, line_items, notes)          │
│  ⚠️  flag_sku_for_review(sku_id, reason, urgency)             │
│  ⚠️  log_reorder_recommendation(sku_id, qty, rationale)       │
│                                                              │
│  TIER 3 (LOCKED — human-only, not in agent's toolset)        │
│  🔒 send_purchase_order(po_id)                                │
│  🔒 release_payment(invoice_id, amount)                       │
│  🔒 send_supplier_rejection(...)                              │
└──────────────────────────────────────────────────────────────┘
```

---

## What a Single Run Looks Like

With this tool set, here's how the agent executes a reorder monitoring task:

```
System prompt: "You are an Earnventory reorder monitoring agent.
Check all active SKUs. For any with days_of_stock < lead_time,
create a draft PO with your reasoning. Flag any SKU below 5
days of stock as high urgency."

Turn 1:
  REASON: I need to check all active SKUs. I'll start by pulling
          a list of SKUs with their current stock and thresholds.
  CALL:   get_sku_stock("WN-RIES-750")
  RESULT: { on_hand: 48, unit: "bottles", last_updated: "2026-07-13" }

Turn 2:
  CALL:   get_reorder_threshold("WN-RIES-750")
  RESULT: { min_stock: 120, reorder_qty: 240, supplier_id: "SUP-VIN-A" }

Turn 3:
  CALL:   calculate_days_of_stock("WN-RIES-750", daily_velocity=12.5)
  RESULT: { days_remaining: 3.84, stockout_date: "2026-07-17" }

Turn 4:
  CALL:   get_supplier_lead_time("SUP-VIN-A")
  RESULT: { avg_days: 14, min_days: 10, max_days: 21 }

Turn 5:
  REASON: 3.84 days of stock vs. 14-day lead time. Critical stockout
          risk. Need to check for any POs already in flight.
  CALL:   search_pending_pos("SUP-VIN-A", status="all")
  RESULT: []   ← no pending orders

Turn 6:
  CALL:   get_supplier_pricing("SUP-VIN-A", ["WN-RIES-750"])
  RESULT: { sku_id: "WN-RIES-750", unit_cost: 4.20, currency: "USD" }

Turn 7:
  CALL:   create_draft_po(
            supplier_id="SUP-VIN-A",
            line_items=[{ sku_id: "WN-RIES-750", quantity: 240, unit_cost: 4.20 }],
            notes="URGENT: 3.84 days of stock remaining at current velocity (12.5 units/day).
                   Supplier lead time 14 days avg — stockout projected 2026-07-17.
                   No POs in flight. Recommending 240 units (standard reorder qty) at
                   $4.20/unit ($1,008 total). Flag for immediate approval."
          )
  RESULT: { draft_id: "PO-DRAFT-9183", status: "pending_review" }

Turn 8:
  CALL:   flag_sku_for_review("WN-RIES-750", reason="Stockout in <4 days", urgency="high")
  RESULT: { ticket_id: "TKT-2291" }

  STOP: All required actions taken. Draft PO PO-DRAFT-9183 created.
        High-urgency flag TKT-2291 raised. Awaiting human approval.
```

Notice what the agent never did: it never called `send_purchase_order`. It drafted, flagged, and stopped. The approval gate is outside the agent's reach.

---

## The Two Failure Modes to Design Against

**Too much power:** You give the agent `send_purchase_order` because approvals feel like friction. Six weeks later, a misread velocity figure triggers an order for 2,400 units instead of 240. The supplier confirms. You're committed. This is the failure mode that costs real money.

**Too little power:** You're so cautious the agent can only read data and write a text summary to a Slack channel. A human then has to manually do everything the agent calculated. You've built a reporting dashboard, not an agent. The efficiency gain approaches zero.

The right design — the one described in this email — sits between those poles. The agent handles 100% of the analytical work. It creates the PO artifact, with reasoning, ready for a human to approve in one click. That human spends 30 seconds on a decision that would have taken 15 minutes of manual analysis. That's the actual productivity gain.

---

## Closing Mini-Module 2.1

In eight days, you've gone from "what is a tool call" to "how do I design a production-grade tool set for a business-critical system." The path was:

- **Day 20:** Tool calls are structured text — Claude outputs intent, you execute
- **Day 21:** Description quality drives model behavior — be specific, define what the tool does NOT do
- **Day 22:** Client vs. server-side — understand who executes and what that costs
- **Day 23:** The `get_supplier_pricing` end-to-end — schema, handler, error cases
- **Day 24:** MCP — one tool definition, usable across models and frameworks
- **Day 25:** Parallel and sequential chains — design for efficiency without false concurrency
- **Day 26:** Trust and minimal surface — prompt injection, the OWASP LLM risks, least privilege
- **Day 27:** Applied synthesis — the complete Earnventory tool manifest

Tomorrow, Mini-Module 2.2 begins: **Multi-Agent Systems**. The premise: a single agent with a well-designed tool set can accomplish a lot. But there's a ceiling. Some tasks are too long for one context window, too complex for one agent, or too parallelizable for sequential execution. Multi-agent systems are how you break through that ceiling.

We'll start with the question that motivates everything: why isn't one agent enough?

---

## Free Resources

- **Anthropic's tool use best practices** — https://docs.anthropic.com/en/docs/build-with-claude/tool-use/best-practices-for-tool-definitions  
  Anthropic's own guide for writing tool definitions that the model uses reliably. Covers description specificity, parameter naming, handling ambiguous inputs, and what makes a tool "Claude-friendly." Read alongside what you built on Day 21 — you'll see exactly why each recommendation exists.

- **Anthropic's guide on building effective agents** — https://www.anthropic.com/research/building-effective-agents  
  The engineering blog post that introduced many of the architectural patterns covered in this mini-module. Specifically relevant now: the sections on tool design philosophy, human-in-the-loop patterns, and minimal footprint. This is the reference document many practitioners use when designing production agent systems.

---

*Day 28 tomorrow: Mini-Module 2.2 — Multi-Agent Systems. We start with the scalability ceiling of single-agent designs and why breaking through it requires a different architecture entirely.*
