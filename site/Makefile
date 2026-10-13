# Study Hubs site: local build, test and run. Run from anywhere:
#   make -C site help
#
# Order of a full build (build-contracts.md section 2): bridge -> client -> collector.
# Targets run one at a time (.NOTPARALLEL), so `make -j` cannot reorder them.

SHELL := /bin/sh
.DEFAULT_GOAL := help
.NOTPARALLEL:

SITE := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
ROOT := $(patsubst %/,%,$(dir $(SITE)))
VENV := $(SITE)/server/.venv
PYTHON ?= $(shell command -v python3.12 >/dev/null 2>&1 && echo python3.12 || echo python3)
PORT ?= 10000
BASE_URL ?= http://127.0.0.1:$(PORT)
APP_ENV ?= development
# make collect STRICT=1  -> fail on any rejected hub (CI and the Docker build do this)
STRICT ?=
NPM_CI := npm ci --no-audit --no-fund
# Firestore emulator for the store contract tests (site/firebase/firebase.json: 127.0.0.1:8080)
FIREBASE_TOOLS ?= 15.31.0
FIRESTORE_EMULATOR_HOST ?= 127.0.0.1:8080

.PHONY: help install build-bridge build-client collect build test test-bridge test-client \
        test-scripts test-server test-contract emulator lint serve e2e e2e-smoke docker clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install every dependency (npm ci x3, server venv with hash-locked dev requirements)
	cd $(SITE)/bridge && $(NPM_CI)
	cd $(SITE)/client && $(NPM_CI)
	cd $(SITE)/e2e && $(NPM_CI)
	test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --disable-pip-version-check -r $(SITE)/server/requirements-dev.txt

build-bridge: ## Build the bridge -> server/public/_sh/
	cd $(SITE)/bridge && npm run build

build-client: ## Build the React shell -> server/public/ (keeps _sh/)
	cd $(SITE)/client && npm run build

collect: ## Collect hubs from the vault -> build/  (STRICT=1 to fail on a rejected hub)
	cd $(ROOT) && node site/scripts/collect-hubs.mjs --src . --config site/hubs.config.json \
		--out site/build $(if $(STRICT),--strict)

build: build-bridge build-client collect ## Full build: bridge, client, collector

test-bridge: ## Bridge type-check + vitest
	cd $(SITE)/bridge && npm test

test-client: ## Client vitest
	cd $(SITE)/client && npm test

test-scripts: ## Collector / context-check tests (node --test)
	cd $(SITE)/scripts && npm test

test-server: ## Server ruff + pytest
	cd $(SITE)/server && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest

emulator: ## Firestore emulator on 127.0.0.1:8080, foreground (needs Java 21; Ctrl-C stops it)
	cd $(SITE)/firebase && npx --yes firebase-tools@$(FIREBASE_TOOLS) emulators:start --only firestore --project demo-studyhubs

test-contract: ## Store contract tests on memory + the Firestore emulator (run `make emulator` first)
	cd $(SITE)/server && FIRESTORE_EMULATOR_HOST=$(FIRESTORE_EMULATOR_HOST) .venv/bin/pytest tests/contract

lint: ## Type-check the e2e suite and lint the server
	cd $(SITE)/e2e && npm run typecheck
	cd $(SITE)/server && .venv/bin/ruff check . && .venv/bin/ruff format --check .

test: test-bridge test-client test-scripts test-server ## All unit tests (no browser, no server)

serve: ## Run the server with --reload on PORT (default 10000); build first
	cd $(SITE)/server && APP_ENV=$(APP_ENV) PUBLIC_ORIGIN=$(BASE_URL) \
		.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $(PORT) --reload --reload-dir app

e2e: ## Playwright suite; starts uvicorn unless BASE_URL already answers (ARGS="--grep @smoke")
	PORT=$(PORT) BASE_URL=$(BASE_URL) sh $(SITE)/scripts/dev-e2e.sh $(ARGS)

e2e-smoke: ## Fast subset of the e2e suite (@smoke)
	PORT=$(PORT) BASE_URL=$(BASE_URL) sh $(SITE)/scripts/dev-e2e.sh --grep @smoke

docker: ## Build the production image (needs a Docker daemon) and check its contents
	cd $(ROOT) && docker build -f site/Dockerfile -t study-hubs:local .
	bash $(SITE)/scripts/check-image.sh study-hubs:local

clean: ## Remove generated output and Playwright results (keeps node_modules and .venv)
	rm -rf $(SITE)/build $(SITE)/server/public
	rm -rf $(SITE)/e2e/test-results $(SITE)/e2e/playwright-report $(SITE)/e2e/blob-report $(SITE)/e2e/server.log
