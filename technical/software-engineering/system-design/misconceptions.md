---
title: "System Design: misconceptions and traps"
track: technical
subject: system-design
created: 2026-10-12
updated: 2026-10-12
---
# System Design: misconceptions and traps

Sections are added by each hub level. Newest build replaces its own level's section.

## L1 Foundation (2026-10-09)

### Client-server and networking: how a request travels
- **“More bandwidth makes every page faster.”** Bandwidth only shortens the transfer. Small requests are dominated by round trips, which bandwidth doesn't change: for a 20 KB page, doubling bandwidth saved 4 ms while halving the RTT saved 120 ms.
- **“A faster server fixes slow first loads.”** For a distant user the server's 5 ms is under 1% of the wait. Cut round trips instead: reuse connections, use TLS 1.3 or HTTP/3, and serve from nearer the user.
- **“UDP is just a worse TCP.”** UDP skips the handshake and never stalls behind a lost packet, which is what real-time voice, video and games want. QUIC builds reliability on top of UDP for HTTP/3.
- **“HTTPS hides which site you're visiting.”** TLS encrypts the path, headers and body, but the hostname can still show in the DNS lookup and in the TLS handshake's server name (unless encrypted DNS and Encrypted Client Hello are used).
- **“A DNS change takes effect straight away.”** Resolvers keep cached answers until their TTL runs out, so some users reach the old address for that long. Lower the TTL well before a planned move.
- **“Keep-alive and HTTP/2 do the same thing.”** Keep-alive reuses a connection for one request after another; HTTP/2 multiplexes many requests at once over one connection, so a slow response doesn't hold up the others at the HTTP level.

### Scaling up and out: stateless services and the bottleneck
- **“Vertical scaling is always the wrong answer.”** A bigger machine is often the simplest and cheapest first step: no code changes and no distributed-systems problems. It's wrong only when you hit the ceiling, can't afford the downtime of an upgrade, or must survive that one machine failing.
- **“Adding servers always adds capacity.”** Only at the bottleneck tier. Once the database is the limit, more app servers add cost, not throughput, and can make things worse by opening more database connections.
- **“Sticky sessions make a stateful app scalable.”** They spread users across servers, but the load gets uneven, a server can't be taken out without logging its users out, and a crash loses every session on it. Moving the state to a shared store or a signed token is the real fix.
- **“At 50% CPU a server can take twice the traffic with the same response time.”** Requests queue more and more as a server nears 100% busy: in the simplest queueing model, the average wait in the queue at 90% busy is 9 times the wait at 50%. And another resource (memory, worker threads, connections) may run out first.
- **“Stateless means the system has no state.”** The state still exists; it lives somewhere shared (a database, a cache, a signed token on the client) instead of in one server's memory. That shared place now has to scale and stay up.
- **“Ten servers make a job ten times faster.”** Only the part that runs in parallel speeds up. With 10% of the work serial, Amdahl's law keeps the speed-up below 10× however many machines you add, and 10 machines give about 5.3×.

### Availability: nines, redundancy and failing well
- **“Two servers make the service twice as available.”** Availability can't double; what shrinks is the chance of being down. Two independent 99% servers are down together only 0.01% of the time, so the pair reaches 99.99%, if they really fail independently.
- **“Our servers are 99.99%, so the service is 99.99%.”** A request crosses many parts in series (DNS, load balancer, app, database, a payment provider) and their availabilities multiply. Five parts at 99.99% give about 99.95% before anything else goes wrong.
- **“Two copies in the same rack are redundant.”** A power or network failure in that rack takes both down together. Spread copies across failure domains (racks, availability zones, regions), or the parallel formula overstates your availability.
- **“Retrying straight away is the quickest way to recover.”** Instant retries from many clients arrive together and can keep an overloaded server down. Wait with exponential backoff, add jitter, and cap the number of attempts.
- **“Retry every failed request.”** Only errors that may pass (timeouts, 503s) and operations that are safe to repeat. Retrying a payment that actually went through can charge twice unless the API supports idempotency keys (module 8), and retrying a 400 Bad Request can never help.
- **“100% availability is the right target.”** Each extra nine costs far more and slows down change, and users reach you through networks and devices that are less reliable than that anyway. Pick the SLO users need, and spend the error budget on shipping.

### Load balancing: spreading requests and routing around failure
- **“Round robin spreads the load evenly.”** It spreads the number of requests evenly. If requests differ in cost or servers differ in size, the load doesn't: one server can end up with every slow request. Least connections or weights fix that.
- **“A health check that returns 200 proves the server works.”** It proves the health check works. A shallow check can pass while the server fails real requests, so check what real requests need, and watch real error rates too (passive checks).
- **“Health checks should test every dependency.”** If every server's check fails when one shared dependency, such as the database, has a blip, the load balancer removes every server at once and a partial outage becomes a total one. Check what taking this one server out would actually fix.
- **“Mark a server down on its first failed check.”** Then one dropped packet flaps it out and back in. Use thresholds: several failures in a row to go down, several passes in a row to come back.
- **“The load balancer can't fail.”** It's a server too. Run a redundant pair or a managed load balancer spread across zones, or it's the single point of failure in front of all your redundancy.
- **“Hashing users to servers is free stickiness.”** With hash mod N, adding or removing one server sends most users to a different server, emptying their caches at once. Consistent hashing (L2) moves only about 1/N of them.

