---
title: "Connect to remote agents with A2A"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a09]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/09-multi-remote-agents-with-a2a.html
    accessed: 2026-10-02
---
# Lab: Connect to remote agents with A2A

> AI-103 · about 45 min · practises [a09](../concepts/a09-a2a-connecting-remote-agents.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/09-multi-remote-agents-with-a2a.html)

## Goal
Serve agents with agent cards and delegate from a routing agent.

## ⚠️ Cost (low)
Tokens only; servers run locally.

## Steps
1. Start the remote agents (each serves an agent card).
2. Run the routing agent; ask questions that need each specialist.

## Verify
- [ ] The routing agent picks the right specialist by skill.

## Break it (then fix it)
- Give two agents overlapping skill descriptions and watch routing degrade.

## Teardown (do it the same day)
```bash
# Stop local servers; delete cloud resources
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
