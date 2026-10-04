---
title: "Multi-agent: specialist agent + connected agent"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, m01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-4-configure-multi-agent-solution
    accessed: 2026-10-02
---
# Lab: Multi-agent: specialist agent + connected agent

> AB-620 · about 75 min · practises [m01](../concepts/m01-multi-agent-design-child-and-connected-agents.md) · [guide](https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-4-configure-multi-agent-solution)

## Goal
Create a Fulfilment specialist with its own tool and workflow, publish it, connect it to the orchestrator agent, and test delegation end to end.

## ⚠️ Cost (low)
A single Preview turn can call the orchestrator, the specialist and workflows, so each test uses more Copilot Credits.

## Prerequisites
- Labs 1–3 completed in the same environment

## Steps
1. Create the **Fulfillment agent** in the same solution; scoped instructions; Products table tool.
2. Author the *Create shipment request* workflow with typed outputs; publish; attach.
3. Publish the specialist (allow other agents to connect).
4. Orchestrator: + **Connected agents** > select > write the delegation **Description** > Connect.
5. Reinforce delegation in the orchestrator's instructions; test multi-intent requests and check the activity map.

## Verify
- [ ] Shipment requests are handled by the specialist; returns stay with the orchestrator.
- [ ] Transcripts show which agent handled which turn.

## Break it (then fix it)
- Give the orchestrator its own copy of the shipment tool and see routing get worse; then fix it.

## Teardown (do it the same day)
```bash
Disconnect the connected agent if you no longer need it; delete test shipment rows.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
