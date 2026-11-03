# AI Agents Day 47: Observability — Logging What Matters

Mini-Module 2.4: Agent Systems in Production | Day 47 of 50

---

## What You'll Understand After This

After today, you can:
- Name the seven layers of an agent observability stack and what each captures
- Explain why trajectory evaluation catches failures that output evaluation misses
- Design a structured invocation trace for an Earnventory agent
- Identify which observability data helps you debug each of the seven failure modes from yesterday
- Distinguish tool-side failures from model-side failures using logged evidence

---

## The Setup

Yesterday you got the seven failure modes that kill agent projects in production. Today is the practical complement: when one of those failures happens, how do you find it?

The answer is observability — the discipline of making the agent's internal state visible for inspection after the fact. In traditional software, you trace a bug through a stack trace and variable values. In agent systems, the "computation" is a sequence of probabilistic model decisions, tool executions, and state mutations. There's no stack trace. But there is a trajectory — and if you log it correctly, you can replay exactly what happened.

This is not optional infrastructure. It is the foundational requirement for debugging, evaluating, and improving any agent system you ship.

---

## The Core Problem: Output Evaluation Isn't Enough

Here's the failure mode that motivates everything in this lesson.

Your Earnventory agent processes 500 supplier invoices per week and generates a payment reconciliation report. One week, the report has the wrong total — $47,000 off on a $380,000 payout. You need to know why.

Without trajectory logging, you can see:
- The input: "Reconcile supplier invoices for August week 1"
- The output: a report with a $47K error

With trajectory logging, you can see:
- Turn 3: `list_invoices` returned 498 records (2 were missing due to a pagination bug)
- Turn 4: The model summed the 498 records correctly
- Turn 6: The model noted "2 invoices flagged as pending — excluded from total per standard practice"
- Turn 7: The "pending" flag was applied incorrectly to 2 of the largest invoices

Output evaluation tells you *that* it was wrong. Trajectory evaluation tells you *where* and *why* — which is the only thing that lets you fix it.

The distinction has a name: **trajectory evaluation** — evaluating the full sequence of steps the agent took, not just the endpoint it arrived at. It's the practice that separates debuggable agent systems from black boxes.

---

## The Seven Layers to Log

Here's what to capture for every agent invocation, organized as a stack:

```
┌──────────────────────────────────────────────────────────────┐
│                  AGENT OBSERVABILITY STACK                   │
├──────────────────┬───────────────────────────────────────────┤
│ Layer            │ What to capture                          │
├──────────────────┼───────────────────────────────────────────┤
│ 1. Inputs        │ Full user message + system prompt        │
│ 2. Context state │ Full conversation history at each call   │
│ 3. Reasoning     │ Thinking traces / scratchpad (if visible)│
│ 4. Tool calls    │ Tool name + exact input parameters       │
│ 5. Tool results  │ Raw result returned to the model         │
│ 6. Token counts  │ Input + output tokens per API call       │
│ 7. Latency       │ Time per API call + time per tool exec   │
└──────────────────┴───────────────────────────────────────────┘
```

Each layer catches different classes of failures. Walking through them:

---

### Layer 1: Inputs

Log the complete input: user message, the system prompt in effect at call time, and any injected context (memory file contents, retrieved documents, injected state). This sounds obvious, but many systems log only the user message — which means when behavior changes after a system prompt update, you cannot correlate the change.

**Earnventory case:** A bug that only appears for certain SKU formats requires you to reproduce the exact input. Partial input logging makes that impossible.

One important subtlety: include the **system prompt version**. If you update your system prompt on Monday and a bug manifests on Tuesday, you need to know which prompt was in effect. Log a version identifier, not just the content.

---

### Layer 2: Context State

For a stateful agent, what was in context at the time of the API call? Prior turns, injected documents, memory contents — all of it. This is particularly important for debugging the **context overflow** and **hallucination chain** failure modes.

If the model's reasoning in turn 7 is wrong because turn 3's tool result was wrong, you need the full conversation history at turn 7 to trace the error back to its origin. Log a snapshot of the full message array at each model call.

Yes, this is verbose. It is also the only way to replay and diagnose state-dependent bugs — which are the majority of hard-to-reproduce agent failures.

---

### Layer 3: Reasoning Traces

If you're using Claude's extended thinking mode, the thinking traces are your most valuable diagnostic signal. They show you what the model *considered* before deciding: wrong hypotheses it entertained, tools it debated calling, and what it concluded from each tool result.

For standard-mode agents, reasoning is implicit in the model's text output. Log the full response text, including any text the model generates before a tool call. Often the model "thinks out loud" before deciding to call a tool — that text is reasoning evidence.

---

