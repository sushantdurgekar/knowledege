---
title: "A durable work queue on SQLite: retries, dead letters and an idempotent consumer"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A durable work queue on SQLite: retries, dead letters and an idempotent consumer

> System Design L2 · about 75 min · modules m05, m06

Build a work queue on SQLite that survives restarts: a receive that hides a job for a visibility timeout, an acknowledgement, retries with exponential backoff, and a dead-letter state after three failures. Then write a consumer that charges every order exactly once, even though the worker crashes between charging and acknowledging.

## Before you start
- Python 3.12+ (sqlite3) and Node.js 22.13+ (node:sqlite)
- Read modules 5 and 6

## Steps
1. Create a jobs table (id, key, body, attempts, visible_at, status, error) with an index on (status, visible_at, id). Call the file workqueue.py: a file named queue.py would hide Python's own queue module.
2. receive(now): in one transaction, take the oldest ready job whose visible_at has passed, set visible_at to now + 30 and add one to its attempts.
3. ack(id) marks it done; fail(id, attempts, error, now) delays it by 2^attempts seconds, or marks it dead with the error after 3 attempts.
4. charge(key, body): in one transaction, skip the key if it's already in a charges table, otherwise insert it; raise an error for a bad card.
5. Queue 20 orders (number 13 has a bad card), then run a worker on a fake clock that crashes after charging one time in five, using the seeded generator. Count deliveries, crashes and skipped duplicates.

## Prove it worked
- 19 orders are charged exactly once, although 7 crashes caused 7 extra deliveries.
- Every delivery after a crash is recognised as a duplicate and skipped.
- Order 13 ends as a dead letter after 3 attempts, with its error kept for inspection.

## Break it (then fix it)
- Move the dedupe check out of the charge's transaction and crash between the two: count the double charges.
- Make the visibility timeout shorter than the work takes, and watch two workers process the same job.
- Retry the bad card forever with no dead-letter state, and see what happens to the jobs behind it with one worker.

## Starter code
```python
import sqlite3

class Queue:
    def __init__(self, db, timeout=30, max_attempts=3):
        self.db, self.timeout, self.max_attempts = db, timeout, max_attempts
        ...                                         # TODO: CREATE TABLE jobs and its index

    def send(self, key, body): ...
    def receive(self, now): ...                     # TODO: claim the oldest visible job in one transaction
    def ack(self, job_id): ...
    def fail(self, job_id, attempts, error, now): ...   # TODO: back off, or mark dead

def charge(db, key, body):
    ...                                             # TODO: the charge and its dedupe record, in one transaction
```

