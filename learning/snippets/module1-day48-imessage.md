**AI Agents Day 48: Minimal Footprint and the Reversibility Principle**

Every action your agent takes exists on a spectrum: delete vs. soft-delete, send vs. draft, commit vs. stage, execute vs. queue. The reversibility principle says: **when the agent has a choice, default to the action it can take back.**

This isn't timidity — it's engineering. A miscalculation in a reversible action costs a minute to undo. The same mistake in an irreversible action can cost a supplier relationship, a sent payment you can't recall, or a 3am email that's already in 200 inboxes.

Minimal footprint is the structural version: give agents only the permissions the current task actually requires. If your invoice-reading agent doesn't need to send emails, don't give it the email tool. Scope = attack surface.

Earnventory example: your reorder agent should draft the PO and queue it for your approval — not submit it directly. Add the "submit" capability after you've audited 50 correct drafts.

**Analogy:** A surgeon doesn't cut anything they don't need to cut. Scope creep in the OR has consequences that can't be undone. Your agent's authorization surface is your OR.

Tomorrow: how agent behavior drifts silently over time — and how to catch it before it costs you.
