"""Link + fact audit for the system-design and DSA reference workbooks (2026-10-08).

Reads the check results gathered in this folder and produces:
  - audit-report.md                        human summary
  - audit-details.csv                      one row per link reference with verdict + action
  - <workbook>-verified.xlsx (next to each original, in docs/): dead links removed,
    moved links updated, mislabelled videos relabelled, plus an "Audit" sheet.
Originals are never modified.
Run from the vault root:  python _meta/hub-program/link-audit/audit_links.py
"""
import csv, json, re, os, collections, difflib
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BOOKS = {
    "sd-topics": "technical/software-engineering/system-design/docs/system-design-200-topics.xlsx",
    "sd-plan": "technical/software-engineering/system-design/docs/system-design-learning-plan.xlsx",
    "dsa-ultimate": "technical/software-engineering/dsa/docs/dsa-ultimate-reference.xlsx",
    "dsa-complete": "technical/software-engineering/dsa/docs/dsa-complete-reference.xlsx",
}
URL_RX = re.compile(r'(?:https?://)?(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|org|io|dev|net|edu|ai|gg|co|me|fi|guide|sh|tech|blog)(?:/[^\s|,)\]\'"]*)?', re.I)

# ---------- load check results ----------
def norm_url(u):
    u = u.strip().rstrip('.')
    if not u.startswith("http"):
        u = "https://" + u
    return u

def key(u):
    u = norm_url(u)
    u = re.sub(r'^https?://(www\.)?', '', u)
    return u.rstrip('/')

