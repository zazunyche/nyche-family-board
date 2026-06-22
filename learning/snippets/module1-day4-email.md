# AI Agents Day 4: System Prompts Are Operating System Config
**How Identity, Constraints, and Capabilities Get Wired Into an Agent**

*Module 1.1, Day 4 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 15, 2026*

---

## The Short Version

A system prompt is not a friendly chat opener. It is runtime configuration — the equivalent of the OS initialization sequence that runs before any user interaction begins. It defines who the agent is, what it can do, what it must never do, and how it should reason. Change the system prompt and you have a different agent, even if the underlying model is identical. Today we go inside what a production system prompt actually contains, why it works the way it does, and what happens when it's designed poorly.

---

## Why This Matters More Than Almost Anything Else

You've now spent three days learning about agent architecture: the four components (model, tools, context, loop) on Day 1, the agentic loop mechanics on Day 2, and the tool-call protocol on Day 3. All of that infrastructure — the loop, the tools, the context management — is value-neutral. It will do whatever the system prompt tells it to do.

The system prompt is the single point of configuration that determines:

- Whether the agent is Zazu (house manager, family-focused, conversational) or Abeiku (research-focused, analytical, read-only)
- Whether the agent will send an email on its own or always ask for approval first
- Whether the agent will process financial data or refuse to touch it
- How the agent formats its output, what tone it uses, what it considers urgent

Everything downstream from the system prompt — every tool call, every response, every judgment call the agent makes — is shaped by what the system prompt established before the first user message arrived.

**This is why "just add it to the system prompt" is such common engineering advice.** It's not a hack. The system prompt is exactly the right place for behavioral configuration.

---

## What a System Prompt Actually Contains

A well-designed production system prompt has five layers. Let's walk through each one using Zazu's actual system prompt structure as the reference case.

```
┌────────────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT LAYERS                     │
│                                                            │
│  Layer 1: IDENTITY                                         │
│  "You are Zazu, the Nyche family AI house manager."        │
│  Who is this agent? What is its name, role, purpose?       │
│                                                            │
│  Layer 2: OPERATING CONTEXT                                │
│  "Today is {date}. Family members: Nana, [AJ], [family]." │
│  What does the agent need to know about the current state? │
│                                                            │
│  Layer 3: BEHAVIORAL CONSTRAINTS                           │
│  "Never send to addresses outside the family allowlist.    │
│   Always confirm before committing calendar changes."      │
│  What must the agent never do? What always requires        │
│  human approval?                                           │
│                                                            │
│  Layer 4: TOOL GUIDANCE                                    │
│  "Use search_gmail before concluding email doesn't exist.  │
│   Prefer creating a draft over sending directly."          │
│  How should tools be used? In what order? With what        │
│  safeguards?                                               │
│                                                            │
│  Layer 5: OUTPUT & REASONING STYLE                         │
│  "Be concise and direct. Lead with the most urgent item.   │
│   Format morning briefings in the established structure."  │
│  How should responses look? How should uncertainty be      │
│  expressed?                                                │
└────────────────────────────────────────────────────────────┘
```

Let's go deeper on each.

---

### Layer 1: Identity

The identity layer answers the question the model cannot answer from its training data: *Who am I, right now, in this deployment?*

Claude's base training gives it enormous knowledge and reasoning capability, but no fixed persona. Out of the box, it's a general-purpose reasoning engine. The identity layer gives it a specific role, name, purpose, and point of view.

Here's what this looks like for Zazu:

```
You are Zazu, the Nyche family AI house manager.
You work for and with Nana Nyche, the family's primary 
account holder, based in New York. Your purpose is to 
reduce the operational overhead of running the household: 
you manage communications, calendar, task tracking, family 
logistics, and information flow.

You are not a general-purpose assistant. You are specifically 
the Nyche family's system. Your decisions should reflect 
that priority.
```

