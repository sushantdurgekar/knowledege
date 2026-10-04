---
title: "AB-620 interview Q&A"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, interview]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AB-620 interview Q&A

Copilot Studio roles (maker, solution architect, Power Platform developer) are interviewed on design choices: when to use topics vs generative orchestration, connectors vs MCP, child vs connected agents, and how to ship safely with ALM.

Target roles: Copilot Studio developer, Power Platform solution architect, AI agent builder.

## Architecture and design
### Walk me through how you'd design a Copilot Studio agent that answers HR questions and files leave requests.
I start from requirements: audience (employees in Teams), data (HR policies in SharePoint, leave balances in the HR system), actions (submit leave), and risks (personal data, approvals).

Design: Microsoft sign-in; SharePoint knowledge (users' own permissions); a custom connector or agent flow for leave requests with an approval for long leave; instructions with scope and escalation; a topic only where wording is mandated. Then evaluation sets, Application Insights, a solution with environment variables, and a pipeline to production.

**Likely follow-ups:** How would you handle a question the agent can't answer? · Where would you need a human?

### How do you choose between a connector, custom connector, REST API tool, HTTP node, agent flow, MCP and computer use?
I climb a ladder: prebuilt connector first; custom connector if the API must be reused across apps and flows; REST API tool if only this agent needs it; HTTP node for a one-off call in a topic; agent flow for multi-step logic, approvals or parallel work; MCP when many agents and clients share a tool server (needs generative orchestration); computer use only when there's no API. Identity, DLP and licensing can move the choice.

**Likely follow-ups:** What's the downside of MCP for deterministic steps?

### When do you use topics if generative orchestration can figure things out?
When the conversation must be predictable: mandated wording (legal disclaimers), a fixed sequence (confirm, then act), structured input with adaptive cards, or specific error handling. Generative orchestration chooses *when* to run the topic; the topic decides *exactly what happens*.

**Likely follow-ups:** How do you stop a topic and the knowledge base competing?

## Integration
### Copilot connectors vs real-time Power Platform connectors as knowledge: how do you choose?
Copilot connectors index external content into Microsoft Graph (admin-configured, ACLs, citations, reused by Microsoft 365 Copilot) — great for large article bases. Real-time connectors query live systems under the user's identity with no data movement — right when data can't be copied or must be current. Many solutions use both.

**Likely follow-ups:** What breaks if you use manual authentication with Copilot connectors?

### Explain agent flows and their limits.
An agent flow starts with *When an agent calls the flow*, runs Power Automate actions and returns outputs with *Respond to the agent*. As a tool it must be published, synchronous and respond within about 100 seconds, so slow work goes after the response. They're billed in Copilot Credits, live in the solution and use connection references for ALM.

**Likely follow-ups:** How would you handle an approval that takes days?

## Multi-agent
### Child agent or connected agent?
Child agents live inside the parent: own instructions and tools, shared context, same solution and release. Connected agents are separately published and owned, reusable by other agents, with their own lifecycle; you enable *let other agents connect*, share them, and decide whether to pass conversation history. I start with one agent and split only on real seams.

**Likely follow-ups:** What are the hidden costs of multi-agent designs?

### How would you bring a Foundry agent, a Fabric data agent and a partner's agent into one Copilot Studio solution?
Foundry: connect with the project endpoint and agent ID; the agent needs the Activity endpoint and must be from the new portal. Fabric: a published data agent on F2+/P1+ in the same tenant, user authentication for row-level access, generative orchestration, Teams rather than Microsoft 365 Copilot. Partner: A2A with the endpoint URL and OAuth; review that the full chat history is sent.

**Likely follow-ups:** How do you correlate transcripts across these agents?

## Governance and safety
### How do you decide whose credentials a tool uses?
If users should only see their own data or act as themselves, end-user credentials (default) with signed-in users. If users have no account in the target system or the data is the same for everyone, maker-provided credentials with a dedicated least-privilege account, confirmation for side-effects and auditing. Anonymous users can't use end-user credentials.

**Likely follow-ups:** Why might an admin block maker-provided credentials?

### What's your responsible-AI checklist before launching an external agent?
Curated knowledge with citations; general knowledge decision; strict content moderation and a friendly On Error path; AI disclosure; scope and refusals in instructions, tested with a Custom grader; human escalation; approvals for high-impact actions; privacy (minimal data, retention, DLP); evaluation with content safety; monitoring and a feedback loop.

**Likely follow-ups:** How do you test for fairness?

### How would you lock down a production environment for agents?
DLP that allows only needed connectors (Business group), blocks unneeded channels and knowledge sources, restricts HTTP with endpoint filtering, keeps App Insights allowed; Managed Environments for sharing limits; separate dev/test/prod; delegated pipeline deployments so makers have no prod rights; Purview audit.

**Likely follow-ups:** What happens if a maker mixes Business and Non-business connectors?

## Testing and ALM
### How do you evaluate an agent before release?
Test sets from real questions, generated sets and a CSV with expected answers (up to 100 per set). Methods per goal: General quality, Compare meaning, Tool use, Keyword match, Content safety, Custom for refusals. Run as a realistic test user, review failures, fix, re-run the same set, export results (kept 89 days), and gate releases on agreed thresholds.

**Likely follow-ups:** Which methods work for multi-turn sets?

### Walk me through promoting an agent from dev to prod.
Everything is in a solution with our publisher; Add required objects pulls in flows, connection references and environment variables (secrets in Key Vault). A pipeline deploys a managed artifact through test to production (Managed Environments), mapping variable values and connection references. Production uses delegated deployment and a pre-deployment gate. Afterwards I redo channels, sharing, manual auth, web security and App Insights, then smoke-test.

**Likely follow-ups:** How would you roll back?

## Operations
### Users say the agent got worse last week. How do you investigate?
Check what changed (model, instructions, knowledge, tools, connector versions). Look at analytics/Monitor for resolution and escalation trends, transcripts for failing conversations, Application Insights for errors and tool failures (excluding designMode traffic), and flow Activity for failed runs. Re-run the evaluation set to quantify the regression, fix, and add the failing cases to the set.

**Likely follow-ups:** What alert would have caught it earlier?

## Behavioural (STAR)
### Tell me about a time an automation or agent you built failed in production.
Use STAR. *Situation*: e.g., a returns agent created duplicate records. *Task*: stop the impact and fix the cause. *Action*: disabled the tool, traced the runs in flow Activity (a retry on a non-idempotent write), added an idempotency check and confirmation before running, added the case to the evaluation set. *Result*: no duplicates since; a regression test guards it.

**Likely follow-ups:** What would you do differently from the start?

