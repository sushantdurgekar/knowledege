---
title: "Use a custom function in an AI agent"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a02, a03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/02-agent-custom-tools.html
    accessed: 2026-10-02
---
# Lab: Use a custom function in an AI agent

> AI-103 · about 40 min · practises [a02](../concepts/a02-build-agents-in-code-agent-service-sdk.md), [a03](../concepts/a03-agent-tools-catalog-openapi-functions-and-more.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/02-agent-custom-tools.html)

## Goal
Define a FunctionTool, run the function locally and return FunctionCallOutput.

## ⚠️ Cost (low)
Tokens only.

## Steps
1. Create the agent version with a FunctionTool definition.
2. Run a conversation; detect function_call items; execute; return outputs.

## Verify
- [ ] The agent's reply includes data returned by your function.

## Break it (then fix it)
- Make the schema non-strict and send ambiguous requests; compare argument quality.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
