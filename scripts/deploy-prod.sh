#!/bin/bash
# Deploy produção: branch main → app.campello.me
set -e
cd /root/pandora-os
echo "=== Deploy PROD ==="
git fetch origin
git pull origin main
docker compose up -d --build pandora-os
echo "✓ pandora-os (prod) atualizado — https://app.campello.me"
