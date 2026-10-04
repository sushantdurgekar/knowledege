---
title: "Evaluation pipeline: built-in, custom and calibrated judges"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, v01, v03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluate-agent
    accessed: 2026-10-02
---
# Lab: Evaluation pipeline: built-in, custom and calibrated judges

> AI-500 · about 100 min · practises [v01](../concepts/v01-evaluation-strategy-human-review-components-and-end-to-end.md), [v03](../concepts/v03-continuous-improvement-llm-judges-synthetic-data-optimisatio.md) · [guide](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluate-agent)

## Goal
Evaluate an agent with built-in agent evaluators and a custom evaluator, generate a synthetic dataset, calibrate a judge against human labels, and wire a CI gate.

## ⚠️ Cost (low)
Judge model tokens; keep datasets small (50–100 rows).

## Prerequisites
- `pip install azure-ai-evaluation`
- An agent from earlier labs

## Steps
1. Create a taxonomy-driven synthetic dataset (simulator or LLM at ~0.8 temperature); validate 20 rows by hand.
2. Run IntentResolution, TaskAdherence and ToolCallAccuracy evaluators; log to Foundry.
3. Write a custom evaluator (e.g., handoff coherence).
4. Label 50 rows yourself and compute Cohen's κ against the judge.
5. Add an evaluation job to a GitHub workflow with thresholds and per-segment checks.

## Verify
- [ ] Results appear in the Foundry portal; κ computed.
- [ ] The CI job fails on an injected regression.

## Break it (then fix it)
- Use the same model family as judge and agent; compare pairwise preferences.

## Teardown (do it the same day)
```bash
No standing resources beyond your project; delete evaluation runs you don't need.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