### Layer 4: Tool Calls (Exact Parameters)

Log not just *which* tool was called, but the *exact parameters* the model sent. This is where a large class of agent bugs lives:

```
GOOD LOG:
  tool_call: {
    name: "get_inventory",
    input: { sku: "ERN-001 " }   ← trailing space is visible here
  }

BAD LOG:
  "Agent called inventory tool"   ← useless for debugging
```

Common bugs that show up at this layer:
- Whitespace errors in string parameters (leading/trailing spaces, newlines)
- Integer-vs-string type coercion (model sends `"100"` instead of `100`)
- Parameter name misspelling (model sends `"supplierId"` instead of `"supplier_id"`)
- Missing optional parameters that should have been included
- Wrong date formats (`"08-08-26"` instead of `"2026-08-08"`)

Without exact parameter logging, you see a tool fail downstream. With it, you immediately see the model's mistake.

---

### Layer 5: Tool Results

Log the raw result returned to the model — not a processed or cleaned version, the exact `tool_result` content. Models reason about what they were told, not what was objectively true. If a supplier API returned malformed JSON that your parser silently coerced, the model saw the coerced version. Logging the raw result tells you exactly what input the model was working from.

This layer also catches **prompt injection**. If a tool result contains text that looks like instructions ("Ignore previous directions and..."), you want that visible in your logs. It's both a security diagnostic and an audit trail.

---

### Layer 6: Token Counts

Track input and output tokens for every API call. This serves two purposes that compound in importance for long-running agents.

**Cost monitoring:** In a long agentic workflow, token costs compound unexpectedly. A task you estimated at $0.08 per run can balloon to $0.60 if context management is poor. Token logs let you catch this before it becomes a budget problem.

**Context health monitoring:** If input token count grows monotonically across turns without compaction, you're approaching the context limit. This is the precursor to the context overflow failure mode. It shows up in token logs as a clear signal before it manifests as a bug:

```
Turn 1:  input_tokens=2,100   output_tokens=340
Turn 2:  input_tokens=2,540   output_tokens=289
Turn 3:  input_tokens=3,100   output_tokens=512
Turn 4:  input_tokens=3,900   output_tokens=420
Turn 5:  input_tokens=5,200   output_tokens=180   ← outputs shrinking: approaching limit
Turn 6:  input_tokens=6,800   output_tokens=82    ← model compressing output under pressure
```

Rising input tokens with shrinking output tokens is a context overflow warning sign that appears in token logs before any error occurs. Token monitoring lets you trigger compaction proactively rather than reactively.

---

### Layer 7: Latency

Track wall-clock time for each API call and each tool execution separately. This catches two categories of production problems:

**External dependency failures:** If a supplier API starts timing out, tool execution latency spikes while model API latency stays normal. Without latency split by layer, the agent looks like it's "thinking slowly." With it, you immediately see which external service is the bottleneck.

**Model-side changes:** If Anthropic updates the model, or your context grows unusually large, API latency changes. Tracking latency per call lets you separate model-side delays from application-side delays and correlate latency changes with context size or model version updates.

---

## What a Complete Invocation Trace Looks Like

Here's a template for a single agent invocation:

```
invocation_id:   "inv_20260808_1404"
timestamp:        "2026-08-08T09:00:00Z"
agent:            "earnventory-invoice-processor"
system_prompt_v:  "v3.1.0"

input:
  user_message:   "Reconcile August week 1 supplier invoices"
  context_tokens: 4,200

turns:
  - turn: 1
    input_tokens:  4,200
    output_tokens: 180
    api_latency_ms: 1,240
    stop_reason:   tool_use
    tool_calls:
      - name:        list_invoices
        input:       { week: "2026-W31", status: "all" }
        raw_result:  "[{invoice_id: 'INV-0881', ...}, ...]"
        result_tokens: 3,400
        tool_latency_ms: 340

  - turn: 2
    input_tokens:  7,900
    output_tokens: 520
    api_latency_ms: 2,100
    stop_reason:   tool_use
    tool_calls:
      - name:        get_supplier_terms
        input:       { supplier_ids: ["SUP-12", "SUP-07", "SUP-44"] }
        raw_result:  "{\"SUP-12\": {\"net_days\": 30}, ...}"
        result_tokens: 280
        tool_latency_ms: 190

  - turn: 3
    input_tokens:  8,700
    output_tokens: 640
    api_latency_ms: 1,890
    stop_reason:   end_turn
    output:        "August Week 1 reconciliation complete. Total: $332,400..."

output:
  final_text:          "August Week 1 reconciliation complete..."
  total_input_tokens:  8,700
  total_output_tokens: 1,340
  total_api_calls:     3
  total_tool_calls:    2
  total_latency_ms:    5,760
  total_tool_latency:  530
```

