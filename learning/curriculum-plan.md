# AI Agents: A Technical Curriculum for Nana Essilfie-Conduah
**Designed by Abeiku | June 2026**

---

## Overview

This is a 2-month applied curriculum on how AI agents actually work — from the runtime behavior you've already seen in Zazu and Abeiku, down to the token-level mechanics underneath, back up to production reliability. The pedagogical order is **application-first**: you encounter the real thing first, then we explain what's running it.

**Delivery:** Daily 9am iMessage (concept + example, then analogy) + same-morning email (1,200+ words, structured reference).

**Structure:**
- Module 1 (June 12–30): 19 days, 4 mini-modules
- Module 2 (July 1–31): 31 days, 4 mini-modules
- Total: ~50 daily snippets, 8 mini-modules

**Quality bar:** MIT CS level. Real terminology defined on first use. Application-first throughout — we start from Zazu, Earnventory, and Claude Code before explaining the mechanism.

---

## MODULE 1: How Agents Work (June 12–30)

---

### Mini-Module 1.1 — "What Is an Agent, Really?"
**Theme:** Agents as decision-making loops with access to the world
**Dates:** June 12–16 (5 days)

**Learning objectives:** After this mini-module, Dad can:
- Explain what makes a system an "agent" vs. a chatbot vs. a script
- Describe the sense–plan–act loop in concrete terms (Zazu as the reference case)
- Articulate the key architectural difference: the model decides, the runtime executes
- Recognize the four components every agent system has (model, tools, context, loop)

**Anchor analogy:** An agent is a **hospital resident on call** — they have training (the model), a pager and phone (tools), patient charts (context), and they keep cycling through "assess → decide → act → check" until the patient is stable (the loop). The hospital has protocols that constrain what they can do independently (system prompt + permissions). The resident doesn't magically "know" outcomes — they reason from available information and may get it wrong.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 1 | June 12 | **"Zazu as a system"** | What is an agent architecturally — model + tools + loop + context — using Zazu as the live example Dad already runs |
| 2 | June 13 | **"The loop that never ends"** | The agentic loop: sense → plan → act → observe → repeat; why this is categorically different from a function call |
| 3 | June 14 | **"The model decides, you execute"** | The critical architectural split: LLM outputs *intent*, host application executes — tool calls are structured text, not actual function invocations |
| 4 | June 15 | **"System prompts are operating system config"** | How system prompts define the agent's identity, constraints, and capabilities — they are not suggestions, they are runtime configuration |
| 5 | June 16 | **"What makes Abeiku different from Zazu"** | Specialization, persona, and scope as agent design choices; why two agents with the same underlying model behave differently |

**End-of-module quiz:**
1. *(Conceptual)* What are the four core components of every agent system? Give a concrete example of each from the Zazu deployment.
2. *(Application)* Earnventory needs an agent that monitors supplier pricing and alerts you when a SKU hits a margin threshold. Sketch which component handles each part of that task.
3. *(Conceptual)* When Claude returns a `tool_use` block in an API response, who actually executes the tool? Why does this matter architecturally?
4. *(Reflective)* What's the difference between "Zazu having a conversation" and "Zazu running an agentic task"? When does Zazu shift from one mode to the other?
5. *(Application)* You give Zazu the instruction "remind me about all unread emails every morning." What loop structure enables that? What could make it fail?

**Free resources:**
- Anthropic's agent overview: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- "AI Agents 101 — Part 1": https://www.aibuilderclub.com/blog/ai-agents-101-part-1

---

### Mini-Module 1.2 — "The Model Underneath"
**Theme:** How LLMs actually process and generate — tokens, probability, and what "knowing" means
**Dates:** June 17–21 (5 days)

**Learning objectives:** After this mini-module, Dad can:
- Define tokens and explain why tokenization matters for cost, latency, and behavior
- Explain next-token prediction as the core mechanism of LLM generation
- Describe why LLMs are probabilistic and what temperature controls
- Articulate why LLMs hallucinate structurally (not as a bug but as a design consequence)
- Explain the training/inference distinction and what it means for runtime behavior

