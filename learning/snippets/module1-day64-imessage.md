AI Agents Day 64: The Complete Reasoning Workflow

**Concept:** You now have four reasoning tools. Chain-of-thought generates intermediate tokens that constrain what comes next — it's reasoning on the page. ReAct interleaves reasoning and observation across the agentic loop — it's reasoning across time. Extended thinking runs a private scratchpad before output — it's reasoning before committing. Planning decides the structure of work before execution — it's reasoning about the shape of the problem. None works alone. They compose, each operating at a different scope.

**Example:** Earnventory quarterly supplier review. Extended thinking: Claude reads the full task and silently maps the approach before generating anything. Upfront plan: five components identified and fanned out to subagents. Within each subagent: ReAct drives the investigation — reason, act, observe, reason again. Within each ReAct reasoning step: chain-of-thought makes the individual inference explicit. Four layers, each handling a different granularity of the problem.

**Analogy:** A chess grandmaster plays a tournament, not a move. Extended thinking is pregame prep — reading the opponent's style. Planning is the opening theory — 15 moves mapped before sitting down. ReAct is mid-game adjustment — responding to what's actually on the board. CoT is the specific calculation — "if bishop takes knight, then..."

Tomorrow: Mini-Module 1.4 wrap-up — five questions to consolidate the full reasoning arc.
