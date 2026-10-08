---
title: "SQL & Databases: levels L1–L4"
track: technical
domain: databases
subject: sql
tags: [sql, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# SQL & Databases: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Answer business questions with correct SELECT queries over joined tables, and create simple tables safely.  
**Time:** about 30–40 hours · **Certification:** None required; LeetCode 'SQL 50' as a practice milestone · **Hub:** `hubs/sql-l1-foundation-hub.html`

### L1-01 Relational basics
- [ ] Tables, rows, columns
- [ ] primary and foreign keys
- [ ] NULL
- [ ] data types
- [ ] install PostgreSQL and a client (psql, DBeaver or VS Code)

### L1-02 Reading data
- [ ] SELECT, WHERE, ORDER BY, LIMIT/TOP
- [ ] DISTINCT
- [ ] LIKE
- [ ] IN
- [ ] BETWEEN
- [ ] NULL handling

### L1-03 Aggregation
- [ ] COUNT/SUM/AVG/MIN/MAX
- [ ] GROUP BY
- [ ] HAVING
- [ ] WHERE vs HAVING

### L1-04 Joins
- [ ] INNER, LEFT, RIGHT, FULL
- [ ] self join
- [ ] join keys and the many-to-many trap

### L1-05 Subqueries and CASE
- [ ] Scalar, IN and EXISTS subqueries
- [ ] CASE expressions
- [ ] COALESCE

### L1-06 Changing data
- [ ] INSERT, UPDATE, DELETE
- [ ] transactions with BEGIN/COMMIT/ROLLBACK
- [ ] the WHERE-clause safety habit

### L1-07 Creating tables
- [ ] CREATE TABLE
- [ ] constraints (PK, FK, UNIQUE, CHECK, NOT NULL)
- [ ] ALTER
- [ ] DROP

**Capstone.** **Fruit-stall database:** design 4 tables (stalls, fruit, sales, customers), load sample data, answer 25 business questions in SQL.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Model a database or data mart from requirements and write advanced analytical SQL others can trust.  
**Time:** about 50–70 hours · **Certification:** Oracle Database SQL Certified Associate 1Z0-071 (optional; verify) · **Hub:** `hubs/sql-l2-proficient-hub.html`

### L2-01 Normalisation
- [ ] 1NF–3NF and BCNF
- [ ] anomalies
- [ ] when to denormalise

### L2-02 ER modelling
- [ ] Entities, relationships, cardinality
- [ ] ER diagrams
- [ ] naming conventions

### L2-03 Dimensional modelling
- [ ] Facts and dimensions
- [ ] grain
- [ ] star vs snowflake
- [ ] conformed dimensions
- [ ] slowly changing dimensions (types 1 and 2)

### L2-04 Window functions
- [ ] ROW_NUMBER, RANK, DENSE_RANK
- [ ] LAG/LEAD
- [ ] running totals
- [ ] PARTITION BY and frames

### L2-05 CTEs and set operations
- [ ] WITH
- [ ] recursive CTEs (hierarchies)
- [ ] UNION/INTERSECT/EXCEPT

### L2-06 Views and routines
- [ ] Views and materialised views
- [ ] functions and stored procedures
- [ ] triggers awareness

### L2-07 Indexes basics
- [ ] B-tree index
- [ ] composite index column order
- [ ] covering index
- [ ] when indexes hurt

### L2-08 Transactions and ACID
- [ ] Atomicity, consistency, isolation, durability
- [ ] autocommit
- [ ] deadlocks awareness

### L2-09 T-SQL differences
- [ ] TOP, IDENTITY, MERGE, date functions
- [ ] SQL Server/Azure SQL tooling (needed for Power BI and DP-800)

**Capstone.** **Sales data mart:** star schema with an SCD2 customer dimension, load scripts, and 15 analytical queries (window functions, CTEs) feeding a Power BI or Qlik report.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Diagnose and fix slow queries, design secure and highly available databases, and add AI features (vectors, RAG) in SQL.  
**Time:** about 70–90 hours · **Certification:** Microsoft DP-800: SQL AI Developer Associate · **Hub:** `hubs/sql-l3-specialist-hub.html`

### L3-01 Query plans and tuning
- [ ] EXPLAIN/ANALYZE
- [ ] scans vs seeks
- [ ] join algorithms
- [ ] statistics
- [ ] rewriting queries
- [ ] parameter sniffing

### L3-02 Index design
- [ ] Hash, GIN/GiST, filtered/partial, columnstore
- [ ] index maintenance
- [ ] write cost

### L3-03 Concurrency control
- [ ] Isolation levels and anomalies
- [ ] locking
- [ ] MVCC
- [ ] optimistic vs pessimistic

### L3-04 Partitioning and scale
- [ ] Table partitioning
- [ ] read replicas
- [ ] connection pooling
- [ ] caching (links system-design)

### L3-05 Security
- [ ] Roles and grants
- [ ] row-level security
- [ ] column masking
- [ ] encryption at rest and in transit
- [ ] SQL injection prevention

### L3-06 Operations
- [ ] Backup/restore, PITR
- [ ] high availability
- [ ] monitoring
- [ ] migrations in CI (SQL Database Projects / Flyway)

### L3-07 Semi-structured and search
- [ ] JSON columns
- [ ] full-text search
- [ ] pgvector / SQL Server vector types
- [ ] embeddings and hybrid search

### L3-08 AI-enabled database solutions
- [ ] Calling models from SQL
- [ ] RAG over SQL data
- [ ] AI-assisted SQL development (DP-800 scope)

### L3-09 Beyond relational
- [ ] Document, key-value, wide-column and graph stores
- [ ] choosing by access pattern

**Capstone.** **Tuned order system + 'ask the database' RAG:** load 10M rows, tune 5 slow queries with before/after plans, add RLS, and a vector search endpoint.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Set database architecture and standards: internals-level trade-offs, platform choices, governance and team practice.  
**Time:** about 60–80 hours · **Certification:** Optional: DP-300 Azure Database Administrator (verify status) · **Hub:** `hubs/sql-l4-expert-hub.html`

### L4-01 Storage engine internals
- [ ] Pages, B-trees, LSM trees, WAL, checkpoints, buffer pool, vacuum/compaction

### L4-02 Distributed databases
- [ ] Replication models, consensus-backed stores, NewSQL
- [ ] sharding strategies (with system-design)

### L4-03 Data platform architecture
- [ ] OLTP vs OLAP
- [ ] lakehouse
- [ ] CDC
- [ ] Microsoft Fabric/Synapse and Databricks awareness

### L4-04 Governance
- [ ] Data catalog, lineage, retention, privacy (GDPR/DPDP), audit

### L4-05 Practice leadership
- [ ] Database standards, review checklists, migration playbooks, mentoring (links softskills/leadership)

**Capstone.** **Database architecture review:** write an architecture decision record set for a multi-tenant SaaS (tenancy model, HA/DR, cost) and a team SQL standards guide.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.
