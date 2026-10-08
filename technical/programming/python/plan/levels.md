---
title: "Python: levels L1–L4"
track: technical
domain: programming
subject: python
tags: [python, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Python: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Write, run and debug small Python scripts and command-line tools on your own, using the standard library and Git.  
**Time:** about 45–60 hours · **Certification:** PCEP (Python Institute, entry level) · **Hub:** `hubs/python-l1-foundation-hub.html`

### L1-01 Set-up and tooling
- [ ] Install Python 3.14+ and VS Code
- [ ] run scripts and the REPL
- [ ] venv and pip (or uv)
- [ ] read a traceback

### L1-02 Git and the command line
- [ ] Navigate folders in a terminal
- [ ] git init/add/commit/branch/merge
- [ ] push to GitHub
- [ ] write a .gitignore

### L1-03 Values, types and variables
- [ ] int, float, str, bool, None
- [ ] dynamic typing
- [ ] type conversion
- [ ] f-strings
- [ ] input/print

### L1-04 Operators and expressions
- [ ] Arithmetic, comparison, logical and membership operators
- [ ] precedence
- [ ] integer vs float division

### L1-05 Control flow
- [ ] if/elif/else
- [ ] for and while loops
- [ ] range
- [ ] break/continue/else on loops
- [ ] match-case

### L1-06 Collections
- [ ] Lists, tuples, dicts, sets
- [ ] indexing and slicing
- [ ] mutability
- [ ] common methods
- [ ] nested data

### L1-07 Functions
- [ ] def, parameters, defaults, *args/**kwargs, return
- [ ] scope (LEGB)
- [ ] docstrings
- [ ] small pure functions

### L1-08 Strings and text
- [ ] String methods
- [ ] formatting
- [ ] splitting/joining
- [ ] basic regex awareness

### L1-09 Errors and exceptions
- [ ] try/except/else/finally
- [ ] common built-in exceptions
- [ ] raising errors
- [ ] reading tracebacks

### L1-10 Files and modules
- [ ] open/with
- [ ] reading and writing text, CSV and JSON
- [ ] import
- [ ] using the standard library

**Capstone.** **Pantry tracker CLI:** add, list and search pantry items (apples, oranges…) saved to JSON, with input validation and a README. Pushed to GitHub.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Build and test real applications (web APIs, scripts that call services, data analysis) independently, and review a beginner's code.  
**Time:** about 70–90 hours · **Certification:** PCAP (Python Institute, associate) · **Hub:** `hubs/python-l2-proficient-hub.html`

### L2-01 Object-oriented Python
- [ ] Classes, instances, attributes
- [ ] methods, classmethod/staticmethod
- [ ] inheritance and super()
- [ ] dunder methods
- [ ] properties

### L2-02 Iteration in depth
- [ ] Comprehensions
- [ ] iterators and the iterator protocol
- [ ] generators and yield
- [ ] itertools basics

### L2-03 Functions in depth
- [ ] First-class functions
- [ ] closures
- [ ] lambda
- [ ] decorators
- [ ] functools (partial, lru_cache, wraps)

### L2-04 Modules and packages
- [ ] Package layout
- [ ] __init__.py
- [ ] absolute vs relative imports
- [ ] __name__ == '__main__'
- [ ] pyproject basics

### L2-05 Standard library tour
- [ ] pathlib, datetime/zoneinfo, json, csv, re, logging, collections, argparse, sqlite3

### L2-06 Type hints
- [ ] Annotations
- [ ] Optional and unions
- [ ] generics basics
- [ ] dataclasses
- [ ] running mypy or pyright

### L2-07 Testing
- [ ] pytest tests, fixtures and parametrize
- [ ] arrange-act-assert
- [ ] mocking
- [ ] coverage

### L2-08 Working with the web
- [ ] requests/httpx
- [ ] calling REST APIs
- [ ] JSON handling
- [ ] scraping basics
- [ ] Flask routes, templates and forms

### L2-09 Data with Python
- [ ] pandas DataFrames: load, clean, group and join
- [ ] NumPy arrays
- [ ] matplotlib/plotly charts

### L2-10 Databases from Python
- [ ] sqlite3 and SQLAlchemy basics
- [ ] parameterised queries
- [ ] migrations awareness

**Capstone.** **Fruit-shop web app:** Flask (or FastAPI) app with a SQLite database, login, a REST endpoint, pytest suite and a pandas sales report.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design maintainable, fast, concurrent Python services; set code standards and mentor others.  
**Time:** about 80–100 hours · **Certification:** PCPP1 (Python Institute, professional level 1) · **Hub:** `hubs/python-l3-specialist-hub.html`

### L3-01 Advanced OOP
- [ ] Abstract base classes and protocols
- [ ] composition vs inheritance
- [ ] MRO
- [ ] descriptors
- [ ] __slots__
- [ ] metaclass awareness

### L3-02 Design patterns and principles
- [ ] SOLID in Python
- [ ] factory, strategy, observer, adapter
- [ ] dependency injection
- [ ] PEP 8 and PEP 257

### L3-03 Concurrency
- [ ] Threads vs processes vs asyncio
- [ ] the GIL and free-threaded builds
- [ ] concurrent.futures
- [ ] async/await
- [ ] choosing a model

### L3-04 Performance
- [ ] Profiling (cProfile, py-spy)
- [ ] algorithmic fixes first
- [ ] caching
- [ ] vectorising with NumPy
- [ ] when to drop to C, Cython or Rust

### L3-05 APIs with FastAPI
- [ ] Pydantic models
- [ ] dependency injection
- [ ] async endpoints
- [ ] auth
- [ ] OpenAPI docs
- [ ] background tasks

### L3-06 Packaging and delivery
- [ ] pyproject.toml
- [ ] uv/pip-tools lock files
- [ ] building wheels
- [ ] versioning
- [ ] CI with GitHub Actions
- [ ] Docker image (see docker)

### L3-07 Files, networking and GUIs (PCPP1 scope)
- [ ] XML/CSV/logging/config files
- [ ] sockets and HTTP clients
- [ ] tkinter basics

### L3-08 Code quality at team scale
- [ ] ruff, mypy, pre-commit
- [ ] code review checklist
- [ ] documentation with mkdocs
- [ ] error-handling strategy

**Capstone.** **Order service:** async FastAPI service with Postgres, typed models, 90% test coverage, profiling report, Docker image and CI pipeline.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Shape how teams use Python: internals, library and API design, packaging strategy, and standards that others follow.  
**Time:** about 60–90 (plus ongoing practice) hours · **Certification:** PCPP2 (Python Institute, professional level 2) · **Hub:** `hubs/python-l4-expert-hub.html`

### L4-01 CPython internals
- [ ] Bytecode and the eval loop
- [ ] memory management and garbage collection
- [ ] the GIL and free-threading
- [ ] the import system

### L4-02 Library and API design
- [ ] Public API surface
- [ ] backwards compatibility and deprecation
- [ ] semantic versioning
- [ ] publishing to PyPI

### L4-03 Extending Python
- [ ] C API awareness
- [ ] Cython
- [ ] Rust via PyO3/maturin
- [ ] when native code is worth it

### L4-04 Testing and design at scale (PCPP2 scope)
- [ ] Test strategy
- [ ] property-based testing (hypothesis)
- [ ] design patterns
- [ ] inter-process communication
- [ ] networking

### L4-05 Typing at scale
- [ ] Generics, TypeVar/ParamSpec, Protocols
- [ ] strict mypy/pyright adoption plans

### L4-06 Engineering leadership in Python
- [ ] Team standards and templates
- [ ] reusable accelerators
- [ ] mentoring plan
- [ ] tech talks (links softskills/leadership)

**Capstone.** **Open-source package:** design, document, test and publish a small library to PyPI (e.g. a recipe-unit converter) with CI, typed API, changelog and contributor guide.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.
