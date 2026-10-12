---
title: "Measure a request: a tiny HTTP server and the cost of new connections"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Measure a request: a tiny HTTP server and the cost of new connections

> System Design L1 · about 60 min · modules m01, m02

Run a real HTTP server on your own machine with only the standard library, call it 200 times with a new connection each time and 200 times over one kept-alive connection, and compare the medians. Then add 20 ms of pretend work to the server and watch it add straight to every request.

## Before you start
- Python 3.12+ and Node.js 22+
- Read module 1 (how a request travels)

## Steps
1. Start a server on port 0 (the system picks a free port) that answers GET with a small JSON body and a Content-Length header: `http.server` in Python, `node:http` in JavaScript.
2. Write a client that makes 200 requests, opening a new connection for each, and records each request's time in milliseconds.
3. Repeat over one connection kept alive for all 200 requests (Python's `http.client` reuses an open connection; in Node, use an `http.Agent` with `keepAlive: true`).
4. Print both medians. Then add a 20 ms delay to the handler and confirm the median rises by about 20 ms: the server's time adds to the network's.
5. Write two sentences: which round trips the kept-alive connection saves, and why the gap is small on one machine but large across an ocean (module 1's model).

## Prove it worked
- Every request returns 200 with the right JSON, in both modes.
- The kept-alive median is lower than the new-connection median, and you can name the round trips it saves.
- With 20 ms of server work, the median rises by about 20 ms.

## Break it (then fix it)
- In Python, set `wbufsize = 0` again and time the kept-alive requests: headers and body now leave in two packets, and Nagle's algorithm waiting for a delayed acknowledgement can add about 40 ms to each one.
- Remove the Content-Length header: with HTTP/1.1 the client can no longer tell where the body ends.
- Run the client against a server on another continent (any public HTTPS site) and compare the gap with module 1's model.

## Starter code
```python
import http.client, json, statistics, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"           # keep-alive needs HTTP/1.1 and a Content-Length
    wbufsize = -1                           # buffer the reply so headers and body leave together

    def do_GET(self):
        body = json.dumps({"path": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]

def median_ms(n, reuse):
    # TODO: make n GET requests, a new HTTPConnection each time unless reuse is true,
    # time each one with time.perf_counter() and return the median in milliseconds
    ...
```

```javascript
const http = require("node:http");

const server = http.createServer((req, res) => {
  const body = JSON.stringify({ path: req.url });
  res.writeHead(200, { "Content-Length": Buffer.byteLength(body) });
  res.end(body);
});

async function medianMs(port, n, reuse) {
  // TODO: an http.Agent({ keepAlive: reuse, maxSockets: 1 }), n GET requests with http.get,
  // each timed with performance.now(); return the median in milliseconds
}

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  // TODO: print medianMs(port, 200, false) and medianMs(port, 200, true), then server.close()
});
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import http.client, json, statistics, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"                   # keep-alive needs HTTP/1.1 and a Content-Length
    wbufsize = -1                                   # buffer the reply so headers and body leave together
    delay = 0.0                                     # seconds of pretend work per request

    def do_GET(self):
        time.sleep(self.delay)
        body = json.dumps({"path": self.path, "pizza": "margherita"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):                   # keep the console quiet
        pass

def start_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)   # port 0: the system picks a free port
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

def median_ms(port, n, reuse):
    times, conn = [], None
    for i in range(n):
        start = time.perf_counter()
        if conn is None or not reuse:
            conn = http.client.HTTPConnection("127.0.0.1", port)   # a new TCP connection
        conn.request("GET", f"/menu/{i}")
        resp = conn.getresponse()
        data = json.loads(resp.read())
        assert resp.status == 200 and data["path"] == f"/menu/{i}"
        if not reuse:
            conn.close()
        times.append((time.perf_counter() - start) * 1000)
    conn.close()
    return statistics.median(times)

server = start_server()
port = server.server_address[1]
cold = median_ms(port, 200, reuse=False)
warm = median_ms(port, 200, reuse=True)
Handler.delay = 0.02                                # add 20 ms of server work
slow = median_ms(port, 20, reuse=True)
server.shutdown()
print(f"new connection each time: {cold:.2f} ms | kept alive: {warm:.2f} ms | with 20 ms of work: {slow:.2f} ms", file=sys.stderr)
assert 0 < warm and 0 < cold and slow >= 20
print("latency lab OK")
```

Output:
```text
latency lab OK
```

```javascript
const http = require("node:http");

let delayMs = 0;                                    // pretend work per request

function startServer() {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      const body = JSON.stringify({ path: req.url, pizza: "margherita" });
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
      res.end(body);
    }, delayMs);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));   // port 0: the system picks a free port
}

function get(port, path, agent) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, agent }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve([res.statusCode, JSON.parse(data)]));
    }).on("error", reject);
  });
}

async function medianMs(port, n, reuse) {
  const agent = new http.Agent({ keepAlive: reuse, maxSockets: 1 });   // keepAlive false: a new connection per request
  const times = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    const [status, body] = await get(port, `/menu/${i}`, agent);
    if (status !== 200 || body.path !== `/menu/${i}`) throw new Error("bad response");
    times.push(performance.now() - start);
  }
  agent.destroy();
  times.sort((a, b) => a - b);
  return times[Math.floor(n / 2)];
}

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const cold = await medianMs(port, 200, false);
  const warm = await medianMs(port, 200, true);
  delayMs = 20;                                     // add 20 ms of server work
  const slow = await medianMs(port, 20, true);
  server.close();
  console.error(`new connection each time: ${cold.toFixed(2)} ms | kept alive: ${warm.toFixed(2)} ms | with 20 ms of work: ${slow.toFixed(2)} ms`);
  if (!(cold > 0 && warm > 0 && slow >= 20)) throw new Error("timings");
  console.log("latency lab OK");
})();
```

Output:
```text
latency lab OK
```

</details>