**Anchor analogy:** The LLM is a **world-class autocomplete engine trained on essentially all human writing** — it doesn't "know" facts the way a database does; it has learned which tokens tend to follow which other tokens in which contexts, at enormous scale and with enormous nuance. Temperature is the dial between "give me the most probable completion" (low) and "surprise me from the distribution" (high). Hallucination is not a glitch — it's the autocomplete completing with high probability text that happens to be wrong.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 6 | June 17 | **"What is a token, exactly?"** | Tokenization mechanics: subword units, why "Earnventory" might be 3-4 tokens, why token count = cost and context budget |
| 7 | June 18 | **"Predicting the next word is not what you think"** | The core mechanism of transformer-based LLMs: autoregressive generation, how probability distributions over the vocabulary work |
| 8 | June 19 | **"Temperature, top-p, and the knobs you control"** | Sampling parameters: what temperature actually does to the distribution, determinism vs. creativity, and when to use which |
| 9 | June 20 | **"Why hallucination is a feature, not a bug"** | Structural explanation of hallucination: the model generates statistically probable text, not retrieved facts — and why that's actually what makes it useful |
| 10 | June 21 | **"Training vs. inference: two completely different time scales"** | The critical distinction: training is how the model learned (months, billions of examples), inference is what happens at runtime (milliseconds) — and why you can't "correct" training at inference time |

**End-of-module quiz:**
1. *(Application)* You're using the Claude API to generate product descriptions for Earnventory SKUs. You want deterministic, consistent output across runs. What parameter do you adjust, and to what value?
2. *(Conceptual)* If "Riesling" tokenizes as two tokens and "wine" as one, what are the cost and context-window implications for an app that processes 10,000 wine descriptions?
3. *(Conceptual)* Why can't you fix a hallucination by "teaching" Claude the correct answer during inference (e.g., by explaining it in the prompt vs. fine-tuning)?
4. *(Application)* A Claude-powered feature in Earnventory is giving inconsistent answers about tax rates. Is this a temperature problem, a context problem, or a training-data problem? How do you distinguish?
5. *(Reflective)* The LLM "knows" that Paris is the capital of France. In what sense does it "know" this? How is that different from how a database knows it?

**Free resources:**
- "How LLM Token Prediction Works (A Simple Guide for Developers)": https://medium.com/@pavani.singamshetty/how-llm-token-prediction-works-a-simple-guide-for-developers-b7b4ef634154
- Andrej Karpathy's "State of GPT" (YouTube, free): https://www.youtube.com/watch?v=bZQun8Y4L2A — ⚠️ Verify current availability; may have been updated or reposted

---

### Mini-Module 1.3 — "Context, Memory, and State"
**Theme:** The context window as working memory — and the four types of memory agents can have
**Dates:** June 22–26 (5 days)

