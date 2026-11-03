# AI Agents Day 73: Tool Use in the Earnventory Context

Over the last seven days, you've built up every individual component: the JSON schema Claude reads to understand a tool, the handler your code executes when Claude calls it, the `tool_result` format that closes the loop, the difference between client-side and server-side tools, MCP as a portability layer, parallel vs. sequential call strategies, and the minimal-surface security principle. The mechanics are solid.

Today is different. Today we stop looking at pieces and look at the whole thing at once — a real Earnventory agent, designed correctly from scratch, where every decision has a reason.

---

## The Starting Point: Role Before Tools

This is the mistake most people make. They think about what tools the agent *could* use and build a list. The right order is inverted: define the role precisely, then derive the minimum tool set the role requires to do its job.

Here's what that distinction looks like in practice.

**Wrong approach:** "I want an Earnventory agent. What tools might it need? Inventory lookup — yes. Supplier pricing — yes. Order creation — sure. Email notification — probably. Customer data — might be useful later."

You've just built a general-purpose Earnventory interface. It can do everything, which means it can accidentally do everything.

**Right approach:** "This agent monitors for low-stock conditions and drafts reorder recommendations for human review. What does that specific role require?" Now you have a constraint. Derive tools from the constraint.

The role defines the blast radius. If the agent's purpose is read-and-flag, every write tool you add is an unnecessary risk. If the agent's purpose is draft-and-notify, tools that actually submit orders are out of scope. Scope is architectural, not behavioral — the agent literally cannot do what you haven't given it tools for.

---

## Three Layers of Tool Design

Designing a production tool set means thinking across three layers simultaneously.

### Layer 1: Read vs. Write vs. Irreversible

Not all tools carry the same risk. Group them by consequence:

```
READ TOOLS — low risk, freely callable
  What they do: retrieve state, never change it
  Risk if misused: the agent reads the wrong thing
  Mitigation: still scope parameters narrowly

DRAFT-WRITE TOOLS — medium risk, human checkpoint
  What they do: create a pending/reversible record
  Risk if misused: the agent creates draft noise
  Mitigation: human reviews before anything executes

COMMIT TOOLS — high risk, irreversible
  What they do: send emails, submit orders, delete records
  Risk if misused: real-world consequences that are hard to undo
  Mitigation: keep these out of automated agents entirely, or behind explicit human approval gates
```

This isn't just security hygiene — it's how you scale trust incrementally. An agent earns the right to commit tools by demonstrating reliable behavior on read and draft tools first.

### Layer 2: Narrow Scope Within Each Tool

Even inside a read tool, scope matters. Compare these two schema designs:

```
Broad (avoid this):
get_inventory(filters: object) → returns matching records

Narrow (prefer this):
get_inventory_level(sku: str) → {level: int, unit: str, last_updated: str}
```

The broad version lets Claude pass arbitrary filters. The narrow version takes exactly one parameter, returns exactly one thing, and leaves nothing to interpret. When Claude gets the wrong answer, the narrow version is trivially debuggable — you know exactly what was asked and what was returned.

### Layer 3: Scope the Output, Not Just the Input

Your handler controls what Claude sees. If `get_supplier_pricing` queries a table with 40 columns, don't return all 40 columns. Return exactly what Claude needs to complete the task:

```python
# Don't do this
return cursor.fetchone()  # entire row, including fields Claude doesn't need

# Do this
row = cursor.fetchone()
return {
    "price": row["unit_price"],
    "currency": row["currency_code"],
    "lead_days": row["standard_lead_time_days"],
    "minimum_order": row["min_order_quantity"]
}
```

Irrelevant data in tool results is wasted tokens and potential confusion. Return only what the next reasoning step requires.

---

## The Earnventory Reorder-Monitoring Agent: Full Design

Here's what a correctly designed reorder-monitoring agent looks like end to end.

**Agent role:** Monitor inventory levels. Identify SKUs that have fallen below their reorder threshold. Draft purchase orders for the lowest-cost qualifying supplier. Flag for human review before any order is placed.

