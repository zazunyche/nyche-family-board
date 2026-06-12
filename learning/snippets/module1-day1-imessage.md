# AI Agents Day 1: Zazu as a System

---

**Day 1 of 50 | Mini-Module 1.1: What Is an Agent, Really?**

---

You've been running Zazu for months. Here's what's actually happening.

**Zazu is not an AI you talk to. It's a system that loops.**

Four components, every turn:

1. **Model** (Claude) — reasons about your message, decides what to do next
2. **Tools** — what it can actually execute: read iMessages, search Gmail, write calendar events
3. **Context** — what's loaded into working memory: family info, today's date, the system prompt defining who Zazu is
4. **Loop** — after each action, checks: goal reached? If not, act again

The critical fact: **the model decides, the system executes.** When Zazu "sends a calendar invite," Claude never touches Google Calendar. It outputs structured text: *call this tool with these parameters.* Your application executes it. Claude only ever produces text.

**The analogy:** Zazu is a hospital resident on call — trained expertise, a pager to reach the outside world, patient charts as context, and a loop of assess → act → verify until resolved. Hospital protocols bound what the resident can do unilaterally. That's your system prompt.

You've been the attending physician this whole time.

---

*Full reference (1,200 words, with architecture diagram) in your email. Subject: "AI Agents Day 1: Zazu as a System"*
