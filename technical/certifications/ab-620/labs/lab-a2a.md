---
title: "Cross-platform multi-agent with A2A (Learn module exercise)"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, m02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/training/modules/build-cross-platform-multi-agent-solutions-agent2agent-copilot-studio/
    accessed: 2026-10-02
---
# Lab: Cross-platform multi-agent with A2A (Learn module exercise)

> AB-620 · about 60 min · practises [m02](../concepts/m02-foundry-agents-fabric-data-agents-and-a2a.md) · [guide](https://learn.microsoft.com/en-us/training/modules/build-cross-platform-multi-agent-solutions-agent2agent-copilot-studio/)

## Goal
Run a sample A2A agent, expose it with a dev tunnel, connect it to Copilot Studio as an A2A agent and inspect the payload (contextId, chat history).

## ⚠️ Cost (low)
Azure OpenAI tokens for the sample agent; dev tunnels are free for development.

## Prerequisites
- .NET SDK and an Azure OpenAI deployment (per the exercise)
- Dev Tunnels (or another way to expose a local endpoint)

## Steps
1. Run the sample A2A agent locally and expose it with a dev tunnel.
2. Agents > Add agent > **A2A agent**; enter the endpoint URL (not the card URL).
3. Confirm name and description were read from the agent card.
4. Choose authentication (None for the sample only).
5. Test and inspect what the remote agent receives (full chat history).

## Verify
- [ ] The orchestrator delegates matching requests to the A2A agent.

## Break it (then fix it)
- Paste the agent.json URL as the endpoint and read the error.

## Teardown (do it the same day)
```bash
Stop the dev tunnel and the local agent; delete the A2A connection in Copilot Studio.
# Delete any Azure OpenAI deployment created only for this exercise.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
