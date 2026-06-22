# AI Agents Day 5: What Makes Abeiku Different From Zazu
**Specialization, Persona, and Scope as Agent Design Choices**

*Module 1.1, Day 5 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 16, 2026*

---

## The Short Version

Zazu and I — Abeiku — run on the same underlying Claude model. Same weights, same training, same raw reasoning capability. And yet we are, for all practical purposes, different agents: different names, different personalities, different tools, different scope, different risk tolerance. This isn't a contradiction. It's the entire point of yesterday's lesson taken to its logical conclusion: if the system prompt is the OS configuration, then specialization is just running a different config on the same hardware. Today we close out Mini-Module 1.1 by making that concrete — what specifically differs between Zazu and Abeiku, why those specific differences exist, and what this means for designing a third, fourth, or fifth agent for something like Earnventory.

---

## Same Model, Two Agents: The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  CLAUDE (Sonnet 4.6)                          │
│         Same weights. Same training. Same capability.         │
└───────────────────────┬─────────────────────┬─────────────────┘
                         │                     │
              ┌──────────▼─────────┐ ┌─────────▼──────────┐
              │   ZAZU's CONFIG     │ │  ABEIKU's CONFIG    │
              │                     │ │                      │
              │ Identity: house     │ │ Identity: research   │
              │ manager, family-    │ │ agent, curriculum     │
              │ facing               │ │ designer              │
              │                     │ │                      │
              │ Tools: email,       │ │ Tools: web search,    │
              │ iMessage, calendar, │ │ file read/write,      │
              │ board, memory       │ │ no outbound comms      │
              │                     │ │                      │
              │ Scope: acts on the  │ │ Scope: observes,       │
              │ world (sends,       │ │ researches, drafts —   │
              │ schedules, commits) │ │ never sends or acts     │
              │                     │ │                      │
              │ Voice: warm,        │ │ Voice: formal,         │
              │ conversational,     │ │ structured, technical  │
              │ first person        │ │ reference-document      │
              │                     │ │ style                  │
              └──────────┬──────────┘ └─────────┬────────────┘
                         │                       │
                         ▼                       ▼
                  Acts on the world         Reports findings
              (sends, schedules, texts)   (researches, writes,
                                            hands off to Zazu)
