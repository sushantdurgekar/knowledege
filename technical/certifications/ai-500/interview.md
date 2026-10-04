---
title: "AI-500 interview Q&A"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, interview]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500 interview Q&A

Senior AI engineer and architect interviews probe judgment: when not to go multi-agent, how you'd debug a production regression, how you'd prove an agent is safe and compliant, and how you'd control cost at scale. Answers here are structured for those conversations.

Target roles: Senior AI engineer, AI solutions architect, Agent platform engineer, ML/LLMOps engineer.

## Architecture
### When would you NOT build a multi-agent system?
When one agent with tools meets the requirements. I apply the litmus test: remove the second agent — if nothing breaks, the split only adds latency, tokens, a distributed trace to debug and more identities and guardrails. I split for specialisation that measurably helps, parallelism that cuts latency, separation of duties, different security boundaries, or independent ownership.

**Likely follow-ups:** Tell me about a split you reversed. · How do you measure whether a split paid off?

### Walk me through how you'd architect a multi-agent claims platform on Azure.
Start with requirements and constraints (audit, latency, residency). Decompose: deterministic steps as tools, judgment in agents, a reviewer agent for separation of duties, partner agents via A2A. Hub orchestrator in Agent Framework on Container Apps; tools as MCP servers behind APIM; memory in Cosmos DB with tenant partitions; knowledge via AI Search/Foundry IQ. Per-agent identities, private networking, guardrails at every intervention point, OpenTelemetry tracing, evaluation gates in CI, canary releases.

**Likely follow-ups:** Where's the single point of failure? · How do you handle a partner agent outage?

### How do you design agent memory for a multi-tenant product?
Separate working memory (session, digest in Redis), shared case state (Cosmos DB, session consistency, ETag concurrency) and long-term episodic/semantic memory (vector search). Store only memorable observations with importance; retrieve top few by similarity, importance and recency. Isolate tenants with partition keys, filters and post-retrieval validation; dedicated resources for regulated tenants; deletion workflows that purge embeddings too; audit every access.

**Likely follow-ups:** How do you handle contradictory memories?

## Development
### Explain how you make tool calls reliable and safe.
Classify errors: transient get bounded retries with jittered backoff and Retry-After; permanent return structured errors; writes carry idempotency keys. Circuit breakers fail fast with structured fallbacks. Results are validated (schema, ranges), scanned for injection and redacted before entering context. Arguments are validated and authorised before execution, with approvals for high-impact actions.

**Likely follow-ups:** Where do retries live to avoid retry storms?

### MCP or A2A — how do you decide?
MCP when my orchestrator calls tools or resources from a shared server — many agents and clients, independent versioning, central governance. A2A when I delegate a whole task to another agent that reasons with its own tools, especially across teams or companies, discovered via an agent card. Callers that want a deterministic function get MCP; callers that want delegation get A2A.

**Likely follow-ups:** How do you secure an A2A integration?

### How do you manage context across a long, multi-agent conversation?
Per-agent token budgets and a priority-ordered assembler: system prompt (cacheable), a validated digest, compressed tool results, important older turns, then a rolling window summarised last with pinned critical facts. Agents get role-scoped slices, not transcripts. I watch for sliding-window amnesia, summary drift, vector-only recall and entity mix-ups.

**Likely follow-ups:** How do you know a digest isn't losing information?

### When do you fine-tune instead of prompting?
When the task is stable, I have hundreds to thousands of quality examples, prompts are long and latency or cost targets are strict — typically for format, style or vocabulary. SFT for behaviour, DPO for preferences, RFT for verifiable reasoning. Never for changing facts (that's RAG). Every fine-tuned version goes through the same evaluation and safety gates and is retrained on drift or schema changes.

**Likely follow-ups:** How do you avoid safety regressions after fine-tuning?

## Operations
### Production quality dropped overnight but errors and latency look normal. What do you do?
Check what changed: model deployment, prompt, tools, orchestration, configuration — in that order. Compare failing and successful traces, replay failures with old and new versions in isolation, drill down from system metrics to the agent and component. Mitigate (rollback the release batch), then add regression cases and a quality gate that would have caught it.

**Likely follow-ups:** What monitoring would catch this earlier?

### How do you evaluate a multi-agent system?
System metrics (task completion, goal achievement, journey coherence), business metrics (resolution, reopen, cost per resolved task) and component metrics (memory recall, retrieval nDCG/MRR, tool-call accuracy, intent resolution, task adherence). Specialised LLM judges calibrated against human review (κ > 0.7), synthetic taxonomy-driven datasets plus historical failure probes, CI gates with per-segment thresholds, and continuous evaluation in production.

**Likely follow-ups:** How do you keep LLM judges honest?

### How would you cut model costs by 40% without hurting quality?
Prompt caching (static prefix first), semantic caching for paraphrased FAQs with tuned thresholds and partitioned keys, result caching for deterministic lookups, tiered model routing with quality floors, token budgets and compact tool results, batch for offline work — validated with A/B tests and per-segment quality gates, with a quality circuit breaker.

**Likely follow-ups:** What would you never cache?

### How do you design alerting so on-call isn't overwhelmed?
Alert on SLO risk and anomalies against baselines (dynamic thresholds), correlate alerts within a short window and suppress downstream symptoms, map severities to SLO/SLA impact, automate only known failure modes with safe runbooks, and review alert precision monthly targeting ~80% actionable.

**Likely follow-ups:** Give an example of a safe automated remediation.

## Security and governance
### How do you apply Zero Trust to agents?
Per-agent identities with narrowly scoped data-plane roles (and Foundry's agent identity after publish), token validation between agents, PIM for humans, private endpoints and deny-by-default networking with controlled egress, guardrails at every intervention point, and audit. A compromised agent should reach as little as possible.

**Likely follow-ups:** How do you prove least privilege to an auditor?

### Managed identity or on-behalf-of?
Managed identity when the agent acts as itself on its own resources. OBO when the downstream system must enforce and audit the signed-in user's permissions. For third-party SaaS acting for a user, auth code with PKCE; partner services get client credentials; API keys only as a Key Vault-managed, rotated fallback.

**Likely follow-ups:** What breaks OBO for long-running tasks?

### Describe your guardrail strategy for an agent that reads emails and moves money.
Input: Prompt Shields for user and document attacks, delimiters, intent checks. Tool calls: allow-lists, schemas and amount limits, approvals above thresholds, sandboxing. Tool responses: schema checks, injection scans, PII redaction. Outputs: content safety, groundedness, policy classifiers. Domain rules in a regex → classifier → LLM-judge cascade with FP/FN targets. A coverage matrix in CI and the AI Red Teaming Agent with an ASR gate.

**Likely follow-ups:** How do you handle false positives?

## Delivery
### How do you release a new agent version safely?
Build once and promote through DTAP with evaluation and red-team gates; deploy dependencies first; canary 5→25→50→100% with gates on evaluation scores, errors, latency and schema validity; feature flags and tenant tiers for behaviour changes; automated rollback of the whole release batch; manifests and approvals for audit.

**Likely follow-ups:** When would you choose blue/green instead?

## Behavioural (STAR)
### Tell me about a production incident involving an AI agent and what you changed afterwards.
Use STAR. Situation: e.g., a model upgrade made outputs verbose and broke a parser. Task: restore service and prevent recurrence. Action: correlated traces, replayed with both model versions, rolled back the batch, added contract tests on output formats, pinned model versions, and made model upgrades go through canary with evaluation gates. Result: MTTR down, no recurrence; the postmortem led to platform-wide pinning.

**Likely follow-ups:** What would you do differently?

