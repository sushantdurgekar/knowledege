---
title: "AI-103 blueprint"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, blueprint]
status: learning
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-103
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience
    accessed: 2026-10-02
  - url: https://aka.ms/examdemo
    accessed: 2026-10-02
---
# AI-103 blueprint: Microsoft Certified: Azure AI Apps and Agents Developer Associate

> Skills outline as of **16 April 2026** (checked 2026-10-02). Study Hub: https://claude.ai/artifact/TdpMZLFYA9knTdjNyCms9F

## Exam facts
- **700**: passing score (scale 1–1000)
- **120 min**: exam time (cert page)
- **40–60**: questions, typical for role-based exams
- **5**: skill domains (outline of 16 Apr 2026)
- **Python**: language used in code questions
- **Free**: annual online renewal

## Notices (read before booking)
- **AI-102 is retired; AI-103 replaces it.** AI-102 and the *Azure AI Engineer Associate* certification were retired on 30 June 2026. If you already hold Azure AI Engineer Associate it stays valid until its expiry date, but the new target is **Azure AI Apps and Agents Developer Associate** via AI-103. AI-103 drops classic CLU and custom question answering, and adds agents (30–35%), image and video generation, and visual Q&A.
- **Check two things before you book.** 1) The study guide's *skills measured as of* date (this hub uses **16 April 2026**). 2) Whether Microsoft has released the free practice assessment for AI-103 on the exam page, and whether your exam includes hands-on lab items. Learners report that Microsoft Learn is available inside role-based exams in a split window; treat that as a time-costly last resort, not a strategy.
- **What changed after the 16 April 2026 outline (checked 2 Oct 2026).** Foundry changes faster than exams are revised, so this hub teaches the **outline concept** and flags **today's behaviour**. 1) **Agents** (July 2026): new agents get their own Entra agent identity and a stable endpoint when they're created; *publish* now means distributing to Teams and Microsoft 365, and *agent applications* are the legacy model. 2) **Foundry workflows** (the visual designer) retire on **1 Dec 2026**; build new workflows with Microsoft Agent Framework. 3) Content Understanding **pro mode** lived only in a retired preview API (successor: **agentic mode**, preview), and **confidence and grounding come only from document analyzers**. 4) Model retirements: gpt-4.1-nano (14 Oct 2026), gpt-4o-transcribe 2025-03-20 and sora-2 (15 Oct 2026), gpt-image-1 (23 Oct 2026). Where an exam-style answer and today's product differ, the explanation says so.

## Domains and weights
| Domain | Weight | Modules |
|---|---|---|
| D1 Plan and manage an Azure AI solution | 25–30% | f01, p01, p02, p03, p04, p05, p06, p07, p08 |
| D2 Implement generative AI and agentic solutions | 30–35% | g01, g02, g03, g04, g05, g06, a01, a02, a03, a04, a05, a06, a07, a08, a09 |
| D3 Implement computer vision solutions | 10–15% | v01, v02, v03, v04, v05 |
| D4 Implement text analysis solutions | 10–15% | t01, t02, t03, t04 |
| D5 Implement information extraction solutions | 10–15% | x01, x02, x03, x04 |

## Skills measured → where to study them
### D1 Plan and manage an Azure AI solution (25–30%)
**Choose the appropriate Foundry services for generative AI and agents**

- [ ] Choose an appropriate model for each task, including LLMs, small language models, multimodal models, and Foundry Tools → [p02](concepts/p02-choose-the-right-model-or-tool.md)
- [ ] Choose the appropriate Foundry services for generative tasks, grounding, vector search, agent workflows, or multimodal processing → [p01](concepts/p01-foundry-platform-map.md), [p02](concepts/p02-choose-the-right-model-or-tool.md)
- [ ] Choose an appropriate method for retrieval and indexing → [g04](concepts/g04-ground-or-tune-rag-retrieval-choices-and-fine-tuning.md), [x03](concepts/x03-azure-ai-search-ingest-enrich-and-index.md), [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md)
- [ ] Choose appropriate memory, tool, and knowledge integration services for agent solutions → [a03](concepts/a03-agent-tools-catalog-openapi-functions-and-more.md), [a05](concepts/a05-knowledge-and-memory-for-agents-foundry-iq.md)

