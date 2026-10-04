---
title: "Extend a pipeline with a gated approval"
track: technical
domain: data-ai
subject: ab-620
tags: [exam-ab-620, lab, e03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/power-platform/alm/extend-pipelines
    accessed: 2026-10-02
---
# Lab: Extend a pipeline with a gated approval

> AB-620 · about 50 min · practises [e03](../concepts/e03-power-platform-pipelines-implement-and-extend.md) · [guide](https://learn.microsoft.com/en-us/power-platform/alm/extend-pipelines)

## Goal
Add a pre-deployment step to a pipeline stage and complete it from a Power Automate flow that posts an approval.

## ⚠️ Cost (low)
Included with Power Platform; target environments must be Managed Environments.

## Prerequisites
- A pipeline with at least one target stage
- Permission to edit stages (custom host: Deployment Pipeline Administrator)

## Steps
1. Turn on **Pre-deployment Step Required** on the target stage.
2. Create a cloud flow triggered by **OnPreDeploymentStarted**.
3. Send an approval; on approve call **UpdatePreDeploymentStepStatus** with 20, on reject 30, with comments.
4. Run a deployment and watch the gate in run history.

## Verify
- [ ] The deployment waits until the approval; rejection fails the run with your comment visible.

## Break it (then fix it)
- Use status 10 and see the deployment stay pending.

## Teardown (do it the same day)
```bash
Turn off the gate if not needed and disable the flow.
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
