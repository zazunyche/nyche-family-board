**Day 39 of 50 — Building the Agentic Loop by Hand**

Yesterday you learned how to structure the prompt. Today: what happens at runtime when the model actually calls a tool.

The agentic loop is five steps, repeated until the model says it's done:

1. **Call** — send the conversation (with tools defined) to the Claude API
2. **Check stop_reason** — if `end_turn`, you're done; if `tool_use`, continue
3. **Parse** — extract the `tool_use` block: which tool, which arguments
4. **Execute** — your code runs the tool and gets a real result
5. **Append + repeat** — add the assistant's message AND the tool result back to the conversation, then call the API again

That last step is the part people miss. You don't just send the tool result — you send the full conversation history including the model's prior message, then the result. Claude needs to see its own reasoning to continue coherently.

One tool call = two extra API turns. A five-tool workflow = six API calls minimum.

**Analogy:** It's a relay race where the baton is the conversation history. The model runs its leg, hands off (tool call), you run yours (execution), then hand the baton back with everything that happened. Drop the baton and the race stops.

Tomorrow: what the Claude Agent SDK does so you don't have to manage this loop yourself.
