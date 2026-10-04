---
title: "AI-500 (Microsoft Certified: Multi-Agent AI Solutions Expert)"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500: Microsoft Certified: Multi-Agent AI Solutions Expert

AI-500 (*Designing and Implementing Multi-Agent AI Solutions*) is an **expert** exam. It tests whether you can decompose goals into agents and tools, build orchestration, memory, RAG and tool ecosystems in Python on Azure, evaluate and monitor them in production, and secure, govern and ship them. **Develop** is the largest domain (30–35%); the other three are close behind.

## Start here
1. Open the **AI-500 Study Hub** (https://claude.ai/artifact/WBg4UvZLizXnza8mbGvMze) and take the 15-minute diagnostic.
2. Work [roadmap.md](roadmap.md) top to bottom; each module has a concept note below for revision.
3. Log mocks in [readiness.md](readiness.md); book only when its gate is met.

## Status (2026-10-04)
Planned, not started. SRS cards (deck `ai-500`) start appearing from 2026-11-09, about two modules per day; re-date them if your pace differs.

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

## Concept notes (28)
- [f01: The expert's map: when (and how) to go multi-agent on Azure](concepts/f01-the-expert-s-map-when-and-how-to-go-multi-agent-on-azure.md)
- [f02: Foundry Agent Service v2 and the agentic loop in Python](concepts/f02-foundry-agent-service-v2-and-the-agentic-loop-in-python.md)
- [a01: Decompose goals into workflows, agents and tools](concepts/a01-decompose-goals-into-workflows-agents-and-tools.md)
- [a02: Workflows, control loops and human-in-the-loop design](concepts/a02-workflows-control-loops-and-human-in-the-loop-design.md)
- [a03: Personas, scopes, autonomy, tool permissions and protocols](concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md)
- [a04: Memory architecture and multi-tier state persistence](concepts/a04-memory-architecture-and-multi-tier-state-persistence.md)
- [a05: Technology components: integration, Zero Trust, compute, observability, dev tools](concepts/a05-technology-components-integration-zero-trust-compute-observa.md)
- [a06: Human-AI experience (HAX), responsible AI and model matching](concepts/a06-human-ai-experience-hax-responsible-ai-and-model-matching.md)
- [d01: Advanced prompt engineering and prompt lifecycle](concepts/d01-advanced-prompt-engineering-and-prompt-lifecycle.md)
- [d02: Fine-tuning strategy for agents and models](concepts/d02-fine-tuning-strategy-for-agents-and-models.md)
- [d03: Context management and memory implementation](concepts/d03-context-management-and-memory-implementation.md)
- [d04: Multi-agent RAG and knowledge integration](concepts/d04-multi-agent-rag-and-knowledge-integration.md)
- [d05: Tool ecosystems: function calling, MCP servers and clients](concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md)
- [d06: Tool errors, fallbacks and result validation](concepts/d06-tool-errors-fallbacks-and-result-validation.md)
- [d07: Orchestration patterns, scaling and A2A integration](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md)
- [d08: Frameworks: Agent Framework, LangGraph, LangChain, Hugging Face and middleware](concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md)
- [d09: Implementing human-in-the-loop: approvals, overrides and edge cases](concepts/d09-implementing-human-in-the-loop-approvals-overrides-and-edge.md)
- [d10: Caching strategy, batching and cost-aware execution](concepts/d10-caching-strategy-batching-and-cost-aware-execution.md)
- [v01: Evaluation strategy: human review, components and end-to-end](concepts/v01-evaluation-strategy-human-review-components-and-end-to-end.md)
- [v02: Optimise performance: latency, rate limits, model routing and tokens](concepts/v02-optimise-performance-latency-rate-limits-model-routing-and-t.md)
- [v03: Continuous improvement: LLM judges, synthetic data, optimisation loops, feedback](concepts/v03-continuous-improvement-llm-judges-synthetic-data-optimisatio.md)
- [v04: Observability and tracing in Foundry](concepts/v04-observability-and-tracing-in-foundry.md)
- [v05: Reliability, SLA and cost monitoring with automated remediation](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md)
- [s01: Resource access: identity, RBAC and network boundaries (Zero Trust)](concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md)
- [s02: Authentication flows and secrets management with Key Vault](concepts/s02-authentication-flows-and-secrets-management-with-key-vault.md)
- [s03: Guardrails and shift-left security (AI Red Teaming Agent)](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md)
- [s04: Release methodology: DTAP, blue/green, canary and rollback](concepts/s04-release-methodology-dtap-blue-green-canary-and-rollback.md)
- [s05: Testing strategy and CI/CD with IaC for multi-agent systems](concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md)

## Labs (12)
- [The guarded agentic loop (Foundry Agent Service v2)](labs/lab-loop.md) (75 min, cost: low)
- [Multi-agent RAG: hybrid retrieval, reranking and shared knowledge](labs/lab-rag.md) (120 min, cost: medium)
- [Build, host and govern an MCP server](labs/lab-mcp.md) (100 min, cost: low)
- [Agent Framework orchestrations and middleware](labs/lab-maf.md) (100 min, cost: low)
- [Integrate remote agents with A2A](labs/lab-a2a.md) (60 min, cost: low)
- [Durable human-in-the-loop approvals](labs/lab-hitl.md) (90 min, cost: low)
- [AI gateway: token limits, semantic caching and token metrics](labs/lab-gateway.md) (90 min, cost: medium)
- [Evaluation pipeline: built-in, custom and calibrated judges](labs/lab-eval.md) (100 min, cost: low)
- [Tracing, dashboards and alerts](labs/lab-observability.md) (90 min, cost: low)
- [Zero Trust for agents: workload identity, RBAC, private networking, Key Vault](labs/lab-security.md) (120 min, cost: high)
- [Guardrails and the AI Red Teaming Agent](labs/lab-redteam.md) (90 min, cost: medium)
- [CI/CD with IaC, OIDC, dependency order and evaluation gates](labs/lab-cicd.md) (100 min, cost: medium)
