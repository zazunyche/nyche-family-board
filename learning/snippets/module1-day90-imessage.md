**AI Agents — Day 90: Fine-Tuning vs. Prompting**

Back on Day 12 we named "in-weights" memory — what a model absorbed during training. Fine-tuning is how you *edit* that memory: take a base model, run extra training on your own examples, and the new behavior gets baked into the weights. Everything else — prompting, RAG, caching — leaves the weights frozen and feeds information in at inference time instead.

The rule that saves you money: fine-tune for *behavior*, not *facts*. Teaching an Earnventory agent to always answer in your exact PO format, tone, and structure? Good candidate — that's a stable pattern. Teaching it this week's supplier prices? Terrible — prices change, and retraining every time is absurd. Facts belong in RAG or the prompt.

Analogy: prompting is briefing a sharp contractor each morning — fast, flexible, nothing permanent. Fine-tuning is sending them to a six-week course so a skill becomes second nature. You don't send someone to night school to memorize today's headlines; you send them to learn a craft.

Tomorrow: the memory tool — how an agent reads and writes its own long-term memory.
