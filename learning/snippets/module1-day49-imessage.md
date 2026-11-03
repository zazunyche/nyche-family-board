**AI Agents Day 49 of 50 · Mini-Module 2.4**

Your agent passed evals in January. It's August. Somewhere between then and now — a model update, a new supplier invoice format, a system prompt copy-pasted from the wrong version — behavior degraded. You don't know, because you ran your evals once, before launch.

Continuous evals run the same test cases against production traffic on a schedule. Not once. Always. You build a golden dataset: representative inputs, expected outputs, scoring criteria. You run it weekly, or after every model version change, or both. You track scores over time. If accuracy drops below your threshold, you get an alert — not a support ticket from a supplier.

For Earnventory: run your invoice-summarization eval every Monday. Compare this week's score against last week's baseline. If the delta exceeds 5%, investigate before your customers do.

**Analogy:** A hospital doesn't audit medication dispensing once at opening and then trust it forever. They run recurring audits — same cases, fresh checks — because the conditions around a system change even when the system itself hasn't.

Tomorrow (Day 50, the finale): we audit Zazu's full architecture — what it actually guarantees, and where you'd harden it for Earnventory.