```
TOOL SET: Earnventory Reorder Monitor
=======================================

READ-ONLY (agent calls freely)
├── get_inventory_level(sku: str)
│     → {level: int, unit: str, last_updated: str}
│
├── get_reorder_threshold(sku: str)
│     → {threshold: int, strategy: "just_in_time" | "safety_stock" | "fixed"}
│
├── get_supplier_pricing(sku: str, supplier_id: str)
│     → {price: float, currency: str, lead_days: int, min_order_qty: int}
│
└── list_active_suppliers(sku: str)
      → [{supplier_id: str, name: str, tier: "primary" | "backup"}]

DRAFT-WRITE (creates a reversible record; human reviews)
└── create_draft_purchase_order(sku: str, supplier_id: str, quantity: int)
      → {draft_id: str, estimated_total: float, review_url: str}

NOTIFICATION (low-stakes write; flags for human attention)
└── flag_for_review(sku: str, reason: str, draft_id: str | None)
      → {ticket_id: str}

EXPLICITLY EXCLUDED
├── send_purchase_order()       → irreversible; human action only
├── update_inventory_level()    → different agent's role
├── delete_sku()               → human action only
└── get_customer_data()        → different domain, out of scope
```

Six tools. Four read, one draft-write, one notification. The agent can complete its entire defined job within this set. It cannot accidentally send an order, modify inventory records, or touch customer data — not because we're trusting Claude to behave, but because those tools don't exist in the context window.

---

## How the Workflow Actually Flows

With this tool set, a real reorder check looks like this:

```
Turn 1 — Sequential:
  Claude calls: get_all_skus_below_threshold()
  [Scans inventory, returns: [SKU-482, SKU-119, SKU-771]]

Turn 2 — Parallel (three independent lookups):
  Claude calls simultaneously:
    get_inventory_level("SKU-482")
    get_inventory_level("SKU-119")
    get_inventory_level("SKU-771")
  [All three return. Claude now has current levels for all three.]

Turn 3 — Parallel (per-SKU supplier lookup):
  Claude calls simultaneously:
    list_active_suppliers("SKU-482")
    list_active_suppliers("SKU-119")
    list_active_suppliers("SKU-771")
  [Returns supplier lists. Claude identifies best candidates.]

Turn 4 — Parallel (pricing for top supplier per SKU):
  Claude calls simultaneously:
    get_supplier_pricing("SKU-482", "SUP-019")
    get_supplier_pricing("SKU-119", "SUP-007")
    get_supplier_pricing("SKU-771", "SUP-019")
  [Returns pricing + lead times. Claude calculates quantities.]

Turn 5 — Sequential (draft creation — not parallelized):
  Claude calls:
    create_draft_purchase_order("SKU-482", "SUP-019", 200)
    → {draft_id: "DPO-2026-0914-001", review_url: "..."}
    create_draft_purchase_order("SKU-119", "SUP-007", 500)
    → {draft_id: "DPO-2026-0914-002", review_url: "..."}

Turn 6 — Parallel (notifications):
  Claude calls simultaneously:
    flag_for_review("SKU-482", "Below threshold, draft created", "DPO-2026-0914-001")
    flag_for_review("SKU-119", "Below threshold, draft created", "DPO-2026-0914-002")
    flag_for_review("SKU-771", "Below threshold, no qualifying supplier found", None)
```

Notice the pattern: reads parallelized heavily, writes sequential (to avoid race conditions on draft IDs), notifications parallelized again. Claude infers these dependencies from context — you don't configure them explicitly in your tool definitions.

---

## Error Design: What Each Tool Returns When Things Go Wrong

The agentic loop can only reason about what appears in `tool_result`. If your handler throws an unhandled exception, Claude gets nothing useful to work with. Design error responses with the same care as success responses:

