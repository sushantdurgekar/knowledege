---
title: "Multi-agent RAG: hybrid retrieval, reranking and shared knowledge"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d04, d03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/04-integrate-agent-with-foundry-iq.html
    accessed: 2026-10-02
---
# Lab: Multi-agent RAG: hybrid retrieval, reranking and shared knowledge

> AI-500 · about 120 min · practises [d04](../concepts/d04-multi-agent-rag-and-knowledge-integration.md), [d03](../concepts/d03-context-management-and-memory-implementation.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/04-integrate-agent-with-foundry-iq.html)

## Goal
Connect agents to a shared knowledge base, then tune retrieval with hybrid search, semantic ranking and labelled queries; add security trimming and citations.

## ⚠️ Cost (medium)
Azure AI Search is billed hourly by tier while it exists; embeddings and semantic ranker add usage costs. Use the Basic tier and delete the same day.

## Prerequisites
- Foundry project; Azure AI Search (Basic)
- 20–50 sample documents and 30 labelled queries (create them)

## Steps
1. Complete the official Foundry IQ exercise to connect an agent to a knowledge base.
2. Build a hybrid index (integrated vectorization) and compare keyword, vector and hybrid on your labelled queries (recall@50, precision@5).
3. Enable the semantic ranker; tune vector weight for code-heavy queries.
4. Try structural vs fixed-size chunking on one long document; re-measure.
5. Add a security-trimming filter and verify a restricted user can't retrieve restricted documents.

## Verify
- [ ] Precision@5 improves over pure vector search.
- [ ] Answers cite the correct sources; trimming works.

## Break it (then fix it)
- Mix two embedding models in one index and observe recall collapse; fix with a new (blue-green) index.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-rag --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
