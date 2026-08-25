#!/usr/bin/env bash
# Runs once when the Codespace is created: installs both sides and writes a
# .env with a real secret key, so a Codespace restart doesn't sign everyone
# out (see config.py — without BFX_SECRET_KEY a fresh random one is generated
# on every process start).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Backend: venv + závislosti =="
cd backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q
cd ..

echo "== Frontend: npm install =="
cd frontend
npm install --no-audit --no-fund
cd ..

if [ ! -f .env ]; then
  echo "== .env: generuji BFX_SECRET_KEY =="
  cp .env.example .env
  secret=$(openssl rand -base64 48)
  sed -i.bak "s#^BFX_SECRET_KEY=.*#BFX_SECRET_KEY=${secret}#" .env
  rm -f .env.bak
fi

cat <<'EOF'

Hotovo. Spusť ve dvou terminálech:

  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
  cd frontend && npm run dev

Port 5173 se ve VS Code / Codespaces automaticky přeposlá a otevře náhled.
Backend potřebuje přístup na internet (ceny z Yahoo Finance, kurzy z ČNB) —
bez něj aplikace funguje dál, jen se ceny a kurzy zadávají ručně.
EOF
