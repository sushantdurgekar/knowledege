---
title: "Concept ownership: the no-repeat rules"
track: technical
tags: [plan, hubs, dedupe]
created: 2026-10-08
updated: 2026-10-08
---
# Concept ownership: the no-repeat rules

Many concepts show up in several subjects (SQL in Power BI and Qlik, async in JavaScript and Node, caching in Node and system design). Each concept has **one home**: the owning subject teaches it fully, with a story, diagram, practice and cards. Every other hub shows a 3-line recap plus a link to the owner's concept note, and adds only what's specific to it (e.g. Qlik section access vs generic row-level security).

## Cross-cutting decisions

| Concept | Owner (level) | Linked from | What the linker adds |
|---|---|---|---|
| Git and the command line | python (L1) | all | — |
| HTTP, REST, status codes, JSON APIs | nodejs (L1) | javascript, system-design, python, nextjs | browser fetch side (javascript L2) |
| Event loop, promises, async/await | javascript (L2) | nodejs, react | libuv internals (nodejs L3) |
| TypeScript | javascript (L2–L3) | react, nextjs, nodejs | framework typing patterns |
| Auth (sessions, JWT, OAuth2/OIDC) | nodejs (L2) | nextjs, system-design, ai-engineering | Next.js auth libraries; auth at scale |
| Web security: XSS, CSP, CORS, cookies | javascript (L3) | nodejs, react, nextjs | server-side OWASP API Top 10 (nodejs L2) |
| Testing concepts (unit/integration/E2E) | python (L2: pytest) | all | each tool's syntax (Vitest, RTL, Playwright) |
| SQL querying | sql (L1–L2) | power-bi, qlik-sense, python, nodejs | tool-specific loading |
| Star schema / dimensional modelling | sql (L2) | power-bi, qlik-sense | Power BI relationships; Qlik associative model and link tables |
| Row-level security (concept) | sql (L3) | power-bi (RLS), qlik-sense (section access) | tool implementation |
| Indexes, transactions, isolation | sql (L2–L3) | system-design, nodejs | — |
| Storage internals (B-tree, LSM, WAL) | sql (L4) | system-design (L3) | design trade-offs |
| Replication, sharding, CAP | system-design (L2) | sql (L3–L4) | DB-specific features |
| Caching strategies | system-design (L1–L2) | nodejs (L3), nextjs (L2) | Redis code; Next.js cache APIs |
| Queues, pub/sub, Kafka | system-design (L2–L3) | nodejs (L3) | BullMQ implementation |
| Observability, SLOs | system-design (L2) | nodejs, docker, ai-engineering | OpenTelemetry code; AI tracing |
| Containers, Compose, Kubernetes | docker | python, nodejs, nextjs, system-design | "containerise this app" lab only |
| CI/CD basics (GitHub Actions) | docker (L2) | python, power-bi, nodejs | Power BI deployment pipelines (power-bi L3) |
| Big-O and algorithm patterns | dsa (L1) | python, system-design | — |
| pandas / NumPy | python (L2) | ai-engineering, power-bi (semantic link) | — |
| Statistics for ML | ai-engineering (L1–L2) | power-bi, qlik-sense | — |
| Embeddings and vector search | ai-engineering (L2) | sql (pgvector, DP-800), system-design | SQL syntax |
| RAG, agents, MCP (vendor-neutral) | ai-engineering (L2–L3) | AI-103/AI-500/AB-620 hubs | Azure-specific services stay in the exam hubs |
| Responsible AI principles | AI-901 hub (01) | ai-engineering, AI-103 | — |
| Data-visualisation principles | power-bi (L2) | qlik-sense | Qlik objects |
| Accessibility (WCAG) | javascript (L3) | react, nextjs, power-bi | component/report specifics |
| SEO | javascript (L3) | nextjs (L2 metadata) | — |
| Web performance (Core Web Vitals) | javascript (L3) | react, nextjs | framework-specific fixes |
| Estimation, mentoring, code review, stakeholders (L3/L4) | `softskills/` (leadership, communication) | all L3/L4 hubs | subject-specific checklists |