**Set up AI solutions in Foundry**

- [ ] Design Azure infrastructure for AI apps and agent-based solutions → [p01](concepts/p01-foundry-platform-map.md), [p04](concepts/p04-secure-foundry-identity-roles-and-networks.md), [f01](concepts/f01-python-and-azure-survival-kit.md)
- [ ] Choose appropriate deployment options → [p03](concepts/p03-deployments-quotas-rate-limits-and-cost.md)
- [ ] Configure model and agent deployments → [p03](concepts/p03-deployments-quotas-rate-limits-and-cost.md), [a01](concepts/a01-agent-anatomy-in-foundry-agent-service.md), [a06](concepts/a06-publish-agents-to-teams-microsoft-365-and-apps.md)
- [ ] Integrate Foundry projects with CI/CD pipelines → [p08](concepts/p08-ci-cd-and-infrastructure-for-foundry-projects.md)

**Manage, monitor, and secure AI systems**

- [ ] Manage quotas, scaling, rate limits, and cost footprints for model and agent workloads → [p03](concepts/p03-deployments-quotas-rate-limits-and-cost.md)
- [ ] Monitor model performance, drift, safety events, and grounding quality → [p07](concepts/p07-monitor-tracing-drift-and-production-evaluation.md), [g05](concepts/g05-evaluate-models-and-apps.md)
- [ ] Monitor data ingestion quality, search index health, and relevance performance → [x03](concepts/x03-azure-ai-search-ingest-enrich-and-index.md), [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md), [p07](concepts/p07-monitor-tracing-drift-and-production-evaluation.md)
- [ ] Configure security, including managed identity, private networking, keyless credentials, and role policies → [p04](concepts/p04-secure-foundry-identity-roles-and-networks.md)

**Implement responsible AI across generative AI and agentic systems**

- [ ] Configure safety filters, guardrails, risk detection, and content moderation → [p05](concepts/p05-responsible-ai-guardrails-and-content-safety.md)
- [ ] Apply responsible AI instrumentation, including evaluators, safety evaluations, and explanation tooling → [g05](concepts/g05-evaluate-models-and-apps.md), [p05](concepts/p05-responsible-ai-guardrails-and-content-safety.md)
- [ ] Implement auditing through trace logging, provenance metadata, and approval workflows → [p06](concepts/p06-govern-agents-autonomy-approvals-and-audit.md), [p07](concepts/p07-monitor-tracing-drift-and-production-evaluation.md)
- [ ] Govern agent behavior with oversight modes, constraints, and tool-access controls → [p06](concepts/p06-govern-agents-autonomy-approvals-and-audit.md)

### D2 Implement generative AI and agentic solutions (30–35%)
**Build generative applications by using Foundry**

- [ ] Deploy and consume LLMs, small models, code models, and multimodal models → [p03](concepts/p03-deployments-quotas-rate-limits-and-cost.md), [g01](concepts/g01-connect-an-app-sdks-endpoints-and-the-responses-api.md)
- [ ] Implement retrieval-augmented generation (RAG) in an application → [g04](concepts/g04-ground-or-tune-rag-retrieval-choices-and-fine-tuning.md), [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md)
- [ ] Design workflows, tool-augmented flows, and multistep reasoning pipelines → [g03](concepts/g03-tool-augmented-apps-with-the-responses-api.md), [g06](concepts/g06-reflection-loops-multi-model-flows-and-hybrid-rules.md), [a07](concepts/a07-foundry-workflows-visual-multi-step-and-human-in-the-loop.md)
- [ ] Evaluate models and apps, including detecting fabrications, relevance, quality, and safety → [g05](concepts/g05-evaluate-models-and-apps.md)
- [ ] Integrate generative workflows into applications by using Foundry SDKs and connectors → [g01](concepts/g01-connect-an-app-sdks-endpoints-and-the-responses-api.md)
- [ ] Configure an application to connect to a Foundry project → [g01](concepts/g01-connect-an-app-sdks-endpoints-and-the-responses-api.md)

**Build agents by using Foundry**

