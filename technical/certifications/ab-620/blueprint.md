---
title: "AB-620 blueprint"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, blueprint]
status: learning
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ab-620
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/certifications/ai-agent-builder-associate/
    accessed: 2026-10-02
  - url: https://techcommunity.microsoft.com/blog/skills-hub-blog/new-microsoft-certified-ai-agent-builder-associate-certification/4494125
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience
    accessed: 2026-10-02
  - url: https://aka.ms/examdemo
    accessed: 2026-10-02
---
# AB-620 blueprint: Microsoft Certified: AI Agent Builder Associate

> Skills outline as of **21 April 2026** (checked 2026-10-02). Study Hub: https://claude.ai/artifact/DfeAjDjaTCgtf36RSKeSSS

## Exam facts
- **700**: passing score (1–1000)
- **120 min**: exam time; may include interactive components
- **40–60**: questions, typical
- **3**: skill domains (outline of 21 Apr 2026)
- **Low-code + pro**: Power Fx, Dataverse, REST, Azure
- **Free**: annual online renewal

## Notices (read before booking)
- **A new exam, so verify a few things before booking.** AB-620's skills outline dates from **21 April 2026**. When the certification page was last updated (5 Aug 2026) Microsoft's free practice assessment wasn't available yet. Check the exam page for it, and whether your exam includes interactive (lab-style) items.
- **The Copilot Studio interface is changing fast.** Microsoft Learn modules (and the exam outline) say **agent flows**, **topics** and **child/connected agents**. The newest official labs (AB-620T00 v2) show a newer experience: agents on a *GitHub Copilot harness*, **Workflows** (the new name for agent flows in the left navigation), **Skills** (reusable SKILL.md behaviours), a **Memory** toggle, and **Preview / Evaluate / Monitor** tabs. This hub teaches the exam's terms and flags the new names, so you'll recognise both.
- **Labs cost Copilot Credits.** Testing in Preview, running evaluations and computer use consume Copilot Credits. Use a trial or developer environment, keep test sets small, and watch the Monitor tab's estimated credits.

## Domains and weights
| Domain | Weight | Modules |
|---|---|---|
| D1 Plan and configure agent solutions | 30–35% | f01, p01, p02, p03, p04, w01, w02, c01, c02, c03 |
| D2 Integrate and extend agents in Copilot Studio | 40–45% | k01, k02, k03, k04, m01, m02, z01 |
| D3 Test and manage agents | 20–25% | e01, e02, e03 |

## Skills measured → where to study them
### D1 Plan and configure agent solutions (30–35%)
**Plan an agent solution**

- [ ] Plan integration with enterprise systems → [p01](concepts/p01-plan-an-agent-solution-integration-reuse-audiences.md), [k02](concepts/k02-connector-tools-custom-connectors-and-rest-apis.md)
- [ ] Plan identity strategy → [p02](concepts/p02-identity-security-and-governance.md)
- [ ] Plan channels and deployment → [p04](concepts/p04-channels-and-deployment.md)
- [ ] Plan responsible AI strategy → [p03](concepts/p03-responsible-ai-strategy-for-agents.md)
- [ ] Evaluate security and governance considerations → [p02](concepts/p02-identity-security-and-governance.md)
- [ ] Plan reusable agent components → [p01](concepts/p01-plan-an-agent-solution-integration-reuse-audiences.md), [m01](concepts/m01-multi-agent-design-child-and-connected-agents.md)
- [ ] Design agents for internal or external audiences → [p01](concepts/p01-plan-an-agent-solution-integration-reuse-audiences.md), [p04](concepts/p04-channels-and-deployment.md)

**Create and monitor agent flows in Copilot Studio**

- [ ] Create an agent flow → [w01](concepts/w01-agent-flows-build-parameters-connectors-topics.md)
- [ ] Create a human-in-the-loop agent flow → [w02](concepts/w02-human-in-the-loop-flows-error-handling-monitoring.md)
- [ ] Configure actions and connectors → [w01](concepts/w01-agent-flows-build-parameters-connectors-topics.md)
- [ ] Monitor agent flows → [w02](concepts/w02-human-in-the-loop-flows-error-handling-monitoring.md)
- [ ] Add input and output parameters → [w01](concepts/w01-agent-flows-build-parameters-connectors-topics.md)
- [ ] Implement error handling in agent flows → [w02](concepts/w02-human-in-the-loop-flows-error-handling-monitoring.md)

**Configure topics**