### Caching: hit ratios, expiry and eviction
- **“A cache makes every read faster.”** Only hits are faster; a miss pays for the cache check and then the database. With a low hit ratio a cache adds latency and cost, so measure the hit ratio before celebrating.
- **“A bigger cache is always worth it.”** Returns shrink: on skewed traffic the first entries catch most of the hits, and each doubling adds less. Size the cache to the hot set, then weigh any further gain against the memory it costs.
- **“Update the cache first, then the database.”** If the database write then fails, the cache holds a value that was never saved, and two racing writers can leave the older value cached. The usual order is: write the database, then delete the cached copy, so the next read loads the new value.
- **“TTLs keep the cache consistent.”** A TTL only bounds staleness: until it runs out, readers can see an old value. If stale data is unacceptable (a balance, stock at checkout), invalidate on every write or don't cache it.
- **“LRU is always the best eviction policy.”** It suits most workloads, but one big scan, such as a nightly report that reads every row once, can flush every hot entry. LFU or scan-resistant policies keep long-term favourites.
- **“A cache stampede is the database's fault.”** The cache causes it: many requests miss the same popular key at the same moment. Let one request refresh it while the others wait or use the old value, and add jitter to TTLs so keys don't expire together.

### CDNs and proxies: caching at the edge
- **“A CDN is only for images.”** Anything that's the same for many users can be served from the edge: scripts, styles, video segments, whole pages and public API responses. The trick is to separate personal data from shared data so the shared part can be cached.
- **“no-cache means don't cache.”** no-cache allows storing the response but requires a check with the origin before each reuse. no-store is the directive that forbids storing it at all.
- **“Purging the CDN is how to ship a new version.”** Purges take time to reach every edge and are easy to get wrong. Put a content hash in static file names and cache them for a year; a release then points at new names, and old copies are simply never asked for again.
- **“A 304 is free.”** It saves the body, not the round trip: the request still travels to the origin and back. For small files that are requested often, a longer max-age saves more than revalidation does.
- **“A personal page can be cached at the CDN if its URL is the same for everyone.”** Then the edge serves one user's page to the next user who asks for that URL. Mark personal responses private or no-store, and keep personal data out of shared caches.
- **“A reverse proxy is just a forward proxy pointing the other way.”** They serve different owners. A forward proxy acts for clients going out (filtering, logging); a reverse proxy acts for servers (routing, TLS, caching, rate limits). Clients choose to use a forward proxy; they usually don't know a reverse proxy is there.

### Choosing storage: SQL, NoSQL and object storage
- **“NoSQL scales and SQL doesn't.”** One relational primary on good hardware handles a lot, caches and read replicas take it further, and many relational databases can be sharded. NoSQL stores scale out more easily for simple key lookups, in exchange for fewer kinds of query and weaker transactions.
- **“Keep images in the database, so everything's in one place.”** Large files bloat the database, its backups and its replicas, and every image read ties up a database connection streaming bytes. Put files in object storage and keep only their key and details in the database.
- **“Add an index on every column.”** Each index speeds up the queries that use it but slows every insert and update, which must maintain it too, and takes space. Index what your frequent queries filter, join and sort on, and check the query plan.
- **“A read replica always has the latest data.”** Copying is usually asynchronous, so a replica can lag behind the primary, from milliseconds to much longer under heavy load. Read a user's own recent writes from the primary.
- **“A document store means no schema to think about.”** The schema moves into the application: every reader must cope with every shape a document has ever had. Design documents around how they're read, and version them.
- **“More partitions fix a hot key.”** Every request for one partition key lands on the same partition, however many there are. Cache the hot key, spread it across several keys (for example with a numbered suffix), or redesign the key.

### APIs: REST, pagination and idempotency
- **“Put verbs in the path, like /createOrder.”** Name resources with nouns and let the method be the verb: POST /orders creates an order, GET /orders/42 reads one. Clients, caches and tools understand that convention, and the API stays consistent as it grows.
- **“Return 200 with the error message inside.”** Clients, retries, caches and monitoring all read the status code. A failed request that answers 200 looks like success to every one of them; send the right 4xx or 5xx code with a clear error body.
- **“POST is safe to retry.”** POST isn't idempotent: retrying a create after a timeout can create two orders or charge twice. Use idempotency keys, or make the operation an idempotent PUT to an ID the client chooses.
- **“Offset pagination works for any list.”** Deep pages make the database read and throw away every earlier row, and rows added between requests shift the pages so items repeat or vanish. For feeds and big lists, use cursors.
- **“A base64 cursor hides what's inside.”** Base64 is an encoding, not encryption: anyone can decode it. Never put secrets in a cursor, validate it on the server like any other input, and sign it if clients mustn't tamper with it.
- **“We can rename a field; clients will update.”** Old app versions stay in use for months. Only add to a published API, and for breaking changes publish a new version and retire the old one slowly, watching who still calls it.

