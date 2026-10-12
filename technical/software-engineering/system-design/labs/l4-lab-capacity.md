---
title: "Measure a queue, check the model, then size and price the fleet"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l4, lab]
status: new
created: 2026-10-12
updated: 2026-10-12
---
# Lab: Measure a queue, check the model, then size and price the fleet

> System Design L4 · about 90 min · modules m03

Build a small queueing simulator with random arrivals and service times, check it against Erlang's C formula, then use it the way a capacity planner would: find the smallest fleet whose p99 latency meets the target at next year's peak, add the servers needed to survive losing a zone, turn a forecast week into hourly server counts, and choose the commitment level that minimises the bill.

## Before you start
- Python 3.12+ and Node.js 22.13+, standard libraries only
- Read module 3

## Steps
1. Generate exponential random numbers without logarithms, using von Neumann's method (it needs only comparisons), so Python and JavaScript produce identical streams; check the mean is close to 1.
2. Simulate c servers sharing one first-come, first-served queue: each arrival goes to the server that frees up first. Record the waits and the response times.
3. Compare the simulated mean wait at 12 servers and 450 requests a second with Erlang C, and note the p99.
4. Increase the fleet from just above full utilisation until the p99 response at 900 requests a second is within 100 ms, then make it zone-safe for three zones.
5. Size each hour of a forecast week at the utilisation that met the target, and find the commitment level with the lowest weekly cost.

## Prove it worked
- The simulated mean wait is within about 1.5 ms of Erlang C, and von Neumann's numbers average 1.
- 21 servers meet the p99 target and 20 don't; with three zones the fleet is 33.
- The best commitment covers the steady part of the week, not the peak, and saves about 14%.

## Break it (then fix it)
- Make the service times constant instead of exponential and watch the waits and the p99 fall: variability, not just utilisation, drives queueing.
- Give each server its own queue, assigning arrivals at random, and compare the p99 with the shared queue at the same fleet size.
- Tighten the target to 95 ms, then to 93 ms (cap the search loop first), and explain the result: the p99 of the service time alone is about 92 ms, so beyond a point more servers can't help, and only a faster service or a looser target will.

## Starter code
```python
def mulberry32(seed): ...                       # copy the seeded generator from module 2
def exponential(rand): ...                      # TODO: von Neumann's method, using only comparisons

SERVICE_MS, TARGET_P99_MS = 20, 100

def simulate(servers, per_second, count=20_000, seed=1): ...   # TODO: (mean wait, p99 response) in ms
def erlang_c_wait(servers, per_second): ...     # TODO: the formula's mean wait, in ms
```

