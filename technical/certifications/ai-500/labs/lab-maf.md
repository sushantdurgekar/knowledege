---
title: "Agent Framework orchestrations and middleware"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d07, d08]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/08-agent-framework-multi-agents.html
    accessed: 2026-10-02
---
# Lab: Agent Framework orchestrations and middleware

> AI-500 · about 100 min · practises [d07](../concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md), [d08](../concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/08-agent-framework-multi-agents.html)

## Goal
Implement sequential, concurrent and handoff orchestrations with Agent Framework; add function and chat middleware for authorisation, PII redaction and token logging; bound concurrency by quota.

## ⚠️ Cost (low)
Tokens only (small model).

## Prerequisites
- Python 3.12; `pip install agent-framework` (plus the Foundry integration)
- Foundry project with a small model

## Steps
1. Complete the official multi-agent exercise.
2. Rebuild it as concurrent fan-out with a semaphore and a minimum quorum.
3. Create a handoff workflow (triage → billing/tech) with a chain-depth limit.
4. Add function middleware (authorisation + PII redaction) and chat middleware (token logging) to all agents.
5. Add checkpointing to a long workflow and resume after killing the process.

## Verify
- [ ] Middleware runs on every tool/model call; denied writes never execute.
- [ ] The workflow resumes from its checkpoint.

## Break it (then fix it)
- Remove the depth limit and create a handoff loop; observe and fix.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-maf --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
