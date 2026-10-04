---
title: "Automated RAG ingestion pipeline"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, x04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/05-rag-pipeline.html
    accessed: 2026-10-02
---
# Lab: Automated RAG ingestion pipeline

> AI-103 · about 45 min · practises [x04](../concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-information-extraction/Instructions/Exercises/05-rag-pipeline.html)

## Goal
Content Understanding → markdown → chunk → embed → index, with change detection, and a RAG agent over the index.

## ⚠️ Cost (medium)
Search service hours, CU processing and embeddings; delete promptly.

## Steps
1. Run the ingestion script; inspect chunks and vectors in the index.
2. Add a file; watch change detection re-ingest only that file.
3. Ask the RAG agent questions; check citations.

## Verify
- [ ] Answers cite sources; unchanged files aren't reprocessed.

## Break it (then fix it)
- Embed queries with a different model and observe nonsense results.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-rag --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
