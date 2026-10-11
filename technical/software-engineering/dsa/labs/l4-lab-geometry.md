---
title: "Exact geometry kit"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Exact geometry kit

> Data Structures & Algorithms L4 · about 80 min · modules m07

Write the exact geometry predicates and algorithms in both languages, with BigInt in JavaScript, and test each one against a brute force or an independent method: Fraction-based intersection, Pick's theorem against counting, and hull corners against triangle containment.

## Before you start
- Python 3.12+ and Node.js 22+
- Module 07

## Steps
1. `cross`, `orient` and `on_segment`, exact for coordinates up to 10⁹ (BigInt in JavaScript).
2. `intersect(p1, p2, p3, p4)`: four orientations, plus on-segment checks when one of them is 0.
3. `area2(poly)` (the shoelace sum) and `locate(poly, p)`: the boundary check first, then ray casting with the half-open rule.
4. `hull(points)` keeping corners only, and LeetCode 587's `outer_trees` keeping points on the edges; plus Pick's theorem for lattice points, with B = Σ gcd(|Δx|, |Δy|).
5. Tests: 3,000 random segment pairs against exact fractions, Pick's theorem against counting every lattice point, 300 random hulls against brute-force corners, and an orientation near 10¹⁸.

## Prove it worked
- intersect agrees with the exact-fraction method on every random pair, including touching and overlapping segments.
- For every test polygon, Pick's theorem gives the same inside and boundary counts as checking every lattice point with locate.
- Hull corners match the brute force, and every corner is also on LeetCode 587's fence.

## Break it (then fix it)
- Compute the cross product with floats (plain Numbers in JavaScript) and run the 10⁹ orientation test: find the first case that comes out wrong.
- Drop the half-open rule in locate and count every edge the ray touches. Find a polygon and a point whose answer flips.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
def cross(o, a, b):                             # (a - o) x (b - o): > 0 left turn, < 0 right turn, 0 in line
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def orient(o, a, b):                            # the sign of the cross product: 1, -1 or 0
    c = cross(o, a, b)
    return (c > 0) - (c < 0)

def on_segment(a, b, p):                        # p is in line with a and b: is it between them?
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])

def intersect(p1, p2, p3, p4):                # do segments p1p2 and p3p4 share at least one point?
    d1, d2 = orient(p3, p4, p1), orient(p3, p4, p2)
    d3, d4 = orient(p1, p2, p3), orient(p1, p2, p4)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True                           # each segment straddles the other's line
    return ((d1 == 0 and on_segment(p3, p4, p1)) or (d2 == 0 and on_segment(p3, p4, p2)) or
            (d3 == 0 and on_segment(p1, p2, p3)) or (d4 == 0 and on_segment(p1, p2, p4)))

def area2(poly):                              # twice the signed area: > 0 when listed anticlockwise
    return sum(cross((0, 0), poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))

def locate(poly, p):                          # "INSIDE", "OUTSIDE" or "BOUNDARY"
    inside = False
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        o = orient(a, b, p)
        if o == 0 and on_segment(a, b, p):
            return "BOUNDARY"
        if (a[1] > p[1]) != (b[1] > p[1]) and (o > 0) == (b[1] > a[1]):
            inside = not inside               # this edge crosses the ray going right from p
    return "INSIDE" if inside else "OUTSIDE"

