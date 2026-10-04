---
title: "Guardrails and the AI Red Teaming Agent"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, s03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/run-scans-ai-red-teaming-agent
    accessed: 2026-10-02
---
# Lab: Guardrails and the AI Red Teaming Agent

> AI-500 · about 90 min · practises [s03](../concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md) · [guide](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/run-scans-ai-red-teaming-agent)

## Goal
Configure guardrails for an agent, build a small guardrail test matrix, and run the AI Red Teaming Agent to measure attack success rate; add it as a CI gate.

## ⚠️ Cost (medium)
Red-team scans generate many model calls; limit objectives and strategies.

## Prerequisites
- `pip install "azure-ai-evaluation[redteam]"`
- An agent endpoint you own (never scan systems you don't own)

## Steps
1. Configure guardrails (content filters, Prompt Shields) for your agent.
2. Create a coverage matrix: surfaces × threats × variations (multilingual, Base64, multi-turn).
3. Run a red-team scan with a few risk categories and strategies; record ASR.
4. Fix one weakness (e.g., tool-response scanning) and re-run.
5. Add the scan to CI with an ASR baseline gate.

## Verify
- [ ] ASR reported per category; the fix reduces it.
- [ ] CI fails when ASR exceeds the baseline.

## Break it (then fix it)
- Disable Prompt Shields for documents and test an injected PDF.

## Teardown (do it the same day)
```bash
Delete scan outputs you don't need; no standing resources beyond your project.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
