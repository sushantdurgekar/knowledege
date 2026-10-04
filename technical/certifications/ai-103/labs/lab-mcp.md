---
title: "Extend agents with MCP tools"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/03-mcp-integration.html
    accessed: 2026-10-02
---
# Lab: Extend agents with MCP tools

> AI-103 · about 40 min · practises [a04](../concepts/a04-mcp-tools-and-approval-loops.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/03-mcp-integration.html)

## Goal
Connect remote and local MCP servers and implement the approval loop.

## ⚠️ Cost (low)
Tokens only (the Microsoft Learn MCP server is public).

## Steps
1. Add the Microsoft Learn MCP server as an MCPTool with approval required.
2. Handle mcp_approval_request items in code.
3. Build a small FastMCP server and use it through your own client.

## Verify
- [ ] Approvals appear before each call; answers use MCP results.

## Break it (then fix it)
- Set require_approval to never and discuss when that's acceptable.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