### Back-of-the-envelope estimation
- **“Estimates need precise numbers.”** They need the right order of magnitude and stated assumptions. Whether it's 1,157 or 1,000 requests a second doesn't matter; 1,000 against 100,000 changes the design.
- **“Size the system for the average traffic.”** Systems fall over at the peak. Multiply the average by a peak factor (and say which), then add headroom and a spare server.
- **“Storage is just items × size.”** Multiply by how long the data is kept and by the number of copies (replicas, backups), and add indexes and growth. 1 TB of data can easily mean 4 TB of disk.
- **“Bandwidth is the same thing as requests per second.”** Bandwidth is requests × bytes. A modest 1,000 requests a second of 1 MB images is 8 Gbit/s, more than many servers' network links: that's what CDNs are for.
- **“MB/s and Mbit/s are the same.”** File sizes are counted in bytes and network speeds in bits, with 8 bits to a byte. 100 MB/s of data needs about 800 Mbit/s of network.
- **“Every registered user is active every day.”** Daily active users are usually a fraction of everyone who has signed up, and each does only a few things a day. Start from daily active users and actions per user, and say where those numbers came from.

## L2 Proficient (2026-10-09)

### Consistency models: what a reader is promised
- **“Eventual consistency means the data might never agree.”** It promises convergence once writes stop; what it doesn't promise is when, or what you see in the meantime. In a healthy system the lag is usually milliseconds to seconds.
- **“CAP means you pick two of consistency, availability and partition tolerance.”** Partitions happen whether you like it or not, so the real choice is what to do during one: refuse some requests or answer with possibly stale data. Outside partitions, PACELC's latency-or-consistency trade-off applies.
- **“Strong consistency is always the safe choice.”** It costs latency on every operation and availability during partitions. Use it where stale data causes real harm (money, stock, locks) and weaker promises elsewhere.
- **“Read-your-writes needs strong consistency everywhere.”** It's a promise to each client: send a user's reads to the leader for a while after they write, or only accept replicas that have their version. Everyone else keeps reading nearby copies.
- **“A replica that answers quickly is up to date.”** Replicas rarely know they're stale, and speed says nothing about freshness. Only versions or timestamps compared with what the client has seen can tell you.
- **“Last-writer-wins resolves conflicts safely.”** It keeps one write and silently discards the others, and it trusts clocks that can disagree. Fine for a profile picture, dangerous for a basket or a balance; module 2 covers better merges.

### Replication: leaders, followers and quorums
- **“A replica is a backup.”** A replica copies every change, mistakes included: a bad DELETE reaches every replica within milliseconds. You still need backups and point-in-time recovery to undo errors.
- **“Asynchronous replication never loses a confirmed write.”** If the leader dies before the followers receive a write it has already confirmed, the promoted follower doesn't have it. Use semi-synchronous replication or quorum writes where losing a confirmed write is unacceptable.
- **“W + R > N makes a leaderless store strongly consistent.”** It guarantees overlap with the latest successful write, but concurrent writes, writes that fail halfway and sloppy quorums can still give stale or conflicting reads. Quorums alone aren't linearizable.
- **“Multi-leader is just a faster leader-follower.”** Every leader accepts writes, so the same item can change in two places at once. Without a conflict strategy (a merge, last-writer-wins, or asking the user), data is silently lost.
- **“Last-writer-wins uses real time.”** It uses timestamps from clocks that drift and jump, so a server whose clock runs a few seconds slow can lose every conflict, even for later writes. Prefer version vectors or merges for data that matters.
- **“Automatic failover is always safer than manual.”** An over-eager failover on a slow network can promote a follower while the old leader is still alive (split brain), or drop recent writes. Use timeouts that fit your network, fencing, and leader election by consensus (L3).

### Partitioning: splitting data across machines
- **“hash(key) mod N is fine for sharding.”** Changing N moves almost every key: about 80% going from 4 nodes to 5, and 90% from 10 to 11. Use consistent hashing or many fixed partitions so that growth moves only a small share.
- **“Range partitioning by timestamp spreads the writes.”** All of today's writes land in the newest range, so one partition takes everything. Put a well-spread value (a bucket of the user or device id) before the timestamp, or hash.
- **“A good hash removes hot spots.”** A hash spreads different keys, but one key with enormous traffic still lands on one partition. Cache it, salt it into sub-keys, or give it its own capacity.
- **“Cross-partition queries are just a bit slower.”** They ask every partition and wait for the slowest, so tail latency grows with the number of partitions, and joins or transactions across partitions need extra machinery. Pick the partition key so that the common queries stay on one partition.
- **“Consistent hashing balances the load on its own.”** With one point per node, shares can differ several-fold. Virtual nodes, dozens to hundreds of points per node, bring every node close to its fair share.
- **“Rebalance automatically as soon as the load is uneven.”** Moving data costs bandwidth and disk on nodes that are already busy, and an automatic rebalance during an overload or a brief failure can make things worse. Rebalance deliberately, a few partitions at a time, with throttling.

