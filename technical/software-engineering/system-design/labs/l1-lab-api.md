---
title: "An orders API over real HTTP: idempotent creates and cursor pages"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: An orders API over real HTTP: idempotent creates and cursor pages

> System Design L1 · about 90 min · modules m07, m08

Build POST /orders and GET /orders as a real HTTP server with only the standard library. A retried create with the same Idempotency-Key must not create a second order, bad input must get a 400, and the list must page with an opaque cursor. Then test it over HTTP from a client in the same language.

## Before you start
- Python 3.12+ and Node.js 22+ (for the built-in fetch)
- Read module 8

## Steps
1. Write `create_order(key, body)`: replay the stored response for a known key, answer 400 without a pizza, otherwise create the order (201) and store the response under the key.
2. Write `list_orders(limit, cursor)`: orders after the cursor's id, fetching limit + 1 to know whether to return a next cursor (base64url JSON).
3. Serve both with `http.server` / `node:http`, sending JSON with the right status codes and a Content-Length.
4. From a client, create an order, retry it with the same key, create six more, send a bad request, then walk all pages with limit=3.
5. Check that the retry returned the same order, the bad request got 400, and the pages held every id once, in order.

## Prove it worked
- A retried POST with the same key returns the same order and creates nothing new.
- A POST without a pizza gets 400, and an unknown path gets 404.
- Walking the pages with limit=3 returns ids 1 to 7, each once, in three pages.