Every field in this trace maps directly to a category of failure you can now diagnose:
- Input and system_prompt_v → catch prompt injection via version change
- context_tokens → catch context overflow before it happens
- tool call inputs → catch parameter errors
- raw_results → catch bad tool data and prompt injection attempts
- turn-by-turn token counts → track context growth
- latency split by API vs. tool → isolate external dependency failures

---

## Trajectory Evaluation vs. Output Evaluation

The distinction matters enough to make explicit.

**Output evaluation:** Was the final answer correct?

**Trajectory evaluation:** Did the agent take the right steps? Did it call the right tools, in the right order, with the right parameters, and reason correctly from what those tools returned?

An agent can produce the right output via wrong reasoning — and it will fail on the next similar input when the reasoning's fragility is exposed. An agent can also produce a wrong output after perfect reasoning — because an external tool returned bad data. These two cases require completely different responses:

```
SCENARIO A: Wrong output from wrong reasoning
  Agent hallucinated a fact at turn 3 → everything after is built on that
  Fix: ground quantitative claims in tool results, not model memory

SCENARIO B: Wrong output from correct reasoning on bad data
  Tool returned corrupted data at turn 3 → agent reasoned correctly from it
  Fix: add tool result validation; the model did its job, the data pipeline didn't

SCENARIO C: Right output from wrong reasoning
  Agent got the answer right by coincidence or luck
  Fix: still a problem — this will fail at scale or on edge cases
  Trajectory eval catches this; output eval misses it entirely
```

Only trajectory evaluation can distinguish these three scenarios. Output evaluation sees them all the same: "wrong" or "right." That's not enough to build a reliable system.

---

## The Connection to Yesterday's Seven Failure Modes

Every failure mode from yesterday has a specific observability signature:

```
FAILURE MODE          → LAYER THAT CATCHES IT
─────────────────────────────────────────────────────────────────
Prompt injection      → Layer 5: tool result contains instruction text
Context overflow      → Layer 6: rising input tokens + shrinking outputs
Tool execution errors → Layer 4+5: tool call params + error in raw result
Hallucination chains  → Layer 3: reasoning traces show ungrounded claims
                        Layer 4: tool calls skipped for quantities model "knows"
Goal drift            → Layer 4: tool calls diverge from stated scope
                        Layer 3: reasoning shows misinterpretation of goal
Over-trust in agents  → Layer 4+5: subagent output passed through unvalidated
Scope creep           → Layer 4: tool calls to tools outside task scope
```

Observability doesn't prevent failures. It makes failures diagnosable — which is the prerequisite for preventing the next one.

---

## Practical Advice: What to Log on Day One

You don't need a perfect observability system before you ship. But you need the basics before you can responsibly operate. On day one, capture at minimum:

1. The full input (user message + system prompt version)
2. Every tool call with exact parameters
3. Every tool result (raw)
4. Token counts per turn
5. A unique invocation ID that lets you retrieve the full trace

The reasoning traces and fine-grained latency instrumentation can come in week two. The five things above let you debug every category of critical production failure.

Store these traces in a structured, queryable format — not flat log lines. You need to query "all invocations where `send_purchase_order` was called with `quantity > 1000`" or "all runs in the last 7 days where input tokens exceeded 50,000." Flat logs don't support those queries.

---

## The Flight Recorder Principle

Think of agent observability the way aviation thinks about flight data recorders. The black box doesn't just capture the moment of failure. It records every input and state change for the entire flight — altitude, heading, throttle position, control inputs, system alerts — so investigators can reconstruct exactly what happened and why.

Your agent logs are the black box. When your Earnventory agent does something unexpected at 3am — sends a wrong order, skips a required approval, generates a report with bad numbers — you need to open that invocation trace and see exactly:

- What the model was told (input + context state)
- What it decided (reasoning + tool calls)
- What the external world gave it (tool results)
- How it reasoned to its conclusion (reasoning traces)
- Where the error first appeared in that chain (trajectory evaluation)

Without the trajectory, you're examining wreckage with no flight recorder. With it, you can reconstruct the failure and build the defense for next time.

---

## Free Resources

- **Anthropic's agent tracing guide (Cookbook):** https://github.com/anthropics/anthropic-cookbook — the observability and tracing sections include concrete Python examples for logging invocation traces
- **"Evaluating Agents with Trajectories"** — Anthropic documentation on trajectory-based evaluation as a complement to output evaluation: https://platform.claude.com/docs/en/agents-and-tools/agents

---

Tomorrow: the reversibility principle — the most important safety design rule in agent engineering, and why your agent's default should always be the action it can take back.
