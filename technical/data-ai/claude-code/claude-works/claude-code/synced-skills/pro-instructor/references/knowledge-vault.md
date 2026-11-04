# Knowledge Vault

The vault is the learner's long-term, git-tracked memory. Default location:

```
C:\Users\sushants\Local\Knowledge
```

(If `_meta/learner-profile.md` names a different `vault_path`, use that.)

## Contents
1. Layout
2. Technical vs soft-skill segregation
3. File formats
4. Direct mode (Cowork / Claude Code)
5. Chat mode (claude.ai / app): session packs
6. Git conventions
7. Checkpoint and compaction protocol
8. Resume prompts

## 1. Layout

```
Knowledge/
├── README.md                     # Vault index: tracks, progress, how to use
├── _meta/
│   ├── learner-profile.md        # goals, exam dates, preferences, persona, vault_path
│   └── resume.md                 # latest compact state (overwritten every checkpoint)
├── technical/
│   ├── <domain>/                 # cloud, security, data-ai, devops, networking, programming, ...
│   │   └── <subject>/            # aws, azure, kubernetes, rag, qlik-sense, ...
│   │       ├── concepts/<concept-slug>.md
│   │       ├── labs/<lab-slug>.md
│   │       ├── resources.md      # vetted links, rated + date accessed
│   │       ├── misconceptions.md # traps seen in this subject
│   │       └── interview.md      # technical interview Q&A for this subject
│   └── certifications/
│       └── <exam-code-slug>/     # e.g. aws-saa, az-104, comptia-sec-plus
│           ├── blueprint.md      # domains, weights, official guide link, version
│           ├── roadmap.md        # week plan + progress checkboxes
│           ├── diagnostic.md     # pre-test results
│           ├── mock-exams/<YYYY-MM-DD>-mock-<n>.md
│           └── readiness.md      # latest readiness report + history table
├── softskills/
│   └── <area>/                   # communication, interviewing, stakeholder-management,
│       ├── concepts/<slug>.md    # leadership, study-skills, exam-mindset, writing
│       ├── practice/<slug>.md
│       └── resources.md
├── practice/
│   ├── srs/cards.jsonl           # spaced-repetition deck (one JSON card per line)
│   ├── mistakes.jsonl            # mistake journal (append-only)
│   └── qa/<YYYY-MM-DD>-<topic>.md # notable Q&A exchanges, verbatim-ish
└── sessions/
    └── <YYYY>/<MM>/<YYYY-MM-DD>-<HHMM>-<topic>.md   # checkpoint logs
```

Slugs are lowercase-kebab-case. Never put secrets, credentials, or employer-confidential material in the vault, because it's git-tracked.

## 2. Technical vs soft-skill segregation

