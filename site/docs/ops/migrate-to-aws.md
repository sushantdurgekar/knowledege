# Moving to AWS

Read [migration-overview.md](migration-overview.md) first: it decides between moving compute only
(Firestore stays) and compute plus data (PostgreSQL), and holds the cut-over steps. This guide
builds the AWS side. Region: **Asia Pacific (Singapore) `ap-southeast-1`**.

Facts checked on 2026-11-05 (confirm prices on the AWS pages before you commit):
- **AWS App Runner is closed to new customers since 30 April 2026**; AWS recommends Amazon ECS
  Express Mode instead ([App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)).
  This guide does not use App Runner.
- New AWS accounts get a credit-based Free Plan (up to $200 of credits) instead of the old
  12-month allowances; Aurora PostgreSQL joined the Free Tier on 25 March 2026
  ([AWS announcement](https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-aurora-postgresql-aws-free-tier)).
- **Lightsail container services**: Nano (0.25 vCPU, 512 MB) about $7/month, Micro (1 GB) about
  $10/month per node, 500 GB transfer included ([Lightsail containers FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-containers.html)).

## Pick a path

| | Path 1: Lightsail (simple, fixed price) | Path 2: ECS on Fargate (standard AWS) |
|---|---|---|
| Good for | One small site, predictable bill, few AWS skills | Secrets Manager, VPC isolation, room to grow |
| Container | Lightsail container service, **Micro** (1 GB), scale 1 | ECS service, 0.5 vCPU / 1 GB task, desired count 1 |
| Database (option C) | Lightsail managed PostgreSQL | Amazon RDS for PostgreSQL (or Aurora PostgreSQL) |
| HTTPS + domain | Built in (default domain + custom domain certificate) | Application Load Balancer + ACM certificate |
| Secrets | Container environment (visible in the Lightsail console) | Secrets Manager, injected at start |
| `DATA_DIR` volume | None (restores in one sitting, as on Render) | EFS volume at `/data` |

Both paths run **one** container with the repo's `site/Dockerfile` image, unchanged.

## Common: tools and the image

1. Install the AWS CLI v2 and Docker; sign in: `aws configure sso` (or `aws configure`).
2. Create an image repository and push the image (from the repo root):
   ```bash
   export AWS_REGION=ap-southeast-1
   export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   aws ecr create-repository --repository-name study-hubs --region $AWS_REGION
   aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com
   docker build -f site/Dockerfile --build-arg GIT_COMMIT=$(git rev-parse HEAD) -t study-hubs:$(git rev-parse --short HEAD) .
   docker tag study-hubs:$(git rev-parse --short HEAD) $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/study-hubs:$(git rev-parse --short HEAD)
   docker push $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/study-hubs:$(git rev-parse --short HEAD)
   ```
   (Lightsail can also take the image straight from your machine: step 2 of Path 1.)

## Path 1: Lightsail

**Database (only for option C).**
1. List what is offered: `aws lightsail get-relational-database-blueprints` (pick the newest
   `postgres_*`) and `aws lightsail get-relational-database-bundles` (pick the smallest that fits;
   `micro` is enough to start).
2. Create it, not public:
   ```bash
   aws lightsail create-relational-database \
     --relational-database-name study-hubs-db \
     --relational-database-blueprint-id <postgres blueprint id> \
     --relational-database-bundle-id <bundle id> \
     --master-database-name studyhubs --master-username studyhubs \
     --no-publicly-accessible
   ```
3. Read the endpoint and password:
   `aws lightsail get-relational-database --relational-database-name study-hubs-db` and
   `aws lightsail get-relational-database-master-user-password --relational-database-name study-hubs-db`.
   Build `DATABASE_URL=postgresql://studyhubs:<password>@<endpoint>:5432/studyhubs?sslmode=require`.

**Container service.**
1. Create it: `aws lightsail create-container-service --service-name study-hubs --power micro --scale 1`.
2. Push the image (needs the `lightsailctl` plugin):
   `aws lightsail push-container-image --service-name study-hubs --label app --image study-hubs:<tag>`.
   Note the image name it prints (`:study-hubs.app.N`).
