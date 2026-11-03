AI Agents Day 66: Module 2 Begins — Tool Calls Are Structured Text, Not Magic

**Concept:** Module 2 starts here. Everything in Module 1 was about how agents think. Module 2 is about what they *do* — and it starts with a fact that surprises most people: Claude never executes anything. When it needs to call a function, it outputs a structured text block called a `tool_use` block that says "I want to call X with these inputs." Your application reads that text, does the actual work, and returns the result. Claude then continues from what you gave back. The model is a decision-maker. Your code is the executor. They never overlap.

**Example:** Ask a Claude-powered Earnventory agent to check inventory for SKU-482. Claude doesn't query your database — it outputs `{"name": "get_inventory", "input": {"sku": "SKU-482"}}`. Your app hits the database, gets `{"stock": 14, "threshold": 20}`, returns it. Claude reads that and continues. Your database, your rules, your execution.

**Analogy:** Claude is a restaurant customer writing an order ticket. The kitchen (your code) does the cooking. Claude never enters the kitchen — it just waits for the plate.

Tomorrow: how to write tool *descriptions* that reliably guide what Claude orders — and what makes them fail.
