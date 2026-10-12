---
title: "A decision log that checks itself: ADRs, trade-offs and sensitivity points"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l4, lab]
status: new
created: 2026-10-12
updated: 2026-10-12
---
# Lab: A decision log that checks itself: ADRs, trade-offs and sensitivity points

> System Design L4 · about 75 min · modules m01

Keep architecture decisions the way good teams do, as numbered markdown files in the repository, and write the tool that checks them. It parses each ADR's status, dates, sections and decision matrix, finds the problems a reviewer would (gaps in the numbering, broken supersedes links, overdue reviews, missing sections, decisions the matrix doesn't support), and for each matrix finds the smallest change to one weight that would let a rival option overtake the decision.

## Before you start
- Python 3.12+ and Node.js 22.13+, standard libraries only
- Read module 1

## Steps
1. Write six ADRs as markdown into a temporary folder: a title line, headers (Status, Date, Review, Supersedes), and sections (Context, Drivers, Options, Decision, Consequences).
2. Parse each file into its number, title, headers and sections; parse the drivers (name: weight) and the options (name: driver score, …).
3. Check the log: every number from 1 to the highest exists, a superseded ADR points to one that exists and names it back, accepted ADRs aren't past their review date, and the required sections are there.
4. For each matrix, compute the weighted totals, check that the decision is the winner, and search changes of ±1, ±2 and ±3 to one weight at a time for the smallest one that lets a rival score higher.
5. Print the index, the trade-off findings and the problems, and clean up the folder.

