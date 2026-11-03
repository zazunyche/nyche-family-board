**AI Agents Day 47: Observability — Logging What Matters**

When your agent does something wrong, the question isn't just *what* it output — it's *how did it get there*. Inputs, tool calls, tool results, reasoning traces, token counts, latency: each is a layer of the trajectory. If you only log the final answer, you can't diagnose the mistake.

Earnventory example: your agent sends a duplicate purchase order at 3am. Did it misread the inventory tool result? Hallucinate a stock count? Get confused mid-conversation? Without trajectory logging, you're debugging blindfolded. With it, you replay the exact sequence: turn 3, `get_inventory` returned null (network timeout), agent filled in a plausible stock number, turn 7, it placed the order on that hallucinated value.

This is why **trajectory evaluation** matters as much as output evaluation. Output eval tells you *that* it was wrong. Trajectory eval tells you *where* and *why* — which is the only thing that lets you fix it.

**Analogy:** A flight data recorder doesn't just capture the crash — it records altitude, heading, throttle, control inputs for the whole flight. Investigators need the trajectory. Your agent logs are the black box.

Tomorrow: the reversibility principle — why your agent's default should always be to prefer the action it can take back.
