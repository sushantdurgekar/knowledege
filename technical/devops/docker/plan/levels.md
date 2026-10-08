---
title: "Docker & Containers: levels L1–L4"
track: technical
domain: devops
subject: docker
tags: [docker, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Docker & Containers: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Containerise a simple app, run it with ports and volumes, and use Compose for an app plus database.  
**Time:** about 20–30 hours · **Certification:** None at L1 · **Hub:** `hubs/docker-l1-foundation-hub.html`

### L1-01 Why containers
- [ ] Containers vs VMs
- [ ] images vs containers
- [ ] Docker Desktop/Engine
- [ ] registries

### L1-02 Running containers
- [ ] run, ps, logs, exec, stop, rm
- [ ] ports
- [ ] environment variables

### L1-03 Writing Dockerfiles
- [ ] FROM, WORKDIR, COPY, RUN, CMD/ENTRYPOINT
- [ ] build and tag
- [ ] layers

### L1-04 Data
- [ ] Volumes vs bind mounts
- [ ] persistence

### L1-05 Compose basics
- [ ] compose.yaml
- [ ] services
- [ ] depends_on
- [ ] up/down
- [ ] networks by default

**Capstone.** **Containerise the fruit-shop API:** Dockerfile for the python L2 or nodejs L1 project, Compose with Postgres, data kept in a volume.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Build small, fast, secure images and run multi-service stacks in CI.  
**Time:** about 35–50 hours · **Certification:** Docker Certified Associate (DCA), now run by Mirantis (verify current availability and price) · **Hub:** `hubs/docker-l2-proficient-hub.html`

### L2-01 Image optimisation
- [ ] Multi-stage builds
- [ ] layer caching
- [ ] .dockerignore
- [ ] slim and distroless bases

### L2-02 Networking
- [ ] Bridge networks
- [ ] service discovery by name
- [ ] published vs exposed ports

### L2-03 Compose in depth
- [ ] Profiles
- [ ] healthchecks
- [ ] env files
- [ ] secrets
- [ ] overrides
- [ ] watch mode

### L2-04 Security basics
- [ ] Non-root users
- [ ] image scanning (Docker Scout/Trivy)
- [ ] pinning digests
- [ ] secrets hygiene

### L2-05 Registries and CI
- [ ] Docker Hub/GHCR/ACR
- [ ] tagging strategy
- [ ] GitHub Actions build and push
- [ ] buildx cache

### L2-06 Debugging containers
- [ ] Logs
- [ ] inspect
- [ ] exec
- [ ] resource limits
- [ ] common failures

**Capstone.** **Full-stack stack in CI:** React + API + Postgres + Redis in Compose with healthchecks; multi-stage images under a size budget; GitHub Actions builds, scans and pushes.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Run containers on Kubernetes with good security, packaging and observability.  
**Time:** about 60–80 hours · **Certification:** KCNA (Kubernetes and Cloud Native Associate); CKAD (Certified Kubernetes Application Developer) · **Hub:** `hubs/docker-l3-specialist-hub.html`

### L3-01 Advanced builds
- [ ] BuildKit
- [ ] buildx multi-arch
- [ ] build secrets
- [ ] reproducible builds

### L3-02 Hardening
- [ ] Rootless
- [ ] read-only filesystems
- [ ] capabilities
- [ ] seccomp
- [ ] SBOMs and signing (cosign)

### L3-03 Kubernetes fundamentals
- [ ] Pods, Deployments, Services, ConfigMaps, Secrets
- [ ] kubectl
- [ ] kind/minikube

### L3-04 Kubernetes in practice
- [ ] Ingress
- [ ] probes
- [ ] resources and autoscaling
- [ ] rolling updates
- [ ] namespaces

### L3-05 Packaging
- [ ] Helm charts
- [ ] Kustomize

### L3-06 Observability
- [ ] Container logs/metrics
- [ ] Prometheus and Grafana basics

**Capstone.** **Deploy to Kubernetes:** Helm chart for the full-stack app on kind, with ingress, HPA, probes, signed images and a Grafana dashboard.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Design container platforms and delivery pipelines for teams.  
**Time:** about 60–80 hours · **Certification:** CKA (Certified Kubernetes Administrator); CKS (Certified Kubernetes Security Specialist) · **Hub:** `hubs/docker-l4-expert-hub.html`

### L4-01 Platform engineering
- [ ] Internal developer platforms
- [ ] golden paths
- [ ] templates

### L4-02 GitOps and delivery
- [ ] Argo CD/Flux
- [ ] progressive delivery (canary, blue-green)

### L4-03 Supply-chain security
- [ ] SLSA levels
- [ ] provenance
- [ ] admission policies
- [ ] vulnerability management

### L4-04 Operating Kubernetes
- [ ] Cluster architecture
- [ ] upgrades
- [ ] multi-tenancy
- [ ] cost management

### L4-05 Practice leadership
- [ ] Standards, reviews and enablement for dev teams

**Capstone.** **Golden-path template:** repo template + pipeline + GitOps deployment that takes a new service to a cluster in under 30 minutes, with policies and docs.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.
