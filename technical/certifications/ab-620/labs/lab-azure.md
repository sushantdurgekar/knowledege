---
title: "Azure integration: Azure AI Search, Foundry model in a prompt, Fabric data agent, App Insights"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, z01, m02, k01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoft.github.io/mcs-labs/workshops/azure-ai-workshop/
    accessed: 2026-10-02
---
# Lab: Azure integration: Azure AI Search, Foundry model in a prompt, Fabric data agent, App Insights

> AB-620 · about 120 min · practises [z01](../concepts/z01-integrate-with-azure-ai-search-with-foundry-foundry-models-a.md), [m02](../concepts/m02-foundry-agents-fabric-data-agents-and-a2a.md), [k01](../concepts/k01-enterprise-knowledge-copilot-connectors-real-time-connectors.md) · [guide](https://microsoft.github.io/mcs-labs/workshops/azure-ai-workshop/)

## Goal
Ground an agent in an Azure AI Search index, connect a Foundry model to a prompt (bring your own model), connect a Fabric data agent, and send telemetry to Application Insights.

## ⚠️ Cost (medium)
Azure AI Search is billed hourly by tier while it exists; Foundry model calls are billed per token; a paid Fabric capacity (F2+) is billed while running. Use the smallest tiers, pause Fabric capacity, and delete Azure resources the same day.

## Prerequisites
- Azure subscription
- Optional: Fabric capacity F2+ (or skip the Fabric part)
- MCS Labs: *Contract alerts with Azure AI Search*, *BYOM tool*, *Fabric data agents* walkthroughs

## Steps
1. Create Azure AI Search with an integrated-vectorization index and semantic ranker; add it as knowledge (Entra ID auth); test citations.
2. Deploy a model in Foundry; in prompt builder connect it (deployment name, base model name); compare outputs with the default model.
3. Publish a Fabric data agent; add it via Agents > Add > Microsoft Fabric with User authentication.
4. Settings > Advanced: paste the Application Insights connection string; enable logging and node execution events.
5. In Logs, query `customEvents` with `designMode == "False"`.

## Verify
- [ ] Answers cite the search index's URLs.
- [ ] The prompt uses your Foundry model.
- [ ] KQL shows real (non-test) events.

## Break it (then fix it)
- Disable the semantic ranker and compare answer quality.
- Remove a user's access to the Fabric data agent and test with User authentication.

## Teardown (do it the same day)
```bash
az group delete --name rg-ab620-azure --yes --no-wait
# Pause or delete the Fabric capacity in the Azure portal
# Remove the Application Insights connection string from the agent if the resource is deleted
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
