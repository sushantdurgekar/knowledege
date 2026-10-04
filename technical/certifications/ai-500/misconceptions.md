---
title: "AI-500 misconceptions and traps"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, traps]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500: traps and misconceptions

Each line: the tempting wrong idea → the correct one. Grouped by module.

## f01: The expert's map: when (and how) to go multi-agent on Azure
- ✗ Calling a multi-persona prompt "multi-agent". → ✓ Multi-agent means separate agents with their own context, identity and role.
- ✗ Splitting by org chart (one agent per department). → ✓ Split by capability boundaries that need different context, identity, model or release cycle.
- ✗ Using MCP to talk to another team's reasoning agent. → ✓ MCP is for tools/resources; delegate to an opaque agent with A2A.
- ✗ Pinning only the deployment name. → ✓ Pin the model version; deployments can be upgraded underneath you.
- ✗ Treating observability as a later phase. → ✓ Trace context, structured logs and replay capture are architecture decisions.

## f02: Foundry Agent Service v2 and the agentic loop in Python
- ✗ Expecting an error when context overflows. → ✓ v2 truncates older input silently; persist and re-inject critical facts.
- ✗ Creating a new agent version on every request. → ✓ Create versions at deployment time; reference them by name at runtime.
- ✗ Polling response status in a loop for normal calls. → ✓ v2 returns output items; use background mode + retrieve only for long jobs.
- ✗ Executing tool calls without validation. → ✓ Arguments are model output: validate, authorise and, for high impact, approve.
- ✗ Unlimited reflection cycles "for quality". → ✓ Gains fall off after cycle 1–2 while tokens multiply; cap at 3 (1 for latency-sensitive).

## a01: Decompose goals into workflows, agents and tools
- ✗ Creating an agent for arithmetic or lookups. → ✓ Deterministic steps belong in tools/code: cheaper, testable, always right.
- ✗ Passing each agent the previous agent's summary of a summary. → ✓ Pass the relevant original facts/fields; avoid context collapse.
- ✗ Unlimited replanning. → ✓ Cap replans; escalate after the limit.
- ✗ Splitting tightly coupled reasoning across agents. → ✓ Integrative reasoning works better in one agent with the full picture.
- ✗ Choosing fine granularity "for flexibility". → ✓ Medium granularity usually wins on quality-to-cost; measure before splitting further.

## a02: Workflows, control loops and human-in-the-loop design
- ✗ Escalating everything "to be safe". → ✓ Creates queues and rubber-stamping; match autonomy to impact and calibrated confidence.
- ✗ Using raw model confidence as a probability. → ✓ Calibrate on labelled outcomes per model/task; recalibrate quarterly.
- ✗ Waiting synchronously for a human inside a request. → ✓ Use durable pause/resume with externalised state.
- ✗ No timeout policy on approvals. → ✓ Define SLAs, escalation and a safe default (usually reject).
- ✗ Loops without exit criteria. → ✓ Cap iterations, tokens and time; define completion signals.

## a03: Personas, scopes, autonomy, tool permissions and protocols
- ✗ Relying on "never do X" in the prompt as the only control. → ✓ Enforce boundaries with tool absence, identity, guardrails and approvals.
- ✗ Using the agent's identity when downstream must apply the user's permissions. → ✓ Use on-behalf-of (or identity passthrough).
- ✗ Calling another team's agent through MCP as if it were a tool. → ✓ Use A2A for opaque agents with their own reasoning.
- ✗ One service principal for all agents. → ✓ Per-agent identities and least privilege.
- ✗ Unversioned message contracts between agents. → ✓ Version schemas; manage breaking changes like APIs.

## a04: Memory architecture and multi-tier state persistence
- ✗ Storing whole transcripts as "memory". → ✓ Store memorable observations with importance; retrieve the top few.
- ✗ Changing the vector index policy on an existing container. → ✓ Vector embedding and index policies are set at creation and immutable.
- ✗ Using last-writer-wins for shared case state. → ✓ Use ETag optimistic concurrency (or locks for critical decisions).
- ✗ Relying on filters alone for tenant isolation. → ✓ Partition keys + filters + post-retrieval validation + tenant-scoped caches.
- ✗ Forgetting embeddings when deleting a user's data. → ✓ Purge memories, embeddings and caches; keep an audit record.

