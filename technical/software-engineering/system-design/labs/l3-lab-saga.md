---
title: "An order saga across three services, with outboxes, inboxes and crashes"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: An order saga across three services, with outboxes, inboxes and crashes

> System Design L3 · about 90 min · modules m01, m02

Build an orchestrated order saga across three services (orders, inventory and payments), each with its own SQLite database. Every state change and the message it causes commit together through an outbox; a relay publishes outbox rows to a broker; every consumer dedupes through an inbox. Then crash the relay after publishing and the consumers after committing, and prove that no order is left half-done, no stock is lost and no card is charged twice.

## Before you start
- Python 3.12+ (sqlite3) and Node.js 22.13+ (node:sqlite)
- Read modules 1 and 2

## Steps
1. Give each service its own in-memory database with an outbox (seq, topic, body, sent) and an inbox (msg_id primary key), plus its own tables: orders, stock and reservations, payments.
2. Place 30 orders: each order row and its ReserveStock command go into the orders database in one transaction.
3. Write the handlers: inventory reserves or reports out of stock, and releases on request; payments charges or declines (amounts divisible by 7 are declined); orders, the orchestrator, moves each order on to the next step or to cancelled.
4. Write the relay (publish unsent outbox rows, then mark them sent) and the delivery loop (insert the message id into the inbox, run the handler and write its replies, all in one transaction). Crash the relay after publishing one time in ten, and a consumer after committing one time in ten, using the seeded generator.
5. Check the invariants: every order confirmed or cancelled; stock sold equals stock reserved for confirmed orders; exactly one charge per confirmed order; duplicates delivered and skipped.

## Prove it worked
- All 30 sagas finish: 19 confirmed, 11 cancelled, none stuck halfway.
- 17 duplicate deliveries, caused by 17 crashes, are all recognised by the inboxes and skipped.
- Stock and payments agree exactly with the confirmed orders: 37 boxes sold and 19 charges.

## Break it (then fix it)
- Publish straight from the handler instead of through the outbox, crash between the commit and the publish, and find the orders that never move on.
- Remove the inbox check and count the double charges and double reservations.
- Make the release step fail the first time and check that the saga still finishes, because the retry is safe.

## Starter code
```python
import json, sqlite3

def mulberry32(seed): ...                       # copy the seeded generator from module 1

def service_db(schema):
    ...                                         # TODO: a fresh :memory: database with schema, an outbox and an inbox

def emit(db, topic, body):
    ...                                         # TODO: insert into the outbox, inside the caller's transaction

HANDLERS = {}                                   # TODO: topic -> (service, handler(db, message))

def relay(): ...                                # TODO: publish unsent rows, crash one time in ten, then mark sent
def deliver(): ...                              # TODO: inbox dedupe, handler and replies in one transaction
```

