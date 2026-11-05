# Live-quiz feature research (Kahoot comparison)

Researched 2026-11-05 to find features worth adding to the Study Hubs live quiz. The quiz is an
original product: the goal was to learn which game mechanics help learning and engagement, not to
copy another product's design, names or assets.

## Sources (accessed 2026-11-05)

- Kahoot! help center, "Kahoot! question types" — <https://support.kahoot.com/hc/articles/115002308428>
  (word cloud, slider, pin answer, brainstorm, open-ended; availability depends on plan).
- Kahoot! help center, "Live game settings" — <https://support.kahoot.com/hc/articles/115016055107>
  (player identifier, show questions on devices, randomize answer order, reactions, nickname
  generator, auto-play, lobby music).
- Kahoot! blog, "Generate funny nicknames…" — <https://kahoot.com/blog/2017/11/09/generate-funny-nicknames-players-live-kahoots/>
  and "Tips to keep nicknames appropriate" — <https://kahoot.com/blog/2019/03/08/tips-keep-kahoot-nicknames-appropriate/>
  (adjective + animal names, three spins).
- Kahoot! blog, "Introducing slide reactions" — <https://kahoot.com/blog/2023/07/06/student-centered-learning-with-kahoot-2/>;
  Kahoot! 360 newsletter Q1 2026 — <https://support.kahoot.com/hc/en-us/articles/32724784125725> (reactions on by default).
- Kahoot! help center, "How to download and use spreadsheet reports" — <https://support.kahoot.com/hc/articles/360035547493>
  (raw data: one row per player per question; difficult questions; players who need help).
- Kahoot! blog, word clouds tech tip — <https://kahoot.com/blog/2022/08/23/tech-tip-word-clouds/>.
- Answer-streak bonus: only a fan wiki described it (TV Tropes); treated as unverified and designed
  independently.

The help-center pages could not be opened directly from the build environment (network policy);
the facts above come from search-result summaries of those pages.

## Gap analysis

| Idea | Study Hubs before | Decision | Why |
|---|---|---|---|
| Word cloud | — | **Built** (`cloud` item) | Cheap engagement; good opener and reflection prompt; no score |
| Slider / numeric guess | — | **Built** (`slider` item, ± margin, unit) | Estimation is a real skill (latency, cost, percentages) in cert prep |
| Friendly nickname generator | Free-text names, host can remove | **Built** (room option + "suggest" on any join) | Classrooms and company meetings; nothing inappropriate on the big screen |
| Reactions | — | **Built** (6 emoji, rate-limited, coalesced) | Engagement on the shared screen at almost no server cost |
| Auto-play (self-running game) | Host clicks Next | **Built** (results 5–20 s, slides 12 s) | Lets the host present and talk; kiosk/lobby screens |
| Randomize answer order | Fixed order | **Built** (per room, same for all) | Re-runs with groups who have seen the quiz |
| Answer-streak bonus | Streak shown, no points | **Built** (+100 per step, max +500, optional) | Rewards sustained attention; capped so speed and accuracy still dominate |
| Per-player, per-question report | Rank CSV + insights | **Built** (full CSV + "may need help") | Teachers and managers follow up individually |
| Lobby music | — | **Built** (synthesised, optional, presenter only) | Atmosphere while people join; off with Sound off |
| Podium celebration | Podium | **Built** (confetti; none with reduced motion) | Closure moment |
| Show questions on devices | Already on | — | Study Hubs always shows the question on the phone (better for accessibility) |
| Team mode | Built in PR #13 | — | — |
| AI question generation | Built in PR #14 | — | — |
| Self-paced challenge with deadline | Built in PR #13 | — | — |
| Pin answer (tap a spot on a picture) | — | Deferred | Needs a hotspot editor and touch-precise answering; larger effort |
| Brainstorm (ideas, then voting) | — | Deferred | Two-phase item with moderation; larger effort |
| Ghost mode (replay against earlier players) | — | Deferred | Needs stored per-question timing of past rooms |
| Power-ups | — | Not planned | Gamification that rewards luck over learning |

## Learning-science notes behind the choices

- Word clouds and polls are **retrieval and reflection prompts**, not assessment, so they never
  score.
- Slider questions with a margin reward **calibrated estimation**; the reveal shows the spread so
  the group sees how far off it was.
- The streak bonus is capped (+500 vs 1000 per question) so it cannot outweigh a right answer.
- The full report and the "may need help" list support **follow-up**, where most learning value of
  a quiz is recovered.
