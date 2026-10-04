---
title: "Agent Framework: single and multi-agent"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a08]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/08-agent-framework-multi-agents.html
    accessed: 2026-10-02
---
# Lab: Agent Framework: single and multi-agent

> AI-103 · about 60 min · practises [a08](../concepts/a08-microsoft-agent-framework-and-orchestration-patterns.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/08-agent-framework-multi-agents.html)

## Goal
Build an Agent Framework agent with tools, then a sequential multi-agent workflow.

## ⚠️ Cost (low)
Tokens only.

## Steps
1. Lab 07: create an Agent with a function tool via FoundryChatClient.
2. Lab 08: create three agents and wire them with SequentialBuilder; inspect outputs.

## Verify
- [ ] The workflow output shows each agent's contribution in order.

## Break it (then fix it)
- Replace SequentialBuilder with a concurrent pattern and compare results.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