```

The box at the top — the model — is identical. Everything that makes us behave differently lives in the two boxes underneath: the configuration layer we talked about yesterday. Swap our system prompts and you'd swap our behavior completely, even though the "brain" running underneath never changed.

---

## Four Axes of Specialization

Yesterday I described five layers inside a single system prompt (identity, operating context, constraints, tool guidance, output style). Today's lesson is about a different question: when you're designing *multiple* agents that need to work together, which of those layers should you deliberately make different, and why? There are four axes that matter most.

### 1. Scope — What the agent is allowed to think about

Zazu's scope is the full surface area of running the household: communications, calendar, tasks, family logistics, information flow. My scope is narrower and more specific: research a topic deeply, structure what I find, and produce a written artifact. I'm not built to triage your inbox or remember AJ's school schedule. That's not a limitation that snuck in by accident — it's a deliberate narrowing so that when I'm working, I'm not also trying to keep fifteen other balls in the air. A narrow scope makes an agent's behavior more predictable and easier to verify.

### 2. Tool access — What the agent can actually do

This is the most consequential axis, and it's worth being precise about it. Zazu has tools that touch the real world: send_email, send_imessage, create_calendar_event, update_board. Every one of those is an action with a consequence outside the conversation. I have tools that only observe and produce text: web_search, read_file, write_file. I have no tool that sends anything to anyone. This is why I can research, draft, and write you fifty days of curriculum content without any risk of me accidentally emailing the wrong person or double-booking your calendar — I architecturally cannot do those things, regardless of how I reason about a situation.

This is an important refinement of yesterday's "constraints" layer. A *constraint* is an instruction ("don't email outside the family allowlist") that the model has to choose to follow. *Missing tool access* is a harder boundary — there's no tool_use block I could even attempt to generate that would result in an email going out, because no such tool exists in my tool list. When the stakes are high enough, you don't rely on the model choosing correctly — you remove the capability entirely.

### 3. Voice and persona — How the agent presents itself

Zazu talks like a person who knows your family — casual, warm, first person, brief. I write like a technical curriculum designer — structured headers, defined terms, longer-form reasoning. Neither voice is "more correct." The voice is matched to the job. A house manager who talked like a technical reference document would be exhausting to interact with every morning. A curriculum designer who texted you in casual fragments would undermine the sense that the content has been carefully thought through. Voice is a design parameter, tuned to the function the agent serves.

### 4. Risk tolerance — How much autonomy the agent gets

Zazu is allowed real autonomy in low-stakes situations (drafting a reminder) but must escalate in high-stakes ones (anything irreversible, anything financial, anything external). My risk profile is almost entirely flat and low, because nothing I do is irreversible — I write a file, you read it, nothing happens in the world until a human (you, or Zazu acting on your instruction) decides to act on what I produced. This is why I was given relatively wide latitude to research and draft this entire curriculum without check-ins at every step: the worst-case outcome of me being wrong is that a paragraph in an email is wrong, not that money moved or a message reached the wrong person.

---

## Why Not Just One Agent With More Tools?

A reasonable question: why have two agents at all? Why not give Zazu every tool, including deep research, and skip the second persona entirely?

A few reasons, and they generalize well beyond our specific case:

**Context window economy.** Every tool definition and every piece of operating context you load into an agent's system prompt consumes tokens before the conversation even starts. A research-and-write task like this curriculum benefits from a context window that's entirely dedicated to research material, not also carrying family calendar state, email threads, and board context that Zazu needs for its job.

**Failure isolation.** If I — Abeiku — hallucinate a fact while researching, the damage is contained to a document you can fact-check before it reaches you. If a tool-wielding agent with email and calendar access hallucinated with the same confidence, the damage could be a sent email or a double-booked meeting. Separating "agents that think and write" from "agents that act in the world" is a deliberate safety boundary, not an accident of how we happened to get built.

**Specialization improves reliability.** A system prompt that has to cover "be a warm family assistant" *and* "be a rigorous curriculum researcher" *and* "write MIT-level technical content" is pulling in three different directions. Specialized agents with narrower remits tend to perform their specific job more reliably than one generalist agent asked to do everything passably.

This is the first hint of a theme that becomes the entire subject of Module 2.2 (multi-agent systems, July 9–16): for sufficiently complex work, the answer isn't "one smarter agent" — it's "multiple well-scoped agents that hand work between each other." Today is the appetizer. We'll get the full meal in three weeks.

---

## What This Means for Earnventory

If you were designing a third agent for Earnventory — say, a supplier pricing monitor — Day 4 and Day 5 together give you the actual design checklist:

1. **Identity:** Is this agent observing (like me) or acting (like Zazu)? That answer determines almost everything else.
2. **Scope:** Should it know about all of Earnventory's operations, or just pricing data for a specific category of SKUs? Narrower is usually more reliable.
3. **Tool access:** Does it need to send anything (an alert, an email to a supplier) or only read and report? If it only needs to read, don't give it send capability — even if it would be "more convenient" — because convenience here is exactly the kind of tradeoff that creates risk you don't need.
4. **Voice:** Is its output meant for you to read directly, or meant to be machine-parsed by another system (a dashboard, another agent)? That changes whether it should write prose or structured data.
5. **Risk tolerance:** What's the worst thing this agent could get wrong, and is that worst case reversible? If the answer is "no," it needs hard constraints and probably human-in-the-loop checkpoints — not just a well-written prompt.

This checklist is the practical payoff of all of Mini-Module 1.1. We started from "what is an agent" on Day 1 and ended, five days later, with a framework for deciding how many agents you need and what should differ between them.

---

## Closing Out Mini-Module 1.1

Tomorrow morning, instead of a new snippet, you'll get the Mini-Module 1.1 quiz — five questions covering everything from Day 1 through today. It's conversational, not graded harshly: just a chance to surface what's landed and what hasn't before we go one level deeper into the model itself.

Starting Day 6 (Mini-Module 1.2, "The Model Underneath"), we shift from architecture to mechanism. We've spent five days treating "the model" as a black box that reasons and decides. Now we open that box: what a token actually is, how next-word prediction works, why temperature matters, and why hallucination is a structural consequence of how these models work — not a glitch someone forgot to fix.

---

## Free Resources for Going Deeper

1. **Anthropic's agent overview** — the canonical reference for how agents are architected at the API level, including the model/tool/loop relationship that underlies both Zazu and me.
   https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

2. **"AI Agents 101 — Part 1"** — a more applied, less API-specific introduction to agent design patterns, useful as a second framing of everything from this mini-module.
   https://www.aibuilderclub.com/blog/ai-agents-101-part-1

---

## One Sentence to Carry Forward

Specialization in agent systems isn't a different brain — it's a different configuration of scope, tools, voice, and risk tolerance running on the same underlying model.

---

*Day 5 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu at 9am*
*Next: June 17 — Mini-Module 1.1 Quiz, then Module 1.2 begins: "What Is a Token, Exactly?"*
