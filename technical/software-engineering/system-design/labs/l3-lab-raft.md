---
title: "Raft on five nodes, through two network partitions"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Raft on five nodes, through two network partitions

> System Design L3 · about 120 min · modules m04

Simulate five Raft nodes over a lossy, delayed network: randomized election timeouts, RequestVote with the up-to-date rule, AppendEntries with the consistency check, and the leader's commit rule. Cut the leader off from everyone for three seconds, later split the cluster two against three, then heal. Assert Raft's safety properties on every millisecond, and show that the commands the cut-off leader accepted were never committed and are gone.

## Before you start
- Python 3.12+ and Node.js 22+
- Read module 4

## Steps
1. Model each node: term, vote, log of (term, command), commit index, role, and for a leader the next and match index of each follower. Messages take 2 to 9 ms and are dropped across a partition.
2. Elections: a follower whose timer (150 to 299 ms) runs out becomes a candidate for the next term; votes go to at most one candidate per term, and only if its log is at least as up to date. A new leader appends a no-op entry.
3. Replication: every 50 ms the leader sends each follower the entries from its next index, with the previous entry's index and term; followers refuse on a mismatch and say where to back up to; the leader commits the highest current-term entry stored on a majority.
4. Every 50 ms, a client sends a command to each node that believes it's the leader. Partition the cluster at 3,000 ms (the leader alone) and at 9,000 ms (nodes 0 and 1 against the rest), healing at 6,000 and 12,000.
5. Assert: at most one leader per term; a committed entry never changes on any node; every new leader already holds every committed entry; and after healing all nodes agree.

## Prove it worked
- No term ever has two leaders, and no committed entry ever changes, checked on every simulated millisecond.
- The cut-off leader keeps accepting commands it can never commit; after healing they are overwritten, and no client was ever told they succeeded.
- The cut-off nodes push the term up to 18 with elections they can't win, which is why real deployments add PreVote.

## Break it (then fix it)
- Drop the up-to-date check from voting and find the run where a new leader overwrites a committed entry.
- Let the leader commit an entry from an earlier term by counting replicas, and look for a committed entry that changes later.
- Give every node the same 150 ms timeout and count the split votes.

## Starter code
```python
def mulberry32(seed): ...                       # copy the seeded generator from module 1

N = 5

class Node:
    def __init__(self, i):
        ...                                     # TODO: term, vote, log, commit, role, next and match, timers

def handle(now, node, src, msg):
    ...                                         # TODO: vote?, vote, append and appended, as in module 4
```

