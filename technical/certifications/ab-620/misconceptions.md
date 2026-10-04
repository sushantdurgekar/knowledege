---
title: "AB-620 misconceptions and traps"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, traps]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AB-620: traps and misconceptions

Each line: the tempting wrong idea → the correct one. Grouped by module.

## f01: Copilot Studio essentials (exam UI and new UI)
- ✗ Writing great trigger phrases and expecting them to drive routing under generative orchestration. → ✓ Descriptions drive routing under generative orchestration; trigger phrases matter under classic.
- ✗ Building in the default environment with no solution, then trying to move the agent later. → ✓ Create a solution and set it as preferred **before** building, so every component is packaged for ALM.
- ✗ Assuming an autonomous (event-triggered) agent runs as the end user. → ✓ Event triggers use the maker's connection. Limit what that connection can reach.
- ✗ Treating *Workflows* and *agent flows* as different features. → ✓ Same feature, new name in the left navigation. Same trigger and *Respond to the agent* action.
- ✗ Thinking the GitHub Copilot harness sends data to the GitHub Copilot service. → ✓ It's a Copilot Studio runtime that shares technology with GitHub Copilot; customer data isn't processed by the GitHub Copilot service.

## p01: Plan an agent solution: integration, reuse, audiences
- ✗ Choosing a REST API tool when the scenario says the API must also be used by Power Apps or Power Automate. → ✓ Reuse across Power Platform → **custom connector**.
- ✗ Using the Send HTTP request node for a call several agents need. → ✓ The node is per topic and not shareable. Use a connector or agent flow.
- ✗ Splitting into many agents from day one. → ✓ Start with one agent. Split for routing accuracy, ownership, security or reuse.
- ✗ Planning tools that act as the user on a public anonymous website. → ✓ No sign-in, no user identity. Use maker-provided credentials with least privilege, or require sign-in.
- ✗ Putting a business rule only in instructions ("always get approval"). → ✓ Instructions guide; flows and approvals enforce. High-impact rules must be enforced in the flow.

## p02: Identity, security and governance
- ✗ Expecting `System.User.AccessToken` with *Authenticate with Microsoft*. → ✓ It's only available with **manual** authentication.
- ✗ Using maker-provided credentials for personal data ("so users don't have to sign in"). → ✓ Everyone would see what the maker can see. Use end-user credentials for per-user data.
- ✗ Changing authentication and testing in Teams immediately. → ✓ Auth changes need a **publish**, and users may need a new conversation.
- ✗ Mixing a Business connector and a Non-business connector in one agent. → ✓ DLP forbids it; the agent is blocked.
- ✗ Forgetting autonomous triggers run as the maker. → ✓ Scope the maker's connections, or use a dedicated service account.

## p03: Responsible AI strategy for agents
- ✗ Relying on instructions alone for high-impact actions. → ✓ Instructions are advisory. Enforce with approvals in agent flows.
- ✗ Lowering moderation to fix "too many blocked answers" without testing. → ✓ Find the cause first (sources, wording); if you loosen moderation, evaluate content safety again.
- ✗ Thinking citations are an accessibility feature. → ✓ Citations serve **transparency**; accessibility is inclusiveness (alt text, readable cards).
- ✗ Forgetting the On Error topic. → ✓ Blocked content and failures land there; a raw error message is a poor and opaque experience.

## p04: Channels and deployment
- ✗ Judging card rendering from the test pane. → ✓ The test pane renders schema 1.6; Teams uses 1.5. Test in Teams.
- ✗ Using the demo website for customers. → ✓ It's for testing. Use the custom website channel.
- ✗ Putting the Direct Line secret in JavaScript on the page. → ✓ Exchange it for a token on your server.
- ✗ Expecting channel settings to travel in the solution. → ✓ Channels, sharing and web security must be configured in each environment after import.
- ✗ Thinking each channel needs a separate publish. → ✓ One publish updates all channels.

## w01: Agent flows: build, parameters, connectors, topics
- ✗ Turning on *Asynchronous response* for a flow you want as an agent tool. → ✓ Tools need a real-time (synchronous) response: async off, respond within ~100 s.
- ✗ Forgetting to **publish** the flow. → ✓ Only published flows show up and run as tools.
- ✗ Putting Respond to the agent at the very end of a slow flow. → ✓ Respond as soon as you have what the user needs; continue afterwards.
- ✗ Using an agent flow for a single connector action. → ✓ A connector tool is simpler and cheaper; flows are for multi-step logic.
- ✗ Building the flow outside the agent's solution. → ✓ Keep flows, connection references and the agent in the same solution for ALM.

