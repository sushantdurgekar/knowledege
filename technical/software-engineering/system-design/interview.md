---
title: "System Design: interview questions"
track: technical
subject: system-design
created: 2026-10-12
updated: 2026-10-12
---
# System Design: interview questions

Sections are added by each hub level. Newest build replaces its own level's section.

## L1 Foundation (2026-10-09)

### What happens when you type a URL into a browser and press Enter?
_Networking_

The browser parses the URL and finds the server's IP address with DNS, usually from a cache. It opens a TCP connection (one round trip) and sets up TLS (one more with TLS 1.3), checking the server's certificate, or does both in one round trip with HTTP/3 over QUIC. Then it sends the HTTP request; a CDN or a load balancer may answer or forward it to an app server, which replies with a status code, headers and HTML. The browser parses that and fetches the images, styles and scripts it refers to, reusing connections where it can. For a distant user the round trips, not the server's work, take most of the time.

Follow-ups: Where does the time go for a user on another continent? · What does HTTP/3 change?

### TCP or UDP: when would you use each?
_Networking_

TCP gives a reliable, ordered byte stream, so it carries most web traffic, databases and anything where every byte matters; it costs a handshake, and one lost packet stalls everything behind it. UDP sends independent datagrams with no handshake and no delivery promise, which suits real-time voice, video and games, where late data is useless, and small request-and-answer traffic such as DNS. QUIC builds reliable, multiplexed streams on top of UDP for HTTP/3.

Follow-ups: Why doesn't a video call just use TCP?

### Vertical or horizontal scaling: how do you choose?
_Scaling_

Scaling up, to a bigger machine, needs no code changes and is often the cheapest first step, but it has a ceiling and leaves a single point of failure. Scaling out, to more machines behind a load balancer, keeps growing and survives a machine failing, but the servers must be stateless and you take on more moving parts. I usually scale the stateless web tier out early, scale the database up for as long as that's comfortable, and move it to replicas and partitioning when the numbers say so.

Follow-ups: What has to change in an app before it can scale out?

### What makes a service stateless, and why does it matter?
_Scaling_

A stateless service keeps nothing about a user in its own memory between requests: sessions, carts and uploads live in a shared store, a database or object storage, or in a signed token the client sends back. Then any server can answer any request, so a load balancer can spread traffic freely, and servers can be added, removed or restarted without logging anyone out. Sticky sessions hide the problem, but give uneven load and lose sessions when a server dies.

Follow-ups: What are the trade-offs of signed tokens against a session store?

### How do you estimate the availability of a system with several components?
_Reliability_

Components a request needs one after another multiply, so three at 99.9% give about 99.7%. A tier of redundant copies is down only when all of them are: 1 − (1 − a)ⁿ, so two copies at 99.9% give 99.9999%. That shows where to add redundancy: at the weakest link, often a single database. The parallel formula assumes independent failures, so copies go in different racks or zones, and the result is a best case.

Follow-ups: What's an error budget? · Why can two servers in one rack fail together?

### How should a client retry a failed request?
_Reliability_

Only for errors that may pass, such as timeouts, connection resets and 503s, and only for operations that are safe to repeat: GET, PUT and DELETE, or POSTs with an idempotency key. It should wait between attempts with exponential backoff and random jitter, so that clients that failed together don't retry together, cap the attempts at a small number, and retry at one layer only, because retries at every layer multiply. Every call also needs a timeout.

Follow-ups: What's a retry storm? · What does a circuit breaker add?

### How does a load balancer choose a server, and how does it notice failures?
_Load balancing_

It picks from the healthy servers with an algorithm: round robin when servers and requests are alike, weights when servers differ in size, least connections when request times vary, or a hash of a key when the same user should reach the same server. It probes every server with health checks every few seconds, taking one out after several failures in a row and bringing it back after several passes, so a single blip doesn't make it flap. The load balancer itself runs as a redundant pair or a managed service.

Follow-ups: What should a health check test? · How do you take a server out without dropping requests?

### Layer 4 or layer 7 load balancing?
_Load balancing_

A layer 4 balancer forwards TCP or UDP connections by address and port without reading them: fast, simple and protocol-agnostic. A layer 7 balancer understands HTTP, so it can terminate TLS, route by path or host, add headers and retry safe requests, at more cost per request. Web apps usually want layer 7; layer 4 suits other protocols and very high throughput, often as a first tier in front of layer 7 proxies.

