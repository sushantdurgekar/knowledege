---
title: "Hub spec: what every L1–L4 Study Hub contains"
track: technical
tags: [plan, hubs, spec]
created: 2026-10-08
updated: 2026-10-08
---
# Hub spec: what every L1–L4 Study Hub contains

Modelled on the AI-103 Study Hub (diagnostic, modules with a section table of contents, practice with "Explain my answer with Claude", teach-back graded by Claude, case studies, timed mocks, roadmap, chat). One self-contained HTML page per level, published as a private artifact and saved to `<subject>/hubs/<slug>-<level>-<label>-hub.html`.

## Tabs

| Tab | Contents | Sizing (per hub) |
|---|---|---|
| **Start** | What this level gets you, 12–15 question adaptive diagnostic with confidence ratings, hours/week input | 1 diagnostic |
| **Learn** | One module per topic in `levels.md`, in order (see module anatomy below) | 6–15 modules |
| **Practice** | Interleaved question bank weighted to weak topics; "Explain my answer with Claude"; "Generate 5 fresh questions" | ~8–10 items per module |
| **Flashcards** | Spaced repetition in the page; export button produces lines for `practice/srs/cards.jsonl` | 3–5 per module |
| **Build** | Labs and the level capstone: brief, steps, rubric, stretch goals, cost/teardown notes for anything cloud | 3–6 labs + 1 capstone |
| **Cases** | Scenario case studies (multi-question, story-framed) | 2–3 |
| **Exam** *(only if the level maps to a real certification)* | Blueprint with weights, 2 timed mocks in exam style, readiness gate | 2 mocks |
| **Interview** | Q&A with follow-ups, from "explain like I'm new" to "trade-off" questions | 15–25 |
| **Roadmap** | Modules + labs packed into weeks at the learner's pace, with progress tick-boxes | — |
| **Resources** | Rated, dated sources from `resources.md` | — |
| **Ask Claude** | Chat scoped to this level | — |

Progress (done modules, scores, card states) persists through an artifact storage capability, with a copy-for-Claude summary button so results can be logged into the vault.

## Module anatomy (every Learn module)

1. **Hook:** why it matters (a real failure, cost or exam weight).
2. **Pre-question:** asked before teaching; reveal after.
3. **Kid story** (≤120 words) from the subject's story world → **mapping table** (story thing → tech thing) → **where the story breaks** (one line, to stop misconceptions).
4. **Grown-up explanation:** 3–5 ideas, no more.
5. **Diagram:** inline SVG (theme-aware); Mermaid source also saved in the concept note.
6. **Worked example**, then a **faded example** the learner finishes (code, query, DAX, design sketch…).
7. **Socratic checks:** 2–3 "why/when/which" questions with misconception-specific feedback.
8. **Teach-back:** learner explains in 2–3 sentences; Claude grades against a rubric.
9. **Traps:** common mistakes / exam traps.
10. **Sources** with access dates; *exam-outline vs current product* notes where they differ.

## Level-specific emphasis

| Level | Emphasis | Assessment style |
|---|---|---|
| L1 Foundation | Concrete stories, lots of worked examples, guided labs | recall + simple application |
| L2 Proficient | Independent builds, debugging, choosing between options | scenario questions, code/query reading |
| L3 Specialist | Design trade-offs, performance, security, mentoring others | case studies, design critiques, review someone's work |
| L4 Expert | Architecture, standards, strategy, teaching | written ADRs, review packs, a talk outline |

L3/L4 leadership skills (estimation, mentoring, code review, stakeholder talks) are shared across all subjects. They live once in `softskills/` (communication, leadership) and every hub links there instead of repeating them.

## Quality gates (a hub isn't done until)

- Every fact with a version, limit, price or exam detail has a source and access date.
- An independent agent has re-checked answer keys, code samples and facts; fixes applied.
- All links return a live page whose title matches the label.
- Answer positions are shuffled; no "all of the above" giveaways.
- Works at phone width; light and dark themes; keyboard accessible.
- No real exam questions or brain-dump content: all items are original and written from the official objectives.