## a05: Technology components: integration, Zero Trust, compute, observability, dev tools
- ✗ Scale-to-zero for latency-SLA services. → ✓ Cold starts break SLAs; keep min replicas or always-ready instances.
- ✗ Using APIM as the MCP server host. → ✓ APIM is a gateway (it can expose APIs as MCP); host tools on Functions/Container Apps.
- ✗ One identity for all agents "to simplify". → ✓ Per-agent identities are a Zero Trust requirement.
- ✗ Logging full conversations for observability. → ✓ Log decisions and metadata; hash/redact PII.
- ✗ "Works on my machine" dev setups. → ✓ Dev containers, lock files and pinned CLIs.

## a06: Human-AI experience (HAX), responsible AI and model matching
- ✗ Adding confirmations everywhere. → ✓ Excess friction causes click-through; match friction to risk.
- ✗ Choosing models from leaderboards only. → ✓ Validate on your own evaluation set and costs.
- ✗ Using a reasoning model for classification. → ✓ Small models are faster and cheaper for routing/extraction.
- ✗ Deploying Hugging Face models to serverless endpoints in Foundry. → ✓ HF models in Foundry deploy to managed compute (GPU).
- ✗ Treating explanations as optional for high-stakes decisions. → ✓ Explain why (G11) with evidence; support correction and review.

## d01: Advanced prompt engineering and prompt lifecycle
- ✗ Relying on delimiters as a security boundary. → ✓ Combine delimiters with Prompt Shields, tool restrictions, validation and approvals.
- ✗ Changing several prompt sections at once and judging by a few manual tests. → ✓ Change one variable; A/B on the same dataset and evaluators.
- ✗ Showing raw chain-of-thought to end users. → ✓ Keep reasoning in scratchpads for audit; show concise recommendations.
- ✗ Few-shot examples that are all happy paths. → ✓ Include edge cases, refusals and balanced outcomes.
- ✗ Comparing only average scores. → ✓ Compare distributions and per-segment results.

## d02: Fine-tuning strategy for agents and models
- ✗ Fine-tuning to teach facts that change monthly. → ✓ Use RAG/tools for changing knowledge.
- ✗ Using the full production system prompt in every training example. → ✓ Use an abbreviated system prompt; the behaviour is what's learned.
- ✗ Training on raw production logs with PII. → ✓ De-identify, deduplicate and validate first.
- ✗ Skipping safety examples. → ✓ Fine-tuning can erode refusals; include safety data and gate on safety evals.
- ✗ Choosing RFT for formatting problems. → ✓ SFT handles format/style; RFT targets verifiable reasoning.

## d03: Context management and memory implementation
- ✗ Passing full transcripts between agents. → ✓ Pass digests and structured payloads; give each agent its slice.
- ✗ Summarising repeatedly without checks. → ✓ Summary drift: validate summaries against sources; keep raw recent turns.
- ✗ Pure vector search for IDs and codes. → ✓ Add keyword/hybrid retrieval for exact identifiers.
- ✗ Pruning critical facts with everything else. → ✓ Pin critical facts (allergies, commitments).
- ✗ Waiting for overflow before managing context. → ✓ Budget proactively per agent; v2 truncates silently.

## d04: Multi-agent RAG and knowledge integration
- ✗ Pure vector search for code-heavy queries. → ✓ Use hybrid search; tune weights.
- ✗ Treating `k_nearest_neighbors` as a weight. → ✓ It controls candidate breadth; `weight` controls influence in RRF.
- ✗ Tuning rerankers before measuring candidate recall. → ✓ Reranking can't recover missed documents.
- ✗ Mixing old and new embeddings in one index. → ✓ Re-embed everything into a new index (blue-green).
- ✗ Letting every agent search every index for every query. → ✓ Route by query type; cache per request; scope per agent.

## d05: Tool ecosystems: function calling, MCP servers and clients
- ✗ Hosting MCP servers on a cold-start-prone plan for latency-critical tools. → ✓ Use Flex Consumption with always-ready, Premium, or Container Apps with min replicas.
- ✗ Treating APIM as the place to write tool logic. → ✓ APIM is a gateway; host logic on Functions/Container Apps.
- ✗ Breaking a tool's schema in place. → ✓ Version it: new path for major changes, deprecation window for the old one.
- ✗ Giving an agent every tool on a server. → ✓ Use allowed_tools and approval settings.
- ✗ Using MCP for a tool only one agent uses and deploys with. → ✓ A direct function tool is simpler.

