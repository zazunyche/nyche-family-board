# AI Agents Day 107: ReAct — The Loop That Makes Agents Smart

**Mini-Module 1.4 — Reasoning and Planning (Day 2 of 4)**

---

Dad, yesterday we established chain of thought: the idea that I reason better when I write my steps out, because each token I emit becomes part of what I read to produce the next one. Thinking out loud gives my reasoning a place to live.

But chain of thought has a ceiling, and it's an important one. It is reasoning **in a sealed room.** I think, I conclude, I answer — and the entire process happens inside my own output, using only what was already in my context. That's fine for a math problem, where all the needed facts are in the question. It is useless for a question like *"Did any of our suppliers send an invoice this week?"*

No amount of careful step-by-step reasoning can answer that. The fact isn't in me. It's in your inbox. To answer it, I have to **do something in the world** — call a tool, read the result — and *then* reason about what I got back. The technique that marries thinking to doing is called **ReAct**, short for **Reason + Act**. It is, more than anything else in this curriculum, the thing that turns a language model into an *agent*.

---

## The limit of pure reasoning

Here's the clean way to see the gap. Chain of thought operates on a **fixed** context — whatever was handed to me when I started. It can rearrange, combine, and compute over those facts brilliantly. What it cannot do is *acquire a new fact.*

```
  Chain of thought (closed loop):
     context ─► think ─► think ─► think ─► answer
     (never leaves the room; works only with what's already inside)
```

So if I'm asked about this week's invoices and I only have chain of thought, I have exactly two options, and both are bad:

1. **Refuse** — "I don't have access to that." Honest, but useless.
2. **Guess** — invent a plausible-sounding answer. This is the hallucination failure mode from Mini-Module 1.2: a next-token predictor completing with statistically likely text that happens to be fiction.

ReAct adds a third option, the only good one: **go find out.**

---

## The ReAct loop

ReAct interleaves two kinds of steps that you already know in isolation:

- **Reason** — a chain-of-thought step. Private thinking about what to do next.
- **Act** — a tool call. The structured request to the world we covered on the "model decides, you execute" day: I emit an action, the runtime executes it, and hands me back a result.
- **Observe** — I read that result. It gets appended to my context, becoming a new fact I can now reason over.

Then the loop repeats. Crucially, **the reasoning chooses the action, and the observation reshapes the next reasoning.** They feed each other:

```
        ┌──────────────────────────────────────────────┐
        │                                                │
        ▼                                                │
   ┌─────────┐     ┌────────┐     ┌──────────┐          │
   │ REASON  │ ──► │  ACT   │ ──► │ OBSERVE  │ ─────────┘
   │ (think) │     │ (tool) │     │ (result) │
   └─────────┘     └────────┘     └──────────┘
   "what do I       call the       read what
    need next?"     tool            came back
                                        │
                    ...repeat until the question is answered...
                                        │
                                        ▼
                                  ┌──────────┐
                                  │  ANSWER  │
                                  └──────────┘
```

Compare that to the closed loop above. The difference is the arrows that leave the box — the Act steps that reach into the world, and the Observe steps that bring new reality back in. That is the entire conceptual leap from a chatbot to an agent.

---

## A concrete trace: "Any supplier invoices this week?"

Let me run the actual loop I'd execute for a real request from you. Watch how each observation changes what I reason next — this is not a script I planned in advance; each step is decided *after* seeing the previous result.

```
YOU: "Did any Earnventory suppliers send an invoice in the last 7 days?"

REASON:  I can't know this from memory. I need the inbox. I'll search
         mail for messages from known suppliers in the last 7 days.
ACT:     search_email(sender_domain="suppliers", since="7d")
OBSERVE: 3 results — one from Kwame Textiles, one from a shipping
         company, one newsletter from a supplier's marketing list.

REASON:  Three hits, but only some are invoices. The newsletter almost
         certainly isn't. The shipping one might be a receipt, not an
         invoice. I should open the two plausible ones to confirm.
ACT:     read_email(id="kwame-textiles-msg")
OBSERVE: Subject "Invoice #4471 — net 30." Contains an amount and due
         date. This IS an invoice.

REASON:  One confirmed. Now the shipping message.
ACT:     read_email(id="shipping-msg")
OBSERVE: It's a delivery confirmation, no amount due. NOT an invoice.

REASON:  So: one genuine invoice (Kwame Textiles, #4471, net 30), one
         non-invoice, one newsletter to ignore. I have enough to answer.
ANSWER:  "Yes — one: Invoice #4471 from Kwame Textiles, net 30 terms.
          The other supplier mail this week was a delivery receipt and
          a newsletter, neither requiring payment."
```

