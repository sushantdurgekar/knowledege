---
title: "AI gateway: token limits, semantic caching and token metrics"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, d10, v05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/Azure-Samples/AI-Gateway
    accessed: 2026-10-02
---
# Lab: AI gateway: token limits, semantic caching and token metrics

> AI-500 · about 90 min · practises [d10](../concepts/d10-caching-strategy-batching-and-cost-aware-execution.md), [v05](../concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md) · [guide](https://github.com/Azure-Samples/AI-Gateway)

## Goal
Put API Management in front of model deployments; add per-subscription token limits, semantic caching with vary-by, and token metrics for chargeback.

## ⚠️ Cost (medium)
API Management and Azure Managed Redis are billed while they exist (choose developer/basic tiers); delete the same day.

## Prerequisites
- Azure subscription; the AI Gateway labs repository (semantic caching, token rate limiting, token metrics labs)

## Steps
1. Deploy APIM in front of a model deployment (per the lab).
2. Add `llm-token-limit` per subscription and test 429 behaviour.
3. Add `llm-semantic-cache-lookup`/`store` with an embeddings backend; tune `score-threshold`; add `vary-by`.
4. Emit token metrics with dimensions (subscription/tenant) and build a showback query.
5. Measure hit rate and false hits on paraphrase pairs.

## Verify
- [ ] Cache hits for paraphrases; no cross-subscription hits.
- [ ] Token metrics per tenant appear in Azure Monitor.

## Break it (then fix it)
- Set score-threshold too high and observe wrong-answer hits; fix it.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-gateway --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