- [ ] Define agent roles, goals, conversation-tracking approach, and tool schemas → [a01](concepts/a01-agent-anatomy-in-foundry-agent-service.md), [a02](concepts/a02-build-agents-in-code-agent-service-sdk.md)
- [ ] Build agents that integrate retrieval, function-calling, and conversation memory → [a02](concepts/a02-build-agents-in-code-agent-service-sdk.md), [a05](concepts/a05-knowledge-and-memory-for-agents-foundry-iq.md)
- [ ] Integrate agent tools, including APIs, knowledge stores, search, content understanding, and custom functions → [a03](concepts/a03-agent-tools-catalog-openapi-functions-and-more.md), [a04](concepts/a04-mcp-tools-and-approval-loops.md)
- [ ] Implement orchestrated multi-agent solutions → [a08](concepts/a08-microsoft-agent-framework-and-orchestration-patterns.md), [a09](concepts/a09-a2a-connecting-remote-agents.md)
- [ ] Build autonomous or semiautonomous workflows with safeguards and approval flow controls → [a07](concepts/a07-foundry-workflows-visual-multi-step-and-human-in-the-loop.md), [a04](concepts/a04-mcp-tools-and-approval-loops.md), [p06](concepts/p06-govern-agents-autonomy-approvals-and-audit.md)
- [ ] Integrate monitoring into deployed agents, evaluate agent behavior, and perform error analysis → [p07](concepts/p07-monitor-tracing-drift-and-production-evaluation.md), [g05](concepts/g05-evaluate-models-and-apps.md)

**Optimize and operationalize generative AI systems**

- [ ] Tune generation behavior, such as prompt engineering and adjusting model parameters → [g02](concepts/g02-tune-generation-prompts-parameters-reasoning-and-structured.md)
- [ ] Implement model reflection, chain-of-thought evaluations, and self-critique loops → [g06](concepts/g06-reflection-loops-multi-model-flows-and-hybrid-rules.md)
- [ ] Set up observability by implementing tracing, token analytics, safety signals, and latency breakdowns → [p07](concepts/p07-monitor-tracing-drift-and-production-evaluation.md)
- [ ] Orchestrate multiple models, flows, or hybrid LLM and rules engines → [g06](concepts/g06-reflection-loops-multi-model-flows-and-hybrid-rules.md), [a08](concepts/a08-microsoft-agent-framework-and-orchestration-patterns.md)

### D3 Implement computer vision solutions (10–15%)
**Design and implement image- and video-generation solutions**

- [ ] Implement a solution that generates images from text prompts and reference media → [v02](concepts/v02-image-generation-and-editing.md)
- [ ] Implement a solution that generates videos from text prompts and reference media → [v03](concepts/v03-video-generation-and-editing-with-sora-2.md)
- [ ] Configure image-editing workflows, including inpainting, mask-based edits, and prompt-driven modifications → [v02](concepts/v02-image-generation-and-editing.md)
- [ ] Implement workflows to edit generated videos → [v03](concepts/v03-video-generation-and-editing-with-sora-2.md)
- [ ] Select and apply appropriate generation and editing controls provided by the platform → [v02](concepts/v02-image-generation-and-editing.md), [v03](concepts/v03-video-generation-and-editing-with-sora-2.md)

**Design and implement multimodal understanding workflows**

- [ ] Build a solution that analyzes visual context by using multimodal models → [v01](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md)
- [ ] Configure apps to produce concise or detailed captions for single or multiple images → [v01](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md)
- [ ] Implement a solution that enables question-answering grounded in visual evidence → [v01](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md)
- [ ] Configure generation of alt-text and extended image descriptions aligned to accessibility guidelines → [v01](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md)
- [ ] Implement visual understanding by configuring Azure Content Understanding to extract visual characteristics → [v05](concepts/v05-content-understanding-for-images-and-video.md)
- [ ] Implement video analysis workflows to process and interpret video segments → [v05](concepts/v05-content-understanding-for-images-and-video.md)
- [ ] Configure single-task and pro-mode Content Understanding pipelines → [v05](concepts/v05-content-understanding-for-images-and-video.md), [x01](concepts/x01-content-understanding-for-documents-and-rag.md)
- [ ] Implement solutions that identify objects, components, or regions within images or video → [v01](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md), [v05](concepts/v05-content-understanding-for-images-and-video.md)

**Implement responsible AI for multimodal content**