```javascript
const { DatabaseSync } = require("node:sqlite");

function mulberry32(seed) { /* copy the seeded generator from module 1 */ }
function serviceDb(schema) { /* TODO: a fresh :memory: database with schema, an outbox and an inbox */ }
function emit(db, topic, body) { /* TODO: insert into the outbox, inside the caller's transaction */ }
const HANDLERS = {};                            // TODO: topic -> [service, handler(db, message)]
function relay() { /* TODO: publish unsent rows, crash one time in ten, then mark sent */ }
function deliver() { /* TODO: inbox dedupe, handler and replies in one transaction */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""An orchestrated order saga across three services, each with its own SQLite database, an outbox and an inbox."""
import json
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

def service_db(schema):
    db = sqlite3.connect(":memory:")                # every service owns its own database
    db.executescript(schema + """
        CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, body TEXT, sent INTEGER DEFAULT 0);
        CREATE TABLE inbox (msg_id TEXT PRIMARY KEY);""")
    return db

dbs = {
    "orders": service_db("CREATE TABLE orders (id TEXT PRIMARY KEY, qty INTEGER, amount INTEGER, status TEXT, reason TEXT);"),
    "inventory": service_db("CREATE TABLE stock (sku TEXT PRIMARY KEY, available INTEGER);"
                            "CREATE TABLE reservations (order_id TEXT PRIMARY KEY, qty INTEGER);"),
    "payments": service_db("CREATE TABLE payments (order_id TEXT PRIMARY KEY, amount INTEGER, status TEXT);"),
}
dbs["inventory"].execute("INSERT INTO stock VALUES ('pizza-box', 40)")
dbs["inventory"].commit()

def emit(db, topic, body):                          # called inside the handler's transaction: the outbox pattern
    db.execute("INSERT INTO outbox (topic, body) VALUES (?, ?)", (topic, json.dumps(body)))

def on_reserve(db, m):
    available = db.execute("SELECT available FROM stock WHERE sku = 'pizza-box'").fetchone()[0]
    if available >= m["qty"]:
        db.execute("UPDATE stock SET available = available - ? WHERE sku = 'pizza-box'", (m["qty"],))
        db.execute("INSERT INTO reservations VALUES (?, ?)", (m["order"], m["qty"]))
        emit(db, "StockReserved", m)
    else:
        emit(db, "OutOfStock", m)

def on_release(db, m):
    row = db.execute("SELECT qty FROM reservations WHERE order_id = ?", (m["order"],)).fetchone()
    if row:                                         # compensation: give the stock back
        db.execute("UPDATE stock SET available = available + ? WHERE sku = 'pizza-box'", (row[0],))
        db.execute("DELETE FROM reservations WHERE order_id = ?", (m["order"],))
    emit(db, "StockReleased", m)

def on_charge(db, m):
    declined = m["amount"] % 7 == 0                 # the provider declines some cards
    db.execute("INSERT INTO payments VALUES (?, ?, ?)", (m["order"], m["amount"], "declined" if declined else "charged"))
    emit(db, "PaymentDeclined" if declined else "PaymentCharged", m)

def set_status(db, m, status, reason=None):
    db.execute("UPDATE orders SET status = ?, reason = ? WHERE id = ?", (status, reason, m["order"]))

def on_reserved(db, m):                             # the orchestrator: decides the next step from each reply
    set_status(db, m, "reserved")
    emit(db, "ChargePayment", m)

def on_declined(db, m):
    set_status(db, m, "releasing")
    emit(db, "ReleaseStock", m)

HANDLERS = {
    "ReserveStock": ("inventory", on_reserve), "ReleaseStock": ("inventory", on_release),
    "ChargePayment": ("payments", on_charge),
    "StockReserved": ("orders", on_reserved), "PaymentDeclined": ("orders", on_declined),
    "OutOfStock": ("orders", lambda db, m: set_status(db, m, "cancelled", "out of stock")),
    "PaymentCharged": ("orders", lambda db, m: set_status(db, m, "confirmed")),
    "StockReleased": ("orders", lambda db, m: set_status(db, m, "cancelled", "card declined")),
}

rand = mulberry32(7)
broker, stats = [], {"delivered": 0, "duplicates": 0, "relay crashes": 0, "consumer crashes": 0}

def relay():                                        # copy unsent outbox rows to the broker, then mark them sent
    for name, db in dbs.items():
        for seq, topic, body in db.execute("SELECT seq, topic, body FROM outbox WHERE sent = 0 ORDER BY seq").fetchall():
            broker.append((f"{name}-{seq}", topic, body))
            if rand() < 0.1:
                stats["relay crashes"] += 1         # published, but crashed before marking it: it goes out again
                return
            with db:
                db.execute("UPDATE outbox SET sent = 1 WHERE seq = ?", (seq,))

def deliver():
    msg_id, topic, body = broker.pop(0)
    name, handler = HANDLERS[topic]
    db = dbs[name]
    stats["delivered"] += 1
    with db:                                        # dedupe, state change and reply in one local transaction
        if db.execute("INSERT OR IGNORE INTO inbox VALUES (?)", (msg_id,)).rowcount == 0:
            stats["duplicates"] += 1                # seen before: skip it
            return
        handler(db, json.loads(body))
    if rand() < 0.1:
        stats["consumer crashes"] += 1              # committed, but crashed before acknowledging: redelivered later
        broker.append((msg_id, topic, body))

for i in range(1, 31):                              # place 30 orders: the order row and its first command, atomically
    with dbs["orders"]:
        order = {"order": f"order-{i}", "qty": 1 + i % 3, "amount": 1000 + 13 * i}
        dbs["orders"].execute("INSERT INTO orders VALUES (?, ?, ?, 'placed', NULL)", (order["order"], order["qty"], order["amount"]))
        emit(dbs["orders"], "ReserveStock", order)
while True:
    relay()
    if not broker:
        break
    while broker:
        deliver()

orders = dbs["orders"].execute("SELECT status, reason, qty FROM orders").fetchall()
confirmed = [qty for status, _, qty in orders if status == "confirmed"]
reasons = [reason for status, reason, _ in orders if status == "cancelled"]
available = dbs["inventory"].execute("SELECT available FROM stock").fetchone()[0]
reserved = dbs["inventory"].execute("SELECT COALESCE(SUM(qty), 0) FROM reservations").fetchone()[0]
charged = dbs["payments"].execute("SELECT COUNT(*) FROM payments WHERE status = 'charged'").fetchone()[0]
print(f"orders: {len(orders)} | confirmed: {len(confirmed)} | cancelled: {len(reasons)} "
      f"(out of stock {reasons.count('out of stock')}, card declined {reasons.count('card declined')})")
print(f"messages delivered: {stats['delivered']} | duplicates skipped: {stats['duplicates']} | "
      f"relay crashes: {stats['relay crashes']} | consumer crashes: {stats['consumer crashes']}")
print(f"stock: {available} of 40 left, {reserved} sold to confirmed orders: "
      f"{'yes' if reserved == sum(confirmed) == 40 - available else 'no'} | charges: {charged}, one per confirmed order: "
      f"{'yes' if charged == len(confirmed) else 'no'}")
assert all(status in ("confirmed", "cancelled") for status, _, _ in orders)   # every saga finished
assert reserved == sum(confirmed) == 40 - available and charged == len(confirmed)
assert stats["duplicates"] > 0                      # duplicates really happened, and were absorbed
print("saga lab OK")
```

