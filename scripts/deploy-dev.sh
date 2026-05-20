#!/bin/bash
# Deploy dev: branch dev → dev.campello.pro
set -e
cd /root/pandora-os-dev
echo "=== Deploy DEV ==="
git fetch origin
git pull origin dev
cd /root/pandora-os
docker compose up -d --build pandora-os-dev
echo "✓ pandora-os-dev atualizado — https://dev.campello.pro"
