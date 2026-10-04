---
title: "Analyze text and build a text analysis agent"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, t01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/01-analyze-text.html
    accessed: 2026-10-02
---
# Lab: Analyze text and build a text analysis agent

> AI-103 · about 60 min · practises [t01](../concepts/t01-text-analysis-with-llms-and-azure-language.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/01-analyze-text.html)

## Goal
Use Azure Language (language detection, entities, PII) from Python, then give an agent the Language MCP tools.

## ⚠️ Cost (low)
Azure Language has a free tier for small volumes; tokens for the agent.

## Steps
1. Lab 01: TextAnalyticsClient with the resource endpoint; detect language, entities, PII.
2. Lab 02: connect the Azure Language MCP server to an agent; ask it to redact and analyse text.

## Verify
- [ ] You get redacted_text and entity categories; the agent calls Language tools.

## Break it (then fix it)
- Use the project endpoint with TextAnalyticsClient and fix the 404.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-language --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
