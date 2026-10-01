<#
.SYNOPSIS
  Build _resume-pack.md - a single file to upload at the start of a new chat so
  pro-instructor can resume exactly where you left off (chat mode).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\export_context.ps1
  powershell -ExecutionPolicy Bypass -File .\export_context.ps1 -Track aws-saa
#>
param(
  [string]$Vault = "C:\Users\sushants\Local\Knowledge",
  [string]$Track = "",          # optional: only include this certification/subject slug
  [int]$Mistakes = 30           # recent mistakes to include
)
$ErrorActionPreference = "Stop"
$Vault = [System.IO.Path]::GetFullPath($Vault).TrimEnd([char]92, [char]47)
$utf8 = New-Object System.Text.UTF8Encoding $false
$sb = New-Object System.Text.StringBuilder
function Add-Section([string]$Title, [string]$Path, [string]$Fence = "") {
  if (Test-Path $Path) {
    $rel = $Path.Substring($Vault.Length).TrimStart('\','/') -replace '\\', '/'
    [void]$sb.AppendLine("`n## $Title  ``($rel)``")
    $txt = [System.IO.File]::ReadAllText($Path, $utf8)
    if ($Fence) { [void]$sb.AppendLine("``````$Fence"); [void]$sb.AppendLine($txt.TrimEnd()); [void]$sb.AppendLine("``````") }
    else { [void]$sb.AppendLine($txt.TrimEnd()) }
  }
}

[void]$sb.AppendLine("# Resume Pack - generated $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
[void]$sb.AppendLine("Upload this to a new chat and say: **Use pro-instructor and resume my learning.**")
[void]$sb.AppendLine("Claude: restore the vault files below into /home/claude/vault-delta at the given paths before updating them.")

Add-Section "Learner profile" (Join-Path $Vault "_meta/learner-profile.md")
Add-Section "Resume state" (Join-Path $Vault "_meta/resume.md")

$certRoot = Join-Path $Vault "technical/certifications"
if (Test-Path $certRoot) {
  Get-ChildItem $certRoot -Directory | Where-Object { -not $Track -or $_.Name -eq $Track } | ForEach-Object {
    Add-Section "Roadmap: $($_.Name)" (Join-Path $_.FullName "roadmap.md")
    Add-Section "Blueprint: $($_.Name)" (Join-Path $_.FullName "blueprint.md")
    Add-Section "Readiness: $($_.Name)" (Join-Path $_.FullName "readiness.md")
  }
}

$latest = Get-ChildItem (Join-Path $Vault "sessions") -Recurse -Filter *.md -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if ($latest) { Add-Section "Latest session log" $latest.FullName }

Add-Section "SRS deck (full - rewrite this file when updating)" (Join-Path $Vault "practice/srs/cards.jsonl") "jsonl"

$mPath = Join-Path $Vault "practice/mistakes.jsonl"
if (Test-Path $mPath) {
  $recent = Get-Content $mPath -Encoding UTF8 | Where-Object { $_.Trim() } | Select-Object -Last $Mistakes
  [void]$sb.AppendLine("`n## Recent mistakes (last $Mistakes; journal is append-only - stage only NEW entries)  ``(practice/mistakes.jsonl)``")
  [void]$sb.AppendLine("``````jsonl"); $recent | ForEach-Object { [void]$sb.AppendLine($_) }; [void]$sb.AppendLine("``````")
}

# Lightweight index of existing notes so Claude knows what already exists
[void]$sb.AppendLine("`n## Vault index (notes that already exist)")
Get-ChildItem $Vault -Recurse -Filter *.md -File |
  Where-Object { $_.FullName -notmatch '[\\/](\.git|\.inbox|sessions)[\\/]' -and $_.Name -ne "_resume-pack.md" } |
  ForEach-Object { [void]$sb.AppendLine("- " + ($_.FullName.Substring($Vault.Length).TrimStart('\','/') -replace '\\', '/')) }

$out = Join-Path $Vault "_resume-pack.md"
[System.IO.File]::WriteAllText($out, $sb.ToString(), $utf8)
Write-Host "Wrote $out - upload it at the start of your next chat." -ForegroundColor Cyan
