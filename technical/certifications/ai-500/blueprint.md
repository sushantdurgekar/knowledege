---
title: "AI-500 blueprint"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, blueprint]
status: learning
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-500
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/certifications/exams/ai-500/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/certifications/multi-agent-ai-solutions-expert/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/courses/ai-500t00
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/paths/aaai-3-deploy-govern-agentic-ai-solutions-azure/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience
    accessed: 2026-10-02
---
# AI-500 blueprint: Microsoft Certified: Multi-Agent AI Solutions Expert

> Skills outline as of **16 July 2026** (checked 2026-10-02). Study Hub: https://claude.ai/artifact/WBg4UvZLizXnza8mbGvMze

## Exam facts
- **700**: passing score (1–1000)
- **~120 min**: candidates report ~65 questions incl. 2 case studies (beta)
- **4**: skill domains (outline of 16 Jul 2026)
- **Expert**: requires Azure AI Apps and Agents Developer Associate (AI-103)
- **English**: only language at launch
- **Python**: Foundry SDK, Agent Framework, LangGraph code

## Notices (read before booking)
- **Prerequisite and status.** To earn the **Multi-Agent AI Solutions Expert** certification you must also hold **Azure AI Apps and Agents Developer Associate** (exam AI-103). AI-500 launched as a **beta** in mid-2026 (skills outline 16 July 2026; course AI-500T00 from 30 September 2026). Beta exams are scored after the beta closes and question formats can change. Check the exam page before booking.
- **What "expert" means here.** Questions rarely ask *what a feature is*. They ask *which design* meets competing constraints (latency vs cost vs safety vs audit), *what went wrong* given traces or metrics, and *what to change first*. Each module therefore includes trade-off tables, failure modes and worked incident examples.
- **Labs cost money.** Multi-agent labs multiply model calls. Use small models (e.g., gpt-5.4-mini or gpt-5.4-nano; gpt-4.1-family models are deprecated, so new subscriptions can't deploy them) in dev, set token budgets and loop limits, cap parallelism, and delete resource groups the same day. Every lab lists its teardown command.
- **Recent platform changes this hub reflects (checked 2 Oct 2026).** 1) **Foundry agents** (July 2026): new agents get their own Entra agent identity and a stable endpoint at creation; *agent applications* are the legacy publish model, and only **MCP** and **A2A** tools authenticate as the agent identity today. 2) **Foundry workflows** (visual designer) retire on **1 Dec 2026**: use Microsoft Agent Framework. 3) The local `azure-ai-evaluation` paths (`evaluate()`, `RedTeam`) target Foundry **classic** projects; new Foundry projects run evaluations and red teaming in the cloud through the **evals API**. 4) **LangGraph** recommends `interrupt()` + `Command(resume=...)` with a durable checkpointer for human-in-the-loop. 5) Model lifecycle: gpt-4.1-nano retires 14 Oct 2026, o3/o4-mini/o3-mini on 19 Nov 2026; stored-completions distillation on 15 Oct 2026.

## Domains and weights
| Domain | Weight | Modules |
|---|---|---|
| D1 Architect multi-agent solutions | 15–20% | f01, a01, a02, a03, a04, a05, a06 |
| D2 Develop multi-agent solutions in Azure | 30–35% | f02, d01, d02, d03, d04, d05, d06, d07, d08, d09, d10 |
| D3 Evaluate, optimize, and monitor multi-agent solutions | 20–25% | v01, v02, v03, v04, v05 |
| D4 Secure, govern, and deploy multi-agent solutions | 20–25% | s01, s02, s03, s04, s05 |

## Skills measured → where to study them
### D1 Architect multi-agent solutions (15–20%)
**Design logical architecture for multi-agent solutions**

- [ ] Decompose goals and objectives into workflows, agents, and tools → [a01](concepts/a01-decompose-goals-into-workflows-agents-and-tools.md)
- [ ] Design workflows, including agents, subagents, control loops, and human-in-the-loop → [a02](concepts/a02-workflows-control-loops-and-human-in-the-loop-design.md)
- [ ] Specify agent personas, scopes, boundaries, autonomy levels, and behavioral guidelines → [a03](concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md)
- [ ] Specify tool scopes, permission boundaries, and authentication methods → [a03](concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md), [s01](concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md)
- [ ] Specify appropriate protocols for communication between agents and with other components → [a03](concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md), [d07](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md)
- [ ] Design controls and functionality to support human-AI experience (HAX) and responsible AI → [a06](concepts/a06-human-ai-experience-hax-responsible-ai-and-model-matching.md)
- [ ] Design short-term and long-term memory architectures, including context sharing → [a04](concepts/a04-memory-architecture-and-multi-tier-state-persistence.md)
- [ ] Match task demands to model family capacities → [a06](concepts/a06-human-ai-experience-hax-responsible-ai-and-model-matching.md)

