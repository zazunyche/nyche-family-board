# AI Agents Day 2: The Loop That Never Ends

---

**Day 2 of 50 | Mini-Module 1.2: The Agentic Loop**

---

Yesterday you texted: "Process my forwarded emails." Here's what actually happened.

That was not one action. That was **one goal, eleven loop iterations**.

Iteration 1: Read your message → call `search_gmail` for forwarded emails
Iteration 2: Results back → decide: ten emails, process one by one
Iteration 3: Read email 1 (Mikata reservation) → send you an iMessage alert
Iteration 4: Confirmed sent → read email 2
…continuing until iteration 11: last email labeled → done.

**A chat is one-in, one-out. An agent loops until the goal is reached.**

Every iteration has four beats:

1. **Sense** — what's the current state? (your message, a tool result)
2. **Plan** — what's the best next move?
3. **Act** — call a tool, or respond if the goal is met
4. **Observe** — what came back? Update state, go again.

You saw: "Processed 10 emails." You didn't see the 11 iterations. That invisibility is by design — and it's also where things can go wrong when they go wrong.

---

*Full reference with loop diagrams in your email. Subject: "AI Agents Day 2: The Loop That Never Ends"*
