# Knowledge vault — instructions for Claude

This folder is Sushant's **pro-instructor Knowledge vault**. Whenever you work in this
directory, use the project skill at `.claude/skills/pro-instructor/` (SKILL.md) for any
learning, revision, quiz, mock-exam, lab or interview-prep request, and follow the
vault rules below. The skill is scoped to this folder on purpose.

## Mode
Direct mode: the vault is on disk. Boot by reading `_meta/learner-profile.md`,
`_meta/resume.md`, then `python .claude/skills/pro-instructor/scripts/srs.py
--deck-file practice/srs/cards.jsonl due --limit 10`.

## Layout (where things go)
| Path | What lives there | In git? |
|---|---|---|
| `technical/<domain>/<subject>/concepts/` | concept notes written while learning (md) | yes |
| `technical/<domain>/<subject>/labs/`, `resources.md`, `misconceptions.md`, `interview.md` | pro-instructor files | yes |
| `technical/<domain>/<subject>/notes/`, `snippets/` | small hand-written text, queries, scripts | yes |
| `technical/<domain>/<subject>/docs/` | PDFs, slides, cheat sheets, reference xlsx | files ignored by type |
| `technical/<domain>/<subject>/courses/<slug>/` | third-party course material, kept intact | no |
| `technical/<domain>/<subject>/projects/<slug>/` | my own builds / POCs (often their own git repo) | no |
| `technical/<domain>/<subject>/examples/<slug>/` | small demos, samples, templates | no |
| `technical/<domain>/<subject>/datasets/`, `media/` | data files, videos, images | no |
| `technical/certifications/<exam>/` | blueprint, roadmap, readiness, docs, datasets | md only |
| `softskills/<area>/` | communication, interviewing, exam-mindset, study-skills, personal-finance | md only |
| `work/gain-insights/` | employer/client code, intern program, chatbot work | **never** |
| `practice/` | `srs/cards.jsonl`, `mistakes.jsonl`, `qa/` | yes |
| `sessions/YYYY/MM/` | checkpoint logs | yes |
| `_meta/` | profile, resume state, tools, restructure log | yes |

Domains in use: `data-ai`, `bi-analytics`, `cloud`, `devops`, `programming`,
`software-engineering`, `web-dev`, `security`, `certifications`.

## Rules
- Names: lowercase-kebab-case for every folder/file *we* create or rename. Never rename
  files inside a third-party course or a code repo (it breaks imports and configs).
- New downloads: drop them in `.inbox/` (git-ignored), then file them with the table above.
  Unzip archives, delete the `.zip` once extracted, and strip `__MACOSX`, `.DS_Store`,
  `node_modules`, `.venv`, `__pycache__`, `.idea`.
- Secrets: `.env` files stay local and are ignored. Never paste keys into notes.
- Work material goes under `work/` only. Never commit it, never quote it into notes
  outside `work/`.
- After adding or moving material, run `python _meta/tools/build_index.py` to refresh
  `INDEX.md`, and update the subject `README.md`.
- Commit with the skill's convention: `<type>(<scope>): <summary>`
  (research | plan | learn | practice | lab | mock | soft | checkpoint | chore).
- Remote `origin` is GitHub; push only when Sushant asks.
