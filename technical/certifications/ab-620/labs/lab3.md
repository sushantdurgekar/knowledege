---
title: "Knowledge and tools: Dataverse, MCP (Work IQ) and a connector"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, k01, k02, k03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-3-integrate-knowledge-and-tools
    accessed: 2026-10-02
---
# Lab: Knowledge and tools: Dataverse, MCP (Work IQ) and a connector

> AB-620 · about 65 min · practises [k01](../concepts/k01-enterprise-knowledge-copilot-connectors-real-time-connectors.md), [k02](../concepts/k02-connector-tools-custom-connectors-and-rest-apis.md), [k03](../concepts/k03-mcp-tools.md) · [guide](https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-3-integrate-knowledge-and-tools)

## Goal
Add Dataverse tools, connect an MCP server (Work IQ) with only read tools enabled, add an Outlook connector tool, audit the tool inventory and run a multi-tool test.

## ⚠️ Cost (low)
Work IQ uses usage-based billing (and needs Microsoft 365 Copilot licensing); every Preview turn uses Copilot Credits.

## Prerequisites
- Lab 2 tables and data
- Microsoft 365 Copilot licence for Work IQ (or skip that part)

## Steps
1. Add Dataverse **List rows from selected environment** as a tool; tune inputs and *Description for AI*.
2. Add MCP: Tools > Add tool > filter Model Context Protocol > **Work IQ**; create the connection.
3. Turn **Allow all** off; disable send/delete/schedule tools.
4. Add **Outlook – Send an email** as a connector tool.
5. Audit every tool's description and run a Preview test that needs knowledge, a workflow, MCP and a connector in one turn.

## Verify
- [ ] The activity map shows the right tool for each part of the request.
- [ ] Disabled MCP tools are never called.

## Break it (then fix it)
- Turn Allow all on and ask for an action; see which tool the orchestrator picks.

## Teardown (do it the same day)
```bash
Remove the Work IQ connection if you won't use it.
# Delete the Outlook connection from Power Automate > Connections if no longer needed.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
