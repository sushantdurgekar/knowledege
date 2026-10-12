---
title: "A shared rate limiter and a notification worker, with dashboards"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: A shared rate limiter and a notification worker, with dashboards

> System Design L2 · about 1200 min · modules m04, m05, m06, m07, m09, m10

Build a small, production-shaped system. Three API instances behind a round-robin proxy share one per-client rate limit kept in a Redis-like store, and a notification service queues messages for a worker that retries with backoff, dead-letters what keeps failing and never sends twice. Instrument everything, put the numbers on a dashboard, and write it up as a design doc that someone else reviews.

## Deliverables
- A design doc of two or three pages: requirements, estimates, the API, the data model, a diagram, SLOs and the trade-offs you chose (module 10's routine).
- A store service with an atomic token-bucket operation (the limiter lab), or real Redis with a Lua script if you have Docker; three API instances behind a small round-robin proxy, each answering 429 with Retry-After when the shared limit is used up.
- POST /notify with an Idempotency-Key, writing to the SQLite queue (the queue lab), and a worker that sends through a fake provider that fails 20% of the time and sometimes hangs: timeouts, retries with backoff and jitter, and a dead-letter state after 5 attempts.
- Metrics on /metrics for every service (allowed and limited requests, queue depth, retries, dead letters, latency histograms), a trace id passed on every call and written in every log line, and a dashboard page or script that shows the numbers.
- Tests, a load test showing that the limit holds across all three instances, and two failure tests: stop the store, and kill the worker in the middle of a send.

## Steps
1. Write the requirements, estimates and SLOs first, and agree the API: GET /hello, limited per API key, and POST /notify.
2. Build the store and the three API instances behind the proxy, then load-test the limit.
3. Build the notification queue, the worker and the fake provider; add idempotency keys and the dead-letter state; test with crashes.
4. Add metrics, structured logs and trace propagation to every service, then the dashboard.
5. Run the failure tests, write up the results, and have someone review the design doc against module 10's checklist.

## Rubric
- The limit holds exactly across instances under concurrent load, and the doc says whether the API fails open or closed when the store is down, and why.
- No notification is sent twice, even when the worker is killed between sending and acknowledging, and poison messages end as dead letters with their error.
- SLOs are written down for the API and for notification delivery time, and the dashboard shows them with their burn rates.
- Every call has a timeout, retries happen at one layer only, and one trace id links a request's logs across services.
- Someone else can run everything from the README, and the write-up says what you'd change for 10 times the traffic.

## Stretch goals
- Swap the store for real Redis and a Lua script (redis:7 in Docker) and compare the latency.
- Add a transactional outbox: the API writes the notification and an outbox row in one transaction, and a relay queues it.
- Add per-user notification limits (at most 5 an hour) and quiet hours, and show them on the dashboard.
- Run two workers and prove, from the trace ids, that no notification was sent twice.
