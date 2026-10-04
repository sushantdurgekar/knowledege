---
title: "CI/CD with IaC, OIDC, dependency order and evaluation gates"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, s05, s04]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect
    accessed: 2026-10-02
---
# Lab: CI/CD with IaC, OIDC, dependency order and evaluation gates

> AI-500 · about 100 min · practises [s05](../concepts/s05-testing-strategy-and-ci-cd-with-iac-for-multi-agent-systems.md), [s04](../concepts/s04-release-methodology-dtap-blue-green-canary-and-rollback.md) · [guide](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)

## Goal
Create a GitHub Actions pipeline that provisions with Bicep/azd, signs in with OIDC, deploys tools before agents, gates on evaluations, and canaries to production with automated rollback.

## ⚠️ Cost (medium)
Container Apps environments for test/prod plus model usage; keep environments small and delete afterwards.

## Prerequisites
- GitHub repository; Entra app registration or managed identity with a federated credential
- azd and Bicep

## Steps
1. Set up OIDC federation and `permissions: id-token: write`.
2. Write Bicep for the Container Apps environment, apps and Key Vault; run what-if on PRs.
3. Encode tool → agent dependencies with `needs:`; add contract tests.
4. Add an evaluation job (`microsoft/ai-agent-evals` or the SDK) that the deploy job needs.
5. Deploy to production with revision weights (5% canary) and a rollback workflow triggered by `repository_dispatch`.

## Verify
- [ ] No secrets stored in GitHub; deployments succeed via OIDC.
- [ ] An injected regression blocks the release; the rollback workflow restores 100% to stable.

## Break it (then fix it)
- Remove `id-token: write` and read the login error.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-cicd-test --yes --no-wait
az group delete --name rg-ai500-cicd-prod --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
