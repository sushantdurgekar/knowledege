<#
.SYNOPSIS
  One-time setup of the git-tracked Knowledge vault for the pro-instructor skill.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\vault_init.ps1
  powershell -ExecutionPolicy Bypass -File .\vault_init.ps1 -Vault "D:\Knowledge"
#>
param(
  [string]$Vault = "C:\Users\sushants\Local\Knowledge"
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
function Write-Utf8([string]$Path, [string]$Text) {
  if (-not (Test-Path $Path)) { [System.IO.File]::WriteAllText($Path, $Text, $utf8) }
}

$dirs = @(
  "_meta/tools",
  "technical/certifications",
  "technical/cloud", "technical/security", "technical/data-ai", "technical/devops",
  "softskills/communication", "softskills/interviewing", "softskills/exam-mindset", "softskills/study-skills",
  "practice/srs", "practice/qa",
  "sessions"
)
foreach ($d in $dirs) {
  $p = Join-Path $Vault $d
  New-Item -ItemType Directory -Force -Path $p | Out-Null
  if (-not (Get-ChildItem $p -Force | Where-Object { $_.Name -ne ".gitkeep" })) { Write-Utf8 (Join-Path $p ".gitkeep") "" }
}

$today = Get-Date -Format "yyyy-MM-dd"
Write-Utf8 (Join-Path $Vault "README.md") @"
# Knowledge Vault

Git-tracked learning memory maintained with the **pro-instructor** skill.

- ``technical/``  how technologies work, labs, certifications
- ``softskills/`` communication, interviewing, exam mindset, study skills
- ``practice/``   spaced-repetition deck (``srs/cards.jsonl``), mistake journal, Q&A logs
- ``sessions/``   checkpoint logs (one per study checkpoint)
- ``_meta/``      learner profile, resume state, helper tools

## Progress
| Track | Goal | Target date | Readiness | Status |
|---|---|---|---|---|

## Daily loop
1. Start a session: "Use pro-instructor, resume my learning" (chat mode: upload ``_resume-pack.md`` from ``_meta\tools\export_context.ps1``)
2. Study; Claude checkpoints regularly
3. Chat mode: apply each session pack with ``_meta\tools\apply_session_pack.ps1``
"@

Write-Utf8 (Join-Path $Vault "_meta/learner-profile.md") @"
---
title: Learner Profile
vault_path: $Vault
updated: $today
---
# Learner Profile

## Background
- Role / experience:
- Strong areas (to anchor analogies):
- Known gaps:

## Active goals
| Track | Goal | Target date | Hours/week | Status |
|---|---|---|---|---|

## Preferences
- Default persona: Tutor
- Lesson length: 10-15 min chunks
- Mode: Chat (session packs) | Direct (Cowork)
- Git remote push: no
"@

Write-Utf8 (Join-Path $Vault "_meta/resume.md") "---`nupdated: $today`n---`n# Resume State`n`n- No sessions yet. Start a new track.`n"
Write-Utf8 (Join-Path $Vault "practice/srs/cards.jsonl") ""
Write-Utf8 (Join-Path $Vault "practice/mistakes.jsonl") ""
Write-Utf8 (Join-Path $Vault ".gitignore") "_resume-pack.md`n*.tmp`n.inbox/`n"
Write-Utf8 (Join-Path $Vault ".gitattributes") "* text=auto eol=lf`n*.ps1 text eol=crlf`n"

# Install helper tools next to the vault if they sit beside this script
foreach ($t in @("apply_session_pack.ps1", "export_context.ps1", "vault_init.ps1")) {
  $src = Join-Path $PSScriptRoot $t
  if (Test-Path $src) { Copy-Item $src (Join-Path $Vault "_meta/tools/$t") -Force }
}

if (Get-Command git -ErrorAction SilentlyContinue) {
  Push-Location $Vault
  try {
    if (-not (Test-Path ".git")) {
      git init | Out-Null
      git checkout -B main 2>$null | Out-Null
    }
    if (-not (git config user.name)) {
      Write-Warning "git user.name not set. Run: git config --global user.name 'Your Name'; git config --global user.email 'you@example.com'"
    } else {
      git add -A
      git commit -m "plan(vault): initialize Knowledge vault" | Out-Null
      Write-Host "Committed initial vault." -ForegroundColor Green
    }
  } finally { Pop-Location }
} else {
  Write-Warning "git not found. Install Git for Windows (https://git-scm.com) and run: cd '$Vault'; git init; git add -A; git commit -m 'plan(vault): initialize'"
}
Write-Host "Vault ready at $Vault" -ForegroundColor Cyan
