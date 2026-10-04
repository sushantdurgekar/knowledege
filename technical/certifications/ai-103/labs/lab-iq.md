---
title: "Integrate an AI agent with Foundry IQ"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/04-integrate-agent-with-foundry-iq.html
    accessed: 2026-10-02
---
# Lab: Integrate an AI agent with Foundry IQ

> AI-103 · about 45 min · practises [a05](../concepts/a05-knowledge-and-memory-for-agents-foundry-iq.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/04-integrate-agent-with-foundry-iq.html)

## Goal
Create a knowledge base on Azure AI Search and connect it to an agent through MCP.

## ⚠️ Cost (medium)
Azure AI Search is billed hourly by tier while it exists; delete it the same day.

## Steps
1. Create or connect an Azure AI Search service.
2. Create a knowledge base with a Blob source; wait for ingestion.
3. Connect the agent; add grounding and fallback instructions; test.

## Verify
- [ ] Answers cite knowledge-base sources; out-of-scope questions return the fallback.

## Break it (then fix it)
- Remove the project identity's Search Index Data Reader role and observe the failure.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-iq --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
