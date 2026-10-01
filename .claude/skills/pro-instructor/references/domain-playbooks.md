# Domain Playbooks

Starting points for research. **Always verify currency with web search.** Exams, product names, and free offerings change often. Rank sources: official docs/exam guides > vendor training > well-known practitioners/books > community (Reddit, blogs) for anecdotes only.

## Resource rating (record in `resources.md`)
| Resource | Type | Authority (1-5) | Recency | Depth | Cost | Use for |
Flag anything older than about 18 months for fast-moving cloud/AI topics.

## Cloud
- **AWS:** aws.amazon.com/certification (exam guides), AWS Skill Builder, docs.aws.amazon.com, Well-Architected Framework + whitepapers, re:Invent talks for deep dives.
  Common traps: SG vs NACL, IAM policy evaluation logic, S3 storage classes and consistency, RDS Multi-AZ vs read replicas, the cost-optimization qualifier.
- **Azure:** learn.microsoft.com (credentials pages with study guides and skills-measured lists, free sandboxed modules, practice assessments), the Azure Architecture Center, the Cloud Adoption Framework.
  Common traps: RBAC scope inheritance, Entra ID vs Azure RBAC roles, VNet peering transitivity, storage redundancy tiers.
- **Google Cloud:** cloud.google.com/learn/certification (exam guides), Google Cloud Skills Boost, the Architecture Center.
  Common traps: resource hierarchy/IAM inheritance, VPC as a global resource, choosing among BigQuery/Bigtable/Spanner/Cloud SQL.
- **Multi-cloud lens:** build comparison tables (AWS ↔ Azure ↔ GCP service equivalents). This doubles retention when the learner knows one cloud.

## Security
- **CompTIA** (A+, Network+, Security+, CySA+, PenTest+, CASP+/SecurityX; verify current names): download the official exam objectives PDF and use it as the checklist.
- **ISC2** (CISSP, CCSP, SSCP, CC): the official exam outline. CISSP thinks like a risk manager, not a technician, so "FIRST" and "BEST" answers favor policy, people, and safety.
- **Frameworks to anchor on:** NIST CSF and SP 800-series, OWASP Top 10/ASVS, MITRE ATT&CK, CIS Controls, ISO 27001.
- **Labs:** only on authorized, isolated environments.

## Data, AI & ML
- **Vendor certs:** Databricks (Academy), Snowflake (SnowPro), Google (Professional ML Engineer, Data Engineer), AWS (ML, data, AI practitioner tracks), Microsoft (AI-900, AI-102, DP-series), Qlik (Qlik Sense Data Architect / Business Analyst, Qlik Talend). Verify current exam names and versions.
- **Foundations:** statistics, SQL, data modeling (star schema, SCDs), pipelines (batch vs streaming), data quality and governance.
- **Modern AI:** transformers, embeddings, RAG, evaluation, prompt design, agents/tool use, MCP, fine-tuning vs retrieval, guardrails, and cost/latency trade-offs. Primary sources: model provider docs, Hugging Face course/docs, key papers (read the abstract + figures with the learner, then explain).
- **Traps:** data leakage, wrong evaluation metric for imbalanced data, train/test contamination, overfitting vs underfitting, confusing correlation with causation, RAG chunking/recall failures.
- **Personalization:** if the learner has BI/analytics experience (e.g. Qlik), bridge from it: associative model ↔ joins/semantics, QVD layering ↔ medallion architecture, set analysis ↔ filtered aggregates/window functions.

## DevOps / Platform
- CNCF/Linux Foundation (KCNA, CKAD, CKA, CKS): performance-based, so the terminal is the classroom. Practice imperative kubectl speed, the docs allowed during the exam, and context switching.
- HashiCorp (Terraform Associate), GitHub certifications, Docker. Practice IaC plan/apply/destroy loops.

## Networking
- Cisco (CCNA etc.), cloud networking specialties. Subnetting drills as spaced practice, packet walk-throughs ("trace this request hop by hop") with diagrams.

## Generalist: any other technology
1. Find the canonical source: official docs, spec/RFC, source repo README, the creator's talks.
2. Build a concept map: core abstractions → how they interact → the lifecycle of a request or data.
3. Find the "hello world" and the most common production failure modes.
4. Identify adjacent knowledge the learner already has and anchor to it.
5. Search for any certification or credential and offer it as an optional goal.

## Soft skills
Communication (structured explanations, writing design docs), stakeholder management, leadership and influence, negotiation, time management, learning how to learn. Sources: reputable books and courses, and the learner's own workplace scenarios (anonymized). Practice through role-play scenarios with feedback, then store under `softskills/`.