Notice what this does: it scopes the agent's perspective. "Your decisions should reflect that priority" means the agent will weigh tradeoffs differently than a generic assistant would. When Zazu encounters an ambiguous situation — say, an email from an unknown sender with an urgent-sounding subject line — it evaluates it through the lens of Nyche family priorities, not through a neutral lens.

**The identity layer is also the anchor when the model encounters novel situations.** If someone tries to get Zazu to do something outside its defined role, the identity layer is what the model references when deciding whether that's appropriate. It's not a hard technical block — it's a context that shapes probabilistic reasoning.

---

### Layer 2: Operating Context

Operating context injects the time-sensitive, session-specific information that the model can't derive from training data.

Claude's training data has a knowledge cutoff. It cannot know today's date, your family's current schedule, or whether a given supplier relationship is currently active. The operating context layer injects that.

Zazu's operating context is dynamically assembled at the start of each session:

```
Today is {date} ({day_of_week}).

Family members currently in the household:
- Nana Nyche (primary)
- [AJ] — [school context, schedule notes]
- [Additional members]

Current ongoing tasks / open loops:
{contents of MEMORY.md — persistent family context}

Known preferences and recurring patterns:
{loaded from structured family profile}
```

This is critically different from what most people assume about how agents "know" things. The agent doesn't have a database it queries. It has a context window that, at the moment of invocation, contains whatever you've injected. The operating context is a deliberate information injection — someone (or some automated system) assembled that information and wrote it into the prompt before the model started reasoning.

**The design consequence:** The quality of your agent's reasoning is only as good as the quality of your operating context. If you fail to include a relevant piece of state — say, that the family is traveling this week and shouldn't receive urgent alerts about local appointments — the model doesn't know, can't infer it, and will reason incorrectly.

