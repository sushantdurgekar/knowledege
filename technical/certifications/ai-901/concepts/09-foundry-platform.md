---
title: Azure + Microsoft Foundry platform, models, deployments, endpoints
track: technical
domain: certifications
subject: ai-901
tags: [exam-ai-901, domain-2, foundry, deployment]
status: learning
created: 2026-10-02
updated: 2026-10-02
sources:
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/2-what-is-azure/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/3-develop-ai-apps/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/4-microsoft-foundry/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/5-endpoints/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-generative-ai-and-agents/2-generative-ai-models/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/azure/foundry/concepts/rbac-foundry
    accessed: 2026-10-02
---
# Azure + Microsoft Foundry

## Azure hierarchy (Learn analogy: apartment building)
**Tenant** (org identity: users, groups, policies) → **Subscription** (billing container; cost, quota, access boundary) → **Resource group** (folder of related resources; permissions/policies; delete RG = clean-up) → **Resource** (e.g., storage account, **Foundry resource**; has type, name/ID, region, tier).
Create via **Azure portal** (portal.azure.com) or **programmatically** (CLI/scripts/IaC → repeatable, fewer errors).

## Building blocks of an AI app on Azure
- Security: **Microsoft Entra ID** (identity), **RBAC**, **Azure Key Vault** (secrets: keys, connection strings), **managed identity** (app fetches secrets without storing them).
- Hosting: **App Service** (web apps/APIs), **AKS** (containers). Scale **out** = more instances; scale **up** = bigger instance.
- Data: Azure SQL Database, **Cosmos DB** (global NoSQL), PostgreSQL.
- AI: **Microsoft Foundry** - unified enterprise **PaaS** for models, agents, tools, knowledge (Foundry IQ), evaluation, governance.

## Foundry resource vs project
| Foundry **resource** (Azure resource) | Foundry **project** (workspace inside resource) |
|---|---|
| Access to models, Agent Service, deployment governance, monitoring, security boundary, **quotas** | Agents, evaluations, files/datasets, vector indexes, flows, connections, settings |
| One per team/department | Many - one per use case |
Portal **ai.azure.com** - toggle **New Foundry** (new UI shows only Foundry projects; Classic for other types). Nav: **Discover** (models, tools) · **Build** (agents, workflows, models/deployments, fine-tuning, tools, knowledge, **guardrails**, memory, data, evaluations) · **Operate** (assets, compliance, **quota**, admin) · Docs. **Ask AI** helper agent.
Project home shows **Project endpoint**, **API key**, and a separate **Azure OpenAI endpoint** (don't mix them up).

## Endpoints & auth
- Endpoint = URL receiving API calls (REST, JSON). Project endpoint: `https://<resource>.services.ai.azure.com/api/projects/<project>`; OpenAI-compatible v1: `https://<resource>.openai.azure.com/openai/v1/`; Azure AI services: `https://<resource>.cognitiveservices.azure.com/`.
- Auth: **API key** (header `api-key`) or **Microsoft Entra ID** token (`Authorization: Bearer ...`, `DefaultAzureCredential`). Keys live in **Key Vault**, never in code/GitHub. Agent/project API = Entra ID.
- SDKs wrap REST: Python, JavaScript, C#. Client app = UI/CLI, collect input, format request, call server, display; server (model **deployment**) runs inference, applies system prompt/safety, returns output.

## Choosing models
Model catalog (1000+; filter by collection/provider, capability, **inference task**; leaderboards, benchmarks, compare, "Try with your own data"; model cards).
| Need | Pick |
|---|---|
| Fast, high-volume chat/support | GPT-4.1 / -mini (low latency) |
| Deep multi-step reasoning, agents, long context | GPT-5.x reasoning (adjustable thinking), Claude Opus |
| Local/device, cheap, focused | SLM (Phi-4, small Llama) |
| Embeddings for search/RAG | text-embedding-3-small/large |
| Images/audio in prompt | multimodal (GPT-4.1/5.x, Phi-4-multimodal) / audio models |
| Generate images / video | GPT-Image-1.x, FLUX / Sora |
| Well-defined task (PII, OCR, STT) | Foundry Tools (prebuilt, predictable) |
Models "sold directly by Azure" (Microsoft terms, SLAs) vs partners/community.

## Deploying
Deployment = model behind a stable, secure, scalable endpoint. Set: **deployment type**, **model version**, **TPM** rate limit. On deploy: compute allocated, endpoint created, config locked, monitoring on.
| Type | Data processed | Billing |
|---|---|---|
| **Global Standard** (default start) | any Azure region | pay per token |
| Data Zone Standard | within US/EU zone | pay per token |
| Standard (regional) | within geography | pay per token |
| Global / Data Zone / Regional **Provisioned** | as above | reserved **PTU**, predictable latency |
| Global / Data Zone **Batch** | as above | ~50% cheaper, async within 24h |
| Developer | any | fine-tuned model testing, 24h, no SLA |
- **TPM** (tokens per minute) → also governs RPM. Exceed → **throttling** (HTTP 429 rate-limit). Fix: lower `max_output_tokens`, fewer concurrent requests, more quota.

## Parameters
- **Temperature**: higher = creative/varied; lower = consistent/deterministic.
- **Max output tokens**: caps length (and TPM use).
- **System instructions**: role, tone, tools, guardrails. (Also top_p, stop sequences, penalties exist.)

## Evaluate & govern
Evaluators (quality: groundedness, relevance, coherence, fluency, similarity; NLP: F1 etc.; **safety**: hate, violence, self-harm, sexual, protected material) - detect/score only. Guardrails = content filters (4 harm categories × severity), Prompt Shields, protected material, groundedness detection.

## RBAC (least privilege)
**Foundry User** (formerly Azure AI User) = build/use agents in a project · **Foundry Agent Consumer** = only call agents · Foundry Project Manager · Foundry Account Owner (deploy models, assign roles) · Owner/Contributor/Reader (Azure) · Cognitive Services User/Contributor. Older blogs: "Cognitive Services OpenAI User" = inference only.

## Exam traps
- Billing boundary = subscription; organizational folder = resource group.
- Delete resource group to remove all lab resources.
- Project endpoint ≠ Azure OpenAI endpoint.
- Throttling → reduce max tokens/concurrency or raise TPM - not raise temperature.
- Data residency requirement → Data Zone / Standard, not Global.

## SRS cards
ai901-fd-01..06
