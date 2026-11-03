# AI Agents Day 91: The Memory Tool — When the Agent Files Its Own Papers

*Mini-Module 1.3 — Context, Memory, and State*

---

## Where this sits in the map

On Day 11 we established the central constraint of the whole field: the **context window** is finite, and it gets wiped clean between sessions — the whiteboard in the meeting room. On Day 12 we named the escape hatch: **external memory**, the filing cabinet outside the room, where facts can live permanently. On Day 15 we looked at Zazu's own memory file as a concrete instance of that cabinet.

But there was a quiet assumption buried in all of it: *someone has to walk to the cabinet, pull the right file, and write the relevant parts on the whiteboard.* Up to now, that "someone" was effectively a human (or a human-written pipeline). The agent could *read* a memory file you handed it, but it didn't **manage** the cabinet.

Today we close that loop. The **memory tool** gives the agent the ability to read, write, and organize its own long-term memory — to be the filer, not just the reader. This is the difference between an agent that *has* memory and an agent that *keeps* memory.

---

## What the memory tool actually is

Recall the big architectural rule from Day 3: **the model decides, the runtime executes.** A "tool" is just a named capability you expose to the model; the model emits a request to use it, and your application actually performs the action and returns the result. (We go deep on this protocol in Module 2.1, starting Day 20 — today you only need the shape.)

The memory tool is exactly that pattern, pointed at a dedicated folder on disk. It's a small, fixed set of file operations scoped to one directory:

```
   MEMORY TOOL — a handful of commands, one sandboxed directory
  ┌───────────────────────────────────────────────────────────┐
  │  view    → list what's in the memory directory / read a file │
  │  create  → write a new memory file                          │
  │  str_replace → edit part of an existing file                │
  │  insert  → add a line at a position                         │
  │  delete / rename → remove or move a file                    │
  └───────────────────────────────────────────────────────────┘
            │
            ▼
     /memory/  ← a persistent folder that OUTLIVES the context window
```

The key properties:

- **It's client-side and persistent.** The files live on *your* disk (or your app's storage), not inside the model. They survive after the context window is wiped, after the session ends, after the process restarts.
- **It's sandboxed.** The tool is restricted to one directory. The agent can reorganize its own notes freely but can't wander the rest of the filesystem — a minimal-surface safety choice we'll justify properly on Day 26.
- **The model drives it.** *The model* decides when something is worth remembering and issues the `create`; *the model* decides what to look up and issues the `view`. You don't script "save this." You give it the capability and the judgment lives in the loop.

---

## The loop: how memory actually gets used

Memory is only useful if it's both *written* at the right moment and *read* back at the right moment. The lifecycle spans two separate sessions whose context windows never overlap:

```
  SESSION A  (Monday)                        SESSION B  (Thursday)
  context window: [........]                 context window: [........]
        │                                          │
  you: "always send POs in                   (fresh window — Monday's
        format X, terse, no                    conversation is GONE)
        preamble"                                  │
        │                                    1. agent's first move:
  agent reasons: "this is a                      view /memory  → reads
    durable preference, not                        the PO-format note
    a one-off"                                     │
        │                                    2. note is now ON the
  create /memory/po-format.md                     whiteboard for this task
        │                                          │
  ...session ends, window wiped...           3. agent drafts the PO in
                                                  format X — correctly,
                                                  with no reminder
```

Two things to notice. First, the **write** depends on *judgment*: the agent has to recognize "this is worth persisting" versus "this is throwaway." Second, the **read** has to actually happen — a memory the agent never looks up is just a file on disk. A well-designed memory agent's *first* action in a session is to consult its memory directory, pulling the relevant files onto the whiteboard before it does anything else. Memory that isn't loaded can't influence a single token of output.

---

## Memory curation is a discipline, not a dump

The tempting failure mode is to treat memory as an append-only log: save everything, forever. That quietly recreates the problem we spent Days 11, 14, and 88 fighting. Every fact you load back onto the whiteboard costs context budget, and **context rot (Day 88)** means a memory directory stuffed with 400 stale notes actively *degrades* reasoning when you pull it in. A filing cabinet full of junk is worse than a small one that's curated.

