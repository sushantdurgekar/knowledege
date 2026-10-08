---
title: "Power BI: levels L1–L4"
track: technical
domain: bi-analytics
subject: power-bi
tags: [power-bi, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Power BI: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Connect to data, clean it, build a simple model and publish an interactive report.  
**Time:** about 30–40 hours · **Certification:** None at L1; start the PL-300 learning path (Microsoft Learn) · **Hub:** `hubs/power-bi-l1-foundation-hub.html`

### L1-01 The Power BI ecosystem
- [ ] Desktop, Service, mobile
- [ ] Fabric
- [ ] licences (Free, Pro, PPU, Fabric capacity) at a glance

### L1-02 Get data
- [ ] Excel, CSV, SQL Server, web
- [ ] import vs DirectQuery (first look)
- [ ] refresh basics

### L1-03 Power Query basics
- [ ] Applied steps
- [ ] data types
- [ ] remove/rename/split columns
- [ ] filter rows
- [ ] merge and append

### L1-04 First data model
- [ ] Tables and relationships
- [ ] one-to-many
- [ ] a date table
- [ ] hiding technical columns

### L1-05 First DAX
- [ ] Measures vs calculated columns
- [ ] SUM, COUNTROWS, DIVIDE, AVERAGE
- [ ] implicit vs explicit measures

### L1-06 Visuals
- [ ] Choosing charts
- [ ] cards, tables, matrix, bar/line
- [ ] slicers
- [ ] interactions

### L1-07 Publish and share
- [ ] Publish to a workspace
- [ ] dashboards vs reports
- [ ] sharing basics

**Capstone.** **Lemonade stand report:** clean a messy Excel sales file, build a 3-table model with a date table, 6 measures and a 2-page report published to the service.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Deliver a correct, well-modelled, secure Power BI solution end to end, ready for PL-300.  
**Time:** about 60–80 hours · **Certification:** PL-300: Microsoft Power BI Data Analyst · **Hub:** `hubs/power-bi-l2-proficient-hub.html`

### L2-01 Profile and clean (PL-300 D1)
- [ ] Column quality/distribution/profile
- [ ] errors and nulls
- [ ] query folding
- [ ] parameters

### L2-02 Transform and load (PL-300 D1)
- [ ] Unpivot/pivot
- [ ] group by
- [ ] custom columns in M
- [ ] reference vs duplicate queries
- [ ] dataflows awareness

### L2-03 Model design (PL-300 D2)
- [ ] Star schema (owned by sql L2-03)
- [ ] cardinality and cross-filter direction
- [ ] role-playing dimensions
- [ ] hierarchies

### L2-04 DAX core (PL-300 D2)
- [ ] Row vs filter context
- [ ] CALCULATE
- [ ] FILTER/ALL/REMOVEFILTERS
- [ ] iterators (SUMX)
- [ ] time intelligence

### L2-05 Optimise the model (PL-300 D2)
- [ ] Remove unused columns
- [ ] data types
- [ ] Performance Analyzer
- [ ] reducing cardinality

### L2-06 Reports and storytelling (PL-300 D3)
- [ ] Layout
- [ ] bookmarks
- [ ] drill-through
- [ ] tooltips
- [ ] conditional formatting
- [ ] accessibility
- [ ] mobile layout

### L2-07 Analyse (PL-300 D3)
- [ ] Analytics pane
- [ ] Q&A and Copilot features
- [ ] decomposition tree
- [ ] key influencers
- [ ] anomaly detection

### L2-08 Workspaces and assets (PL-300 D4)
- [ ] Workspaces and roles
- [ ] apps
- [ ] semantic model refresh
- [ ] gateways
- [ ] endorsement

### L2-09 Secure and govern (PL-300 D4)
- [ ] Row-level security (static and dynamic)
- [ ] sensitivity labels
- [ ] sharing and permissions

**Capstone.** **Fruit-chain sales app:** end-to-end solution from SQL (sql L2 data mart) with RLS by region, time-intelligence measures, drill-through and an app for 3 audiences.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design enterprise semantic models, tune performance and implement Fabric-based analytics (DP-600 scope).  
**Time:** about 70–90 hours · **Certification:** DP-600: Fabric Analytics Engineer Associate · **Hub:** `hubs/power-bi-l3-specialist-hub.html`

### L3-01 Advanced DAX
- [ ] Context transition
- [ ] variables
- [ ] table functions
- [ ] calculation groups
- [ ] visual calculations
- [ ] DAX query view

### L3-02 Performance engineering
- [ ] VertiPaq and storage engine vs formula engine
- [ ] DAX Studio
- [ ] aggregations
- [ ] incremental refresh

### L3-03 Storage modes
- [ ] Import, DirectQuery, Dual, composite models
- [ ] Direct Lake on Fabric

### L3-04 Source control and deployment
- [ ] PBIP/PBIR and TMDL
- [ ] Git integration
- [ ] deployment pipelines
- [ ] Tabular Editor

### L3-05 Fabric: prepare data (DP-600)
- [ ] Lakehouse and warehouse
- [ ] Dataflows Gen2
- [ ] notebooks
- [ ] pipelines
- [ ] shortcuts

### L3-06 Fabric: semantic models (DP-600)
- [ ] Large models
- [ ] XMLA endpoint
- [ ] RLS/OLS at scale
- [ ] refresh strategy

### L3-07 Maintain the solution (DP-600)
- [ ] Workspace governance
- [ ] capacity monitoring
- [ ] lineage and impact analysis

**Capstone.** **Fabric lakehouse to Direct Lake model:** ingest fruit-supplier data with pipelines, build a governed semantic model with calc groups, Git + deployment pipeline, performance report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Lead Power BI/Fabric platforms: governance, CoE, embedding, AI and client advisory.  
**Time:** about 50–70 hours · **Certification:** Optional: DP-700 Fabric Data Engineer (verify status) · **Hub:** `hubs/power-bi-l4-expert-hub.html`

### L4-01 Tenant administration and governance
- [ ] Admin portal and tenant settings
- [ ] capacities
- [ ] licensing strategy
- [ ] monitoring

### L4-02 Centre of Excellence
- [ ] Standards, templates, certification process, training paths
- [ ] adoption roadmap

### L4-03 Embedding and automation
- [ ] Power BI Embedded
- [ ] REST APIs
- [ ] semantic link (Python)
- [ ] automation

### L4-04 AI in Power BI
- [ ] Copilot
- [ ] data agents in Fabric
- [ ] preparing models for AI

### L4-05 Advisory
- [ ] Right-tool advice (Power BI vs Qlik vs ThoughtSpot)
- [ ] cost and licensing
- [ ] executive storytelling

**Capstone.** **Power BI CoE kit:** template .pbip, naming/DAX standards, governance checklist, deployment pipeline blueprint and a 30-minute exec briefing.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.
