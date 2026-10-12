---
title: "One rate limit across three API servers"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: One rate limit across three API servers

> System Design L2 · about 75 min · modules m06

Run a tiny store service, standing in for Redis, and three API servers over real HTTP. Each API server checks a per-client token bucket in the store. Show that an atomic take holds the limit exactly under concurrent load, and that reading the count and writing it back lets far too many requests through.

## Before you start
- Python 3.12+ and Node.js 22+ (for the built-in fetch)
- Read module 6

## Steps
1. Write the store: POST /take refills, checks and spends a token in one locked step (in Node, one synchronous function); POST /get and POST /set read and write a value.
2. Write an API server with GET /hello (one call to /take) and GET /hello-racy (GET the count, wait 20 ms, SET it minus one), answering 200, or 429 with a Retry-After header.
3. Start the store and three API servers on free ports, then fire 30 concurrent requests for one client key, spread over the three servers.
4. With a capacity of 10 and almost no refill during the test, count the 200s and 429s for each endpoint.
5. Write down why the racy version lets too much through, and what Redis offers instead: a Lua script, or INCR with EXPIRE for a fixed window.

## Prove it worked
- The atomic endpoint allows exactly 10 of 30 requests and rejects 20 with 429 and Retry-After.
- The racy endpoint lets more than 10 through, because the servers read the same count before any of them writes.
- You can say what your API does when the store is down, and why.

## Break it (then fix it)
- Remove the lock from the Python store and call /take from 100 threads at once: does the limit still hold?
- Give each API server its own in-memory bucket of 10, and count what one client gets across the three.
- Stop the store halfway through and decide: fail open (allow everything) or fail closed (reject everything)?

## Starter code
```python
import json, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CAPACITY, PER_SEC = 10, 0.01

class Store:
    def __init__(self):
        self.data, self.lock = {}, threading.Lock()

    def take(self, key, capacity, per_sec, now):
        ...                                         # TODO: refill, check and spend under the lock

class StoreHandler(BaseHTTPRequestHandler):
    def do_POST(self): ...                          # TODO: /take, /get and /set with JSON bodies

def make_api(store_port):
    class ApiHandler(BaseHTTPRequestHandler):
        def do_GET(self): ...                       # TODO: /hello (atomic) and /hello-racy (GET, sleep, SET)
    return ApiHandler

# TODO: start the store and three API servers on port 0, fire 30 requests at each endpoint, count the answers
```

```javascript
const http = require("node:http");

const CAPACITY = 10, PER_SEC = 0.01;
const data = new Map();

function take(key, capacity, perSec, now) { /* TODO: refill, check and spend in one synchronous step */ }

const storeServer = http.createServer(async (req, res) => { /* TODO: /take, /get and /set with JSON bodies */ });
function makeApi(storePort) {
  return http.createServer(async (req, res) => { /* TODO: /hello (atomic) and /hello-racy (GET, sleep, SET) */ });
}

// TODO: listen on port 0, fire 30 requests at each endpoint with Promise.all, count the answers, then process.exit(0)
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""One rate limit shared by three API servers: a tiny store service (standing in for Redis) and three API servers."""
import json, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CAPACITY, PER_SEC = 10, 0.01                        # 10 requests, then one more every 100 seconds

class Store:
    """The Redis stand-in: plain GET and SET, plus an atomic token-bucket take (what a Lua script does in Redis)."""
    def __init__(self):
        self.data, self.lock = {}, threading.Lock()

    def take(self, key, capacity, per_sec, now):
        with self.lock:                             # refill, check and spend as one step: nobody runs in between
            tokens, last = self.data.get(key, (capacity, now))
            tokens = min(capacity, tokens + (now - last) * per_sec)
            if tokens >= 1:
                self.data[key] = (tokens - 1, now)
                return True, 0
            self.data[key] = (tokens, now)
            return False, int((1 - tokens) / per_sec) + 1   # whole seconds until the next token

store = Store()

def send_json(handler, status, payload, headers=()):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    for name, value in headers:
        handler.send_header(name, value)
    handler.end_headers()
    handler.wfile.write(body)

class StoreHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):                   # keep the output quiet
        pass

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/take":
            ok, retry_after = store.take(req["key"], req["capacity"], req["per_sec"], time.monotonic())
            send_json(self, 200, {"ok": ok, "retry_after": retry_after})
        elif self.path == "/get":
            with store.lock:
                value = store.data.get(req["key"], req["default"])
            send_json(self, 200, {"value": value})
        elif self.path == "/set":
            with store.lock:
                store.data[req["key"]] = req["value"]
            send_json(self, 200, {})
        else:
            send_json(self, 404, {})

def call_store(port, path, payload):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(payload).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())

def make_api(store_port):
    class ApiHandler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            client = self.headers.get("X-Api-Key", "anonymous")
            if self.path == "/hello":               # the safe way: one atomic call to the store
                answer = call_store(store_port, "/take", {"key": client, "capacity": CAPACITY, "per_sec": PER_SEC})
                ok, retry_after = answer["ok"], answer["retry_after"]
            elif self.path == "/hello-racy":        # the unsafe way: read, think, then write back
                tokens = call_store(store_port, "/get", {"key": client, "default": CAPACITY})["value"]
                time.sleep(0.02)                    # other servers read the same count meanwhile
                ok, retry_after = tokens >= 1, 100
                if ok:
                    call_store(store_port, "/set", {"key": client, "value": tokens - 1})
            else:
                return send_json(self, 404, {})
            if ok:
                send_json(self, 200, {"hello": client})
            else:
                send_json(self, 429, {"error": "rate limited"}, [("Retry-After", str(retry_after))])
    return ApiHandler

def start(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

store_server = start(StoreHandler)
store_port = store_server.server_address[1]
apis = [start(make_api(store_port)) for _ in range(3)]

def hit(i, path, key):
    port = apis[i % 3].server_address[1]            # spread the client's requests over the three servers
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers={"X-Api-Key": key})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, None
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get("Retry-After")

with ThreadPoolExecutor(max_workers=30) as pool:
    atomic = list(pool.map(lambda i: hit(i, "/hello", "tara"), range(30)))
    racy = list(pool.map(lambda i: hit(i, "/hello-racy", "ben"), range(30)))

allowed = sum(1 for status, _ in atomic if status == 200)
rejected = [retry for status, retry in atomic if status == 429]
racy_allowed = sum(1 for status, _ in racy if status == 200)
print(f"atomic take: {allowed} of 30 allowed, {len(rejected)} got 429 with a Retry-After header")
print(f"GET, then SET: {'more than 10' if racy_allowed > 10 else 'only ' + str(racy_allowed)} of 30 allowed")
print(f"(racy run: {racy_allowed} allowed)", file=sys.stderr)
assert allowed == 10 and len(rejected) == 20 and all(r is not None and int(r) > 0 for r in rejected)
assert racy_allowed > 10
for server in apis + [store_server]:
    server.shutdown()
print("limiter lab OK")
```