def outer_trees(trees):                       # every tree on the fence, straight stretches included
    pts = sorted(set(map(tuple, trees)))
    if len(pts) <= 2:
        return pts
    def chain(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and cross(out[-2], out[-1], p) < 0:   # pop right turns only
                out.pop()
            out.append(p)
        return out
    return sorted(set(chain(pts) + chain(pts[::-1])))   # both chains hold the ends; a set drops repeats
import random
from fractions import Fraction
from math import gcd
random.seed(5)

def hull(points):                                 # corners only, anticlockwise
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    def chain(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and cross(out[-2], out[-1], p) <= 0:
                out.pop()
            out.append(p)
        return out
    lower, upper = chain(pts), chain(pts[::-1])
    return lower[:-1] + upper[:-1]

def lattice_points(poly):                         # Pick's theorem: (inside, on the boundary)
    b = sum(gcd(abs(poly[i][0] - poly[i - 1][0]), abs(poly[i][1] - poly[i - 1][1])) for i in range(len(poly)))
    return (abs(area2(poly)) - b + 2) // 2, b

def brute_intersect(p1, p2, p3, p4):
    rx, ry, sx, sy = p2[0] - p1[0], p2[1] - p1[1], p4[0] - p3[0], p4[1] - p3[1]
    den, qx, qy = rx * sy - ry * sx, p3[0] - p1[0], p3[1] - p1[1]
    if den:
        t, u = Fraction(qx * sy - qy * sx, den), Fraction(qx * ry - qy * rx, den)
        return 0 <= t <= 1 and 0 <= u <= 1
    if qx * ry - qy * rx:
        return False
    k = 0 if rx else 1
    return max(min(p1[k], p2[k]), min(p3[k], p4[k])) <= min(max(p1[k], p2[k]), max(p3[k], p4[k]))

pt = lambda: (random.randint(-4, 4), random.randint(-4, 4))
for _ in range(3000):
    p1, p2, p3, p4 = pt(), pt(), pt(), pt()
    if p1 != p2 and p3 != p4:
        assert intersect(p1, p2, p3, p4) == brute_intersect(p1, p2, p3, p4)

shapes = [[(0, 0), (6, 0), (6, 4), (3, 2), (0, 4)], [(0, 0), (5, 0), (5, 5), (4, 5), (4, 1), (1, 1), (1, 5), (0, 5)],
          [(0, 0), (4, 0), (2, 3)], [(2, 0), (4, 2), (2, 4), (0, 2)]]
for poly in shapes:
    inside = sum(locate(poly, (x, y)) == "INSIDE" for x in range(-1, 8) for y in range(-1, 8))
    boundary = sum(locate(poly, (x, y)) == "BOUNDARY" for x in range(-1, 8) for y in range(-1, 8))
    assert lattice_points(poly) == (inside, boundary)        # Pick's theorem against counting every point

for _ in range(300):
    pts = list({pt() for _ in range(random.randint(1, 10))})
    h = hull(pts)
    corner = lambda p: not any(orient(a, b, p) == 0 and on_segment(a, b, p) for a in pts for b in pts if a != p and b != p and a != b) and not any(
        orient(a, b, c) != 0 and len({orient(a, b, p), orient(b, c, p), orient(c, a, p)} - {0}) <= 1
        for a in pts for b in pts for c in pts if p not in (a, b, c) and len({a, b, c}) == 3)
    assert sorted(h) == sorted(p for p in pts if corner(p))
    on_fence = sorted(outer_trees([list(p) for p in pts]))
    assert set(h) <= set(on_fence)

big = 10**9
assert orient((0, 0), (big - 1, big - 2), (big - 2, big - 3)) == -1          # exact even near 10^18
print("geometry: 3000 segment pairs ok | Pick's theorem matches on 4 polygons | 300 hulls ok | exact at 10^9")
```

Output:
```text
geometry: 3000 segment pairs ok | Pick's theorem matches on 4 polygons | 300 hulls ok | exact at 10^9
```

```javascript
function cross(o, a, b) {                       // (a - o) x (b - o) as an exact BigInt: > 0 left, < 0 right, 0 in line
  const ox = BigInt(o[0]), oy = BigInt(o[1]);
  return (BigInt(a[0]) - ox) * (BigInt(b[1]) - oy) - (BigInt(a[1]) - oy) * (BigInt(b[0]) - ox);
}

function orient(o, a, b) {                      // the sign of the cross product: 1, -1 or 0
  const c = cross(o, a, b);
  return c > 0n ? 1 : c < 0n ? -1 : 0;
}

function onSegment(a, b, p) {                   // p is in line with a and b: is it between them?
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function intersect(p1, p2, p3, p4) {          // do segments p1p2 and p3p4 share at least one point?
  const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;   // each segment straddles the other's line
  return (d1 === 0 && onSegment(p3, p4, p1)) || (d2 === 0 && onSegment(p3, p4, p2)) ||
    (d3 === 0 && onSegment(p1, p2, p3)) || (d4 === 0 && onSegment(p1, p2, p4));
}

function area2(poly) {                        // twice the signed area: > 0 when listed anticlockwise
  return poly.reduce((s, p, i) => s + cross([0, 0], p, poly[(i + 1) % poly.length]), 0n);
}

function locate(poly, p) {                    // "INSIDE", "OUTSIDE" or "BOUNDARY"
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], o = orient(a, b, p);
    if (o === 0 && onSegment(a, b, p)) return "BOUNDARY";
    if ((a[1] > p[1]) !== (b[1] > p[1]) && (o > 0) === (b[1] > a[1])) inside = !inside;   // crosses the ray to the right
  }
  return inside ? "INSIDE" : "OUTSIDE";
}

function outerTrees(trees) {                  // every tree on the fence, straight stretches included
  const key = p => p[0] * 1000 + p[1];
  const pts = [...new Map(trees.map(p => [key(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const chain = seq => {
    const out = [];
    for (const p of seq) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) < 0n) out.pop();   // pop right turns only
      out.push(p);
    }
    return out;
  };
  const both = [...chain(pts), ...chain([...pts].reverse())];   // both chains hold the ends; a Map drops repeats
  return [...new Map(both.map(p => [key(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const assert = require("node:assert");
const rnd = k => Math.floor(Math.random() * k);

function hull(points) {                           // corners only, anticlockwise
  const pts = [...new Map(points.map(p => [p.join(), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const chain = seq => {
    const out = [];
    for (const p of seq) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0n) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = chain(pts), upper = chain([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
function latticePoints(poly) {                    // Pick's theorem: [inside, on the boundary]
  let b = 0;
  poly.forEach((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]; b += gcd(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])); });
  const a2 = area2(poly), absA2 = Number(a2 < 0n ? -a2 : a2);
  return [(absA2 - b + 2) / 2, b];
}

function bruteIntersect(p1, p2, p3, p4) {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1], sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const den = rx * sy - ry * sx, qx = p3[0] - p1[0], qy = p3[1] - p1[1];
  const inUnit = (num, d) => (d > 0 ? num >= 0 && num <= d : num <= 0 && num >= d);
  if (den !== 0) return inUnit(qx * sy - qy * sx, den) && inUnit(qx * ry - qy * rx, den);
  if (qx * ry - qy * rx !== 0) return false;
  const k = rx !== 0 ? 0 : 1;
  return Math.max(Math.min(p1[k], p2[k]), Math.min(p3[k], p4[k])) <= Math.min(Math.max(p1[k], p2[k]), Math.max(p3[k], p4[k]));
}

const pt = () => [rnd(9) - 4, rnd(9) - 4];
for (let t = 0; t < 3000; t++) {
  const p1 = pt(), p2 = pt(), p3 = pt(), p4 = pt();
  if (p1.join() === p2.join() || p3.join() === p4.join()) continue;
  assert.strictEqual(intersect(p1, p2, p3, p4), bruteIntersect(p1, p2, p3, p4));
}

const shapes = [[[0, 0], [6, 0], [6, 4], [3, 2], [0, 4]], [[0, 0], [5, 0], [5, 5], [4, 5], [4, 1], [1, 1], [1, 5], [0, 5]],
  [[0, 0], [4, 0], [2, 3]], [[2, 0], [4, 2], [2, 4], [0, 2]]];
for (const poly of shapes) {
  let inside = 0, boundary = 0;
  for (let x = -1; x < 8; x++) for (let y = -1; y < 8; y++) {
    const where = locate(poly, [x, y]);
    if (where === "INSIDE") inside++;
    if (where === "BOUNDARY") boundary++;
  }
  assert.deepStrictEqual(latticePoints(poly), [inside, boundary]);   // Pick's theorem against counting every point
}

for (let t = 0; t < 300; t++) {
  const pts = [...new Map(Array.from({ length: 1 + rnd(10) }, () => { const p = pt(); return [p.join(), p]; })).values()];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const corner = p => {
    const rest = pts.filter(q => !same(q, p));
    for (const a of rest) for (const b of rest) if (!same(a, b) && orient(a, b, p) === 0 && onSegment(a, b, p)) return false;
    for (const a of rest) for (const b of rest) for (const c of rest) {
      if (same(a, b) || same(b, c) || same(a, c) || orient(a, b, c) === 0) continue;
      const s = new Set([orient(a, b, p), orient(b, c, p), orient(c, a, p)]);
      s.delete(0);
      if (s.size <= 1) return false;
    }
    return true;
  };
  const key = p => p.join();
  assert.deepStrictEqual(hull(pts).map(key).sort(), pts.filter(corner).map(key).sort());
  const fence = new Set(outerTrees(pts).map(key));
  for (const p of hull(pts)) assert.ok(fence.has(key(p)));
}

const big = 1e9;
assert.strictEqual(orient([0, 0], [big - 1, big - 2], [big - 2, big - 3]), -1);   // exact even near 10^18
console.log("geometry: 3000 segment pairs ok | Pick's theorem matches on 4 polygons | 300 hulls ok | exact at 10^9");
```

Output:
```text
geometry: 3000 segment pairs ok | Pick's theorem matches on 4 polygons | 300 hulls ok | exact at 10^9
```

</details>