## d06: Tool errors, fallbacks and result validation
- ✗ Retrying 400 errors. → ✓ Permanent errors need a structured response, not retries.
- ✗ Agent timeout shorter than the retry budget. → ✓ Set timeouts longer than the maximum retry duration.
- ✗ Retrying writes without idempotency. → ✓ Use idempotency keys.
- ✗ Injecting raw tool output into context. → ✓ Validate schema/ranges, scan for injection and redact PII first.
- ✗ Silent fallbacks. → ✓ Mark degraded or cached results and alert operators.

## d07: Orchestration patterns, scaling and A2A integration
- ✗ Parallelising dependent steps. → ✓ Dependencies require sequential order (or DAG scheduling).
- ✗ Unbounded `gather` over many agents. → ✓ Bound with a semaphore sized to quota; add deadlines.
- ✗ Letting each spoke implement its own failure policy. → ✓ Centralise failure handling in the orchestrator.
- ✗ Trusting any token presented by a calling agent. → ✓ Validate JWT signature, issuer, audience, expiry and caller allow-list.
- ✗ Sharing the full conversation with partner agents by default. → ✓ Share the minimum context the task needs.

## d08: Frameworks: Agent Framework, LangGraph, LangChain, Hugging Face and middleware
- ✗ Copy-pasting logging and auth checks into every tool. → ✓ Use middleware for cross-cutting concerns.
- ✗ Calling an LLM to route when a cheap classifier suffices. → ✓ Zero-shot/small models for routing; LLM fallback for low confidence.
- ✗ Deploying HF models that require `trust_remote_code`. → ✓ Foundry blocks them unless Hugging Face verifies them or they come from trusted organisations; prefer compliant Safetensors models.
- ✗ Forgetting checkpointing in long workflows. → ✓ Checkpoint to resume after failures or human pauses.
- ✗ Memorising exact signatures over concepts. → ✓ APIs evolve; read code for intent.

## d09: Implementing human-in-the-loop: approvals, overrides and edge cases
- ✗ Holding an HTTP request open while waiting for a human. → ✓ Use durable waits with external events and timers.
- ✗ Executing an approval without checking state. → ✓ Re-validate; approvals refer to a snapshot.
- ✗ No default on timeout. → ✓ Escalate, then a safe default (usually reject) with notification.
- ✗ Overrides without reasons. → ✓ Record reason and identity; feed into evaluation.
- ✗ Free-text-only rejection feedback. → ✓ Short category lists get high completion; free text is optional.

## d10: Caching strategy, batching and cost-aware execution
- ✗ Putting user context before the static system prompt. → ✓ Static prefix first, variable content after.
- ✗ Lowering a semantic similarity requirement to boost hit rate. → ✓ Wrong answers cost more than model calls; tune on labelled pairs.
- ✗ Misreading APIM `score-threshold`. → ✓ Lower value = stricter match.
- ✗ Caching prices or stock for days. → ✓ Short TTL tied to data versions, or don't cache.
- ✗ A shared cache without tenant/user partitioning. → ✓ Use vary-by and partitioned keys.

## v01: Evaluation strategy: human review, components and end-to-end
- ✗ Declaring success from component metrics alone. → ✓ Add system/journey metrics and drill down.
- ✗ Gating releases on an uncalibrated LLM judge. → ✓ Measure agreement with humans (κ > 0.7) first.
- ✗ Human review with no rubric or agreement checks. → ✓ Rubrics, training, blind review and inter-rater agreement.
- ✗ Only evaluating before release. → ✓ Also canary/A-B and continuous evaluation in production.
- ✗ Never refreshing datasets. → ✓ Refresh with production failures and new scenarios; version datasets.

## v02: Optimise performance: latency, rate limits, model routing and tokens
- ✗ Using an LLM call to decide which LLM to call for every request. → ✓ Cheap heuristics or a small classifier; LLM only for ambiguous cases.
- ✗ Setting `max_output_tokens` very high "just in case". → ✓ The limiter counts it; set realistic budgets.
- ✗ Parallelising everything. → ✓ Only independent, latency-critical steps, within quota.
- ✗ Judging a routing change by cost alone. → ✓ Check quality per segment; use quality floors and A/B tests.
- ✗ Optimising steps not on the critical path. → ✓ Use traces to target what actually determines latency.

