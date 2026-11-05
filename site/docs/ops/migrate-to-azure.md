# Moving to Azure

Read [migration-overview.md](migration-overview.md) first: it decides between moving compute only
(Firestore stays) and compute plus data (PostgreSQL), and holds the cut-over steps. This guide
builds the Azure side. Region: **Southeast Asia (`southeastasia`, Singapore)**.

Facts checked on 2026-11-05 (confirm on Microsoft's pages before you commit):
- **Azure Container Apps** has an always-free monthly grant of 180,000 vCPU-seconds,
  360,000 GiB-seconds and 2 million requests per subscription
  ([Azure free services](https://azure.microsoft.com/en-us/pricing/free-services/)). An always-on
  replica uses more than that grant (one 0.25 vCPU replica for a month is about 650,000
  vCPU-seconds), so expect a small monthly charge.
- **Azure Database for PostgreSQL – Flexible Server**: an Azure free account includes 750 hours a
  month of a Burstable **B1MS** instance plus 32 GB storage for 12 months
  ([Microsoft Learn](https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-deploy-on-azure-free-account)).

## What you build

| Piece | Azure service | Notes |
|---|---|---|
| Image registry | Azure Container Registry (Basic) | `az acr build` builds the image in Azure, so no local Docker is needed |
| Container | Azure Container Apps, **min 1 / max 1 replica**, 0.5 vCPU / 1 GiB | External ingress, target port 10000 |
| Database (option C) | PostgreSQL Flexible Server, Burstable B1MS | Private access in the same VNet, or public with firewall rules |
| `DATA_DIR` volume | Azure Files share mounted at `/data` | So restores survive restarts |
| Secrets | Container Apps secrets (optionally backed by Key Vault) | Never plain environment values |
| Logs | Log Analytics workspace | Created with the environment |

## Step by step (Azure CLI)

1. Install the Azure CLI, then:
   ```bash
   az login
   az extension add --name containerapp --upgrade
   az provider register --namespace Microsoft.App
   az provider register --namespace Microsoft.OperationalInsights
   export RG=study-hubs LOC=southeastasia
   az group create --name $RG --location $LOC
   ```
2. **Registry and image** (from the repo root; the build context is the whole repo, filtered by
   `.dockerignore`):
   ```bash
   az acr create --resource-group $RG --name studyhubsacr --sku Basic
   az acr build --registry studyhubsacr --image study-hubs:$(git rev-parse --short HEAD) \
     --file site/Dockerfile --build-arg GIT_COMMIT=$(git rev-parse HEAD) .
   ```
3. **Database (option C only).**
   ```bash
   az postgres flexible-server create --resource-group $RG --name study-hubs-db --location $LOC \
     --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
     --admin-user studyhubs --admin-password '<a long random password>' \
     --public-access None
   az postgres flexible-server db create --resource-group $RG --server-name study-hubs-db --database-name studyhubs
   ```
   `--public-access None` needs the Container Apps environment and the server in one VNet (create
   the environment with `--infrastructure-subnet-resource-id`). Simpler to start: create the server
   with public access and add a firewall rule for the Container Apps environment's outbound IP
   (`az containerapp env show … --query properties.staticIp`), with SSL required.
   Then `DATABASE_URL=postgresql://studyhubs:<password>@study-hubs-db.postgres.database.azure.com:5432/studyhubs?sslmode=require`.
4. **Environment and storage for `/data`.**
   ```bash
   az containerapp env create --resource-group $RG --name study-hubs-env --location $LOC
   az storage account create --resource-group $RG --name studyhubsdata --location $LOC --sku Standard_LRS
   az storage share-rm create --resource-group $RG --storage-account studyhubsdata --name data --quota 10
   az containerapp env storage set --resource-group $RG --name study-hubs-env --storage-name data \
     --azure-file-account-name studyhubsdata \
     --azure-file-account-key "$(az storage account keys list -g $RG -n studyhubsdata --query [0].value -o tsv)" \
     --azure-file-share-name data --access-mode ReadWrite
   ```
5. **The app**, with secrets referenced by `secretref:`:
   ```bash
   az containerapp create --resource-group $RG --name study-hubs --environment study-hubs-env \
     --image studyhubsacr.azurecr.io/study-hubs:<tag> --registry-server studyhubsacr.azurecr.io \
     --target-port 10000 --ingress external --min-replicas 1 --max-replicas 1 \
     --cpu 0.5 --memory 1.0Gi \
     --secrets database-url='<DATABASE_URL>' secret-key='<same SECRET_KEY as Render>' firebase-sa-b64='<base64 key>' \
     --env-vars APP_ENV=production PUBLIC_ORIGIN=https://quiz.example.com STORE=postgres AUTH_MODE=firebase \
       FIREBASE_PROJECT_ID=<project id> FIREBASE_WEB_CONFIG='{…}' ADMIN_EMAILS=you@example.com \
       ADMIN_TZ=Asia/Kolkata DATA_DIR=/data TRUSTED_PROXY_HOPS=1 \
       DATABASE_URL=secretref:database-url SECRET_KEY=secretref:secret-key \
       FIREBASE_SERVICE_ACCOUNT_B64=secretref:firebase-sa-b64
   ```
   For option B (Firestore stays) use `STORE=firestore` and leave out `DATABASE_URL`.
6. **Mount `/data`**: export the app's YAML (`az containerapp show -g $RG -n study-hubs -o yaml > app.yaml`),
   add under `template`:
   ```yaml
   volumes:
     - name: data
       storageType: AzureFile
       storageName: data
   ```
   and under the container: `volumeMounts: [{ volumeName: data, mountPath: /data }]`, then
   `az containerapp update -g $RG -n study-hubs --yaml app.yaml`.
7. **Health probes**: in the same YAML, liveness and readiness probes `httpGet` on `/healthz`,
   port 10000.
8. **Check**: `az containerapp show -g $RG -n study-hubs --query properties.configuration.ingress.fqdn -o tsv`
   gives the address; open `https://<fqdn>/healthz`.
9. **Custom domain**: `az containerapp hostname add` and `az containerapp hostname bind` with a
   managed certificate for `quiz.example.com` (add the `CNAME` and the `asuid` TXT record Azure
   shows at your DNS provider).

Ingress timeouts: Container Apps allows long requests by default; the quiz's 20-second long-polls
need nothing special.

## Deploy from GitHub Actions

Use OIDC (no stored passwords):
1. Microsoft Entra ID → **App registrations → New** `study-hubs-deploy` → **Certificates & secrets
   → Federated credentials → GitHub Actions**: repository `sushantdurgekar/knowledege`, branch `main`.
2. Give it **AcrPush** on the registry and **Contributor** on the resource group.
3. GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (identifiers, not passwords).
4. Replace the `deploy` job's Render steps with:
   ```yaml
   permissions: { id-token: write, contents: read }
   steps:
     - uses: actions/checkout@v4
     - uses: azure/login@v2
       with:
         client-id: ${{ secrets.AZURE_CLIENT_ID }}
         tenant-id: ${{ secrets.AZURE_TENANT_ID }}
         subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
     - run: |
         TAG=${GITHUB_SHA::7}
         az acr build --registry studyhubsacr --image study-hubs:$TAG --file site/Dockerfile --build-arg GIT_COMMIT=$GITHUB_SHA .
         az containerapp update -g study-hubs -n study-hubs --image studyhubsacr.azurecr.io/study-hubs:$TAG
   ```
   Keep the existing wait-for-`/api/version` and smoke-check steps.

## After the move

- Firebase: remove `Cloud Datastore User` from the service account (option C). Optionally use
  **Workload Identity Federation for Azure** (Google trusts a managed identity, so there is no key
  file); test account deletion after switching.
- Alerts: Azure Monitor alert on replica restarts and on HTTP 5xx; a **Cost Management budget**.
- Database backups: Flexible Server keeps automatic backups (7 days by default); keep taking the
  site's own **Admin → Backup** monthly.
