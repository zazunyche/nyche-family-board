**Day 38 of 50 — XML, Few-Shot, and the Prompt Engineering Toolkit**

Yesterday you learned what goes in a system prompt. Today: how to structure it so Claude actually parses it reliably.

Three tools that move the needle:

**XML tags.** Claude was trained on structured markup. Tags like `<instructions>`, `<constraints>`, and `<examples>` tell Claude "this block is X, not Y." Without them, a long prompt is prose soup. With them, it's structured configuration.

**Few-shot examples.** The most reliable way to get consistent output isn't to describe the format — it's to show it. Three input/output pairs inside `<examples>` tags will outperform a paragraph of explanation. This works because examples shift the model's probability distribution toward the pattern you've demonstrated.

**Explicit format with schema, not description.** Don't say "respond in JSON." Show the exact schema, name every field, specify allowed values, add "no surrounding text." Description leaves room for variation. Schema doesn't.

**Analogy:** Think of these like contract clauses. A well-drafted contract doesn't say "be fair" — it names every obligation precisely, gives examples of acceptable deliverables, and specifies output format. That's not bureaucracy; it's precision. Claude's prompt engineering toolkit exists for the same reason: structure makes behavior reproducible.

Tomorrow: building the agentic tool-use loop by hand.