## v03: Continuous improvement: LLM judges, synthetic data, optimisation loops, feedback
- ✗ One judge scoring everything at once. → ✓ Specialised single-criterion judges.
- ✗ Using the same model family as both agent and judge. → ✓ Self-preference bias; use a different family.
- ✗ Synthetic data without human validation. → ✓ Validate samples; anchor on real examples.
- ✗ Relying on thumbs-up rates alone. → ✓ Combine explicit, internal and implicit signals.
- ✗ Aggregate-only regression thresholds. → ✓ Per-segment checks catch masked regressions.

## v04: Observability and tracing in Foundry
- ✗ Assuming custom HTTP calls propagate trace context automatically. → ✓ Inject on the caller, extract on the callee.
- ✗ A span for every function. → ✓ Instrument semantic boundaries; 40–60 spans per interaction.
- ✗ Head sampling 5% in production multi-agent systems. → ✓ Rare errors vanish; prefer tail sampling.
- ✗ Logging full conversations. → ✓ Log decisions and metadata; hash/redact PII.
- ✗ Hard-coding the Application Insights connection string. → ✓ Read it from the environment/Key Vault.

## v05: Reliability, SLA and cost monitoring with automated remediation
- ✗ Averages on dashboards. → ✓ Use P95/P99 and per-agent slices.
- ✗ Automating remediation for novel failures. → ✓ Automate only known modes; humans handle the novel.
- ✗ Paging for every downstream symptom. → ✓ Correlate, find the root, suppress downstream.
- ✗ Chargeback before reliable metering. → ✓ Start with showback; agree allocation of shared costs.
- ✗ Ignoring model deployment changes in incident triage. → ✓ Check model/prompt/tool/config changes first (hypothesis order).

## s01: Resource access: identity, RBAC and network boundaries (Zero Trust)
- ✗ Granting Contributor so an agent can "read data". → ✓ Contributor is control plane; use scoped data-plane roles.
- ✗ One service principal for all agents. → ✓ Per-agent identities; separate blast radius and audit.
- ✗ Deny-all network policies without a DNS allow. → ✓ Name resolution breaks; add explicit allows.
- ✗ Trusting any valid token from the tenant. → ✓ Validate audience and the caller allow-list too.
- ✗ Standing admin access for engineers. → ✓ PIM just-in-time with approval and expiry.

## s02: Authentication flows and secrets management with Key Vault
- ✗ Using the agent's identity when the user's permissions must apply. → ✓ Use OBO/delegated flows.
- ✗ Key Vault access policies granting broad rights. → ✓ Use Azure RBAC with specific roles.
- ✗ Client secrets as the default app credential. → ✓ Prefer certificates or federated credentials; rotate.
- ✗ Purge protection off on production vaults. → ✓ Enable soft delete and purge protection.
- ✗ Single-secret rotation with hard cut-over. → ✓ Dual/blue-green secrets for zero-downtime rotation.

## s03: Guardrails and shift-left security (AI Red Teaming Agent)
- ✗ Relying on output content filters alone. → ✓ Guard inputs, tool calls, tool responses and outputs.
- ✗ Treating tool responses as trusted. → ✓ Scan for indirect injection and redact PII before injection.
- ✗ Running an LLM judge on every request for every rule. → ✓ Cascade cheap checks first; judge only borderline cases.
- ✗ Testing guardrails with a handful of manual prompts. → ✓ Coverage matrix with variations; regression in CI.
- ✗ Red-teaming once before launch. → ✓ Shift-left: red-team every candidate version in CI and track ASR.

## s04: Release methodology: DTAP, blue/green, canary and rollback
- ✗ Canary gates on errors and latency only. → ✓ Include evaluation quality metrics.
- ✗ Rebuilding artifacts per environment. → ✓ Build once; promote the same artifact.
- ✗ Rolling back one component of a release. → ✓ Roll back the whole batch together.
- ✗ Blue/green without backward-compatible data changes. → ✓ Old and new versions must work with the same data during switch.
- ✗ Releasing to regulated tenants without notice. → ✓ Tenant rollout tiers and pinning windows.

## s05: Testing strategy and CI/CD with IaC for multi-agent systems
- ✗ Only end-to-end tests with live LLM calls. → ✓ Unit and contract tests catch most bugs cheaply; mock the LLM.
- ✗ Deploying agents and tools in parallel without ordering. → ✓ Dependencies first via a DAG and `needs:`.
- ✗ Client secrets in CI. → ✓ OIDC federated credentials.
- ✗ Evaluation gates with zero tolerance on noisy metrics. → ✓ Variance-based thresholds; strict only for safety.
- ✗ Infrastructure created by hand in the portal. → ✓ IaC with what-if, versioned and reviewed.

