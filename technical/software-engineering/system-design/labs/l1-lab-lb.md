---
title: "A load balancer with health checks and retries: a simulation"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A load balancer with health checks and retries: a simulation

> System Design L1 · about 75 min · modules m03, m04

Build a round-robin load balancer in front of three servers, take one server down for 20 seconds, and measure the errors with no health checks, with health checks (down after 3 failures, up after 2 passes), and with one retry on another server. Then explain every number.

## Before you start
- Python 3.12+ and Node.js 22+
- Read modules 3 and 4

## Steps
1. Write `health_step(healthy, streak, ok, fall, rise)`: one check result in, the new state out (module 4's thresholds).
2. Write a `LoadBalancer` with `check(up)` (one round of health checks), `pick(avoid)` (round robin over healthy servers not in avoid) and `send(up)` (try, and retry on another server up to `retries` times).
3. Simulate 60 one-second ticks with 30 requests each; server s1 is down from second 20 to second 39.
4. Print the errors and attempts for three set-ups: no health checks, health checks, and health checks plus one retry.
5. Explain each result: why 200 errors without checks, why exactly 20 with them, and why the retry version makes 30 extra attempts.

## Prove it worked
- Without health checks, a third of the requests fail while s1 is down: 10 a second for 20 seconds.
- With health checks, only the first two seconds fail (s1 needs 3 failed checks to go down).
- With one retry there are no errors, at the cost of 30 extra attempts on the healthy servers.

## Break it (then fix it)
- Set fall to 1: errors drop, but make s1 fail one check in three and watch it flap in and out.
- Give the retry no `avoid` list, so it can pick the same dead server again, and count the errors.
- Add least connections as a second policy, give s0 slow requests, and compare the peak load per server (module 4).

## Starter code
```python
def health_step(healthy, streak, ok, fall=3, rise=2):
    ...                                     # TODO: module 4's thresholds; return (healthy, streak)

class LoadBalancer:
    def __init__(self, names, health_checks=True, retries=0):
        self.names, self.health_checks, self.retries = names, health_checks, retries
        self.healthy = {n: True for n in names}
        self.streak = {n: 0 for n in names}
        self.turn, self.attempts = 0, 0

    def check(self, up): ...                # TODO: one health-check round (skip if health checks are off)
    def pick(self, avoid): ...              # TODO: round robin over healthy servers not in avoid
    def send(self, up): ...                 # TODO: try, then retry elsewhere up to self.retries times

# TODO: simulate 60 ticks of 30 requests; s1 is down for ticks 20 to 39
```

```javascript
function healthStep(healthy, streak, ok, fall = 3, rise = 2) {
  // TODO: module 4's thresholds; return [healthy, streak]
}

class LoadBalancer {
  constructor(names, healthChecks = true, retries = 0) {
    this.names = names; this.healthChecks = healthChecks; this.retries = retries;
    this.healthy = Object.fromEntries(names.map(n => [n, true]));
    this.streak = Object.fromEntries(names.map(n => [n, 0]));
    this.turn = 0; this.attempts = 0;
  }
  check(up) { /* TODO */ }
  pick(avoid) { /* TODO */ }
  send(up) { /* TODO */ }
}

// TODO: simulate 60 ticks of 30 requests; s1 is down for ticks 20 to 39
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random

def health_step(healthy, streak, ok, fall=3, rise=2):
    """Apply one health-check result; returns the new (healthy, streak)."""
    if ok == healthy:
        return healthy, 0                           # agrees with the current state: reset the count
    streak += 1
    if streak == (rise if ok else fall):
        return ok, 0                                # enough results in a row: switch
    return healthy, streak

class LoadBalancer:
    def __init__(self, names, health_checks=True, retries=0):
        self.names, self.health_checks, self.retries = names, health_checks, retries
        self.healthy = {n: True for n in names}
        self.streak = {n: 0 for n in names}
        self.turn = 0                               # round-robin position
        self.attempts = 0

    def check(self, up):                            # one round of health checks
        if self.health_checks:
            for n in self.names:
                self.healthy[n], self.streak[n] = health_step(self.healthy[n], self.streak[n], up[n])

    def pick(self, avoid):
        pool = [n for n in self.names if self.healthy[n] and n not in avoid]
        if not pool:
            return None
        n = pool[self.turn % len(pool)]
        self.turn += 1
        return n

    def send(self, up):                             # True if the request succeeded
        tried = []
        for _ in range(1 + self.retries):
            n = self.pick(tried)
            if n is None:
                return False
            self.attempts += 1
            if up[n]:
                return True
            tried.append(n)                         # retry somewhere else
        return False

def simulate(health_checks, retries, ticks=60, per_tick=30):
    lb, errors = LoadBalancer(["s0", "s1", "s2"], health_checks, retries), 0
    for t in range(ticks):                          # one tick = one second; s1 is down from 20 s to 39 s
        up = {"s0": True, "s1": not 20 <= t < 40, "s2": True}
        lb.check(up)
        errors += sum(not lb.send(up) for _ in range(per_tick))
    return errors, lb.attempts

for label, checks, retries in (("no health checks", False, 0), ("health checks", True, 0), ("health checks + 1 retry", True, 1)):
    errors, attempts = simulate(checks, retries)
    print(f"{label}: {errors} errors in 1800 requests, {attempts} attempts")

assert simulate(False, 0) == (200, 1800) and simulate(True, 0)[0] == 20 and simulate(True, 1) == (0, 1830)
for _ in range(500):                                # health_step against a direct count of the last results
    fall, rise = random.randint(1, 4), random.randint(1, 4)
    healthy, streak, history = True, 0, []
    for _ in range(40):
        ok = random.random() < 0.6
        before = healthy
        healthy, streak = health_step(healthy, streak, ok, fall, rise)
        history.append(ok)
        if healthy != before:                       # a switch needs `fall` failures or `rise` passes in a row
            need = rise if healthy else fall
            assert history[-need:] == [healthy] * need
print("load balancer lab OK")
```

Output:
```text
no health checks: 200 errors in 1800 requests, 1800 attempts
health checks: 20 errors in 1800 requests, 1800 attempts
health checks + 1 retry: 0 errors in 1800 requests, 1830 attempts
load balancer lab OK
```

```javascript
function healthStep(healthy, streak, ok, fall = 3, rise = 2) {
  // apply one health-check result; returns the new [healthy, streak]
  if (ok === healthy) return [healthy, 0];          // agrees with the current state: reset the count
  streak++;
  if (streak === (ok ? rise : fall)) return [ok, 0];   // enough results in a row: switch
  return [healthy, streak];
}

class LoadBalancer {
  constructor(names, healthChecks = true, retries = 0) {
    this.names = names; this.healthChecks = healthChecks; this.retries = retries;
    this.healthy = Object.fromEntries(names.map(n => [n, true]));
    this.streak = Object.fromEntries(names.map(n => [n, 0]));
    this.turn = 0;                                  // round-robin position
    this.attempts = 0;
  }
  check(up) {                                       // one round of health checks
    if (!this.healthChecks) return;
    for (const n of this.names) [this.healthy[n], this.streak[n]] = healthStep(this.healthy[n], this.streak[n], up[n]);
  }
  pick(avoid) {
    const pool = this.names.filter(n => this.healthy[n] && !avoid.includes(n));
    if (!pool.length) return null;
    return pool[this.turn++ % pool.length];
  }
  send(up) {                                        // true if the request succeeded
    const tried = [];
    for (let k = 0; k <= this.retries; k++) {
      const n = this.pick(tried);
      if (n === null) return false;
      this.attempts++;
      if (up[n]) return true;
      tried.push(n);                                // retry somewhere else
    }
    return false;
  }
}

function simulate(healthChecks, retries, ticks = 60, perTick = 30) {
  const lb = new LoadBalancer(["s0", "s1", "s2"], healthChecks, retries);
  let errors = 0;
  for (let t = 0; t < ticks; t++) {                 // one tick = one second; s1 is down from 20 s to 39 s
    const up = { s0: true, s1: !(t >= 20 && t < 40), s2: true };
    lb.check(up);
    for (let r = 0; r < perTick; r++) if (!lb.send(up)) errors++;
  }
  return [errors, lb.attempts];
}

for (const [label, checks, retries] of [["no health checks", false, 0], ["health checks", true, 0], ["health checks + 1 retry", true, 1]]) {
  const [errors, attempts] = simulate(checks, retries);
  console.log(`${label}: ${errors} errors in 1800 requests, ${attempts} attempts`);
}

if (simulate(false, 0).join() !== "200,1800" || simulate(true, 0)[0] !== 20 || simulate(true, 1).join() !== "0,1830") throw new Error("simulation");
for (let r = 0; r < 500; r++) {                     // healthStep against a direct count of the last results
  const fall = 1 + Math.floor(Math.random() * 4), rise = 1 + Math.floor(Math.random() * 4);
  let healthy = true, streak = 0;
  const history = [];
  for (let k = 0; k < 40; k++) {
    const ok = Math.random() < 0.6, before = healthy;
    [healthy, streak] = healthStep(healthy, streak, ok, fall, rise);
    history.push(ok);
    if (healthy !== before) {                       // a switch needs `fall` failures or `rise` passes in a row
      const need = healthy ? rise : fall;
      if (!history.slice(-need).every(x => x === healthy)) throw new Error("threshold");
    }
  }
}
console.log("load balancer lab OK");
```

Output:
```text
no health checks: 200 errors in 1800 requests, 1800 attempts
health checks: 20 errors in 1800 requests, 1800 attempts
health checks + 1 retry: 0 errors in 1800 requests, 1830 attempts
load balancer lab OK
```

</details>
