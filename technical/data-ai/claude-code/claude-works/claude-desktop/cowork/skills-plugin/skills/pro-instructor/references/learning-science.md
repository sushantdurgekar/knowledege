# Learning Science Playbook

Each technique below covers *why* it works (so you can adapt it) and *how* to run it.

## 1. Retrieval practice (testing effect)
**Why:** Pulling information out of memory strengthens it far more than putting it in again. Re-reading feels productive but mostly builds familiarity.
**How:** Open sessions with due cards. End every concept with recall questions. Prefer free recall ("explain…", "what would happen if…") over recognition (multiple choice), except when rehearsing exam format.

## 2. Spaced repetition
**Why:** Memory decays on a curve, and reviewing just before you'd forget resets it to a slower decay.
**How:** `scripts/srs.py` implements SM-2. Grade honestly:
- 5 = instant, confident · 4 = correct after thought · 3 = correct but shaky
- 2 = wrong but "oh right" · 1 = wrong, vaguely familiar · 0 = blank
Grades below 3 reset the interval. Cap warm-ups at about 10 cards and leave the rest for later in the session. Add 2–4 cards per concept, never 15.

## 3. Interleaving
**Why:** Exams don't announce the topic. Mixing problem types trains the learner to *identify which concept applies*, which is the hard part.
**How:** After a domain has been introduced, mix practice across it and earlier domains. Blocked practice is fine for a first exposure only.

## 4. Elaboration and self-explanation
**Why:** Connecting new information to existing knowledge creates more retrieval paths.
**How:** Ask "why does this work?", "how is this like X you already know?", "when would this be the wrong choice?"

## 5. Dual coding
**Why:** Verbal and visual memories are partly separate systems, so encoding in both gives two routes back.
**How:** Pair each concept with one diagram: architecture boxes, a flowchart, a decision tree, or a 2×2. Save the Mermaid source in the note.

## 6. Concrete examples and analogical encoding
**Why:** Abstract rules don't transfer until they're anchored to concrete cases, and *comparing two analogous cases* extracts the underlying principle better than studying one.
**How:** Give an analogy, then **say where it breaks**. That's where the real understanding lives. Example: "A security group is like a bouncer with a guest list who remembers who left (stateful); a NACL is a turnstile that checks you both ways (stateless). The analogy breaks because NACLs also have numbered rule order…"
Prefer analogies from the learner's world. Read their profile (e.g. analytics/BI background → explain partitioning via Qlik QVD layering, or streaming via incremental reloads).

## 7. Worked examples → fading (cognitive load)
**Why:** Novices drown solving from scratch, because working memory holds about 4 chunks. Worked examples free capacity for understanding the schema. As expertise grows, the examples become redundant (expertise reversal), so fade them.
**How:** Full worked example → partially completed → independent → novel twist.

## 8. Scaffolding and the zone of proximal development
Aim for about 70–85% success on practice. Lower than that, add support (smaller steps, hints, an example). Higher than that, remove support and raise the difficulty (scenario questions, constraints, "design it cheaper").

## 9. Socratic questioning
Question ladder, from shallow to deep:
1. Clarify: "What do you mean by 'secure' here?"
2. Probe assumptions: "What are you assuming about the traffic direction?"
3. Evidence: "What in the docs supports that?"
4. Implications: "If that's true, what happens at 10× load?"
5. Alternatives: "What would someone choosing the other option argue?"
6. Meta: "Which part of this question was hardest to reason about?"

Give hints in levels: nudge → pointed hint → partial answer → full answer with explanation. Never jump straight to level 4 unless they ask.

## 10. Misconception diagnosis (active listening in text)
A wrong answer is data. Classify it:
- **Knowledge gap.** They never learned it → teach.
- **Misconception.** They hold a wrong model → surface it ("It sounds like you're picturing X as…?"), create cognitive conflict with a counter-example, then rebuild the model.
- **Confused neighbors.** Two similar concepts are swapped → build a side-by-side comparison table and add a discrimination card.
- **Misread.** They knew it but missed a qualifier → exam-tactics coaching.
- **Careless or time pressure.** → pacing practice.
Also read the signals in their text: hedging ("I think maybe"), over-short answers, and frustration. Slow down, encourage, or offer a break accordingly. Log misconceptions to the subject's `misconceptions.md` and to `mistakes.jsonl`.

## 11. Metacognition and confidence calibration
Ask for confidence (low/med/high) on quiz answers. Track four quadrants:
- confident-correct (solid) · unsure-correct (fragile → card) · unsure-wrong (gap → teach) · **confident-wrong (dangerous → top priority)**
Show the learner their calibration. Overconfidence is the #1 exam killer.

## 12. Feynman teach-back
Learner explains to an imagined junior in plain words. Gaps show up as jargon, hand-waving, or skipped steps. Ask about precisely those.

## 13. Generation and pre-testing
Asking a question *before* teaching (even if they get it wrong) improves later learning. Use a pre-question to open every micro-lesson.

## 14. Motivation and habits
- Show progress visually (roadmap % complete, readiness trend).
- Keep sessions completable: a session that ends with one concept done beats an abandoned marathon.
- Normalize struggle: "This is the hardest part of the domain; getting it wrong now is how it sticks."
- Suggest an implementation intention: "When/where will you do tomorrow's 10-minute review?"

## 15. Mastery gates
Don't advance a dependent concept until the prerequisite passes a check (≈80%+). Prerequisite gaps compound.
