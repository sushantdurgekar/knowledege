---
title: "Build AI agents with the portal and VS Code"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/01-build-agent-portal-and-vscode.html
    accessed: 2026-10-02
---
# Lab: Build AI agents with the portal and VS Code

> AI-103 · about 45 min · practises [a01](../concepts/a01-agent-anatomy-in-foundry-agent-service.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/01-build-agent-portal-and-vscode.html)

## Goal
Create a prompt agent with file search and code interpreter in the portal and with the Foundry Toolkit.

## ⚠️ Cost (low)
Tokens and small file storage.

## Steps
1. Create an agent in the portal; add instructions and tools; test.
2. Open it in VS Code (Foundry Toolkit); view the YAML; generate code.

## Verify
- [ ] The agent uses file search for document questions and code interpreter for data.

## Break it (then fix it)
- Remove the grounding rule from the instructions and test out-of-scope questions.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
