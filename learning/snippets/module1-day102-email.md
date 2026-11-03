# AI Agents Day 102: When to Plan Ahead — and When Planning Backfires

**Mini-Module 1.4 — Reasoning and Planning**

---

Dad — this one closes out the Reasoning and Planning mini-module, and it's the piece that ties the last few days together. On Day 96 we did **chain of thought** (reason carefully in one pass). Day 99 was **ReAct** (reason, act, observe, reason again — a conversation with the world). Day 100 was **extended thinking** (a private scratchpad before I commit). All three are about *how* I think. Today is about *when* I think — specifically, how much of a task I should figure out **before** I start versus how much I should figure out **as I go**.

This is the single most practical planning question in agent design, and the honest answer is not "always plan" or "always react." It's a judgment call with a real structure behind it. Let me give you that structure.

---

## Two strategies, side by side

Imagine I'm handed a multi-step task. I have two pure strategies.

**Plan-first (deliberative).** Before taking a single action, I lay out the whole sequence: step 1, step 2, … step N. Then I execute the plan in order.

**React-only (reactive).** I don't plan ahead at all. I look at the current state, take the single best next action, observe the result, and *then* decide the next action. The "plan" only ever extends one step into the future.

```
  PLAN-FIRST                          REACT-ONLY
  ----------                          ----------
  [ think: step1→step2→...→stepN ]    [ look → act → observe ]
  then:                                       ↓ (result shapes next)
  do step1                             [ look → act → observe ]
  do step2                                    ↓
  do step3                             [ look → act → observe ]
  ...                                         ↓
  do stepN                             ...until done
  (plan made ONCE, up front)          (decide EACH step live)
```

Both can reach the goal. They fail in opposite directions, and that's the whole lesson.

---

## What each strategy is good at

**Plan-first is strong when the world is predictable and the steps are interdependent.** If I can accurately foresee what each step will produce, planning the whole chain upfront is efficient and coherent. It lets me catch ordering problems before they happen ("I can't book the room before I confirm who's coming"), allocate effort sensibly, and avoid wandering. Interdependence is the key word: when step 5 depends on a decision I make at step 2, seeing the whole shape at once prevents me from painting myself into a corner.

**React-only is strong when the world is uncertain and each result changes the picture.** If I genuinely can't predict what step 1 will return — the venue might be booked, the API might 429, the inbox might be empty — then a detailed 9-step plan built *before* step 1 is a fantasy. Most of it is guesses about a future I haven't observed yet. Reacting keeps me honest: I only ever decide the next step using information I actually have.

```
             predictable world        uncertain world
            ┌───────────────────┬───────────────────┐
 inter-     │  PLAN-FIRST wins   │   blend: loose     │
 dependent  │  (see the whole    │   plan + replan    │
 steps      │   shape at once)   │   as reality hits  │
            ├───────────────────┼───────────────────┤
 independent│  either is fine;   │  REACT wins (don't │
 steps      │  plan is tidy      │  guess the future) │
            └───────────────────┴───────────────────┘
```

---

## The failure mode nobody warns you about: over-planning

Everyone's instinct is "planning is good, so more planning is better." That instinct is wrong, and the way it's wrong is worth understanding deeply.

**A plan is a set of predictions about a world you haven't touched yet.** The moment you start executing, reality starts contradicting the predictions. A detailed upfront plan is at its most accurate the instant before you begin — and it decays from there. The longer and more detailed the plan, the more of it is built on assumptions that the very first action might invalidate.

```
  THE OVER-PLANNING TRAP

  make a 9-step plan  ──>  execute step 1  ──>  result ≠ what the
  (steps 2–9 assume                              plan assumed
   step 1 goes a                                     │
   certain way)                                      ▼
                                             steps 2–9 are now
                                             built on a false premise
                                                     │
      ┌──────────────────────────────────────────────┤
      ▼                                                ▼
  BAD: follow the stale plan anyway          GOOD: throw out 2–9,
  (confidently march off a cliff)            replan from where you are
```

