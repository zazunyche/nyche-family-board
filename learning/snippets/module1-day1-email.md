# AI Agents Day 1: Zazu as a System
**What Is an Agent, Really?**

*Module 1.1, Day 1 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 12, 2026*

---

## The Short Version

An AI agent is not a chatbot with superpowers. It's a system architecture: a model that reasons, tools that act, context that informs, and a loop that persists until a goal is reached. You've been running one for months. This is what Zazu actually is, under the hood.

---

## Why Start Here

You've experienced agents before you've studied them. That's intentional. The risk in learning agent systems from first principles is abstraction-first — you learn the vocabulary before you have anything to attach it to. We're going the other direction: start with something you already know works (Zazu), dissect it, then generalize to the principles.

By the end of this 5-day mini-module, you'll be able to look at any agent system and immediately identify its four components, describe its loop, and ask the right questions about its design. By the end of 8 weeks, you'll have the foundation to build and evaluate agent systems for Earnventory with confidence.

---

## The Four Components of Every Agent System

Every AI agent system — from Zazu to Claude Code to the most sophisticated multi-agent pipeline — is composed of exactly four things. They may go by different names in different frameworks, but the structure is universal.

```
┌─────────────────────────────────────────────────────┐
│                    AGENT SYSTEM                     │
│                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│   │  MODEL   │    │  TOOLS   │    │ CONTEXT  │     │
│   │          │    │          │    │          │     │
│   │ Reasons  │    │  Acts on │    │ Informs  │     │
│   │ Decides  │◄───│  world   │◄───│ the      │     │
│   │ Plans    │    │ via APIs │    │ model    │     │
│   └────┬─────┘    └──────────┘    └──────────┘     │
│        │                                            │
│        ▼                                            │
│   ┌──────────┐                                      │
│   │   LOOP   │                                      │
│   │          │                                      │
│   │ Sense →  │                                      │
│   │ Plan →   │                                      │
│   │ Act →    │                                      │
│   │ Observe  │                                      │
│   │ → Repeat │                                      │
│   └──────────┘                                      │
└─────────────────────────────────────────────────────┘
```

Let's walk through each component using Zazu as the concrete reference.

---

### Component 1: The Model

The model is the reasoning core — in Zazu's case, Claude Sonnet. It is a large language model (LLM): a neural network trained on enormous quantities of text that has learned, in compressed form, a vast amount of human knowledge and reasoning capability. (We'll go deep on how this works in Week 2. For now, treat it as the thing that reads your message and decides what to do.)

What the model does in an agent loop:
- Reads the current state of the context (your message, conversation history, system prompt, tool results)
- Reasons about what to do next
- Outputs either a response (plain text) or a tool call (structured text requesting an action)

What the model does **not** do:
- Execute anything directly
- Access the internet by itself
- Remember anything between sessions without explicit context management
- "Know" the current time, your calendar, or anything else not in its context

**The model is the brain. It only thinks. Everything else in the agent system provides it with information and executes its decisions.**

