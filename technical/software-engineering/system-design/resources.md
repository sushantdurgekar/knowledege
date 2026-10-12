---
title: "System Design: resources"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, resources]
status: learning
created: 2026-10-08
updated: 2026-10-12
---
# System Design: resources

Ratings 1–5 for **A**uthority, **R**ecency, **D**epth. *Checked* says whether the link was opened in the 2026-10-08 research session or still needs the build-time link check.

| Resource | Kind | A | R | D | Cost | Levels | Note | Checked |
|---|---|---|---|---|---|---|---|---|
| [Designing Data-Intensive Applications, 2nd ed. (Mar 2026)](https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html) | book | 5 | 5 | 5 | paid | L2–L4 | the core text | fetched 2026-10-08 |
| [System Design Primer (donnemartin)](https://github.com/donnemartin/system-design-primer) | community guide | 4 | 2 | 4 | free | L1–L2 | older but solid basics | link-check at build |
| [System Design Interview Vol. 1 & 2 (Alex Xu)](https://bytebytego.com/) | book/course | 4 | 3 | 4 | paid | L2–L3 | interview designs | link-check at build |
| [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) | official | 5 | 5 | 4 | free | L3–L4 |  | link-check at build |
| [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/) | official | 5 | 5 | 4 | free | L3–L4 |  | link-check at build |
| [Raft visualisation](https://raft.github.io/) | interactive | 5 | 3 | 4 | free | L3 |  | link-check at build |
| Your sheets (200 topics + learning plan) (`docs/`) | internal | 2 | 4 | 3 | — | L1–L4 | audited 2026-10-08: use the -verified.xlsx copies | in vault |

## Used by the L1 hub (opened 2026-10-12)

All links below were opened during the build; *Checked* gives the result.

| Resource | Kind | A | R | D | Cost | Note | Checked |
|---|---|---|---|---|---|---|---|
| [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) | standard | 5 | 5 | 5 | free | methods, status codes | OK |
| [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111) | standard | 5 | 5 | 5 | free | Cache-Control, revalidation | OK |
| [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) | docs | 5 | 5 | 4 | free | freshness, ETags, cache busting | OK |
| [Google SRE book](https://sre.google/sre-book/table-of-contents/) | book | 5 | 3 | 5 | free | embracing risk, SLOs, load balancing, overload | OK |
| [Timeouts, retries and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) | article | 5 | 3 | 5 | free | now redirects to builder.aws.com | OK (redirect) |
| [NGINX: HTTP load balancing](https://nginx.org/en/docs/http/load_balancing.html) | docs | 5 | 4 | 4 | free | round robin, least_conn, ip_hash | OK |
| [Redis: key eviction](https://redis.io/docs/latest/develop/reference/eviction/) | docs | 5 | 5 | 4 | free | eviction policies | OK |
| [Scaling Memcache at Facebook (NSDI 2013)](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala) | paper | 5 | 2 | 5 | free | leases against stampedes | OK |
| [Node.js: node:sqlite](https://nodejs.org/api/sqlite.html) | docs | 5 | 5 | 4 | free | no flag needed from Node.js 22.13 / 23.4 | OK |
| [IETF draft: Idempotency-Key header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) | draft | 4 | 4 | 4 | free | draft-07, expired | OK (expired) |
| [Stripe API: idempotent requests](https://docs.stripe.com/api/idempotent_requests) | docs | 4 | 5 | 4 | free | keys pruned after ≥ 24 h | OK |
| [Colin Scott: latency numbers by year](https://colin-scott.github.io/personal_website/research/interactive_latency.html) | interactive | 4 | 3 | 3 | free | orders of magnitude | OK |
