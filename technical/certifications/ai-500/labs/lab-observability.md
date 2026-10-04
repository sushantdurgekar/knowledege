---
title: "Tracing, dashboards and alerts"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, v04, v05]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup
    accessed: 2026-10-02
---
# Lab: Tracing, dashboards and alerts

> AI-500 · about 90 min · practises [v04](../concepts/v04-observability-and-tracing-in-foundry.md), [v05](../concepts/v05-reliability-sla-and-cost-monitoring-with-automated-remediati.md) · [guide](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup)

## Goal
Instrument a two-agent system with OpenTelemetry, propagate trace context over custom HTTP, add GenAI attributes, build KQL dashboards and dynamic-threshold alerts.

## ⚠️ Cost (low)
Application Insights ingestion; keep sampling on and delete afterwards.

## Prerequisites
- Application Insights connected to your Foundry project
- `pip install azure-monitor-opentelemetry`

## Steps
1. Configure `configure_azure_monitor()` from the environment.
2. Add spans at semantic boundaries with agent id/version and GenAI token attributes.
3. Inject/extract `traceparent` on a custom HTTP call between agents.
4. Build KQL: P50/P95/P99 per agent; tokens per tenant.
5. Create a dynamic-threshold alert on per-agent token usage and test it with a looping prompt.

## Verify
- [ ] One end-to-end trace across both agents.
- [ ] The token alert fires on the loop test.

## Break it (then fix it)
- Remove propagation and watch traces split.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-observe --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
