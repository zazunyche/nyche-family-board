**Day 36 of 50 — Your First API Call to Claude**

Four parameters. That's the entire minimum viable Claude API call:

```python
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="You are an Earnventory inventory assistant.",
    messages=[{"role": "user", "content": "What is safety stock?"}]
)
print(response.content[0].text)
print(response.stop_reason)  # "end_turn"
```

`model` picks which Claude. `max_tokens` caps the output (not the input). `system` defines identity. `messages` is the conversation — you manage the history, the API doesn't. The response gives you text plus a `stop_reason`: `end_turn` means done; `tool_use` means Claude wants to call a tool and your loop needs to handle it.

**Analogy:** Placing a phone order at a restaurant. Who you're calling (model), time limit you set (max_tokens), who you are (system), your order (messages). They read it back (content) and say "that's everything" or "one more thing — hold on" (stop_reason).

Tomorrow: what makes a system prompt actually work — a before/after comparison showing the same call behaving completely differently based on the system prompt alone.
