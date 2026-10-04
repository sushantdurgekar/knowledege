---
title: "Fine-tune a language model"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, g04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/04b-finetune-model.html
    accessed: 2026-10-02
---
# Lab: Fine-tune a language model

> AI-103 · about 60 min · practises [g04](../concepts/g04-ground-or-tune-rag-retrieval-choices-and-fine-tuning.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/04b-finetune-model.html)

## Goal
Run a supervised fine-tuning job and compare the result with the base model.

## ⚠️ Cost (high)
Training is billed, and a deployed fine-tuned model can incur hosting charges. Use the Developer deployment type where available and delete the deployment as soon as you finish.

## Steps
1. Prepare JSONL training (and validation) data with a consistent system message.
2. Start a fine-tuning job; watch loss curves.
3. Deploy the fine-tuned model and compare outputs with the base model.

## Verify
- [ ] The fine-tuned model follows the target style more consistently.

## Break it (then fix it)
- Use a different system message at inference than in training and compare.

## Teardown (do it the same day)
```bash
# Delete the fine-tuned deployment first, then the resource group
az group delete --name rg-ai103-finetune --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
