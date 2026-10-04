---
title: "Content Understanding: portal, client app and images"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, x01, v05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/01-content-understanding.html
    accessed: 2026-10-02
---
# Lab: Content Understanding: portal, client app and images

> AI-103 · about 90 min · practises [x01](../concepts/x01-content-understanding-for-documents-and-rag.md), [v05](../concepts/v05-content-understanding-for-images-and-video.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/01-content-understanding.html)

## Goal
Build analyzers in the studio, call them from Python/REST, and analyse images.

## ⚠️ Cost (medium)
Billed per page/minute processed plus model usage; use small samples.

## Prerequisites
- Default model deployments configured for Content Understanding

## Steps
1. Lab 01 (extraction): build an analyzer from samples; test confidence and grounding.
2. Lab 02 (extraction): create and call an analyzer from code.
3. Vision lab 04: image analyzer with classify fields.

## Verify
- [ ] Fields return with confidence; markdown output is produced.

## Break it (then fix it)
- Change a classify enum and re-test; try an extract field for an inferred value.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-cu --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