Over-planning has two distinct costs. The first is **wasted effort**: I spent tokens and time reasoning through steps 6, 7, 8, 9 — and step 2's result just invalidated all of them. The second is more dangerous: **commitment to a stale plan.** Once I've written out a detailed plan, there's a pull to *follow* it, even as the ground shifts underneath. That's how an agent confidently marches through a sequence that stopped making sense three steps ago. The plan becomes a script I'm performing instead of a map I'm checking against reality.

There's a mirror failure, under-planning, where I react so myopically that I never see a cross-step conflict coming and back myself into a corner. But in practice over-planning is the more common and more seductive mistake, because it *feels* like diligence.

---

## The strategy that actually works: plan loosely, replan often

The resolution is neither pure strategy. It's **hierarchical**: plan at a *coarse* level, execute at a *fine* level, and replan whenever reality diverges from the plan.

- **Sketch the shape, not the script.** A good upfront plan is 3–5 big phases ("figure out who's coming → pick a venue that fits → confirm and book"), not 20 brittle micro-steps. The coarse plan gives direction without over-committing to guesses.
- **Execute the next phase reactively.** Within a phase, use ReAct — act, observe, adjust — because that's where the uncertainty lives.
- **Replan at the seams.** After each phase, check the coarse plan against what you now know. If it still holds, continue. If it doesn't, revise it. This is the single most important habit: treat the plan as *revisable*, not sacred.

```
  COARSE PLAN:  [ phase A ] → [ phase B ] → [ phase C ]
                    │             │             │
                reactive      reactive      reactive
                execution     execution     execution
                    │             │             │
                    ▼             ▼             ▼
                 replan?       replan?       replan?
             (does the coarse plan still make sense?)
```

This is, not coincidentally, close to how I actually operate on your longer tasks. I form a lightweight plan so I don't wander, then I react step by step, and I'm willing to tear up the plan the moment a tool result tells me the world isn't what I assumed.

---

## Why this matters for Earnventory

Picture an Earnventory agent handling: "a supplier emailed about a price increase — figure out the margin impact and draft our response." The over-planner writes a rigid 8-step plan upfront: open the email, parse the new price, pull the SKU, compute margin, compare to threshold, decide accept/reject, draft the email, send. Clean on paper.

Then step 2 reveals the "price increase" email actually covers **three** SKUs, not one, and one of them is already below your margin floor. The rigid plan has no slot for that. A plan-bound agent either ignores the complication (and drafts a wrong response) or grinds trying to force reality into its script.

The right design plans *coarsely* — "understand what changed → assess margin impact → decide → draft" — and executes each phase reactively. When step 2 surfaces three SKUs, the agent simply loops the assessment phase three times and replans the "decide" phase accordingly. The coarse plan survives contact with reality because it never committed to the details reality was always going to supply.

And the deeper point for anything you build: the irreversible steps (here, **sending** the email, or auto-accepting a price change) are exactly where a stale plan does the most damage. That's the thread straight into Module 2.4 — reversibility and human checkpoints. Plan loosely, react carefully, and never let a *plan* be the thing that authorizes an action you can't take back.

---

## The one thing to remember

**A plan is a prediction about a world you haven't touched yet — so plan coarsely, execute reactively, and replan the moment reality diverges.** Plan-first wins when the world is predictable and steps interlock; reacting wins when each result rewrites the picture. The seductive mistake is over-planning: a long, detailed plan feels like diligence but is mostly guesses, and worse, it tempts you to follow a script that stopped making sense three steps ago. Map the route before you leave — but when there's a crash on I-95, reroute from where you are. Don't re-drive the plan.

---

### Free resources

- **Anthropic — "Building effective agents"**: https://www.anthropic.com/engineering/building-effective-agents — the workflows-vs-agents distinction, and why simple, revisable structures beat elaborate upfront planning for most tasks.
- **"ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al.)**: https://arxiv.org/abs/2210.03629 — the foundational paper for interleaving planning with action and observation rather than planning everything up front. ⚠️ Technical, but the worked traces make the point concrete.

*Tomorrow (Day 103): the Mini-Module 1.4 quiz — five short questions on chain of thought, ReAct, extended thinking, and planning. Conversational, not graded — just so I can calibrate how deep to go next.*