- [ ] Add agent flows to a topic → [w01](concepts/w01-agent-flows-build-parameters-connectors-topics.md), [c01](concepts/c01-topics-variables-and-response-formatting.md)
- [ ] Configure agent response formatting → [c01](concepts/c01-topics-variables-and-response-formatting.md)
- [ ] Add tools to a topic → [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Configure advanced agent responses with custom prompts → [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Configure advanced agent responses with custom knowledge sources → [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Configure advanced agent responses with API and Send HTTP requests → [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Configure generative answers node → [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Configure adaptive cards → [c02](concepts/c02-adaptive-cards.md)
- [ ] Manage variables → [c01](concepts/c01-topics-variables-and-response-formatting.md)

### D2 Integrate and extend agents in Copilot Studio (40–45%)
**Connect to enterprise knowledge sources**

- [ ] Connect to Copilot connectors → [k01](concepts/k01-enterprise-knowledge-copilot-connectors-real-time-connectors.md)
- [ ] Connect to Microsoft Power Platform connectors → [k01](concepts/k01-enterprise-knowledge-copilot-connectors-real-time-connectors.md)
- [ ] Connect to Azure AI Search → [k01](concepts/k01-enterprise-knowledge-copilot-connectors-real-time-connectors.md), [z01](concepts/z01-integrate-with-azure-ai-search-with-foundry-foundry-models-a.md)

**Add tools to agents**

- [ ] Configure and monitor computer use for an agent → [k04](concepts/k04-computer-use.md)
- [ ] Configure MCP tools → [k03](concepts/k03-mcp-tools.md)
- [ ] Add a tool by using an existing custom connector → [k02](concepts/k02-connector-tools-custom-connectors-and-rest-apis.md)
- [ ] Add REST APIs to an agent → [k02](concepts/k02-connector-tools-custom-connectors-and-rest-apis.md)

**Configure multi-agent collaboration from Copilot Studio**

- [ ] Design multi-agent solutions in Copilot Studio → [m01](concepts/m01-multi-agent-design-child-and-connected-agents.md)
- [ ] Integrate a Foundry agent → [m02](concepts/m02-foundry-agents-fabric-data-agents-and-a2a.md)
- [ ] Integrate an existing agent in Copilot Studio → [m01](concepts/m01-multi-agent-design-child-and-connected-agents.md)
- [ ] Integrate a Fabric data agent → [m02](concepts/m02-foundry-agents-fabric-data-agents-and-a2a.md)
- [ ] Create a multi-agent solution by using A2A protocol → [m02](concepts/m02-foundry-agents-fabric-data-agents-and-a2a.md)

**Integrate agents with Azure**

- [ ] Configure generative answers by using Azure AI Search with Foundry → [z01](concepts/z01-integrate-with-azure-ai-search-with-foundry-foundry-models-a.md)
- [ ] Configure custom prompts to use the Foundry model catalog → [z01](concepts/z01-integrate-with-azure-ai-search-with-foundry-foundry-models-a.md), [c03](concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md)
- [ ] Monitor agents by using Application Insights → [z01](concepts/z01-integrate-with-azure-ai-search-with-foundry-foundry-models-a.md)

### D3 Test and manage agents (20–25%)
**Evaluate agent performance**

- [ ] Create a test set → [e01](concepts/e01-evaluate-agents-test-sets-methods-results.md)
- [ ] Choose an evaluation method → [e01](concepts/e01-evaluate-agents-test-sets-methods-results.md)
- [ ] Review test results → [e01](concepts/e01-evaluate-agents-test-sets-methods-results.md)

**Implement ALM for agents in Copilot Studio**

- [ ] Create a solution → [e02](concepts/e02-solutions-existing-agents-and-environment-variables.md)
- [ ] Add existing agents to a solution → [e02](concepts/e02-solutions-existing-agents-and-environment-variables.md)
- [ ] Create and use environment variables → [e02](concepts/e02-solutions-existing-agents-and-environment-variables.md)
- [ ] Implement and extend Microsoft Power Platform Pipelines → [e03](concepts/e03-power-platform-pipelines-implement-and-extend.md)

## Exam tactics
- Spot the deciding constraint: *reuse across Power Platform* (custom connector) vs *Copilot Studio only* (REST API tool) vs *one-off call* (HTTP node) vs *multi-step with approvals* (agent flow) vs *shared tool server* (MCP) vs *no API at all* (computer use).
- Identity words decide answers: *user's own permissions* → end-user credentials / remote sources; *shared service account* → maker-provided credentials.
- Order questions (build list) are common for ALM and setup tasks: environment → solution → components → environment variables → pipeline.
- Remember channel limits: Teams supports Adaptive Card schema **1.5**; the test pane renders 1.6, which can mislead you.
- When an option needs generative orchestration (MCP, computer use, Fabric data agent), check that the scenario has it turned on.
- Budget ~2 minutes per item; interactive items take longer, so bank time early.
