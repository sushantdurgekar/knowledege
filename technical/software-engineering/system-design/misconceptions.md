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
