---
title: "AI-103 cheat sheet"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, cheat-sheet]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-103 cheat sheet

## Foundry structure & endpoints
- Resource (deployments, networking, billing) → projects (agents, data, evals)
- Project endpoint `…services.ai.azure.com/api/projects/<p>` → `AIProjectClient`
- OpenAI v1 `…openai.azure.com/openai/v1`
- Foundry Tools SDKs → **resource** endpoint (`…cognitiveservices.azure.com`)
- Portal: Discover · Build · Operate
- Agent types: prompt · workflow · hosted

## Deployments & quota
- Default **Global Standard**; residency **Data Zone**; steady SLA **PTU**; bulk **Batch** (≈50% off, 24 h); **Developer** for fine-tune eval
- Quota = TPM per subscription × region × model × type
- Limiter counts prompt + **max output** tokens; RPM over short windows
- 429 → backoff + jitter, honour `retry-after`, lower max tokens, spread load

## Roles (2026 names)
- Foundry User (ex Azure AI User): build + call
- Foundry Project Manager: + publish agents
- Foundry Account Owner: projects/deployments, no build
- Foundry Owner: everything
- Foundry Agent Consumer: invoke only
- Contributor/Owner = control plane only
- Agent's own identity (legacy: at publish; new model: at creation) → grant its roles; MCP/A2A use it

## Guardrails
- Map → Measure → Mitigate → Manage
- Layers: model · safety system · system message + grounding · UX
- Categories hate/sexual/violence/self-harm; threshold **Low = strictest**
- Prompt Shields: user attacks + **indirect** attacks
- Prompt blocked → **400 content_filter**; output → **finish_reason content_filter**
- Agent guardrail overrides deployment guardrail

## Responses API
- `responses.create(model=<deployment>, input, instructions, previous_response_id, stream, store)`
- `output_text` · `output` items · `id` · `status` · `usage`
- Stream: `response.output_text.delta`
- Structured: `responses.parse(text_format=Model)` → `output_parsed`
- Reasoning: `reasoning={effort}`; reasoning tokens = output tokens

## Tools & who runs them
- Built-in (service): code interpreter, web search, file search, AI Search, Foundry IQ
- **Your app** runs function tools → `function_call_output` + `call_id`
- OpenAPI tool: spec + anonymous / key connection / managed identity
- MCP: `MCPTool(server_label, server_url, allowed_tools, require_approval)`; default **always**
- Approval: `mcp_approval_request` → `mcp_approval_response`

## Agent SDK v2
- `project.agents.create_version(agent_name, PromptAgentDefinition(model, instructions, tools))`
- `oc.conversations.create()` · `oc.conversations.items.create(...)`
- `oc.responses.create(conversation=..., extra_body={"agent_reference": {name, type}})`
- v1→v2: thread→conversation, run→response, message→item
- Connected agents removed → workflows + A2A

## Orchestration
- Sequential: fixed pipeline
- Concurrent: parallel → aggregate
- Group chat: manager picks speaker (maker-checker)
- Handoff: dynamic transfer, one active; loop guards
- Magentic: task + progress ledgers; open-ended
- Foundry workflows: nodes + Power Fx (`Local.X`), HITL, immutable versions

## Evaluation & monitoring
- Groundedness = fabrication detector
- Relevance, coherence, fluency, completeness
- Agent: intent resolution, task adherence, tool call accuracy
- NLP (need ground truth): F1, BLEU, ROUGE, METEOR, GLEU
- Safety → defect rate; AI Red Teaming Agent → attack success rate
- Tracing: OpenTelemetry → App Insights; continuous evaluation samples traffic

## Language & speech
- Azure Language: language detection, NER, PII (`redacted_text`), health; sentiment/summaries **deprecated** → LLM
- Translator: 90+ langs, transliteration, document translation, Custom Translator
- Speech SDK: RecognizedSpeech / NoMatch / Canceled; continuous; batch
- SSML: express-as (mstts ns), prosody, break, say-as, phoneme
- Voice Live: session.update, semantic VAD, barge-in on speech_started

## Vision & generation
- Parts: `input_text` + `input_image` (URL or data URL)
- Alt text: purpose, no "image of"; decorative = empty
- gpt-image: size, quality, format, background transparent (PNG), n
- Mask: **transparent = edited**; same size; `input_fidelity=high`
- Sora 2: 1280x720/720x1280; 4/8/12 s; create → poll → download; remix

## Extraction & search
- CU: analyzer = base + field schema; extract/classify/generate; markdown + fields + confidence + grounding
- Standard (all media, confidence) vs **Pro** (docs, multi-doc, no confidence)
- DI: Read, Layout, prebuilt, custom template vs neural, composed
- Search: data source → indexer → skillset → index; output field mappings
- Hybrid (RRF) + semantic ranker (re-orders only); same embedding model
