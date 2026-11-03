Day 42 of 50 | Mini-Module 2.3 | Building an Agent from Scratch

**The problem:** Claude is probabilistic — it might return `items` one run, `line_items` the next, `products` a third. Your Earnventory code crashes at 2am because a field name changed. Structured outputs solve this.

**Two techniques:**

*Strict tool schema* — Define your tool's `input_schema` with `"required": [...]` and `"additionalProperties": false`. Claude can't invent new fields, can't omit required ones, and types are enforced. The schema *is* the contract.

*Output format prompting* — When Claude returns data in its message (not via a tool call), tell it explicitly in the system prompt: "Respond with a JSON object with exactly these keys: `{sku, current_stock, reorder_threshold, status}`. No prose. No markdown." Include a concrete example. Explicitly forbid what you don't want.

Together, these narrow the space of valid tokens at generation time — you're not fighting the model's probabilistic nature, you're constraining it.

**Analogy:** It's like swapping a blank page for a pre-printed DMV form. The form has labeled boxes — same structure every time, regardless of who fills it out.

Tomorrow: a complete Earnventory agent, system prompt to output, in ~200 lines.
