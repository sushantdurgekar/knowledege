---
title: "Computer use on a test website (self-guided)"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, k04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use
    accessed: 2026-10-02
---
# Lab: Computer use on a test website (self-guided)

> AB-620 · about 45 min · practises [k04](../concepts/k04-computer-use.md) · [guide](https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use)

## Goal
Create a computer use tool that fills a form on a demo website, with allowed websites, stored credentials and human supervision, and review the session replay.

## ⚠️ Cost (medium)
Each computer use step consumes Copilot Credits; keep runs short and use the hosted browser for practice.

## Prerequisites
- Generative orchestration on
- A harmless public test form (never production systems while practising)

## Steps
1. Tools > Add a tool > New tool > Computer use; write instructions with the full URL and explicit steps.
2. Define inputs and an output (e.g., confirmation number).
3. Restrict **allowed websites** to the test site; enable **human supervision** for the submit step.
4. Run from the test pane; approve when asked.
5. Open Activity and replay the screenshots with reasoning.

## Verify
- [ ] The form is submitted once, only after approval.
- [ ] The replay shows each step and the final confirmation.

## Break it (then fix it)
- Remove the site from allowed websites and see the run stop.
- Change a field label on your own test page and see how instructions cope.

## Teardown (do it the same day)
```bash
Delete the computer use tool and any stored credentials.
# If you registered your own machine, unregister it in Power Automate > Monitor > Machines.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
