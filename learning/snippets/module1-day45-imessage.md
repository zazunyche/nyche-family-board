**AI Agents Day 45: What Is an Eval, and Why You Need One Before Launch**

Yesterday's math showed the problem: reliability compounds downward across steps. Today's topic is the solution: **evals**.

An **eval** (evaluation) is a structured, repeatable test suite for your agent — the equivalent of unit tests, but for model behavior. Instead of `assert add(2, 3) == 5`, you're asserting: "Given this supplier invoice, the agent correctly extracts SKU, total, and due date — and doesn't hallucinate anything that isn't there."

Three things make an eval useful:
1. **Representative inputs** — real cases, including the messy edge cases
2. **Clear scoring criteria** — explicit rubric for what "correct" looks like
3. **Regression detection** — run it before every model update, prompt change, and deploy

Earnventory example: Before shipping your invoice summarizer, you build 50 test invoices with known ground truth. You run the agent against all 50 before every change. Accuracy drops from 96% to 88% after a prompt edit? You catch it in 10 minutes — not three weeks later when a supplier flags a bad PO.

**Analogy:** An eval is the pre-flight checklist your agent runs before every deployment. No pilot skips it because yesterday's flight went fine.

Tomorrow: the seven failure modes that kill agent projects in production.