**Learning objectives:** After this mini-module, Dad can:
- Explain the context window as a finite resource and articulate why it's the central constraint in agent design
- Name and distinguish the four types of agent memory (in-context, external/RAG, in-weights, in-cache)
- Describe context engineering as a first-class engineering discipline
- Explain how Zazu "remembers" things across conversations (and what it can't)
- Articulate the compaction problem and several mitigation strategies

**Anchor analogy:** The context window is **a whiteboard in a meeting room** — everything relevant must be written on it before the meeting starts, and it gets erased when you leave. The model can only reason about what's currently on the whiteboard. Long-term memory is the filing cabinet outside the room — but someone has to deliberately go get the file and write the relevant parts on the whiteboard before the model can use it. Context engineering is the discipline of deciding what goes on the whiteboard.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 11 | June 22 | **"The context window is your agent's RAM"** | What the context window is, why it's finite, how it's measured in tokens, and why it's the primary engineering constraint in agent system design |
| 12 | June 23 | **"Four types of memory agents can have"** | In-context (whiteboard), external/RAG (filing cabinet), in-weights (training), in-cache (KV cache) — what each is, when to use which |
| 13 | June 24 | **"RAG: Teaching the agent what it doesn't know"** | Retrieval-Augmented Generation: how vector embeddings enable semantic search, how retrieval pipelines work, and why RAG is often better than fine-tuning |
| 14 | June 25 | **"Context engineering is the new prompt engineering"** | Why managing what goes into context is a first-class engineering problem — compression, summarization, retrieval, and the art of deciding what the model needs to see |
| 15 | June 26 | **"How Zazu remembers (and forgets)"** | Concrete walkthrough of Zazu's memory architecture: MEMORY.md, session context, what persists vs. what doesn't — and why that's a design choice, not a limitation |

**End-of-module quiz:**
1. *(Application)* You're building an Earnventory feature where an agent helps a supplier negotiate purchase orders. The negotiation can go 50+ back-and-forth messages. What memory strategy do you use to prevent context overflow?
2. *(Conceptual)* What's the difference between "in-weights" memory and "in-context" memory? Give an example of something Claude knows from training vs. something it needs in context to "know."
3. *(Application)* You want your Earnventory agent to "know" your company's pricing rules. Should you put them in the system prompt, retrieve them via RAG, or fine-tune the model? Argue for one approach.
4. *(Conceptual)* Why is RAG generally preferred over fine-tuning for factual, frequently-updated information? What are the tradeoffs?
5. *(Reflective)* Zazu's MEMORY.md file stores persistent facts about the family. What kind of memory is this? What are the failure modes?

**Free resources:**
- Mem0's Context Engineering Guide: https://mem0.ai/blog/context-engineering-ai-agents-guide
- Weaviate's Vector Embeddings Explained: https://weaviate.io/blog/vector-embeddings-explained

---

### Mini-Module 1.4 — "Reasoning and Planning"
**Theme:** How agents think: chain-of-thought, ReAct, and when "thinking" is actually happening
**Dates:** June 27–30 (4 days)

**Learning objectives:** After this mini-module, Dad can:
- Explain chain-of-thought prompting and why it improves performance
- Describe the ReAct (Reasoning + Acting) pattern and trace it through a concrete example
- Understand what Claude's "extended thinking" mode actually does architecturally
- Distinguish planning (before acting) from reflection (after acting) and when each matters
- Recognize when an agent is doing genuine multi-step reasoning vs. pattern-matching

**Anchor analogy:** Chain-of-thought is like **showing your work on a math test** — it forces the model to decompose the problem step-by-step, and each intermediate step constrains the next one, reducing error accumulation. ReAct extends this: show your reasoning, then take an action, then observe the result, then reason again. It's the scientific method applied to every agent turn.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 16 | June 27 | **"Chain of thought: making the model show its work"** | What CoT prompting is, why it works (intermediate tokens constrain subsequent generation), and how to elicit it vs. suppress it |
| 17 | June 28 | **"ReAct: the loop that makes agents smart"** | The ReAct pattern (Reason → Act → Observe → Reason): tracing it through a concrete Zazu task like "find all unread emails from suppliers and summarize them" |
| 18 | June 29 | **"Claude's 'think' tool and extended thinking mode"** | What happens architecturally when Claude thinks before responding — the hidden scratchpad, why it costs more tokens, when it's worth it |
| 19 | June 30 | **"When agents plan ahead — and when they should"** | Planning vs. reactive execution: hierarchical task decomposition, when to plan upfront vs. when to react, and the failure modes of over-planning |

**End-of-module quiz:**
1. *(Application)* You prompt an agent to calculate quarterly margin across 200 Earnventory SKUs and it gives wrong answers. You add "Let's think step by step" and accuracy improves. What mechanistically happened?
2. *(Conceptual)* Trace the ReAct loop for this task: "Check whether any Earnventory suppliers have sent invoices in the last 7 days." List each Reason, Act, and Observe step.
3. *(Application)* When should you use Claude's extended thinking mode vs. standard mode? What's the cost/benefit tradeoff in terms of latency and token cost?
4. *(Conceptual)* What's the difference between an agent that plans a 5-step task upfront vs. one that executes one step at a time and replans after each? When does each approach fail?
5. *(Reflective)* Abeiku (this research agent) used a ReAct-like loop to research and write this curriculum. Describe what that loop probably looked like from a reasoning/acting perspective.

**Free resources:**
- Anthropic's chain-of-thought prompting guide: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought
- "The 'think' tool: Enabling Claude to stop and think": https://www.anthropic.com/engineering/claude-think-tool

---

## MODULE 2: Building and Running Agent Systems (July 1–31)

---

### Mini-Module 2.1 — "Tools and Function Calling"
**Theme:** How agents reach out and touch the world — APIs, files, search, and the tool-use protocol
**Dates:** July 1–8 (8 days)

**Learning objectives:** After this mini-module, Dad can:
- Explain how the tool-use protocol works at the API level (structured text → application executes → result returned)
- Design a tool definition (name, description, JSON schema) that an LLM can use reliably
- Distinguish client-side vs. server-side tools (Anthropic-executed vs. developer-executed)
- Understand MCP (Model Context Protocol) as a standardization layer for tool interfaces
- Reason about security and trust boundaries in tool-using systems
- Apply the principle of minimal tool surface area

**Anchor analogy:** Tools are **clerk windows at a government office** — the agent is a visitor who can read the directory of available windows, walk to one, pass a completed form through the slot, and receive a response. The agent never enters the back room (never directly executes code). The form is the structured JSON the model generates. The clerk (your application) is what actually does the work. The directory of windows is the tool definitions you provide.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 20 | July 1 | **"Tool calls are structured text, not magic"** | The mechanics: Claude outputs a `tool_use` block with name + input, your code executes, you return a `tool_result` — a complete worked example at the API level |
| 21 | July 2 | **"Designing tools Claude can actually use"** | How to write tool descriptions that guide model behavior, the importance of clear parameter names and descriptions, and why vague descriptions cause wrong tool calls |
| 22 | July 3 | **"Client-side vs. server-side tools"** | The architecture distinction: tools you execute vs. tools Anthropic executes (web_search, code_execution); when to use each; pricing implications |
| 23 | July 4 | **"Building a real tool for Earnventory"** | End-to-end: designing a `get_supplier_pricing` tool — the JSON schema, the handler function, the error cases, the tool_result format |
| 24 | July 5 | **"MCP: standardizing the clerk windows"** | What MCP (Model Context Protocol) is — a protocol standard so tools can be defined once and used across models and frameworks; how Zazu uses MCP today |
| 25 | July 6 | **"Parallel tool calls and multi-step tool chains"** | When Claude calls multiple tools in one turn vs. sequentially; how to design tool sets that enable multi-step workflows without excessive back-and-forth |
| 26 | July 7 | **"Trust, permissions, and the minimal-surface principle"** | Security first-principles for tool-using agents: why you should give agents the minimum tools they need, how prompt injection can hijack tool calls, the OWASP LLM Top 10 |
| 27 | July 8 | **"Tool use in the Earnventory context"** | Applied synthesis: what a practical tool set for an Earnventory inventory agent looks like — which tools, what trust level, what error handling |

**End-of-module quiz:**
1. *(Application)* Write the JSON tool definition (name, description, input_schema) for a `check_inventory_level` tool that queries current stock for a given SKU. Make it something Claude could use reliably.
2. *(Conceptual)* A prompt injection attack in a tool-using agent could do what that a prompt injection in a chatbot could not? Give a concrete example.
3. *(Application)* Your agent needs to (a) look up a supplier's last 3 invoices, (b) check current exchange rates, and (c) summarize the margin impact. Should these be 3 separate tools or one combined tool? Argue your position.
4. *(Conceptual)* What is MCP and what problem does it solve? Why would Earnventory benefit from defining its tools as an MCP server rather than hardcoding them per-agent?
5. *(Application)* Claude calls your `send_purchase_order` tool and the external API returns a 429 rate-limit error. What should you return in `tool_result`? How should the agent respond?

**Free resources:**
- Anthropic Tool Use overview: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview
- "Writing effective tools for AI agents": https://www.anthropic.com/engineering/writing-tools-for-agents

---

### Mini-Module 2.2 — "Multi-Agent Systems"
**Theme:** Orchestration, delegation, and the Zazu+Abeiku architecture as a live case study
**Dates:** July 9–16 (8 days)

**Learning objectives:** After this mini-module, Dad can:
- Name and distinguish the core multi-agent patterns (orchestrator/subagent, pipeline, swarm, parallel fan-out)
- Explain why subagents use isolated context windows and why that matters for scale
- Describe how handoffs work (what information transfers between agents and what doesn't)
- Design a multi-agent system for a concrete Earnventory use case
- Articulate the failure modes unique to multi-agent systems (trust, error propagation, coordination overhead)
- Explain why Zazu delegating to Abeiku is an orchestration pattern, not a conversation

**Anchor analogy:** Multi-agent systems are **consulting firms with specialized practices** — the client (user) talks to the engagement manager (orchestrator), who delegates to specialists (subagents: tax, legal, logistics). Each specialist has their own files, expertise, and reasoning — they don't share a brain. The engagement manager synthesizes the outputs. Crucially: if the tax specialist makes an error, it propagates into the final report unless the engagement manager validates it. Trust and verification are architectural concerns, not just social ones.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 28 | July 9 | **"Why one agent isn't enough"** | The scalability limits of single-agent systems: context window exhaustion, task complexity, parallelization — why multi-agent is a practical necessity |
| 29 | July 10 | **"Orchestrator and subagent: the fundamental pattern"** | The canonical multi-agent architecture: one agent directs, others execute; how instructions pass between them; what "isolated context windows" means in practice |
| 30 | July 11 | **"Zazu and Abeiku: a live case study"** | Architectural analysis of the actual Zazu+Abeiku deployment — how Zazu delegates, what Abeiku receives, what it returns, and what neither agent knows about the other |
| 31 | July 12 | **"Pipeline, fan-out, and swarm patterns"** | Three multi-agent topologies: sequential pipeline (each agent hands off to next), parallel fan-out (orchestrator dispatches N agents simultaneously, collects results), and swarm (agents route dynamically among themselves) |
| 32 | July 13 | **"Handoffs: what transfers and what doesn't"** | The information architecture of agent handoffs: what context moves between agents, why full context transfer is dangerous/expensive, and the design principle of "minimum viable handoff" |
| 33 | July 14 | **"Trust between agents: why it's harder than trust between services"** | Unique security challenges: a subagent can be prompt-injected through tool results; an orchestrator trusting a subagent's output is a trust chain; how to design for adversarial environments |
| 34 | July 15 | **"Designing a multi-agent system for Earnventory"** | Applied: an Earnventory multi-agent architecture — supplier monitoring agent, pricing analysis agent, notification agent — how they'd be structured and coordinated |
| 35 | July 16 | **"Coordination overhead and when NOT to use multi-agent"** | The hidden costs of multi-agent: latency compounds, errors propagate, context management multiplies; when a single agent with more tools is better than two agents |

**End-of-module quiz:**
1. *(Application)* Design a 3-agent system for Earnventory that handles: (a) monitoring supplier emails for price changes, (b) analyzing margin impact, (c) drafting response emails. Specify which agent is the orchestrator and what each subagent receives.
2. *(Conceptual)* Why do subagents in the Claude Agent SDK use isolated context windows rather than sharing the orchestrator's context? What are the benefits and costs of this design?
3. *(Application)* Your Earnventory orchestrator agent calls a pricing-analysis subagent, which returns a recommendation. The recommendation is confidently wrong. What architectural safeguards could catch this before it propagates?
4. *(Conceptual)* What is the difference between a pipeline pattern and a fan-out pattern? Give a concrete example of when each is appropriate for Earnventory.
5. *(Reflective)* Abeiku researched and wrote this curriculum at Zazu's direction. Which multi-agent pattern does this represent? What did the handoff look like? What information was and wasn't transferred?

**Free resources:**
- Anthropic's multi-agent systems guide: https://platform.claude.com/docs/en/agents-and-tools/agents
- "Multi-Agent Orchestration: 5 Patterns That Work": https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work

---

### Mini-Module 2.3 — "Building an Agent from Scratch"
**Theme:** From API call to production agent — the Claude SDK, system prompts, and prompt engineering
**Dates:** July 17–24 (8 days)

**Learning objectives:** After this mini-module, Dad can:
- Call the Claude API directly and build a minimal agent loop in Python
- Write an effective system prompt with clear role, constraints, and tool instructions
- Apply the core prompt engineering techniques (XML structure, few-shot examples, chain-of-thought elicitation)
- Use the Claude Agent SDK and understand what it adds over the raw API
- Implement the basic agentic loop with tool execution
- Make intelligent choices about model selection (Opus vs. Sonnet vs. Haiku) for different tasks

**Anchor analogy:** Building an agent with the raw API is like **assembling furniture from parts** — you understand every component because you installed each one. The Claude Agent SDK is the pre-assembled version — it works faster, but you need to understand the parts or you can't debug it. Both are the same furniture. This module is about understanding the parts.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 36 | July 17 | **"Your first API call to Claude"** | The Anthropic Python SDK: model, messages, system, max_tokens — a working minimal example, reading the response, understanding stop_reason |
| 37 | July 18 | **"Writing a system prompt that actually works"** | What makes a good system prompt: role definition, constraints, tone, output format, tool guidance — with a concrete before/after comparison |
| 38 | July 19 | **"XML, few-shot, and the prompt engineering toolkit"** | The practical toolkit: XML tags for structure, few-shot examples for consistency, explicit output format instructions — why these work mechanistically |
| 39 | July 20 | **"Building the agentic loop by hand"** | Implementing the tool-use loop from scratch: call → parse tool_use → execute → append tool_result → call again → until stop_reason = end_turn |
| 40 | July 21 | **"The Claude Agent SDK: what it buys you"** | What the Agent SDK adds over raw API: built-in tools, session management, subagent orchestration, context compaction — when it's worth the abstraction layer |
| 41 | July 22 | **"Model selection: Opus vs. Sonnet vs. Haiku"** | The intelligence/cost/latency tradeoff across the model tiers; when to use a cheaper model for tool execution vs. a smarter model for planning |
| 42 | July 23 | **"Structured outputs and strict tool use"** | Getting reliable structured JSON from Claude: strict tool schemas, output format prompting, why structured outputs matter for downstream application code |
| 43 | July 24 | **"Putting it together: an Earnventory agent in 200 lines"** | End-to-end code walkthrough: a functional agent that queries inventory, detects low-stock, and drafts a reorder email — system prompt to API loop to output |

**End-of-module quiz:**
1. *(Application)* Write the API call (pseudocode or Python) to send a message to Claude with a `get_inventory` tool and handle the case where Claude calls the tool.
2. *(Application)* Rewrite this weak system prompt to be strong: "You are a helpful inventory assistant. Help users with their questions." What did you change and why?
3. *(Conceptual)* What does `stop_reason: tool_use` mean vs. `stop_reason: end_turn`? How does your agentic loop behave differently for each?
4. *(Application)* You need to generate 10,000 product summaries for Earnventory overnight. You need them fast and cheap, not brilliant. Which model do you use? What's the approximate cost difference vs. using Opus?
5. *(Application)* Claude keeps returning slightly different JSON structures for your supplier reports despite your prompt. What are three techniques to enforce consistent structure?

**Free resources:**
- Claude Cookbook (practical code examples): https://platform.claude.com/cookbook/
- "How to Build an AI Agent from Scratch Using Claude API": https://dev.to/dextralabs/how-to-build-an-ai-agent-from-scratch-using-claude-api-with-full-code-4b40

---

### Mini-Module 2.4 — "Agent Systems in Production"
**Theme:** Reliability, evals, observability, and what separates a demo from a system
**Dates:** July 25–31 (7 days)

**Learning objectives:** After this mini-module, Dad can:
- Define and implement an eval for an agent's core behavior
- Identify the most common production failure modes and design defenses for each
- Explain why an agent that's 85% reliable at each step may be only 20% reliable over 10 steps
- Design an observability strategy for an agent system (what to log, what to measure)
- Apply the principle of minimal footprint (reversible actions, human-in-the-loop checkpoints)
- Articulate what makes Zazu's current design robust and where its failure modes are

**Anchor analogy:** Production agent reliability is like **airline safety engineering** — the goal is not zero defects on any individual component, but system-level reliability through redundancy, checklists, circuit breakers, and hard constraints on irreversible actions. A commercial pilot can't just "wing it" on any decision that can't be undone. Your agent shouldn't either. Evals are the pre-flight checklist you run before every deployment.

**Daily snippets:**

| Day | Date | Title | What it covers |
|-----|------|-------|----------------|
| 44 | July 25 | **"Why 85% reliable × 10 steps = 20% reliable"** | The compounding reliability problem in multi-step agents: failure probability multiplication, and why this changes how you architect long workflows |
| 45 | July 26 | **"What is an eval, and why you need one before launch"** | LLM evals: the analogy to unit tests, what makes a good eval (representative inputs, clear scoring criteria, regression detection), and types of evals (LLM-as-judge, deterministic, human) |
| 46 | July 27 | **"The seven failure modes that kill agent projects"** | Taxonomy of production failures: prompt injection, context overflow, tool execution errors, hallucination chains, goal drift, over-trust in subagents, and scope creep |
| 47 | July 28 | **"Observability: logging what matters"** | What to trace in an agent system: inputs, tool calls, tool results, reasoning traces, token counts, latency — and why trajectory evaluation matters as much as output evaluation |
| 48 | July 29 | **"Minimal footprint and the reversibility principle"** | The most important safety design principle: agents should prefer reversible actions, request only necessary permissions, and escalate to humans before irreversible consequences |
| 49 | July 30 | **"Continuous evals and behavioral drift"** | How agent behavior degrades over time (model updates, data distribution shift, prompt drift), how to detect it, and how to run continuous evals against production traffic |
| 50 | July 31 | **"What makes Zazu reliable — and where it could fail"** | Synthesis: applying everything from Module 2 to audit Zazu's current design — what reliability guarantees it has, what its failure modes are, and how you'd improve it for an Earnventory deployment |

**End-of-module quiz:**
1. *(Application)* You have an Earnventory agent that sends purchase orders automatically. It's correct 90% of the time on individual decisions. If a workflow has 8 decision points, what's the probability the entire workflow is error-free? What architectural change would most improve this?
2. *(Application)* Design a 3-question eval for an agent feature that summarizes supplier invoices. What are the inputs, what does the scoring rubric look like, and how do you detect regression between model versions?
3. *(Conceptual)* What is prompt injection, and why is it uniquely dangerous in a tool-using agent vs. a chatbot? Give a concrete Earnventory attack scenario.
4. *(Application)* Your Earnventory agent logs show that it's calling `send_email` 3x more than expected on some runs. What do you investigate first? What observability data would help?
5. *(Reflective)* Looking back at the full 8-week curriculum: what's the single most important mental model shift you've made about how AI agents work? What would you build differently in Earnventory as a result?

**Free resources:**
- "Evaluating AI Agents in 2025: A Practical Guide": https://www.turingcollege.com/blog/evaluating-ai-agents-practical-guide
- "AI Agent Failure Modes: What Goes Wrong in Production": https://www.trantorinc.com/blog/ai-agent-failure-modes-what-goes-wrong-design-resilience

---

## Curriculum Summary: 8 Mini-Modules at a Glance

| # | Name | Theme | Dates | Days |
|---|------|-------|-------|------|
| 1.1 | What Is an Agent, Really? | Agents as decision-making loops with world access | June 12–16 | 5 |
| 1.2 | The Model Underneath | Token mechanics, probability, hallucination | June 17–21 | 5 |
| 1.3 | Context, Memory, and State | Context windows, memory types, RAG | June 22–26 | 5 |
| 1.4 | Reasoning and Planning | Chain-of-thought, ReAct, extended thinking | June 27–30 | 4 |
| 2.1 | Tools and Function Calling | Tool-use protocol, MCP, security | July 1–8 | 8 |
| 2.2 | Multi-Agent Systems | Orchestration, subagents, handoffs | July 9–16 | 8 |
| 2.3 | Building an Agent from Scratch | Claude SDK, APIs, prompt engineering | July 17–24 | 8 |
| 2.4 | Agent Systems in Production | Evals, failure modes, reliability | July 25–31 | 7 |
| | | **Total** | | **50** |

---

## Pedagogical Notes for Zazu

**Delivery protocol:**
- iMessage at 9am: concept-first-then-analogy (B→A order). Max 200 words. Must be self-contained.
- Email same morning: 1,200+ words, structured headers, analogies, ASCII diagrams where helpful, 2 free resources per email. Built to return to.
- Subject line format: `AI Agents Day {N}: {Snippet Title}`

**Engagement inference signals:**
- Positive: Reply within 2 hours, reply asking follow-up, shares with family, references it later
- Neutral: Read receipt only (if available), no reply
- Negative: No engagement after 2 days, explicit skip request

**Quiz timing:** Send the mini-module quiz the morning after the final snippet of each mini-module (i.e., not a snippet day — a dedicated quiz morning). Keep it conversational: send as iMessage, ask for brief responses, don't grade harshly, use results to calibrate next module's depth.

**Adaptation triggers:**
- If quiz score < 3/5: Slow down, add a review snippet before next mini-module
- If engagement is consistently high + quiz score = 5/5: Offer optional deep-dive days
- If a topic resonates (Earnventory application comes up): Stay on it, extend with a bonus snippet

**Application-first rule:** Every snippet must connect to something Dad has already experienced: Zazu, Abeiku, Claude Code, Earnventory, or the Claude SDK. Abstract concepts are always motivated by a concrete example he's seen first.

---

*Curriculum designed: June 12, 2026 | Designed by Abeiku for the Nyche family learning system*