**Specify technology components to include in a multi-agent solution**

- [ ] Integration components for agent-to-agent, agent-to-tool and agent-to-knowledge routing → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md)
- [ ] Components for Zero Trust multi-agent solutions (per-agent identity, lateral movement, compliance mapping) → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md), [s01](concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md)
- [ ] Multi-tier state persistence (session, shared team state, long-term semantic memory) → [a04](concepts/a04-memory-architecture-and-multi-tier-state-persistence.md)
- [ ] Compute components for scalability, reliability, efficiency, security and cost → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md)
- [ ] Observability components (trace correlation, reasoning-path logging, replay capture) → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md), [v04](concepts/v04-observability-and-tracing-in-foundry.md)
- [ ] Monitoring components (coordination tracking, drift and regression detection, automated remediation) → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md), [v05](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md)
- [ ] Developer tools and environment (dev containers, VS Code extensions, CLI, dependencies, AI instructions) → [a05](concepts/a05-technology-components-integration-zero-trust-compute-observa.md), [s05](concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md)

### D2 Develop multi-agent solutions in Azure (30–35%)
**Design and implement advanced prompt engineering strategies**

- [ ] Advanced prompt techniques: examples, dynamic context injection, defensive guidelines, prompt lifecycle → [d01](concepts/d01-advanced-prompt-engineering-and-prompt-lifecycle.md)
- [ ] Context-aware multi-agent behaviors → [d01](concepts/d01-advanced-prompt-engineering-and-prompt-lifecycle.md), [d03](concepts/d03-context-management-and-memory-implementation.md)
- [ ] Fine-tuning strategy for agents and models, including data and frequency → [d02](concepts/d02-fine-tuning-strategy-for-agents-and-models.md)

**Design and implement agent memory, context management, and knowledge integration**

- [ ] Context management in and between agents (accumulation, retrieval, injection, compaction) → [d03](concepts/d03-context-management-and-memory-implementation.md)
- [ ] Single- and multi-agent memory strategies (security, compliance, lifecycle, storage, sessions) → [d03](concepts/d03-context-management-and-memory-implementation.md), [a04](concepts/a04-memory-architecture-and-multi-tier-state-persistence.md)
- [ ] Multi-agent RAG architecture (chunking, embedding quality, retrieval precision) → [d04](concepts/d04-multi-agent-rag-and-knowledge-integration.md)
- [ ] Knowledge integration for multi-agent consumption (search, RAG, MCP sources, semantic search) → [d04](concepts/d04-multi-agent-rag-and-knowledge-integration.md)

**Build and integrate tool ecosystems**

- [ ] External resources: function calling, specified tool use, dynamic tool use → [d05](concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md)
- [ ] MCP servers and clients with Azure Functions, Logic Apps and API Management → [d05](concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md)
- [ ] Tool error-handling and fallback mechanisms → [d06](concepts/d06-tool-errors-fallbacks-and-result-validation.md)
- [ ] Tool result validation and quality checks → [d06](concepts/d06-tool-errors-fallbacks-and-result-validation.md)

**Implement multi-agent orchestration**

- [ ] Orchestration patterns: hub-and-spoke, sequential, parallel, peer-to-peer, orchestrator-subagent → [d07](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md)
- [ ] Human-in-the-loop: approval workflows, overrides, edge cases → [d09](concepts/d09-implementing-human-in-the-loop-approvals-overrides-and-edge.md)
- [ ] Caching strategy: prompt, semantic and response caching → [d10](concepts/d10-caching-strategy-batching-and-cost-aware-execution.md)
- [ ] Scaling and control of spawning, batching and concurrent execution → [d07](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md), [d10](concepts/d10-caching-strategy-batching-and-cost-aware-execution.md)
- [ ] Integrate existing agents securely with A2A and/or MCP → [d07](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md), [d05](concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md)
- [ ] Frameworks: Agent Framework, LangChain, LangGraph → [d08](concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md)
- [ ] Advanced capabilities with Hugging Face Transformers → [d08](concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md)
- [ ] Middleware for logging, authorization and exception handling → [d08](concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md)

