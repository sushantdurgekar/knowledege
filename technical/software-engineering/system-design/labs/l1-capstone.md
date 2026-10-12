---
title: "URL shortener: design doc, estimates, a working service and a load test"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: URL shortener: design doc, estimates, a working service and a load test

> System Design L1 · about 720 min · modules m01, m02, m03, m04, m05, m06, m07, m08, m09

Design and build a small URL shortener. Write a one-page design doc with estimates and a boxes-and-arrows diagram, build the service in Python or JavaScript (both if you can) with only the standard library, put a cache in front of the redirects, then load-test it and report what limited it.

## Deliverables
- A design doc of one or two pages: requirements, estimates with stated assumptions (module 9), the API, the data model, a diagram, and the trade-offs you chose.
- A working service: POST /links with an Idempotency-Key creates a link with a base-62 code (module 8); GET /{code} redirects with 301 or 302; unknown codes get 404; links are stored in SQLite (`sqlite3` / `node:sqlite`).
- An LRU cache with a TTL in front of the redirects (the cache lab), with hit and miss counts you can show.
- Tests for create, redirect, an unknown code, a retried create with the same key, and a cached link that expires.
- A load-test script that fires concurrent redirects and reports requests per second and the median and 99th-percentile latency, with and without the cache, plus a paragraph on what limited it.

## Steps
1. Write the requirements and the estimates first: new links a month, redirects per link, record size, how long links live.
2. Sketch the design: client → load balancer → app servers → cache → database, and say where a CDN or a redirect cache would go.
3. Build create and redirect over SQLite, with base-62 codes from a counter.
4. Put the cache lab's LRU + TTL cache in front of redirects and count hits and misses.
5. Add idempotency keys to create, and a test for every case in the deliverables.
6. Load-test with and without the cache, then write up what you measured and what you'd change for 100 times the traffic.

## Rubric
- The estimates state their assumptions and lead to concrete choices: code length, storage and cache size.
- The API uses correct methods and status codes, and a retried create can't make a duplicate.
- The cache's effect is measured (hit ratio, latency), not guessed.
- The doc names the single points of failure and how you'd remove them (modules 3 and 4).
- Someone else can run the service, the tests and the load test from your README.

## Stretch goals
- Run two copies of the service behind a tiny round-robin proxy and stop one in the middle of the load test.
- Hand out counter ranges per server (blocks of 1,000 ids) so that servers don't share one counter.
- Make codes hard to guess by mixing the counter through a reversible shuffle before encoding it.