### Explain cache-aside, and how you keep the cache consistent with the database.
_Caching_

The app checks the cache first; on a miss it reads the database and stores the result with a TTL. Only data that is read gets cached, and a cache failure just makes reads slower. On a write I update the database and then delete the cached key, so the next read loads the fresh value, and the TTL is a safety net in case a delete is lost. Data that must never be stale, such as a price at checkout, is read from the database.

Follow-ups: Why delete the key rather than update it? · Write-through or write-back?

### What is a cache stampede, and how do you prevent it?
_Caching_

When a popular entry expires, every request misses at the same moment and they all hit the database together, which can knock it over. The fixes: let one request rebuild the entry while the others wait for it or get the old value (single flight, or a lock or lease), add random jitter to TTLs so keys don't expire together, and refresh hot keys before they expire.

### How does a CDN decide what to cache, and how do you ship a new version of a file?
_Caching_

The origin's Cache-Control headers decide: max-age or s-maxage for how long a copy stays fresh, private or no-store to keep it out of shared caches. When a copy goes stale the edge revalidates it with the ETag and gets a 304 if nothing changed. For static files the best approach is a content hash in the file name and a year-long lifetime: a release refers to new names, so no user sees a stale mix and nothing needs purging.

### SQL or NoSQL: how do you decide?
_Storage_

From the access patterns. If the data is relational, needs transactions and will be queried in ways I can't predict yet, a relational database is the default, and with caching and read replicas it goes a long way. A key-value or wide-column store fits a few known access patterns at very large scale, such as sessions, events or a feed per user; a document store fits records read and written whole whose shape changes often. Files go to object storage either way.

Follow-ups: How would you store a user's orders by date in a key-value store?

### What is replication lag, and how do you deal with it?
_Storage_

With asynchronous replication a replica applies the primary's changes a little later, so reads from it can be out of date: usually by milliseconds, more under load. The visible problem is a user who saves something and doesn't see it. The usual fix is reading your own writes: for a few seconds after a user writes, their reads go to the primary, while everyone else keeps using replicas. Data that must be current is always read from the primary.

### How do you make a create endpoint safe to retry?
_APIs_

The client sends an Idempotency-Key, a unique id for that one operation, with the request and every retry. The server stores the key with the first response, ideally in the same transaction that creates the resource, and replays that response for any repeat. A repeat with a different body gets an error, and a repeat while the first is still running gets 409 so the client waits. Keys expire after a day or so.

Follow-ups: Why isn't POST idempotent on its own?

### Offset or cursor pagination?
_APIs_

Offset pagination is simple and allows jumping to any page, but deep pages make the database read and throw away every earlier row, and new rows shift the pages so items repeat or go missing. Cursor pagination returns an opaque token with the last item's sort key, usually a timestamp plus an id to break ties, and asks for items after it. It's fast at any depth with an index and stable while data changes, but can't jump to page 50. I use cursors for feeds and big lists.

### Estimate the traffic and storage for a URL shortener.
_Estimation_

Assume 100 million new links a month and 100 redirects per link. That's about 40 writes a second and 4,000 redirects a second on average, about 12,000 at a 3× peak. Over five years that's 6 billion links, so base-62 codes need 6 characters (62⁶ ≈ 57 billion). At 500 bytes a record, that's 3 TB, or 9 TB with three copies, and caching 20% of a day's reads needs about 33 GB of memory. Nothing there needs a huge fleet, so the design effort goes into fast redirects and availability.

Follow-ups: What would change at 100 times the traffic?

## L2 Proficient (2026-10-09)

### Explain CAP and PACELC, and how you'd use them in a design discussion.
_Consistency_

CAP says that when a network partition separates replicas, a system must either refuse some requests to stay consistent or keep answering on both sides and accept that they diverge. PACELC adds the everyday case: even without a partition, you trade latency against consistency, because waiting for other replicas takes time. In a design I use them per feature, not per system: payments and inventory counts choose consistency and accept errors or delays during a partition; likes, feeds and view counts choose availability and low latency, and converge later.

Follow-ups: Where does a single-leader database with async replicas sit? · What does the user see when a CP system is partitioned?

### What's the difference between linearizability and eventual consistency, and when do you need each?
_Consistency_

