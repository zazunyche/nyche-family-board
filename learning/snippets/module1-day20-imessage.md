Day 20: Tool Calls Are Structured Text, Not Magic

Here's something that surprises most people when they first look under the hood: when Claude "calls a tool," it doesn't actually *do* anything. It writes structured text.

Here's the real sequence when Zazu checks your email:

1. Claude generates JSON: `{"name": "search_email", "input": {"query": "unread suppliers"}}`
2. The Claude Code runtime reads that block
3. *Your code* calls Gmail's API — Claude never touches it
4. The result gets appended to the conversation as a new message
5. Claude reads the result and responds

The model never holds the credentials. It never makes network calls. It produces a *request*, written in JSON. Your application is the one with the keys, the permissions, and the actual HTTP calls.

The boundary is clean: Claude writes the order slip. Your code fills the order.

Analogy: Claude is a surgeon dictating to a scrub nurse — "10mg of X, hand me a scalpel." The nurse executes. The surgeon never holds the syringe. The operating room protocols determine what the nurse is allowed to hand over.

Tomorrow: how to write tool *descriptions* that Claude can actually use reliably — vague names cause silent wrong calls.
