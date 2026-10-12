---
title: "Trace a request through two services, and measure an SLO"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Trace a request through two services, and measure an SLO

> System Design L2 · about 75 min · modules m07, m09

Run a front service that calls an inventory service over HTTP, passing a W3C traceparent header. Record a span and a structured JSON log line for every request in both services, serve a Prometheus-style latency histogram on /metrics, then compute the SLI from the buckets and check that every trace joins up.

## Before you start
- Python 3.12+ and Node.js 22+
- Read modules 7 and 9

## Steps
1. Write parse_traceparent(header): split 00-<trace id>-<span id>-01 into its parts, or start a new trace when there's no header.
2. In each service, create a span id, send 00-<trace id>-<your span id>-01 on the next call, and on the way out record the span (trace, span, parent, name, ms) and a JSON log line with the trace id.
3. Make every tenth inventory lookup take 300 ms (a cache miss) and the rest 5 ms. Count the front's latencies in buckets of 50, 100, 250, 500 and 1,000 ms plus +Inf, and serve them in the Prometheus text format on /metrics.
4. Send 50 requests, then read /metrics and compute the share within 250 ms from the cumulative buckets.
5. Check that there are 50 traces, each with two spans where the inventory span's parent is the front span, and that every log line carries a trace id.

## Prove it worked
- 45 of 50 requests finish within 250 ms: 90.0%, which misses a 99% SLO, and the histogram alone shows it.
- Every trace has exactly two spans, joined by the parent span id.
- All 100 log lines carry the trace id, so you can jump from a slow span to its logs.

## Break it (then fix it)
- Stop passing the traceparent header: there are now 100 one-span traces, and you can't tell which inventory call belonged to which purchase.
- Add the request number as a metric label, and count the time series you've just created.
- Move the 250 ms bucket edge to 300 ms and see how the SLI changes.

## Starter code
```python
import json, os, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SPANS, LOGS, LOCK = [], [], threading.Lock()
BUCKETS = [50, 100, 250, 500, 1000]                 # +Inf is implied

def parse_traceparent(header):
    ...                                             # TODO: (trace id, parent span id), or a new trace id and None

class Inventory(BaseHTTPRequestHandler):
    def do_GET(self): ...                           # TODO: sleep 300 ms for every tenth n, else 5 ms; record a span and a log

def make_front(inventory_port):
    class Front(BaseHTTPRequestHandler):
        def do_GET(self): ...                       # TODO: /metrics, or /buy: call inventory with a traceparent, observe the latency
    return Front
```

