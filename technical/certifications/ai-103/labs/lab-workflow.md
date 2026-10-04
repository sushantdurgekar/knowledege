---
title: "Build a workflow in Microsoft Foundry"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, a07]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/06-build-workflow-ms-foundry.html
    accessed: 2026-10-02
---
# Lab: Build a workflow in Microsoft Foundry

> AI-103 · about 45 min · practises [a07](../concepts/a07-foundry-workflows-visual-multi-step-and-human-in-the-loop.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-agents/Instructions/Exercises/06-build-workflow-ms-foundry.html)

## Goal
Create a triage workflow with JSON outputs, If/Else Power Fx conditions and a human-in-the-loop step.

## ⚠️ Cost (low)
Tokens only.

## Steps
1. Create the workflow; add the triage agent with a JSON schema output.
2. Add If/Else on confidence; add Ask a question for low confidence.
3. Add escalation and resolution branches; save; run from code with streaming.

## Verify
- [ ] Low-confidence tickets ask for more information; billing tickets escalate.

## Break it (then fix it)
- Remove the JSON schema and see the condition fail.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-agents --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
