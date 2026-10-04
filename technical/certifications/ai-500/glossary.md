---
title: "AI-500 glossary"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, glossary]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-500 glossary

| Term | Meaning |
|---|---|
| **A2A (Agent2Agent)** | Open protocol for delegating tasks between agents; agents publish agent cards; tasks, messages and artifacts. |
| **Agent card** | A2A metadata document describing an agent's skills, endpoint and authentication. |
| **Agent Framework** | Microsoft's open-source Python/.NET framework for agents, workflows and orchestrations; successor to Semantic Kernel and AutoGen. |
| **Agent identity** | Distinct Microsoft Entra identity a Foundry agent receives when published; needs its own RBAC assignments. |
| **Agent registry** | Catalogue of agents with capabilities, versions and health used for discovery and routing. |
| **AI gateway** | API Management capabilities for models: token limits, semantic caching, metrics, load balancing. |
| **AI Red Teaming Agent** | Foundry capability (PyRIT-based) that attacks a target with risk categories and strategies and reports attack success rate. |
| **API Center** | Azure service to catalogue APIs and MCP servers for discovery and governance. |
| **Attack success rate (ASR)** | Share of red-team attacks that produced an undesired response. |
| **Autonomy level** | How independently an agent may act: full-auto, supervised, approval-required, human-only. |
| **Background mode** | Responses API option (background=True) for long tasks; poll with responses.retrieve. |
| **Blue/green deployment** | Two full environments with an instant traffic switch and rollback. |
| **Calibration** | Aligning model confidence scores with observed accuracy on labelled outcomes. |
| **Canary release** | Gradually shifting traffic to a new version with gates at each stage. |
| **Checkpointing** | Persisting workflow state so long runs can resume after failures or human pauses. |
| **Circuit breaker** | Pattern that stops calling a failing dependency (open), probes later (half-open) and resumes (closed). |
| **Cohen's kappa (κ)** | Agreement statistic corrected for chance; used to calibrate LLM judges against humans (target > ~0.7). |
| **Context compaction** | Summarising or pruning context to fit budgets; risks summary drift. |
| **Continuous evaluation** | Evaluating a sample of production traffic on a schedule to detect drift. |
| **Contract test** | Test that verifies schemas between agents and tools stay compatible. |
| **Cosmos DB vector search** | Vector indexing and VectorDistance queries in Azure Cosmos DB for NoSQL. |
| **Crypto-shredding** | Rendering data unreadable by destroying its encryption key (requires customer-managed keys). |
| **Digest** | Structured key-value summary of case facts passed between agents instead of transcripts. |
| **DPO** | Direct preference optimization: fine-tuning from preferred vs non-preferred outputs. |
| **DTAP** | Development, Testing, Acceptance, Production environment progression. |
| **Durable Functions** | Azure Functions extension for stateful orchestrations with timers and external events. |
| **Episodic memory** | Stored records of specific past interactions. |
| **Error budget** | Allowed unreliability implied by an SLO; paces releases. |
| **ETag** | Version token used for optimistic concurrency (if-match; 412 on conflict). |
| **Feature flag** | Switch that enables behaviour without redeploying, e.g., per tenant. |
| **Function middleware** | Agent Framework middleware wrapping tool invocations. |
| **GenAI semantic conventions** | OpenTelemetry attribute names for AI calls (e.g., gen_ai.usage.input_tokens). |
| **Groundedness detection** | Check that outputs are supported by provided sources. |
| **HAX guidelines** | Microsoft's 18 Guidelines for Human-AI Interaction. |
| **Hub-and-spoke** | Orchestration pattern with a central orchestrator routing to specialist agents. |
| **Hybrid search** | Combining keyword (BM25) and vector retrieval, fused with RRF. |
| **Idempotency key** | Identifier that lets a service ignore duplicate retries of the same operation. |
| **LangGraph** | Library for stateful agent graphs with checkpointers and interrupts. |
| **LLM-as-a-judge** | Using a language model with a rubric to score outputs. |
| **Managed compute** | Dedicated GPU endpoints in Foundry used for Hugging Face and other open models. |
| **MCP** | Model Context Protocol: standard for exposing tools, resources and prompts to AI clients. |
| **Minimum quorum** | Parallel policy that proceeds when a required number of branches succeed. |
| **MMR** | Maximal marginal relevance: reranking for diversity. |
| **nDCG** | Normalised discounted cumulative gain: ranking quality metric. |
| **On-behalf-of (OBO)** | OAuth flow where a middle tier exchanges a user's token for a downstream token as the user. |
| **PIM** | Privileged Identity Management: just-in-time, approved, time-bound elevation. |
| **Prompt caching** | Provider discount for identical prompt prefixes. |
| **Prompt Shields** | Content Safety feature detecting user prompt attacks and document (indirect) attacks. |
| **Quality floor** | Minimum quality score for a routing tier before escalating to a stronger model. |
| **Replay snapshot** | Captured inputs, versions and mocked tool responses for reproducing a failure. |
| **RFT** | Reinforcement fine-tuning using a grader's rewards. |
| **RRF** | Reciprocal Rank Fusion: merges ranked lists in hybrid search. |
| **Semantic caching** | Returning a stored answer for a semantically similar earlier question. |
| **Semantic memory** | Generalised long-term knowledge such as preferences and patterns. |
| **Semantic ranker** | Azure AI Search reranking of top results with captions/answers. |
| **Shadow launch** | Mirroring traffic to a new version without affecting users. |
| **SLI / SLO / SLA** | Measurement / internal target / external commitment. |
| **Specified tool use** | Forcing or constraining tool selection (e.g., tool_choice). |
| **Tail sampling** | Deciding to keep a trace after it completes (e.g., all errors). |
| **traceparent** | W3C header carrying trace ID, parent span ID and flags. |
| **Workload identity federation** | Kubernetes service accounts exchanging tokens for Entra identities without secrets. |
| **Zero Trust** | Verify explicitly, least privilege, assume breach. |