### Caching strategies: writes, invalidation and stampedes
- **“Write-back is just a faster write-through.”** Writes that haven't been flushed exist only in the cache; if that node dies, they're gone. Use it where losing the last few seconds is acceptable (counters, metrics), or make the cache durable.
- **“Update the cached value on every write instead of deleting it.”** Two concurrent writers can update the database in one order and the cache in the other, leaving the cache wrong until its TTL ends. Deleting is safer: the next read reloads whatever the database holds.
- **“Deleting the key after a write keeps the cache consistent.”** A slow reader that read the old row before the write can store it after the delete (the stale-set race). Keep TTLs short, delete again a moment later, or use versions or leases that reject older values.
- **“A lock around recomputation solves stampedes.”** It stops the duplicate work but makes every waiting request slow, and a crashed lock holder stalls them all unless the lock expires. Serving stale data while one refresh runs, or refreshing early, keeps latency flat.
- **“Redis is a database, so it won't lose data.”** Its persistence is configurable and often asynchronous, and with eviction enabled it deletes keys under memory pressure by design. Keep the source of truth in a real database unless you've configured and tested Redis for durability.
- **“Put everything in one Redis.”** One instance is a single point of failure and executes commands one at a time. Separate the cache from rate limiters and locks, plan memory and eviction for each use, and use replicas or a cluster for anything critical.

### Messaging: queues, pub/sub and delivery guarantees
- **“Our broker guarantees exactly-once, so consumers don't need to deduplicate.”** Exactly-once features cover a narrow path, such as Kafka transactions from topic to topic, or SQS FIFO deduplication within a five-minute window. Effects outside the broker, like charging a card or sending an email, still need idempotency keys.
- **“Acknowledge first, so the message isn't redelivered.”** That's at-most-once: a crash after the ack loses the message. Process first, then acknowledge, and make the processing idempotent.
- **“A FIFO queue keeps things in order, however many consumers it has.”** The queue hands messages out in order, but parallel consumers finish them in any order. Order holds per partition or message group, with one consumer at a time.
- **“Retry failed messages until they succeed.”** A poison message never succeeds: it burns consumers and, in an ordered partition, blocks everything behind it. Cap the attempts, back off between them, and dead-letter the rest.
- **“Save to the database, then publish the event: what could go wrong?”** A crash between the two loses the event, and publishing first can announce an order that never commits. Use a transactional outbox or change-data-capture.
- **“A queue fixes overload.”** It turns a spike into a backlog. If consumers are slower than producers on average, the backlog grows until messages expire or the disk fills. Watch depth and consumer lag, scale consumers, and push back on producers.

### Rate limiting and resilience: limits, timeouts, retries and breakers
- **“Rate limit by IP address.”** Many users can share one IP (offices, mobile carriers), and one attacker can use thousands. Limit by API key or user where you can, and keep IP limits as a coarse outer layer.
- **“Just retry on errors.”** Retrying a non-idempotent call can double a payment, a 400 will never succeed, and retries at every layer multiply the load on a struggling service. Retry transient errors only, with backoff, jitter and a budget, at one layer.
- **“Exponential backoff is enough.”** Clients that failed together back off by the same amounts and come back together, in synchronized waves. Jitter, a random part in each wait, spreads them out.
- **“Long timeouts are safer: the call will succeed eventually.”** While it waits, the caller holds a thread, a connection and memory; enough slow calls exhaust them and the caller fails too. Set timeouts from the dependency's real latency, and pass deadlines down the call chain.
- **“A circuit breaker fixes the failing service.”** It protects the caller and gives the dependency room to recover, but users still see errors unless there's a fallback: a cached result, a default, or a feature that degrades gracefully.
- **“Each server can keep its own counter.”** With N servers behind a load balancer, a client gets up to N times the limit. Share the counters (Redis, updated atomically), give each server limit/N as an approximation, or route each client to one server.

### Service architecture: monoliths, microservices, gateways and discovery
- **“Microservices will make us faster.”** Only when separate teams are blocking each other. For a small team they add network calls, distributed data and operational work, and slow everything down. Start with a modular monolith and split where a boundary has earned it.
- **“Split by layer: a UI service, a logic service, a data service.”** Then every feature touches every service. Split by business capability (orders, payments, catalogue), so most changes stay inside one service.
- **“The services can share one database; it's simpler.”** Shared tables couple the services: a schema change needs every team, and one service's heavy query slows the others. Each service owns its data and shares it through its API or events.
- **“Put business logic in the gateway, since every request passes through it.”** The gateway becomes a bottleneck every team must change, and a single point of failure for that logic. Keep it to cross-cutting concerns: routing, authentication, limits, TLS.
- **“A long chain of synchronous calls is fine; each service is 99.9% available.”** Availabilities multiply and latencies add: ten services in a chain at 99.9% each give about 99.0%, and the chain is as slow as all of them together. Prefer events for workflows, and keep chains short.
- **“Service discovery means hard-coding the load balancer's address.”** Instances change constantly with autoscaling and deploys. Callers need a registry kept current by health checks (or a platform such as Kubernetes that provides one), and should retry on another instance when one fails.

