---
title: "AB-620 cheat sheet"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, cheat-sheet]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AB-620 cheat sheet

## Orchestration & UI names
- Generative = routes by **descriptions**; classic = trigger phrases
- Needs generative: MCP, computer use, Fabric data agents, event triggers
- Harnesses: **GitHub Copilot** (skills, memory, files) · **Standard** (topics) · **Copilot Chat** (extend M365 Copilot Chat, internal)
- New names: Workflows = agent flows · Preview = test pane · Evaluate · Monitor · Safety & access

## Identity
- Agent sign-in: None · **Authenticate with Microsoft** (no token) · **Authenticate manually** (Entra ID V2 / Generic OAuth 2; `System.User.AccessToken`)
- Tool credentials: **End user** (default) · **Maker-provided**
- Auth changes → **publish**
- Event triggers run as the **maker**
- Teams SSO: token exchange URL + manifest

## Governance
- DLP groups: Business · Non-business · Blocked (no mixing)
- Copilot Studio features as DLP connectors: channels, public website knowledge, HTTP, App Insights, unauthenticated chat
- Endpoint filtering for HTTP
- Managed Environments: sharing limits, solution checker
- Purview audit; sensitivity labels

## Tool ladder
- Prebuilt connector → **custom connector** (reuse) → **REST API tool** (agent only; OpenAPI v2, v3 converted) → **HTTP node** (one-off, 30 s default) → **agent flow** (multi-step, approvals) → **MCP** (shared server) → **computer use** (no API)
- Up to **128** tools; best **25–30**
- Inputs: AI fill · Customize · **Custom value**
- Ask the end user before running (default No)
- Completion: Don't respond (default) · generative · specific · adaptive card

## Agent flows
- Trigger **When an agent calls the flow**; action **Respond to the agent**
- Published · async **off** · respond within **~100 s**
- Billed in Copilot Credits; solution-aware; connection references
- Topic YAML: `InvokeFlowAction` with input/output bindings
- Approvals: Start and wait (Everyone / First to respond / Custom) → Switch on Outcome
- Request for information = typed values via Outlook actionable message
- Run after: succeeded / failed / skipped / timed out · Scope try/catch/finally · Terminate · retry policy · runs ≤ 30 days

## Topics & variables
- Scopes: Topic · Global (external sources) · System (read-only) · **Env** (read-only)
- Type fixed at first assignment
- Parse value: JSON text → record/table
- Redirect (returns) · End current · **End all topics** (clears plan) · Transfer
- Quick replies = suggestions; Question options = enforced

## Adaptive cards
- Ask with adaptive card: input **id → Topic.id**
- Validate blanks with a Condition
- **Formula card** (Power Fx) for variables
- Teams / Omnichannel = **1.5**; web 1.6; test pane 1.6
- Use **Action.Submit** (web doesn't support Action.Execute)
- Input.Date `YYYY-MM-DD`; Input.Time `HH:MM`

## Advanced responses
- Generative answers: node sources **beat** agent knowledge
- Custom data: **Content**, ContentLocation, Title — **first 3** only
- Custom instructions per node; moderation per node
- Prompt tool: inputs, text/**JSON**, model choice, **Foundry** models
- HTTP: Raise an error (default) vs **Continue on error**; secrets in secret env vars

## Knowledge
- **Copilot connectors**: admin, M365 admin center, indexed in Graph, citations; manual auth needs `ExternalItem.Read.All`
- **Real-time connectors**: live, no data movement, user identity, DLP, no inherent citations
- **Azure AI Search**: create new connection, Entra ID integrated, integrated vectorization, semantic ranker, URL field for citations
- Dataverse knowledge: synonyms + glossary

## MCP & computer use
- MCP: **Streamable HTTP**; tools + resources (no prompts); descriptions read-only; **Allow all** includes future tools; no topic calls
- MCP auth: None · API key · OAuth 2.0 (dynamic discovery / dynamic / manual)
- Connector marker `x-ms-agentic-protocol: mcp-streamable-1.0`
- Computer use: instructions + inputs + stored credentials (Key Vault) + allowed sites + supervision
- Runtimes: hosted browser (preview, prototype) · Cloud PC pool (preview) · own machine (GA, PAD)
- Logs in Dataverse (7-day default) + replay + Purview

## Multi-agent
- Child: inside parent, shared context, same solution, no own publish
- Connected: separate publish/owner; *let other agents connect*; local description copy; pass history (default on)
- Foundry: project endpoint + agent ID; **Activity** endpoint; new portal only (classic → 404)
- Fabric: **F2+/P1+**, published, same tenant, user/author auth, not in M365 Copilot
- A2A: endpoint (not card); card `/.well-known/agent.json`; None/API key/OAuth 2.0; **full history sent**

## Azure & monitoring
- Azure OpenAI on your data: generative answers > **Classic data** (service retires 14 Oct 2026)
- Foundry IQ: GitHub Copilot harness tool; **one** connection per agent
- App Insights: Settings > **Advanced** > connection string
- Options: logging · conversation details · sensitive properties · node execution events
- `customEvents`; filter `designMode == "False"`; channelId `msteams`
- DLP connector *Application Insights in Copilot Studio*

## Evaluation
- Sets: quick (10) · full · test chat · CSV/TXT (Question, Expected response; 5 MB) · manual · themes
- ≤ **100** cases; ≤ 1,000 chars/question; results **89 days**
- Methods: General quality · Content safety · Compare meaning · Tool use · Keyword · Text similarity · Exact · Custom
- Multi-turn: General quality, Content safety, Keyword, Custom
- No expected answer → **Invalid** for match methods
- Set the **user profile**

## ALM & pipelines
- Publisher prefix; **preferred solution**; Add existing > Agent; **Add required objects**
- Env vars read-only; **republish** after change (secrets at runtime, Key Vault)
- Not in solutions: channels, sharing, manual auth, web security, App Insights
- Pipelines: targets **Managed Environments** + Dataverse; ordered stages; personal = dev + 2 targets
- Gates: Pre-export (first stage) · Delegated deployment · Pre-deployment; status **20** complete / **30** reject
- Triggers: OnDeploymentRequested (all) · OnApproval… · OnPreDeployment… · OnDeploymentStarted/Completed