```javascript
const { DatabaseSync } = require("node:sqlite");

class Queue {
  constructor(db, timeout = 30, maxAttempts = 3) {
    this.db = db; this.timeout = timeout; this.maxAttempts = maxAttempts;
    // TODO: CREATE TABLE jobs and its index
  }
  send(key, body) { /* TODO */ }
  receive(now) { /* TODO: claim the oldest visible job in one transaction */ }
  ack(jobId) { /* TODO */ }
  fail(jobId, attempts, error, now) { /* TODO: back off, or mark dead */ }
}

function charge(db, key, body) { /* TODO: the charge and its dedupe record, in one transaction */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""A durable work queue in SQLite: visibility timeouts, retries with backoff, a dead-letter state, an idempotent consumer."""
import sqlite3

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

class Queue:
    def __init__(self, db, timeout=30, max_attempts=3):
        self.db, self.timeout, self.max_attempts = db, timeout, max_attempts
        db.executescript("""
            CREATE TABLE jobs (id INTEGER PRIMARY KEY, key TEXT NOT NULL, body TEXT NOT NULL,
                               attempts INTEGER NOT NULL DEFAULT 0, visible_at INTEGER NOT NULL DEFAULT 0,
                               status TEXT NOT NULL DEFAULT 'ready', error TEXT);
            CREATE INDEX jobs_ready ON jobs (status, visible_at, id);
        """)

    def send(self, key, body):
        with self.db:
            self.db.execute("INSERT INTO jobs (key, body) VALUES (?, ?)", (key, body))

    def receive(self, now):
        """Claim the oldest visible job: hide it for `timeout` seconds and count the attempt."""
        with self.db:
            row = self.db.execute("SELECT id, key, body, attempts FROM jobs WHERE status = 'ready' AND visible_at <= ? "
                                  "ORDER BY id LIMIT 1", (now,)).fetchone()
            if row is None:
                return None
            self.db.execute("UPDATE jobs SET visible_at = ?, attempts = attempts + 1 WHERE id = ?",
                            (now + self.timeout, row[0]))
            return row[0], row[1], row[2], row[3] + 1

    def ack(self, job_id):
        with self.db:
            self.db.execute("UPDATE jobs SET status = 'done' WHERE id = ?", (job_id,))

    def fail(self, job_id, attempts, error, now):
        """A handled failure: retry after an exponential backoff, or park the job as dead after max_attempts."""
        with self.db:
            if attempts >= self.max_attempts:
                self.db.execute("UPDATE jobs SET status = 'dead', error = ? WHERE id = ?", (error, job_id))
            else:
                self.db.execute("UPDATE jobs SET visible_at = ? WHERE id = ?", (now + 2 ** attempts, job_id))

    def waiting(self):
        return self.db.execute("SELECT COUNT(*) FROM jobs WHERE status = 'ready'").fetchone()[0]

def charge(db, key, body):
    """The effect and its dedupe record commit together, so a redelivered job can't charge twice."""
    if body.startswith("card=bad"):
        raise ValueError("card declined: invalid number")
    with db:
        if db.execute("SELECT 1 FROM charges WHERE key = ?", (key,)).fetchone():
            return False                            # already charged: this is a duplicate delivery
        db.execute("INSERT INTO charges (key, body) VALUES (?, ?)", (key, body))
        return True

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE charges (key TEXT PRIMARY KEY, body TEXT NOT NULL)")
queue = Queue(db)
for n in range(1, 21):
    queue.send(f"order-{n}", "card=bad" if n == 13 else f"card=ok amount={n * 5}")

rand, now = mulberry32(7), 0
deliveries = crashes = duplicates = 0
while queue.waiting():
    job = queue.receive(now)
    if job is None:
        now += 1                                    # nothing visible yet: wait a second
        continue
    job_id, key, body, attempts = job
    deliveries += 1
    try:
        if not charge(db, key, body):
            duplicates += 1
    except ValueError as err:
        queue.fail(job_id, attempts, str(err), now)
        continue
    if rand() < 0.2:
        crashes += 1                                # the worker dies after charging, before the ack: the job reappears
        continue
    queue.ack(job_id)

charged = db.execute("SELECT COUNT(*) FROM charges").fetchone()[0]
dead = db.execute("SELECT key, error, attempts FROM jobs WHERE status = 'dead'").fetchall()
print(f"orders: 20 | charged: {charged} | deliveries: {deliveries} | crashes before the ack: {crashes} | "
      f"duplicates skipped: {duplicates}")
print("dead letters:", *(f"{key} after {attempts} attempts ({error})" for key, error, attempts in dead))
assert charged == 19 and duplicates == crashes and [d[0] for d in dead] == ["order-13"]
print("queue lab OK")
```

Output:
```text
orders: 20 | charged: 19 | deliveries: 29 | crashes before the ack: 7 | duplicates skipped: 7
dead letters: order-13 after 3 attempts (card declined: invalid number)
queue lab OK
```

