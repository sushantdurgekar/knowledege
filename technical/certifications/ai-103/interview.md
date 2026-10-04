---
title: "AI-103 interview Q&A"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, interview]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-103 interview Q&A

AI engineer interviews probe the same skills as the exam, but they want reasons and trade-offs. Answer out loud in about 90 seconds, then compare with the model answer.

Target roles: Azure AI engineer, AI apps and agents developer, Junior AI developer.

## Architecture and design
### Walk me through how you'd design a customer-support agent on Microsoft Foundry.
I'd start from requirements: channels, data sources, actions, risk and SLAs. A prompt agent in Foundry Agent Service with clear instructions; knowledge through a Foundry IQ knowledge base (or Azure AI Search tool) with citations; actions through OpenAPI or MCP tools with managed identity and approvals for anything high-impact; a guardrail with Prompt Shields for indirect attacks.

Operationally: tracing to Application Insights, continuous evaluation for groundedness and task adherence, quotas sized with headroom and backoff, and a CI/CD pipeline with an evaluation gate. I'd publish as an agent application with its own identity and least-privilege roles.

**Likely follow-ups:** How would you handle a request the agent can't answer? · What would you monitor in the first week?

### When would you choose RAG, fine-tuning, or just prompt engineering?
Prompting first: it's cheap and fast. RAG when the model needs private, changing or citable knowledge. Fine-tuning when behaviour (format, tone, tool use) stays inconsistent despite good prompts, or to shorten prompts or distil to a smaller model. They combine: prompt + RAG is the most common pattern, and fine-tuned models still use RAG for facts.

**Likely follow-ups:** How do you prove fine-tuning helped?

### How do you choose a model for a new workload?
Classify the task: fixed NLP/speech/extraction tasks often suit a Foundry Tool; generation suits an LLM; multi-step logic a reasoning model; edge/offline a small model. Shortlist with the leaderboard (quality, safety, cost, latency), then evaluate finalists on our own data. For mixed traffic, consider the model router or a cascade.

**Likely follow-ups:** What safety benchmarks do you look at?

## Building agents
### Explain how function calling works and how you'd make it safe.
The model returns a function_call item with arguments; my code validates and executes the function and returns function_call_output with the call_id; the model writes the final answer. Safety: strict JSON schemas, server-side validation and authorisation of arguments, least-privilege credentials, approvals for high-impact actions, and logging every call.

**Likely follow-ups:** What if the model invents an argument value?

### MCP or A2A: what's the difference and when do you use each?
MCP connects an agent to tools and data: the calling agent controls each tool call, and servers can be shared across apps. A2A connects agents to agents: you delegate a whole task to an opaque agent with its own reasoning and tools, discovered through its agent card. Shared tool servers → MCP; cross-team or vendor agents → A2A.

**Likely follow-ups:** How do you secure a third-party MCP server?

### Which multi-agent orchestration patterns do you know, and how do you choose?
Sequential for fixed pipelines, concurrent for independent parallel work, group chat for maker-checker iteration, handoff for dynamic transfer of control, magentic for open-ended planning. I choose the simplest that meets the need, because each agent hop adds latency, cost and failure points, and I add loop limits and termination conditions.

**Likely follow-ups:** Give an example where multi-agent was a mistake.

## Safety and governance
### How do you protect an agent from prompt injection?
Defence in depth: Prompt Shields for user and indirect attacks (documents, tool responses, text in images); delimiting untrusted data and instructions to treat it as data; least-privilege tools and identities; approvals for risky actions; output validation; and red-teaming with the AI Red Teaming Agent to measure attack success rate.

**Likely follow-ups:** What's an indirect attack? Give an example.

### What happens when a content filter blocks a request, and how should the app respond?
A blocked prompt returns HTTP 400 with code content_filter; a blocked output returns HTTP 200 with finish_reason content_filter (incomplete in the Responses API) and may be cut off mid-stream. The app should show a helpful message, avoid retrying the same input, log the event, and for outputs handle the partial text gracefully.

**Likely follow-ups:** How would you tune thresholds for a children's app?

### How would you secure a Foundry deployment for a regulated client?
Entra ID only (disable key auth), managed identities with least-privilege roles (Foundry User, Agent Consumer), per-agent identities after publishing, private endpoints with public access disabled, standard agent setup with our own Cosmos DB/Storage/Search in the VNet, Key Vault for secrets, CMK if required, Data Zone deployments for residency, and auditing via tracing and approval logs.

**Likely follow-ups:** What changes when an agent is published?

## Operations
### Users report the agent got slower. How do you troubleshoot?
Check traces first: which span grew (model call, a tool, retrieval)? Then metrics: 429s and retries, token counts (bigger context?), deployment latency. If a tool is slow, look at that service (e.g. search query latency or indexer issues). Fix the cause: trim context, cache, tune the tool, adjust quota or model.

**Likely follow-ups:** How do you know whether quality also dropped?

### How do you evaluate an agent before and after release?
Before: a representative dataset (real or synthetic) scored with groundedness, relevance, task adherence, intent resolution, tool call accuracy and safety evaluators, plus red-teaming; slice low scores for error analysis. In CI: the ai-agent-evals action comparing versions. After: continuous evaluation on sampled traffic, scheduled evaluations for drift, alerts on score drops.

**Likely follow-ups:** How do you avoid LLM-judge bias?

### How do you handle throttling (429) in production?
Set realistic max output tokens, implement exponential backoff with jitter honouring retry-after, smooth bursts with queues or concurrency limits, spread load across deployments or regions, request more quota, use Batch for bulk work and PTU for steady high volume. Monitor remaining-tokens headers and 429 rates.

**Likely follow-ups:** When is PTU worth the cost?

## Multimodal and data
### Design an intake pipeline for scanned forms, photos and voice notes.
Content Understanding analyzers: document analyzers for forms (fields with confidence and grounding, markdown for RAG), an image analyzer with classify fields for photos (no confidence, so validate and sample), audio transcription for voice notes; cross-document validation with retrieval + model reasoning (pro mode in exam terms; agentic mode today). Route by confidence to human review, redact PII, treat text in images as untrusted, and index markdown in Azure AI Search for retrieval.

**Likely follow-ups:** Why markdown rather than plain OCR text?

### How do you make search work well for RAG?
Good ingestion (layout-aware markdown, sensible chunks with overlap, one embedding model), hybrid search with RRF for exact terms and meaning, the semantic ranker for ordering, filters for security and scope, and measurement with labelled queries (precision@k, nDCG) plus groundedness of final answers.

**Likely follow-ups:** What do you do when the embedding model changes?

## Behavioural (STAR)
### Tell me about a time an AI feature behaved unexpectedly in front of users.
Use STAR. Situation: the feature and its users. Task: your responsibility. Action: how you detected it (traces, evaluations, feedback), contained it (guardrail change, rollback to the previous agent version), fixed the root cause (prompt, retrieval, tool validation) and added a regression test to the evaluation dataset. Result: measurable recovery and what you changed in the process. If you're new to the field, use a lab or project from this course.

**Likely follow-ups:** What would you do differently next time?

### Describe a trade-off you made between cost, quality and latency.
STAR again: name the constraint that bound (latency SLA, budget), the options (smaller model, router, caching, PTU, parallel calls), how you measured each (evaluation scores, P95 latency, cost per request), what you chose and the result. Interviewers want evidence that you measured rather than guessed.

**Likely follow-ups:** How did you convince stakeholders?