```javascript
function mulberry32(seed) { /* copy the seeded generator from module 2 */ }
function exponential(rand) { /* TODO: von Neumann's method, using only comparisons */ }

const SERVICE_MS = 20, TARGET_P99_MS = 100;
function simulate(servers, perSecond, count = 20000, seed = 1) { /* TODO: [mean wait, p99 response] in ms */ }
function erlangCWait(servers, perSecond) { /* TODO: the formula's mean wait, in ms */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""Measure a queue, check it against the model, then size and price a fleet for next year's peak."""

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

def exponential(rand):                              # von Neumann's method: exact, and needs no logarithms
    k = 0
    while True:
        first = low = rand()
        n = 1
        while True:
            u = rand()
            if u >= low:
                break
            low, n = u, n + 1
        if n % 2 == 1:
            return k + first
        k += 1

SERVICE_MS = 20                                     # mean service time; each server handles 50 requests a second
TARGET_P99_MS = 100

def simulate(servers, per_second, count=20_000, seed=1):   # one shared first-come, first-served queue
    rand = mulberry32(seed)
    free_at = [0.0] * servers
    t, waited, responses = 0.0, 0.0, []
    for _ in range(count):
        t += exponential(rand) * 1000 / per_second  # random (Poisson) arrivals
        i = free_at.index(min(free_at))             # the server that frees up first
        start = max(t, free_at[i])
        free_at[i] = start + exponential(rand) * SERVICE_MS
        waited += start - t                         # a plain running total, as in the JavaScript version
        responses.append(free_at[i] - t)
    responses.sort()
    return waited / count, responses[(count * 99 + 99) // 100 - 1]

def erlang_c_wait(servers, per_second):             # the M/M/c formula for the mean wait, in ms
    a = per_second * SERVICE_MS / 1000              # offered load, in servers' worth
    term = total = 1.0
    for k in range(1, servers):
        term *= a / k
        total += term
    waiting = term * a / servers * servers / (servers - a)
    return waiting / (total + waiting) * SERVICE_MS / (servers - a)

def tenths(x):
    t = int(x * 10 + 0.5)
    return f"{t // 10}.{t % 10}"

wait, p99 = simulate(12, 450)
print(f"model check, 12 servers at 450 req/s (75% busy): simulated mean wait {tenths(wait)} ms, "
      f"Erlang C {tenths(erlang_c_wait(12, 450))} ms; simulated p99 response {tenths(p99)} ms")

PEAK = 900                                          # next year's forecast peak, requests a second
servers = PEAK * SERVICE_MS // 1000 + 1             # start just above full utilisation
while simulate(servers, PEAK)[1] > TARGET_P99_MS:
    servers += 1
busy = PEAK * SERVICE_MS * 100 // (servers * 1000)
zone_safe = -(-servers // 2) * 3                    # three zones; any two must carry the peak alone
print(f"p99 within {TARGET_P99_MS} ms at {PEAK} req/s needs {servers} servers ({busy}% busy); "
      f"to survive losing one of three zones: {zone_safe}")

def hourly_rate(hour):                              # the forecast week: a weekday curve and quieter weekends
    day, h = divmod(hour, 24)
    base = 900 if 9 <= h < 18 else 500 if 7 <= h < 22 else 150
    return base if day < 5 else base * 6 // 10

def needed(per_second):                             # zone-safe servers at the busy share that met the p99 target
    n = -(-per_second * SERVICE_MS * 100 // (busy * 1000))
    return -(-n // 2) * 3

week = [needed(hourly_rate(h)) for h in range(168)]
ON_DEMAND, COMMITTED = 40, 24                       # cents per server-hour, illustrative
cost = lambda k: k * 168 * COMMITTED + sum(max(0, d - k) for d in week) * ON_DEMAND
best = min(range(max(week) + 1), key=cost)
dollars = lambda c: f"${c // 100:,}.{c % 100:02d}"
print(f"weekly fleet: {min(week)} to {max(week)} servers; all on demand {dollars(cost(0))}, "
      f"committing to {best} servers {dollars(cost(best))} ({(cost(0) - cost(best)) * 100 // cost(0)}% less)")

rand = mulberry32(42)
total = 0.0
for _ in range(100_000):
    total += exponential(rand)
assert 0.98 < total / 100_000 < 1.02                 # von Neumann's method really has mean 1
assert abs(simulate(12, 450)[0] - erlang_c_wait(12, 450)) < 1.5
assert simulate(servers - 1, PEAK)[1] > TARGET_P99_MS >= simulate(servers, PEAK)[1]
print("capacity lab OK")
```

Output:
```text
model check, 12 servers at 450 req/s (75% busy): simulated mean wait 2.0 ms, Erlang C 1.8 ms; simulated p99 response 96.3 ms
p99 within 100 ms at 900 req/s needs 21 servers (85% busy); to survive losing one of three zones: 33
weekly fleet: 6 to 33 servers; all on demand $1,170.00, committing to 12 servers $998.64 (14% less)
capacity lab OK
```

