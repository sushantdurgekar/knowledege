---
title: "Prepare for an AI development project"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, p01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/01-Explore-ai-studio.html
    accessed: 2026-10-02
---
# Lab: Prepare for an AI development project

> AI-103 · about 30 min · practises [p01](../concepts/p01-foundry-platform-map.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/01-Explore-ai-studio.html)

## Goal
Create a Foundry resource and project, explore the portal areas, and find endpoints and keys.

## ⚠️ Cost (low)
Creating the resource is free; you pay only for model usage. Delete the resource group when done.

## Prerequisites
- Azure subscription where you can create resources
- A region with the models you'll use (check availability)

## Steps
1. Create a Foundry resource (default project included) in a new resource group.
2. Tour Discover, Build and Operate in the portal.
3. Copy the project endpoint; note where resource-level endpoints and keys live.
4. Deploy a chat model and try the playground.

## Verify
- [ ] You can explain resource vs project, and find both endpoint types.
- [ ] A playground chat works with your deployment name.

## Break it (then fix it)
- Call a Foundry Tools SDK with the project endpoint and observe the error; fix it with the resource endpoint.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-prepare --yes --no-wait
# Foundry (AI services) accounts are soft-deleted; purge to free the name and quota:
az cognitiveservices account purge --name <resource-name> --resource-group rg-ai103-prepare --location <region>
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
