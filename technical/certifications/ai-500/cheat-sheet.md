---
title: "AI-500 cheat sheet"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, cheat-sheet]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500 cheat sheet

## When multi-agent?
- Litmus: remove agent #2 — still works? don't split
- Reasons: specialisation, parallel latency, separation of duties, security boundary, independent evolution
- Costs: hops, tokens, tracing, identities, guardrails per edge, releases
- Avoid meshes (N(N−1)/2); prefer hub/hierarchy
- Granularity: medium (3–5) usually best

## Foundry v2 & the loop
- assistant→agent (name+version); thread→conversation; run→response; message→item
- `agents.create_version(...)` at deploy; `agent_reference` at runtime
- function_call → validate/authorise → `function_call_output` (call_id)
- State: conversation · previous_response_id forks · store=False · background=True
- Overflow → silent truncation → re-inject pinned facts
- Caps: iterations (3 / 10–15), tokens, completion signal, escalation

## Workflows & HITL
- Autonomy: full-auto · supervised · approval-required · human
- Triggers: policy exception (always) → impact × calibrated confidence → ambiguity
- Example thresholds 0.60 / 0.75 / 0.88 / 1.0 (calibrate!)
- Durable: external event + timer (task_any); zero compute while waiting
- Timeout → escalate → default reject; re-validate before execute; idempotent
- Healthy rejection ~12–15%; ~100% = rubber-stamping

## Memory & state
- Working (Redis) · shared team state (Cosmos, session consistency, ETag) · episodic · semantic (vector)
- 412 → re-read, merge, retry; Redis SET NX locks only for critical
- Vector policy/index set at container creation (immutable)
- Score ≈ 0.5 sim + 0.3 importance + 0.2 recency; top ~5
- Decay, contradiction, consolidation, TTL, pinned facts
- Tenant in partition keys/IDs/cache keys + validation; purge embeddings on delete

## Prompts & fine-tuning
- 5 sections: identity · constraints · scope · escalation · output
- Delimited context + source/timestamp + Prompt Shields
- Semver: major = breaking format/reasoning
- A/B: same dataset + evaluators; one variable; gates (quality −2%, safety 100%)
- Fine-tune: stable task, ≥500 examples, long prompt, latency; SFT · DPO · RFT · distillation
- Abbreviated system prompt; 80/10/10; safety examples; retrain on drift

## RAG
- Hybrid BM25 + vector via RRF; weight = influence; k = breadth
- Semantic ranker reranks top 50; cross-encoder; MMR
- Chunking: fixed+overlap · structural · semantic · parent-child
- New embedding model → blue-green index
- Routing: classify sources (0.7/0.4), normalise scores, rerank
- Metrics: recall@k, precision@k, nDCG, MRR

## Tools & MCP
- Specified (tool_choice) vs dynamic tool use; semantic tool retrieval
- MCP when 2+ agents share / independent versioning
- Hosts: Functions (Flex/Premium), Container Apps (min replicas), App Service, AKS
- APIM = gateway (REST→MCP, auth, quotas); API Center = catalogue; Logic Apps = connectors
- Auth: MI · passthrough/OBO · client credentials · keys (fallback)
- Semver tool schemas; 90-day deprecation

## Resilience
- Transient (429/5xx/timeout) → backoff + jitter + Retry-After
- Permanent (400) → structured error, no retry
- Idempotency keys for writes
- Breaker: Closed → Open → Half-open → Closed
- Structured fallback {status, fallback, retry_after}
- Validate results: schema, ranges, injection scan, PII

## Orchestration
- Sequential · parallel · hub-and-spoke · orchestrator-subagent · peer handoff · supervisor
- Parallel latency = slowest branch; concurrency ≤ quota (semaphore)
- Quorum: fail-fast · best-effort · minimum (2 of 3)
- Hub owns timeouts, breakers, partial results
- A2A: card, OAuth, JWT checks (sig, iss, aud, exp, caller), minimal context

## Frameworks
- Agent Framework: Agent + FoundryChatClient; builders (Sequential, Concurrent, Handoff, GroupChat, Magentic); workflows + checkpointing
- Middleware: agent · function · chat; `await call_next()`; short-circuit
- LangGraph: StateGraph, conditional edges, durable checkpointer, `interrupt()` + `Command(resume)`
- HF: zero-shot routing, NER, cross-encoders; Foundry managed compute (Safetensors; unverified remote code blocked)

## Caching & cost
- Prompt caching: static prefix first (≈1,024+ tokens)
- Semantic cache: threshold ~0.92 (tune), TTL 7 d / 24 h / 30 d, partition keys
- APIM: `llm-semantic-cache-lookup` (score-threshold lower = stricter, vary-by) / `-store` (duration)
- `llm-token-limit` per tenant; `llm-emit-token-metric` for chargeback
- Batch for offline; PTU for steady load
- Tiers + quality floors 75/85/60

## Evaluation
- System (completion, goal index, coherence) + business + component
- Agent evaluators: intent resolution, task adherence, tool call accuracy, response completeness
- Custom evaluator: class with `__call__` → dict
- Judges: one criterion; biases length/position/self/leniency; κ > 0.7
- Synthetic: category × complexity × persona × adversarial; T≈0.8; validate; version
- Canaries → full set → historical probes vs gold baseline; per-segment

## Observability
- traceparent `00-<32hex>-<16hex>-01`
- Custom HTTP: inject (caller) / extract (callee)
- Spans at semantic boundaries (~40–60); GenAI attrs + agent.id/version
- Tail sampling: 100% errors, ~10% slow, ~1% success
- `configure_azure_monitor()` from env; content recording opt-in
- Decision logs + correlation IDs + replay snapshots

## Monitoring & SLA
- Anomalies: routing drift, token explosion, escalation surge, tool error burst
- Dynamic thresholds: High (more alerts) · Medium (default) · Low (fewer)
- Correlate 5 min; suppress downstream
- SLI → SLO → SLA; error budget; P1–P4
- Runbooks: known modes only; idempotent, time/rate-limited
- Hypothesis order: model → prompt → tool → orchestration → config

## Zero Trust & secrets
- Per-agent identity; Foundry agent identity after publish
- Data-plane roles at narrowest scope; PIM; access reviews
- Private endpoints, internal ingress, deny-all + DNS, mTLS, firewall egress
- OBO for user permissions; auth code + PKCE for SaaS; client creds for B2B
- Key Vault RBAC: Secrets User / Officer / Crypto User / Admin; purge protection
- Dual-secret rotation; certificates; CMK (crypto-shred); Managed HSM

## Guardrails & release
- Guard input · tool call · tool response · output
- Cascade regex → classifier → LLM judge; FP < 2%, FN < 0.1% (critical)
- AI Red Teaming Agent: ASR; strategies Base64/Flip/Jailbreak; CI gate
- DTAP; build once; canary 5→25→50→100 with eval gates; blue/green; flags; shadow
- Rollback the whole batch; triggers: eval −5%, errors 2×, P95 150% SLO, schema 1%
- CI: OIDC (`id-token: write`), `needs:` order, contract tests, what-if, protected envs