## Break it (then fix it)
- Drop the lock in Python and fire 50 concurrent creates with one key from threads: count how many orders appear.
- Switch the list to offset paging, add an order between page requests, and catch a repeat.
- Send a retry with the same key but a different pizza: what should the API say? (Module 8's discussion suggests 422.)

## Starter code
```python
import base64, json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

orders, seen = [], {}
lock = threading.Lock()                     # the threading server runs requests in parallel

def create_order(key, body):
    ...                                     # TODO: replay for a known key, 400 without a pizza, else 201

def list_orders(limit, cursor):
    ...                                     # TODO: orders after the cursor; limit + 1 to know if there's more

class Handler(BaseHTTPRequestHandler):
    ...                                     # TODO: do_POST and do_GET sending JSON with a Content-Length
```

```javascript
const http = require("node:http");

const orders = [], seen = new Map();

function createOrder(key, body) { /* TODO: replay for a known key, 400 without a pizza, else 201 */ }
function listOrders(limit, cursor) { /* TODO: orders after the cursor; limit + 1 to know if there's more */ }

const server = http.createServer((req, res) => {
  // TODO: route POST /orders and GET /orders, send JSON with a Content-Length
});
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import base64, json, threading, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

orders, seen = [], {}                               # orders in creation order; seen: idempotency key -> response
lock = threading.Lock()                             # the threading server runs requests in parallel

def encode_cursor(order_id):
    return base64.urlsafe_b64encode(json.dumps({"after": order_id}).encode()).decode().rstrip("=")

def decode_cursor(cursor):
    return json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))["after"]

def create_order(key, body):
    with lock:
        if key and key in seen:
            return seen[key]                        # a retry: replay the first response
        if not isinstance(body, dict) or not body.get("pizza"):
            return 400, {"error": "pizza is required"}
        order = {"id": len(orders) + 1, "pizza": body["pizza"]}
        orders.append(order)
        response = (201, order)
        if key:
            seen[key] = response
        return response

def list_orders(limit, cursor):
    after = decode_cursor(cursor) if cursor else 0
    rows = [o for o in orders if o["id"] > after][:limit + 1]   # one extra row says whether there's more
    page = rows[:limit]
    return 200, {"orders": page, "next": encode_cursor(page[-1]["id"]) if len(rows) > limit else None}

class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/orders":
            return self.send_json(404, {"error": "not found"})
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "invalid JSON"})
        self.send_json(*create_order(self.headers.get("Idempotency-Key"), body))

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != "/orders":
            return self.send_json(404, {"error": "not found"})
        query = parse_qs(url.query)
        limit = max(1, min(int(query.get("limit", ["20"])[0]), 100))
        self.send_json(*list_orders(limit, query.get("cursor", [None])[0]))

    def log_message(self, *args):
        pass

def call(port, method, path, body=None, key=None):
    headers = {"Content-Type": "application/json", **({"Idempotency-Key": key} if key else {})}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:             # urllib raises for 4xx and 5xx answers
        return e.code, json.loads(e.read())

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
try:
    first = call(port, "POST", "/orders", {"pizza": "margherita"}, key="k-1")
    retry = call(port, "POST", "/orders", {"pizza": "margherita"}, key="k-1")
    assert first == retry == (201, {"id": 1, "pizza": "margherita"})          # the retry made no second order
    for i in range(2, 8):
        assert call(port, "POST", "/orders", {"pizza": f"pizza {i}"}, key=f"k-{i}")[0] == 201
    assert call(port, "POST", "/orders", {}, key="k-bad")[0] == 400
    ids, cursor, pages = [], None, 0
    while True:
        status, page = call(port, "GET", "/orders?limit=3" + (f"&cursor={cursor}" if cursor else ""))
        assert status == 200
        ids += [o["id"] for o in page["orders"]]
        cursor, pages = page["next"], pages + 1
        if cursor is None:
            break
    assert ids == list(range(1, 8)) and call(port, "GET", "/nothing")[0] == 404
    print(f"orders created: {len(orders)} | ids walked through {pages} pages:", *ids)
finally:
    server.shutdown()
print("api lab OK")
```

Output:
```text
orders created: 7 | ids walked through 3 pages: 1 2 3 4 5 6 7
api lab OK
```

```javascript
const http = require("node:http");

const orders = [], seen = new Map();                // orders in creation order; seen: idempotency key -> response
                                                    // Node runs one handler at a time, so no lock is needed
const encodeCursor = id => Buffer.from(JSON.stringify({ after: id })).toString("base64url");
const decodeCursor = cursor => JSON.parse(Buffer.from(cursor, "base64url").toString()).after;

function createOrder(key, body) {
  if (key && seen.has(key)) return seen.get(key);   // a retry: replay the first response
  if (!body || typeof body !== "object" || !body.pizza) return [400, { error: "pizza is required" }];
  const order = { id: orders.length + 1, pizza: body.pizza };
  orders.push(order);
  const response = [201, order];
  if (key) seen.set(key, response);
  return response;
}

function listOrders(limit, cursor) {
  const after = cursor ? decodeCursor(cursor) : 0;
  const rows = orders.filter(o => o.id > after).slice(0, limit + 1);   // one extra row says whether there's more
  const page = rows.slice(0, limit);
  return [200, { orders: page, next: rows.length > limit ? encodeCursor(page.at(-1).id) : null }];
}

const server = http.createServer((req, res) => {
  const send = (status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  };
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/orders") return send(404, { error: "not found" });
  if (req.method === "GET") {
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20), 100));
    return send(...listOrders(limit, url.searchParams.get("cursor")));
  }
  if (req.method !== "POST") return send(405, { error: "method not allowed" });
  let raw = "";
  req.on("data", chunk => (raw += chunk));
  req.on("end", () => {
    let body;
    try { body = JSON.parse(raw || "{}"); } catch { return send(400, { error: "invalid JSON" }); }
    send(...createOrder(req.headers["idempotency-key"], body));
  });
});

async function call(port, method, path, body = null, key = null) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
  return [res.status, await res.json()];
}

server.listen(0, "127.0.0.1", async () => {        // port 0: the system picks a free port
  const port = server.address().port;
  try {
    const first = await call(port, "POST", "/orders", { pizza: "margherita" }, "k-1");
    const retry = await call(port, "POST", "/orders", { pizza: "margherita" }, "k-1");
    if (JSON.stringify(first) !== JSON.stringify(retry) || first[0] !== 201 || first[1].id !== 1) throw new Error("idempotency");
    for (let i = 2; i < 8; i++) {
      if ((await call(port, "POST", "/orders", { pizza: `pizza ${i}` }, `k-${i}`))[0] !== 201) throw new Error("create");
    }
    if ((await call(port, "POST", "/orders", {}, "k-bad"))[0] !== 400) throw new Error("validation");
    const ids = [];
    let cursor = null, pages = 0;
    do {
      const [status, page] = await call(port, "GET", "/orders?limit=3" + (cursor ? `&cursor=${cursor}` : ""));
      if (status !== 200) throw new Error("list");
      ids.push(...page.orders.map(o => o.id));
      cursor = page.next;
      pages++;
    } while (cursor !== null);
    if (ids.join() !== "1,2,3,4,5,6,7" || (await call(port, "GET", "/nothing"))[0] !== 404) throw new Error("pages");
    console.log(`orders created: ${orders.length} | ids walked through ${pages} pages:`, ...ids);
    console.log("api lab OK");
  } finally {
    server.close();
  }
});
```

Output:
```text
orders created: 7 | ids walked through 3 pages: 1 2 3 4 5 6 7
api lab OK
```

</details>
