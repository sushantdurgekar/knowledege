---
title: "Link audit: system design and DSA reference sheets"
track: technical
tags: [audit, system-design, dsa, sources]
created: 2026-10-08
updated: 2026-10-08
---
# Link audit: system design and DSA reference sheets (2026-10-08)

**Scope:** every link in the four workbooks, checked one by one:
`system-design-200-topics.xlsx`, `system-design-learning-plan.xlsx`, `dsa-ultimate-reference.xlsx` and `dsa-complete-reference.xlsx`. That's **3,196 link references** to **1,433 unique URLs**, plus **474 LeetCode problem references**.

**How each link was checked:**

- **YouTube:** YouTube's own oEmbed endpoint gives the real title and channel, compared with the label.
- **GitHub:** each page was fetched, and file paths were checked against the repo trees through the GitHub API.
- **ByteByteGo, GeeksforGeeks, cp-algorithms, Programiz, PostgreSQL, Redis, MongoDB, Elastic and Cloudflare:** each page was fetched from the site itself in the desktop app browser, recording status, redirect and title.
- **All other sites:** opened one by one.
- **LeetCode:** numbers and titles were checked against LeetCode's own problem list of 4,073 problems.

## Results (unique URLs)

| Source | Links | Live and correct | Moved, URL updated | Replaced with verified file | Dead | Generic/soft | Off-topic |
|---|---|---|---|---|---|---|---|
| YouTube | 479 | 286 (197 had the wrong channel or title in the label → relabelled) | – | – | **170** | 4 | 19 |
| GitHub | 361 | 266 | – | 26 | **65** (mostly repos that never existed) | – | 4 |
| ByteByteGo blog | 168 | 5 | – | – | **163** (invented article slugs) | – | – |
| GeeksforGeeks | 135 | – | 121 (moved to /dsa/…) | – | 13 | 1 | – |
| cp-algorithms | 49 | 39 | – | 4 | 6 | – | – |
| LeetCode | 27 | 27 | – | – | – | – | – |
| Programiz | 15 | 11 | – | – | 4 | – | – |
| Other sites | 199 | 144 | 26 | – | 20 | 8 | 1 |
| **Total** | **1,433** | **778** | **147** | **30** | **441 (31%)** | **13** | **24** |

Usable after cleaning: **955 of 1,433 unique links (67%)**. Before the audit, roughly 1 link in 3 was dead, and about 4 in 10 of the live YouTube videos were mislabelled.

**LeetCode references:** 474 checked. One wrong number: *Largest Component Size by Common Factor* is **#952**, not #2513 (fixed). One misleading label: #787 is *Cheapest Flights Within K Stops*. The other 28 flagged items are just abbreviations of the right problem (e.g. "Validate BST" = #98).

## What was changed (in new `-verified.xlsx` copies; originals untouched)

| Workbook | Removed | URL updated | Relabelled | Kept as is |
|---|---|---|---|---|
| system-design-200-topics | 494 | 29 | 181 | 257 |
| system-design-learning-plan | 494 | 29 | 181 | 257 |
| dsa-ultimate-reference | 113 | 111 | 82 | 274 |
| dsa-complete-reference | 129 | 138 | 97 | 330 |

- **Removed:** dead links, links that now redirect to a generic page, channel home pages labelled as specific lessons, live videos or repos that aren't about the row's topic (154 cases, reviewed by hand), and two unofficial re-uploads of other creators' lectures.
- **Relabelled:** the label now names the real channel and title, or the real GitHub repo.
- **Updated:** moved pages and renamed repo files point to the verified new address.
- **Filled:** 3 topics where every link failed (Lambda Architecture, Canary Deployment, Multi-Region High Availability) got verified replacements. *Write-Around Cache* still has none; it gets one at the System Design L2 build.
- Each `-verified.xlsx` has an **Audit** sheet listing every change for that workbook.

## Coverage after cleaning

607 topic rows had links. **6 rows** lost every link (3 refilled), and **76 rows** are down to one link. These thin topics are listed in `audit-coverage.json` and get new verified sources during the matching hub build.

## Content (non-link) findings

- The learning plan's pacing (one topic per week, ~200+ weeks; *Fault Tolerance* and *Single Point of Failure* at week 160+) is replaced by the L1–L4 grouping in `technical/software-engineering/system-design/plan/levels.md`.
- The two DSA workbooks overlap heavily (20 vs 21 domains). Use `dsa-complete-reference-verified.xlsx` as the topic index and `dsa-ultimate-reference-verified.xlsx` for its larger problem lists.
- Complexity claims and descriptions in the sheets were **not** re-verified here. That happens topic by topic when concept notes are written (verification protocol).

## Files

| File | What |
|---|---|
| `audit-details.csv` | every link reference: workbook, sheet, row, topic, label, URL, verdict, action, actual title |
| `audit-coverage.json` | topics left empty or thin |
| `results-*.txt/.tsv`, `lc-titles.txt` | raw check results |
| `audit_links.py` | re-runs the cleaning from the raw results (`python _meta/hub-program/link-audit/audit_links.py`) |
| `inventory.json`, `lc-refs.json` | extracted link and LeetCode references |
