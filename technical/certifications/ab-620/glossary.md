---
title: "AB-620 glossary"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, glossary]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AB-620 glossary

| Term | Meaning |
|---|---|
| **A2A (Agent2Agent)** | Open protocol for one agent to delegate tasks to another agent on any platform; discovered through an agent card. |
| **Activity map** | Test-pane view showing which topics, tools, knowledge and agents ran for a message. |
| **Activity protocol endpoint** | Endpoint a Foundry agent must expose before Copilot Studio can connect to it. |
| **Adaptive Card** | JSON-defined card with text, images, inputs and actions rendered by channels such as Teams. |
| **Agent card** | A2A JSON document (at /.well-known/agent.json) describing an agent's name, skills, endpoint and auth. |
| **Agent flow** | Power Automate-based flow native to Copilot Studio, triggered by an agent and returning outputs; called Workflow in the newest UI. |
| **Allow all (MCP)** | Toggle that enables all current and future tools on an MCP server. |
| **Application Insights** | Azure Monitor service that can receive Copilot Studio telemetry in the customEvents table. |
| **Ask with adaptive card** | Topic node that shows an interactive card and saves each input into an output variable. |
| **Authenticate manually** | Agent sign-in using your own Entra ID app registration or generic OAuth 2 provider; exposes the user's access token. |
| **Authenticate with Microsoft** | Agent sign-in with Microsoft Entra ID handled automatically in Teams and Microsoft 365 surfaces. |
| **Child agent** | Specialist agent built inside a parent agent; shares context and lifecycle. |
| **Component collection** | Reusable set of topics, knowledge, tools and entities shared across agents. |
| **Computer use** | Tool that lets an agent operate websites and desktop apps through the user interface. |
| **Connected agent** | Separately published agent (Copilot Studio, Foundry, Fabric, A2A, Agents SDK) that another agent delegates to. |
| **Connection reference** | Solution component pointing to a connection, so each environment can bind its own. |
| **Content moderation** | Setting that controls how strictly generative responses are filtered for harmful content. |
| **Conversational boosting** | System topic that falls back to generative answers when no topic matches (classic orchestration). |
| **Copilot connector** | Formerly Microsoft Graph connector: indexes external content into Microsoft Graph for agents and Microsoft 365 Copilot. |
| **Copilot Credits** | Consumption unit for Copilot Studio usage such as generative answers, tools, flows and evaluations. |
| **Custom connector** | Power Platform wrapper around your API (OpenAPI), reusable by apps, flows and agents. |
| **Custom data** | Power Fx table (Content, ContentLocation, Title) given to a generative answers node; first 3 rows used. |
| **Delegated deployment** | Pipeline deployment run as a service principal or stage owner instead of the maker, after approval. |
| **designMode** | Telemetry dimension that is True for test-canvas conversations. |
| **Direct Line** | Bot Framework channel API used by websites and apps; secrets exchanged for tokens server-side. |
| **DLP policy** | Data loss prevention policy grouping connectors (and Copilot Studio features) as Business, Non-business or Blocked. |
| **Environment variable** | Solution component holding environment-specific values; read-only in agents (Env.). |
| **Event trigger** | Trigger that starts an autonomous agent run from an event such as a new email or Dataverse row. |
| **Fabric data agent** | Microsoft Fabric agent that answers questions over lakehouses, warehouses and semantic models. |
| **Foundry IQ** | Managed knowledge bases over Azure AI Search; connected as a tool to GitHub Copilot harness agents. |
| **Gated extension** | Pipeline stage setting that pauses a deployment until a flow completes or rejects a step. |
| **Generative answers node** | Topic node that searches selected knowledge and summarises an answer with citations. |
| **Generative orchestration** | Mode where the agent plans with descriptions of topics, tools, knowledge and agents. |
| **GitHub Copilot harness** | Copilot Studio runtime for reasoning-heavy agents with skills, memory and file handling. |
| **Harness** | The runtime between agent design and the model that decides calls and tools. |
| **Managed Environment** | Power Platform environment with extra governance; required for pipeline targets. |
| **Managed solution** | Locked solution package deployed to test and production. |
| **MCP (Model Context Protocol)** | Open protocol for exposing tools and resources from a server to AI clients. |
| **Memory** | GitHub Copilot harness feature letting an agent remember per-user information across sessions. |
| **Microsoft Entra ID** | Microsoft's identity service used for sign-in, SSO and service principals. |
| **Parse value** | Topic node that converts JSON text into a typed record or table. |
| **Pipelines (Power Platform)** | Built-in ALM feature that deploys solutions through ordered stages. |
| **Preferred solution** | Solution that new components are automatically added to. |
| **Prompt (prompt tool)** | Reusable instructions with inputs run by a chosen model; returns text or JSON. |
| **Publisher** | Solution owner record that defines the customisation prefix. |
| **Real-time connector (knowledge)** | Power Platform connector used as live knowledge without copying data. |
| **Request for information** | Agent flow action that asks a person to provide values through an Outlook actionable message. |
| **REST API tool** | Copilot Studio tool created from an OpenAPI specification for agent-only use. |
| **Send HTTP request** | Topic node that calls an HTTP endpoint with headers, body and response schema. |
| **Skill** | Reusable SKILL.md guidance (name, description, instructions) applied by the GitHub Copilot harness. |
| **Solution** | Package of Power Platform components moved between environments. |
| **Standard harness** | Copilot Studio runtime for rule-based agents built with topics and defined paths. |
| **Streamable HTTP** | MCP transport required by Copilot Studio. |
| **System topic** | Built-in topic for conversation events (Conversation Start, On Error, Escalate, Fallback...). |
| **Test set** | Collection of up to 100 test cases used for agent evaluation. |
| **Topic** | Authored conversation path made of nodes, variables and conditions. |
| **Web channel security** | Setting that requires secrets/tokens to embed an agent on websites. |
| **Work IQ** | Microsoft MCP-based tool giving agents workplace context across Microsoft 365. |
| **Workflow** | Newest UI name for an agent flow. |
