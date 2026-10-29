#!/usr/bin/env bash
# Starts the full local stack: Firebase emulators, API (port 8081) and web (port 5173).
set -euo pipefail
cd "$(dirname "$0")/.."
export GCLOUD_PROJECT=demo-classinteract
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export SETUP_TOKEN=${SETUP_TOKEN:-local-setup-token}
export AI_FAKE_PROVIDER=${AI_FAKE_PROVIDER:-1}

npx firebase emulators:start --project demo-classinteract --only auth,firestore &
EMU=$!
trap 'kill $EMU $API $WEB 2>/dev/null || true' EXIT
until curl -s http://127.0.0.1:8080 >/dev/null && curl -s http://127.0.0.1:9099 >/dev/null; do sleep 1; done
pnpm --filter @classinteract/api exec tsx src/index.ts &
API=$!
until curl -s http://127.0.0.1:8081/healthz >/dev/null; do sleep 1; done
if [ "${SEED:-1}" = "1" ]; then pnpm --filter @classinteract/api seed; fi
pnpm --filter @classinteract/web exec vite --host 0.0.0.0 &
WEB=$!
echo "ClassInteract AI: web http://localhost:5173 · API http://localhost:8081 · Emulator UI http://localhost:4000"
wait