3. Write `containers.json` (values from [migration-overview.md → Environment](migration-overview.md#6-environment-on-the-new-platform)):
   ```json
   {
     "app": {
       "image": ":study-hubs.app.1",
       "ports": { "10000": "HTTP" },
       "environment": {
         "APP_ENV": "production",
         "PUBLIC_ORIGIN": "https://quiz.example.com",
         "STORE": "postgres",
         "DATABASE_URL": "postgresql://…",
         "AUTH_MODE": "firebase",
         "FIREBASE_PROJECT_ID": "<project id>",
         "FIREBASE_WEB_CONFIG": "{\"apiKey\":\"…\",\"authDomain\":\"…\",\"projectId\":\"…\",\"appId\":\"…\"}",
         "FIREBASE_SERVICE_ACCOUNT_B64": "…",
         "SECRET_KEY": "<same as Render>",
         "ADMIN_EMAILS": "you@example.com",
         "ADMIN_TZ": "Asia/Kolkata",
         "TRUSTED_PROXY_HOPS": "1"
       }
     }
   }
   ```
   and `endpoint.json`:
   ```json
   { "containerName": "app", "containerPort": 10000,
     "healthCheck": { "path": "/healthz", "intervalSeconds": 30, "healthyThreshold": 2, "unhealthyThreshold": 3 } }
   ```
4. Deploy: `aws lightsail create-container-service-deployment --service-name study-hubs --containers file://containers.json --public-endpoint file://endpoint.json`.
5. Wait for `ACTIVE` (`aws lightsail get-container-services --service-name study-hubs`), open the
   default `https://study-hubs.<id>.ap-southeast-1.cs.amazonlightsail.com/healthz`.
6. Custom domain: Lightsail console → the service → **Custom domains → Create certificate** for
   `quiz.example.com`, add the validation `CNAME` at your DNS provider, then attach the domain.
7. Delete `containers.json` from disk afterwards (it holds secrets), or keep it only in a password
   manager.

## Path 2: ECS on Fargate

1. **Network.** Use the default VPC to start. Create two security groups: `study-hubs-alb`
   (inbound 443 from anywhere) and `study-hubs-app` (inbound 10000 from `study-hubs-alb` only).
   For option C, a third, `study-hubs-db` (inbound 5432 from `study-hubs-app` only).
2. **Database (option C).** RDS console → **Create database → PostgreSQL**, template **Free tier**
   or the smallest burstable class, single-AZ to start, storage 20 GB with autoscaling, **Public
   access: No**, security group `study-hubs-db`, initial database `studyhubs`. Turn on automated
   backups (7 days). Or Aurora PostgreSQL (now on the Free Tier) if you prefer serverless capacity.
3. **Secrets.** Secrets Manager → **Store a new secret → Other type** for each of
   `study-hubs/database-url`, `study-hubs/secret-key`, `study-hubs/firebase-sa-b64`,
   `study-hubs/anthropic-api-key` (optional).
4. **Volume.** EFS → **Create file system** in the same VPC; allow NFS (2049) from `study-hubs-app`.
5. **Logs.** CloudWatch log group `/ecs/study-hubs`, retention 30 days.
6. **Task definition** (`taskdef.json`; register with `aws ecs register-task-definition --cli-input-json file://taskdef.json`):
   ```json
   {
     "family": "study-hubs",
     "requiresCompatibilities": ["FARGATE"],
     "networkMode": "awsvpc",
     "cpu": "512",
     "memory": "1024",
     "executionRoleArn": "arn:aws:iam::<account>:role/ecsTaskExecutionRole",
     "containerDefinitions": [{
       "name": "app",
       "image": "<account>.dkr.ecr.ap-southeast-1.amazonaws.com/study-hubs:<tag>",
       "portMappings": [{ "containerPort": 10000 }],
       "environment": [
         { "name": "APP_ENV", "value": "production" },
         { "name": "PUBLIC_ORIGIN", "value": "https://quiz.example.com" },
         { "name": "STORE", "value": "postgres" },
         { "name": "AUTH_MODE", "value": "firebase" },
         { "name": "FIREBASE_PROJECT_ID", "value": "<project id>" },
         { "name": "FIREBASE_WEB_CONFIG", "value": "{…}" },
         { "name": "ADMIN_EMAILS", "value": "you@example.com" },
         { "name": "ADMIN_TZ", "value": "Asia/Kolkata" },
         { "name": "DATA_DIR", "value": "/data" },
         { "name": "TRUSTED_PROXY_HOPS", "value": "1" }
       ],
       "secrets": [
         { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:<account>:secret:study-hubs/database-url" },
         { "name": "SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:<account>:secret:study-hubs/secret-key" },
         { "name": "FIREBASE_SERVICE_ACCOUNT_B64", "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:<account>:secret:study-hubs/firebase-sa-b64" }
       ],
       "mountPoints": [{ "sourceVolume": "data", "containerPath": "/data" }],
       "logConfiguration": { "logDriver": "awslogs", "options": {
         "awslogs-group": "/ecs/study-hubs", "awslogs-region": "ap-southeast-1", "awslogs-stream-prefix": "app" } }
     }],
     "volumes": [{ "name": "data", "efsVolumeConfiguration": { "fileSystemId": "fs-…", "transitEncryption": "ENABLED" } }]
   }
   ```
   The execution role needs `secretsmanager:GetSecretValue` on those three secrets. For option B
   (Firestore stays) drop `DATABASE_URL`, set `STORE=firestore`.
7. **Load balancer.** EC2 → **Load Balancers → Application**, internet-facing, security group
   `study-hubs-alb`, an HTTPS listener with an **ACM** certificate for `quiz.example.com`, target
   group type **IP**, port 10000, health check `/healthz`. Set the idle timeout to **60 s or more**
   (the quiz long-polls hold a request up to 20 s).
8. **Service.** ECS → cluster `study-hubs` (Fargate) → **Create service**: the task definition,
   **desired tasks 1**, **minimum healthy 0% / maximum 100%** (so a deploy never runs two copies at
   once), security group `study-hubs-app`, the target group above. No service autoscaling.
   (Amazon ECS **Express Mode**, AWS's suggested App Runner replacement, can create the service,
   load balancer and certificate in one step; keep desired count 1 there too.)
9. Open `https://<alb dns name>/healthz`, then point `quiz.example.com` at the load balancer.

## Deploy from GitHub Actions

Use GitHub's OIDC so no AWS keys are stored in GitHub:
1. IAM → **Identity providers → Add** `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
2. A role `study-hubs-deploy` trusted by that provider for
   `repo:sushantdurgekar/knowledege:ref:refs/heads/main`, allowed to push to the ECR repository and
   to update the Lightsail service or the ECS service.
3. Replace the `deploy` job's Render steps with:
   ```yaml
   permissions: { id-token: write, contents: read }
   steps:
     - uses: actions/checkout@v4
     - uses: aws-actions/configure-aws-credentials@v4
       with: { role-to-assume: arn:aws:iam::<account>:role/study-hubs-deploy, aws-region: ap-southeast-1 }
     - uses: aws-actions/amazon-ecr-login@v2
     - run: |
         IMAGE=<account>.dkr.ecr.ap-southeast-1.amazonaws.com/study-hubs:${GITHUB_SHA::7}
         docker build -f site/Dockerfile --build-arg GIT_COMMIT=$GITHUB_SHA -t $IMAGE .
         docker push $IMAGE
         # Path 2 (ECS): register a task definition revision with $IMAGE, then
         aws ecs update-service --cluster study-hubs --service study-hubs --task-definition study-hubs --force-new-deployment
   ```
   Keep the existing wait-for-`/api/version` and smoke-check steps unchanged.

## After the move

- Firebase: remove `Cloud Datastore User` from `study-hubs-server` (option C). Consider
  **Workload Identity Federation for AWS** (Google trusts the task's AWS role, so there is no key
  file); test account deletion after switching, since it calls Firebase Auth admin APIs.
- Alarms: CloudWatch alarm on the target group's unhealthy host count, and an AWS Budgets alert.
- Database backups: RDS automated backups are on; keep taking the site's own **Admin → Backup**
  monthly (it is portable between stores).