## w02: Human-in-the-loop flows, error handling, monitoring
- ✗ Using Request for information when the requirement is approve/reject by several people. → ✓ Use Approvals (Everyone must approve) or multistage approvals.
- ✗ Leaving approvals without a timeout. → ✓ Runs can sit for up to 30 days; add a timeout and a timed-out path.
- ✗ Letting the agent wait for the human decision. → ✓ Respond to the agent first, then notify the user of the outcome.
- ✗ Catching errors but ending the run as Succeeded. → ✓ Use Terminate (Failed) so analytics show real failure rates.
- ✗ Looking for flow run details in the agent's transcript only. → ✓ Use the flow's **Activity** page for step-level inputs, outputs and errors.

## c01: Topics, variables and response formatting
- ✗ Assigning a number to a variable first created as text. → ✓ Type is fixed at first assignment; create a new variable or convert with `Value()`/`Text()`.
- ✗ Using a topic variable in another topic. → ✓ Topic variables die with the topic; use outputs or a global variable.
- ✗ Trying to change an environment or system variable in a topic. → ✓ Both are read-only; copy into a topic/global variable if you need to modify it.
- ✗ Expecting quick replies to force a choice. → ✓ They're suggestions. Use a multiple-choice Question for enforced options.
- ✗ Using End all topics when you only meant to finish this topic. → ✓ End all topics also cancels the orchestrator's current plan.

## c02: Adaptive cards
- ✗ Relying on `isRequired` alone. → ✓ Some channels still send blanks: add a Condition after the card.
- ✗ Using variables inside a JSON card. → ✓ JSON cards are static; use a Formula card for dynamic values.
- ✗ Trusting the test pane for Teams rendering. → ✓ Test pane = 1.6; Teams = 1.5.
- ✗ Using Action.Execute on the web channel. → ✓ Not supported there; use Action.Submit.
- ✗ Generic input IDs like `input1`. → ✓ IDs become variable names; use descriptive camelCase.

## c03: Advanced responses: generative answers, prompts, HTTP, tools in topics
- ✗ Putting 10 records in custom data and expecting all to be used. → ✓ Only the first **3** are used.
- ✗ Using generative answers to classify or extract. → ✓ Use a **prompt** for transformations; generative answers retrieves and answers.
- ✗ Hard-coding an API key in the HTTP node header. → ✓ Use a secret environment variable (Key Vault) or a connector with proper auth.
- ✗ Expecting HTTP failures to be handled inside the topic by default. → ✓ Default is **Raise an error** → On Error. Choose Continue on error to branch.
- ✗ Assuming the node also searches agent-level knowledge when node sources are set. → ✓ Node-level sources are what that node uses; agent-level knowledge is the fallback only when the node has none.

## k01: Enterprise knowledge: Copilot connectors, real-time connectors, Azure AI Search
- ✗ Choosing a Copilot connector when data must not leave the source system. → ✓ Copilot connectors **copy and index** content. Use a real-time connector.
- ✗ Expecting makers to create Copilot connectors in Copilot Studio. → ✓ They're configured by an **admin** in the Microsoft 365 admin center; makers add them as knowledge.
- ✗ Publishing with manual auth and getting no Copilot connector results. → ✓ Add the `ExternalItem.Read.All` Graph scope before publishing.
- ✗ Pointing Azure AI Search knowledge at a keyword-only index. → ✓ Use a vector index with integrated vectorization and enable semantic ranker.
- ✗ Assuming real-time connector knowledge gives citations like documents. → ✓ Citations aren't inherent for real-time connectors.

## k02: Connector tools, custom connectors and REST APIs
- ✗ Building a new custom connector when the API is only for one agent. → ✓ A REST API tool is quicker for agent-only use; custom connectors are for reuse.
- ✗ Writing tool descriptions like "Calls the stock API". → ✓ Say what, when and what it needs; the orchestrator routes by description.
- ✗ Letting AI fill values that must come from context (user ID, store, region). → ✓ Set **custom values** from variables or Power Fx.
- ✗ Adding 60 tools to one agent. → ✓ Up to 128 are allowed, but 25–30 is recommended; split into child or connected agents.
- ✗ Forgetting to share the custom connector and its connection with co-makers. → ✓ Share the connector (Can use / Can edit) and connections separately; keep it in the solution.

## k03: MCP tools
- ✗ Connecting an SSE-only MCP server. → ✓ Copilot Studio needs **Streamable HTTP**.
- ✗ Editing MCP tool descriptions in Copilot Studio. → ✓ They're read-only; change them on the server.
- ✗ Leaving **Allow all** on for a governed agent. → ✓ Future tools are enabled automatically; turn it off and pick tools.
- ✗ Calling MCP from a topic. → ✓ Not supported; MCP needs generative orchestration.
- ✗ Expecting MCP **prompts** to appear. → ✓ Tools and resources are supported; prompts aren't.

