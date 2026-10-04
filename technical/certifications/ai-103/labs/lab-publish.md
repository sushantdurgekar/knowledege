---
title: "Deploy agents to Microsoft Teams and Copilot"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a06]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/05a-m365-teams-integration.html
    accessed: 2026-10-02
---
# Lab: Deploy agents to Microsoft Teams and Copilot

> AI-103 · about 40 min · practises [a06](../concepts/a06-publish-agents-to-teams-microsoft-365-and-apps.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/05a-m365-teams-integration.html)

## Goal
Publish an agent application and make it available in Teams and Microsoft 365 Copilot.

## ⚠️ Cost (low)
Bot Service standard channels are typically free; you pay for model usage. Needs a Microsoft 365 tenant where you can upload apps.

## Steps
1. Publish the agent (agent application).
2. Publish to Teams and Microsoft 365 Copilot with Shared scope; provide icons and metadata.
3. Re-grant tool roles to the agent identity; test in Teams.

## Verify
- [ ] The agent answers in Teams and its tools work.

## Break it (then fix it)
- Skip the role assignment for the agent identity and observe tool failures.

## Teardown (do it the same day)
```bash
# Remove the Teams app, then delete the resource group
az group delete --name rg-ai103-publish --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
