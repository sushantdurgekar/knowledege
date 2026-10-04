---
title: "AI-103 (Microsoft Certified: Azure AI Apps and Agents Developer Associate)"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-103: Microsoft Certified: Azure AI Apps and Agents Developer Associate

AI-103 (*Developing AI Apps and Agents on Azure*) tests whether you can plan, build, secure and run generative AI apps and agents on **Microsoft Foundry** with Python. It replaces AI-102. This hub turns the official skills outline, every Microsoft Learn module and all the official labs into a paced course for a complete beginner.

## Start here
1. Open the **AI-103 Study Hub** (https://claude.ai/artifact/TdpMZLFYA9knTdjNyCms9F) and take the 15-minute diagnostic.
2. Work [roadmap.md](roadmap.md) top to bottom; each module has a concept note below for revision.
3. Log mocks in [readiness.md](readiness.md); book only when its gate is met.

## Status (2026-10-04)
Planned, not started. SRS cards (deck `ai-103`) start appearing from 2026-10-07, about two modules per day; re-date them if your pace differs.

| File | Purpose |
|---|---|
| [blueprint.md](blueprint.md) | Skills measured (with links to notes), exam facts, notices, tactics |
| [roadmap.md](roadmap.md) | Ordered blocks with checkboxes (modules, labs, cases, mocks) |
| [readiness.md](readiness.md) | Readiness gate + history |
| [resources.md](resources.md) | Rated links (accessed 2026-10-02) |
| [misconceptions.md](misconceptions.md) | Traps by module |
| [cheat-sheet.md](cheat-sheet.md) · [glossary.md](glossary.md) | Last-week revision |
| [interview.md](interview.md) | Interview Q&A with follow-ups |
| concepts/ · labs/ | One note per hub module and lab |

## Concept notes (37)
- [f01: Python and Azure survival kit](concepts/f01-python-and-azure-survival-kit.md)
- [p01: Foundry platform map](concepts/p01-foundry-platform-map.md)
- [p02: Choose the right model or tool](concepts/p02-choose-the-right-model-or-tool.md)
- [p03: Deployments, quotas, rate limits and cost](concepts/p03-deployments-quotas-rate-limits-and-cost.md)
- [g01: Connect an app: SDKs, endpoints and the Responses API](concepts/g01-connect-an-app-sdks-endpoints-and-the-responses-api.md)
- [g02: Tune generation: prompts, parameters, reasoning and structured output](concepts/g02-tune-generation-prompts-parameters-reasoning-and-structured.md)
- [g03: Tool-augmented apps with the Responses API](concepts/g03-tool-augmented-apps-with-the-responses-api.md)
- [g04: Ground or tune? RAG, retrieval choices and fine-tuning](concepts/g04-ground-or-tune-rag-retrieval-choices-and-fine-tuning.md)
- [g05: Evaluate models and apps](concepts/g05-evaluate-models-and-apps.md)
- [g06: Reflection loops, multi-model flows and hybrid rules](concepts/g06-reflection-loops-multi-model-flows-and-hybrid-rules.md)
- [a01: Agent anatomy in Foundry Agent Service](concepts/a01-agent-anatomy-in-foundry-agent-service.md)
- [a02: Build agents in code (Agent Service SDK)](concepts/a02-build-agents-in-code-agent-service-sdk.md)
- [a03: Agent tools: catalog, OpenAPI, functions and more](concepts/a03-agent-tools-catalog-openapi-functions-and-more.md)
- [a04: MCP tools and approval loops](concepts/a04-mcp-tools-and-approval-loops.md)
- [a05: Knowledge and memory for agents: Foundry IQ](concepts/a05-knowledge-and-memory-for-agents-foundry-iq.md)
- [a06: Publish agents to Teams, Microsoft 365 and apps](concepts/a06-publish-agents-to-teams-microsoft-365-and-apps.md)
- [a07: Foundry workflows: visual multi-step and human-in-the-loop](concepts/a07-foundry-workflows-visual-multi-step-and-human-in-the-loop.md)
- [a08: Microsoft Agent Framework and orchestration patterns](concepts/a08-microsoft-agent-framework-and-orchestration-patterns.md)
- [a09: A2A: connecting remote agents](concepts/a09-a2a-connecting-remote-agents.md)
- [p04: Secure Foundry: identity, roles and networks](concepts/p04-secure-foundry-identity-roles-and-networks.md)
- [p05: Responsible AI: guardrails and content safety](concepts/p05-responsible-ai-guardrails-and-content-safety.md)
- [p06: Govern agents: autonomy, approvals and audit](concepts/p06-govern-agents-autonomy-approvals-and-audit.md)
- [p07: Monitor: tracing, drift and production evaluation](concepts/p07-monitor-tracing-drift-and-production-evaluation.md)
- [p08: CI/CD and infrastructure for Foundry projects](concepts/p08-ci-cd-and-infrastructure-for-foundry-projects.md)
- [t01: Text analysis with LLMs and Azure Language](concepts/t01-text-analysis-with-llms-and-azure-language.md)
- [t02: Translate text and speech](concepts/t02-translate-text-and-speech.md)
- [t03: Speech to text and text to speech](concepts/t03-speech-to-text-and-text-to-speech.md)
- [t04: Voice agents and reasoning over audio](concepts/t04-voice-agents-and-reasoning-over-audio.md)
- [v01: Multimodal understanding: captions, alt text and visual Q&A](concepts/v01-multimodal-understanding-captions-alt-text-and-visual-q-a.md)
- [v02: Image generation and editing](concepts/v02-image-generation-and-editing.md)
- [v03: Video generation and editing with Sora 2](concepts/v03-video-generation-and-editing-with-sora-2.md)
- [v04: Responsible AI for visual content](concepts/v04-responsible-ai-for-visual-content.md)
- [v05: Content Understanding for images and video](concepts/v05-content-understanding-for-images-and-video.md)
- [x01: Content Understanding for documents and RAG](concepts/x01-content-understanding-for-documents-and-rag.md)
- [x02: OCR, layout and Document Intelligence](concepts/x02-ocr-layout-and-document-intelligence.md)
- [x03: Azure AI Search: ingest, enrich and index](concepts/x03-azure-ai-search-ingest-enrich-and-index.md)
- [x04: Search for grounding: vector, hybrid, semantic and RAG pipelines](concepts/x04-search-for-grounding-vector-hybrid-semantic-and-rag-pipeline.md)

## Labs (22)
- [Prepare for an AI development project](labs/lab-prepare.md) (30 min, cost: low)
- [Explore and compare models](labs/lab-models.md) (45 min, cost: low)
- [Create a generative AI chat app](labs/lab-chat.md) (45 min, cost: low)
- [Create a generative AI app that uses tools](labs/lab-tools.md) (30 min, cost: low)
- [Fine-tune a language model](labs/lab-finetune.md) (60 min, cost: high)
- [Build AI agents with the portal and VS Code](labs/lab-agent.md) (45 min, cost: low)
- [Use a custom function in an AI agent](labs/lab-functions.md) (40 min, cost: low)
- [Extend agents with MCP tools](labs/lab-mcp.md) (40 min, cost: low)
- [Integrate an AI agent with Foundry IQ](labs/lab-iq.md) (45 min, cost: medium)
- [Deploy agents to Microsoft Teams and Copilot](labs/lab-publish.md) (40 min, cost: low)
- [Build a workflow in Microsoft Foundry](labs/lab-workflow.md) (45 min, cost: low)
- [Agent Framework: single and multi-agent](labs/lab-maf.md) (60 min, cost: low)
- [Connect to remote agents with A2A](labs/lab-a2a.md) (45 min, cost: low)
- [Apply guardrails to prevent harmful content](labs/lab-guardrails.md) (30 min, cost: low)
- [Analyze text and build a text analysis agent](labs/lab-text.md) (60 min, cost: low)
- [Speech: generative models, Azure Speech and the Speech MCP server](labs/lab-speech.md) (90 min, cost: low)
- [Voice Live agent and translation](labs/lab-voice.md) (60 min, cost: medium)
- [Develop a vision-enabled chat app](labs/lab-vision.md) (30 min, cost: low)
- [Generate images and video](labs/lab-generate.md) (60 min, cost: high)
- [Content Understanding: portal, client app and images](labs/lab-cu.md) (90 min, cost: medium)
- [Document Intelligence and knowledge mining](labs/lab-mining.md) (85 min, cost: medium)
- [Automated RAG ingestion pipeline](labs/lab-rag.md) (45 min, cost: medium)
