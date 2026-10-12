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
