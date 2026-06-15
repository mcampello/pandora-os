# Pandora Broadcast

Disparo **pontual** de mensagens WhatsApp (texto + mídia) para uma lista de
pessoas, via a instância uazapi da Pandora (`pandora.uazapi.com`).

Projeto **paralelo** ao Pandora OS: é só um script CLI, sem dependências, sem
tocar na UI do app. Reusa o token uazapi da Pandora.

> ⚠️ Rode em um host com acesso de rede ao uazapi (ex.: o **VPS**). O ambiente
> de dev remoto do Claude bloqueia `pandora.uazapi.com` por egress policy.

## Setup

```bash
cd scripts/broadcast
cp .env.example .env
# edite .env e cole o UAZAPI_TOKEN (instance_token do connector whatsapp)
```

O token está no Supabase da Pandora:
```sql
select credentials->>'instance_token' from connectors where type='whatsapp';
```

## Uso

### 1. Ver as listas disponíveis (grupos e etiquetas)
```bash
node broadcast.mjs lists
```
Mostra cada **grupo** (`--group <jid>`) e cada **etiqueta** (`--label "<nome>"`).
No WhatsApp, "uma lista de pessoas" costuma ser um grupo ou uma etiqueta —
o script cobre os dois.

### 2. Exportar os membros para revisar
```bash
node broadcast.mjs members --group 55xxxxx@g.us       --out recipients.csv
node broadcast.mjs members --label "Clientes 2026"     --out recipients.csv
```
Gera um CSV `name,number`. **Revise/edite** antes de disparar (remova quem não
deve receber). O `.csv` é gitignored.

### 3. Disparar
```bash
# texto + imagem, lendo a lista revisada
node broadcast.mjs send \
  --from recipients.csv \
  --text mensagem.txt \
  --media banner.png --type image \
  --delay 8000 --jitter 4000 \
  --campaign promo-junho

# ou direto de uma lista, sem CSV intermediário:
node broadcast.mjs send --label "Clientes 2026" --text "Olá!" --dry-run
```

Tipos de mídia (`--type`): `image | video | document | audio | ptt`.
`--text` aceita texto inline **ou** caminho de arquivo `.txt`. Com mídia, o
texto vira legenda.

## Segurança de disparo (anti-bloqueio)

- **`--dry-run`** simula tudo sem enviar (sempre teste assim primeiro).
- **`--limit N`** envia só para os N primeiros (teste real com poucos).
- **Throttle**: `--delay` (gap base, ms) + `--jitter` (aleatório). Default
  8s + até 4s. Aumente para listas grandes.
- **Confirmação**: envio real pede para digitar `enviar` (pule com `--yes`).
- **Retomável**: cada número enviado vai para `.sent-<campanha>.log`. Reexecutar
  a mesma `--campaign` **pula** quem já recebeu (útil se cair no meio).

## Notas

- Endpoints uazapi usados: `GET /group/list`, `GET /labels`,
  `POST /group/info`, `POST /chat/find`, `POST /send/text`, `POST /send/media`.
- Formato de mídia configurável via `UAZAPI_MEDIA_FORMAT` (`v2` type/file default,
  `v1` mediatype/media). Se mídia falhar, troque o valor.
- Use com responsabilidade: só dispare para quem consentiu. Listas grandes em
  números novos têm risco de bloqueio do WhatsApp.