Linearizability makes the system behave like a single copy: once a write completes, every later read, from any client, sees it. Eventual consistency only promises that replicas converge if writes stop, so reads can be stale for a while. I need linearizability for things like a unique username, a lock or an account balance that must not go negative; elsewhere eventual consistency, often with session guarantees such as read-your-writes, is cheaper and faster.

### How can leader failover go wrong, and how do you guard against it?
_Replication_

With asynchronous replication the new leader may be missing the old leader's last writes, so they're lost or conflict when the old leader comes back. If the old leader isn't really dead, just slow or cut off, two leaders can accept writes at once: split brain. Guards: semi-synchronous replication so at least one follower has every write, a consensus-based election, fencing tokens so storage rejects the old leader's writes, and timeouts that aren't so short that a pause triggers failover.

Follow-ups: What's a fencing token?

### How do quorums work in a leaderless store?
_Replication_

Each key lives on N replicas. A write is sent to all of them and succeeds after W acknowledge; a read asks R and takes the newest version. If W + R > N, every read set overlaps the last write's set, so the read sees it; N = 3 with W = R = 2 is common. Replicas that missed writes catch up through read repair and background anti-entropy. The overlap guarantee weakens with sloppy quorums, concurrent writes and failures mid-write, so it's not full linearizability.

### How would you partition a large table, and what do you do about hot keys?
_Partitioning_

I pick a partition key from the main access pattern: hash it for an even spread, or use ranges when range scans matter, accepting hot ranges. Routing goes through a lookup service or the client library, and secondary indexes are either local to each partition (queries fan out) or global (writes update another partition). For a hot key, I cache it, split it into sub-keys such as key#0 to key#9 and combine on read, or give it a partition of its own.

Follow-ups: Why fixed partitions rather than one per node?

### What is consistent hashing, and why use virtual nodes?
_Partitioning_

Nodes and keys are hashed onto a ring, and each key belongs to the next node clockwise. Adding or removing a node moves only the keys on its arc, about 1/N of them, instead of almost all keys as with hash mod N. With few nodes the arcs are uneven, so each node takes many points on the ring (virtual nodes): that evens out the load, and a leaving node's keys spread over many others instead of one neighbour.

### Write-through, write-back or write-around: how do you choose?
_Caching_

Write-through updates the cache and the database together, so reads right after a write are fresh, at the cost of slower writes; it suits data read soon after it's written. Write-back writes the cache and flushes later, which is fast and batches well but loses unflushed writes if the cache dies, so I keep it for counters and metrics. Write-around writes only the database and drops the cached copy, which suits data rarely re-read soon. In every case I delete rather than update cached values, and guard against the stale-set race.

### Can a message queue give you exactly-once processing?
_Messaging_

Not by itself across an unreliable network: an acknowledgement can be lost, so the broker redelivers, which is at-least-once. What you can build is an exactly-once effect: the consumer records each message id in the same transaction as its effect and skips ids it has seen, or makes the effect idempotent by nature. Kafka's transactions give exactly-once from topic to topic, but side effects outside Kafka, such as charging a card, still need idempotency.

Follow-ups: What's the difference between at-most-once and at-least-once?

### How do you keep events in order, and what breaks ordering?
_Messaging_

Order holds within a partition, so I key events by the entity whose order matters, such as the order id, and let one consumer read each partition at a time. Parallel consumers on one queue, retries that requeue at the back, dead-letter queues and producers retrying out of order all break it. Where order matters a lot, consumers should also check version numbers or sequence numbers, so a late event can't overwrite a newer state.

### What is the transactional outbox, and why is it needed?
_Messaging_

Writing to the database and publishing to a broker are two writes that can't be made atomic: crash between them and the event is lost, or announced for a change that never committed. With an outbox, the service writes the event into an outbox table in the same transaction as the change; a relay, or change-data-capture on the database log, publishes it afterwards. Delivery is at-least-once, so events carry ids and consumers deduplicate.

### Design a rate limiter for an API that runs on many servers.
_Resilience_

Requirements first: limits per API key, say 100 requests a minute with short bursts, checked in about a millisecond, with 429 and Retry-After when exceeded. I'd use a token bucket per client in Redis, as a hash of tokens and the last refill time, updated by a Lua script so the refill, check and spend are atomic across all API servers; keys get a TTL so idle clients disappear. The limiter sits in the gateway, before any work is done. If Redis is unreachable, ordinary APIs fail open and sensitive ones such as logins fail closed. At very high volume, servers can hold a small local allowance and sync in batches.

