---
title: "Evaluate, publish to Teams, monitor and apply ALM"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, e01, e02, e03, p04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-5-evaluate-publish-and-manage
    accessed: 2026-10-02
---
# Lab: Evaluate, publish to Teams, monitor and apply ALM

> AB-620 · about 110 min · practises [e01](../concepts/e01-evaluate-agents-test-sets-methods-results.md), [e02](../concepts/e02-solutions-existing-agents-and-environment-variables.md), [e03](../concepts/e03-power-platform-pipelines-implement-and-extend.md), [p04](../concepts/p04-channels-and-deployment.md) · [guide](https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-5-evaluate-publish-and-manage)

## Goal
Run an evaluation from a multi-turn CSV, publish to Teams + Microsoft 365, review the Monitor tab and transcripts, add environment variables, promote with a pipeline and evaluate a candidate model.

## ⚠️ Cost (medium)
Evaluation runs are the most credit-intensive part (run once, keep subsets small). Pipelines need Managed Environments for targets.

## Prerequisites
- Labs 1–4
- Test and production environments that are Managed Environments (or follow along with the instructor demo)

## Steps
1. Evaluate tab: + New evaluation; upload the CSV (conversationNumber, question, response); General quality; set the **User profile**; run and review items.
2. Publish; Channels > **Teams + Microsoft 365** > Add channel; open in Teams.
3. Monitor tab: sessions, success rate, reactions, estimated credits; open transcripts.
4. Solution: agent ⋮ > Advanced > **Add required objects**; create an environment variable; republish after changing it.
5. Pipelines: Deploy here to test; map environment variables and **connection references**; redo channel, sharing, manual auth and App Insights after import.
6. Run a small candidate-model evaluation (5–8 items) before changing the model in dev.

## Verify
- [ ] Evaluation results explain each failed item.
- [ ] The agent works in Teams and appears in the Monitor tab.
- [ ] The solution deploys to the target with correct variable values.

## Break it (then fix it)
- Remove expected responses and run Compare meaning to see Invalid results.
- Deploy without mapping a connection reference and read the error.

## Teardown (do it the same day)
```bash
Remove the agent from Teams if it was a test (Teams admin center or uninstall the app).
# Delete test/prod environments created only for the lab in the Power Platform admin center.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
