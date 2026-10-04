---
title: "Durable human-in-the-loop approvals"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d09, a02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/06-build-workflow-ms-foundry.html
    accessed: 2026-10-02
---
# Lab: Durable human-in-the-loop approvals

> AI-500 · about 90 min · practises [d09](../concepts/d09-implementing-human-in-the-loop-approvals-overrides-and-edge.md), [a02](../concepts/a02-workflows-control-loops-and-human-in-the-loop-design.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/06-build-workflow-ms-foundry.html)

## Goal
Build a Foundry workflow with a human step, then implement a code-first durable approval (Durable Functions) with timeout, escalation, re-validation and audit.

## ⚠️ Cost (low)
Functions consumption and storage are minimal; tokens for the agent.

## Prerequisites
- Azure Functions Core Tools; Python Durable Functions
- A Teams webhook or a simple web form to raise the approval event

## Steps
1. Complete the official workflow exercise (with low-confidence handling).
2. Write a Durable orchestrator: propose → send approval → task_any(external event, timer).
3. On timeout escalate once, then default to reject and notify.
4. Re-validate state before executing; make execution idempotent by request ID.
5. Write each decision (with overrides and reasons) to an append-only audit store.

## Verify
- [ ] Restarting the function app mid-wait doesn't lose the approval.
- [ ] Stale approvals are refused.

## Break it (then fix it)
- Send the approval event twice; confirm only one execution.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-hitl --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
