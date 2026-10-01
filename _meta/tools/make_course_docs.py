#!/usr/bin/env python3
"""Generate README / roadmap / resources / skipped-resources docs for Udemy courses.
Input: .inbox/udemy-course-outlines.json (+ _manifest.json inside each resources/ folder)."""
import json, os, re, datetime, collections, urllib.parse
V = os.path.expanduser('~/mnt/Knowledge'); T = os.path.join(V, 'technical')
TODAY = datetime.date.today().isoformat()
DEST = {
 '100-days-of-code': 'programming/python/courses/udemy-100-days-of-code',
 'complete-generative-ai-course-with-langchain-and-huggingface': 'data-ai/genai/courses/udemy-genai-langchain-huggingface',
 'react-the-complete-guide-incl-redux': 'web-dev/react/courses/udemy-react-complete-guide',
 'complete-web-development-course': 'web-dev/fundamentals/courses/udemy-complete-web-dev-15-projects',
 'introduction-to-data-science-using-python': 'data-ai/data-science/courses/udemy-intro-data-science-python',
 'algorithms-in-competitive-programming-maths-puzzles-i': 'software-engineering/competitive-programming/courses/udemy-cp-maths-puzzles-1',
 'algorithms-in-competitive-programming-game-theory': 'software-engineering/competitive-programming/courses/udemy-cp-game-theory',
 'complete-machine-learning-nlp-bootcamp-mlops-deployment': 'data-ai/machine-learning/courses/udemy-ds-ml-dl-nlp-bootcamp',
}
EXTRA = {  # extra local material beside resources/
 'react-the-complete-guide-incl-redux': [('official-repo/', 'Official course repo (academind/react-complete-guide-course-resources): `code/` = snapshots per section, `attachments/`, `other/react-course-slides.pdf`')],
 'complete-machine-learning-nlp-bootcamp-mlops-deployment': [('repo/', 'Instructor repo krishnaik06/Complete-Data-Science-With-Machine-Learning-And-NLP-2024 (notebooks per topic)')],
 'complete-generative-ai-course-with-langchain-and-huggingface': [('repos/', 'Instructor repos: Deep-agents-With-Langchain, Search-Engine-LLM')],
}
NOTES = {
 'complete-generative-ai-course-with-langchain-and-huggingface': 'Sections 10–20 (NLP/DL prerequisites: RNN, LSTM, attention, transformers) repeat the ML bootcamp sections 51–62. Shared PDFs are stored once, in the ML bootcamp folder (see `skipped-resources.md`). Study them there, then start here at section 21.',
 'complete-machine-learning-nlp-bootcamp-mlops-deployment': 'Sections 51–62 (NLP + deep learning) are the same material as GenAI course sections 10–20. Take them here once.',
 '100-days-of-code': 'Your own PyCharm work for Days 1–17 lives in `../100-days-of-python/`. The 8 starter PDFs are in `../../docs/`.',
 'react-the-complete-guide-incl-redux': 'Your own practice repo from this course is `../react-learning-projects/`.',
}
def slug(s):
    s = s.lower().replace('&', ' and '); s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:60].rstrip('-')