- [ ] Implement filters to classify unsafe or disallowed visual content → [v04](concepts/v04-responsible-ai-for-visual-content.md)
- [ ] Detect and mitigate indirect prompt injection by using embedded text in images → [v04](concepts/v04-responsible-ai-for-visual-content.md)
- [ ] Enforce visual policy rules (watermarks, prohibited symbols, brand usage, inappropriate content) → [v04](concepts/v04-responsible-ai-for-visual-content.md)

### D4 Implement text analysis solutions (10–15%)
**Apply language model text analysis**

- [ ] Extract entities, topics, summaries, and structured JSON outputs by using generative prompting and Foundry Tools → [t01](concepts/t01-text-analysis-with-llms-and-azure-language.md)
- [ ] Configure detection of sentiment, tone, safety issues, and sensitive content → [t01](concepts/t01-text-analysis-with-llms-and-azure-language.md)
- [ ] Translate text by using Azure Translator in Foundry Tools or LLM-powered translation flows → [t02](concepts/t02-translate-text-and-speech.md)
- [ ] Customize language model outputs for domain tasks, such as compliance summarization and domain extraction → [t01](concepts/t01-text-analysis-with-llms-and-azure-language.md), [g02](concepts/g02-tune-generation-prompts-parameters-reasoning-and-structured.md)

**Implement speech solutions**

- [ ] Convert speech to text and text to speech for agentic interactions → [t03](concepts/t03-speech-to-text-and-text-to-speech.md)
- [ ] Integrate speech as an agent modality, including custom speech models → [t04](concepts/t04-voice-agents-and-reasoning-over-audio.md), [t03](concepts/t03-speech-to-text-and-text-to-speech.md)
- [ ] Enable multimodal reasoning from audio inputs → [t04](concepts/t04-voice-agents-and-reasoning-over-audio.md)
- [ ] Translate speech into other languages by using language models and Foundry Tools → [t02](concepts/t02-translate-text-and-speech.md)

### D5 Implement information extraction solutions (10–15%)
**Build retrieval and grounding pipelines**

- [ ] Ingest and index content, such as documents, images, audio, and video → [x03](concepts/x03-azure-ai-search-ingest-enrich-and-index.md), [x01](concepts/x01-content-understanding-for-documents-and-rag.md)
- [ ] Configure semantic search, hybrid search, and vector search for grounding → [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md)
- [ ] Implement enrichment by using custom or built-in skills for text, images, and layout → [x03](concepts/x03-azure-ai-search-ingest-enrich-and-index.md)
- [ ] Configure RAG ingestion flow, including documents and using OCR → [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md), [x02](concepts/x02-ocr-layout-and-document-intelligence.md)
- [ ] Connect retrieval pipelines directly to workflows and agent tools → [x04](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md), [a05](concepts/a05-knowledge-and-memory-for-agents-foundry-iq.md)

**Extract content from documents**

- [ ] Extract information by using multimodal pipelines that combine OCR, layout analysis, and field extraction → [x02](concepts/x02-ocr-layout-and-document-intelligence.md), [x01](concepts/x01-content-understanding-for-documents-and-rag.md)
- [ ] Produce clean, grounded representations to use with agents and RAG by using Content Understanding → [x01](concepts/x01-content-understanding-for-documents-and-rag.md)
- [ ] Implement analyzers for generating structured or markdown outputs for downstream reasoning by using Content Understanding → [x01](concepts/x01-content-understanding-for-documents-and-rag.md)

## Exam tactics
- Read the **last sentence first** (what is asked), then scan the scenario for constraints: cost, latency, data residency, least privilege, *no code*, *minimize development effort*.
- Underline qualifiers: **MOST, BEST, FIRST, LEAST, minimize, ensure**. Two options usually survive; the qualifier decides.
- For code drop-downs, read the variable names: `agent_reference`, `function_call_output`, `previous_response_id` and the deployment name are the tells.
- Multi-part items (Yes/No sets, drop-downs) earn partial credit: never leave a part blank.
- Budget about 1.5–2 minutes per question. Do standalone questions first; case studies take longer and you can't return to one after leaving it.
- Change an answer only for a concrete reason (a constraint you missed), never on a vague feeling.