## k04: Computer use
- ✗ Putting passwords in computer use instructions. → ✓ Use stored credentials (Copilot Studio or Key Vault).
- ✗ Using the hosted browser for production with corporate identity. → ✓ It's for prototyping and isn't Entra-joined; use a Cloud PC pool or registered machine.
- ✗ Picking computer use when a connector exists. → ✓ APIs/connectors are faster, cheaper and more reliable.
- ✗ Expecting topics with classic orchestration to run computer use. → ✓ Computer use needs generative orchestration.
- ✗ Relying on human supervision alone for irreversible actions. → ✓ It's model-triggered and not a fail-safe; put a deterministic approval before high-impact steps.

## m01: Multi-agent design: child and connected agents
- ✗ Using a child agent for a capability another team owns and releases. → ✓ That's a connected agent.
- ✗ Expecting connected agent description changes to sync. → ✓ The caller keeps a local copy; update it manually.
- ✗ Forgetting *Let other agents connect to and use this one* on the target. → ✓ Without it (and publishing and sharing) the agent can't be connected.
- ✗ Leaving the same tool enabled on parent and child. → ✓ Clear the parent's dynamic-use toggle so the child owns it.
- ✗ Splitting every department into its own agent on day one. → ✓ Each hop adds latency, cost and governance work; split only on real seams.

## m02: Foundry agents, Fabric data agents and A2A
- ✗ Expecting a classic-portal Foundry agent to connect. → ✓ Only new-portal agents; classic → 404 Version not found.
- ✗ Enabling the Foundry Activity endpoint in the portal. → ✓ There's no portal switch; use REST or the Python SDK.
- ✗ Deploying a standard-harness agent with a Fabric data agent (preview path) to Microsoft 365 Copilot. → ✓ Not supported there (Teams is validated). The GA GitHub Copilot harness integration (Add a tool > Fabric IQ Data MCP) can publish to Teams and Microsoft 365 Copilot.
- ✗ Pasting the agent card URL as the A2A endpoint. → ✓ Enter the communication endpoint; the card is fetched from `.well-known`.
- ✗ Assuming A2A sends only the latest message. → ✓ It sends the **full chat history**: review privacy.

## z01: Integrate with Azure: AI Search with Foundry, Foundry models, Application Insights
- ✗ Counting unique users on an anonymous website agent. → ✓ Anonymous users get random IDs per conversation; counts are inflated.
- ✗ Forgetting to exclude test pane traffic. → ✓ Filter `designMode == "False"`.
- ✗ Expecting Foundry IQ on a standard-harness agent. → ✓ Foundry IQ (as a tool) is for GitHub Copilot harness agents; standard harness uses Azure AI Search knowledge (or, until 14 Oct 2026, Azure OpenAI on your data).
- ✗ Starting new work on Azure OpenAI On Your Data. → ✓ The service retires on 14 Oct 2026; use Azure AI Search knowledge, Foundry IQ, or a connected Foundry agent with Foundry IQ.
- ✗ Turning on conversation details by default. → ✓ It logs user names and message text (and tool arguments): privacy review first.
- ✗ Thinking a node's Azure OpenAI source combines with agent knowledge. → ✓ Node-level sources take priority; agent-level is only a fallback.

## e01: Evaluate agents: test sets, methods, results
- ✗ Using Compare meaning without expected answers. → ✓ Results are Invalid; add expected responses or use General quality.
- ✗ Testing refusals with General quality only. → ✓ It may score correct refusals low; use a Custom grader.
- ✗ Running evaluations with the maker's admin account. → ✓ Set a realistic test **user profile**: permissions change answers.
- ✗ Putting Tool use on a multi-turn conversation set. → ✓ Tool use is single-response only.
- ✗ Importing 250 cases into one set. → ✓ Max **100** per set; split into several sets.

## e02: Solutions, existing agents and environment variables
- ✗ Expecting channels and Teams availability to come with the import. → ✓ Not solution-aware; reconfigure after import.
- ✗ Editing environment variable values in production and expecting the agent to pick them up instantly. → ✓ Republish (secrets are the exception).
- ✗ Putting a real API key in a text environment variable. → ✓ Use a **secret** environment variable backed by Azure Key Vault.
- ✗ Adding only the agent to the solution. → ✓ Use **Add required objects** so flows, references and variables come too.
- ✗ Importing unmanaged solutions into production. → ✓ Use managed downstream; unmanaged is for development.

## e03: Power Platform pipelines (implement and extend)
- ✗ Using a non-managed environment as a pipeline target. → ✓ Targets must be Managed Environments (with Dataverse).
- ✗ Expecting to skip the Test stage for a hotfix. → ✓ Stages run in order.
- ✗ Setting Pre-export Step Required on the production stage. → ✓ It's meant for the **first** stage; production uses pre-deployment steps.
- ✗ Using status 30 to mark a gate complete. → ✓ **20** completes; **30** rejects.
- ✗ Assuming pipelines roll back automatically. → ✓ Redeploy a previous version; plan rollback.