def md_link(text, path): return f"[{text}](<{path}>)"
data = json.load(open(os.path.join(V, '_meta', 'sources', 'udemy-course-outlines.json')))
summary = []
for c in data['courses']:
    rel = DEST[c['slug']]; d = os.path.join(T, rel); os.makedirs(d, exist_ok=True)
    resdir = os.path.join(d, 'resources'); has_res = os.path.isdir(resdir)
    man = json.load(open(os.path.join(resdir, '_manifest.json'))) if os.path.exists(os.path.join(resdir, '_manifest.json')) else {}
    lectures = [i for s in c['sections'] for i in s['items'] if i['type'] == 'lecture']
    mins = sum(i['minutes'] or 0 for i in lectures)
    # ---------- roadmap.md
    rm = [f"---\ntitle: {c['title']} — roadmap\ntrack: technical\nsource: {c['url']}\nupdated: {TODAY}\n---\n",
          f"# Roadmap · {c['title']}\n", f"{c['length']} · {len(c['sections'])} sections · {len(lectures)} lectures. Tick a section when you finish it. Folder links open that section's downloaded files.\n",
          "| ✔ | # | Section | Lectures | ~Min | Files |", "|---|---|---|---|---|---|"]
    for s in c['sections']:
        lec = [i for i in s['items'] if i['type'] == 'lecture']; other = len(s['items']) - len(lec)
        folder = f"{int(s['index']):02d}-{slug(s['title'])}"; fpath = os.path.join(resdir, folder)
        files = md_link('open', f"resources/{folder}/") if os.path.isdir(fpath) else ''
        m = sum(i['minutes'] or 0 for i in lec)
        title = s['title'].replace('|', '/') + (f" (+{other} quiz/exercise)" if other else '')
        rm.append(f"| [ ] | {s['index']} | {title} | {len(lec)} | {m} | {files} |")
    rm.append("\n## Lecture list\n<details><summary>All lectures by section</summary>\n")
    for s in c['sections']:
        rm.append(f"\n**{s['index']}. {s['title']}**\n")
        for i in s['items']:
            if i['type'] == 'lecture':
                rm.append(f"- [ ] {i['index']}. {i['title']}" + (f" · {i['minutes']} min" if i['minutes'] else ''))
            else:
                rm.append(f"- [ ] ({i['type']}) {i['title']}")
    rm.append("\n</details>\n")
    open(os.path.join(d, 'roadmap.md'), 'w', encoding='utf-8').write('\n'.join(rm))
    # ---------- resources.md
    groups = collections.OrderedDict((k, {}) for k in ['Code repositories', 'Official documentation', 'Interactive sandboxes & demos', 'Tools & services', 'Articles & videos', 'Other'])
    def bucket(u):
        h = urllib.parse.urlparse(u).netloc.lower()
        if 'github.com' in h: return 'Code repositories'
        if any(x in h for x in ['docs.', 'readthedocs', 'developer.mozilla', 'pydata.org', 'palletsprojects', 'nextjs.org', 'tailwindcss', 'w3.org', 'python.org', 'tkdocs', 'tcl']): return 'Official documentation'
        if any(x in h for x in ['codesandbox', 'appbrewery.github.io', 'repl.it', 'trinket', 'completewebdevelopmentcourse', 'pythontutor']): return 'Interactive sandboxes & demos'
        if any(x in h for x in ['youtube', 'youtu.be', 'wikipedia', 'medium', 'blog', 'jalammar', 'stackoverflow', 'nytimes', 'academind.com']): return 'Articles & videos'
        if any(x in h for x in ['api', 'pypi', 'openweathermap', 'twilio', 'sheety', 'pixe.la', 'newsapi', 'alphavantage', 'colorhunt', 'canva', 'unsplash', 'diagrams', 'draw.io']): return 'Tools & services'
        return 'Other'
    nlinks = 0
    for s in c['sections']:
        for i in s['items']:
            for l in i.get('links', []):
                u = l['url']
                if 'udemy.com' in u or 'discord.gg' in u: continue
                g = groups[bucket(u)]
                if u not in g: g[u] = (l['title'] or u, f"§{s['index']} L{i['index']}"); nlinks += 1
    rs = [f"---\ntitle: {c['title']} — resources\ntrack: technical\nupdated: {TODAY}\nsources:\n  - url: {c['url']}\n    accessed: {TODAY}\n---\n",
          f"# Resources · {c['title']}\n", f"External links attached to lectures ({nlinks} unique, collected {TODAY}; quiz/feedback forms and Udemy-internal links left out). `§` = section, `L` = lecture.\n"]
    for k, g in groups.items():
        if not g: continue
        rs.append(f"\n## {k}\n")
        for u, (t, where) in g.items(): rs.append(f"- [{t.strip()[:90]}]({u}) · {where}")
    if not nlinks: rs.append("\n_This course attaches no external links._")
    open(os.path.join(d, 'resources.md'), 'w', encoding='utf-8').write('\n'.join(rs) + '\n')
    # ---------- skipped-resources.md
    sk = man.get('skipped', []); dup = man.get('cross_course_duplicates', [])
    if sk or dup:
        out = [f"# Not downloaded · {c['title']}\n", "These course files were left out on purpose. Each lecture link opens the lecture in Udemy, where the file is under **Resources** if you ever need it.\n"]
        if sk:
            tot = sum(x['mb'] for x in sk)
            out += [f"\n## Skipped ({len(sk)} files, {tot:,.0f} MB)\n", "| File | MB | Section | Why | Get it |", "|---|---|---|---|---|"]
            for x in sk: out.append(f"| `{x['name']}` | {x['mb']} | {x['section']} | {x['reason']} | [lecture]({x['lecUrl']}) |")
        if dup:
            out += [f"\n## Stored in another course folder ({len(dup)} files)\n", "| File | Section here | Stored at |", "|---|---|---|"]
            for x in dup:
                course, rest = x['stored_in'].split('/', 1)
                rest = rest[:-4] + '/' if rest.lower().endswith('.zip') else rest
                out.append(f"| `{x['name']}` | {x['section']} | `technical/data-ai/machine-learning/courses/{course}/resources/{rest}` |")
        open(os.path.join(d, 'skipped-resources.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    # ---------- README.md
    nfiles = len(man.get('files', []))
    rows = []
    if has_res: rows.append(f"| `resources/` | {nfiles} downloaded lecture files, one folder per section (`NN-section-name/`). Zips are already unpacked. `_manifest.json` maps every file to its lecture |")
    for p, desc in EXTRA.get(c['slug'], []): rows.append(f"| `{p}` | {desc} |")
    rows.append("| `roadmap.md` | Every section and lecture as a checklist, with links to its files |")
    rows.append("| `resources.md` | External links from the lectures, grouped |")
    if sk or dup: rows.append("| `skipped-resources.md` | What was not downloaded and where to get it |")
    readme = f"""---
title: {c['title']}
track: technical
type: course
platform: Udemy
source: {c['url']}
length: {c['length']}
status: not-started
updated: {TODAY}
---
# {c['title']}

Udemy · {c['length']} · {len(c['sections'])} sections · {len(lectures)} lectures · ~{mins/60:.0f} h of lectures · [open course]({c['url']})

{NOTES.get(c['slug'], '')}

## What's here
| Path | What |
|---|---|
{chr(10).join(rows)}

## How to study it with pro-instructor
Say *"Use pro-instructor, start a track for {c['title'].split(':')[0].split('(')[0].strip()}"*. Claude will diagnose your level and plan weeks from `roadmap.md`. It puts concept notes in this subject's `concepts/` and flashcards in `practice/srs/cards.jsonl`.
"""
    open(os.path.join(d, 'README.md'), 'w', encoding='utf-8').write(readme)
    summary.append((rel, len(c['sections']), len(lectures), nfiles, nlinks, len(sk), len(dup)))
for s in summary: print(*s, sep=' | ')
