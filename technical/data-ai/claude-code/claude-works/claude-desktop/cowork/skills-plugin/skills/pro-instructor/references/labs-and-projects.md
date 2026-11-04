# Labs & Projects

Knowing ≠ doing. Labs convert concepts into skill, and projects convert skill into proof.

## Lab design template (save to `technical/<domain>/<subject>/labs/<slug>.md`)
1. **Objective**: one measurable outcome ("Deploy a private S3 bucket reachable only via a VPC endpoint").
2. **Maps to**: concept notes + blueprint task statements.
3. **Environment and cost**: free tier, vendor sandbox, local emulator, or Docker. State the expected cost (aim for $0) and set a budget alert first for cloud labs.
4. **Prerequisites**: tools and versions, plus accounts. Never ask for or handle the learner's credentials; they log in themselves.
5. **Steps**: numbered, each with a *predict-then-verify* prompt ("Before running this, what do you expect the response code to be?").
6. **Checkpoints**: commands or observations proving each stage works.
7. **Break-it challenge**: deliberately introduce a fault and have the learner diagnose it (below).
8. **Teardown**: exact cleanup steps plus a verification that nothing billable remains.
9. **Reflection**: 3 questions, plus cards created from the lab.

## Environment options by domain
- **Cloud:** vendor free tiers. Microsoft Learn sandboxes for many Azure modules. Google Cloud Skills Boost labs. LocalStack for offline AWS-API practice. Terraform or OpenTofu for IaC repetition.
- **Kubernetes/DevOps:** kind, minikube, or k3d locally; killercoda-style browser scenarios; the exam simulator bundled with CNCF exam purchases (verify current offering).
- **Security:** intentionally vulnerable apps only in local or isolated labs (OWASP Juice Shop, DVWA), TryHackMe/Hack The Box style platforms, and Wireshark captures. Only test systems the learner owns or is authorized to test. State this every time.
- **Data/AI:** local Python + notebooks, DuckDB, Postgres in Docker, Hugging Face models, free-tier vector DBs, vendor community editions (Databricks Free Edition, Snowflake trial, Qlik Cloud trial). Verify the current availability of each.

## Break-it challenges (troubleshooting labs)
Give a working setup plus a symptom ("the app can't reach the database"), and the learner diagnoses it. Seed faults that match common exam and real-world traps: a security group vs NACL return-path issue, missing IAM permission vs resource policy deny, a wrong route table, DNS resolution, an expired certificate, a misconfigured probe, a data type mismatch in a join, data leakage in an ML split. Have them use a hypothesis → test → evidence loop out loud. Debrief with a "symptom → cause" card.

## Capstone projects
At the end of a track, design a portfolio project that:
- Integrates 3+ domains of the blueprint
- Has a README with an architecture diagram, decisions and trade-offs (ADR-style), cost estimate, security considerations, and what they'd do at 10× scale
- Lives in a public or private git repo (separate from the Knowledge vault). Link it from `softskills/interviewing/portfolio.md` and from the subject notes
- Becomes 2–3 interview stories (see `interview-bridge.md`)

Offer 3 project options of increasing ambition and let the learner choose.