- **technical/**: anything about how a technology works, how to build or operate it, or exam content.
- **softskills/**: communication, explaining technical ideas to non-technical people, stakeholder handling, leadership, negotiation, behavioral interviews (STAR stories), study habits, exam anxiety, time management.
- Mixed content is split. "Explaining RAG to executives" → the RAG mechanics go in `technical/data-ai/rag/concepts/`, and the framing technique goes in `softskills/communication/concepts/`, each linking to the other with relative markdown links.
- SRS cards and mistakes carry `"track": "technical" | "softskill"` so reviews can be filtered.

## 3. File formats

Use the templates in `assets/templates/`. Every markdown note starts with YAML frontmatter:

```yaml
---
title: VPC Peering vs Transit Gateway
track: technical            # or softskill
domain: cloud
subject: aws
tags: [networking, exam-aws-saa]
status: learning            # new | learning | solid | mastered
created: 2026-10-01
updated: 2026-10-01
sources:
  - url: https://docs.aws.amazon.com/...
    accessed: 2026-10-01
---
```

**cards.jsonl**: one object per line:
```json
{"id":"aws-saa-0007","track":"technical","deck":"aws-saa","front":"Why can't VPC peering give you transitive routing?","back":"Peering is a 1:1 relationship; routes don't propagate through a peer. Use Transit Gateway for hub-and-spoke.","tags":["networking"],"ef":2.5,"interval":0,"reps":0,"due":"2026-10-01","source":"technical/cloud/aws/concepts/vpc-peering-vs-tgw.md"}
```
Good cards test one idea, ask "why/when/which" more than "what", and link back to the note.

**mistakes.jsonl**: append-only:
```json
{"date":"2026-10-01","track":"technical","deck":"aws-saa","question":"...","given":"...","correct":"...","root_cause":"knowledge-gap|misread|confused-concepts|careless|time-pressure","misconception":"Thought SGs are stateless","fix":"Card aws-saa-0012 + re-read note","resolved":false}
```

## 4. Direct mode (Cowork / Claude Code)

1. Locate the vault. In Cowork, the user grants the folder and it is mounted (check the working folder; look for `_meta/learner-profile.md`). In Claude Code on Windows, use the path directly.
2. If the vault is missing, create the layout above, copy templates, `git init`, and make an initial commit. Ask before creating it in an unexpected location.
3. Check `git --version`. If git is unavailable, still write the files and tell the user the commit command to run.
4. Run scripts with `python scripts/srs.py --deck-file <vault>/practice/srs/cards.jsonl ...`.
5. Commit at every checkpoint. Push only if a remote exists **and** the user has asked for pushing.

## 5. Chat mode (claude.ai / app): session packs

The sandbox cannot touch `C:\`. So:

1. **Staging.** Mirror vault paths under `/home/claude/vault-delta/` (e.g. `/home/claude/vault-delta/technical/cloud/aws/concepts/iam-policies.md`).
2. **Deck and journal.** If the learner uploaded a resume pack, extract their `cards.jsonl` into staging and update it there (full rewrite). Write *new* mistakes to `practice/mistakes.jsonl` in staging. The apply script appends `.jsonl` journals rather than overwriting them.
3. **Pack.** At a checkpoint, run:
   ```bash
   python /path/to/skill/scripts/make_session_pack.py /home/claude/vault-delta \
     --message "learn(aws-saa): IAM policy evaluation + 6 cards" \
     --out /mnt/user-data/outputs/session-pack-<YYYYMMDD-HHMM>.zip
   ```
   Then `present_files` the zip. Clear the staging dir afterwards (`--clear`), but keep `cards.jsonl` and `_meta/resume.md` content in memory for the rest of the session.
4. **Apply (user side, once per pack):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Users\sushants\Local\Knowledge\_meta\tools\apply_session_pack.ps1" -Pack "$HOME\Downloads\session-pack-20261001-1530.zip"
   ```
   The script merges files (append for journals, overwrite for the rest) and makes the git commit with the pack's message.
5. **Resume next time:** the user runs `export_context.ps1`, which writes `_resume-pack.md` (profile + resume + deck + recent mistakes + roadmap). They upload it at the start of a new chat.

`vault_init.ps1` installs both helper scripts into `_meta/tools/` so the user has them locally. First-time setup in chat mode: present `vault_init.ps1`, `apply_session_pack.ps1`, and `export_context.ps1` and tell them to run the init script once.

## 6. Git conventions

Commit message: `<type>(<scope>): <summary>`, where scope is the subject or exam slug.

| type | for |
|---|---|
| `research` | resources, blueprints, sources gathered |
| `plan` | roadmap / diagnostic / profile changes |
| `learn` | concept notes from lessons |
| `practice` | cards, quizzes, Q&A logs, mistakes |
| `lab` | labs and projects |
| `mock` | mock exam results and readiness |
| `soft` | soft-skill material |
| `checkpoint` | session log + resume (mixed) |

Example: `learn(az-104): RBAC scope inheritance; +5 cards; 2 mistakes logged`

Each commit should leave the vault consistent: notes, cards, and resume all updated together.

## 7. Checkpoint and compaction protocol

Triggers: concept or lab complete · about 8–10 exchanges · long chat · user says save/checkpoint/stop · mock exam done.

Steps:
1. Write `sessions/<YYYY>/<MM>/<date>-<time>-<topic>.md` from `assets/templates/session-log.md`.
2. Update or create the touched notes, `cards.jsonl`, `mistakes.jsonl`, the roadmap checkboxes, and `readiness.md` if relevant.
3. Overwrite `_meta/resume.md` (template: `assets/templates/resume.md`). Keep it **under about 400 words**: current track, roadmap position, weak areas, due-card count, open questions, next 3 actions.
4. Update the `README.md` progress table if a milestone moved.
5. Commit (direct) or make the session pack (chat).
6. In chat, reply with a compact summary (≤6 lines) + saved paths + the resume prompt. After that, don't re-paste saved content. Refer to it by path.

## 8. Resume prompts

Give one at each checkpoint, ready to paste:

> Use pro-instructor. Resume my **AWS SAA** track from `_meta/resume.md` (chat mode: I'm uploading `_resume-pack.md`). Start with due cards, then continue at Week 3 → "S3 storage classes & lifecycle".
