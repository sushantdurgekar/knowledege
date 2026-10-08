---
title: "Qlik Sense: levels L1–L4"
track: technical
domain: bi-analytics
subject: qlik-sense
tags: [qlik-sense, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Qlik Sense: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Build a working Qlik Sense app from several sources with a clean data model, QVDs, master items, sheets and basic security.  
**Time:** about 45–60 hours · **Certification:** Qlik Sense Business Analyst Qualification; Data Literacy Qualification (optional) · **Hub:** `hubs/qlik-sense-l1-foundation-hub.html`

### L1-01 Qlik ecosystem
- [ ] Qlik Sense
- [ ] Qlik Cloud Analytics
- [ ] Qlik Talend Cloud
- [ ] SaaS vs client-managed
- [ ] product positioning

### L1-02 Architecture basics
- [ ] Associative engine
- [ ] in-memory analytics
- [ ] selection states (green, white, grey, plus alternative and excluded)
- [ ] self-service BI

### L1-03 Navigation
- [ ] Hub/activity centres
- [ ] personal, shared and managed spaces (Qlik Cloud)
- [ ] streams (client-managed)
- [ ] sheets
- [ ] stories
- [ ] bookmarks

### L1-04 Data connectivity
- [ ] Excel
- [ ] CSV/text
- [ ] databases (ODBC/native)
- [ ] REST connector
- [ ] ⚠ SAP sources (licensed connector
- [ ] better at L2)

### L1-05 Data manager
- [ ] Profiling and preview
- [ ] relationships
- [ ] metadata
- [ ] associations

### L1-06 Data load editor
- [ ] LOAD/SELECT and syntax
- [ ] join, concatenate, resident and preceding load, incremental load basics
- [ ] sections and variables
- [ ] preview and reload
- [ ] debugging
- [ ] script history

### L1-07 Data modelling
- [ ] Associative model
- [ ] synthetic keys and circular references
- [ ] star and snowflake (owned by sql L2-03)
- [ ] link tables and canonical models
- [ ] data model viewer

### L1-08 QVD fundamentals
- [ ] STORE
- [ ] reading QVDs
- [ ] optimised vs standard loads
- [ ] QVD storage layers

### L1-09 Dashboard development
- [ ] KPI objects
- [ ] charts
- [ ] filter panes
- [ ] responsive design

### L1-10 Expressions
- [ ] Aggregations
- [ ] conditional logic
- [ ] variables
- [ ] basic set analysis

### L1-11 Master items
- [ ] Measures
- [ ] dimensions
- [ ] visualisations
- [ ] master objects

### L1-12 Security basics
- [ ] Section access for data reduction
- [ ] sheet and object restriction

### L1-13 Alerting and notifications
- [ ] Data alerts
- [ ] thresholds
- [ ] conditions
- [ ] subscriptions (Qlik Cloud)

### L1-14 Automation
- [ ] Qlik Automate (formerly Application Automation) basics
- [ ] no-code workflows
- [ ] connectors

### L1-15 ⚠ Qualification, not certification
- [ ] Qlik Sense Business Analyst Qualification (build an app + MCQ, 1h15). Framework lists the Data Architect *certificate* here
- [ ] see audit

**Capstone.** **Fruit-market app:** load 4 sources (Excel, CSV, a DB, a REST API) through a QVD layer, fix a synthetic key, build 3 sheets with master items, set analysis KPIs and section access.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Independently design and deliver Qlik solutions, troubleshoot reloads and models, and coach L1 developers.  
**Time:** about 60–80 hours · **Certification:** Qlik Sense Business Analyst Certification; Qlik Sense Data Architect Certification · **Hub:** `hubs/qlik-sense-l2-proficient-hub.html`

### L2-01 Independent development
- [ ] Gather requirements
- [ ] design the data model
- [ ] build complete apps
- [ ] document them

### L2-01.a Advanced scripting
- [ ] Mapping loads and ApplyMap
- [ ] incremental load with deletes/updates
- [ ] IntervalMatch
- [ ] generic loads
- [ ] crosstable
- [ ] subroutines and include files

### L2-01.b Advanced expressions
- [ ] Set analysis with modifiers, P()/E(), indirect sets
- [ ] Aggr()
- [ ] alternate states
- [ ] dollar-sign expansion

### L2-01.c App performance
- [ ] Data model optimisation
- [ ] AutoNumber
- [ ] field cardinality
- [ ] calculation conditions
- [ ] App Analyzer

### L2-02 Additional technical skills
- [ ] Visualisation bundle and dashboard bundle
- [ ] on-demand app generation
- [ ] Qlik Cloud reporting (tabular/PixelPerfect)

### L2-03 Training and troubleshooting
- [ ] Debugging reload failures
- [ ] reviewing an L1 app
- [ ] teaching L1 topics

### L2-04 Business Analyst certification
- [ ] Exam domains: identify requirements, design application, prepare and load data, develop application

### L2-05 Data Architect certification
- [ ] Exam domains: identify requirements 20%, data connectivity 8%, data model design 28%, data transformations 38%, validation 6%

**Capstone.** **Multi-fact supply-chain app:** link-table model for sales + purchases + stock, incremental QVD pipeline, alternate-state comparisons and an App Analyzer performance report.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design, deploy and administer Qlik solutions, extend Qlik with code and AI, and lead delivery.  
**Time:** about 70–90 hours · **Certification:** Qlik AI Specialist; (System Administrator: verify) · **Hub:** `hubs/qlik-sense-l3-specialist-hub.html`

### L3-01 Business context and solution articulation
- [ ] Translate requirements into architecture
- [ ] demo design
- [ ] client workshops

### L3-02 Deploy and administer
- [ ] Qlik Cloud tenant admin (spaces, roles, IdP, licences)
- [ ] client-managed QMC (streams, security rules, tasks)
- [ ] monitoring apps

### L3-02.a Multi-tenant and APIs
- [ ] Qlik Cloud REST APIs
- [ ] qlik-cli
- [ ] OEM/multi-tenant patterns (see docs/multi-tenant-diagrams)

### L3-02.b Extensions and embedding
- [ ] Extensions
- [ ] nebula.js and enigma.js
- [ ] qlik-embed
- [ ] mashups (see examples/)

### L3-02.c Qlik AI
- [ ] Qlik Answers
- [ ] Qlik Predict (AutoML)
- [ ] insight advisor
- [ ] Qlik AI Specialist exam scope

### L3-03 ⚠ System Administrator certificate
- [ ] Not in Qlik's current certification list (2025): verify before planning
- [ ] use L3-02 skills instead

### L3-04 Project leadership
- [ ] Team set-up
- [ ] task assignment
- [ ] mentoring developers
- [ ] code reviews
- [ ] project asset creation

### L3-05 Estimation and delivery
- [ ] Estimation methods
- [ ] delivery plans
- [ ] risk management

**Capstone.** **Embedded analytics portal:** nebula.js mashup over a Qlik Cloud tenant with automation-driven reloads, a Qlik Answers assistant and an admin runbook.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Lead the Qlik practice: people, accelerators, standards, client impact and thought leadership.  
**Time:** about 40–60 hours · **Certification:** No higher Qlik certification; evidence = accelerators, talks, client outcomes · **Hub:** `hubs/qlik-sense-l4-expert-hub.html`

### L4-01 Practice and people development
- [ ] People handling
- [ ] reusable accelerators and frameworks
- [ ] templates and standards

### L4-02 Client and business impact
- [ ] Right-tool advisory (Qlik vs Power BI vs ThoughtSpot)
- [ ] cost and licensing
- [ ] migrations (QlikView → Qlik Sense → Qlik Cloud)

### L4-03 Thought leadership
- [ ] Community answers
- [ ] conference talks
- [ ] whitepapers

### L4-04 Executive engagement
- [ ] Value storytelling
- [ ] roadmap conversations
- [ ] governance with data owners

**Capstone.** **Qlik accelerator pack:** QVD-layer script framework, master-item library, naming standards, deployment checklist and a migration assessment template.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