## Everything each subject owns

| Concept | Owner |
|---|---|
| Python language and standard library | `python` |
| Git and command-line basics (first subject in your path) | `python` |
| pytest and unit-testing basics | `python` |
| pandas/NumPy basics | `python` |
| packaging and virtual environments | `python` |
| SQL querying (all dialects; PostgreSQL first, T-SQL notes) | `sql` |
| Relational and dimensional modelling (star schema, facts, dimensions, SCDs) | `sql` |
| Indexes, transactions and isolation | `sql` |
| Database internals (B-tree, LSM, WAL, MVCC) | `sql` |
| Generic row-level security | `sql` |
| HTML/CSS | `javascript` |
| JavaScript language (closures, this, prototypes, modules) | `javascript` |
| Event loop, promises, async/await | `javascript` |
| TypeScript | `javascript` |
| Browser security (XSS, CSP, CORS, cookies) | `javascript` |
| Web performance and Core Web Vitals | `javascript` |
| Accessibility (WCAG) | `javascript` |
| Technical SEO | `javascript` |
| Front-end testing basics (Vitest, Playwright) | `javascript` |
| HTTP, REST, status codes and JSON APIs | `nodejs` |
| Server-side auth (sessions, JWT, OAuth2/OIDC) | `nodejs` |
| Server-side security (OWASP API Top 10) | `nodejs` |
| libuv, streams and worker threads | `nodejs` |
| Node implementation of caching, queues and WebSockets | `nodejs` |
| Component model, JSX, props and state | `react` |
| Hooks and custom hooks | `react` |
| Client-side state management | `react` |
| React performance and the React Compiler | `react` |
| Component testing (React Testing Library) | `react` |
| App Router, layouts and file conventions | `nextjs` |
| Rendering strategies (static, dynamic, streaming) and Next.js caching | `nextjs` |
| Server Actions and route handlers | `nextjs` |
| Deploying Next.js (Vercel, self-host, Docker) | `nextjs` |
| Power Query (M) | `power-bi` |
| Power BI semantic models and DAX | `power-bi` |
| Report design and data-visualisation principles | `power-bi` |
| Power BI service, workspaces, RLS and deployment pipelines | `power-bi` |
| Microsoft Fabric for analytics | `power-bi` |
| Qlik associative model and selection states | `qlik-sense` |
| Qlik load script and QVD layering | `qlik-sense` |
| Set analysis and Qlik expressions | `qlik-sense` |
| Qlik Cloud administration and automation | `qlik-sense` |
| Qlik extensions, mashups and APIs | `qlik-sense` |
| Scalability, availability, latency budgets | `system-design` |
| Load balancing, CDNs, caching strategies | `system-design` |
| Replication, partitioning/sharding, consistent hashing, CAP/PACELC | `system-design` |
| Messaging, streams, event-driven patterns | `system-design` |
| Consensus and distributed coordination | `system-design` |
| Observability concepts, SLOs | `system-design` |
| Design-interview framework | `system-design` |
| Complexity analysis (Big-O) | `dsa` |
| Core data structures and algorithm patterns | `dsa` |
| Competitive-programming maths and game theory | `dsa` |
| Coding-interview technique | `dsa` |
| Containers, images, Dockerfiles and Compose | `docker` |
| Container security and supply chain | `docker` |
| CI/CD basics (GitHub Actions) | `docker` |
| Kubernetes fundamentals | `docker` |
| ML fundamentals and evaluation | `ai-engineering` |
| LLM fundamentals, prompting and structured output | `ai-engineering` |
| Embeddings, vector search and RAG design | `ai-engineering` |
| Agents, tool use and MCP (vendor-neutral) | `ai-engineering` |
| LLM evals, guardrails and observability | `ai-engineering` |
| Fine-tuning and model serving | `ai-engineering` |
