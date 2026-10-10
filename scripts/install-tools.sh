#!/usr/bin/env bash
set -euo pipefail
npm install
npx playwright-cli install --skills
npx playwright-cli install-browser
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install 'markitdown[all]'
echo "Done. Activate MarkItDown with: source .venv/bin/activate"
