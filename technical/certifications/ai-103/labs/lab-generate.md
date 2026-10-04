---
title: "Generate images and video"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, v02, v03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-vision/Instructions/Exercises/02-generate-image.html
    accessed: 2026-10-02
---
# Lab: Generate images and video

> AI-103 · about 60 min · practises [v02](../concepts/v02-image-generation-and-editing.md), [v03](../concepts/v03-video-generation-and-editing-with-sora-2.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-vision/Instructions/Exercises/02-generate-image.html)

## Goal
Generate and edit images with gpt-image models; generate, poll, download and remix Sora 2 video.

## ⚠️ Cost (high)
Image and especially video generation are among the most expensive calls. Generate a handful of short clips only and delete deployments afterwards.

## Steps
1. Lab 02: images.generate with size/quality; images.edit with a mask.
2. Lab 03: videos.create → poll → download; remix with one change.

## Verify
- [ ] A masked edit changes only the transparent region; a remixed clip has a new id.

## Break it (then fix it)
- Use a mask with the wrong dimensions and read the error.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-generate --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
