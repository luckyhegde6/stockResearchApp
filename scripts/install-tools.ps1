$ErrorActionPreference = 'Stop'

Write-Host "Installing Node dependencies..."
npm install

Write-Host "Installing Playwright CLI skills..."
npx playwright-cli install --skills

Write-Host "Installing Chromium..."
npx playwright-cli install-browser

Write-Host "Creating Python virtual environment for Microsoft MarkItDown..."
if (!(Test-Path .venv)) { py -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install "markitdown[all]"

Write-Host "Done. Activate MarkItDown with: .\.venv\Scripts\Activate.ps1"
