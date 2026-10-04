---
title: "Topics, adaptive cards and an agent flow in a topic"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, c01, c02, c03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoft.github.io/agent-academy/recruit/08-add-adaptive-card/
    accessed: 2026-10-02
---
# Lab: Topics, adaptive cards and an agent flow in a topic

> AB-620 · about 90 min · practises [c01](../concepts/c01-topics-variables-and-response-formatting.md), [c02](../concepts/c02-adaptive-cards.md), [c03](../concepts/c03-advanced-responses-generative-answers-prompts-http-tools-in.md) · [guide](https://microsoft.github.io/agent-academy/recruit/08-add-adaptive-card/)

## Goal
Build a topic with a trigger, Question nodes and variables; add an Ask with adaptive card form; call an agent flow from the topic; add a generative answers node with node-level sources; and a Send HTTP request with Continue on error.

## ⚠️ Cost (low)
Preview turns, generative answers and flow runs consume Copilot Credits.

## Prerequisites
- An agent on the standard harness (topics available)
- Agent Academy Recruit missions 07–09 as step-by-step guides

## Steps
1. Mission 07: create a topic with a description/trigger, Question nodes and a Condition.
2. Mission 08: add **Ask with adaptive card** (schema 1.5, descriptive ids); validate outputs with a Condition; switch to a **Formula card** to show variables.
3. Mission 09: call an agent flow from the topic; map inputs and outputs.
4. Add **Generative answers** with node-level sources and custom instructions; handle blank answers.
5. Add **Send HTTP request** to a public test API with *Continue on error*; branch on the status code.

## Verify
- [ ] Card values arrive in `Topic.<id>` variables.
- [ ] The topic uses flow outputs in its confirmation message.
- [ ] Blank generative answers route to a fallback.

## Break it (then fix it)
- Set the card to version 1.6 and test in Teams.
- Call an invalid URL in the HTTP node with *Raise an error* and watch On Error fire.

## Teardown (do it the same day)
```bash
Delete practice topics or the practice agent.
# Nothing to remove in Azure.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
