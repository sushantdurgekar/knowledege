---
title: "AI-500 roadmap"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, roadmap]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500 roadmap

> Blocks are packed into weeks at your pace. The order follows the four official learning paths (architect → develop → evaluate/optimise/monitor → secure/govern/deploy), with Python labs after the modules they practise.
>
> Total planned time ≈ **73 hours**. The hub's Roadmap tab packs these blocks into weeks at your pace; tick boxes here as you go. SRS cards for each module are scheduled to start appearing from **2026-11-09** (about two modules per day); re-date them if your pace differs.

## Block 1: Foundations
- [ ] Take the diagnostic (Start tab) (15 min)
- [ ] Set up: Azure subscription, Foundry project with a small model deployment, Python 3.12 venv, VS Code + Foundry Toolkit, Azure CLI/azd, Docker (90 min)
- [ ] Module **f01**: [The expert's map: when (and how) to go multi-agent on Azure](concepts/f01-the-expert-s-map-when-and-how-to-go-multi-agent-on-azure.md) (75 min)
- [ ] Module **f02**: [Foundry Agent Service v2 and the agentic loop in Python](concepts/f02-foundry-agent-service-v2-and-the-agentic-loop-in-python.md) (85 min)
- [ ] Lab: [The guarded agentic loop (Foundry Agent Service v2)](labs/lab-loop.md) (75 min, cost: low)

## Block 2: Architecture
- [ ] Module **a01**: [Decompose goals into workflows, agents and tools](concepts/a01-decompose-goals-into-workflows-agents-and-tools.md) (80 min)
- [ ] Module **a02**: [Workflows, control loops and human-in-the-loop design](concepts/a02-workflows-control-loops-and-human-in-the-loop-design.md) (80 min)
- [ ] Module **a03**: [Personas, scopes, autonomy, tool permissions and protocols](concepts/a03-personas-scopes-autonomy-tool-permissions-and-protocols.md) (75 min)
- [ ] Module **a04**: [Memory architecture and multi-tier state persistence](concepts/a04-memory-architecture-and-multi-tier-state-persistence.md) (85 min)
- [ ] Module **a05**: [Technology components: integration, Zero Trust, compute, observability, dev tools](concepts/a05-technology-components-integration-zero-trust-compute-observa.md) (90 min)
- [ ] Module **a06**: [Human-AI experience (HAX), responsible AI and model matching](concepts/a06-human-ai-experience-hax-responsible-ai-and-model-matching.md) (75 min)
- [ ] Case study: Lamna Healthcare care-coordination platform (in the hub)

## Block 3: Prompts, context and knowledge
- [ ] Module **d01**: [Advanced prompt engineering and prompt lifecycle](concepts/d01-advanced-prompt-engineering-and-prompt-lifecycle.md) (85 min)
- [ ] Module **d02**: [Fine-tuning strategy for agents and models](concepts/d02-fine-tuning-strategy-for-agents-and-models.md) (60 min)
- [ ] Module **d03**: [Context management and memory implementation](concepts/d03-context-management-and-memory-implementation.md) (90 min)
- [ ] Module **d04**: [Multi-agent RAG and knowledge integration](concepts/d04-multi-agent-rag-and-knowledge-integration.md) (95 min)
- [ ] Lab: [Multi-agent RAG: hybrid retrieval, reranking and shared knowledge](labs/lab-rag.md) (120 min, cost: medium)
- [ ] Review: Practice → Weak spots (25 questions) + due flashcards (45 min)

## Block 4: Tools and orchestration
- [ ] Module **d05**: [Tool ecosystems: function calling, MCP servers and clients](concepts/d05-tool-ecosystems-function-calling-mcp-servers-and-clients.md) (90 min)
- [ ] Module **d06**: [Tool errors, fallbacks and result validation](concepts/d06-tool-errors-fallbacks-and-result-validation.md) (75 min)
- [ ] Lab: [Build, host and govern an MCP server](labs/lab-mcp.md) (100 min, cost: low)
- [ ] Module **d07**: [Orchestration patterns, scaling and A2A integration](concepts/d07-orchestration-patterns-scaling-and-a2a-integration.md) (95 min)
- [ ] Module **d08**: [Frameworks: Agent Framework, LangGraph, LangChain, Hugging Face and middleware](concepts/d08-frameworks-agent-framework-langgraph-langchain-hugging-face.md) (90 min)
- [ ] Lab: [Agent Framework orchestrations and middleware](labs/lab-maf.md) (100 min, cost: low)
- [ ] Lab: [Integrate remote agents with A2A](labs/lab-a2a.md) (60 min, cost: low)
- [ ] Module **d09**: [Implementing human-in-the-loop: approvals, overrides and edge cases](concepts/d09-implementing-human-in-the-loop-approvals-overrides-and-edge.md) (80 min)
- [ ] Lab: [Durable human-in-the-loop approvals](labs/lab-hitl.md) (90 min, cost: low)
- [ ] Module **d10**: [Caching strategy, batching and cost-aware execution](concepts/d10-caching-strategy-batching-and-cost-aware-execution.md) (75 min)
- [ ] Lab: [AI gateway: token limits, semantic caching and token metrics](labs/lab-gateway.md) (90 min, cost: medium)

## Block 5: Evaluate, optimise, monitor
- [ ] Module **v01**: [Evaluation strategy: human review, components and end-to-end](concepts/v01-evaluation-strategy-human-review-components-and-end-to-end.md) (90 min)
- [ ] Module **v02**: [Optimise performance: latency, rate limits, model routing and tokens](concepts/v02-optimise-performance-latency-rate-limits-model-routing-and-t.md) (85 min)
- [ ] Module **v03**: [Continuous improvement: LLM judges, synthetic data, optimisation loops, feedback](concepts/v03-continuous-improvement-llm-judges-synthetic-data-optimisatio.md) (85 min)
- [ ] Lab: [Evaluation pipeline: built-in, custom and calibrated judges](labs/lab-eval.md) (100 min, cost: low)
- [ ] Module **v04**: [Observability and tracing in Foundry](concepts/v04-observability-and-tracing-in-foundry.md) (85 min)
- [ ] Module **v05**: [Reliability, SLA and cost monitoring with automated remediation](concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md) (90 min)
- [ ] Lab: [Tracing, dashboards and alerts](labs/lab-observability.md) (90 min, cost: low)
- [ ] Case study: Adventure Works retail support at scale (in the hub)

## Block 6: Checkpoint
- [ ] **Mock A**: Checkpoint (120 min) → record the result in [readiness.md](readiness.md)
- [ ] Remediate Mock A: weakest domain modules, traps and Practice → Weak spots (D4 items preview the next block) (150 min)

## Block 7: Secure, govern, deploy
- [ ] Module **s01**: [Resource access: identity, RBAC and network boundaries (Zero Trust)](concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md) (85 min)
- [ ] Module **s02**: [Authentication flows and secrets management with Key Vault](concepts/s02-authentication-flows-and-secrets-management-with-key-vault.md) (80 min)
- [ ] Lab: [Zero Trust for agents: workload identity, RBAC, private networking, Key Vault](labs/lab-security.md) (120 min, cost: high)
- [ ] Module **s03**: [Guardrails and shift-left security (AI Red Teaming Agent)](concepts/s03-guardrails-and-shift-left-security-ai-red-teaming-agent.md) (95 min)
- [ ] Lab: [Guardrails and the AI Red Teaming Agent](labs/lab-redteam.md) (90 min, cost: medium)
- [ ] Module **s04**: [Release methodology: DTAP, blue/green, canary and rollback](concepts/s04-release-methodology-dtap-blue-green-canary-and-rollback.md) (80 min)
- [ ] Module **s05**: [Testing strategy and CI/CD with IaC for multi-agent systems](concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md) (85 min)
- [ ] Lab: [CI/CD with IaC, OIDC, dependency order and evaluation gates](labs/lab-cicd.md) (100 min, cost: medium)
- [ ] Case study: Woodgrove Bank regulated agent platform (in the hub)

## Block 8: Exam readiness
- [ ] Cheat sheet + skills checklist: every skill rated Solid (75 min)
- [ ] **Mock B**: Final (120 min) → record the result in [readiness.md](readiness.md)
- [ ] Remediate Mock B misses; re-take missed case-study items (120 min)
- [ ] Official practice assessment (if available) and the exam sandbox (60 min)
- [ ] Book when two mocks are 85%+ weighted with every domain at 70%+ (15 min)