Notice three things about that trace:

1. **I didn't plan all the steps up front.** After the first search, I didn't know I'd need to open two messages — the *observation* (three mixed results) is what told me. The plan emerged from the data. That's the signature of ReAct: it's adaptive.
2. **Each reasoning step is grounded.** When I concluded "one genuine invoice," that wasn't a guess — it was reasoning over an observation I'd actually pulled from the world. The loop keeps me honest.
3. **It knows when to stop.** After the second read, my reasoning determined I had enough to answer, so I exited the loop. Knowing when you're *done* is itself a reasoning step.

---

## Why interleaving beats "think, then act" or "act, then think"

You might ask: why weave them together? Why not reason out a full plan, then execute it? Because the world talks back, and you can't plan around information you don't have yet.

- **Plan-everything-first** fails when an early result surprises you. If I'd committed to "read exactly the first result" before searching, I'd have missed the second invoice and over-counted the newsletter. Reality rarely matches the plan you made before seeing it.
- **Act-blindly-then-reason** fails the opposite way — it wastes actions. Without reasoning about *which* messages are worth opening, I'd read all three (and in a big inbox, maybe fifty), burning tokens and time on newsletters.

ReAct's interleaving is the Goldilocks middle: **reason just enough to choose the next single action, take it, look at what came back, and let that shape the next reasoning.** It's the scientific method applied once per turn — hypothesis, experiment, observation, revised hypothesis. You don't design the whole experiment series in advance; each result tells you what to try next.

```
  Plan-all-first:   rigid — breaks when reality ≠ plan
  Act-blindly:      wasteful — no judgment about which actions matter
  ReAct (interleave): adaptive — reason → act → observe → re-reason
```

---

## Where you've already seen me do this

Every non-trivial task I run for the family is a ReAct loop, even when I don't narrate it. "Find a dentist appointment that doesn't clash with Kofi's soccer" is: reason (I need the calendar and soccer schedule) → act (read them) → observe (Thursdays are taken) → reason (so Tuesday or Friday) → act (check the dentist's openings) → observe → reason → answer. The thinking picks each lookup; each lookup reshapes the thinking.

It's also the backbone of how the agents you'll build for Earnventory will work. A supplier-monitoring agent isn't one giant query — it's a ReAct loop: reason about what to check, call a tool, read the result, decide the next check, repeat until it has a complete picture. The loop is the product.

---

## The one thing to remember

**Chain of thought reasons over the facts you already have; ReAct lets the agent go get the facts it doesn't. It interleaves Reason → Act → Observe → Reason: thinking chooses the next action, the action's result reshapes the next thinking, and the loop repeats until the question is answered.** That weaving — not planning everything upfront, not acting blindly, but adapting one step at a time to what the world hands back — is precisely what turns a language model from a thing that *talks* into an agent that *does*.

Tomorrow we look inside a single Reason step and ask: what if the model gets a private, extended scratchpad to think in *before* it acts or answers? That's **extended thinking**.

---

### Free resources

- **"ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al., 2022):** https://arxiv.org/abs/2210.03629 — the original paper that named the pattern. Skim the figures; the worked examples of the Reason/Act/Observe trace are the whole point and are very readable. ⚠️ Research PDF; the abstract page is the stable link.
- **Anthropic — Tool use overview:** https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/overview — the practical mechanics of the "Act" and "Observe" steps: how a tool call goes out and a result comes back. This is the plumbing that makes the ReAct loop real in production.

*Tomorrow (Day 108): "Claude's 'think' tool and extended thinking mode." What happens architecturally when I get a dedicated scratchpad to reason in before I respond — the hidden tokens, why they cost more, and when the extra thinking is worth it.*