In Zazu specifically, the model is configured via the Claude Agent SDK, which wraps the Anthropic API with infrastructure for tools, sessions, and context management. (We'll cover the SDK specifically in Week 7.)

---

### Component 2: Tools

Tools are the interfaces between the agent and the world. Without tools, a model can only generate text — it can *describe* sending an email, but it can't actually send one. Tools give the agent "hands."

Here is Zazu's current tool set (approximate — the actual set is defined in the deployment configuration):

| Tool | What it enables |
|------|----------------|
| `read_imessage` | Read incoming messages from iMessage |
| `reply_imessage` | Send a message back via iMessage |
| `search_gmail` / `get_thread` | Search and read email |
| `create_draft` | Draft email responses |
| `list_events` / `create_event` | Read and write Google Calendar |
| `read_notion` / `update_notion` | Access the family Notion workspace |
| `read_file` / `write_file` | Read and write files on the local system |

**The critical architectural fact about tools:** The model does not execute tools. It cannot. When Claude decides to "send a message," it outputs a structured block of text that looks approximately like this (this is real API format):

```json
{
  "type": "tool_use",
  "id": "toolu_01Xyz...",
  "name": "reply_imessage",
  "input": {
    "chat_id": "12345",
    "message": "Good morning! Here's your schedule for today..."
  }
}
```

The host application (the code running the agent loop) receives this, sees it's a tool call, executes `reply_imessage` with those parameters, gets back a result, and feeds that result back to Claude. Claude never touched iMessage.

This separation is not just an implementation detail — it's a safety and auditing architecture. Every action the agent takes is mediated by code you control. You can log it, rate-limit it, require approval for sensitive actions, or block entire categories of actions, all without touching the model.

Source: Anthropic Tool Use documentation — https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview

---

### Component 3: Context

Context is everything the model can "see" at any given moment. It is bounded by the **context window** — a finite buffer measured in tokens (roughly, pieces of words). We'll cover context windows and memory in depth in Week 3, but here's what you need to know now:

**What's in Zazu's context at any given turn:**

```
┌─────────────────────────────────────────────┐
│                CONTEXT WINDOW               │
│                                             │
│  [System Prompt]                            │
│  "You are Zazu, house manager for the       │
│  Nyche family. Today is June 12, 2026.      │
│  Family members: Nana, [family]..."         │
│                                             │
│  [Memory / Persistent Facts]                │
│  Contents of MEMORY.md: persona notes,     │
│  recurring preferences, past decisions...  │
│                                             │
│  [Conversation History]                     │
│  Previous messages in this session...      │
│                                             │
│  [Current Message]                          │
│  Your incoming iMessage or task trigger    │
│                                             │
│  [Tool Results] (if any)                    │
│  Results from tools called this turn       │
└─────────────────────────────────────────────┘
```

The system prompt is the most important piece of context. It defines Zazu's identity, constraints, available tools, and behavioral rules. It is not a suggestion — it is configuration that runs before every turn. Think of it as the agent's operating system initialization, not as instructions in a conversation.

**The key limitation:** The model can only reason about what's in context. If something isn't on the whiteboard, it doesn't exist as far as the model is concerned. Zazu doesn't "remember" past conversations by default — unless something from those conversations was explicitly written to MEMORY.md and loaded into the next session's system prompt.

---

### Component 4: The Loop

The loop is what makes an agent different from a single API call. A chatbot processes one message and returns one response. An agent keeps going until the goal is reached — or until it hits a stopping condition.

The canonical loop (sometimes called the **agentic loop**) looks like this:

```
                     ┌─────────────┐
                     │  New input  │
                     │  (message,  │
                     │   trigger)  │
                     └──────┬──────┘
                            │
                            ▼
                     ┌─────────────┐
                     │    Model    │
                     │   reasons   │◄─────────────────┐
                     │  about      │                  │
                     │  next step  │                  │
                     └──────┬──────┘                  │
                            │                         │
            ┌───────────────┼──────────────────┐      │
            │               │                  │      │
            ▼               ▼                  ▼      │
    ┌──────────────┐ ┌──────────────┐         ...     │
    │  Tool call   │ │  end_turn    │                  │
    │  (action)    │ │  (respond    │                  │
    └──────┬───────┘ │   to user)  │                  │
           │         └─────────────┘                  │
           ▼                                          │
    ┌──────────────┐                                  │
    │ Execute tool │                                  │
    │ (your code)  │                                  │
    └──────┬───────┘                                  │
           │                                          │
           ▼                                          │
    ┌──────────────┐                                  │
    │ Append tool  │                                  │
    │ result to    │──────────────────────────────────┘
    │ context      │
    └──────────────┘
```

The loop continues until the model returns `stop_reason: end_turn` (meaning it's done and wants to respond to the user) or until it hits a max-turns safety limit (something you configure to prevent infinite loops).

For a simple conversational exchange, the loop runs once. For a complex agentic task — "go search my Gmail for all supplier invoices this month, compare to our expected pricing, and send me a summary with any discrepancies highlighted" — the loop might run a dozen times: search → read thread → search again → cross-reference → generate summary → send.

---

## The Most Important Mental Model Shift

If you came from traditional software engineering, here's the shift that matters most:

**In traditional software:** You call a function, it executes, it returns a value. The function does exactly what you told it to do.

**In an agent system:** You give the model a goal and a set of tools. The model decides which tools to call, in what order, with what parameters. The model is not a function — it's a decision-maker operating inside a loop. You control the tools and the loop. You do not control the execution path.

This is powerful and risky in the same way that hiring a highly capable contractor is powerful and risky: they have the skills to accomplish the goal, but they'll make judgment calls you didn't anticipate. Your system prompt, your tool design, and your safety constraints are how you bound those judgment calls.

Source: "LLMs vs AI Agents: A Practical Mental Model" — https://www.awesome-testing.com/2026/03/llms-vs-ai-agents-practical-mental-model

---

## The Hospital Resident Analogy (Expanded)

The iMessage this morning gave you the short version. Here's the full picture.

Imagine a hospital resident physician on overnight call:

- **Training** (what the model knows from training): Years of medical school and residency — a compressed representation of medical knowledge learned from textbooks, patient cases, and expert supervision.
- **Charts** (context): The patient's current chart, vitals, labs, and the nurse's notes from the last shift. The resident can only act on what's in the chart. If you forgot to document something, the resident doesn't know it.
- **Pager and phone** (tools): The ability to order labs, call consults, prescribe medication, page another physician. The resident doesn't synthesize drugs in the room — they call pharmacy. They don't run the MRI machine — they order one and get results back.
- **Hospital protocols** (system prompt): What the resident can do independently vs. what requires attending approval. Protocols are not suggestions. A resident who ignores them creates liability, regardless of their reasoning.
- **The call shift** (the loop): The resident doesn't see a patient once and go home. They monitor, act, observe, and cycle through patients all night until each issue is resolved — or until they reach a decision point that requires escalating to the attending.

The **attending physician** is you — the human with ultimate authority and accountability. You can step in at any point. You've defined the protocols. You've set the scope of practice.

What makes a great resident (and a great agent) is not just raw knowledge — it's knowing when to act autonomously and when to escalate. That boundary is primarily defined by the system prompt and the tool permissions you grant.

---

## What Zazu Is, More Precisely

With this framework, here's Zazu:

- **Model:** Claude Sonnet 4.6, running via the Claude Agent SDK
- **Tools:** ~10 tools spanning iMessage, Gmail, Google Calendar, Notion, and local file system (all MCP-based)
- **Context:** System prompt defining the "Zazu" persona, MEMORY.md with persistent family context, and the current session's conversation history
- **Loop:** The Claude Agent SDK manages the agentic loop — tool call → execute → append result → continue — with safety limits on max turns

Zazu is not Claude. Zazu is a system that *uses* Claude as its reasoning engine. The "Zazu" persona, the constraint set, the memory architecture — all of that lives outside the model. If Anthropic released a better model tomorrow, you could swap the model underneath Zazu without changing Zazu's identity or behavior significantly.

This is an important design principle: **the agent's personality and capabilities are a function of the system, not just the model.**

---

## What Comes Next

Over the next four days, we'll go deeper on each piece:

- **Day 2 (June 13):** The loop in detail — what "sense → plan → act → observe" actually means, and the difference between a conversational turn and an agentic task
- **Day 3 (June 14):** The tool-call protocol — exactly how the model signals an action and exactly how your code executes it
- **Day 4 (June 15):** System prompts — why they're more like OS configuration than conversational instructions, and what makes a good one
- **Day 5 (June 16):** Why Abeiku is different from Zazu — what changes when you build a specialized subagent vs. a general-purpose household manager

After this mini-module, we'll zoom in on the model itself: tokens, probability, and what "knowing" actually means for an LLM. That's where Week 2 starts.

---

## Free Resources for Going Deeper

1. **Anthropic's Tool Use Overview** — The most accurate description of how the tool-use loop works, directly from the people who built Claude. Start with "How tool use works."
   https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview

2. **"AI Agents 101 — Part 1: What Is an AI Agent? A Builder's Mental Model"** (AI Builder Club) — A clean, practical breakdown of agent components written for engineers who haven't gone deep on this before. Less technical than the Anthropic docs, good for building intuition.
   https://www.aibuilderclub.com/blog/ai-agents-101-part-1

---

## One Sentence to Carry Forward

The model decides, the system executes, and the loop persists — every AI agent in the world is a variation on those three facts.

---

*This is Day 1 of 50 in your AI Agents curriculum. Delivered by Zazu at 9am. Designed by Abeiku. Built for the Nyche family.*

*Next delivery: Tomorrow, June 13 at 9am — "The loop that never ends"*