```python
def get_supplier_pricing(sku: str, supplier_id: str) -> dict:
    try:
        row = db.query(...)
        if not row:
            return {
                "error": True,
                "message": f"No pricing found for SKU {sku} from supplier {supplier_id}",
                "action": "try list_active_suppliers to find alternatives"
            }
        return {
            "price": row.unit_price,
            "currency": row.currency_code,
            "lead_days": row.lead_time_days,
            "min_order_qty": row.minimum_quantity
        }
    except TimeoutError:
        return {
            "error": True,
            "message": "Pricing database timed out. Retry or use cached data.",
            "cached_price": cache.get(f"{sku}:{supplier_id}"),
            "cache_age_hours": cache.age(f"{sku}:{supplier_id}")
        }
```

The key principle: error results should tell Claude what happened AND what it can do next. "No pricing found — try `list_active_suppliers`" gives Claude an actionable path. A stack trace or empty response gives it nothing.

---

## Where MCP Fits in This Design

The tool set above is defined for a specific agent. But Earnventory will eventually have more than one agent: the reorder monitor, a pricing analytics agent, a customer-facing inventory query tool.

The read tools — `get_inventory_level`, `get_supplier_pricing`, `list_active_suppliers` — are useful across all of them. Rather than copy-pasting the tool definitions into each agent's code, you define these as an MCP server. Any agent that connects gets immediate access to the full read layer.

The write tools stay private. `create_draft_purchase_order` belongs to the reorder monitor and nothing else. It doesn't go on the MCP server — it stays hardcoded in the agent that's authorized to use it.

```
Earnventory MCP Server (shared read layer):
  ├── get_inventory_level
  ├── get_reorder_threshold
  ├── get_supplier_pricing
  └── list_active_suppliers

Per-agent private tools (not shared):
  Reorder Monitor:   create_draft_purchase_order, flag_for_review
  Analytics Agent:   generate_pricing_report, export_margin_summary
  Customer Tool:     check_availability_by_location (different schema, different trust)
```

Shared reads. Private writes. Clear separation.

---

## The Trust Escalation Path

Don't design for full automation on day one. Design for a trust escalation path:

**v1 — Read-only monitor:** The agent identifies reorder candidates and sends a summary email. No drafts, no action. Just observation. You learn what the agent sees and whether its judgment is sound.

**v2 — Draft + flag:** The agent creates draft orders and flags them. Humans review and click "approve" or "reject." You learn whether the agent's proposed orders are reasonable — right quantities, right suppliers, right timing.

**v3 — Auto-approve small orders:** After weeks of demonstrated accuracy on drafts, you add a rule: orders under $500 with a primary-tier supplier auto-approve without human review. You've earned this by watching the agent perform.

**v4 — Broader automation:** As the threshold earns trust, you expand it. The agent's scope grows with evidence, not assumption.

This is exactly how you'd onboard a new employee who manages vendor relationships. You wouldn't hand them a purchase card on day one. Same principle.

---

## Bringing It Back: The Six Lessons, Applied

Every decision in this design traces back to a specific lesson from this past week:

| Lesson | Where it shows up |
|--------|-------------------|
| Tool schemas must be clear and narrow | Each tool takes minimal parameters, returns minimal fields |
| Client-side tools execute in your code | Every tool here is developer-executed; no Anthropic-hosted tools needed |
| Three-layer handler: schema + handler + result | Every tool has clean success + error responses |
| MCP for portability | Read tools go on the MCP server; write tools stay private |
| Parallel vs. sequential | Reads parallelized; draft writes sequential; notifications parallelized |
| Minimal surface area | Six tools, not twenty; irreversible actions excluded entirely |

This is what good agent tool design looks like: not a comprehensive API surface, but a minimal, purposeful set of capabilities matched exactly to a well-defined role.

---

## What's Next

Tomorrow we take the next step: if a single agent with this tool set eventually hits limits — context overflow, task complexity, need for parallelization across domains — what does the architecture look like when you add a second agent? That's the beginning of multi-agent systems, which will be the focus of the next stretch of the curriculum.

---

## Resources

- **Anthropic Tool Use Documentation** — covers the full schema format, `tool_result` structure, parallel tool calls, and error handling in detail: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
- **MCP Specification and Server Examples** — the official MCP documentation with examples of how to define and deploy MCP servers for production use: https://modelcontextprotocol.io/introduction
