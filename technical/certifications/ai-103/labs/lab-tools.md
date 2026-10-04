---
title: "Create a generative AI app that uses tools"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, g03, g04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/04a-use-own-data.html
    accessed: 2026-10-02
---
# Lab: Create a generative AI app that uses tools

> AI-103 · about 30 min · practises [g03](../concepts/g03-tool-augmented-apps-with-the-responses-api.md), [g04](../concepts/g04-ground-or-tune-rag-retrieval-choices-and-fine-tuning.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/04a-use-own-data.html)

## Goal
Use built-in tools (file search, code interpreter) and function calling from an app.

## ⚠️ Cost (low)
Tokens plus small vector store storage; delete stores afterwards.

## Steps
1. Create a vector store and upload documents.
2. Answer questions with the file_search tool and include results for citations.
3. Add a function tool and implement the function_call loop.

## Verify
- [ ] Answers cite your documents; your function output appears in the final answer.

## Break it (then fix it)
- Return a function_call_output with the wrong call_id.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-tools --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
