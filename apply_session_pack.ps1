<#
.SYNOPSIS
  Merge a pro-instructor session pack (zip) into the Knowledge vault and git-commit it.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\apply_session_pack.ps1 -Pack "$HOME\Downloads\session-pack-20261001-1530.zip"
.EXAMPLE
  # apply every pack sitting in Downloads, oldest first
  Get-ChildItem "$HOME\Downloads\session-pack-*.zip" | Sort-Object LastWriteTime | % { .\apply_session_pack.ps1 -Pack $_.FullName }
#>
param(
  [Parameter(Mandatory = $true)][string]$Pack,
  [string]$Vault = "C:\Users\sushants\Local\Knowledge",
  [switch]$NoCommit,
  [switch]$KeepPack
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $Pack)) { throw "Pack not found: $Pack" }
if (-not (Test-Path $Vault)) { throw "Vault not found: $Vault (run vault_init.ps1 first)" }
$sep = [System.IO.Path]::DirectorySeparatorChar
$vaultFull = [System.IO.Path]::GetFullPath((Resolve-Path $Vault).Path).TrimEnd('\','/')

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("pack-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -Path $Pack -DestinationPath $tmp -Force
try {
  $manifest = Get-Content (Join-Path $tmp "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $applied = 0
  foreach ($f in $manifest.files) {
    $rel = $f.path
    if ($rel -match '(^|[\\/])\.\.([\\/]|$)' -or [System.IO.Path]::IsPathRooted($rel) -or $rel -match '^\.git([\\/]|$)') {
      Write-Warning "Skipping unsafe path: $rel"; continue
    }
    $target = [System.IO.Path]::GetFullPath((Join-Path $vaultFull $rel))
    if (-not $target.StartsWith($vaultFull + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-Warning "Skipping path outside vault: $rel"; continue
    }
    $src = Join-Path $tmp $f.src
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null

    if ($f.mode -eq "append" -and (Test-Path $target)) {
      $existing = [System.IO.File]::ReadAllText($target, $utf8)
      $add = [System.IO.File]::ReadAllText($src, $utf8)
      if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { $add = "`n" + $add }
      [System.IO.File]::AppendAllText($target, $add, $utf8)
      Write-Host "  + appended  $rel"
    } else {
      Copy-Item $src $target -Force
      Write-Host "  * wrote     $rel"
    }
    $applied++
  }
  Write-Host "Applied $applied file(s) from pack $($manifest.pack_id)." -ForegroundColor Green

  if (-not $NoCommit) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
      Push-Location $vaultFull
      try {
        git add -A
        $msg = $manifest.commit_message
        if (-not $msg) { $msg = "checkpoint: session pack $($manifest.pack_id)" }
        git commit -m $msg -m "session-pack: $($manifest.pack_id)" | Out-Null
        Write-Host "Committed: $msg" -ForegroundColor Green
      } finally { Pop-Location }
    } else {
      Write-Warning "git not found - files applied but not committed."
    }
  }
  if (-not $KeepPack) {
    $done = Join-Path $vaultFull ".inbox/applied"
    New-Item -ItemType Directory -Force -Path $done | Out-Null
    Move-Item $Pack (Join-Path $done (Split-Path $Pack -Leaf)) -Force
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
