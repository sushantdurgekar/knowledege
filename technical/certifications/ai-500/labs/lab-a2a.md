---
title: "Integrate remote agents with A2A"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d07, a03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/09-multi-remote-agents-with-a2a.html
    accessed: 2026-10-02
---
# Lab: Integrate remote agents with A2A

> AI-500 · about 60 min · practises [d07](../concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md), [a03](../concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/09-multi-remote-agents-with-a2a.html)

## Goal
Connect an orchestrator to remote agents over A2A, inspect agent cards and tasks, and add token validation and minimal-context sharing.

## ⚠️ Cost (low)
Tokens only.

## Prerequisites
- Foundry project; Python environment from the exercise

## Steps
1. Complete the official A2A exercise.
2. Inspect each remote agent's card (skills, endpoint, auth).
3. Add JWT validation on the remote agent (issuer, audience, expiry, caller allow-list).
4. Reduce the context sent to the remote agent to what the task needs.
5. Propagate W3C trace context across the A2A call and view one end-to-end trace.

## Verify
- [ ] Calls with the wrong audience are rejected.
- [ ] One trace spans orchestrator and remote agent.

## Break it (then fix it)
- Send a token for another API and confirm a 401.

## Teardown (do it the same day)
```bash
Stop local agents; delete any Azure resources created: az group delete --name rg-ai500-a2a --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
