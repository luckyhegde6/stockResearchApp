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
$pageNames = @(
  'Home.md',
  '_Sidebar.md',
  'Architecture.md',
  'Research-Workflow.md',
  'Evidence-Model-and-Guardrails.md',
  'Data-Sources-and-Features.md',
  'Product-Roadmap-and-PRDs.md',
  'Google-Sheets-Publishing.md',
  'Operations-and-Troubleshooting.md',
  'Developer-Setup.md',
  'References.md'
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git was not found. Install Git for Windows and retry.'
}
foreach ($name in $pageNames) {
  if (-not (Test-Path (Join-Path $sourceDir $name))) {
    throw "Prepared Wiki page is missing: $(Join-Path $sourceDir $name)"
  }
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
  Write-Host 'Cloning the initialized GitHub Wiki repository...'
  git clone $wikiUrl $wikiDir
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not clone the Wiki. Confirm the Wiki was initialized and GitHub credentials permit pushing.'
  }

  foreach ($name in $pageNames) {
    Copy-Item -Path (Join-Path $sourceDir $name) -Destination (Join-Path $wikiDir $name) -Force
  }

  $assetsSource = Join-Path $sourceDir 'assets'
  $assetsDest = Join-Path $wikiDir 'assets'
  if (Test-Path $assetsSource) {
    New-Item -ItemType Directory -Path $assetsDest -Force | Out-Null
    Copy-Item -Path (Join-Path $assetsSource '*') -Destination $assetsDest -Recurse -Force
  }

  Push-Location $wikiDir
  try {
    $stagePaths = @($pageNames)
    if (Test-Path $assetsDest) { $stagePaths += 'assets' }
    git add -- $stagePaths
    if ($LASTEXITCODE -ne 0) { throw 'Git add failed.' }

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