```javascript
const http = require("node:http");
const { randomBytes } = require("node:crypto");

const SPANS = [], LOGS = [];
const BUCKETS = [50, 100, 250, 500, 1000];          // +Inf is implied

function parseTraceparent(header) { /* TODO: [trace id, parent span id], or a new trace id and null */ }

const inventory = http.createServer(async (req, res) => { /* TODO: slow every tenth n; record a span and a log */ });
function makeFront(inventoryPort) {
  return http.createServer(async (req, res) => { /* TODO: /metrics, or /buy with a traceparent */ });
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""Two services, one trace: traceparent propagation, spans, structured logs and a Prometheus-style latency histogram."""
import json, os, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SPANS, LOGS, LOCK = [], [], threading.Lock()        # what a real system would send to a collector
BUCKETS = [50, 100, 250, 500, 1000]                 # histogram upper bounds in ms; +Inf is implied
counts, total = [0] * (len(BUCKETS) + 1), {"count": 0, "sum_ms": 0.0}

def new_id(nbytes):
    return os.urandom(nbytes).hex()

def parse_traceparent(header):
    """'00-<32 hex trace id>-<16 hex parent span id>-01' -> (trace id, parent span id), or a fresh trace."""
    if header:
        version, trace_id, parent_id, flags = header.split("-")
        return trace_id, parent_id
    return new_id(16), None

def record(service, name, trace_id, span_id, parent_id, start, status):
    ms = (time.perf_counter() - start) * 1000
    with LOCK:
        SPANS.append({"trace_id": trace_id, "span_id": span_id, "parent_id": parent_id, "name": name, "ms": ms})
        LOGS.append(json.dumps({"level": "info", "service": service, "msg": name, "status": status,
                                "trace_id": trace_id, "span_id": span_id, "ms": round(ms, 1)}))
    return ms

class Inventory(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        start = time.perf_counter()
        trace_id, parent_id = parse_traceparent(self.headers.get("traceparent"))
        span_id = new_id(8)
        n = int(self.path.split("=")[1])
        time.sleep(0.3 if n % 10 == 0 else 0.005)   # every tenth lookup misses a cache and is slow
        body = b'{"in_stock": true}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        record("inventory", "GET /stock", trace_id, span_id, parent_id, start, 200)

def make_front(inventory_port):
    class Front(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path == "/metrics":             # the Prometheus text format, read by a scraper
                lines, cumulative = ["# TYPE http_request_duration_ms histogram"], 0
                with LOCK:
                    for bound, c in zip(BUCKETS + ["+Inf"], counts):
                        cumulative += c
                        lines.append(f'http_request_duration_ms_bucket{{le="{bound}"}} {cumulative}')
                    lines += [f"http_request_duration_ms_sum {total['sum_ms']:.1f}",
                              f"http_request_duration_ms_count {total['count']}"]
                body = ("\n".join(lines) + "\n").encode()
            else:
                start = time.perf_counter()
                trace_id, parent_id = parse_traceparent(self.headers.get("traceparent"))
                span_id = new_id(8)
                n = self.path.split("=")[1]
                req = urllib.request.Request(f"http://127.0.0.1:{inventory_port}/stock?n={n}",
                                             headers={"traceparent": f"00-{trace_id}-{span_id}-01"})   # pass the context on
                with urllib.request.urlopen(req) as res:
                    res.read()
                body = b'{"ordered": true}'
                ms = record("front", "GET /buy", trace_id, span_id, parent_id, start, 200)
                with LOCK:                          # observe the latency in the histogram
                    counts[next((i for i, b in enumerate(BUCKETS) if ms <= b), len(BUCKETS))] += 1
                    total["count"] += 1
                    total["sum_ms"] += ms
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    return Front

def start(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

inventory = start(Inventory)
front = start(make_front(inventory.server_address[1]))
front_url = f"http://127.0.0.1:{front.server_address[1]}"
for n in range(1, 51):
    urllib.request.urlopen(f"{front_url}/buy?n={n}").read()

metrics = urllib.request.urlopen(f"{front_url}/metrics").read().decode()
buckets = {line.split('"')[1]: int(line.split()[-1]) for line in metrics.splitlines() if line.startswith("http_request_duration_ms_bucket")}
good, count = buckets["250"], buckets["+Inf"]        # the SLI straight from the cumulative buckets
traces = {}
for span in SPANS:
    traces.setdefault(span["trace_id"], []).append(span)
linked = all(len(spans) == 2 and {s["parent_id"] for s in spans} == {None, next(s["span_id"] for s in spans if s["name"] == "GET /buy")}
             for spans in traces.values())
with_trace = sum(1 for line in LOGS if json.loads(line).get("trace_id"))
tenths = good * 1000 // count
print(f"requests: {count} | traces: {len(traces)}, each with 2 spans, the child linked to its parent: {'yes' if linked else 'no'}")
print(f"SLI from the histogram: {good} of {count} within 250 ms ({tenths // 10}.{tenths % 10}%), so a 99% SLO is "
      f"{'met' if tenths >= 990 else 'missed'}")
print(f"log lines carrying a trace id: {with_trace} of {len(LOGS)}")
assert count == 50 and good == 45 and len(traces) == 50 and linked and with_trace == len(LOGS) == 100
front.shutdown()
inventory.shutdown()
print("observability lab OK")
```

Output:
```text
requests: 50 | traces: 50, each with 2 spans, the child linked to its parent: yes
SLI from the histogram: 45 of 50 within 250 ms (90.0%), so a 99% SLO is missed
log lines carrying a trace id: 100 of 100
observability lab OK
```

