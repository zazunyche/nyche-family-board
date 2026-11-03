Day 27 of 50 — Mini-Module 2.1, Day 8 of 8

**Tool use in the Earnventory context**

Eight days in. You know how tools work mechanically, how to design them well, how MCP standardizes them, how to chain them, and how to think about trust. Today: what the final tool set actually looks like for a real Earnventory agent.

The shape of it:

**Read (call freely — no side effects):**
→ `get_sku_stock(sku_id)` — current inventory
→ `get_supplier_pricing(supplier_id, skus)` — live prices
→ `search_invoices(supplier_id, days_back)` — transaction history
→ `calculate_days_of_stock(sku_id, velocity)` — time until stockout

**Write (stage it, don't execute it):**
→ `create_draft_po(supplier_id, line_items, notes)` — draft only, not sent
→ `flag_sku_for_review(sku_id, reason, urgency)` — human queue

**Locked (agent never gets these):**
→ `send_purchase_order(po_id)` — human-only
→ `release_payment(invoice_id)` — human-only

The agent does all the analysis. Humans make the commitments.

**The analogy:** A surgical resident can diagnose, prep, and assist. But the attending closes. Expertise enables the work; authority limits the commitment.

Tomorrow: Mini-Module 2.2 begins — why one agent hits a ceiling, and how multi-agent systems break through it.
