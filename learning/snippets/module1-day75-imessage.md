AI Agents Day 75: Orchestrator and Subagent — The Fundamental Pattern

**Concept:** The orchestrator/subagent split is the basic architectural unit of multi-agent systems. One agent receives the goal and decides how to decompose it. Other agents — subagents — each receive a narrow, specific task with their own isolated context window, execute it, and return a result. The orchestrator doesn't do the work. Subagents don't know the user. They don't know each other. They just know their task. The isolation is the point: each agent holds only what it needs, which is how you get past the single-agent ceiling you saw yesterday.

**Example:** Earnventory supplier risk report. Orchestrator gets the goal: "risk-rank all active suppliers." It delegates: Subagent A reads and summarizes 30 days of supplier emails. Subagent B checks inventory levels and flags at-risk SKUs. Subagent C receives both summaries and writes the final report. The orchestrator never reads a raw email. It manages delegation and stitches the outputs — that's its whole job.

**Analogy:** The orchestrator is a project manager. Subagents are specialists brought in for specific deliverables. The PM knows what needs doing; the specialists know how. Neither does the other's job.

Tomorrow: what actually travels in a handoff between agents — and what, by design, does not.
