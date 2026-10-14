[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot 'wiki-publish'
$wikiUrl = 'https://github.com/luckyhegde6/stockResearchApp.wiki.git'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("stockresearch-wiki-" + [guid]::NewGuid().ToString('N'))
$wikiDir = Join-Path $tempRoot 'wiki'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git was not found. Install Git for Windows and retry.'
}
if (-not (Test-Path (Join-Path $sourceDir 'Home.md'))) {
  throw "Prepared Wiki source was not found: $sourceDir"
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
  Write-Host 'Cloning the initialized GitHub Wiki repository...'
  git clone $wikiUrl $wikiDir
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not clone the Wiki. Confirm the Wiki was initialized and that GitHub credentials allow pushing.'
  }

  $markdown = Get-ChildItem -Path $sourceDir -Filter '*.md' -File
  foreach ($file in $markdown) {
    Copy-Item -Path $file.FullName -Destination (Join-Path $wikiDir $file.Name) -Force
  }

  $assetsSource = Join-Path $sourceDir 'assets'
  if (Test-Path $assetsSource) {
    $assetsDest = Join-Path $wikiDir 'assets'
    New-Item -ItemType Directory -Path $assetsDest -Force | Out-Null
    Copy-Item -Path (Join-Path $assetsSource '*') -Destination $assetsDest -Recurse -Force
  }

  Push-Location $wikiDir
  try {
    git add -- Home.md _Sidebar.md Architecture.md Research-Workflow.md Evidence-Model-and-Guardrails.md Data-Sources-and-Features.md Product-Roadmap-and-PRDs.md Google-Sheets-Publishing.md Operations-and-Troubleshooting.md Developer-Setup.md References.md assets
    if ($LASTEXITCODE -ne 0) {
      throw 'Git add failed.'
    }

    $changes = git diff --cached --name-only
    if (-not $changes) {
      Write-Host 'Wiki already matches the prepared page set; no commit is needed.'
      return
    }

    Write-Host 'Wiki changes to publish:'
    $changes | ForEach-Object { Write-Host "  $_" }
    if ($DryRun) {
      Write-Host 'Dry run only: no commit or push was performed.'
      return
    }

    git commit -m 'docs: publish StockResearchApp Wiki pages'
    if ($LASTEXITCODE -ne 0) {
      throw 'Git commit failed. Configure git user.name and user.email if missing.'
    }
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) {
      throw 'Push failed. Check GitHub write permission and credential helper configuration.'
    }
    Write-Host 'Wiki pages published successfully.'
    Write-Host 'Open https://github.com/luckyhegde6/stockResearchApp/wiki'
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
