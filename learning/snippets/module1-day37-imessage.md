**Day 37 of 50 — Writing a System Prompt That Actually Works**

A system prompt isn't a greeting — it's your agent's operating configuration. Four things make the difference:

**Weak:** "You are a helpful assistant."

**Strong:** "You are an inventory analyst for Earnventory. Identify low-stock SKUs and draft reorder recommendations. Never recommend orders over $50K without flagging for human review. Always respond in this JSON: {action, sku, quantity, reason, confidence, requires_human_review}. Today is {current_date}."

Same model. Same API call. Completely different behavior. The strong version is safe to deploy. The weak one is a liability.

The four elements every system prompt needs: (1) precise role definition, (2) explicit constraints, (3) strict output format, (4) runtime context injection.

**Analogy:** A system prompt is the employee handbook + job description + first-day training session combined. "Be helpful" is the job posting. The handbook says what you can authorize alone, what you escalate, and exactly what paperwork to fill out. That's the difference between a chatbot and an agent.

Tomorrow: the prompt engineering toolkit — XML tags, few-shot examples, and why structure beats politeness every time.