```javascript
// A durable work queue in SQLite: visibility timeouts, retries with backoff, a dead-letter state, an idempotent consumer.
const { DatabaseSync } = require("node:sqlite");     // Node.js 22.13 or later

function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function transaction(db, fn) {                      // commit if fn returns, roll back if it throws
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

class Queue {
  constructor(db, timeout = 30, maxAttempts = 3) {
    this.db = db; this.timeout = timeout; this.maxAttempts = maxAttempts;
    db.exec(`
      CREATE TABLE jobs (id INTEGER PRIMARY KEY, key TEXT NOT NULL, body TEXT NOT NULL,
                         attempts INTEGER NOT NULL DEFAULT 0, visible_at INTEGER NOT NULL DEFAULT 0,
                         status TEXT NOT NULL DEFAULT 'ready', error TEXT);
      CREATE INDEX jobs_ready ON jobs (status, visible_at, id);
    `);
  }
  send(key, body) {
    this.db.prepare("INSERT INTO jobs (key, body) VALUES (?, ?)").run(key, body);
  }
  receive(now) {
    // claim the oldest visible job: hide it for `timeout` seconds and count the attempt
    return transaction(this.db, () => {
      const row = this.db.prepare("SELECT id, key, body, attempts FROM jobs WHERE status = 'ready' AND visible_at <= ? " +
                                  "ORDER BY id LIMIT 1").get(now);
      if (row === undefined) return null;
      this.db.prepare("UPDATE jobs SET visible_at = ?, attempts = attempts + 1 WHERE id = ?").run(now + this.timeout, row.id);
      return [row.id, row.key, row.body, row.attempts + 1];
    });
  }
  ack(jobId) {
    this.db.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(jobId);
  }
  fail(jobId, attempts, error, now) {
    // a handled failure: retry after an exponential backoff, or park the job as dead after maxAttempts
    if (attempts >= this.maxAttempts) this.db.prepare("UPDATE jobs SET status = 'dead', error = ? WHERE id = ?").run(error, jobId);
    else this.db.prepare("UPDATE jobs SET visible_at = ? WHERE id = ?").run(now + 2 ** attempts, jobId);
  }
  waiting() {
    return this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'ready'").get().n;
  }
}

function charge(db, key, body) {
  // the effect and its dedupe record commit together, so a redelivered job can't charge twice
  if (body.startsWith("card=bad")) throw new Error("card declined: invalid number");
  return transaction(db, () => {
    if (db.prepare("SELECT 1 AS found FROM charges WHERE key = ?").get(key)) return false;   // already charged: a duplicate delivery
    db.prepare("INSERT INTO charges (key, body) VALUES (?, ?)").run(key, body);
    return true;
  });
}

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE charges (key TEXT PRIMARY KEY, body TEXT NOT NULL)");
const queue = new Queue(db);
for (let n = 1; n <= 20; n++) queue.send(`order-${n}`, n === 13 ? "card=bad" : `card=ok amount=${n * 5}`);

const rand = mulberry32(7);
let now = 0, deliveries = 0, crashes = 0, duplicates = 0;
while (queue.waiting()) {
  const job = queue.receive(now);
  if (job === null) { now++; continue; }            // nothing visible yet: wait a second
  const [jobId, key, body, attempts] = job;
  deliveries++;
  try {
    if (!charge(db, key, body)) duplicates++;
  } catch (err) {
    queue.fail(jobId, attempts, err.message, now);
    continue;
  }
  if (rand() < 0.2) { crashes++; continue; }        // the worker dies after charging, before the ack: the job reappears
  queue.ack(jobId);
}

const charged = db.prepare("SELECT COUNT(*) AS n FROM charges").get().n;
const dead = db.prepare("SELECT key, error, attempts FROM jobs WHERE status = 'dead'").all();
console.log(`orders: 20 | charged: ${charged} | deliveries: ${deliveries} | crashes before the ack: ${crashes} | ` +
            `duplicates skipped: ${duplicates}`);
console.log("dead letters:", ...dead.map(d => `${d.key} after ${d.attempts} attempts (${d.error})`));
if (charged !== 19 || duplicates !== crashes || dead.map(d => d.key).join() !== "order-13") throw new Error("queue checks");
console.log("queue lab OK");
```

Output:
```text
orders: 20 | charged: 19 | deliveries: 29 | crashes before the ack: 7 | duplicates skipped: 7
dead letters: order-13 after 3 attempts (card declined: invalid number)
queue lab OK
```

</details>
