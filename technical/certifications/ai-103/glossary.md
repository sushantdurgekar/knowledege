---
title: "AI-103 glossary"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, glossary]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-103 glossary

| Term | Meaning |
|---|---|
| **A2A** | Agent2Agent protocol for delegating tasks between agents across frameworks and vendors. |
| **Agent application** | Legacy published form of a Foundry agent: stable endpoint, Entra-only auth, its own identity; callers need Foundry User. Since July 2026 new agents have an endpoint and identity from creation. |
| **Agent card** | A2A JSON document at /.well-known/agent-card.json describing an agent's skills, endpoint, capabilities and auth. |
| **Agent Framework** | Microsoft's open-source SDK (Python/.NET) for building agents and multi-agent workflows; successor to Semantic Kernel and AutoGen. |
| **Agentic retrieval** | Foundry IQ's query planning, strategy selection, ranking and citation over knowledge sources. |
| **Barge-in** | Stopping an agent's speech when the user starts talking (speech_started event). |
| **BLEU** | N-gram precision metric against reference text; common for translation. |
| **C2PA** | Content credentials standard embedding provenance metadata in generated media. |
| **Chunking** | Splitting documents into smaller passages for embedding and retrieval. |
| **Code interpreter** | Built-in tool giving the model a sandboxed Python environment without network access. |
| **Content filter / guardrail** | Safety controls on inputs, outputs and agent tool calls/responses by risk, severity and action. |
| **Content Understanding** | Foundry Tool that turns documents, images, audio and video into markdown and structured fields. |
| **Continuous evaluation** | Evaluators run on a sample of production traffic to detect quality drift. |
| **Custom speech** | A speech recognition model adapted with your audio, transcripts or text. |
| **Data Zone deployment** | Deployment type that keeps processing within the US or EU data zone. |
| **Defect rate** | Share of responses at or above a safety severity threshold. |
| **Developer deployment** | Low-cost temporary deployment type for evaluating fine-tuned models; no SLA. |
| **Document Intelligence** | Foundry Tool for OCR, layout and prebuilt/custom form extraction. |
| **DPO** | Direct preference optimisation: fine-tuning from preferred vs rejected response pairs. |
| **Embedding** | A vector of numbers representing meaning, used for semantic search. |
| **Enrichment tree** | Azure AI Search's per-document structure that skills read from and write to. |
| **Foundry IQ** | Managed knowledge bases on Azure AI Search, connected to agents through MCP. |
| **Foundry resource** | The parent Azure resource holding deployments, networking and billing for projects. |
| **Foundry Tools** | Renamed Azure AI services: Language, Speech, Translator, Document Intelligence, Content Understanding, Content Safety. |
| **Function calling** | Model requests a call to your function; your app runs it and returns the output. |
| **Global Standard** | Default pay-per-token deployment type with global processing and the highest quota. |
| **Groundedness** | Evaluator measuring whether a response is supported by the provided context. |
| **Handoff** | Orchestration where agents transfer control dynamically, one active at a time. |
| **Hosted agent** | A containerised agent (your code/framework) hosted by Foundry with identity and endpoints. |
| **Hybrid search** | Keyword and vector search combined with Reciprocal Rank Fusion. |
| **Indexer** | Azure AI Search crawler that pulls data, runs skills and populates an index. |
| **Indirect prompt injection** | Malicious instructions hidden in content the model processes (documents, web pages, images, tool output). |
| **Inpainting** | Editing part of an image using a mask (transparent areas are regenerated). |
| **Knowledge store** | Azure AI Search projections of enriched data to Blob/Table storage. |
| **Magentic orchestration** | Manager-led multi-agent pattern using task and progress ledgers for open-ended work. |
| **Managed identity** | An Entra identity for an Azure resource; avoids secrets in code. |
| **MCP** | Model Context Protocol: standard for apps/agents to discover and call tools, resources and prompts. |
| **Memory store** | Foundry long-term memory: extraction, consolidation and retrieval of user facts. |
| **Model router** | Single deployment that routes each prompt to a suitable underlying model (Balanced, Cost, Quality). |
| **OIDC federation** | Keyless pipeline sign-in where GitHub/Azure DevOps exchanges a token with Entra ID. |
| **Pro mode** | Content Understanding mode for multi-document reasoning with reference data (documents only). Exam-outline term; its preview API is retired and agentic mode (preview) is the successor. |
| **Prompt Shields** | Detection of user prompt attacks and indirect (document) attacks. |
| **Provisioned throughput (PTU)** | Reserved model capacity with predictable latency, billed whether used or not. |
| **RAG** | Retrieval-augmented generation: retrieve relevant content and ground the model's answer on it. |
| **Reasoning model** | Model that thinks internally before answering; controlled by reasoning effort. |
| **Responses API** | Stateful, tool-capable inference API recommended in Foundry. |
| **ROUGE** | Recall-oriented overlap metric, common for summarisation. |
| **RRF** | Reciprocal Rank Fusion: merges rankings from keyword and vector search. |
| **Semantic ranker** | Re-ranks top search results with a language model; adds captions and answers. |
| **SFT** | Supervised fine-tuning on prompt/response pairs. |
| **Skillset** | The set of AI skills an indexer runs to enrich documents. |
| **SSML** | Speech Synthesis Markup Language for controlling voice, style, pauses and pronunciation. |
| **Structured outputs** | JSON-schema-constrained output guaranteeing the schema (strict mode). |
| **Task adherence** | Evaluator/guardrail checking an agent follows its instructions and scope. |
| **Toolbox** | Versioned bundle of tools exposed as one MCP endpoint for reuse by many agents. |
| **Tracing** | OpenTelemetry spans (invoke_agent, chat, execute_tool) recorded to Application Insights. |
| **Voice Live** | Foundry real-time speech-to-speech service for voice agents. |
| **Workflow (Foundry)** | Visual multi-step orchestration with nodes, Power Fx conditions and human-in-the-loop steps. |