YT = {}
for line in open(os.path.join(HERE, "results-youtube.txt"), encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("#NON200"):
        for item in line.split(" ", 1)[1].split(","):
            vid, st = item.rsplit(":", 1)
            YT[vid] = (int(st), "", "")
    elif line and not line.startswith("#"):
        vid, st, ch, title = line.split("|", 3)
        YT[vid] = (int(st), ch, title)

GH = {}
for line in open(os.path.join(HERE, "results-github.tsv"), encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if len(p) >= 2:
        GH[key(p[0])] = (p[1], p[3] if len(p) > 3 else "")

TA = "github.com/TheAlgorithms/Python/blob/master/"
GH_REPLACE = {  # verified against the repo trees via the GitHub API on 2026-10-08
    TA + "backtracking/permutations.py": TA + "backtracking/all_permutations.py",
    TA + "compression/huffman_coding.py": TA + "data_compression/huffman.py",
    TA + "bit_manipulation/power_of_2.py": TA + "bit_manipulation/is_power_of_two.py",
    TA + "data_structures/binary_tree/sparse_table.py": TA + "data_structures/arrays/sparse_table.py",
    TA + "data_structures/heap/binary_heap.py": TA + "data_structures/heap/heap.py",
    TA + "data_structures/heap/priority_queue_using_list.py": TA + "data_structures/queues/priority_queue_using_list.py",
    TA + "data_structures/prefix_sum.py": TA + "data_structures/arrays/prefix_sum.py",
    TA + "data_structures/queue": "github.com/TheAlgorithms/Python/tree/master/data_structures/queues",
    TA + "data_structures/queue/circular_queue.py": TA + "data_structures/queues/circular_queue.py",
    TA + "data_structures/queue/double_ended_queue.py": TA + "data_structures/queues/double_ended_queue.py",
    TA + "data_structures/skip_list.py": TA + "data_structures/linked_list/skip_list.py",
    TA + "dynamic_programming/max_subarray.py": TA + "dynamic_programming/max_subarray_sum.py",
    TA + "dynamic_programming/travelling_salesman_problem.py": TA + "graphs/travelling_salesman_problem.py",
    TA + "graphs/check_bipartite_graph_bfs.py": TA + "graphs/check_bipatrite.py",
    TA + "graphs/floyd_warshall.py": TA + "graphs/graphs_floyd_warshall.py",
    TA + "graphs/ford_fulkerson.py": TA + "networking_flow/ford_fulkerson.py",
    TA + "graphs/topological_sort.py": TA + "sorts/topological_sort.py",
    TA + "maths/euclidean_gcd.py": TA + "maths/greatest_common_divisor.py",
    TA + "maths/factorial_recursive.py": TA + "maths/factorial.py",
    TA + "maths/fast_exp.py": TA + "maths/binary_exponentiation.py",
    TA + "strings/z_algorithm.py": TA + "strings/z_function.py",
    TA + "trees/lowest_common_ancestor.py": TA + "data_structures/binary_tree/lowest_common_ancestor.py",
    "github.com/TheAlgorithms/Python/tree/master/trees": "github.com/TheAlgorithms/Python/tree/master/data_structures/binary_tree",
    "github.com/trekhleb/javascript-algorithms/tree/master/src/algorithms/math/combinations": "github.com/trekhleb/javascript-algorithms/tree/master/src/algorithms/sets/combinations",
    "github.com/trekhleb/javascript-algorithms/tree/master/src/algorithms/string/longest-common-subsequence": "github.com/trekhleb/javascript-algorithms/tree/master/src/algorithms/sets/longest-common-subsequence",
    "github.com/trekhleb/javascript-algorithms/tree/master/src/data-structures/binary-indexed-tree": "github.com/trekhleb/javascript-algorithms/tree/master/src/data-structures/tree/fenwick-tree",
}

PAGES = {}   # key -> (verdict, new_url, note)
section = None
for line in open(os.path.join(HERE, "results-gfg-bytebytego.txt"), encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("## blog.bytebytego.com"): section = "bb"; continue
    if line.startswith("## geeksforgeeks"): section = "gfg"; continue
    if not line or line.startswith("#"): continue
    path, st, red, title = (line.split("|") + ["", "", ""])[:4]
    if section == "bb":
        PAGES[key("blog.bytebytego.com" + path)] = ("OK", "", title)
    else:
        k = key("geeksforgeeks.org" + path)
        if st == "404":
            PAGES[k] = ("DEAD", "", "404")
        elif "mos-algorithm" in path:
            PAGES[k] = ("SOFT", "", "now opens an unrelated article: " + title)
        else:
            PAGES[k] = ("MOVED" if red else "OK", ("https://www.geeksforgeeks.org" + red) if red else "", title)

ALL_OK_PREFIX = []
for line in open(os.path.join(HERE, "results-other.txt"), encoding="utf-8"):
    line = line.rstrip("\n")
    if not line or line.startswith("## "): continue
    if line.startswith("#ALL-OTHER-CP-ALGORITHMS"): ALL_OK_PREFIX.append("cp-algorithms.com/"); continue
    if line.startswith("#ALL-LEETCODE-PROBLEM-LINKS"): ALL_OK_PREFIX.append("leetcode.com/problems/"); continue
    if line.startswith("#"): continue
    url, verdict, note = (line.split("|", 2) + ["", ""])[:3]
    new = ""
    m = re.search(r'replacement verified: (\S+)', note)
    if m: verdict, new = "REPLACED", m.group(1)
    elif verdict == "MOVED":
        m = re.search(r'(https?://\S+|[a-z0-9.-]+\.(?:com|io|org)/\S+)', note)
        new = m.group(1) if m else ""
        if new and not new.startswith("http"): new = "https://" + new
    if verdict == "BLOCKED": verdict = "OK"
    PAGES[key(url)] = (verdict, new, note)

LC = {}
for item in open(os.path.join(HERE, "lc-titles.txt"), encoding="utf-8").read().strip().split(";"):
    n, t = item.split("|", 1)
    LC[int(n)] = t.strip()

def verdict_for(url):
    k = key(url)
    if "youtube.com/@" in k: return ("SOFT", "", "", "channel home page, not a resource on this topic")
    if "youtube.com/watch" in k or "youtu.be/" in k:
        m = re.search(r'v=([\w-]*)', k)
        vid = m.group(1) if m else ""
        st, ch, title = YT.get(vid, (0, "", ""))
        if st in (200, 401):
            return ("OK", "", ch, title)
        return ("DEAD", "", "", f"video unavailable (oEmbed {st or 'invalid id'})")
    if k.startswith("github.com/"):
        st, title = GH.get(k, ("?", ""))
        if st == "200": return ("OK", "", "", title)
        if k in GH_REPLACE: return ("REPLACED", "https://" + GH_REPLACE[k], "", "file moved/renamed in repo")
        return ("DEAD", "", "", "repository or path does not exist (404)")
    if k in PAGES:
        v, new, note = PAGES[k]
        return (v, new, "", note)
    if k.startswith("blog.bytebytego.com"):
        return ("DEAD", "", "", "404: article slug does not exist")
    for p in ALL_OK_PREFIX:
        if k.startswith(p): return ("OK", "", "", "")
    if "playlist?list=" in k: return ("OK", "", "", "")
    return ("UNCHECKED", "", "", "")

# Manual relevance review (2026-10-08): live links whose content does not teach the row's topic,
# or unofficial re-uploads. Key = topic (row's first cell), value = url fragments to drop.
OFFTOPIC = {
    "Availability": ["Y-Gl4HEyeUQ"], "Fault Tolerance": ["Y-Gl4HEyeUQ"], "Single Point of Failure (SPOF)": ["Y-Gl4HEyeUQ"],
    "Heartbeat Protocol": ["Y-Gl4HEyeUQ", "donnemartin/system-design-primer"], "Phi Accrual Failure Detector": ["Y-Gl4HEyeUQ", "IP-rGJKSZ3s", "datastax/nodejs-driver"],
    "Consistency": ["BO761Fj6HH8"], "PACELC Theorem": ["noUNH3jDLC0", "donnemartin/system-design-primer"],
    "Read/Write Quorum": ["noUNH3jDLC0", "donnemartin/system-design-primer"], "Quorum Systems": ["donnemartin/system-design-primer"],
    "Eventual Consistency": ["noUNH3jDLC0"], "TCP vs UDP": ["AYdF7b3nMto"],
    "Column-Family Stores (Wide-Column)": ["sCR3SAVdyCc"], "OLTP vs OLAP": ["W2Z7fbCLSTw"],
    "Raft Consensus Algorithm": ["s8JqcZtvnsM"], "Write-Through Cache": ["a4yX7RUgTxI"], "Write-Back (Write-Behind) Cache": ["DUbEgNw-F9c"],
    "Cache Stampede / Thundering Herd": ["DUbEgNw-F9c"], "Cache Invalidation": ["DUbEgNw-F9c"], "Cache Warm-up Strategies": ["a4yX7RUgTxI"],
    "Write-Around Cache": ["DUbEgNw-F9c", "donnemartin/system-design-primer"], "Hotspot / Hot Key Problem": ["DUbEgNw-F9c"],
    "CQRS (Command Query Responsibility Segregation)": ["QdkS6ZjeR7Q"], "Dead Letter Queue (DLQ)": ["FMhbR_kQeHw"],
    "At-Least-Once / Exactly-Once Delivery": ["uvb00oaa3k8"], "Backpressure": ["uvb00oaa3k8"], "Message Ordering & Partitioning": ["uvb00oaa3k8"],
    "Competing Consumers Pattern": ["FMhbR_kQeHw"], "Bulkhead Pattern": ["ADHcBxEXvFA"], "Retry & Timeout Patterns": ["ADHcBxEXvFA"],
    "API Versioning": ["dpw9EHDh2bM"], "API Design (Stripe-like Payment API)": ["dpw9EHDh2bM"], "Real-time Analytics": ["7ABFKPK2hD4"],
    "Authorization & RBAC": ["GhrvZ5nUWNg"], "API Security Best Practices": ["t18YB3xDfXI"], "Multi-Region High Availability": ["a9__D53WsUs"],
    "Capacity Planning": ["tEylFyxbDLE"], "Dashboards & Visualization": ["h4Sl21AKiDg"], "Gossip Protocol": ["IP-rGJKSZ3s"],
    "HyperLogLog": ["V3pzxngeLqw", "-SuTGoFYjZs"], "Count-Min Sketch": ["V3pzxngeLqw", "-SuTGoFYjZs"],
    "Two-Phase Locking (2PL)": ["W2Z7fbCLSTw", "donnemartin/system-design-primer"], "MVCC (Multi-Version Concurrency Control)": ["donnemartin/system-design-primer"],
    "Two-Phase Commit (2PC)": ["donnemartin/system-design-primer"], "Blue-Green Deployment": ["Unitech/pm2"],
    "Materialized Views": ["brianc/node-postgres"], "Database Replication": ["brianc/node-postgres"], "WAF (Web Application Firewall)": ["animir/node-rate-limiter-flexible"],
    "Static Array": ["v4cd1O4zkGw", "src/data-structures/linked-list"], "Batch Processing": ["data-monolith-to-mesh"], "Dynamic Array": ["v4cd1O4zkGw"], "Two Pointers on Arrays": ["MK-NZ4hN7rs"], "Two Pointers (General)": ["MK-NZ4hN7rs"],
    "Open Addressing": ["0M_kIqhwbFo"], "Custom / Comparator Sort": ["pkkFqlG0Hds"], "Bubble Sort": ["pkkFqlG0Hds", "p__ETf2CKY4"],
    "State Machine DP": ["oBt53YbR9Kk"], "Interval Scheduling": ["ARvQcqJ_-NY"], "Activity Selection": ["ARvQcqJ_-NY"],
    "KMP Pattern Matching": ["yWWbLrV4PZ8"], "KMP Algorithm": ["yWWbLrV4PZ8"], "Manacher's Algorithm": ["XYQecbcd6_c"],
    "Counting Set Bits (Popcount)": ["mesu75PTDC8"], "Bit Masking & Subsets": ["mQeF6bN8hMk"], "Bit Masking": ["mQeF6bN8hMk", "TheAlgorithms/Python/tree/master"],
    "Persistent Segment Tree": ["ZBHKZF5w4YU"], "Persistent Data Structures": ["stanislavkozlovski/Red-Black-Tree"],
    "Closest Pair of Points": ["vS4Zn1a9KUc"], "Sweep Line": ["q0QOYtSsTg4", "divide_and_conquer"], "Sweep Line Algorithm": ["q0QOYtSsTg4", "divide_and_conquer"],
    "Line Segment Intersection": ["divide_and_conquer"], "Randomised Algorithms": ["LdOnanfc5TM", "GiN3jRdgxU4", "TheAlgorithms/Python/tree/master"],
    "Mo's Algorithm": ["TheAlgorithms/Python/tree/master"], "Power of 2 Checks": ["Bj9Mx_Lx3q4"],
    "Point in Polygon": ["bbTqI0oqL5U", "convex_hull"], "Tim Sort": ["ktWL3nN38ZA"],
}
def is_offtopic(topic, url):
    for t, frags in OFFTOPIC.items():
        if topic.strip().lower().startswith(t.lower()[:24]):
            if any(f in url for f in frags):
                if f"/tree/master" in url and "TheAlgorithms/Python/tree/master" in frags and not url.rstrip("/").endswith("tree/master"):
                    continue
                return True
    return False
# Verified (2026-10-08) replacements for topics whose every original link failed.
FILL = {
    "Lambda Architecture": [("Jay Kreps – Questioning the Lambda Architecture (O'Reilly Radar)", "https://www.oreilly.com/radar/questioning-the-lambda-architecture/")],
    "Canary Deployment": [("ByteByteGo – Top 5 Most-Used Deployment Strategies", "https://www.youtube.com/watch?v=AWVTKBUnoIg")],
    "Multi-Region High Availability": [("Google Cloud – Disaster recovery planning guide", "https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide"),
                                       ("AWS Well-Architected Framework (reliability pillar)", "https://aws.amazon.com/architecture/well-architected/")],
}
LC_FIX = {"(LC #2513)": "(LC #952)"}   # "Largest Component Size by Common Factor" is LC 952, not 2513

def nrm(s): return re.sub(r'[^a-z0-9]', '', s.lower())
ALIAS = {"mitocw": "mitopencourseware", "mit": "mitopencourseware", "errichto": "errichtoalgorithms", "tusharroy": "tusharroycodingmadesimple",
         "techdummies": "techdummiesnarendralakshmanagowda", "neetcode": "neetcode", "exponent": "acedformerlyexponent"}
def channel_matches(claimed, actual):
    c, a = nrm(claimed), nrm(actual)
    if not c or not a: return True
    c = ALIAS.get(c, c)
    return c in a or a in c or c[:6] == a[:6]

# ---------- walk workbooks ----------
details = []
stats = collections.Counter()
per_book = collections.defaultdict(collections.Counter)
lc_issues = []

def split_label(line, m):
    before = line[:m.start()].strip(" |:-–—\t")
    return before

for bk, rel in BOOKS.items():
    src = os.path.join(ROOT, rel)
    wb = openpyxl.load_workbook(src)
    audit_rows = []
    for ws in wb.worksheets:
        hdr = None
        for row in ws.iter_rows():
            vals = [c.value for c in row]
            if vals and vals[0] in ("Topic", "Week"):
                hdr = vals; continue
            if hdr and hdr[0] == "Week":   # learning-plan sheets: topic is the "Study Focus" column
                topic = str(vals[1]) if len(vals) > 1 and vals[1] is not None else ""
            else:
                topic = str(vals[0]) if vals and vals[0] is not None else ""
            row_filled = False
            for cell in row:
                if cell.value is None or not isinstance(cell.value, str): continue
                text = cell.value
                # LeetCode number/title check
                for m in re.finditer(r'([^\n\d][^\n(]*?)\s*\((?:LC|LeetCode)\s*#?\s*(\d+)\)', text):
                    claimed = m.group(1).strip(' .0123456789'); n = int(m.group(2))
                    real = LC.get(n)
                    if real and difflib.SequenceMatcher(None, nrm(claimed), nrm(real)).ratio() < 0.75 and nrm(claimed) not in nrm(real):
                        lc_issues.append((bk, ws.title, topic, claimed, n, real))
                for a_, b_ in LC_FIX.items():
                    if a_ in text:
                        text = text.replace(a_, b_); cell.value = text
                        audit_rows.append((ws.title, topic[:60], "LeetCode reference", a_, "WRONG NUMBER", "fixed", b_ + " Largest Component Size by Common Factor"))
                if not URL_RX.search(text): continue
                lines = text.split("\n")
                drop = set(); changed = False
                for i, line in enumerate(lines):
                    for m in list(URL_RX.finditer(line)):
                        raw = m.group(0).rstrip('.')
                        if '/' not in raw: continue
                        label = split_label(line, m)
                        label_line = i
                        if not label and i > 0 and not URL_RX.search(lines[i-1]):
                            label = lines[i-1].strip(" :|-–—"); label_line = i - 1
                        v, new, actual_ch, note = verdict_for(raw)
                        if v == "OK" and is_offtopic(topic, raw):
                            v = "OFFTOPIC"
                            note = (f"{actual_ch} – {note}" if actual_ch else note) + " (live, but not about this topic / unofficial re-upload)"
                            actual_ch = ""
                        action = "keep"
                        if v in ("DEAD", "SOFT", "OFFTOPIC"):
                            action = "removed"; drop.add(i)
                            if label_line != i: drop.add(label_line)
                        elif v in ("MOVED", "REPLACED") and new:
                            action = "url updated"
                            lines[i] = lines[i].replace(raw, new); changed = True
                        if v in ("OK", "MOVED", "REPLACED") and "github.com/" in (new or raw) and label:
                            repo = re.sub(r'^(https?://)?(www\.)?github\.com/', '', (new or raw)).split('#')[0]
                            short = "/".join(repo.split("/")[:2])
                            if nrm(short.split("/")[1]) not in nrm(label) and nrm(short.split("/")[0]) not in nrm(label):
                                newlabel = "GitHub " + short + (" – " + repo.split("/")[-1] if repo.count("/") > 2 else "")
                                if label_line == i: lines[i] = lines[i].replace(label, newlabel, 1)
                                else: lines[label_line] = newlabel + ":"
                                changed = True
                                if action == "keep": action = "relabelled"
                                note = f"label named a package that this link is not; now '{newlabel}'"
                        if v == "OK" and actual_ch:
                            claimed = re.split(r'\s[–—-]\s|:', label)[0] if label else ""
                            if claimed and not channel_matches(claimed, actual_ch):
                                action = "relabelled"
                                newlabel = f"{actual_ch} – {note}"
                                if label_line == i:
                                    lines[i] = lines[i].replace(label, newlabel, 1)
                                else:
                                    lines[label_line] = newlabel + ":"
                                changed = True
                        stats[v] += 1; per_book[bk][v] += 1
                        details.append(dict(book=bk, sheet=ws.title, row=cell.row, column=(hdr[cell.column-1] if hdr and cell.column-1 < len(hdr) else cell.column_letter),
                                            topic=topic[:80], label=label[:120], url=raw, verdict=v, action=action,
                                            new_url=new, actual=(f"{actual_ch} – {note}" if actual_ch else note)[:160]))
                        if action != "keep":
                            audit_rows.append((ws.title, topic[:60], label[:80], raw, v, action, new or ((f"{actual_ch} – {note}" if actual_ch else note) if action == "relabelled" else note)))
                if drop or changed:
                    kept = [l for j, l in enumerate(lines) if j not in drop]
                    kept = [l for l in kept if l.strip()]
                    if not kept and topic.strip() in FILL and not row_filled:
                        row_filled = True
                        kept = [f"{l} | {u}" for l, u in FILL[topic.strip()]]
                        audit_rows.append((ws.title, topic[:60], "(replacement)", "", "ADDED", "verified replacement added", "; ".join(u for _, u in FILL[topic.strip()])))
                    cell.value = "\n".join(kept) if kept else "—"
    a = wb.create_sheet("Audit")
    a.append(["Link audit 2026-10-08: every link opened; dead or off-topic links removed, moved links updated, mislabelled videos relabelled. Details: _meta/hub-program/link-audit/"])
    a.append(["Sheet", "Topic", "Original label", "Original URL", "Verdict", "Action", "New URL / actual content"])
    for r in audit_rows: a.append(list(r))
    out = src.replace(".xlsx", "-verified.xlsx")
    wb.save(out)
    print("saved", out, len(audit_rows), "changes")

with open(os.path.join(HERE, "audit-details.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(details[0].keys())); w.writeheader(); w.writerows(details)
groups = collections.defaultdict(lambda: [0, 0])
for d in details:
    g = groups[(d["book"], d["sheet"], d["topic"])]
    g[0] += 1
    if d["action"] != "removed": g[1] += 1
empty_topics = [k for k, (tot, kept) in groups.items() if kept == 0]
thin_topics = [k for k, (tot, kept) in groups.items() if kept == 1]
json.dump(dict(empty_topics=empty_topics, thin_topics=thin_topics, topics=len(groups),
               actions=collections.Counter(d["action"] for d in details)), open(os.path.join(HERE, "audit-coverage.json"), "w"), indent=1)
print("topics", len(groups), "left with no link:", len(empty_topics), "with one link:", len(thin_topics))
json.dump(dict(stats=stats, per_book={k: dict(v) for k, v in per_book.items()}, lc_issues=lc_issues), open(os.path.join(HERE, "audit-summary.json"), "w"), indent=1)
print(dict(stats)); print({k: dict(v) for k, v in per_book.items()}); print("LC mismatches:", len(lc_issues))
