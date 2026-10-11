---
title: "Hub program: master plan and build queue"
track: technical
tags: [plan, hubs, levels]
created: 2026-10-08
updated: 2026-10-09
---
# Hub program: master plan and build queue

**Goal.** Every technology in the vault gets four Study Hubs (**L1 Foundation → L2 Proficient → L3 Specialist → L4 Expert**), built like the AI-103 hub. Each hub has stories for kids (apples and oranges, car trips, lunchboxes), diagrams, practice, flashcards, a capstone project and, where a real exam exists, a certification track. The four existing exam hubs (AI-901, AI-103, AB-620, AI-500) get the same story treatment.

**How it runs.** This file is the queue. One build = one session = one hub. Facts are re-verified at the start of every build, because versions, exams and links change.

## The 12 capabilities

| # | Capability | Folder | Plan | Folded in |
|---|---|---|---|---|
| 1 | Python | `technical/programming/python` | [plan](../../technical/programming/python/plan/README.md) | — |
| 2 | SQL & Databases | `technical/databases/sql` *(new domain)* | [plan](../../technical/databases/sql/plan/README.md) | — |
| 3 | Qlik Sense | `technical/bi-analytics/qlik-sense` | [plan](../../technical/bi-analytics/qlik-sense/plan/README.md) | your framework xlsx (audited) |
| 4 | Power BI | `technical/bi-analytics/power-bi` *(new)* | [plan](../../technical/bi-analytics/power-bi/plan/README.md) | — |
| 5 | AI Engineering | `technical/data-ai/ai-engineering` *(new)* | [plan](../../technical/data-ai/ai-engineering/plan/README.md) | machine-learning, data-science, genai, rag, agentic-ai, claude-code, anomaly-detection |
| 6 | JavaScript (browser) | `technical/web-dev/javascript` *(new)* | [plan](../../technical/web-dev/javascript/plan/README.md) | web-dev/fundamentals, web-dev/seo |
| 7 | Data Structures & Algorithms | `technical/software-engineering/dsa` | [plan](../../technical/software-engineering/dsa/plan/README.md) | competitive-programming |
| 8 | System Design | `technical/software-engineering/system-design` | [plan](../../technical/software-engineering/system-design/plan/README.md) | — |
| 9 | Node.js (server) | `technical/web-dev/nodejs` *(new)* | [plan](../../technical/web-dev/nodejs/plan/README.md) | — |
| 10 | React | `technical/web-dev/react` | [plan](../../technical/web-dev/react/plan/README.md) | — |
| 11 | Docker & Containers | `technical/devops/docker` | [plan](../../technical/devops/docker/plan/README.md) | → Kubernetes at L3 |
| 12 | Next.js | `technical/web-dev/nextjs` | [plan](../../technical/web-dev/nextjs/plan/README.md) | — |

Parked: **ThoughtSpot** (not selected) and `software-engineering/full-stack` (a Gain Insights work repo, used only as a source of practice tasks).

Supporting docs: [hub-spec.md](hub-spec.md) (what every hub contains) · [story-style-guide.md](story-style-guide.md) · [concept-ownership.md](concept-ownership.md) (no-repeat rules) · [certification-map.md](certification-map.md) · [verification-protocol.md](verification-protocol.md) · [link-audit/](link-audit/) (sheet audits).

## Why this order

1. **AI-103 story upgrade first.** AI-901 is passed (883, 7 Oct 2026), and AI-103 is the next exam, so re-story its hub before you start it.
2. **L1 hubs across the board before any L2.** Python and SQL come first because everything else uses them. Qlik and Power BI follow (your work stack), then AI Engineering (bridges AI-901 → AI-103), then the web stack, DSA and system design.
3. **Build just in time.** Build the next hub when you're about 70% through the current one. Run at most 2–3 active hubs at once (for example one language, one BI tool and one exam).
4. Re-order freely. Say "move Power BI L2 up" and the queue changes.

