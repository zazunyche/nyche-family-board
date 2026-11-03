AI Agents Day 81: Error Recovery — Pipelines That Degrade Gracefully

**Concept:** Subagent failures come in three types, and each needs a different response.

- **Hard failure**: exception, timeout, API error. Catch it, log it, fall back or escalate.
- **Soft failure**: output returned — but wrong. The dangerous one. The orchestrator can't tell by looking. Response: validate before trusting.
- **Partial failure**: correct but incomplete — missing fields, truncated, off-format. Response: decide if the partial result is usable at all before propagating it.

**Example:** Your Earnventory invoice pipeline calls a margin analysis subagent. It returns `"margin_impact": "significant"` — a string, not the float your schema expects. Three steps later, your approval logic divides by it and crashes. Or worse: silently rounds to zero and auto-approves. Validation at the subagent output boundary catches this before it travels. The orchestrator never sees garbage — it sees a `VALIDATION_FAILED` signal and escalates.

**Design rule:** Every subagent output crosses an inspection checkpoint before entering the orchestrator's reasoning. Never trust unconditionally.

**Analogy:** Aircraft triple-redundant computers. If one reading contradicts the other two, it's discarded. The plane flies on two. Graceful degradation — by design, not by accident.

Tomorrow: retry budgets — when to try again, when to escalate, and how to prevent context bloat when failures stack up.
