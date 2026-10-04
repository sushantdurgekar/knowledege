---
title: "Build, host and govern an MCP server"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d05, d06]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/03-mcp-integration.html
    accessed: 2026-10-02
---
# Lab: Build, host and govern an MCP server

> AI-500 · about 100 min · practises [d05](../concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md), [d06](../concepts/d06-tool-errors-fallbacks-and-result-validation.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/03-mcp-integration.html)

## Goal
Connect an agent to MCP tools, then build your own FastMCP server, host it on Container Apps with Entra auth, add retries, a circuit breaker and result validation, and register it.

## ⚠️ Cost (low)
Container Apps consumption with min replicas 1 incurs a small hourly cost; delete afterwards.

## Prerequisites
- Docker or Azure Container Registry build
- Python MCP SDK (`pip install mcp`)

## Steps
1. Complete the official MCP exercise (agent + MCP tool with approvals).
2. Write a FastMCP server with two read-only tools and one write tool; version the path (/v1).
3. Deploy to Container Apps (internal ingress, min replicas 1); protect with Entra auth.
4. Attach it to an agent with `allowed_tools` and approvals for the write tool.
5. Add tenacity retries, a circuit breaker with a structured fallback and Pydantic result validation.

## Verify
- [ ] The agent only sees allowed tools; the write tool requires approval.
- [ ] Simulated 503s trigger backoff, then the breaker and fallback.

## Break it (then fix it)
- Return a tool result containing an injected instruction; confirm validation flags it.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-mcp --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
