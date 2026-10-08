---
title: "Verification protocol"
track: technical
tags: [plan, hubs, quality, sources]
created: 2026-10-08
updated: 2026-10-08
---
# Verification protocol

You flagged that existing material "might contain some false info". This protocol is how every plan and hub stays honest.

## What gets verified, and how

| Claim type | Rule | Where it's recorded |
|---|---|---|
| Versions (Python, Node, React, Next.js…) | Official release page or blog, checked at each build | `resources.md` (*Checked* column) |
| Exam facts (code, domains, weights, pass mark, retirement) | Vendor's own exam page/study guide only; third-party sites are leads, never sources | subject `plan/README.md` cert table, then `technical/certifications/<code>/blueprint.md` |
| Technical behaviour (complexity, semantics, defaults) | Official docs or a standard reference (CLRS, DDIA, MDN, Python docs); ideally runnable code that shows it | concept note `sources:` frontmatter |
| Links | Must open, and the page title/channel must match the label | link-audit files |
| Anything not confirmed | Marked *(verify)*; never stated as fact | inline |

## Independent check

At the end of each hub build, a fresh agent that hasn't seen the drafting re-checks a sample of facts and **every** answer key and code sample. The previous exam hubs went through the same check (3 wrong keys and ~80 items were fixed then).

## Inherited-material audits

| Material | Status (2026-10-08) |
|---|---|
| `system-design/docs/system-design-200-topics.xlsx` + `system-design-learning-plan.xlsx` | **Done:** every link checked; ~1 in 2 references failed; cleaned `-verified.xlsx` copies → [link-audit/audit-report.md](link-audit/audit-report.md) |
| `dsa/docs/dsa-ultimate-reference.xlsx` + `dsa-complete-reference.xlsx` | **Done:** every link + 474 LeetCode refs checked; cleaned `-verified.xlsx` copies → [link-audit/audit-report.md](link-audit/audit-report.md) |
| `framework-qliksense 3 - Copy.xlsx` | First-pass content audit done: 8 issues ([qlik plan](../../technical/bi-analytics/qlik-sense/plan/README.md#audit-of-your-framework-export-first-pass-2026-10-08)) |
| Udemy course roadmaps | Trusted for structure; course content is dated, so hub notes follow current docs where they differ |
| Existing exam hubs (AI-901/103/AB-620/AI-500) | Audited 2026-10-04; re-check platform changes during the story upgrade |

## Facts researched for this plan (2026-10-08)

- **Python:** PCEP-30-02 and PCAP-31-03 active; 30-03 and 31-04 scheduled for Q3 2026. Python 3.15 stable due October 2026.
- **Node.js:** JSNAD and JSNSD retired 30 Sep 2025. From Node 27 there's one major release a year (April) and every release becomes LTS (October); Node 26 (Apr 2026) is the last under the old model.
- **React:** 19.3 (9 Sep 2026); React Compiler 1.0 (Oct 2025); React moved to the React Foundation (Linux Foundation).
- **Next.js:** 16.4 (6 Oct 2026); 16.3 Active LTS, 15.5 Maintenance LTS; frequent security releases (Aug–Sep 2026).
- **Power BI:** PL-300 skills as of 20 Apr 2026; DP-600 new outline 19 Oct 2026.
- **SQL:** DP-800 SQL AI Developer Associate, skills as of 19 Oct 2026.
- **Qlik:** Data Architect cert 50 Q / 90 min / 62%; qualifications (BA 1h15, DA 1h30); Qlik AI Specialist exists; System Administrator not in 2025 list.
- **System design:** DDIA 2nd edition published March 2026 (Kleppmann & Riccomini). AWS SAP-C03 GA 17 Nov 2026.
- **AI:** AWS MLA-C02 GA 14 Jan 2027; AI-901 passed by you on 7 Oct 2026 (883).
- **Docker:** DCA moved to Mirantis (2019); current availability to be confirmed on Mirantis.
