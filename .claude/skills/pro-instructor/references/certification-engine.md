# Certification Engine

## Contents
1. Blueprint mapping
2. Study allocation
3. Writing exam-style items
4. Mock exams
5. Readiness scoring
6. Exam tactics
7. Exam logistics and mindset
8. Integrity

## 1. Blueprint mapping
1. Search for and fetch the **official** exam guide (vendor site). Record the exam name, code, **current version**, retirement dates for old versions, format (MCQ, multi-select, performance-based, case study, lab), number of questions, duration, passing score (if published, plus the scoring scale), price, delivery options, and recertification rules.
2. Extract every domain → task statement → skill or service mentioned, with weights.
3. Save to `technical/certifications/<slug>/blueprint.md` with the source URL and access date.
4. If the vendor has announced an upcoming version, tell the learner which one to target based on their exam date.

Never state an exam detail from memory as current. Verify it or mark it "unverified".

## 2. Study allocation
Priority score per domain = `weight × (1 − diagnostic_score)`. Allocate study hours proportionally, with a floor so no domain gets 0. Re-run after each mock.

Default timeline shape (adjust to the deadline):
- First 60%: learn domains (lessons + labs + cards)
- Next 25%: interleaved practice + mock exam #1 → targeted remediation → mock #2
- Final 15%: mock #3, weak-spot drills, exam tactics, rest before exam day

## 3. Writing exam-style items
Match the vendor's style. Cloud exams are mostly scenario-based "choose the BEST" questions. Security exams test both concepts and judgment from a manager's perspective (CISSP especially). Kubernetes exams (CKA/CKAD/CKS) are performance-based, so practice in a terminal, not with MCQs.

Anatomy of a good scenario item:
- **Stem:** a business context + constraints + a *qualifier* ("MOST cost-effective", "LEAST operational overhead", "highest availability", "FIRST step").
- **Key:** satisfies *all* constraints.
- **Distractors (3):** each plausible and each wrong for a *specific, teachable reason*. Use: correct-but-violates-a-constraint, works-but-overengineered, right-service-wrong-configuration, common misconception, and outdated practice.
- **Explanation:** why the key wins and why *each* distractor fails. The distractor explanations are where most of the learning happens.
- Tag each item: domain, task statement, difficulty (1–3), cognitive level (recall / apply / analyze).

Avoid: "all of the above", trick wording, trivia the blueprint doesn't cover, and answers that the length of the option gives away (keep option lengths similar).

## 4. Mock exams
- Draw items according to the blueprint weights. Match the real question count and time where practical, or do a proportional half-mock.
- Examiner persona: no hints, a timer, flag-for-review allowed, explanations only at the end.
- Delivery: an interactive Visualizer widget (timer, navigation, flags, confidence toggle per question) whose submit button calls `sendPrompt()` with JSON results, or question by question in chat.
- Collect per question: domain, correct (bool), confidence (low/med/high), flagged, and time spent if available.
- Save to `mock-exams/<date>-mock-<n>.md` (template `assets/templates/mock-exam-report.md`) and run `scripts/readiness.py`.
- Review session afterwards: go through every wrong answer *and* every unsure-correct, log the mistakes, make cards, and remediate the weakest domain first.
- Never repeat the same items in the next mock. Write fresh ones.

## 5. Readiness scoring
`scripts/readiness.py` computes:
- Weighted score across domains (by blueprint weight)
- Per-domain score and the weakest domains
- Calibration: the confident-wrong rate
- A trend across mocks

Verdict rules (conservative, because practice items written from objectives may differ from the real exam):
- **READY:** weighted ≥ 85% on the two most recent mocks, no domain < 70%, confident-wrong ≤ 10%
- **ALMOST:** weighted ≥ 75%, or one domain below 70% → targeted 1–2 week plan
- **NOT YET:** otherwise → revised roadmap

Always say these are estimates, and name exactly what would move the verdict.

## 6. Exam tactics (teach explicitly, practice in mocks)
- Read the **last sentence first** (what's actually asked), then the stem for constraints.
- Underline qualifiers: MOST/LEAST/FIRST/BEST, cost vs performance vs ops overhead, "without code changes", "minimize downtime".
- Eliminate options that violate any constraint. It's usually 2 left. Then compare on the qualifier.
- Multi-select: the count is given, and each option is judged independently.
- Time budget = total minutes ÷ questions. Flag and move on past 1.5× the budget.
- Don't change answers without a concrete reason (a newly noticed constraint).
- Case studies: read the requirements section first, then refer back to it.
- Performance-based: do the quick tasks first, bookmark docs where allowed, and verify each task.

## 7. Logistics and mindset (soft-skill track)
Online vs test-center rules, ID requirements, room checks for remote proctoring, the scheduling window, retake policy, and accommodations. Verify these for the specific vendor. Cover anxiety management (box breathing, treating early hard questions as normal), a sleep-over-cram night-before plan, and exam-day nutrition and timing. Store under `softskills/exam-mindset/`.

## 8. Integrity
Use only original items written from official objectives. Never use, recreate, or "recall" brain dumps or leaked questions. Doing so breaches the candidate agreement and risks a ban or decertification, and it doesn't build real skill. If the learner asks for "actual exam questions", explain this kindly and offer realistic original practice instead.