### D3 Evaluate, optimize, and monitor multi-agent solutions (20–25%)
**Design and implement evaluation and validation strategies**

- [ ] Human review process to evaluate solutions in Foundry → [v01](concepts/v01-evaluation-strategy-human-review-components-and-end-to-end.md)
- [ ] Evaluations for memory, knowledge, tools and prompts → [v01](concepts/v01-evaluation-strategy-human-review-components-and-end-to-end.md)

**Optimize prompt and model performance**

- [ ] Optimize task duration, including parallelism and rate limits → [v02](concepts/v02-optimise-performance-latency-rate-limits-model-routing-and-t.md)
- [ ] Diagnose context window issues (sliding-window amnesia, summary drift, vector-only recall, entity continuity) → [v02](concepts/v02-optimise-performance-latency-rate-limits-model-routing-and-t.md), [d03](concepts/d03-context-management-and-memory-implementation.md)
- [ ] Continuous improvement: LLM-as-a-judge, synthetic data, semantic optimization loops, user feedback → [v03](concepts/v03-continuous-improvement-llm-judges-synthetic-data-optimisatio.md)

**Design and implement observability and monitoring**

- [ ] Reliability monitoring: agent health, workflow failures, trace correlation, drift, regression, remediation → [v05](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md), [v04](concepts/v04-observability-and-tracing-in-foundry.md)
- [ ] Availability, performance, reliability and SLA monitoring → [v05](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md)
- [ ] Token usage optimization: limits, loop controls, tool calls → [v02](concepts/v02-optimise-performance-latency-rate-limits-model-routing-and-t.md)
- [ ] Cost monitoring: usage, quotas, allocations, chargebacks → [v05](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md)
- [ ] Tracing in Foundry: tokens, prompts, correlation IDs, alerting, execution tracking → [v04](concepts/v04-observability-and-tracing-in-foundry.md)

### D4 Secure, govern, and deploy multi-agent solutions (20–25%)
**Design and implement security**

- [ ] Resource access: identity-based access, network boundaries, access policies, RBAC → [s01](concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md)
- [ ] Authentication flows: impersonation, on-behalf-of, API keys, OAuth 2.0 → [s02](concepts/s02-authentication-flows-and-secrets-management-with-key-vault.md)
- [ ] Secrets management with Azure Key Vault (rotation, RBAC, encryption) → [s02](concepts/s02-authentication-flows-and-secrets-management-with-key-vault.md)
- [ ] Shift-left security, including the AI Red Teaming Agent in Foundry → [s03](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md)

**Design and implement guardrails**

- [ ] Multi-intervention guardrails: user inputs, tool calls, tool responses, outputs → [s03](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md)
- [ ] Custom guardrails for domain-specific constraints → [s03](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md)
- [ ] Guardrail testing and validation, including synthetic data → [s03](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md)

**Deploy multi-agent solutions to Azure**

- [ ] Release methodology: DTAP, blue/green, canary → [s04](concepts/s04-release-methodology-dtap-blue-green-canary-and-rollback.md)
- [ ] Multi-environment release strategies, rollback, release management, rollout → [s04](concepts/s04-release-methodology-dtap-blue-green-canary-and-rollback.md)
- [ ] Testing strategy: unit, regression, integration, automated evaluations → [s05](concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md)
- [ ] CI/CD requirements, including IaC deployments and testing → [s05](concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md)

## Exam tactics
- Find the binding constraint first: *regulated audit* (deterministic workflow, immutable logs, human review) vs *latency* (parallel, caching, smaller models) vs *cost* (routing tiers, caching, token budgets) vs *isolation* (per-agent identity, tenant partitions).
- Prefer the **simplest** architecture that meets the requirement: one agent with tools beats a multi-agent system unless specialisation, parallelism, separation of duties or security boundaries justify the extra hops.
- For incident questions, follow the order: what changed (model, prompt, tool, orchestration, config) → which span/agent diverged → replay → fix → regression test.
- Security answers are layered: identity (per-agent, least privilege, OBO when user permissions matter) + network (private endpoints, deny-by-default) + guardrails at every intervention point + secrets in Key Vault.
- Evaluation answers need **both** component and end-to-end metrics, calibrated judges, and gates in CI/CD.
- Case studies: read the requirements list first, then the environment; mark items to revisit before leaving the case.