```javascript
// Two services, one trace: traceparent propagation, spans, structured logs and a Prometheus-style latency histogram.
const http = require("node:http");
const { randomBytes } = require("node:crypto");

const SPANS = [], LOGS = [];                        // what a real system would send to a collector
const BUCKETS = [50, 100, 250, 500, 1000];          // histogram upper bounds in ms; +Inf is implied
const counts = new Array(BUCKETS.length + 1).fill(0);
const total = { count: 0, sumMs: 0 };

const newId = nbytes => randomBytes(nbytes).toString("hex");

function parseTraceparent(header) {
  // '00-<32 hex trace id>-<16 hex parent span id>-01' -> [trace id, parent span id], or a fresh trace
  if (header) {
    const [, traceId, parentId] = header.split("-");
    return [traceId, parentId];
  }
  return [newId(16), null];
}

function record(service, name, traceId, spanId, parentId, start, status) {
  const ms = performance.now() - start;
  SPANS.push({ trace_id: traceId, span_id: spanId, parent_id: parentId, name, ms });
  LOGS.push(JSON.stringify({ level: "info", service, msg: name, status, trace_id: traceId, span_id: spanId, ms: Math.round(ms * 10) / 10 }));
  return ms;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const inventory = http.createServer(async (req, res) => {
  const start = performance.now();
  const [traceId, parentId] = parseTraceparent(req.headers.traceparent);
  const spanId = newId(8);
  const n = Number(req.url.split("=")[1]);
  await sleep(n % 10 === 0 ? 300 : 5);              // every tenth lookup misses a cache and is slow
  const body = '{"in_stock":true}';
  res.writeHead(200, { "Content-Length": Buffer.byteLength(body) });
  res.end(body);
  record("inventory", "GET /stock", traceId, spanId, parentId, start, 200);
});

function makeFront(inventoryPort) {
  return http.createServer(async (req, res) => {
    let body;
    if (req.url === "/metrics") {                   // the Prometheus text format, read by a scraper
      const lines = ["# TYPE http_request_duration_ms histogram"];
      let cumulative = 0;
      [...BUCKETS, "+Inf"].forEach((bound, i) => {
        cumulative += counts[i];
        lines.push(`http_request_duration_ms_bucket{le="${bound}"} ${cumulative}`);
      });
      lines.push(`http_request_duration_ms_sum ${total.sumMs.toFixed(1)}`, `http_request_duration_ms_count ${total.count}`);
      body = lines.join("\n") + "\n";
    } else {
      const start = performance.now();
      const [traceId, parentId] = parseTraceparent(req.headers.traceparent);
      const spanId = newId(8);
      const n = req.url.split("=")[1];
      const inv = await fetch(`http://127.0.0.1:${inventoryPort}/stock?n=${n}`,
                              { headers: { traceparent: `00-${traceId}-${spanId}-01` } });   // pass the context on
      await inv.text();
      body = '{"ordered":true}';
      const ms = record("front", "GET /buy", traceId, spanId, parentId, start, 200);
      const i = BUCKETS.findIndex(b => ms <= b);    // observe the latency in the histogram
      counts[i === -1 ? BUCKETS.length : i]++;
      total.count++; total.sumMs += ms;
    }
    res.writeHead(200, { "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  });
}

const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

(async () => {
  const inventoryPort = await listen(inventory);
  const frontUrl = `http://127.0.0.1:${await listen(makeFront(inventoryPort))}`;
  for (let n = 1; n <= 50; n++) await (await fetch(`${frontUrl}/buy?n=${n}`)).text();

  const metrics = await (await fetch(`${frontUrl}/metrics`)).text();
  const buckets = Object.fromEntries(metrics.split("\n").filter(l => l.startsWith("http_request_duration_ms_bucket"))
    .map(l => [l.split('"')[1], Number(l.split(" ").at(-1))]));
  const good = buckets["250"], count = buckets["+Inf"];   // the SLI straight from the cumulative buckets
  const traces = new Map();
  for (const span of SPANS) {
    if (!traces.has(span.trace_id)) traces.set(span.trace_id, []);
    traces.get(span.trace_id).push(span);
  }
  const linked = [...traces.values()].every(spans => {
    const root = spans.find(s => s.name === "GET /buy");
    const parents = new Set(spans.map(s => s.parent_id));
    return spans.length === 2 && root && parents.size === 2 && parents.has(null) && parents.has(root.span_id);
  });
  const withTrace = LOGS.filter(line => JSON.parse(line).trace_id).length;
  const tenths = Math.floor(good * 1000 / count);
  console.log(`requests: ${count} | traces: ${traces.size}, each with 2 spans, the child linked to its parent: ${linked ? "yes" : "no"}`);
  console.log(`SLI from the histogram: ${good} of ${count} within 250 ms (${Math.floor(tenths / 10)}.${tenths % 10}%), so a 99% SLO is ` +
              `${tenths >= 990 ? "met" : "missed"}`);
  console.log(`log lines carrying a trace id: ${withTrace} of ${LOGS.length}`);
  if (count !== 50 || good !== 45 || traces.size !== 50 || !linked || withTrace !== 100 || LOGS.length !== 100) throw new Error("observability checks");
  console.log("observability lab OK");
  process.exit(0);
})();
```

Output:
```text
requests: 50 | traces: 50, each with 2 spans, the child linked to its parent: yes
SLI from the histogram: 45 of 50 within 250 ms (90.0%), so a 99% SLO is missed
log lines carrying a trace id: 100 of 100
observability lab OK
```

</details>
