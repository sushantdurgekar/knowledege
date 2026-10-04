---
title: "Develop a vision-enabled chat app"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, v01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-vision/Instructions/Exercises/01-gen-ai-vision.html
    accessed: 2026-10-02
---
# Lab: Develop a vision-enabled chat app

> AI-103 · about 30 min · practises [v01](../concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-vision/Instructions/Exercises/01-gen-ai-vision.html)

## Goal
Send images (URL and base64) to a multimodal model and build captions and visual Q&A.

## ⚠️ Cost (low)
Image tokens; use small images.

## Steps
1. Send an image URL with a question; then a local image as a data URL.
2. Produce concise and detailed captions; generate alt text.

## Verify
- [ ] Answers reference visible evidence.

## Break it (then fix it)
- Ask about a detail too small to see and add a 'say if you can't tell' rule.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-vision --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
