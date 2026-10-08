---
title: Session - L1–L4 hub program plans + link audit
track: technical
date: 2026-10-08 14:00
subject: hub-program (12 capabilities), system-design, dsa, qlik-sense
persona: Tutor
---
# Session - L1–L4 hub program plans + link audit

## Summary (≤5 lines)
- AI-901 confirmed **passed on 7 Oct 2026 (883)** from the score report in the vault.
- Planned L1–L4 Study Hubs (Foundation → Expert) for 12 capabilities: Python, SQL & Databases, Qlik Sense, Power BI, AI Engineering, JavaScript, DSA, System Design, Node.js, React, Docker, Next.js. Also planned story upgrades for the 4 exam hubs. That makes a 52-build queue in `_meta/hub-program/README.md`.
- Researched certifications (vendor pages, 2026-10-08) and wrote per-subject `plan/README.md`, `plan/levels.md` and rated `resources.md`, plus master spec, story guide, no-repeat ownership rules, certification map and verification protocol.
- Audited **every link** in the system design and DSA sheets (1,433 unique URLs, 3,196 references, 474 LeetCode refs): 31% dead, 197 mislabelled videos, 1 wrong LeetCode number. Cleaned `-verified.xlsx` copies with Audit sheets.

## Key points learned (current facts, checked 2026-10-08)
- PL-300 skills as of 20 Apr 2026; DP-600 and DP-800 new outlines from 19 Oct 2026.
- PCEP-30-03 and PCAP-31-04 are scheduled for Q3 2026; check which version is live before booking.
- OpenJS JSNAD and JSNSD were retired on 30 Sep 2025. From Node 27, Node.js releases one major version a year and every release becomes LTS.
- React 19.3 (9 Sep 2026); Next.js 16.4 (6 Oct 2026), with 16.3 Active LTS; DDIA 2nd edition (Mar 2026).
- Qlik: the Data Architect certification is 50 Q / 90 min / 62%, platform-neutral. System Administrator is not in Qlik's 2025 list.

## Notable Q&A
- Sushant asked for 4 hubs per technology (L1–L4), certifications wherever real exams exist, kid-style stories (apples/oranges, car trips), no repeated content across subjects, and verification of existing material, which "might contain some false info". He also asked for every link to be reviewed in order and filtered.

## Resources referenced
- Full lists: each subject's `resources.md`, `_meta/hub-program/certification-map.md`, `_meta/hub-program/link-audit/audit-report.md`.

## Mistakes & misconceptions
- (inherited material) The system design and DSA sheets contained ~441 dead URLs, including 163 invented ByteByteGo slugs and invented GitHub repos. Many video labels named the wrong channel.
- (inherited material) The Qlik framework places the Data Architect *certification* at L1, lists a non-existent "Qlik Cloud Data Architect" certificate, and a System Administrator cert that may be retired.

## Artifacts written
- `_meta/hub-program/` (README queue, hub-spec, story-style-guide, concept-ownership, certification-map, verification-protocol, link-audit/)
- 12 × `<subject>/plan/README.md` + `plan/levels.md` + `resources.md`; new folders: web-dev/javascript, web-dev/nodejs, bi-analytics/power-bi, databases/sql, data-ai/ai-engineering
- 4 × `technical/certifications/<exam>/plan/story-upgrade.md`
- `*-verified.xlsx` for the 4 workbooks (local only; xlsx is git-ignored)

## Roadmap progress
- [x] Plans for all 12 capabilities + 4 story upgrades
- [x] Link audit of the system design and DSA sheets
- [ ] Build #1: AI-103 story upgrade
- [ ] Build #2: Python L1 hub

## Next 3 actions
1. Build #1 (AI-103 story upgrade), then start AI-103 Block 1.
2. Build #2 Python L1 hub.
3. Tell Claude your hours/week so each hub's roadmap paces correctly.

## Resume prompt
> Use pro-instructor. Resume from `_meta/resume.md`, then build the next unticked item in `_meta/hub-program/README.md` following `hub-spec.md`.