```javascript
function mulberry32(seed) { /* copy the seeded generator from module 1 */ }
const N = 5;

class Node {
  constructor(i) { /* TODO: term, vote, log, commit, role, next and match, timers */ }
}

function handle(now, node, src, msg) { /* TODO: vote?, vote, append and appended, as in module 4 */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""Raft on five simulated nodes: elections, log replication and commits, through two network partitions."""

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

N, rand = 5, mulberry32(3)
timeout = lambda now: now + 150 + int(rand() * 150)  # randomized election timeouts

class Node:
    def __init__(self, i):
        self.id, self.term, self.voted, self.log, self.commit = i, 0, None, [], 0   # log entries: (term, command)
        self.role, self.votes, self.next, self.match = "follower", set(), {}, {}
        self.deadline, self.heartbeat_due = timeout(0), 0

nodes, net, leaders, committed = [Node(i) for i in range(N)], [], {}, {}
isolated = None                                     # the node cut off during the first partition

def connected(now, a, b):
    if 3000 <= now < 6000:
        return (a == isolated) == (b == isolated)   # the leader of the day, alone on one side
    if 9000 <= now < 12000:
        return (a < 2) == (b < 2)                   # nodes 0 and 1 against 2, 3 and 4
    return True

def send(now, src, dst, msg):
    if connected(now, src, dst):
        net.append((now + 2 + int(rand() * 8), src, dst, msg))

def last_term(node):
    return node.log[-1][0] if node.log else 0

def become_leader(now, node):
    node.role = "leader"
    leaders.setdefault(node.term, set()).add(node.id)
    for i, entry in committed.items():              # leader completeness: it already holds every committed entry
        assert len(node.log) >= i and node.log[i - 1] == entry
    node.next = {p: len(node.log) + 1 for p in range(N) if p != node.id}
    node.match = {p: 0 for p in range(N) if p != node.id}
    node.log.append((node.term, None))              # a no-op, so earlier terms' entries can commit with it
    node.heartbeat_due = now

def handle(now, node, src, msg):
    kind, term = msg[0], msg[1]
    if term > node.term:                            # a newer term: become a follower
        node.term, node.voted, node.role = term, None, "follower"
    if kind == "vote?":
        _, _, their_last_index, their_last_term = msg
        granted = (term == node.term and node.voted in (None, src)
                   and (their_last_term, their_last_index) >= (last_term(node), len(node.log)))
        if granted:
            node.voted, node.deadline = src, timeout(now)
        send(now, node.id, src, ("vote", node.term, granted))
    elif kind == "vote":
        if node.role == "candidate" and term == node.term and msg[2]:
            node.votes.add(src)
            if len(node.votes) > N // 2:
                become_leader(now, node)
    elif kind == "append":
        _, _, prev, prev_term, entries, leader_commit = msg
        if term < node.term:
            return send(now, node.id, src, ("appended", node.term, False, 0))
        node.role, node.deadline = "follower", timeout(now)   # there's a leader for this term
        if prev > len(node.log):                    # too short: tell the leader where this log ends
            return send(now, node.id, src, ("appended", node.term, False, len(node.log) + 1))
        if prev > 0 and node.log[prev - 1][0] != prev_term:
            first = prev                            # a conflict: skip back over the whole conflicting term at once
            while first > 1 and node.log[first - 2][0] == node.log[prev - 1][0]:
                first -= 1
            return send(now, node.id, src, ("appended", node.term, False, first))
        for k, entry in enumerate(entries):
            if prev + k < len(node.log) and node.log[prev + k][0] != entry[0]:
                del node.log[prev + k:]             # the first conflict: drop it and everything after
            if prev + k >= len(node.log):
                node.log.append(entry)
        node.commit = max(node.commit, min(leader_commit, prev + len(entries)))
        send(now, node.id, src, ("appended", node.term, True, prev + len(entries)))
    elif kind == "appended" and node.role == "leader" and term == node.term:
        if msg[2]:
            node.match[src] = max(node.match[src], msg[3])
            node.next[src] = node.match[src] + 1
            for n in range(len(node.log), node.commit, -1):   # the highest current-term entry on a majority
                if node.log[n - 1][0] == node.term and 1 + sum(m >= n for m in node.match.values()) > N // 2:
                    node.commit = n
                    break
        else:
            node.next[src] = max(1, min(node.next[src] - 1, msg[3]))   # back up, using the follower's hint

accepted, stranded = 0, set()                       # stranded: commands the cut-off leader accepted
for now in range(15_000):
    if now == 3000:
        isolated = max((n for n in nodes if n.role == "leader"), key=lambda n: n.term).id
    for _, src, dst, msg in [m for m in net if m[0] == now]:
        if connected(now, src, dst):
            handle(now, nodes[dst], src, msg)
    net = [m for m in net if m[0] > now]
    for node in nodes:
        if node.role == "leader" and now >= node.heartbeat_due:
            node.heartbeat_due = now + 50
            for p in range(N):
                if p != node.id:
                    prev = node.next[p] - 1
                    send(now, node.id, p, ("append", node.term, prev, node.log[prev - 1][0] if prev else 0, node.log[prev:], node.commit))
        elif node.role != "leader" and now >= node.deadline:
            node.term, node.role, node.voted, node.votes = node.term + 1, "candidate", node.id, {node.id}
            node.deadline = timeout(now)
            for p in range(N):
                if p != node.id:
                    send(now, node.id, p, ("vote?", node.term, len(node.log), last_term(node)))
    if now % 50 == 25 and now < 13_000:
        for node in nodes:
            if node.role == "leader":               # each client talks to whichever node says it's the leader
                accepted += 1
                node.log.append((node.term, f"c{accepted}"))
                if node.id == isolated and 3000 <= now < 6000:
                    stranded.add(f"c{accepted}")
    for node in nodes:
        for i in range(1, node.commit + 1):         # a committed entry must never change, on any node
            assert committed.setdefault(i, node.log[i - 1]) == node.log[i - 1]

assert all(len(ids) == 1 for ids in leaders.values())   # election safety: at most one leader per term
logs = {tuple(n.log[:n.commit]) for n in nodes}
assert len(logs) == 1 and len({n.commit for n in nodes}) == 1   # after healing, every node agrees
commands = [cmd for _, cmd in nodes[0].log[:nodes[0].commit] if cmd]
print(f"terms: {max(n.term for n in nodes)} | leaders elected: {len(leaders)} | commands accepted: {accepted}, "
      f"committed: {len(commands)}, never committed: {accepted - len(commands)}")
gone = not stranded & set(commands) and not stranded & {cmd for _, cmd in nodes[isolated].log}
assert stranded and gone                            # accepted by a deposed leader, never committed, then overwritten
print(f"one leader per term: yes | committed entries identical on all {N} nodes: yes | "
      f"the {len(stranded)} commands cut-off leader {isolated} accepted: never committed, now gone: {'yes' if gone else 'no'}")
print("raft lab OK")
```

