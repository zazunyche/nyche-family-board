**AI Agents — Day 88: Context Rot**

Here's a counterintuitive one: giving a model *more* context can make it *worse*. A 200K-token window doesn't mean 200K tokens of equal attention. Models reliably use what's at the very start and the very end of the context, but information buried in the middle gets "lost" — recall accuracy sags. And as a window fills, overall reasoning quality subtly degrades even before you hit the hard limit. This is "context rot."

Example: if Zazu is carrying 150K tokens of old conversation and you ask about one fact mentioned 80K tokens ago, it may genuinely miss it — not because it's gone, but because it's in the dead zone.

Analogy: it's like a whiteboard so crammed with notes that you can read the top and bottom lines clearly, but the middle is a smudge. More writing didn't help — it buried the thing you needed. The fix isn't a bigger whiteboard; it's erasing and rewriting only what matters.

That's why "just use the big window" is a trap, and why context engineering wins.

Tomorrow: prompt caching — how agents reuse context without re-paying for it.