## Current run order (set 2026-10-08)

Sushant asked for DSA and System Design as two separate hub series, all four levels each, straight after the AI-103 upgrade, with every algorithm and pattern shown in **both Python and JavaScript/Node.js**. Other hubs add Python + JavaScript examples where it's natural (SQL drivers, AI SDKs, Docker). Numbers are the build IDs from the queue table below.

1. ~~#1 AI-103 story upgrade~~ (done 2026-10-08)
2. ~~#8 DSA L1~~ (done 2026-10-09) → ~~#20 DSA L2~~ (done 2026-10-09) → ~~#33 DSA L3~~ (done 2026-10-11) → ~~#46 DSA L4~~ (done 2026-10-12)
3. #9 System Design L1 → #21 L2 → #34 L3 → #47 L4
4. L1 hubs: #2 Python → #3 SQL → #4 Qlik Sense → #5 Power BI → #6 AI Engineering → #7 JavaScript → #10 Node.js → #11 React → #12 Docker → #13 Next.js
5. Then the rest of the queue in number order.

Hub tooling: bundles are applied with `python _meta/tools/apply_hub_bundle.py <bundle.tgz>`; new flashcards arrive parked and start with `python _meta/tools/activate_deck.py <deck>`.

## Build queue

| # | Done | Build | Output | Certification / note | Effort to learn |
|---|---|---|---|---|---|
| 1 | [x] | **AI-103 story upgrade** | `technical/certifications/ai-103/plan/story-upgrade.md` | AI-103 is your next exam; re-story its 37 modules before you start | 1 session |
| 2 | [ ] | **Python L1 Foundation** | `technical/programming/python/hubs/python-l1-foundation-hub.html` | PCEP (Python Institute, entry level) | 45–60 h |
| 3 | [ ] | **SQL & Databases L1 Foundation** | `technical/databases/sql/hubs/sql-l1-foundation-hub.html` | None required; LeetCode 'SQL 50' as a practice milestone | 30–40 h |
| 4 | [ ] | **Qlik Sense L1 Foundation** | `technical/bi-analytics/qlik-sense/hubs/qlik-sense-l1-foundation-hub.html` | Qlik Sense Business Analyst Qualification; Data Literacy Qualification (optional) | 45–60 h |
| 5 | [ ] | **Power BI L1 Foundation** | `technical/bi-analytics/power-bi/hubs/power-bi-l1-foundation-hub.html` | None at L1; start the PL-300 learning path (Microsoft Learn) | 30–40 h |
| 6 | [ ] | **AI Engineering L1 Foundation** | `technical/data-ai/ai-engineering/hubs/ai-engineering-l1-foundation-hub.html` | AI-901 Azure AI Fundamentals: passed 7 Oct 2026 (883); Optional: AWS Certified AI Practitioner | 40–55 h |
| 7 | [ ] | **JavaScript (browser) L1 Foundation** | `technical/web-dev/javascript/hubs/javascript-l1-foundation-hub.html` | JSE-40-01 (JS Institute, entry); certificates.dev Junior JavaScript (optional) | 50–70 h |
| 8 | [x] | **Data Structures & Algorithms L1 Foundation** | `technical/software-engineering/dsa/hubs/dsa-l1-foundation-hub.html` | No credible certification; milestone = 40 easy + 20 medium problems | 50–70 h |
| 9 | [ ] | **System Design L1 Foundation** | `technical/software-engineering/system-design/hubs/system-design-l1-foundation-hub.html` | No certification; evidence = design docs | 35–45 h |
| 10 | [ ] | **Node.js (server) L1 Foundation** | `technical/web-dev/nodejs/hubs/nodejs-l1-foundation-hub.html` | None current: OpenJS JSNAD and JSNSD were retired on 30 Sep 2025 | 40–55 h |
| 11 | [ ] | **React L1 Foundation** | `technical/web-dev/react/hubs/react-l1-foundation-hub.html` | certificates.dev Junior React (optional, not endorsed by Meta) | 40–55 h |
| 12 | [ ] | **Docker & Containers L1 Foundation** | `technical/devops/docker/hubs/docker-l1-foundation-hub.html` | None at L1 | 20–30 h |
| 13 | [ ] | **Next.js L1 Foundation** | `technical/web-dev/nextjs/hubs/nextjs-l1-foundation-hub.html` | No official Next.js certification found (checked 2026-10-08) | 30–40 h |
| 14 | [ ] | **Python L2 Proficient** | `technical/programming/python/hubs/python-l2-proficient-hub.html` | PCAP (Python Institute, associate) | 70–90 h |
| 15 | [ ] | **SQL & Databases L2 Proficient** | `technical/databases/sql/hubs/sql-l2-proficient-hub.html` | Oracle Database SQL Certified Associate 1Z0-071 (optional; verify) | 50–70 h |
| 16 | [ ] | **Qlik Sense L2 Proficient** | `technical/bi-analytics/qlik-sense/hubs/qlik-sense-l2-proficient-hub.html` | Qlik Sense Business Analyst Certification; Qlik Sense Data Architect Certification | 60–80 h |
| 17 | [ ] | **Power BI L2 Proficient** | `technical/bi-analytics/power-bi/hubs/power-bi-l2-proficient-hub.html` | PL-300: Microsoft Power BI Data Analyst | 60–80 h |
| 18 | [ ] | **AI Engineering L2 Proficient** | `technical/data-ai/ai-engineering/hubs/ai-engineering-l2-proficient-hub.html` | AI-103 Azure AI Apps and Agents Developer (hub ready); Optional: AWS MLA-C02 (GA 14 Jan 2027) | 80–100 h |
| 19 | [ ] | **JavaScript (browser) L2 Proficient** | `technical/web-dev/javascript/hubs/javascript-l2-proficient-hub.html` | JSA-41-01 (JS Institute, associate); certificates.dev Mid-Level JavaScript (optional) | 60–80 h |
| 20 | [x] | **Data Structures & Algorithms L2 Proficient** | `technical/software-engineering/dsa/hubs/dsa-l2-proficient-hub.html` | None; milestone = 150 curated problems + mock interviews | 120–150 h |
| 21 | [ ] | **System Design L2 Proficient** | `technical/software-engineering/system-design/hubs/system-design-l2-proficient-hub.html` | None | 60–80 h |
| 22 | [ ] | **Node.js (server) L2 Proficient** | `technical/web-dev/nodejs/hubs/nodejs-l2-proficient-hub.html` | None current (see L1 note) | 60–80 h |
| 23 | [ ] | **React L2 Proficient** | `technical/web-dev/react/hubs/react-l2-proficient-hub.html` | certificates.dev Mid-Level React (optional); Meta Front-End Developer Professional Certificate (Coursera, optional; check currency) | 60–80 h |
| 24 | [ ] | **Docker & Containers L2 Proficient** | `technical/devops/docker/hubs/docker-l2-proficient-hub.html` | Docker Certified Associate (DCA), now run by Mirantis (verify current availability and price) | 35–50 h |
| 25 | [ ] | **Next.js L2 Proficient** | `technical/web-dev/nextjs/hubs/nextjs-l2-proficient-hub.html` | None official | 50–70 h |
| 26 | [ ] | **AB-620 story upgrade** | `technical/certifications/ab-620/plan/story-upgrade.md` | before/alongside AI Engineering L3 | 1 session |
| 27 | [ ] | **Python L3 Specialist** | `technical/programming/python/hubs/python-l3-specialist-hub.html` | PCPP1 (Python Institute, professional level 1) | 80–100 h |
| 28 | [ ] | **SQL & Databases L3 Specialist** | `technical/databases/sql/hubs/sql-l3-specialist-hub.html` | Microsoft DP-800: SQL AI Developer Associate | 70–90 h |
| 29 | [ ] | **Qlik Sense L3 Specialist** | `technical/bi-analytics/qlik-sense/hubs/qlik-sense-l3-specialist-hub.html` | Qlik AI Specialist; (System Administrator: verify) | 70–90 h |
| 30 | [ ] | **Power BI L3 Specialist** | `technical/bi-analytics/power-bi/hubs/power-bi-l3-specialist-hub.html` | DP-600: Fabric Analytics Engineer Associate | 70–90 h |
| 31 | [ ] | **AI Engineering L3 Specialist** | `technical/data-ai/ai-engineering/hubs/ai-engineering-l3-specialist-hub.html` | AI-500 Multi-Agent AI Solutions Expert (needs AI-103; hub ready); AB-620 (optional, hub ready); Optional: AWS AIP-C01 Generative AI Developer – Professional, Databricks Generative AI Engineer Associate | 90–120 h |
| 32 | [ ] | **JavaScript (browser) L3 Specialist** | `technical/web-dev/javascript/hubs/javascript-l3-specialist-hub.html` | certificates.dev Senior JavaScript (optional) | 70–90 h |
| 33 | [x] | **Data Structures & Algorithms L3 Specialist** | `technical/software-engineering/dsa/hubs/dsa-l3-specialist-hub.html` | None; milestone = 89 hard problems + 6 virtual contests + 4 mocks | 120–150 h |
| 34 | [ ] | **System Design L3 Specialist** | `technical/software-engineering/system-design/hubs/system-design-l3-specialist-hub.html` | Optional: AZ-305 Azure Solutions Architect Expert or AWS Solutions Architect – Associate (verify current versions) | 80–100 h |
| 35 | [ ] | **Node.js (server) L3 Specialist** | `technical/web-dev/nodejs/hubs/nodejs-l3-specialist-hub.html` | Optional: AWS Certified Developer – Associate (DVA-C03, GA 1 Dec 2026) | 70–90 h |
| 36 | [ ] | **React L3 Specialist** | `technical/web-dev/react/hubs/react-l3-specialist-hub.html` | certificates.dev Senior React (optional) | 60–80 h |
| 37 | [ ] | **Docker & Containers L3 Specialist** | `technical/devops/docker/hubs/docker-l3-specialist-hub.html` | KCNA (Kubernetes and Cloud Native Associate); CKAD (Certified Kubernetes Application Developer) | 60–80 h |
| 38 | [ ] | **Next.js L3 Specialist** | `technical/web-dev/nextjs/hubs/nextjs-l3-specialist-hub.html` | None official | 50–70 h |
| 39 | [ ] | **AI-500 story upgrade** | `technical/certifications/ai-500/plan/story-upgrade.md` | before AI-500 (after AI-103) | 1 session |
| 40 | [ ] | **Python L4 Expert** | `technical/programming/python/hubs/python-l4-expert-hub.html` | PCPP2 (Python Institute, professional level 2) | 60–90 (plus ongoing practice) h |
| 41 | [ ] | **SQL & Databases L4 Expert** | `technical/databases/sql/hubs/sql-l4-expert-hub.html` | Optional: DP-300 Azure Database Administrator (verify status) | 60–80 h |
| 42 | [ ] | **Qlik Sense L4 Expert** | `technical/bi-analytics/qlik-sense/hubs/qlik-sense-l4-expert-hub.html` | No higher Qlik certification; evidence = accelerators, talks, client outcomes | 40–60 h |
| 43 | [ ] | **Power BI L4 Expert** | `technical/bi-analytics/power-bi/hubs/power-bi-l4-expert-hub.html` | Optional: DP-700 Fabric Data Engineer (verify status) | 50–70 h |
| 44 | [ ] | **AI Engineering L4 Expert** | `technical/data-ai/ai-engineering/hubs/ai-engineering-l4-expert-hub.html` | No single expert certification; evidence = blueprint, talks, delivered systems | 60–90 h |
| 45 | [ ] | **JavaScript (browser) L4 Expert** | `technical/web-dev/javascript/hubs/javascript-l4-expert-hub.html` | No mainstream certification; evidence = design system + OSS contributions | 50–80 h |
| 46 | [x] | **Data Structures & Algorithms L4 Expert** | `technical/software-engineering/dsa/hubs/dsa-l4-expert-hub.html` | None; milestone = Codeforces 1900+ or equivalent | 150–200 h |
| 47 | [ ] | **System Design L4 Expert** | `technical/software-engineering/system-design/hubs/system-design-l4-expert-hub.html` | Optional: AWS Solutions Architect – Professional (SAP-C03 GA 17 Nov 2026) or AZ-305 | 50–70 h |
| 48 | [ ] | **Node.js (server) L4 Expert** | `technical/web-dev/nodejs/hubs/nodejs-l4-expert-hub.html` | No mainstream certification; evidence = accelerator + architecture decision records | 50–70 h |
| 49 | [ ] | **React L4 Expert** | `technical/web-dev/react/hubs/react-l4-expert-hub.html` | No mainstream certification beyond certificates.dev Senior | 40–60 h |
| 50 | [ ] | **Docker & Containers L4 Expert** | `technical/devops/docker/hubs/docker-l4-expert-hub.html` | CKA (Certified Kubernetes Administrator); CKS (Certified Kubernetes Security Specialist) | 60–80 h |
| 51 | [ ] | **Next.js L4 Expert** | `technical/web-dev/nextjs/hubs/nextjs-l4-expert-hub.html` | None official | 40–60 h |
| 52 | [ ] | **AI-901 story upgrade** | `technical/certifications/ai-901/plan/story-upgrade.md` | optional: already passed, revision value only | 1 session |

