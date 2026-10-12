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

## Used by the L2 hub (opened 2026-10-12)

All 61 links in the L2 hub were opened during the build; the key ones are below. *Checked* gives the result.

| Resource | Kind | A | R | D | Cost | Note | Checked |
|---|---|---|---|---|---|---|---|
| [Designing Data-Intensive Applications, 2nd edition](https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html) | book | 5 | 5 | 5 | paid | the core book for L2–L4 | OK |
| [Dynamo: Amazon's highly available key-value store (SOSP 2007)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) | paper | 5 | 2 | 5 | free | quorums, sloppy quorums, hinted handoff | OK |
| [Jepsen: consistency models](https://jepsen.io/consistency) | reference | 5 | 4 | 5 | free | a map of consistency guarantees | OK |
| [CAP twelve years later (Brewer, InfoQ)](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/) | article | 5 | 2 | 4 | free | CAP in practice | OK |
| [PostgreSQL docs: high availability and replication](https://www.postgresql.org/docs/current/high-availability.html) | docs | 5 | 5 | 4 | free | streaming replication, standbys | OK |
| [DynamoDB: write sharding](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html) | docs | 5 | 5 | 4 | free | hot partition keys | OK |
| [Optimal probabilistic cache stampede prevention (VLDB 2015)](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf) | paper | 5 | 3 | 4 | free | XFetch early refresh | OK |
| [Redis docs: data types](https://redis.io/docs/latest/develop/data-types/) | docs | 5 | 5 | 4 | free | sorted sets, counters | OK |
| [Apache Kafka 4.3 docs: Design](https://kafka.apache.org/43/design/design/) | docs | 5 | 5 | 5 | free | consumer position, delivery semantics (the unversioned /documentation page now redirects) | OK |
| [Amazon SQS: visibility timeout and dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) | docs | 5 | 5 | 4 | free | redelivery mechanics | OK |
| [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) | pattern | 4 | 4 | 4 | free | outbox + relay | OK |
| [AWS Architecture Blog: Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) | article | 5 | 3 | 4 | free | full jitter | OK |
| [Stripe: Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters) | article | 4 | 3 | 4 | free | four kinds of limiter | OK |
| [Cloudflare: rate limiting at scale (sliding window counter)](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/) | article | 4 | 3 | 4 | free | two-counter approximation | OK |
| [Martin Fowler: Microservices, MonolithFirst, CircuitBreaker](https://martinfowler.com/microservices/) | articles | 4 | 3 | 4 | free | service architecture basics | OK |
| [Sam Newman: Backends for frontends](https://samnewman.io/patterns/architectural/bff/) | pattern | 4 | 3 | 4 | free | BFF | OK |
| [MDN: Server-sent events; RFC 6455 (WebSocket)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) | docs | 5 | 5 | 4 | free | real-time transports | OK |
| [Google SRE workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) | book | 5 | 3 | 5 | free | burn rates 14.4 (1 h) and 6 (6 h) | OK |
| [OpenTelemetry docs and W3C Trace Context](https://opentelemetry.io/docs/concepts/) | docs | 5 | 5 | 4 | free | traces, metrics, logs; traceparent | OK |
| [Prometheus: histograms and summaries](https://prometheus.io/docs/practices/histograms/) | docs | 5 | 5 | 4 | free | histogram_quantile | OK |
| [System Design Primer: Twitter timeline, pastebin](https://github.com/donnemartin/system-design-primer) | community | 4 | 3 | 4 | free | classic design write-ups | OK |

## Used by the L3 hub (opened 2026-10-12)

All 51 links in the L3 hub were opened or confirmed while building each module; the key ones are below. *Checked* gives the result.

| Resource | Kind | A | R | D | Cost | Note | Checked |
|---|---|---|---|---|---|---|---|
| [Raft paper (extended version)](https://raft.github.io/raft.pdf) | paper | 5 | 4 | 5 | free | elections, log replication, safety | OK |
| [The Raft site and RaftScope](https://raft.github.io/) | visualization | 5 | 4 | 4 | free | an interactive five-server cluster | OK |
| [Kleppmann: How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) | article | 5 | 3 | 5 | free | fencing tokens | OK |
| [Lamport: Time, Clocks, and the Ordering of Events](https://lamport.azurewebsites.net/pubs/time-clocks.pdf) | paper | 5 | 2 | 5 | free | happened-before, logical clocks | OK |
| [Kulkarni et al.: Logical Physical Clocks (HLC)](https://cse.buffalo.edu/tech-reports/2014-04.pdf) | paper | 5 | 3 | 4 | free | hybrid logical clocks | OK |
| [microservices.io: Saga](https://microservices.io/patterns/data/saga.html) | pattern | 4 | 4 | 4 | free | orchestration and choreography | OK |
| [Akidau et al.: The Dataflow Model (VLDB 2015)](https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf) | paper | 5 | 3 | 5 | free | windows, triggers, watermarks | OK |
| [Kreps: Questioning the Lambda Architecture](https://www.oreilly.com/radar/questioning-the-lambda-architecture/) | article | 5 | 3 | 4 | free | the Kappa argument | OK |
| [Apache Flink: Stateful stream processing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/) | docs | 5 | 5 | 5 | free | checkpoint barriers (the site blocks automated fetching; confirmed through search) | OK |
| [O'Neil et al.: The Log-Structured Merge-Tree (1996)](https://www.cs.umb.edu/~poneil/lsmtree.pdf) | paper | 5 | 2 | 5 | free | the original LSM design | OK |
| [RocksDB wiki: Leveled compaction](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction) | docs | 5 | 5 | 5 | free | levels and write amplification | OK |
| [Cassandra docs: Tombstones](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/tombstones.html) | docs | 5 | 5 | 4 | free | gc_grace_seconds and zombie data | OK |
| [Robertson and Zaragoza: BM25 and Beyond](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf) | paper | 5 | 3 | 5 | free | where BM25 comes from | OK |
| [Introduction to Information Retrieval: Boolean retrieval](https://nlp.stanford.edu/IR-book/html/htmledition/boolean-retrieval-1.html) | book | 5 | 3 | 5 | free | inverted indexes | OK |
| [AWS: Disaster recovery options in the cloud](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html) | whitepaper | 5 | 5 | 4 | free | four DR strategies | OK |
| [Google SRE book: Managing critical state](https://sre.google/sre-book/managing-critical-state/) | book | 5 | 3 | 5 | free | the split-brain case study | OK |
| [OWASP API Security Top 10 (2023)](https://api-security.owasp.org/editions/2023/en/0x11-t10/) | reference | 5 | 4 | 4 | free | BOLA is API1 (the owasp.org address redirects here) | OK |
| [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725) | RFC | 5 | 4 | 4 | free | what a verifier must check | OK |
| [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final) | standard | 5 | 4 | 4 | free | the zero-trust model | OK |
| [Zanzibar (USENIX ATC 2019)](https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/) | paper | 5 | 4 | 5 | free | relationship-based authorization | OK |
| [Stripe API reference: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | docs | 5 | 5 | 4 | free | key reuse rules, keys pruned after 24 h | OK |
| [Apple: HTTP Live Streaming](https://developer.apple.com/streaming/) | docs | 5 | 5 | 4 | free | HLS playlists and segments | OK |
