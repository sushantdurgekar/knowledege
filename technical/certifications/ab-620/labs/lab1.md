---
title: "Design and configure an agent (environment, solution, identity, skills)"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, f01, p01, p02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-1-design-and-configure-agent
    accessed: 2026-10-02
---
# Lab: Design and configure an agent (environment, solution, identity, skills)

> AB-620 · about 70 min · practises [f01](../concepts/f01-copilot-studio-essentials-exam-ui-and-new-ui.md), [p01](../concepts/p01-plan-an-agent-solution-integration-reuse-audiences.md), [p02](../concepts/p02-identity-security-and-governance.md) · [guide](https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-1-design-and-configure-agent)

## Goal
Create a developer environment with Dataverse, a publisher and preferred solution, an agent on the GitHub Copilot harness with instructions, memory and default safety settings, and two skills (one authored, one uploaded as SKILL.md).

## ⚠️ Cost (low)
Developer environments are free; Preview turns and skill tests consume Copilot Credits. Use *Skip to configure* to avoid generation credits during setup.

## Prerequisites
- Microsoft 365 work account with Copilot Studio access (trial or developer plan)
- Permission to create a Power Platform developer environment

## Steps
1. Power Platform admin center: create a **Developer** environment with Dataverse.
2. Create a publisher (prefix) and a solution; **Set as preferred solution**.
3. Create the agent via **Agent (GitHub Copilot)** → *Skip to configure*; write instructions (role, tone, scope, escalation, security).
4. Turn on **Memory**; confirm Settings > **Safety & access** shows *Authenticate with Microsoft*.
5. Create a skill from blank (When to activate / Behavior / Boundaries) and upload the provided SKILL.md.
6. Test in **Preview** with *End user preview* off to see which skill fired.

## Verify
- [ ] The agent answers in scope and declines out-of-scope requests.
- [ ] Both skills are invoked for matching situations.
- [ ] All components appear in your solution.

## Break it (then fix it)
- Make two skill descriptions overlap and watch the wrong one fire; fix the descriptions.
- Remove the escalation rule from instructions and compare behaviour.

## Teardown (do it the same day)
```bash
Power Platform admin center > Environments > (your developer environment) > Delete
# Or keep the environment for later labs and delete only test agents.
# No Azure resources are created in this lab.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
