---
title: "The guarded agentic loop (Foundry Agent Service v2)"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, f02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/02-agent-custom-tools.html
    accessed: 2026-10-02
---
# Lab: The guarded agentic loop (Foundry Agent Service v2)

> AI-500 · about 75 min · practises [f02](../concepts/f02-foundry-agent-service-v2-and-the-agentic-loop-in-python.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/02-agent-custom-tools.html)

## Goal
Build an agent with function tools using the v2 SDK, then harden the loop: argument validation, iteration cap, token budget, background mode and escalation.

## ⚠️ Cost (low)
Small model tokens (use gpt-5.4-mini or gpt-5.4-nano). Delete the resource group afterwards.

## Prerequisites
- Azure subscription; Foundry project with a small model deployment
- Python 3.12, VS Code, Azure CLI (`az login`)

## Steps
1. Complete the official exercise (function tools with create_version, conversations and responses).
2. Add argument validation (JSON schema) and an authorisation check before executing each tool.
3. Add MAX_ITERATIONS and a token budget; on breach, return a partial result and escalate.
4. Run a long task with `background=True` and poll `responses.retrieve` with backoff.
5. Log iterations and tokens per request; find the P95 iteration count.

## Verify
- [ ] The loop never exceeds the cap; escalation happens with a clear reason.
- [ ] Invalid arguments are rejected before execution.

## Break it (then fix it)
- Make a tool return an ambiguous result and watch the loop repeat; fix with a clearer result and a completion signal.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-loop --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
