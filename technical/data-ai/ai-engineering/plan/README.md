---
title: "AI Engineering: L1–L4 learning plan"
track: technical
domain: data-ai
subject: ai-engineering
tags: [ai-engineering, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# AI Engineering: L1–L4 learning plan

> Build, evaluate and run AI-powered applications: from ML basics and LLM APIs to RAG, agents, fine-tuning and AI platforms.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Explain how ML and LLMs work and build a simple, responsible LLM-powered app that calls a model API. | 40–55 | AI-901 Azure AI Fundamentals: passed 7 Oct 2026 (883); Optional: AWS Certified AI Practitioner | Fruit-shop FAQ bot | `hubs/ai-engineering-l1-foundation-hub.html` (#6) |
| **L2 Proficient** | Build and evaluate classic ML models, RAG systems and tool-using agents. | 80–100 | AI-103 Azure AI Apps and Agents Developer (hub ready); Optional: AWS MLA-C02 (GA 14 Jan 2027) | Docs assistant with evals | `hubs/ai-engineering-l2-proficient-hub.html` (#18) |
| **L3 Specialist** | Design multi-agent systems, fine-tune models, and run AI in production with evals, guardrails and observability. | 90–120 | AI-500 Multi-Agent AI Solutions Expert (needs AI-103; hub ready); AB-620 (optional, hub ready); Optional: AWS AIP-C01 Generative AI Developer – Professional, Databricks Generative AI Engineer Associate | Multi-agent trip planner | `hubs/ai-engineering-l3-specialist-hub.html` (#31) |
| **L4 Expert** | Architect AI platforms and lead AI governance, strategy and teams. | 60–90 | No single expert certification; evidence = blueprint, talks, delivered systems | AI platform blueprint | `hubs/ai-engineering-l4-expert-hub.html` (#44) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: Robo, the new classmate

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Robo the robot classmate, a stack of flashcards (training data), Lego word pieces (tokens), a big map where similar words live close together (embeddings), an open-book exam (RAG), Robo's toolbox (tools/agents), the report card (evals).

- **Training** is Robo studying thousands of flashcards until it can guess the answer side.
- **Tokens** are the Lego pieces Robo breaks words into: 'oranges' might be 'or' + 'anges'.
- **Embeddings** are a big map: 'apple' lives next to 'orange', and 'car' lives far away near 'road trip'.
- **RAG** is an open-book exam: Robo looks up the right page before answering, instead of guessing from memory.
- An **agent** is Robo with a toolbox: a calculator, a phone and a map, deciding which to use, step by step, to plan the car trip.

## Folded into this plan

- `data-ai/machine-learning`
- `data-ai/data-science`
- `data-ai/genai`
- `data-ai/rag`
- `data-ai/agentic-ai`
- `data-ai/claude-code`
- `data-ai/anomaly-detection (as an L3 project)`

Their course files stay where they are; this plan points at them, so nothing is studied twice.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `../data-science/courses/udemy-intro-data-science-python` | orientation | L1 |
| `../machine-learning/courses/udemy-ds-ml-dl-nlp-bootcamp §20–45` | statistics, probability, classic ML | L2 |
| `../machine-learning/courses/udemy-ds-ml-dl-nlp-bootcamp §46–50, §51–62` | MLOps; NLP, DL, transformers | L3 |
| `../genai/courses/udemy-genai-langchain-huggingface §21–55, ../genai/courses/genai-python` | LangChain, Hugging Face, Streamlit apps | L2 |
| `../rag/examples/ollama-local-rag` | local RAG with Ollama | L2 |
| `../agentic-ai/courses/ai-engineer-agentic-track, langchain-langgraph-agents, ibm-building-ai-agents` | agents: OpenAI Agents SDK, CrewAI, LangGraph, AutoGen, MCP | L2–L3 |
| `../agentic-ai/projects/agentic-track-my-labs, docs-ai-agent` | your agent labs | L2–L3 |
| `../claude-code/courses/claude-code-in-action` | agentic coding | L2 |
| `../anomaly-detection/projects/*` | your anomaly-detection app | L3 |
| `../../certifications/ai-901, ai-103, ab-620, ai-500` | Azure exam hubs: link, don't re-teach | L1–L3 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- ML fundamentals and evaluation
- LLM fundamentals, prompting and structured output
- Embeddings, vector search and RAG design
- Agents, tool use and MCP (vendor-neutral)
- LLM evals, guardrails and observability
- Fine-tuning and model serving

**This subject links to, but does not re-teach:**
- Azure-specific services → `certifications ai-901/ai-103/ab-620/ai-500`
- pandas and NumPy → `python`
- Vector search in SQL → `sql`
- Serving and scaling → `system-design`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| AI-901 Azure AI Fundamentals | L1 | passed | Passed 7 Oct 2026 with 883 (pass 700). | `technical/certifications/ai-901` |
| AI-103 Azure AI Apps and Agents Developer Associate | L2 | active | Hub built 2026-10-04 (technical/certifications/ai-103). | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-103) |
| AI-500 Multi-Agent AI Solutions Expert | L3 | active | Needs AI-103. Hub built 2026-10-04. | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-500) |
| AB-620 AI Agent Builder Associate (Copilot Studio) | L3 | active | Optional low-code track. Hub built 2026-10-04. | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ab-620) |
| AWS Certified Machine Learning Engineer – Associate (MLA-C02) | L2–L3 | changing | Beta from 29 Sep 2026, GA 14 Jan 2027 (adds GenAI/agentic). MLA-C01 English ended 28 Sep 2026. | [link](https://aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/) |
| AWS Certified Generative AI Developer – Professional (AIP-C01) | L3 | verify | Optional AWS track. | [link](https://aws.amazon.com/certification/) |
| Databricks Certified Generative AI Engineer Associate | L3 | verify | Optional Databricks track. | [link](https://www.databricks.com/learn/certification) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#6 AI Engineering L1 Foundation hub** → `hubs/ai-engineering-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `ai-engineering-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#18 AI Engineering L2 Proficient hub** → `hubs/ai-engineering-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `ai-engineering-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#31 AI Engineering L3 Specialist hub** → `hubs/ai-engineering-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `ai-engineering-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#44 AI Engineering L4 Expert hub** → `hubs/ai-engineering-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `ai-engineering-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #6 (AI Engineering L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