Output:
```text
terms: 18 | leaders elected: 3 | commands accepted: 314, committed: 253, never committed: 61
one leader per term: yes | committed entries identical on all 5 nodes: yes | the 60 commands cut-off leader 1 accepted: never committed, now gone: yes
raft lab OK
```

```javascript
// Raft on five simulated nodes: elections, log replication and commits, through two network partitions.
function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 5, rand = mulberry32(3);
const timeout = now => now + 150 + Math.floor(rand() * 150);   // randomized election timeouts

class Node {
  constructor(i) {
    this.id = i; this.term = 0; this.voted = null; this.log = []; this.commit = 0;   // log entries: [term, command]
    this.role = "follower"; this.votes = new Set(); this.next = {}; this.match = {};
    this.deadline = timeout(0); this.heartbeatDue = 0;
  }
}

const nodes = Array.from({ length: N }, (_, i) => new Node(i));
let net = [];
const leaders = new Map(), committed = new Map();
let isolated = null;                                // the node cut off during the first partition
const sameEntry = (a, b) => a[0] === b[0] && a[1] === b[1];

function connected(now, a, b) {
  if (now >= 3000 && now < 6000) return (a === isolated) === (b === isolated);   // the leader of the day, alone on one side
  if (now >= 9000 && now < 12000) return (a < 2) === (b < 2);   // nodes 0 and 1 against 2, 3 and 4
  return true;
}

function send(now, src, dst, msg) {
  if (connected(now, src, dst)) net.push([now + 2 + Math.floor(rand() * 8), src, dst, msg]);
}

const lastTerm = node => (node.log.length ? node.log.at(-1)[0] : 0);

function becomeLeader(now, node) {
  node.role = "leader";
  if (!leaders.has(node.term)) leaders.set(node.term, new Set());
  leaders.get(node.term).add(node.id);
  for (const [i, entry] of committed) {             // leader completeness: it already holds every committed entry
    if (node.log.length < i || !sameEntry(node.log[i - 1], entry)) throw new Error("a new leader lacks a committed entry");
  }
  node.next = {}; node.match = {};
  for (let p = 0; p < N; p++) if (p !== node.id) { node.next[p] = node.log.length + 1; node.match[p] = 0; }
  node.log.push([node.term, null]);                 // a no-op, so earlier terms' entries can commit with it
  node.heartbeatDue = now;
}

function handle(now, node, src, msg) {
  const [kind, term] = msg;
  if (term > node.term) { node.term = term; node.voted = null; node.role = "follower"; }   // a newer term: become a follower
  if (kind === "vote?") {
    const [, , theirLastIndex, theirLastTerm] = msg;
    const mine = lastTerm(node);
    const upToDate = theirLastTerm > mine || (theirLastTerm === mine && theirLastIndex >= node.log.length);
    const granted = term === node.term && (node.voted === null || node.voted === src) && upToDate;
    if (granted) { node.voted = src; node.deadline = timeout(now); }
    send(now, node.id, src, ["vote", node.term, granted]);
  } else if (kind === "vote") {
    if (node.role === "candidate" && term === node.term && msg[2]) {
      node.votes.add(src);
      if (node.votes.size > Math.floor(N / 2)) becomeLeader(now, node);
    }
  } else if (kind === "append") {
    const [, , prev, prevTerm, entries, leaderCommit] = msg;
    if (term < node.term) { send(now, node.id, src, ["appended", node.term, false, 0]); return; }
    node.role = "follower"; node.deadline = timeout(now);   // there's a leader for this term
    if (prev > node.log.length) {                   // too short: tell the leader where this log ends
      send(now, node.id, src, ["appended", node.term, false, node.log.length + 1]);
      return;
    }
    if (prev > 0 && node.log[prev - 1][0] !== prevTerm) {
      let first = prev;                             // a conflict: skip back over the whole conflicting term at once
      while (first > 1 && node.log[first - 2][0] === node.log[prev - 1][0]) first--;
      send(now, node.id, src, ["appended", node.term, false, first]);
      return;
    }
    entries.forEach((entry, k) => {
      if (prev + k < node.log.length && node.log[prev + k][0] !== entry[0]) node.log.length = prev + k;   // the first conflict: drop it and everything after
      if (prev + k >= node.log.length) node.log.push(entry);
    });
    node.commit = Math.max(node.commit, Math.min(leaderCommit, prev + entries.length));
    send(now, node.id, src, ["appended", node.term, true, prev + entries.length]);
  } else if (kind === "appended" && node.role === "leader" && term === node.term) {
    if (msg[2]) {
      node.match[src] = Math.max(node.match[src], msg[3]);
      node.next[src] = node.match[src] + 1;
      for (let n = node.log.length; n > node.commit; n--) {   // the highest current-term entry on a majority
        if (node.log[n - 1][0] === node.term && 1 + Object.values(node.match).filter(m => m >= n).length > Math.floor(N / 2)) {
          node.commit = n;
          break;
        }
      }
    } else node.next[src] = Math.max(1, Math.min(node.next[src] - 1, msg[3]));   // back up, using the follower's hint
  }
}

let accepted = 0;
const stranded = new Set();                         // commands the cut-off leader accepted
for (let now = 0; now < 15000; now++) {
  if (now === 3000) {
    isolated = nodes.filter(n => n.role === "leader").reduce((best, n) => (best === null || n.term > best.term ? n : best), null).id;
  }
  for (const [, src, dst, msg] of net.filter(m => m[0] === now)) {
    if (connected(now, src, dst)) handle(now, nodes[dst], src, msg);
  }
  net = net.filter(m => m[0] > now);
  for (const node of nodes) {
    if (node.role === "leader" && now >= node.heartbeatDue) {
      node.heartbeatDue = now + 50;
      for (let p = 0; p < N; p++) {
        if (p === node.id) continue;
        const prev = node.next[p] - 1;
        send(now, node.id, p, ["append", node.term, prev, prev ? node.log[prev - 1][0] : 0, node.log.slice(prev), node.commit]);
      }
    } else if (node.role !== "leader" && now >= node.deadline) {
      node.term++; node.role = "candidate"; node.voted = node.id; node.votes = new Set([node.id]);
      node.deadline = timeout(now);
      for (let p = 0; p < N; p++) if (p !== node.id) send(now, node.id, p, ["vote?", node.term, node.log.length, lastTerm(node)]);
    }
  }
  if (now % 50 === 25 && now < 13000) {
    for (const node of nodes) {
      if (node.role !== "leader") continue;         // each client talks to whichever node says it's the leader
      accepted++;
      node.log.push([node.term, `c${accepted}`]);
      if (node.id === isolated && now >= 3000 && now < 6000) stranded.add(`c${accepted}`);
    }
  }
  for (const node of nodes) {
    for (let i = 1; i <= node.commit; i++) {        // a committed entry must never change, on any node
      if (!committed.has(i)) committed.set(i, node.log[i - 1]);
      if (!sameEntry(committed.get(i), node.log[i - 1])) throw new Error("a committed entry changed");
    }
  }
}

if (![...leaders.values()].every(ids => ids.size === 1)) throw new Error("two leaders in one term");
const logs = new Set(nodes.map(n => JSON.stringify(n.log.slice(0, n.commit))));
if (logs.size !== 1 || new Set(nodes.map(n => n.commit)).size !== 1) throw new Error("the nodes disagree after healing");
const commands = nodes[0].log.slice(0, nodes[0].commit).map(([, cmd]) => cmd).filter(Boolean);
console.log(`terms: ${Math.max(...nodes.map(n => n.term))} | leaders elected: ${leaders.size} | commands accepted: ${accepted}, ` +
            `committed: ${commands.length}, never committed: ${accepted - commands.length}`);
const inLog = new Set(nodes[isolated].log.map(([, cmd]) => cmd));
const gone = [...stranded].every(c => !commands.includes(c) && !inLog.has(c));
if (!(stranded.size > 0 && gone)) throw new Error("the deposed leader's entries survived");
console.log(`one leader per term: yes | committed entries identical on all ${N} nodes: yes | ` +
            `the ${stranded.size} commands cut-off leader ${isolated} accepted: never committed, now gone: ${gone ? "yes" : "no"}`);
console.log("raft lab OK");
```

Output:
```text
terms: 18 | leaders elected: 3 | commands accepted: 314, committed: 253, never committed: 61
one leader per term: yes | committed entries identical on all 5 nodes: yes | the 60 commands cut-off leader 1 accepted: never committed, now gone: yes
raft lab OK
```

</details>