## Prove it worked
- All six ADRs parse, and the index shows each one's status.
- Five problems are found: a numbering gap, an overdue review, a missing section, a decision the matrix doesn't support, and a link to an ADR that doesn't exist.
- ADR-004 is flagged as sensitive (consistency's weight rising by 2 flips it), while ADR-002 survives any single change of up to 3.

## Break it (then fix it)
- Change ADR-004's decision to PostgreSQL and watch the finding move from the trade-offs to the problems.
- Add ADR-009 superseding ADR-007, and check that the problem disappears only when ADR-009 says Supersedes: ADR-007.
- Let flip count a tie as a flip, and explain why the result then depends on the order the options are listed in.

## Starter code
```python
import os, shutil, tempfile

ADRS = {}                                       # TODO: six ADR files as markdown strings, with a few deliberate problems

def parse(text): ...                            # TODO: number, title, headers and sections
def matrix(adr): ...                            # TODO: drivers {name: weight}, options [(name, {driver: score})]
def winner(drivers, options): ...               # TODO: the highest weighted total, ties to the first listed
def flip(drivers, options): ...                 # TODO: the smallest one-weight change that lets a rival overtake
def check(folder): ...                          # TODO: the log checks, then the trade-off checks
```

```javascript
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

const ADRS = {};                                // TODO: six ADR files as markdown strings, with a few deliberate problems
function parse(text) { /* TODO: number, title, headers and sections */ }
function matrix(adr) { /* TODO: drivers {name: weight}, options [[name, {driver: score}]] */ }
function winner(drivers, options) { /* TODO: the highest weighted total, ties to the first listed */ }
function flip(drivers, options) { /* TODO: the smallest one-weight change that lets a rival overtake */ }
function check(folder) { /* TODO: the log checks, then the trade-off checks */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""An architecture decision log kept as files: parse the ADRs, check the log, and test each decision's trade-offs."""
import os
import shutil
import tempfile

TODAY = "2026-10-12"
REQUIRED = ["Context", "Decision", "Consequences"]
ADRS = {
    "0001-order-database.md": """# ADR-001: Use PostgreSQL for the order service
Status: superseded by ADR-004
Date: 2024-03-02

## Context
Orders need transactions across order lines and payments.
## Decision
PostgreSQL
## Consequences
One primary per region; vertical scaling until we shard.
""",
    "0002-order-events.md": """# ADR-002: Publish order events through an outbox
Status: accepted
Date: 2024-05-10
Review: 2026-03-01

## Context
Events were lost when the service crashed between the commit and the publish.
## Drivers
- reliability: 5
- effort: 2
## Options
- Outbox and relay: reliability 5, effort 3
- Publish after commit: reliability 2, effort 5
- Two-phase commit: reliability 5, effort 1
## Decision
Outbox and relay
## Consequences
Consumers must be idempotent; events can arrive twice.
""",
    "0003-product-pages.md": """# ADR-003: Cache product pages at the CDN
Status: proposed
Date: 2026-09-20

## Context
Product pages are 70% of traffic and change a few times a day.
## Decision
Cache for 5 minutes and purge on change
""",
    "0004-order-database-v2.md": """# ADR-004: Move orders to DynamoDB
Status: accepted
Date: 2026-02-14
Supersedes: ADR-001
Review: 2027-02-14

## Context
Orders grew ten times; the primary is at its largest size.
## Drivers
- consistency: 3
- operations effort: 4
- cost at scale: 3
## Options
- PostgreSQL: consistency 5, operations effort 3, cost at scale 4
- DynamoDB: consistency 3, operations effort 5, cost at scale 4
- Sharded PostgreSQL: consistency 4, operations effort 1, cost at scale 3
## Decision
DynamoDB
## Consequences
Access patterns must be designed up front; transactions are limited to small sets of items.
""",
    "0005-kafka-clusters.md": """# ADR-005: Run one Kafka cluster per region
Status: accepted
Date: 2026-04-01
Review: 2027-04-01

## Context
Teams in three regions publish events; cross-region traffic is expensive.
## Drivers
- latency: 3
- cost: 4
- operations effort: 3
## Options
- One global cluster: latency 2, cost 4, operations effort 5
- One cluster per region: latency 5, cost 3, operations effort 2
## Decision
One cluster per region
## Consequences
Cross-region consumers read from replicated topics.
""",
    "0007-feature-flags.md": """# ADR-007: Buy a feature-flag service
Status: superseded by ADR-009
Date: 2026-06-30

## Context
Releases are blocked behind deploys.
## Decision
Buy rather than build
## Consequences
A new vendor dependency on the request path; flags are evaluated locally from a cached copy.
""",
}

def parse(text):
    lines = text.splitlines()
    number, title = lines[0][2:].split(": ", 1)
    adr = {"number": int(number[4:]), "title": title, "headers": {}, "sections": {}}
    section = None
    for line in lines[1:]:
        if line.startswith("## "):
            section = line[3:]
            adr["sections"][section] = []
        elif section:
            if line.strip():
                adr["sections"][section].append(line)
        elif ": " in line:
            key, value = line.split(": ", 1)
            adr["headers"][key] = value
    return adr

def matrix(adr):                                   # drivers {name: weight} and options [(name, {driver: score})]
    drivers = {}
    for line in adr["sections"].get("Drivers", []):
        name, weight = line[2:].split(": ")
        drivers[name] = int(weight)
    options = []
    for line in adr["sections"].get("Options", []):
        name, scores = line[2:].split(": ", 1)
        options.append((name, {s.rsplit(" ", 1)[0]: int(s.rsplit(" ", 1)[1]) for s in scores.split(", ")}))
    return drivers, options

def totals(drivers, options):
    return [(name, sum(w * scores[d] for d, w in drivers.items())) for name, scores in options]

def winner(drivers, options):                      # the highest weighted total; ties go to the option listed first
    scored = totals(drivers, options)
    best = max(t for _, t in scored)
    return next((name, t) for name, t in scored if t == best)

def flip(drivers, options):                        # the smallest change to one weight that lets a rival overtake
    first, _ = winner(drivers, options)
    for size in (1, 2, 3):
        for driver in drivers:
            for delta in (size, -size):
                changed = dict(drivers, **{driver: drivers[driver] + delta})
                if changed[driver] < 0:
                    continue
                scored = dict(totals(changed, options))
                rival = winner(changed, options)[0]
                if scored[rival] > scored[first]:
                    return driver, delta, rival
    return None

def check(folder):
    adrs = []
    for name in sorted(os.listdir(folder)):
        with open(os.path.join(folder, name)) as f:
            adrs.append(parse(f.read()))
    by_number = {a["number"]: a for a in adrs}
    problems, tradeoffs = [], []
    for n in range(1, max(by_number) + 1):
        if n not in by_number:
            problems.append(f"ADR-{n:03d}: missing from the log (numbers are never reused)")
    for a in adrs:
        tag, status = f"ADR-{a['number']:03d}", a["headers"].get("Status", "")
        for section in REQUIRED:
            if section not in a["sections"]:
                problems.append(f"{tag}: no {section} section")
        if status.startswith("superseded by ADR-"):
            newer = by_number.get(int(status[-3:]))
            if newer is None:
                problems.append(f"{tag}: superseded by {status[-7:]}, which doesn't exist")
            elif newer["headers"].get("Supersedes") != tag:
                problems.append(f"{tag}: {status[-7:]} doesn't say it supersedes {tag}")
        if status == "accepted" and a["headers"].get("Review", "9999") < TODAY:
            problems.append(f"{tag}: review was due on {a['headers']['Review']}")
        drivers, options = matrix(a)
        if not options:
            continue
        best, top = winner(drivers, options)
        chosen = a["sections"]["Decision"][0]
        if chosen != best:
            problems.append(f"{tag}: decided {chosen}, but the matrix favours {best}; record why")
            continue
        runner = max((t, n) for n, t in totals(drivers, options) if n != best)
        f = flip(drivers, options)
        if f:
            change = f"rises by {f[1]}" if f[1] > 0 else f"falls by {-f[1]}"
            tradeoffs.append(f"{tag}: {best} wins ({top} against {runner[1]}'s {runner[0]}), "
                             f"but {f[2]} overtakes it if {f[0]}'s weight {change}")
        else:
            tradeoffs.append(f"{tag}: {best} wins ({top} against {runner[1]}'s {runner[0]}); "
                             "no single weight change of up to 3 alters that")
    return adrs, problems, tradeoffs

folder = tempfile.mkdtemp(prefix="adr-")
try:
    for name, text in ADRS.items():
        with open(os.path.join(folder, name), "w") as f:
            f.write(text)
    adrs, problems, tradeoffs = check(folder)
    for a in adrs:
        print(f"ADR-{a['number']:03d} {a['title']}: {a['headers']['Status']}")
    print("trade-offs:")
    for line in tradeoffs:
        print("  " + line)
    print(f"{len(problems)} problems:")
    for line in problems:
        print("  " + line)
finally:
    shutil.rmtree(folder)

assert len(adrs) == 6 and sum("missing from the log" in p for p in problems) == 1
assert flip({"a": 1}, [("x", {"a": 2}), ("y", {"a": 1})]) is None   # one driver: weights can't flip the order
print("decisions lab OK")
```

Output:
```text
ADR-001 Use PostgreSQL for the order service: superseded by ADR-004
ADR-002 Publish order events through an outbox: accepted
ADR-003 Cache product pages at the CDN: proposed
ADR-004 Move orders to DynamoDB: accepted
ADR-005 Run one Kafka cluster per region: accepted
ADR-007 Buy a feature-flag service: superseded by ADR-009
trade-offs:
  ADR-002: Outbox and relay wins (31 against Two-phase commit's 27); no single weight change of up to 3 alters that
  ADR-004: DynamoDB wins (41 against PostgreSQL's 39), but PostgreSQL overtakes it if consistency's weight rises by 2
5 problems:
  ADR-006: missing from the log (numbers are never reused)
  ADR-002: review was due on 2026-03-01
  ADR-003: no Consequences section
  ADR-005: decided One cluster per region, but the matrix favours One global cluster; record why
  ADR-007: superseded by ADR-009, which doesn't exist
decisions lab OK
```

```javascript
// An architecture decision log kept as files: parse the ADRs, check the log, and test each decision's trade-offs.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TODAY = "2026-10-12";
const REQUIRED = ["Context", "Decision", "Consequences"];
const ADRS = {
  "0001-order-database.md": `# ADR-001: Use PostgreSQL for the order service
Status: superseded by ADR-004
Date: 2024-03-02

## Context
Orders need transactions across order lines and payments.
## Decision
PostgreSQL
## Consequences
One primary per region; vertical scaling until we shard.
`,
  "0002-order-events.md": `# ADR-002: Publish order events through an outbox
Status: accepted
Date: 2024-05-10
Review: 2026-03-01

## Context
Events were lost when the service crashed between the commit and the publish.
## Drivers
- reliability: 5
- effort: 2
## Options
- Outbox and relay: reliability 5, effort 3
- Publish after commit: reliability 2, effort 5
- Two-phase commit: reliability 5, effort 1
## Decision
Outbox and relay
## Consequences
Consumers must be idempotent; events can arrive twice.
`,
  "0003-product-pages.md": `# ADR-003: Cache product pages at the CDN
Status: proposed
Date: 2026-09-20

## Context
Product pages are 70% of traffic and change a few times a day.
## Decision
Cache for 5 minutes and purge on change
`,
  "0004-order-database-v2.md": `# ADR-004: Move orders to DynamoDB
Status: accepted
Date: 2026-02-14
Supersedes: ADR-001
Review: 2027-02-14

## Context
Orders grew ten times; the primary is at its largest size.
## Drivers
- consistency: 3
- operations effort: 4
- cost at scale: 3
## Options
- PostgreSQL: consistency 5, operations effort 3, cost at scale 4
- DynamoDB: consistency 3, operations effort 5, cost at scale 4
- Sharded PostgreSQL: consistency 4, operations effort 1, cost at scale 3
## Decision
DynamoDB
## Consequences
Access patterns must be designed up front; transactions are limited to small sets of items.
`,
  "0005-kafka-clusters.md": `# ADR-005: Run one Kafka cluster per region
Status: accepted
Date: 2026-04-01
Review: 2027-04-01

## Context
Teams in three regions publish events; cross-region traffic is expensive.
## Drivers
- latency: 3
- cost: 4
- operations effort: 3
## Options
- One global cluster: latency 2, cost 4, operations effort 5
- One cluster per region: latency 5, cost 3, operations effort 2
## Decision
One cluster per region
## Consequences
Cross-region consumers read from replicated topics.
`,
  "0007-feature-flags.md": `# ADR-007: Buy a feature-flag service
Status: superseded by ADR-009
Date: 2026-06-30

## Context
Releases are blocked behind deploys.
## Decision
Buy rather than build
## Consequences
A new vendor dependency on the request path; flags are evaluated locally from a cached copy.
`,
};

function parse(text) {
  const lines = text.split("\n");
  const [number, title] = splitOnce(lines[0].slice(2), ": ");
  const adr = { number: Number(number.slice(4)), title, headers: {}, sections: {} };
  let section = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith("## ")) {
      section = line.slice(3);
      adr.sections[section] = [];
    } else if (section) {
      if (line.trim()) adr.sections[section].push(line);
    } else if (line.includes(": ")) {
      const [key, value] = splitOnce(line, ": ");
      adr.headers[key] = value;
    }
  }
  return adr;
}

function splitOnce(text, separator) {
  const i = text.indexOf(separator);
  return [text.slice(0, i), text.slice(i + separator.length)];
}

function matrix(adr) {                                 // drivers {name: weight} and options [[name, {driver: score}]]
  const drivers = {};
  for (const line of adr.sections.Drivers ?? []) {
    const [name, weight] = splitOnce(line.slice(2), ": ");
    drivers[name] = Number(weight);
  }
  const options = [];
  for (const line of adr.sections.Options ?? []) {
    const [name, scores] = splitOnce(line.slice(2), ": ");
    const parsed = {};
    for (const s of scores.split(", ")) {
      const i = s.lastIndexOf(" ");
      parsed[s.slice(0, i)] = Number(s.slice(i + 1));
    }
    options.push([name, parsed]);
  }
  return [drivers, options];
}

function totals(drivers, options) {
  return options.map(([name, scores]) => [name, Object.entries(drivers).reduce((sum, [d, w]) => sum + w * scores[d], 0)]);
}

function winner(drivers, options) {                    // the highest weighted total; ties go to the option listed first
  const scored = totals(drivers, options);
  const best = Math.max(...scored.map(([, t]) => t));
  return scored.find(([, t]) => t === best);
}

function flip(drivers, options) {                      // the smallest change to one weight that lets a rival overtake
  const [first] = winner(drivers, options);
  for (const size of [1, 2, 3]) {
    for (const driver of Object.keys(drivers)) {
      for (const delta of [size, -size]) {
        const changed = { ...drivers, [driver]: drivers[driver] + delta };
        if (changed[driver] < 0) continue;
        const scored = Object.fromEntries(totals(changed, options));
        const [rival] = winner(changed, options);
        if (scored[rival] > scored[first]) return [driver, delta, rival];
      }
    }
  }
  return null;
}

const tagOf = n => `ADR-${String(n).padStart(3, "0")}`;

function check(folder) {
  const adrs = fs.readdirSync(folder).sort().map(name => parse(fs.readFileSync(path.join(folder, name), "utf8")));
  const byNumber = new Map(adrs.map(a => [a.number, a]));
  const problems = [], tradeoffs = [];
  for (let n = 1; n <= Math.max(...byNumber.keys()); n++) {
    if (!byNumber.has(n)) problems.push(`${tagOf(n)}: missing from the log (numbers are never reused)`);
  }
  for (const a of adrs) {
    const tag = tagOf(a.number), status = a.headers.Status ?? "";
    for (const section of REQUIRED) if (!(section in a.sections)) problems.push(`${tag}: no ${section} section`);
    if (status.startsWith("superseded by ADR-")) {
      const newer = byNumber.get(Number(status.slice(-3)));
      if (!newer) problems.push(`${tag}: superseded by ${status.slice(-7)}, which doesn't exist`);
      else if (newer.headers.Supersedes !== tag) problems.push(`${tag}: ${status.slice(-7)} doesn't say it supersedes ${tag}`);
    }
    if (status === "accepted" && (a.headers.Review ?? "9999") < TODAY) problems.push(`${tag}: review was due on ${a.headers.Review}`);
    const [drivers, options] = matrix(a);
    if (!options.length) continue;
    const [best, top] = winner(drivers, options);
    const chosen = a.sections.Decision[0];
    if (chosen !== best) {
      problems.push(`${tag}: decided ${chosen}, but the matrix favours ${best}; record why`);
      continue;
    }
    let runner = null;
    for (const [n, t] of totals(drivers, options)) {
      if (n !== best && (runner === null || t > runner[0] || (t === runner[0] && n > runner[1]))) runner = [t, n];
    }
    const f = flip(drivers, options);
    if (f) {
      const change = f[1] > 0 ? `rises by ${f[1]}` : `falls by ${-f[1]}`;
      tradeoffs.push(`${tag}: ${best} wins (${top} against ${runner[1]}'s ${runner[0]}), but ${f[2]} overtakes it if ${f[0]}'s weight ${change}`);
    } else {
      tradeoffs.push(`${tag}: ${best} wins (${top} against ${runner[1]}'s ${runner[0]}); no single weight change of up to 3 alters that`);
    }
  }
  return [adrs, problems, tradeoffs];
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "adr-"));
let adrs, problems, tradeoffs;
try {
  for (const [name, text] of Object.entries(ADRS)) fs.writeFileSync(path.join(folder, name), text);
  [adrs, problems, tradeoffs] = check(folder);
  for (const a of adrs) console.log(`${tagOf(a.number)} ${a.title}: ${a.headers.Status}`);
  console.log("trade-offs:");
  for (const line of tradeoffs) console.log("  " + line);
  console.log(`${problems.length} problems:`);
  for (const line of problems) console.log("  " + line);
} finally {
  fs.rmSync(folder, { recursive: true });
}

