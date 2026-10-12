---
title: "An event-driven order platform with sagas, outboxes and failure injection"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: An event-driven order platform with sagas, outboxes and failure injection

> System Design L3 · about 1800 min · modules m01, m02, m03, m04, m05, m07, m08, m09

Build a small event-driven platform the way production teams do. Order, payment and inventory services, each with its own PostgreSQL database, talk only through Kafka; an orchestrated saga with outboxes and idempotent consumers takes each order to confirmed or cancelled; a stream job computes per-minute order metrics by event time. Run it all with Docker Compose, then break it on purpose (kill brokers and services, partition the network, replay topics) and write a failure-injection report that someone else reviews.

## Deliverables
- A design doc of three to four pages: requirements, estimates, the event catalogue with schemas and keys, the saga's state machine, a diagram, SLOs, and the trade-offs chosen, using the L2 framework and this level's review checklist.
- Three services in Python or Node.js, each with its own PostgreSQL database and an outbox table, published to Kafka by a relay or Debezium; consumers dedupe through an inbox table; the order saga handles out-of-stock and declined payments with compensations.
- Topics partitioned by order id, with a documented schema evolution rule; a dead-letter topic for poison messages; and a stream job (Kafka Streams, Flink or your own consumer) producing per-minute counts by event time with a watermark.
- A docker-compose.yml that starts Kafka (KRaft mode, three brokers), the databases, the services and the stream job with one command, plus a load generator.
- A failure-injection report: for each experiment (kill a broker, kill a service mid-saga, delay the network between two services, replay a topic from the start, send a malformed event) the hypothesis, what happened, the metrics, and the fix.
- Security basics: services authenticate to Kafka and their databases with credentials from a secrets file or manager, never from code, and the API checks a JWT and the caller's right to each order.

## Steps
1. Write the design doc first: requirements, estimates, events and their keys, the saga state machine and the SLOs; get it reviewed.
2. Build one service end to end with its database, outbox, relay and Kafka, then the other two, then the saga.
3. Add idempotent consumers, the dead-letter topic and the stream job; add metrics and traces with trace ids carried in event headers.
4. Write docker-compose.yml and a load generator, and measure the happy path: throughput, saga latency and consumer lag.
5. Run each failure experiment, write up the results, fix what broke, and have someone review the report.

## Rubric
- No order is ever charged twice or left in a non-final state, under every experiment, and the report proves it with counts from the databases.
- Every state change and its event commit together (outbox), and every consumer is idempotent; duplicate deliveries are measured, not assumed.
- Partitioning keeps each order's events in order, and the doc explains what happens to ordering during a consumer group rebalance.
- The stream job's counts match a batch recount of the orders table after replays and restarts.
- Someone else can start everything from the README and repeat each experiment, and the write-up says what you'd change for ten times the traffic and for a second region.

## Stretch goals
- Replace the relay with Debezium change data capture reading each database's write-ahead log.
- Add a second region for the order service with a home region per customer, and test a region evacuation.
- Replace the orchestrator with choreography and compare the two in the report: coupling, visibility and failure handling.
- Add exactly-once processing to the stream job with Kafka transactions, and show the counts survive a crash in the middle of a commit.
