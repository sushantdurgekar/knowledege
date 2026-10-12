---
title: "An architecture review pack for a real system"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l4, lab]
status: new
created: 2026-10-12
updated: 2026-10-12
---
# Capstone: An architecture review pack for a real system

> System Design L4 · about 1800 min · modules m01, m02, m03, m04, m05, m06

Review a system you know well, such as one from work, an open-source project, or your own anomaly-detection or data platform project, the way a principal engineer would for an architecture review board. Write down its context and drivers, run a well-architected review, model its capacity and cost, decide its most important open questions as ADRs, plan its next big change as an incremental migration, propose the team structure that would support it, and review any AI components. Then present the pack to someone else and answer their questions.

## Deliverables
- Context and drivers (one page): what the system does, who depends on it, its constraints and its quality attributes, ranked with the stakeholders, plus a C4-style context and container diagram.
- A well-architected review: each pillar's questions answered honestly, the high- and medium-risk issues, and an improvement plan ordered by risk removed per day of effort, with owners and dates.
- Five ADRs in the repository's format, for the system's most consequential open decisions, each with drivers, at least three options, a weighted matrix where it helps, the sensitivity point, consequences, and the fitness function or metric that will show whether it's working.
- A capacity and cost model: today's peak and a twelve-month forecast with growth and known events, capacity per instance from a load test plan with an open (arrival-rate) model, headroom for a zone loss, a monthly cost with the commitment level justified, and the unit cost per request or per customer.
- A migration roadmap for the biggest change the system needs: strangler fig or expand-and-contract steps, the data migration with dual writes, backfill and verification, rollback at each step, and the success metrics that move it on.
- A socio-technical view: today's teams and their interactions, where changes cross team boundaries, and a target team structure using Team Topologies' types and interaction modes.
- If the system has AI components: serving, cost and latency targets, retrieval and permissions, guardrails for any actions, and the evaluation set. If it doesn't, a one-page proposal for where AI would help and what it would need.

## Steps
1. Pick the system and the audience; agree the scope and the decision-makers; collect diagrams, metrics, incident history and costs.
2. Write the context and drivers, and run the well-architected review with someone who knows the system.
3. Build the capacity and cost model from real metrics and prices, and write the load test plan.
4. Draft the five ADRs and the migration roadmap; review them with an engineer from the team that owns the system.
5. Add the team view and the AI review, assemble the pack, present it, record the questions, and revise.

## Rubric
- Every recommendation traces back to a stated driver, a risk or a number; nothing rests on fashion or preference.
- The ADRs record real alternatives and their trade-offs, including the sensitivity point and what would make you revisit the decision.
- The capacity and cost model states its assumptions, survives a zone loss, and would be checked by a load test that measures from intended send times.
- Every migration step has a way back except the last one, which is explicitly the one-way door, with verification before it.
- The pack was presented to someone else, their questions and challenges are recorded, and the pack was revised in response.

## Stretch goals
- Run the load test for real against a staging copy, and compare the measured capacity per instance with your model.
- Turn two of the ADRs' fitness functions into automated checks in the system's pipeline.
- Price the design at ten times today's traffic and identify which part breaks first, technically and financially.
- Run a second review of someone else's system with the same template, and compare what each review found.
