---
title: "Workflows (agent flows) with Dataverse, email and human approval"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, w01, w02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-2-add-workflows-to-agent
    accessed: 2026-10-02
---
# Lab: Workflows (agent flows) with Dataverse, email and human approval

> AB-620 · about 140 min · practises [w01](../concepts/w01-agent-flows-build-parameters-connectors-topics.md), [w02](../concepts/w02-human-in-the-loop-flows-error-handling-monitoring.md) · [guide](https://github.com/MicrosoftLearning/AB-620T00_build_integrated_ai_agents_in_copilot_studio/tree/main/Instructions/Labs/lab-2-add-workflows-to-agent)

## Goal
Create Dataverse tables, author a workflow that writes a return and emails a confirmation, add an approval branch for refunds over a threshold, attach both as tools and inspect run history.

## ⚠️ Cost (low)
Workflow actions and Preview turns consume Copilot Credits. Approvals and Outlook are included with Microsoft 365.

## Prerequisites
- Lab 1 environment and solution
- A mailbox for confirmation emails and an approver account

## Steps
1. Create the Returns, Orders, Customer Records and Products tables in the solution; import sample data.
2. New workflow: trigger **When an agent calls the workflow**; add inputs.
3. Add **Dataverse – Add a new row** and **Outlook – Send an email (V2)**; map **Respond to the agent** outputs; Save and **Publish**.
4. Attach it: Tools > + > **Workflows**; write the **Description for AI**.
5. Second workflow: If/Else on amount > 100 → **Start and wait for an approval** → **Switch** on Outcome; else auto-approve.
6. Open each workflow's **Activity** to inspect inputs, outputs and each step.

## Verify
- [ ] A return row and confirmation email appear after a chat request.
- [ ] Refunds over the threshold wait for approval; under the threshold they're auto-approved.

## Break it (then fix it)
- Leave a required input blank in a test and watch how the orchestrator reacts.
- Add a 2-minute delay before Respond to the agent and observe the tool failure (then move the response earlier).

## Teardown (do it the same day)
```bash
Delete test rows from the Dataverse tables.
# Turn off or delete workflows you no longer need (they consume credits only when run).
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