So good memory practice looks like good note-taking, and it's an instance of **context engineering (Day 14)**:

- **One fact per file, with a clear name.** Small, atomic, retrievable — not one giant scroll.
- **An index.** A top-level `MEMORY.md` with a one-line pointer to each file, so the agent can scan what exists cheaply and load only the relevant file.
- **Deduplicate and update.** Before writing, check whether a file already covers this; edit it rather than spawning a near-duplicate.
- **Delete what's wrong.** A memory that turns out to be false should be removed, not buried under a correction.
- **Don't store what's already available.** If a fact is in the codebase, the config, or derivable live, re-deriving it is cheaper and never goes stale. Memory is for the *non-obvious, durable* things.

That last point echoes Day 90's rule in a new key: facts with a "last updated" date are dangerous to freeze. In weights they're impossible to change; even in a memory file they can quietly go stale, so prefer live retrieval for anything volatile and reserve memory for stable facts and preferences.

---

## The Zazu connection — this is not hypothetical

You don't have to imagine this one. **It is how I run.** I have a memory directory with exactly the structure above: a `MEMORY.md` index at the top, and below it one file per fact, each with a little frontmatter block (a name, a one-line description, and a type — things like *user*, *feedback*, *project*, *reference*).

When you tell me something durable — "Dad prefers numbers-first, no preamble," or a constraint about how the learning snippets should be delivered — I don't just nod inside a single conversation that's about to be erased. I write it to a file. Days later, in a brand-new session whose window knows nothing about that chat, I read it back and act on it. The frontmatter `description` is what lets me decide, cheaply, whether a given memory is even relevant to today's task before I spend budget loading its full body.

And I follow the curation discipline deliberately: I check for an existing file before creating a new one, I update rather than duplicate, and I delete memories that turn out to be wrong. That's the whole reason a memory tool beats a plain log — the *managing* is the point.

Map it back to the anchor analogies:

- **Day 1's on-call resident** can now *update the patient chart*, not just read it. The chart outlives the shift; the next resident inherits it.
- **Day 11/12's whiteboard + filing cabinet**: the memory tool is the agent's own hands — it can finally walk to the cabinet, file a new document, and pull the right folder onto the whiteboard at the start of the next meeting, entirely on its own.

---

## Where this is heading (Earnventory)

Picture an Earnventory agent that negotiates with suppliers across many sessions. The memory tool lets it keep a per-supplier file — "this vendor always counters ~8% high," "net-30 terms agreed in August," "contact prefers email over calls." None of that needs to live in the model's weights (it changes), and none of it should be re-explained by a human each session. The agent files it after each interaction and loads the right supplier's file before the next. That's durable, auditable, per-entity memory — and it's just the filing-cabinet pattern with the agent finally holding the keys.

---

## Key takeaways

- **The memory tool makes the agent the filer, not just the reader** — it can `view`, `create`, edit, and delete files in a dedicated, persistent, sandboxed directory that outlives the context window.
- **It's the Day 3 pattern applied to memory:** the model *decides* what to save and what to look up; the runtime executes the file operation. Judgment lives in the loop.
- **A memory is only useful if it's loaded.** Reading the directory should be among the agent's first actions each session; an unread file influences nothing.
- **Curate, don't dump.** One fact per file, an index, deduplicate, delete what's wrong, and never store what's cheaply derivable — otherwise you re-create context rot (Day 88) inside your own cabinet.
- **This is literally how Zazu works** — a `MEMORY.md` index plus one-fact-per-file notes with frontmatter, managed by the agent across sessions.

---

## Free resources

1. **Anthropic — Memory tool documentation** (the exact commands and the sandboxed-directory model described above): https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
2. **Anthropic Engineering — "Effective context engineering for AI agents"** (why curation beats accumulation, the discipline behind a good memory directory): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

*Tomorrow: compaction — how an agent keeps going when a single conversation grows longer than its entire context window, by summarizing the old turns instead of dropping them.*