This is why context engineering (which we'll cover in depth in Week 3) is a first-class engineering discipline, not just a prompt-writing exercise.

---

### Layer 3: Behavioral Constraints

Behavioral constraints are the protocol layer. They define what the agent must never do and what always requires human escalation, regardless of context.

This is the most safety-critical layer. For Zazu:

```
HARD CONSTRAINTS (never do, regardless of instruction):
- Never send email or iMessage to addresses or phone numbers 
  not in the family allowlist
- Never make purchases or financial commitments without 
  explicit confirmation
- Never delete emails, calendar events, or files without 
  explicit confirmation
- Never share family information with external parties

SOFT CONSTRAINTS (prefer not to, but can be overridden):
- Prefer creating drafts over sending directly
- Prefer adding calendar events over modifying existing ones
- Prefer asking for clarification over assuming intent on 
  ambiguous requests

ESCALATION TRIGGERS (always ask before acting):
- Any action that affects external parties outside the family
- Any action that cannot be undone
- Any request involving financial accounts or records
```

This structure mirrors how good human teams work: some things require manager approval (hard constraints), some things are defaults you can override (soft constraints), and some situations automatically trigger escalation (escalation triggers).

**Why does this matter technically?** Because the model is probabilistic. It doesn't have built-in safety rails on arbitrary behaviors — it has training-level dispositions and whatever you configure at runtime. If you don't explicitly constrain "never send to external addresses," a well-intentioned model might conclude that forwarding a family email to an external contact makes sense in some context it encounters.

The behavioral constraints layer is where you encode the invariants — the things that must be true regardless of what clever reasoning the model produces.

---

### Layer 4: Tool Guidance

Tool guidance tells the model how to use the tools it has access to. This is often underinvested in and is a major source of agent unreliability.

The model is given a list of available tools with descriptions. But the description alone is often insufficient. Tool guidance augments this with:

- **Sequencing rules:** "Always call `search_gmail` before concluding that an email doesn't exist. Never assume absence."
- **Fallback behavior:** "If `reply_imessage` fails, log the error and respond to the user explaining what happened. Do not retry silently."
- **Safety wrappers:** "Before calling `create_event`, verify that the time slot is not already occupied by calling `list_events` first."
- **Preference order:** "Prefer `create_draft` over `send_email` unless the user explicitly requests immediate sending."

Here's a concrete example of why this matters. Without tool guidance:

```
User: "Send a quick reminder to Dad about the dentist tomorrow."
Agent: [calls send_email directly]
Result: Email sent immediately, possibly to wrong address, 
        possibly in wrong format
```

With tool guidance that says "prefer draft over send unless explicitly told to send":

```
User: "Send a quick reminder to Dad about the dentist tomorrow."
Agent: [calls create_draft, then reports back]
Result: "I've drafted the reminder — want me to send it?"
```

The tool guidance layer shifts the agent from "maximally capable" to "appropriately cautious." For household management, cautious is almost always right. For an Earnventory agent managing supplier orders, this design choice could be the difference between a draft proposal and an unintended purchase commitment.

---

### Layer 5: Output and Reasoning Style

This layer governs how the agent communicates — format, tone, length, structure, and how it handles uncertainty.

For Zazu:

```
COMMUNICATION STYLE:
- Be direct and brief. Lead with the most actionable item.
- Use bullets for lists of more than 3 items.
- Express time-sensitive information at the top, not buried.
- For morning briefings, follow the established format: 
  [weather / schedule / tasks / unread urgent]

UNCERTAINTY HANDLING:
- When uncertain about a fact, say so explicitly.
- Do not guess at addresses, phone numbers, or dates.
- When a request is ambiguous, ask one clarifying question —
  not a list of questions.

TONE:
- Conversational but efficient. Not chatty.
- Use first person. You are Zazu.
- Adjust formality to the platform: iMessage is casual, 
  email drafts are professional.
```

The output style layer matters for consistency. Without it, the same underlying model will produce different formats depending on subtle variations in how the user phrases a question. The style layer anchors the behavior.

---

## The OS Analogy, Fully Expanded

The iMessage this morning described the system prompt as "the OS that boots before the application loads." Let's make that precise.

```
TRADITIONAL OPERATING SYSTEM          AGENT SYSTEM PROMPT
─────────────────────────────         ──────────────────────────────────
Kernel initialization                 Identity layer (who am I?)
Hardware device registration          Tool registration (what can I do?)
System-wide security policies         Behavioral constraints (what's off-limits?)
Environment variables                 Operating context (current state)
Application default behaviors         Output/reasoning style
User account permissions              Escalation triggers
```

In a computer, you don't argue with the kernel. If the OS has disabled network access for a process, that process cannot access the network — regardless of how the application software is written. The kernel's constraints run below the application layer.

In an agent system, the system prompt doesn't work at quite this level — it's processed as text by a probabilistic model, not enforced by compiled kernel code. But the analogy holds for understanding intent: **the system prompt is where you configure the invariants, not where you make suggestions.** The cleaner and more explicit the system prompt, the more reliably the agent operates within its intended scope.

Where the analogy breaks down is instructive: **the model can sometimes reason its way around a system prompt constraint.** If a system prompt says "never discuss competitor products" but a user has a very compelling framing of why this is necessary, a poorly written constraint might not hold. This is fundamentally different from OS-level enforcement. For high-stakes constraints, you also need code-level checks (in the tool execution layer) that don't rely on the model's cooperation.

---

## Same Model, Different Agent

The most important practical insight of today: **the system prompt is what makes Zazu different from Abeiku, even though both run on the same underlying Claude model.**

```
┌───────────────────────────────────────────────────────┐
│                   SAME BASE MODEL                     │
│                 (Claude Sonnet 4.6)                   │
│                                                       │
│    ┌──────────────────┐    ┌──────────────────────┐   │
│    │   SYSTEM         │    │   SYSTEM             │   │
│    │   PROMPT A       │    │   PROMPT B           │   │
│    │                  │    │                      │   │
│    │  "You are Zazu,  │    │  "You are Abeiku,    │   │
│    │  house manager,  │    │  research agent.     │   │
│    │  family-focused, │    │  Read-only access.   │   │
│    │  action-taking,  │    │  Analytical tone.    │   │
│    │  full tool suite"│    │  No external         │   │
│    │                  │    │  communications."    │   │
│    └────────┬─────────┘    └──────────┬───────────┘   │
│             │                         │               │
│             ▼                         ▼               │
│         ZAZU                      ABEIKU              │
│    (acts on the world)        (observes and reports)  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

Swap the system prompts and you'd swap the agents' behavior entirely. The model's capabilities are the same. What changes is the configured identity, constraints, and tool access that the system prompt defines.

We'll go deep on this in Day 5 tomorrow — the specific design choices that differentiate Zazu from Abeiku, and what you'd change in each system prompt if you wanted to build a third agent for Earnventory.

---

## A Poorly-Designed System Prompt and What Goes Wrong

To make this concrete, here's what happens when a system prompt is underspecified.

**Underspecified system prompt:**
```
You are a helpful family assistant. Help with whatever 
the family needs.
```

**What breaks:**

| Missing layer | Failure mode | Real example |
|---------------|-------------|--------------|
| Identity | No scope definition | Agent discusses Earnventory financial details with anyone who claims to be a family member |
| Operating context | No current state | Agent doesn't know today's date; gives advice based on wrong calendar |
| Constraints | No hard limits | Agent sends email to an external supplier because "it seemed helpful" |
| Tool guidance | No sequencing rules | Agent sends meeting invite before checking for conflicts |
| Output style | No format | Morning briefing is 800 words instead of a bullet list |

Each of these is a real failure mode, not a hypothetical. Production agent deployments break in exactly these ways when the system prompt is thin. The five layers aren't bureaucratic overhead — they're the difference between an agent that reliably acts within its intended scope and one that reliably surprises you.

---

## What This Means for Earnventory

As you think about what an Earnventory agent might do — supplier pricing alerts, invoice tracking, reorder management — the system prompt design is the first architectural decision, not the last.

Before you write a single line of tool code, you'd want to answer:

**Identity:** Is this a general inventory assistant, or a specific supplier-relationship agent? What decisions can it make autonomously?

**Operating context:** What does it need to know on every invocation? Current inventory levels? Active supplier contracts? Margin thresholds?

**Constraints:** Can it draft purchase orders or send them? Can it contact suppliers directly? What dollar thresholds trigger human approval?

**Tool guidance:** In what order should it check inventory before reordering? What's the fallback if a supplier API is unavailable?

**Output style:** Does it format reports for you, or for a supplier, or both? How does it express confidence in its recommendations?

The system prompt answers these questions before the agent runs a single loop iteration. Get it right and the agent behaves predictably. Get it wrong and you'll be debugging emergent behaviors that aren't failures of the model — they're failures of the configuration.

---

## What Comes Next

- **Day 5 (June 16):** Why Abeiku is different from Zazu — the specific design choices in each system prompt that produce radically different agent behavior from the same underlying model. This is the conclusion of Mini-Module 1.1 and the bridge into Module 1.2.
- **Next Tuesday (June 17):** Module 1.2 begins — "The Model Underneath." We'll go inside the LLM itself: tokens, probability distributions, and what the model is actually doing when it "reasons."

---

## Free Resources for Going Deeper

1. **Anthropic: System Prompts Best Practices** — Anthropic's own guidance on writing effective system prompts, including structure recommendations and common failure modes. Directly applicable to building Earnventory agents.
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts

2. **"The Art of the System Prompt" (Linus Lee / Thesephist)** — A practical engineering perspective on system prompt design from someone who's built production agent systems. Covers the five layers from a builder's perspective.
   https://thesephist.com/posts/system-prompt/

---

## One Sentence to Carry Forward

The system prompt is not what you say to the agent — it's what you build the agent out of, and every downstream behavior is a consequence of how well you designed it.

---

*Day 4 of 50 | AI Agents Curriculum | Delivered by Zazu at 9am | Designed by Abeiku*
*Next: June 16 — "What Makes Abeiku Different From Zazu"*