### Real-time communication: polling, long polling, SSE and WebSockets
- **“WebSockets are always the best choice for real time.”** If only the server sends, SSE is simpler: plain HTTP, with reconnection and resuming built in. If updates are rare, polling may be cheaper than holding a connection per user.
- **“Once a message is pushed, it has been delivered.”** Pushes are lost when phones switch networks or apps go to sleep. Store first, number messages per conversation, and let clients fetch gaps and catch up on reconnect.
- **“Polling every second gives real time cheaply.”** The load is clients × frequency whether or not anything changed: a million clients polling every second is a million requests a second, nearly all of them empty.
- **“The load balancer will spread WebSocket load evenly.”** Connections live for hours, so a server that restarts or joins late stays unbalanced. Balance by connection count, drain gently on deploys, and add jitter to reconnects so a restart doesn't cause a stampede.
- **“Every server can broadcast every message to every other server.”** That works for a handful of servers; then the traffic between servers dominates. Route through a registry of which server holds which user, or subscribe each server only to the channels its users need.
- **“Presence (who's online) can be exact.”** Connections die silently, so presence is a heartbeat with a TTL and is always a few seconds stale. Design the interface to tolerate that.

### Observability: logs, metrics, traces and SLOs
- **“Alert on high CPU.”** Users don't feel CPU; they feel errors and slowness. Page on symptoms (the SLO burning), and keep cause signals like CPU for dashboards and capacity planning.
- **“Track the average latency.”** Averages hide the slow requests users remember. Record histograms and watch p95 and p99, and remember that a page making ten calls meets each call's p99 far more often than 1% of the time.
- **“Aim for 100% availability.”** It's impossible, enormously expensive to approach, and users can't tell 99.99% from 100% through their own networks and devices. Pick the target users need, and spend the rest of the budget on shipping.
- **“Add the user id as a metric label so we can break it down by user.”** Every distinct label value creates another time series; a million users means a million series per metric. Keep high-cardinality fields in logs and traces.
- **“Log everything at debug level, just in case.”** Volume drives cost and buries the signal, and logs can leak secrets and personal data. Log structured events with ids, sample the noisy ones, and use traces for request flows.
- **“Tracing means instrumenting every service by hand.”** OpenTelemetry's libraries and auto-instrumentation cover common frameworks, HTTP clients and databases; you add spans by hand only for your own important steps. What must never be skipped is passing the trace header on.

### The interview framework and classic designs
- **“Start drawing boxes straight away.”** Without requirements and numbers the design has nothing to be right about. Spend the first minutes on scope, non-functional needs and estimates; they decide whether you need a cache, partitioning or a queue.
- **“Non-functional requirements are optional extras.”** Latency, availability, consistency and durability targets shape a design more than its features do: “messages are never lost” and “a feed may be a minute stale” lead to very different systems.
- **“Design for a billion users from day one.”** Design for the stated scale with room to grow, and say what you'd change at 10× and 100×. Complexity that the numbers don't justify costs money and time, and interviewers notice.
- **“A single cache node is a single point of failure.”** Only if requests fail without it. With cache-aside, a cache outage makes reads slower, not impossible, provided the database can take the extra load for a while.
- **“There's one right answer.”** There are several defensible designs. What's judged is whether each choice follows from the requirements and whether you can say what it costs.
- **“Deep dives should cover everything.”** Time is short: pick the one or two parts that are hardest or riskiest for this product, such as fan-out for a feed or ordering for chat, and go deep there.

## L3 Specialist (2026-10-09)

### Distributed transactions: two-phase commit, sagas, outbox and inbox
- **“Use two-phase commit across our microservices.”** Every service must support prepare, all of them must be up for any order to commit, and a coordinator failure leaves them holding locks. Across services, sagas with idempotent steps are the usual answer; keep 2PC inside database systems that make the coordinator highly available.
- **“A compensation is a rollback.”** The original step committed and others may have seen it. A compensation is a new business action (a refund, a release, a cancellation) that must be idempotent and retried until it succeeds, and it may leave traces, such as a refund line on a statement.
- **“A saga is isolated like a transaction.”** Each step commits at once, so other transactions see intermediate states: stock reserved for an order that will be cancelled. Use pending states, commutative updates and re-reads, and show users the pending status.
- **“Put the irreversible step first, to get it over with.”** Then a later failure leaves nothing you can undo. Put compensatable steps first, then the pivot, then steps that can only be retried.
- **“Choreography is always more decoupled, so always use it.”** For long flows the logic hides in a web of subscriptions, cycles creep in, and nobody can say where an order is. An orchestrator keeps the flow visible and resumable; choreography suits two or three steps.
- **“The broker deduplicates, so consumers don't need an inbox.”** Broker deduplication covers narrow cases and windows. A consumer that records processed ids in the same transaction as its effect is safe against every kind of repeat, including relay replays from the outbox.

### Event-driven architecture: event sourcing, CQRS and evolving schemas
- **“With event sourcing we can delete the database and just keep events.”** Replaying everything on every read is too slow. Keep snapshots and projections for reading; the log is the source of truth, not the only store.
- **“Events are just our database rows, sent out.”** Rows describe current state and change shape with every refactor. Events are business facts, in the past tense, designed as a stable contract that other teams build on.
- **“CQRS means the read side is always up to date.”** Projections lag behind the log, by milliseconds or minutes. Design screens for it: show what was just submitted from the command's result, or wait for the projection's offset to pass the write.
- **“We can rename a field in the new version; consumers will update.”** Old events in the log keep the old name forever, and consumers update at different times. Add a new field with a default, keep reading the old one, and upcast.
- **“Start with a few partitions; we can add more later.”** Adding partitions remaps most keys, so a key's new events land in a different partition from its old ones and per-key order breaks. Size for growth from the start, or plan a migration to a new topic.
- **“Immutable logs and the right to be forgotten don't mix, so ignore it.”** Regulations still apply. Keep personal data out of events where you can, reference it by id, or encrypt it per person and delete that person's key (crypto-shredding).

### Stream and batch processing: windows, watermarks and exactly-once
- **“Window by processing time; it's simpler.”** Results then depend on network delays and outages: a backlog after an outage piles into the minute it's processed. Window by event time, and use processing time only where arrival time really is the question.
- **“A watermark guarantees no older events will come.”** It's an estimate. Decide what happens to events behind it: drop them and count them, send them to a side output, or update results already emitted, and make downstream consumers handle updates.
- **“Exactly-once processing means my emails are sent exactly once.”** Checkpoints make state and transactional or idempotent sinks exact. A side effect outside them, such as an email or an API call, can still repeat after a replay unless it carries an idempotency key.
- **“Lambda is the safe choice because the batch layer fixes everything.”** It doubles the logic and the bugs: two codebases computing the same metric drift, and their results disagree. With a replayable log, one streaming job that can reprocess (Kappa) is usually simpler.
- **“Checkpoint as rarely as possible to save overhead.”** Rarely checkpointed jobs replay a lot after every failure, and transactional sinks hold their output longer. Choose the interval from the recovery time you can accept.
- **“State grows; we'll just add memory.”** Windows and sessions keep state per key until the watermark passes them; unbounded keys or no allowed-lateness limit means unbounded state. Bound lateness, expire state with TTLs, and keep large state in RocksDB with incremental checkpoints.

### Consensus and coordination: Raft, fencing tokens and logical clocks
- **“Two nodes are enough for a highly available consensus cluster.”** A majority of two is two, so losing either one stops all progress. Use three servers to survive one failure, or five to survive two; an even number adds cost without adding tolerance.
- **“A lock with a lease is safe: the lease expires before anyone else can get it.”** The holder can pause past its lease (garbage collection, a VM migration, a slow disk) and then act as if it still holds it. Locks that protect correctness need fencing tokens checked by the resource.
- **“Check that we still hold the lock just before writing.”** The pause can come between the check and the write. Only the resource receiving the write can reliably reject a stale holder, by comparing tokens.
- **“Order writes from different machines by their timestamps.”** Clock skew and NTP steps make cross-machine timestamps unreliable, and last-write-wins with skewed clocks silently drops writes. Order through a consensus log, or use logical or hybrid clocks.
- **“Lamport timestamps tell me which events were concurrent.”** They give an order consistent with causality, but L(a) < L(b) doesn't mean a caused b. Use vector clocks to detect concurrent updates.
- **“Five members across two data centres, three in one and two in the other, survive a data-centre outage.”** Losing the three-member site leaves two of five: no majority, so the cluster stops. Spread members over three failure domains, such as 2 + 2 + 1, so any one can fail.

### Storage engines: B-trees, LSM trees and the write-ahead log
- **“LSM trees are faster than B-trees.”** Faster at ingesting writes; often slower for point reads and range scans, and compaction adds background I/O and latency spikes. The right engine depends on the read and write mix, so benchmark your own workload.
- **“Random UUIDs are fine as primary keys.”** In a B-tree index each random key lands on a different page, rewriting a whole page per row and, once the index outgrows memory, adding a random read per insert. Time-ordered keys (UUIDv7, ULIDs) keep inserts on the newest pages.
- **“Deletes free space in an LSM tree right away.”** A delete writes a tombstone, which costs space and slows reads until compaction removes it; mass deletes can pile up tombstones and time out queries. Prefer TTLs and time-window compaction, or drop whole partitions or tables.
- **“Purge tombstones as soon as possible.”** A replica that missed the delete still holds the old value; if tombstones vanish before repair reaches it, the value comes back as zombie data. Cassandra keeps them for gc_grace_seconds (ten days by default), and repairs must run within that window.
- **“Acknowledging writes before the fsync is safe; the OS will write them soon.”** Until the fsync, the data is only in memory: a power cut loses writes the clients were told were saved. Use group commit to stay durable and fast, and relax durability only where losing the last moments of writes is acceptable.
- **“Compaction is background work; it won't affect users.”** It competes for disk bandwidth, and when it falls behind, files pile up, reads slow down and disk use grows. Rate-limit it, leave headroom, and alert on pending compaction bytes.

### Search and geo: inverted indexes, ranking, geohashes and quadtrees
- **“LIKE '%term%' is good enough for search.”** It scans every row, can't rank, and misses plurals and typos. Use full-text search: PostgreSQL's GIN-indexed tsvector for modest needs, a search engine when you need relevance tuning, facets and scale.
- **“The search engine can be the source of truth.”** A search index is a derived, eventually consistent copy without transactions. Keep the truth in the database, feed the index through change data capture, and make sure it can be rebuilt from scratch.
- **“Index with one analyzer, query with another.”** If 'Running' is indexed as 'run' but the query keeps 'running', nothing matches. Analyze both sides the same way, and reindex whenever the analyzer changes.
- **“Deep pagination is free: page 500 costs the same as page 1.”** To serve results 10,000 to 10,020, every shard must find its top 10,020 and the coordinator must merge them all. Cap the page depth, and use search-after cursors for deep scrolling.
- **“A shared prefix means close, so close means a shared prefix.”** The first holds; the second doesn't. Two points either side of a cell edge can share almost no prefix, so always search the neighbouring cells too.
- **“A geohash cell is a square of fixed size.”** Cells are fixed in degrees, not metres. A 5-character cell is about 4.9 km square at the equator, but only about 3.2 km wide in Paris, and narrower still towards the poles.

### Multi-region and disaster recovery: RPO, RTO, failover and residency
- **“We replicate to another region, so we have disaster recovery.”** Replication copies mistakes too: a bad migration or a mass delete reaches the replica within seconds. Keep point-in-time backups, ideally immutable and in a separate account, and test restoring them.
- **“Fail over automatically as soon as heartbeats stop.”** From one region, a dead peer and a broken link look the same. Confirm from a third location, fence the old primary, and wait long enough to ride out short network blips.
- **“The standby region will scale up when we need it.”** In a regional outage everyone fails over at once, and capacity or quotas can run out. Keep enough capacity running or reserved, and count scaling time in the RTO.
- **“Active-active just means running the same stack twice.”** Concurrent writes to the same data in two regions conflict. Give each record a home region, use CRDTs where data can merge, or pay for a globally consistent database.
- **“Our DR plan is written down, so it works.”** Untested plans fail on hidden dependencies such as DNS, identity providers, secrets and deployment pipelines. Rehearse with game days and real region evacuations.
- **“Data residency is solved by putting the main database in the right region.”** Backups, logs, analytics copies, caches and support tools hold personal data too. Map every copy, keep each within the allowed regions, and fail over only within them.

### Security architecture: identity, authorization, zero trust, secrets and encryption
- **“The gateway checked the token, so the services behind it can trust every request.”** Anything inside the network can call them directly: a compromised service, a misrouted request, a server-side request forgery bug. Authenticate callers with mTLS and authorize every request in the service that owns the data.
- **“Put the user's roles and details in the JWT; it's signed.”** Signed isn't encrypted: whoever holds the token can read it, and claims go stale until it expires. Keep claims minimal, and look up anything sensitive or fast-changing.
- **“Long-lived tokens are fine; we can revoke them.”** A self-contained token can't be revoked without a deny list. Keep access tokens to minutes, and make refresh tokens rotate on each use and be revocable.
- **“Secrets in environment files are fine; the repository is private.”** Private repositories leak through forks, laptops, CI logs and former staff. Use a secrets manager, scan for leaks, and rotate anything that was ever committed.
- **“The database is encrypted at rest, so the data is safe.”** At-rest encryption protects stolen disks and backups, not a compromised application holding valid credentials. Authorization, least privilege and audit logs still matter, and the keys must live apart from the data.
- **“The UI hides the button, so users can't do it.”** UI checks are a convenience; attackers call the API directly. Enforce every permission on the server, for the specific object.

### Classic large designs: video, ride-hailing, collaborative docs, payments, crawlers and key-value stores
- **“Stream video straight from our own servers.”** Video is mostly bytes: a single popular title can need terabits a second. Serve segments from CDNs, push popular titles to the edge ahead of demand, and keep the origin for the long tail.
- **“If a payment call times out, just retry it.”** Without an idempotency key the retry can charge the card twice. Retry with the same key, and if the outcome is still unknown, check the payment's status before deciding.
- **“Store each account's balance and update it.”** In-place updates lose the history and make errors untraceable. Record every movement as balanced double-entry ledger lines, append-only, and derive balances from them.
- **“Lock the document while someone is editing.”** Locks kill collaboration and fail badly when a client disconnects. Apply edits locally and merge concurrent ones with operational transformation or CRDTs.
- **“Crawl breadth first, as fast as possible.”** That hammers whichever site has the most links, gets the crawler blocked, and can fall into infinite calendar or session-id URL spaces. Use per-host queues and delays, honour robots.txt, normalise URLs and cap depth per site.
- **“Last-writer-wins is fine for the key-value store; conflicts are rare.”** Concurrent writes do happen, and last-writer-wins silently drops all but one. Keep one writer per key where you can, or detect conflicts with vector clocks and merge them (CRDTs, or the application).

## L4 Expert (2026-10-12)

### Architecture decision-making: ADRs, trade-off analysis and reversibility
- **“We'll decide once we have all the facts.”** You never will. Decide at the last responsible moment, when waiting starts to cost more than it teaches, and buy cheap information (spikes, prototypes) in the meantime.
- **“The decision matrix chose it.”** The weights chose it, and weights are opinions. Agree them first, show how sensitive the winner is, and get evidence where it's fragile.
- **“We'll write the ADR afterwards, for the documentation.”** Written later, it becomes a justification: the options that were rejected, and why, are forgotten. Write it while deciding, and let it shape the discussion.
- **“Every decision should go through the architecture review board.”** That turns the board into a queue and teams into ticket writers. Let teams make two-way-door decisions themselves; save reviews for one-way doors and cross-team impact.
- **“Update the old ADR when the decision changes.”** Rewriting history hides why things were done. Write a new ADR that supersedes the old one, and mark the old one superseded.
- **“A good architecture is one that meets today's requirements.”** Requirements change. Treat modifiability and reversibility as drivers in their own right, and prefer designs that keep options open where it's cheap.

### Well-architected frameworks: the pillars, reviews and trade-offs
- **“We passed the well-architected review.”** There's nothing to pass. The review's output is a list of risks and a plan to reduce them; a workload with no open risks usually means the questions weren't answered honestly.
- **“Maximise every pillar.”** The pillars pull against each other: more reliability and performance cost money and energy. Agree targets per workload, such as an availability goal priced from the cost of downtime, and stop there.
- **“Do the review once, at launch.”** Workloads drift: new features, new dependencies, new traffic. Review at milestones and after major incidents, and automate the checks that must always hold.
- **“Size servers by their average CPU.”** Averages hide the busy hours. Size from a high percentile, keep headroom for spikes and failover, and right-size in both directions.
- **“Sustainability is a separate project.”** Most of it is the same work as cost optimisation: higher utilisation, scaling with demand, removing idle resources and efficient hardware. Track it with the same data.
- **“A permanent exemption is fine for that one database.”** Accepted risks need an owner and an expiry date; otherwise they become invisible. Re-accept them consciously, or fix them.

### Capacity and cost: planning, queueing, load testing and FinOps
- **“Size for the average load.”** Users arrive in peaks. Plan for the peak hour of the peak day, then add headroom for the latency target and for losing a zone.
- **“CPU is at 50%, so we can double the traffic.”** Latency rises steeply long before 100%, and something else may run out first: connections, locks, quotas, a partner's rate limit. Only a load test of the whole path tells you.
- **“The load test passed with 100 virtual users.”** Closed-model users send less when the system slows, so stalls go unmeasured. Specify an arrival rate, use production-like data and request mixes, and measure from the intended send time.
- **“If we need more throughput, we'll add nodes.”** Contention and coherency make throughput flatten and then fall. Past the peak, more nodes make it slower: share less state, or partition the work instead.
- **“Commit to everything for the biggest discount.”** Commitments are paid whether used or not. Commit to the capacity that's needed in most hours (more than the price ratio), and rent the peaks.
- **“FinOps is the finance team's job.”** Engineers make most of the spending decisions. FinOps gives each team timely cost data and ownership of it, with a central team enabling the practice.

### Evolution and migration: the strangler fig, data migrations and backwards compatibility
- **“We'll rewrite it from scratch; it'll take a year.”** The old system keeps changing, the new one must match years of behaviour, and nothing ships until the end. Strangle it instead: one capability at a time, each delivering value.
- **“Rename the column in the same release as the code.”** Services deploy at different times and rollbacks bring old code back. Expand, migrate, then contract, so every step works with both versions.
- **“Dual writes keep the two stores in sync.”** One write can succeed while the other fails, and concurrent writes can arrive in different orders. Verify continuously, repair differences, or write once and propagate with change data capture or an outbox.
- **“The backfill just copies the rows.”** A live update can land between the backfill's read and its write. Write conditionally by version, and make the backfill idempotent, resumable and throttled.
- **“Adding a field is always safe.”** Not if it's a required field in a request, if it changes a default, or if clients treat an unknown enum value as an error. Check source, wire and semantic compatibility.
- **“We announced the deprecation, so we can switch v1 off.”** Announcements don't reach every caller. Measure traffic by client, contact the remaining callers, and switch off only when usage is gone or the agreed date has passed.

### Socio-technical design: Conway's law, Team Topologies and platform teams
- **“Architecture and organisation design are separate decisions.”** Conway's law says they converge whether you plan it or not. Decide service boundaries and team boundaries together.
- **“Bigger teams get more done.”** Communication paths grow with the square of team size, and so does the time spent coordinating. Split by stream into small, long-lived teams.
- **“Component teams are efficient: each is expert in its layer.”** Each feature then queues at every layer's team. Stream-aligned teams own a slice end to end; keep specialists for the genuinely hard parts.
- **“The platform team is the infrastructure team, renamed.”** A platform is an internal product: research users' needs, self-service APIs and docs, a roadmap, and adoption earned, not mandated.
- **“Collaboration between teams is always good.”** Collaboration is expensive and meant for discovery, for a limited time. Long-running collaboration usually means a boundary is in the wrong place.
- **“Microservices will fix our coordination problems.”** Services whose boundaries don't match team ownership create a distributed monolith: the same coordination, now over the network.

### AI systems design: LLM serving, RAG at scale and agent platforms
- **“Use the biggest model for everything; quality comes first.”** Most requests don't need it. Route by task or difficulty, measure each model's accuracy per task, and pay for the large model only where it changes the answer.
- **“Batch size one gives the best latency, so serve that way.”** It wastes the accelerator and queues everyone else. Continuous batching gives high throughput with modest per-user cost; tune the batch to your latency targets.
- **“The context window is our memory: put everything in.”** Every token costs money and time on every call, and memory per request. Retrieve what's needed, summarise history, and cache stable prefixes.
- **“Vector search is all we need.”** Exact terms such as error codes, names and product numbers are found better by keyword search. Use hybrid retrieval and reranking, and measure recall.
- **“The system prompt tells the model to ignore injected instructions.”** Models can't reliably separate instructions from data. Enforce permissions, approvals and budgets outside the model.
- **“The demo works, so ship it.”** Without an evaluation set you can't tell whether the next prompt or model change made things worse. Test every change, then monitor quality, cost and latency in production.
