**AI Agents — Day 89: Prompt Caching**

Every API call re-sends the whole context — system prompt, tools, history — and you pay to process all of it, every turn. For an agent like Zazu carrying a big stable preamble, that's the same thousands of tokens billed again and again. Prompt caching fixes this: mark a stable prefix once, and the model stores the processed version. Later calls that start with the exact same bytes *read* from the cache instead of reprocessing.

The economics are stark: a cache *read* costs about 0.1× the normal input price — a ~90% discount on the repeated part. The catch: it's a prefix match. Change one byte early (a timestamp in the system prompt!) and everything after it is invalidated and re-billed. Cache entries also expire — 5 minutes by default, or a 1-hour option.

Analogy: it's the "in-cache" memory from Day 12 — like a chef's mise en place. Prep the stable ingredients once at the start of service; each order reuses the prepped station instead of chopping from scratch. But if you rearrange the station, you re-prep everything.

Tomorrow: fine-tuning vs. prompting — when to actually change the model's weights.
