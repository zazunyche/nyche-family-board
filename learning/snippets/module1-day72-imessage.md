AI Agents Day 72: Trust, Permissions, and the Minimal-Surface Principle

**Concept:** When you give an agent a tool, you're granting it a permission — permanently, for the duration of that session. The agent can call that tool whenever its reasoning leads it there. If that reasoning gets hijacked (a supplier's email contains hidden instructions; a tool result embeds a command), any tool the agent has access to becomes a potential attack vector. The minimal-surface principle: give agents only the tools they actually need for the task, scoped as narrowly as possible. An agent that only reads inventory should have `get_inventory`, not `delete_inventory` it "probably won't use."

**Example:** An Earnventory supplier-monitoring agent reads emails and checks stock. If you also give it `send_email` and `create_purchase_order` "for convenience later," a prompt injection buried in a supplier's PDF attachment could instruct it to generate fraudulent orders. Strip those tools from the monitoring agent — it physically cannot take that action, regardless of what any injected instruction tells it. The constraint is architectural, not behavioral.

**Analogy:** Minimal tool surface is like a sous chef's knife kit — a skilled professional brings exactly the knives needed for today's menu, not every blade in the kitchen. Fewer tools, fewer things that can go wrong.

Tomorrow: putting it all together — what a practical Earnventory agent tool set looks like from scratch.