Follow-ups: Token bucket or sliding window? · How do you avoid Redis becoming a single point of failure?

### What is a circuit breaker, and how does it differ from a retry?
_Resilience_

A retry repeats a failed call in the hope that the failure was brief. A circuit breaker does the opposite when failures persist: after a threshold of failures it opens and fails calls at once, without calling the dependency, for a cool-down; then it lets a trial call through and closes if it succeeds. Retries handle blips; breakers stop a caller from wasting threads and hammering a dependency that's down. They work together, with timeouts on every call and a fallback for when the breaker is open.

### Would you start a new product with microservices or a monolith?
_Architecture_

Usually a modular monolith: one deployable with enforced module boundaries, which is simple to build, test and change while the domain is still being discovered. I'd split off services when separate teams start blocking each other's releases, or when a part needs its own scaling or failure isolation, cutting along business capabilities with each service owning its data. Splitting early turns every change into a distributed one: network calls, versioned APIs and no transactions across services.

### How would you build the real-time part of a chat app?
_Real time_

Clients hold a WebSocket to a fleet of gateway servers. When a message arrives, the chat service stores it first, with the next sequence number for its conversation, then routes it to the gateways holding the recipients' connections, using a registry or pub/sub, with push notifications for offline devices. Pushes can be lost, so clients fill gaps by sequence number, ignore duplicates, and on reconnect ask for everything after the last number they saw. Presence is a heartbeat with a TTL, so it's always slightly stale.

Follow-ups: How do you handle a group with 100,000 members?

### How do you define SLOs, and what do you do with the error budget?
_Observability_

I pick SLIs that users would notice, as ratios of good events to all events, such as checkout requests that succeed within 500 ms, measured close to the user. The SLO is a target over a window, say 99.9% over 30 days, and the 0.1% left over is the error budget. Alerts page on the budget's burn rate (fast and slow windows), not on CPU. While budget remains we ship; when it's being spent too fast, the agreed policy slows risky releases and moves effort to reliability.

### Design a news feed.
_Classic designs_

After agreeing scope and scale, the crux is fan-out. Pushing each post into every follower's precomputed feed (fan-out on write) makes reading a feed one lookup, which suits the usual pattern of far more reads than posts, but one celebrity post would mean millions of writes. So I'd push for ordinary accounts, using queue workers, and merge celebrities' recent posts in at read time from a cache. Feeds keep only a few hundred ids in memory, posts live in a partitioned store, and inactive users' feeds are rebuilt on demand rather than kept up to date.

Follow-ups: How would you rank the feed instead of sorting by time?

### Design a notification service.
_Classic designs_

Callers send a request with the user, a template, data and an idempotency key. The API checks the user's preferences and per-user limits, puts the message on a queue per channel (email, SMS, push) and replies straight away. Workers render the template and call the providers, with timeouts, retries with backoff and jitter, circuit breakers per provider, and a dead-letter queue after a few attempts. The idempotency key, recorded with each send, stops retries from sending twice. I'd monitor queue depth, delivery latency, provider error rates and the dead-letter queue.

## L3 Specialist (2026-10-09)

### How do you keep data consistent across microservices without distributed transactions?
_Transactions and events_

With sagas: the business transaction becomes a sequence of local transactions, each with a compensating action, coordinated by an orchestrator or by services reacting to each other's events. Each step commits its state change and the event it causes together through an outbox, and consumers are idempotent because delivery is at least once. Two-phase commit works inside one database cluster, but across services it blocks when the coordinator fails and couples their availability, so I keep it for cases where atomicity is non-negotiable and the participants are few and reliable.

Follow-ups: What does the saga do if a compensation fails? · Orchestration or choreography: which would you pick for orders, and why?

### What is the outbox pattern, and why not just publish to Kafka after committing?
_Transactions and events_

Publishing after the commit is a dual write: if the process dies between the two, the database has the change and the event is lost, or the reverse if you publish first. The outbox writes the event into a table in the same local transaction as the change; a relay, or change data capture reading the database's log, publishes the rows and marks them sent. Publishing can repeat after a crash, so consumers dedupe by event id, typically with an inbox table written in the same transaction as their own change.

Follow-ups: How would you keep the outbox table from growing forever? · What ordering guarantees does the relay give?

### When is event sourcing a good idea, and what does it cost?
_Transactions and events_

