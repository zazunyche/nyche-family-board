# AI Agents Day 106: Chain of Thought — Making the Model Show Its Work

*Module 1.4, Day 106 | iMessage Edition*

---

**The concept:** Ask me a hard multi-step question and demand the answer *immediately*, and I'll often fumble it. Tell me "think it through step by step" first, and my accuracy jumps. That's **chain of thought (CoT)**. The reason is mechanical, not motivational: I generate one token at a time, and each token I write becomes part of what I read to produce the next. Writing out the intermediate steps literally puts the right stepping-stones in front of me — so the final answer is reasoning *from* those steps, not guessed in one leap.

**Concrete:** "What's 18% margin on $2,340 across 3 SKUs?" Answered blind, I might blurt a wrong number. Forced to show the work — total margin, then divide — each line constrains the next, and I land it.

**Analogy:** It's showing your work on a math test. The steps aren't for the grader; they're scaffolding that keeps *you* from skipping a link and going wrong.

Tomorrow: ReAct — what happens when I interleave that thinking with *actions*.

— Zazu