Output:
```text
orders: 30 | confirmed: 19 | cancelled: 11 (out of stock 9, card declined 2)
messages delivered: 123 | duplicates skipped: 17 | relay crashes: 8 | consumer crashes: 9
stock: 3 of 40 left, 37 sold to confirmed orders: yes | charges: 19, one per confirmed order: yes
saga lab OK
```

```javascript
// An orchestrated order saga across three services, each with its own SQLite database, an outbox and an inbox.
const { DatabaseSync } = require("node:sqlite");     // built in from Node.js 22.13 (with an experimental warning)

function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function serviceDb(schema) {
  const db = new DatabaseSync(":memory:");          // every service owns its own database
  db.exec(schema + `
    CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, body TEXT, sent INTEGER DEFAULT 0);
    CREATE TABLE inbox (msg_id TEXT PRIMARY KEY);`);
  return db;
}

function transaction(db, work) {                    // BEGIN ... COMMIT, or ROLLBACK if anything throws
  db.exec("BEGIN");
  try { const result = work(); db.exec("COMMIT"); return result; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const dbs = {
  orders: serviceDb("CREATE TABLE orders (id TEXT PRIMARY KEY, qty INTEGER, amount INTEGER, status TEXT, reason TEXT);"),
  inventory: serviceDb("CREATE TABLE stock (sku TEXT PRIMARY KEY, available INTEGER);" +
                       "CREATE TABLE reservations (order_id TEXT PRIMARY KEY, qty INTEGER);"),
  payments: serviceDb("CREATE TABLE payments (order_id TEXT PRIMARY KEY, amount INTEGER, status TEXT);"),
};
dbs.inventory.exec("INSERT INTO stock VALUES ('pizza-box', 40)");

function emit(db, topic, body) {                    // called inside the handler's transaction: the outbox pattern
  db.prepare("INSERT INTO outbox (topic, body) VALUES (?, ?)").run(topic, JSON.stringify(body));
}

function onReserve(db, m) {
  const { available } = db.prepare("SELECT available FROM stock WHERE sku = 'pizza-box'").get();
  if (available >= m.qty) {
    db.prepare("UPDATE stock SET available = available - ? WHERE sku = 'pizza-box'").run(m.qty);
    db.prepare("INSERT INTO reservations VALUES (?, ?)").run(m.order, m.qty);
    emit(db, "StockReserved", m);
  } else emit(db, "OutOfStock", m);
}

function onRelease(db, m) {
  const row = db.prepare("SELECT qty FROM reservations WHERE order_id = ?").get(m.order);
  if (row) {                                        // compensation: give the stock back
    db.prepare("UPDATE stock SET available = available + ? WHERE sku = 'pizza-box'").run(row.qty);
    db.prepare("DELETE FROM reservations WHERE order_id = ?").run(m.order);
  }
  emit(db, "StockReleased", m);
}

function onCharge(db, m) {
  const declined = m.amount % 7 === 0;              // the provider declines some cards
  db.prepare("INSERT INTO payments VALUES (?, ?, ?)").run(m.order, m.amount, declined ? "declined" : "charged");
  emit(db, declined ? "PaymentDeclined" : "PaymentCharged", m);
}

const setStatus = (db, m, status, reason = null) =>
  db.prepare("UPDATE orders SET status = ?, reason = ? WHERE id = ?").run(status, reason, m.order);

const HANDLERS = {                                  // the orchestrator lives in orders: it decides each next step
  ReserveStock: ["inventory", onReserve], ReleaseStock: ["inventory", onRelease],
  ChargePayment: ["payments", onCharge],
  StockReserved: ["orders", (db, m) => { setStatus(db, m, "reserved"); emit(db, "ChargePayment", m); }],
  PaymentDeclined: ["orders", (db, m) => { setStatus(db, m, "releasing"); emit(db, "ReleaseStock", m); }],
  OutOfStock: ["orders", (db, m) => setStatus(db, m, "cancelled", "out of stock")],
  PaymentCharged: ["orders", (db, m) => setStatus(db, m, "confirmed")],
  StockReleased: ["orders", (db, m) => setStatus(db, m, "cancelled", "card declined")],
};

const rand = mulberry32(7);
const broker = [], stats = { delivered: 0, duplicates: 0, relayCrashes: 0, consumerCrashes: 0 };

function relay() {                                  // copy unsent outbox rows to the broker, then mark them sent
  for (const [name, db] of Object.entries(dbs)) {
    for (const { seq, topic, body } of db.prepare("SELECT seq, topic, body FROM outbox WHERE sent = 0 ORDER BY seq").all()) {
      broker.push([`${name}-${seq}`, topic, body]);
      if (rand() < 0.1) { stats.relayCrashes++; return; }   // published, but crashed before marking it: it goes out again
      db.prepare("UPDATE outbox SET sent = 1 WHERE seq = ?").run(seq);
    }
  }
}

function deliver() {
  const [msgId, topic, body] = broker.shift();
  const [name, handler] = HANDLERS[topic];
  const db = dbs[name];
  stats.delivered++;
  const fresh = transaction(db, () => {             // dedupe, state change and reply in one local transaction
    if (db.prepare("INSERT OR IGNORE INTO inbox VALUES (?)").run(msgId).changes === 0) return false;   // seen before: skip it
    handler(db, JSON.parse(body));
    return true;
  });
  if (!fresh) { stats.duplicates++; return; }
  if (rand() < 0.1) { stats.consumerCrashes++; broker.push([msgId, topic, body]); }   // committed, but crashed before acknowledging
}

for (let i = 1; i <= 30; i++) {                     // place 30 orders: the order row and its first command, atomically
  const order = { order: `order-${i}`, qty: 1 + (i % 3), amount: 1000 + 13 * i };
  transaction(dbs.orders, () => {
    dbs.orders.prepare("INSERT INTO orders VALUES (?, ?, ?, 'placed', NULL)").run(order.order, order.qty, order.amount);
    emit(dbs.orders, "ReserveStock", order);
  });
}
while (true) {
  relay();
  if (broker.length === 0) break;
  while (broker.length) deliver();
}

const orders = dbs.orders.prepare("SELECT status, reason, qty FROM orders").all();
const confirmed = orders.filter(o => o.status === "confirmed").map(o => o.qty);
const reasons = orders.filter(o => o.status === "cancelled").map(o => o.reason);
const { available } = dbs.inventory.prepare("SELECT available FROM stock").get();
const { reserved } = dbs.inventory.prepare("SELECT COALESCE(SUM(qty), 0) AS reserved FROM reservations").get();
const { charged } = dbs.payments.prepare("SELECT COUNT(*) AS charged FROM payments WHERE status = 'charged'").get();
const sold = confirmed.reduce((a, b) => a + b, 0);
console.log(`orders: ${orders.length} | confirmed: ${confirmed.length} | cancelled: ${reasons.length} ` +
            `(out of stock ${reasons.filter(r => r === "out of stock").length}, card declined ${reasons.filter(r => r === "card declined").length})`);
console.log(`messages delivered: ${stats.delivered} | duplicates skipped: ${stats.duplicates} | ` +
            `relay crashes: ${stats.relayCrashes} | consumer crashes: ${stats.consumerCrashes}`);
console.log(`stock: ${available} of 40 left, ${reserved} sold to confirmed orders: ` +
            `${reserved === sold && sold === 40 - available ? "yes" : "no"} | charges: ${charged}, one per confirmed order: ` +
            `${charged === confirmed.length ? "yes" : "no"}`);
if (!orders.every(o => o.status === "confirmed" || o.status === "cancelled")) throw new Error("a saga didn't finish");
if (!(reserved === sold && sold === 40 - available && charged === confirmed.length)) throw new Error("invariants");
if (stats.duplicates === 0) throw new Error("no duplicates were exercised");
console.log("saga lab OK");
```

Output:
```text
orders: 30 | confirmed: 19 | cancelled: 11 (out of stock 9, card declined 2)
messages delivered: 123 | duplicates skipped: 17 | relay crashes: 8 | consumer crashes: 9
stock: 3 of 40 left, 37 sold to confirmed orders: yes | charges: 19, one per confirmed order: yes
saga lab OK
```

</details>