It fits domains where history matters: ledgers, orders, anything with audits or 'what did we know when'. Storing the events gives a full audit trail, lets you rebuild state, and lets new read models be built by replaying. The costs are real: reads need projections (CQRS), which are eventually consistent; events are a permanent API, so schema evolution needs upcasting or versioning; deleting personal data needs crypto-shredding or careful redaction; and long streams need snapshots.

Follow-ups: How do you handle a bug that wrote wrong events? · How do you rebuild a projection without downtime?

### Explain watermarks and exactly-once processing in a stream processor.
_Streams_

Events carry event time but arrive late and out of order, so the processor tracks a watermark, an estimate that no older events are still coming, usually the newest event time minus an allowed lateness. A window's result is emitted when the watermark passes its end; later events are dropped, sent aside or used to update results. Exactly-once comes from checkpointing every operator's state together with the input offsets, restoring them after a crash and replaying, with sinks that are idempotent upserts or transactions committed with each checkpoint.

Follow-ups: What happens to watermarks when one partition goes idle? · Why can't a stream processor make an email exactly-once?

### Walk me through how Raft elects a leader and commits an entry.
_Consensus_

Followers expect heartbeats; one whose randomized timeout runs out becomes a candidate for a new term, votes for itself and asks the others. Each server votes once per term, only for candidates whose log is at least as up to date as its own, so the winner holds every committed entry. The leader appends client commands to its log and replicates them with AppendEntries, which carry the previous entry's index and term so followers can detect gaps. Once an entry from the current term is on a majority, it's committed and applied everywhere in order.

Follow-ups: Why must a leader not commit an earlier term's entry by counting replicas? · What does PreVote fix?

### How would you implement a distributed lock safely?
_Consensus_

First I ask what the lock protects. If it only avoids duplicate work, a lease in Redis is fine, because an occasional double run is harmless. If correctness depends on it, I use a consensus-backed service such as etcd or ZooKeeper and fencing tokens: every grant comes with an increasing number, every write carries it, and the protected resource rejects tokens lower than the highest it has seen. That handles a holder that pauses past its lease, which no lease length or pre-write check can prevent.

Follow-ups: What if the protected resource can't check tokens? · How does etcd provide the token?

### Why can't we order events across machines by their timestamps, and what do we use instead?
_Consensus_

Clocks drift and NTP can step them backwards, so two machines' timestamps don't reliably say which event came first, and last-write-wins on them silently drops writes. For a total order we use a consensus log; for causality, Lamport clocks give an order consistent with cause and effect, and vector clocks also detect concurrent updates. Hybrid logical clocks combine a physical timestamp with a counter, so they stay close to wall time but respect causality; Spanner instead bounds clock uncertainty with TrueTime and waits it out.

Follow-ups: When would you choose vector clocks over hybrid clocks? · How does commit-wait work in Spanner?

### B-tree or LSM tree: how do you choose a storage engine for a workload?
_Storage_

I look at the read and write mix and the access patterns. B-trees update sorted pages in place, giving predictable point reads and excellent range scans, at the cost of random writes and page splits, so they suit read-heavy, update-heavy OLTP. LSM trees append to a log, flush sorted SSTables and compact them in the background, so writes are sequential and cheap; reads may check several files, helped by Bloom filters, and compaction costs I/O and causes latency spikes. Heavy ingestion of events, metrics or messages favours LSM. Then I benchmark with the real workload.

Follow-ups: What's write amplification, and how does compaction strategy change it? · Why do random UUID keys hurt B-tree inserts?

### How does a search engine answer a query quickly, and how does it rank results?
_Search and geo_

At indexing time each document is analyzed into terms and the engine keeps an inverted index: for each term, the sorted list of documents containing it. A query is analyzed the same way; the engine intersects or unions the posting lists, rarest term first and skipping through long lists, and scores only the matches, typically with BM25, which rewards rare terms, saturates repeated mentions and normalises by length. The index is sharded, each shard returns its top results to a coordinator, and production systems blend in other signals or rerank with a model.

Follow-ups: Why is a search index only near real time? · How would you add typo tolerance?

### Design 'restaurants near me' for 10 million restaurants.
_Search and geo_