Output:
```text
atomic take: 10 of 30 allowed, 20 got 429 with a Retry-After header
GET, then SET: more than 10 of 30 allowed
limiter lab OK
```

```javascript
// One rate limit shared by three API servers: a tiny store service (standing in for Redis) and three API servers.
const http = require("node:http");

const CAPACITY = 10, PER_SEC = 0.01;                // 10 requests, then one more every 100 seconds

const data = new Map();                             // the store's contents
function take(key, capacity, perSec, now) {
  // refill, check and spend in one synchronous step: Node runs nothing else in between (what a Lua script does in Redis)
  let [tokens, last] = data.get(key) ?? [capacity, now];
  tokens = Math.min(capacity, tokens + (now - last) * perSec);
  if (tokens >= 1) { data.set(key, [tokens - 1, now]); return [true, 0]; }
  data.set(key, [tokens, now]);
  return [false, Math.floor((1 - tokens) / perSec) + 1];   // whole seconds until the next token
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function readJson(req) {
  return new Promise(resolve => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

const storeServer = http.createServer(async (req, res) => {
  const body = await readJson(req);
  if (req.url === "/take") {
    const [ok, retryAfter] = take(body.key, body.capacity, body.per_sec, performance.now() / 1000);
    sendJson(res, 200, { ok, retry_after: retryAfter });
  } else if (req.url === "/get") {
    sendJson(res, 200, { value: data.has(body.key) ? data.get(body.key) : body.default });
  } else if (req.url === "/set") {
    data.set(body.key, body.value);
    sendJson(res, 200, {});
  } else sendJson(res, 404, {});
});

async function callStore(port, path, payload) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", body: JSON.stringify(payload) });
  return res.json();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeApi(storePort) {
  return http.createServer(async (req, res) => {
    const client = req.headers["x-api-key"] ?? "anonymous";
    let ok, retryAfter;
    if (req.url === "/hello") {                     // the safe way: one atomic call to the store
      const answer = await callStore(storePort, "/take", { key: client, capacity: CAPACITY, per_sec: PER_SEC });
      ok = answer.ok; retryAfter = answer.retry_after;
    } else if (req.url === "/hello-racy") {         // the unsafe way: read, think, then write back
      const tokens = (await callStore(storePort, "/get", { key: client, default: CAPACITY })).value;
      await sleep(20);                              // other servers read the same count meanwhile
      ok = tokens >= 1; retryAfter = 100;
      if (ok) await callStore(storePort, "/set", { key: client, value: tokens - 1 });
    } else return sendJson(res, 404, {});
    if (ok) sendJson(res, 200, { hello: client });
    else sendJson(res, 429, { error: "rate limited" }, { "Retry-After": String(retryAfter) });
  });
}

const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

(async () => {
  const storePort = await listen(storeServer);
  const apis = [makeApi(storePort), makeApi(storePort), makeApi(storePort)];
  const ports = await Promise.all(apis.map(listen));
  const hit = async (i, path, key) => {             // spread the client's requests over the three servers
    const res = await fetch(`http://127.0.0.1:${ports[i % 3]}${path}`, { headers: { "X-Api-Key": key } });
    await res.text();
    return [res.status, res.headers.get("retry-after")];
  };
  const atomic = await Promise.all(Array.from({ length: 30 }, (_, i) => hit(i, "/hello", "tara")));
  const racy = await Promise.all(Array.from({ length: 30 }, (_, i) => hit(i, "/hello-racy", "ben")));

  const allowed = atomic.filter(([status]) => status === 200).length;
  const rejected = atomic.filter(([status]) => status === 429).map(([, retry]) => retry);
  const racyAllowed = racy.filter(([status]) => status === 200).length;
  console.log(`atomic take: ${allowed} of 30 allowed, ${rejected.length} got 429 with a Retry-After header`);
  console.log(`GET, then SET: ${racyAllowed > 10 ? "more than 10" : "only " + racyAllowed} of 30 allowed`);
  console.error(`(racy run: ${racyAllowed} allowed)`);
  if (allowed !== 10 || rejected.length !== 20 || !rejected.every(r => r !== null && Number(r) > 0)) throw new Error("atomic limit");
  if (racyAllowed <= 10) throw new Error("the racy version should over-admit");
  console.log("limiter lab OK");
  process.exit(0);                                  // close the servers and any kept-alive connections
})();
```

Output:
```text
atomic take: 10 of 30 allowed, 20 got 429 with a Retry-After header
GET, then SET: more than 10 of 30 allowed
limiter lab OK
```

</details>
