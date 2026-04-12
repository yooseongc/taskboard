#!/usr/bin/env bash
set -euo pipefail

echo "=== Smoke Test ==="

echo "[1/2] Backend build..."
cd "$(dirname "$0")/../backend"
cargo build 2>&1
echo "Backend build: OK (exit $?)"

echo "[2/2] Frontend build..."
cd "$(dirname "$0")/../frontend"
npm install --prefer-offline 2>&1
npm run build 2>&1
echo "Frontend build: OK (exit $?)"

echo "=== Smoke Test PASSED ==="
