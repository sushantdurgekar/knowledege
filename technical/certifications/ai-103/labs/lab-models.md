---
title: "Explore and compare models"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, p02, g05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/02-model-catalog-evaluation.html
    accessed: 2026-10-02
---
# Lab: Explore and compare models

> AI-103 · about 45 min · practises [p02](../concepts/p02-choose-the-right-model-or-tool.md), [g05](../concepts/g05-evaluate-models-and-apps.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/02-model-catalog-evaluation.html)

## Goal
Use the leaderboard and model cards, compare models, and run a basic evaluation.

## ⚠️ Cost (low)
Token charges for test prompts and evaluation runs (evaluations call a judge model).

## Steps
1. Filter the catalogue by capability; open model cards and benchmark tabs.
2. Use trade-off charts and side-by-side comparison for two models.
3. Deploy two candidates and compare them manually in the playground.
4. Run an automated evaluation on a small dataset.

## Verify
- [ ] You can justify a model choice using quality, safety, cost and latency.

## Break it (then fix it)
- Swap the judge model for a tiny one and watch evaluation reasons become less useful.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-models --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
