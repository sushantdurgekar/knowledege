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
