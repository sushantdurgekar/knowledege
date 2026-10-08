---
title: "AI Engineering: levels L1–L4"
track: technical
domain: data-ai
subject: ai-engineering
tags: [ai-engineering, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# AI Engineering: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Explain how ML and LLMs work and build a simple, responsible LLM-powered app that calls a model API.  
**Time:** about 40–55 hours · **Certification:** AI-901 Azure AI Fundamentals: passed 7 Oct 2026 (883); Optional: AWS Certified AI Practitioner · **Hub:** `hubs/ai-engineering-l1-foundation-hub.html`

### L1-01 AI, ML and deep learning map
- [ ] Supervised, unsupervised, reinforcement learning
- [ ] where LLMs fit
- [ ] responsible AI principles (links ai-901 01)

### L1-02 Data for ML
- [ ] Features and labels
- [ ] train/validation/test splits
- [ ] data leakage
- [ ] basic statistics refresher

### L1-03 How LLMs work
- [ ] Tokens
- [ ] context windows
- [ ] next-token prediction
- [ ] temperature
- [ ] hallucinations

### L1-04 Prompt engineering
- [ ] Instructions, examples, roles
- [ ] chain-of-thought vs reasoning models
- [ ] prompt templates

### L1-05 Calling model APIs
- [ ] OpenAI/Anthropic/Azure SDKs
- [ ] messages
- [ ] streaming
- [ ] structured output with JSON schema
- [ ] costs and rate limits

### L1-06 Building a small AI app
- [ ] Streamlit or FastAPI front end
- [ ] conversation state
- [ ] secrets handling

### L1-07 Embeddings first look
- [ ] What embeddings are
- [ ] cosine similarity
- [ ] semantic search demo

**Capstone.** **Fruit-shop FAQ bot:** Streamlit chat app with structured answers, a simple keyword+embedding search over 30 FAQs, cost tracking and a responsible-AI checklist.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Build and evaluate classic ML models, RAG systems and tool-using agents.  
**Time:** about 80–100 hours · **Certification:** AI-103 Azure AI Apps and Agents Developer (hub ready); Optional: AWS MLA-C02 (GA 14 Jan 2027) · **Hub:** `hubs/ai-engineering-l2-proficient-hub.html`

### L2-01 Classic ML
- [ ] Linear/logistic regression
- [ ] trees and ensembles
- [ ] k-means
- [ ] scikit-learn pipelines

### L2-02 Model evaluation
- [ ] Accuracy, precision/recall, F1, ROC-AUC
- [ ] regression metrics
- [ ] cross-validation
- [ ] over- and underfitting

### L2-03 RAG pipelines
- [ ] Loading and chunking
- [ ] embedding models
- [ ] vector stores
- [ ] hybrid search and re-ranking
- [ ] citations

### L2-04 Tool calling
- [ ] Function/tool schemas
- [ ] the tool loop
- [ ] error handling

### L2-05 Agents
- [ ] Agent loop
- [ ] planning
- [ ] memory
- [ ] LangGraph and OpenAI Agents SDK basics

### L2-06 MCP
- [ ] MCP servers and clients
- [ ] tools, resources, prompts
- [ ] security of tool access

### L2-07 LLM evaluation basics
- [ ] Golden datasets
- [ ] LLM-as-judge
- [ ] RAG metrics (groundedness, relevance)

### L2-08 AI-assisted development
- [ ] Claude Code and coding agents
- [ ] reviewing AI-written code

**Capstone.** **Docs assistant with evals:** RAG over the vault's own notes with hybrid search, citations, an MCP tool for live data, and an evaluation report on 50 questions.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design multi-agent systems, fine-tune models, and run AI in production with evals, guardrails and observability.  
**Time:** about 90–120 hours · **Certification:** AI-500 Multi-Agent AI Solutions Expert (needs AI-103; hub ready); AB-620 (optional, hub ready); Optional: AWS AIP-C01 Generative AI Developer – Professional, Databricks Generative AI Engineer Associate · **Hub:** `hubs/ai-engineering-l3-specialist-hub.html`

### L3-01 Deep learning and NLP
- [ ] Neural networks
- [ ] backprop
- [ ] RNN/LSTM
- [ ] attention and transformers

### L3-02 Fine-tuning
- [ ] When to fine-tune vs RAG vs prompt
- [ ] LoRA/QLoRA
- [ ] preference tuning awareness
- [ ] dataset preparation

### L3-03 Multi-agent orchestration
- [ ] Supervisor, sequential, group-chat, handoff patterns
- [ ] A2A
- [ ] human-in-the-loop

### L3-04 Evals at scale
- [ ] Offline and online evals
- [ ] regression suites
- [ ] red teaming

### L3-05 Guardrails and safety
- [ ] Prompt injection
- [ ] content filtering
- [ ] PII
- [ ] tool-permission design

### L3-06 LLMOps and MLOps
- [ ] Experiment tracking (MLflow)
- [ ] prompt/version management
- [ ] CI for AI
- [ ] tracing (OpenTelemetry for GenAI)

### L3-07 Cost and latency
- [ ] Caching
- [ ] batching
- [ ] model routing
- [ ] small vs large models

### L3-08 Time series and anomaly detection
- [ ] Your anomaly-detection project as the capstone domain

**Capstone.** **Multi-agent trip planner:** supervisor + specialist agents (route, budget, weather) with HITL approval, eval suite, guardrails, tracing and a cost report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Architect AI platforms and lead AI governance, strategy and teams.  
**Time:** about 60–90 hours · **Certification:** No single expert certification; evidence = blueprint, talks, delivered systems · **Hub:** `hubs/ai-engineering-l4-expert-hub.html`

### L4-01 Model serving and inference
- [ ] vLLM/TGI awareness
- [ ] quantisation
- [ ] GPU vs API economics
- [ ] latency SLOs

### L4-02 AI platform architecture
- [ ] Gateways
- [ ] model routing
- [ ] shared retrieval
- [ ] agent platforms (links system-design L4-06)

### L4-03 Governance and risk
- [ ] EU AI Act and risk tiers
- [ ] model cards
- [ ] audits
- [ ] AI incident response

### L4-04 AI product strategy
- [ ] Use-case selection
- [ ] ROI
- [ ] build vs buy
- [ ] change management

### L4-05 Leading AI teams
- [ ] Standards
- [ ] eval culture
- [ ] mentoring (links softskills/leadership)

**Capstone.** **AI platform blueprint:** reference architecture + governance pack (policies, eval gates, model registry, cost dashboard) for a company adopting agents.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