```javascript
// Measure a queue, check it against the model, then size and price a fleet for next year's peak.

function mulberry32(seed) {                            // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function exponential(rand) {                           // von Neumann's method: exact, and needs no logarithms
  let k = 0;
  for (;;) {
    const first = rand();
    let low = first, n = 1;
    for (;;) {
      const u = rand();
      if (u >= low) break;
      low = u;
      n++;
    }
    if (n % 2 === 1) return k + first;
    k++;
  }
}

const SERVICE_MS = 20;                                 // mean service time; each server handles 50 requests a second
const TARGET_P99_MS = 100;

function simulate(servers, perSecond, count = 20000, seed = 1) {   // one shared first-come, first-served queue
  const rand = mulberry32(seed);
  const freeAt = new Array(servers).fill(0);
  let t = 0, waited = 0;
  const responses = [];
  for (let r = 0; r < count; r++) {
    t += exponential(rand) * 1000 / perSecond;         // random (Poisson) arrivals
    const i = freeAt.indexOf(Math.min(...freeAt));     // the server that frees up first
    const start = Math.max(t, freeAt[i]);
    freeAt[i] = start + exponential(rand) * SERVICE_MS;
    waited += start - t;
    responses.push(freeAt[i] - t);
  }
  responses.sort((a, b) => a - b);
  return [waited / count, responses[Math.floor((count * 99 + 99) / 100) - 1]];
}

function erlangCWait(servers, perSecond) {             // the M/M/c formula for the mean wait, in ms
  const a = perSecond * SERVICE_MS / 1000;             // offered load, in servers' worth
  let term = 1, total = 1;
  for (let k = 1; k < servers; k++) {
    term *= a / k;
    total += term;
  }
  const waiting = term * a / servers * servers / (servers - a);
  return waiting / (total + waiting) * SERVICE_MS / (servers - a);
}

const tenths = x => { const t = Math.floor(x * 10 + 0.5); return `${Math.floor(t / 10)}.${t % 10}`; };

const [wait, p99] = simulate(12, 450);
console.log(`model check, 12 servers at 450 req/s (75% busy): simulated mean wait ${tenths(wait)} ms, ` +
            `Erlang C ${tenths(erlangCWait(12, 450))} ms; simulated p99 response ${tenths(p99)} ms`);

const PEAK = 900;                                      // next year's forecast peak, requests a second
let servers = Math.floor(PEAK * SERVICE_MS / 1000) + 1;   // start just above full utilisation
while (simulate(servers, PEAK)[1] > TARGET_P99_MS) servers++;
const busy = Math.floor(PEAK * SERVICE_MS * 100 / (servers * 1000));
const zoneSafe = Math.ceil(servers / 2) * 3;           // three zones; any two must carry the peak alone
console.log(`p99 within ${TARGET_P99_MS} ms at ${PEAK} req/s needs ${servers} servers (${busy}% busy); ` +
            `to survive losing one of three zones: ${zoneSafe}`);

function hourlyRate(hour) {                            // the forecast week: a weekday curve and quieter weekends
  const day = Math.floor(hour / 24), h = hour % 24;
  const base = 9 <= h && h < 18 ? 900 : 7 <= h && h < 22 ? 500 : 150;
  return day < 5 ? base : Math.floor(base * 6 / 10);
}

function needed(perSecond) {                           // zone-safe servers at the busy share that met the p99 target
  const n = Math.ceil(perSecond * SERVICE_MS * 100 / (busy * 1000));
  return Math.ceil(n / 2) * 3;
}

const week = Array.from({ length: 168 }, (_, h) => needed(hourlyRate(h)));
const ON_DEMAND = 40, COMMITTED = 24;                  // cents per server-hour, illustrative
const cost = k => k * 168 * COMMITTED + week.reduce((sum, d) => sum + Math.max(0, d - k), 0) * ON_DEMAND;
let best = 0;
for (let k = 1; k <= Math.max(...week); k++) if (cost(k) < cost(best)) best = k;
const dollars = c => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
console.log(`weekly fleet: ${Math.min(...week)} to ${Math.max(...week)} servers; all on demand ${dollars(cost(0))}, ` +
            `committing to ${best} servers ${dollars(cost(best))} (${Math.floor((cost(0) - cost(best)) * 100 / cost(0))}% less)`);

const rand = mulberry32(42);
let sum = 0;
for (let i = 0; i < 100000; i++) sum += exponential(rand);
if (!(sum / 100000 > 0.98 && sum / 100000 < 1.02)) throw new Error("von Neumann's method should have mean 1");
if (Math.abs(simulate(12, 450)[0] - erlangCWait(12, 450)) >= 1.5) throw new Error("simulation and formula disagree");
if (!(simulate(servers - 1, PEAK)[1] > TARGET_P99_MS && TARGET_P99_MS >= simulate(servers, PEAK)[1])) throw new Error("not the smallest fleet");
console.log("capacity lab OK");
```

Output:
```text
model check, 12 servers at 450 req/s (75% busy): simulated mean wait 2.0 ms, Erlang C 1.8 ms; simulated p99 response 96.3 ms
p99 within 100 ms at 900 req/s needs 21 servers (85% busy); to survive losing one of three zones: 33
weekly fleet: 6 to 33 servers; all on demand $1,170.00, committing to 12 servers $998.64 (14% less)
capacity lab OK
```

</details>
