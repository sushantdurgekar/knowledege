# Knowledge Vault

Sushant's git-tracked learning memory, run with the **pro-instructor** skill
(installed for this folder only in `.claude/skills/pro-instructor/`; see `CLAUDE.md`).

**Find anything fast:** open [`INDEX.md`](INDEX.md) (auto-generated map of every subject),
then the subject's `README.md` → *Start here*.

## Top level
| Folder | What | In git |
|---|---|---|
| `technical/` | how technologies work: notes, docs, courses, projects, examples, certifications | notes only |
| `softskills/` | communication, interviewing, exam mindset, study skills, personal finance | notes only |
| `work/` | Gain Insights work and client material | never |
| `practice/` | SRS deck `srs/cards.jsonl`, `mistakes.jsonl`, Q&A logs | yes |
| `sessions/` | checkpoint logs | yes |
| `_meta/` | learner profile, resume state, tools (`restructure-log.tsv` stays local) | yes |
| `.inbox/` | drop zone for new downloads before filing | never |

## Inside every subject (`technical/<domain>/<subject>/`)
`concepts/` notes · `docs/` PDFs & cheat sheets · `courses/` third-party material ·
`projects/` your builds · `examples/` demos · `snippets/` queries & scripts ·
`datasets/` · `media/` · `labs/` · `resources.md` · `interview.md`

## Subjects
| Domain | Subjects |
|---|---|
| data-ai | agentic-ai · anomaly-detection · rag · genai · claude-code |
| bi-analytics | qlik-sense · thoughtspot |
| certifications | ai-901 · dp-900 |
| software-engineering | full-stack · system-design · dsa |
| web-dev | react · nextjs · seo |
| programming | python |
| devops | docker |
| cloud, security | _(empty, ready)_ |

## Progress
| Track | Goal | Target date | Readiness | Status |
|---|---|---|---|---|

## Daily loop
1. "Use pro-instructor, resume my learning" (Claude reads `_meta/resume.md`, runs due cards).
2. Study; Claude checkpoints into `sessions/`, `practice/` and the subject's `concepts/`.
3. New material → `.inbox/` → file it per `CLAUDE.md` → `python _meta/tools/build_index.py`.
