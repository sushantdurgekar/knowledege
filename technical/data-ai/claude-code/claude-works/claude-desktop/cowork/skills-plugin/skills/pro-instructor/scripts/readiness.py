#!/usr/bin/env python3
"""Compute exam readiness from a mock-exam results JSON (+ optional history).

Input JSON (results):
{
  "exam": "aws-saa", "mock": 2, "date": "2026-10-01",
  "weights": {"Secure Architectures": 30, "Resilient": 26, "High-Performing": 24, "Cost-Optimized": 20},
  "questions": [
    {"domain": "Secure Architectures", "correct": true, "confidence": "high", "flagged": false},
    ...
  ]
}
History file (optional, JSON list of prior summaries written by this script with --append-history).

Usage:
  python readiness.py results.json [--history readiness_history.json] [--append-history] [--markdown]
Verdict rules: READY = weighted>=85 on last two mocks, no domain<70, confident-wrong<=10%.
               ALMOST = weighted>=75 or exactly one domain<70. Else NOT YET.
"""
import argparse
import json
from pathlib import Path


def summarize(res):
    w = res["weights"]
    tot_w = sum(w.values())
    per = {}
    for q in res["questions"]:
        d = per.setdefault(q["domain"], {"n": 0, "ok": 0})
        d["n"] += 1
        d["ok"] += 1 if q["correct"] else 0
    dom = {k: round(100 * v["ok"] / v["n"], 1) for k, v in per.items()}
    # weighted over domains that were tested; renormalize weights
    tested_w = sum(w.get(k, 0) for k in dom)
    weighted = round(sum(dom[k] * w.get(k, 0) for k in dom) / tested_w, 1) if tested_w else 0.0
    n = len(res["questions"])
    raw = round(100 * sum(q["correct"] for q in res["questions"]) / n, 1) if n else 0.0
    conf_wrong = sum(1 for q in res["questions"] if not q["correct"] and q.get("confidence") == "high")
    unsure_right = sum(1 for q in res["questions"] if q["correct"] and q.get("confidence") == "low")
    untested = [k for k in w if k not in dom]
    weakest = sorted(dom.items(), key=lambda kv: (kv[1], -w.get(kv[0], 0)))[:3]
    return {
        "exam": res.get("exam"), "mock": res.get("mock"), "date": res.get("date"),
        "questions": n, "raw_pct": raw, "weighted_pct": weighted, "domains": dom,
        "weakest": [k for k, _ in weakest], "untested_domains": untested,
        "confident_wrong_pct": round(100 * conf_wrong / n, 1) if n else 0.0,
        "unsure_correct_pct": round(100 * unsure_right / n, 1) if n else 0.0,
        "coverage_pct": round(100 * tested_w / tot_w, 1) if tot_w else 0.0,
    }


def verdict(cur, history):
    low = [k for k, v in cur["domains"].items() if v < 70]
    prev = history[-1] if history else None
    two_good = cur["weighted_pct"] >= 85 and prev is not None and prev.get("weighted_pct", 0) >= 85
    if two_good and not low and cur["confident_wrong_pct"] <= 10 and not cur["untested_domains"]:
        return "READY", "Two consecutive mocks >=85%, every domain >=70%, calibration good."
    if cur["weighted_pct"] >= 75 or len(low) == 1:
        why = []
        if cur["weighted_pct"] < 85: why.append(f"raise weighted score {cur['weighted_pct']}% -> 85%+")
        if low: why.append("lift " + ", ".join(low) + " above 70%")
        if cur["confident_wrong_pct"] > 10: why.append(f"cut confident-wrong {cur['confident_wrong_pct']}% -> <=10%")
        if prev is None or prev.get("weighted_pct", 0) < 85: why.append("repeat >=85% on a second fresh mock")
        if cur["untested_domains"]: why.append("cover untested: " + ", ".join(cur["untested_domains"]))
        return "ALMOST", "; ".join(why)
    return "NOT YET", "Weighted below 75% or multiple weak domains - revise roadmap, remediate weakest domains first."


def to_md(cur, v, why, history):
    lines = [f"## Readiness - {cur['exam']} mock {cur['mock']} ({cur['date']})", "",
             f"**Verdict: {v}** - {why}", "",
             f"- Weighted score: **{cur['weighted_pct']}%** (raw {cur['raw_pct']}%, {cur['questions']} Qs, blueprint coverage {cur['coverage_pct']}%)",
             f"- Confident-but-wrong: {cur['confident_wrong_pct']}% · Unsure-but-right: {cur['unsure_correct_pct']}%",
             f"- Weakest: {', '.join(cur['weakest'])}", "",
             "| Domain | Score |", "|---|---|"]
    lines += [f"| {k} | {val}% |" for k, val in sorted(cur["domains"].items(), key=lambda kv: kv[1])]
    if history:
        lines += ["", "### Trend", "| Mock | Date | Weighted |", "|---|---|---|"]
        lines += [f"| {h.get('mock')} | {h.get('date')} | {h.get('weighted_pct')}% |" for h in history + [cur]]
    lines += ["", "_Estimate only: practice items are original and may differ from the real exam._"]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("results")
    p.add_argument("--history")
    p.add_argument("--append-history", action="store_true")
    p.add_argument("--markdown", action="store_true")
    a = p.parse_args()
    res = json.loads(Path(a.results).read_text(encoding="utf-8-sig"))
    hist_path = Path(a.history) if a.history else None
    history = json.loads(hist_path.read_text(encoding="utf-8-sig")) if hist_path and hist_path.exists() else []
    cur = summarize(res)
    v, why = verdict(cur, history)
    cur["verdict"], cur["why"] = v, why
    if a.append_history and hist_path:
        hist_path.write_text(json.dumps(history + [cur], indent=2), encoding="utf-8")
    print(to_md(cur, v, why, history) if a.markdown else json.dumps(cur, indent=2))


if __name__ == "__main__":
    main()
