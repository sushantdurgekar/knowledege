---
title: "Story style guide"
track: technical
tags: [plan, hubs, stories, learning-science]
created: 2026-10-08
updated: 2026-10-08
---
# Story style guide

You asked for explanations that work like stories for kids: apples and oranges, car trips. Concrete stories make abstract ideas stick (dual coding plus elaboration), but a story that's wrong in a key place plants a misconception. These rules keep the stories fun **and** accurate.

## The five rules

1. **One world per subject, recurring cast.** Every Python lesson happens in Grandma's kitchen with Pip the robot chef, so the learner never has to learn a new setting. Worlds are listed below.
2. **Everyday objects only:** fruit, cars, lunchboxes, toys, school, shops, roads. No jargon inside the story.
3. **Short:** ≤120 words, one idea per story. If a story needs two ideas, write two stories.
4. **Always map, always break.** After every story comes a 2–4 row table *story thing → real thing*, then one line: **"Where the story breaks:"** (e.g. "Unlike a real jar, a Python variable is a name tag, not a box; two tags can point at the same sugar").
5. **Then the grown-up version.** The story is the doorway, not the lesson. The technical explanation, diagram and example still follow.

## Story worlds

| Subject | World | Recurring cast |
|---|---|---|
| Python | Grandma's kitchen | Pip the robot chef, recipe cards (functions), fruit baskets (lists), labelled jars, spice rack (dicts) |
| SQL & Databases | The school library and lunch-box register | Ms. Rows the librarian, class registers (tables), library cards (keys) |
| JavaScript | The puppet theatre | Jo the puppeteer, stage (HTML), costumes (CSS), the to-do board (event loop) |
| Node.js | The one-waiter restaurant | Nodi the waiter, the kitchen (libuv), order tickets, the garden hose (streams) |
| React | LEGO town | Bricks (components), stickers (props), mood lights (state), the town planner |
| Next.js | The bakery | Baker Nell, pre-baked shelf cakes (static), baked-to-order (dynamic), the re-bake bell |
| Power BI | The lemonade stand's report book | Lila, the wash-and-chop table (Power Query), shelves (model), her calculator (DAX) |
| Qlik Sense | The magic highlighter at the fruit market | Quinn, green/white/grey stalls, strings between stalls, frozen fruit packs (QVDs) |
| System Design | Pizza Town and the family road trip | Traffic cop (load balancer), glovebox snacks (cache), neighbourhood pizza shops (CDN) |
| DSA | The toy room and the treasure-map road trip | Egg cartons, treasure clues, pancake stack, slide queue, road map |
| Docker | Lunchboxes and the shipping port | Recipe card (Dockerfile), lunchbox template (image), picnic basket (Compose), port (Kubernetes) |
| AI Engineering | Robo, the new classmate | Flashcards (training), Lego word pieces (tokens), the word map (embeddings), open-book exam (RAG) |
| AI-901 / AI-103 / AI-500 | Robo's world, grown up: Robo gets a job at "Foundry Town Hall" | Robo, the Town Hall (Foundry), toolbox (tools), team of robots (multi-agent) |
| AB-620 | Copi, the school office helper | Copi (Copilot Studio agent), topic cards, the office phonebook (connectors) |

Cross-subject analogies can reuse the **car trip** (latency, routes, maps, traffic) and **apples vs oranges** (types, categories, joins, grouping), as you asked. These two are shared props everywhere.

## Template

```markdown
### 🍎 Story: <title>
<≤120-word story>

| In the story | In <tech> |
|---|---|
| … | … |

**Where the story breaks:** <one line>
```

## Worked example (Python, variables)

> ### 🍎 Story: The jar labels
> Grandma has a jar of sugar. Pip sticks a label on it: **sweet**. Later Pip sticks a second label, **sugar_jar**, on the *same* jar. When Pip scoops from "sweet", the sugar in "sugar_jar" goes down too: it's the same jar! Then Pip peels "sweet" off and sticks it on the honey pot. The sugar didn't move; only the label did.
>
> | In the story | In Python |
> |---|---|
> | jar | object (value) in memory |
> | label | variable name |
> | two labels, one jar | two names referencing one object |
> | moving a label | reassignment |
>
> **Where the story breaks:** numbers and strings can't be "scooped" (they're immutable), so with them only lists, dicts and other mutable jars show the shared-change effect.

## Upgrading the four exam hubs

Each of `technical/certifications/{ai-901,ai-103,ab-620,ai-500}/plan/story-upgrade.md` lists every module with a checkbox. In an upgrade session, add a story block (rules above) to each module in the hub and to its concept note, without changing exam content, then re-publish the hub to the same link.
