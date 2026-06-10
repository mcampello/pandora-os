#!/bin/bash
# Insere uma tarefa de teste na central.
# Uso: ./scripts/add-task.sh "Título da tarefa" [critical|high|medium|low]
set -e

TITLE="${1}"
PRIORITY="${2:-high}"

if [ -z "$TITLE" ]; then
  echo "Uso: add-task.sh 'Título da tarefa' [priority]"
  echo "Prioridades: critical | high | medium | low"
  exit 1
fi

# Carrega vars do ambiente
if [ -f /root/pandora-os/.env.local ]; then
  export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=|^SUPABASE_SERVICE_ROLE_KEY=' /root/pandora-os/.env.local | xargs)
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Erro: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados em .env.local"
  exit 1
fi

DEDUP="claude_$(date +%s)_$(head -c8 /dev/urandom | xxd -p)"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tasks" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"title\":$(echo "$TITLE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),\"priority\":\"${PRIORITY}\",\"source\":\"manual\",\"dedup_key\":\"${DEDUP}\",\"metadata\":{}}")

if [ "$HTTP_STATUS" = "201" ]; then
  echo "✓ [$PRIORITY] $TITLE"
else
  echo "✗ Erro HTTP $HTTP_STATUS ao criar: $TITLE"
  exit 1
fi
