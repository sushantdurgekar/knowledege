# Knowledge Vault

Sushant's git-tracked learning memory, run with the **pro-instructor** skill
(installed for this folder only in `.claude/skills/pro-instructor/`; see `CLAUDE.md`).

**Study order for all courses:** [`_meta/learning-paths.md`](_meta/learning-paths.md)

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
| data-ai | machine-learning · data-science · genai · agentic-ai · rag · anomaly-detection · claude-code |
| bi-analytics | qlik-sense · thoughtspot |
| certifications | ai-901 · ai-103 · ab-620 · ai-500 · dp-900 |
| software-engineering | full-stack · system-design · dsa · competitive-programming |
| web-dev | fundamentals · react · nextjs · seo |
| programming | python |
| devops | docker |
| cloud, security | _(empty, ready)_ |

## Progress
| Track | Goal | Target date | Readiness | Status |
|---|---|---|---|---|
| AI-901 Azure AI Fundamentals | Pass AI-901 | ~2026-10-05 | not measured | active |
| AI-103 Azure AI Apps and Agents Developer | Pass AI-103 | TBD | not assessed | planned (next) |
| AB-620 AI Agent Builder | Pass AB-620 | TBD | not assessed | planned (optional) |
| AI-500 Multi-Agent AI Solutions Expert | Pass AI-500 (needs AI-103) | TBD | not assessed | planned |

## Daily loop
1. "Use pro-instructor, resume my learning" (Claude reads `_meta/resume.md`, runs due cards).
2. Study; Claude checkpoints into `sessions/`, `practice/` and the subject's `concepts/`.
3. New material → `.inbox/` → file it per `CLAUDE.md` → `python _meta/tools/build_index.py`.
