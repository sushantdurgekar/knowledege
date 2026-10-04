---
title: "Apply guardrails to prevent harmful content"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, p05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/06-Explore-content-filters.html
    accessed: 2026-10-02
---
# Lab: Apply guardrails to prevent harmful content

> AI-103 · about 30 min · practises [p05](../concepts/p05-responsible-ai-guardrails-and-content-safety.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/06-Explore-content-filters.html)

## Goal
Create a custom guardrail, test thresholds and observe blocking behaviour.

## ⚠️ Cost (low)
Tokens only.

## Steps
1. Test the default guardrail with borderline prompts.
2. Create a custom guardrail with stricter thresholds and Prompt Shields.
3. Attach it to the deployment; retest; inspect responses for filter results.

## Verify
- [ ] You can show a 400 content_filter (input) and a filtered output.

## Break it (then fix it)
- Set a threshold to High and see what gets through.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-safety --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