if (adrs.length !== 6 || problems.filter(p => p.includes("missing from the log")).length !== 1) throw new Error("log checks");
if (flip({ a: 1 }, [["x", { a: 2 }], ["y", { a: 1 }]]) !== null) throw new Error("flip");   // one driver: weights can't flip the order
console.log("decisions lab OK");
```

Output:
```text
ADR-001 Use PostgreSQL for the order service: superseded by ADR-004
ADR-002 Publish order events through an outbox: accepted
ADR-003 Cache product pages at the CDN: proposed
ADR-004 Move orders to DynamoDB: accepted
ADR-005 Run one Kafka cluster per region: accepted
ADR-007 Buy a feature-flag service: superseded by ADR-009
trade-offs:
  ADR-002: Outbox and relay wins (31 against Two-phase commit's 27); no single weight change of up to 3 alters that
  ADR-004: DynamoDB wins (41 against PostgreSQL's 39), but PostgreSQL overtakes it if consistency's weight rises by 2
5 problems:
  ADR-006: missing from the log (numbers are never reused)
  ADR-002: review was due on 2026-03-01
  ADR-003: no Consequences section
  ADR-005: decided One cluster per region, but the matrix favours One global cluster; record why
  ADR-007: superseded by ADR-009, which doesn't exist
decisions lab OK
```

</details>