**Total learning effort (estimate):** L1 455–620 h · L2 725–960 h · L3 870–1,130 h · L4 560–810 h (plus DSA L4, ongoing) across all 12 capabilities. Nobody does all of it at once. The levels are career milestones, not a sprint.

## Recipe for one build session

1. **Re-verify.** Search the official sources for current versions, exam outlines and retirements. Update the subject's `resources.md` and `plan/README.md` certification table with access dates.
2. **Audit inherited material** for this level: sheet rows (see [link-audit/](link-audit/)), the Qlik framework rows, course roadmaps. Record fixes in `plan/audit-<level>.md`.
3. **Write concept notes** `concepts/<level>-NN-<slug>.md`, one per module. Each has: hook, pre-question, kid story + mapping table + where the story breaks, explanation, Mermaid diagram, worked example, faded example, Socratic checks, traps, sources.
4. **Build the hub** per [hub-spec.md](hub-spec.md), publish it as an artifact, and save the HTML to `<subject>/hubs/`.
5. **Independent check.** A fresh agent that hasn't seen the work audits facts, answer keys and code samples. Then run a link check.
6. **Lock in:** SRS cards (deck `<slug>-<level>`), `misconceptions.md`, `interview.md`, capstone brief in `labs/`, and a cert folder in `technical/certifications/<code>/` if the level maps to an exam.
7. **Close out:** tick the queue row, update subject README + `INDEX.md` (`python _meta/tools/build_index.py`), session log, and commit `plan(<slug>): <level> hub …`.

**Prompt to start the next build:**
> Use pro-instructor. Build the next unticked item in `_meta/hub-program/README.md`, following `hub-spec.md` and `verification-protocol.md`.

## Optional export to your Learning Path app

Every `levels.md` uses the same key scheme as your framework export (`L1-02`, `L1-02.3`), so each capability can be turned into a bulk-upload xlsx with Topics/Learning sheets. The app needs each capability's `capabilityId` (from its own export), so export a blank framework for a capability from the app first, then ask for the fill-in.