Restaurants rarely move, so I index them by geohash, S2 or H3 cells and store cell to restaurant ids in a search engine or key-value store, sharded by region. A query picks a cell size at least as big as the radius, reads the cell and its neighbours, filters by exact distance and the must-match criteria, and ranks by text relevance, distance decay, rating and opening hours. Busy cells are cached, and where restaurants crowd together a quadtree, or a finer resolution, keeps cells small.

Follow-ups: What changes for moving objects such as drivers? · How do you handle the antimeridian and poles?

### Active-passive or active-active: how do you choose for a multi-region service?
_Multi-region_

I start from each system's RPO and RTO. Active-passive is simpler: one region writes, another holds replicas and standby capacity; failover means confirming the failure from a third location, fencing the old primary, promoting and moving traffic, which takes minutes, and asynchronous replication loses the lag. Active-active serves writes everywhere, with low latency and no promotion, but concurrent writes conflict, so I give each user or tenant a home region, use CRDTs where data can merge, or pay for a globally consistent database. Either way the survivors need headroom for a failed region's load.

Follow-ups: How much headroom do four regions need? · How do you test that failover works?

### How do you handle authentication and authorization across many services?
_Security_

Users sign in with an OpenID Connect provider and get short-lived access tokens; each service verifies the token's algorithm, signature, expiry, audience and issuer itself. Authorization happens in the service that owns the data, on every request, for the specific object, with roles, attributes or relationships, and denial by default. Service-to-service calls use mTLS with workload identities and least privilege, so nothing is trusted for being inside the network. Secrets come from a manager at run time, and decisions are logged.

Follow-ups: How do you revoke a JWT before it expires? · Where would you use relationship-based access control?

### How should data be encrypted at rest, and how do you rotate keys?
_Security_

With envelope encryption: data is encrypted with data keys, often one per tenant or object, and the data keys are encrypted by a master key that never leaves a KMS or HSM, which checks and logs every unwrap. Rotating the master key means re-wrapping the small data keys rather than re-encrypting the data, and rotating a data key re-encrypts only what it covers. Per-tenant keys also allow crypto-shredding: destroying the key makes every copy of that tenant's data unreadable, backups included.

Follow-ups: What does at-rest encryption not protect against? · How do you limit KMS calls on a hot path?

### Design a payment system. What matters most?
_Designs_

Correctness. Every request carries an idempotency key, so a retry after a timeout replays the first result instead of charging again; a payment is a state machine (created, authorized, captured, refunded) with sagas for refunds; money moves through an append-only double-entry ledger, so balances are derived and auditable; and daily reconciliation against the provider's and bank's records settles anything left unknown. Card data stays with a PCI-compliant provider behind tokens, the ledger replicates with zero RPO, and every external call has a timeout.

Follow-ups: What do you do with a payment whose outcome is unknown? · How do you make the idempotency check safe under concurrency?

### Design a video streaming platform.
_Designs_

Bandwidth dominates. Uploads go to object storage; a transcoding pipeline encodes a ladder of resolutions and bitrates, cut into segments of a few seconds with HLS or DASH manifests; CDNs serve the segments, with popular titles pushed to the edge ahead of demand; and the player's adaptive bitrate logic picks each segment's quality from throughput and buffer level. Metadata, search, recommendations and DRM are separate services, and playback telemetry feeds quality monitoring and encoding decisions.

Follow-ups: How would you handle a live event with millions of viewers? · How do you choose the encoding ladder?

### Design a collaborative document editor.
_Designs_

Every keystroke applies locally at once and goes to the server over a WebSocket. Concurrent edits are merged with operational transformation, where the server orders operations and each client transforms incoming ones against its own pending edits, or with a CRDT, where every character has a unique ordered id so edits merge in any order, even offline. Documents are stored as snapshots plus an operation log; presence and cursors are separate, lightweight streams; and permissions are checked per document on every operation.

Follow-ups: OT or CRDT for an offline-first app? · How do you keep the operation log from growing forever?

### Design a distributed key-value store like Dynamo.
_Designs_

Consistent hashing with virtual nodes places each key on N replicas and moves few keys when nodes join or leave. Writes and reads use tunable quorums, W + R > N for reading your own writes; sloppy quorums and hinted handoff keep writes available while a replica is down; vector clocks or last-writer-wins resolve conflicting versions; Merkle trees let replicas find and repair differences cheaply; and gossip spreads membership and failure suspicion. Each node stores data in an LSM engine.

Follow-ups: What does a sloppy quorum give up? · How would you add strongly consistent operations?
