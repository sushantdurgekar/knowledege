---
title: Claude works
track: technical
updated: 2026-10-23
---
# Claude works

Claude's own instruction material for building pages, artifacts, dashboards, docs, decks, designs and Cowork plugins, copied on 2026-10-23 for study. Anthropic wrote all of it and delivered it to this machine or to this claude.ai account. None of it is the account owner's own content.

## Start here
- **How Claude Code publishes a page:** `claude-ai/artifact-tool/tool-definitions/Artifact.md`, then `claude-ai/artifact-tool/quickstart/other.md`, which holds the page contract and the `artifact-design` text.
- **How Claude builds a dashboard:** `claude-ai/artifact-types/dashboard/SKILL.md` and the files beside it.
- **Charts and diagrams:** `claude-code/bundled-skills/dataviz/`, `claude-code/bundled-skills/artifact-diagramming/`, and the Claude Docs guides `charts.md`, `chart-definition.md` and `diagram.md` in `claude-ai/connectors/claude-docs/guide/`.
- **What a published page can do while it runs** (shared database, comments, asking Claude, connectors, downloads): `claude-code/bundled-skills/artifact-capabilities/`, the skill text plus the TypeScript definitions for runtime contracts 0.2.47 and 0.2.89.

## What's in this folder
| Folder | Holds | Copied from | Files |
|---|---|---|---|
| `claude-code/plugins-official/` | Anthropic's official plugin marketplace: plugins with their skills, agents and commands | `~/.claude/plugins/marketplaces/claude-plugins-official/` | 577 |
| `claude-code/synced-skills/` | Skills synced from the claude.ai account (docx, pptx, xlsx, pdf, docs, deep-research, skill-creator and others) | `~/.claude/skills/synced/<org>/` | 245 |
| `claude-code/bundled-skills/` | Skills built into Claude Code: artifact-capabilities, artifact-design, artifact-diagramming, claude-api, claude-in-chrome, dataviz, plugin-authoring | Skill text from the session log; files from `%TEMP%\claude\bundled-skills\2.1.299\` | 142 |
| `claude-desktop/cowork/skills-plugin/` | The 18 skills Claude Desktop's Cowork mode loads, among them consolidate-memory, explain-usage, setup-claude and setup-cowork | Claude Desktop data folder, `local-agent-mode-sessions/skills-plugin/` | 249 |
| `claude-desktop/cowork/plugins/` | `cowork-plugin-management` v0.2.2, Anthropic's plugin for creating and customizing Cowork plugins | Claude Desktop data folder | 10 |
| `claude-ai/artifact-types/` | The core Artifact types: Dashboard, Design, Design System, Motion and Slides in full, and the Docs type's `SKILL.md` | claude.ai, through the Artifact tool | 84 |
| `claude-ai/artifact-tool/` | The Artifact tool family's definitions, and the tool's quickstart answer for each intent | This Claude Code session | 8 |
| `claude-ai/connectors/claude-docs/` | The Claude Docs connector's guide topics | The connector's `guide` tool | 10 |
| `web-sources.md` | Outside write-ups on the same subject, links only | | 1 |

## Versions
- Claude Code 2.1.299 for the bundled skills and the tool definitions. The `dataviz` files are identical in 2.1.296.
- Artifact type releases: Dashboard 1792755539-0bbb, Design 1792755538-a794, Design System 1792755543-6414, Docs 1792722964-d2d5, Motion 1792705740-4233, Slides 1792755574-c79d.
- Artifact runtime contracts 0.2.47 (the one the skill text was pinned to) and 0.2.89.

## How the copies were made
- Files that exist on disk were copied unchanged.
- The type files were read through five empty private artifacts made from the types ("Type copy - Dashboard" and so on). The Artifact tool saves those reads byte for byte, and sha256 spot checks matched. The five artifacts hold nothing else and can be deleted from the account's Artifacts list. Until then, the Design System copy is offered in design-system pickers.
- Text that exists only inside a session was taken byte for byte from the session log by small scripts: the skill bodies, the quickstart answers, the guide topics and the Artifact tool definition. Skill bodies are saved as `SKILL.rendered.md`, because Claude Code fills in local values when it loads a skill: the skill folder path, and one artifact id, replaced here with `<artifact id>`.
- The session log keeps only a reference to three tool definitions (ArtifactComments, ArtifactData, DesignSync), so those were transcribed. Each of those files says so.

## Left out on purpose
- Secrets and personal state under `~/.claude`: credentials, account and settings files, history, project and session logs, shell snapshots, file history, paste cache, telemetry, and the policy and remote-settings files.
- From the Claude Desktop data folder: the app config, tokens, device and session ids, the other session folders, logs, caches and VM bundles, and the Cowork plugin's `manifest.json`, which names the person who installed it.
- The account owner's own artifacts, a deck and a Docs document. Only the Docs type's `SKILL.md` was kept.
- The design systems in the account, which are organization content. The quickstarts were asked with `design_systems: false`.
- The Claude Code system prompt and the Claude Docs connector's tool definitions, which the session log does not hold in a form that can be copied. The connector's server instructions are in `claude-ai/connectors/claude-docs/guide/instructions.md`.
