---
title: "Zero Trust for agents: workload identity, RBAC, private networking, Key Vault"
track: technical
domain: data-ai
subject: ai-500
tags: [exam-ai-500, lab, s01, s02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster
    accessed: 2026-10-02
---
# Lab: Zero Trust for agents: workload identity, RBAC, private networking, Key Vault

> AI-500 · about 120 min · practises [s01](../concepts/s01-resource-access-identity-rbac-and-network-boundaries-zero-tr.md), [s02](../concepts/s02-authentication-flows-and-secrets-management-with-key-vault.md) · [guide](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)

## Goal
Run an agent on AKS with workload identity, least-privilege data-plane roles, deny-all network policies, Key Vault RBAC and an OBO call to a protected API.

## ⚠️ Cost (high)
AKS nodes, Key Vault and private endpoints are billed while they exist. Use the smallest node pool and delete the resource group as soon as you finish.

## Prerequisites
- Azure subscription with rights to create AKS, identities and role assignments
- kubectl and Azure CLI

## Steps
1. Create AKS with OIDC issuer + workload identity; federate a service account to a managed identity.
2. Grant only Storage Blob Data Reader (container scope) and Key Vault Secrets User.
3. Apply a deny-all NetworkPolicy, then allow DNS and the specific services needed.
4. Read a secret from Key Vault with the workload identity; enable purge protection.
5. Implement an OBO call from an API to a downstream API with a test user.

## Verify
- [ ] The pod reads only what its roles allow; other calls fail with 403.
- [ ] Blocked egress fails; allowed paths work.

## Break it (then fix it)
- Remove the DNS allow rule and observe failures.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai500-security --yes --no-wait
# Key Vault is soft-deleted; purge only if policy allows:
# az keyvault purge --name <vault-name>
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
