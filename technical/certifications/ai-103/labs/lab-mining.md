---
title: "Document Intelligence and knowledge mining"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, x02, x03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/04-knowledge-mining.html
    accessed: 2026-10-02
---
# Lab: Document Intelligence and knowledge mining

> AI-103 · about 85 min · practises [x02](../concepts/x02-ocr-layout-and-document-intelligence.md), [x03](../concepts/x03-azure-ai-search-ingest-enrich-and-index.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/04-knowledge-mining.html)

## Goal
Extract fields with Document Intelligence; build an Azure AI Search indexer pipeline with skills and a knowledge store.

## ⚠️ Cost (medium)
Azure AI Search bills hourly while it exists; AI skills bill per document beyond the free allowance. Delete the same day.

## Steps
1. Lab 03: prebuilt invoice analysis from Python.
2. Lab 04: data source + skillset (OCR, merge, entities) + index + knowledge store; query the index.

## Verify
- [ ] Scanned text is searchable; projections appear in Storage.

## Break it (then fix it)
- Remove the merge skill and see OCR text disappear from search.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-mining --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
