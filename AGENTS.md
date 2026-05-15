# Pandora OS — Instruções Operacionais

Documento mestre. Sempre que algo mudar na arquitetura, infra, schema ou processo, **atualize este arquivo**.

---

## Sobre o Projeto

Sistema operacional da **Pandora Tech LTDA** (Mario Campello). Centraliza:

- Monitoramento de WhatsApp (uazapi) e email (Gmail)
- Detecção de oportunidades via AI
- CRM com perfil unificado de clientes/prospects
- Geração de propostas e contratos com AI
- Financeiro (Asaas, custo por projeto)
- Telegram Bot como canal de alertas

PRD completo: `/Users/mcampello/Library/CloudStorage/GoogleDrive-mario@campello.me/Meu Drive/Pandora Tech LTDA/Proposta/PRD/`

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend + API | Next.js 16 (App Router, Turbopack) |
| Linguagem | TypeScript |
| Estilos | CSS variables (design system Pandora) + Tailwind v4 |
| Banco | Supabase (Postgres + Auth + Storage) |
| Auth | Supabase Auth (email + senha) |
| Container | Docker + docker compose |
| Reverse proxy | Caddy 2 (HTTPS automático via Let's Encrypt) |
| Hospedagem | VPS Ubuntu 24.04 |
| Versionamento | Git + GitHub |

---

## Acesso

### VPS
- IP: \`76.13.174.139\`
- Usuário: \`root\`
- Autenticação: SSH key (chave do Mario já em \`authorized_keys\`)
- Conectar: \`ssh root@76.13.174.139\`

### Domínio
- Produção: https://app.campello.me
- DNS apontado para o VPS

### GitHub
- Repo: \`git@github.com:mcampello/pandora-os.git\`
- Branch principal: \`main\`
- Deploy key configurada no VPS (chave SSH em \`/root/.ssh/id_ed25519\`)

### Supabase
- Projeto: \`mario@campello.me's Project\` (alias "Pandora Zap")
- ID: \`wxvqwzygabzelspdwgcg\`
- URL: \`https://wxvqwzygabzelspdwgcg.supabase.co\`
- Região: sa-east-1 (São Paulo)

### Login no app
- Email: \`mario@campello.me\`
- Senha: \`suLoW4ctC2Vorg6T\` (temporária — trocar)

---

## Estrutura de Arquivos

\`\`\`
/root/pandora-os/
├── Dockerfile               # Node 20 Alpine, npm run dev
├── docker-compose.yml       # Container na rede docs-site_docs_net
├── next.config.ts           # allowedDevOrigins: app.campello.me
├── .env.local               # Vars Supabase (NÃO commitar)
├── .gitignore
├── public/                  # Assets (pandora_ico.svg, logos)
├── src/
│   ├── middleware.ts        # Proteção de rotas via Supabase Auth
│   ├── app/
│   │   ├── layout.tsx       # Root layout (html, body, fontes)
│   │   ├── globals.css      # Design system tokens
│   │   ├── login/page.tsx   # Tela de login
│   │   └── (app)/           # Rotas protegidas
│   │       ├── layout.tsx   # Shell com Sidebar
│   │       ├── page.tsx     # Dashboard
│   │       └── configuracoes/conectores/page.tsx
│   ├── components/
│   │   └── Sidebar.tsx
│   └── lib/
│       ├── supabase-browser.ts   # Client-side
│       ├── supabase-server.ts    # Server components
│       └── types.ts              # Tipos compartilhados
\`\`\`

---

## Workflow de Desenvolvimento

**Todo desenvolvimento é direto no VPS via SSH.** Não há cópia local.

### Editar arquivo
\`\`\`bash
ssh root@76.13.174.139
nano /root/pandora-os/src/app/...
\`\`\`

Next.js (Turbopack) faz HMR automático — alterações aparecem em segundos em https://app.campello.me

### Reiniciar container (mudanças em .env ou docker-compose)
\`\`\`bash
ssh root@76.13.174.139 "docker restart pandora-os"
\`\`\`

### Logs
\`\`\`bash
ssh root@76.13.174.139 "docker logs pandora-os --tail=50 -f"
\`\`\`

### Commit e push
\`\`\`bash
ssh root@76.13.174.139 "cd /root/pandora-os && git add -A && git commit -m '...' && git push origin main"
\`\`\`

---

## Schema do Banco

### Tabela \`auth.users\` (Supabase Auth)
- Usuário admin: \`mario@campello.me\` (UUID gerado pelo Supabase)

### Tabela \`connectors\`
Armazena conexões com serviços externos (Gmail, WhatsApp, Fathom, etc.)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | PK |
| type | text | gmail / whatsapp / fathom / calcom / telegram / asaas |
| label | text | Nome amigável (ex: "mario@campello.me") |
| status | text | connected / disconnected / error |
| credentials | jsonb | Tokens OAuth, API keys (criptografar no futuro) |
| metadata | jsonb | Info extra (email, phone, webhook_url) |
| last_sync_at | timestamptz | Última sincronização |
| error_message | text | Mensagem de erro se status=error |
| created_at, updated_at | timestamptz | Auto-managed |

Trigger \`update_updated_at\` atualiza \`updated_at\` em cada UPDATE.

---

## Design System

Tokens em \`src/app/globals.css\`. Resumo:

### Cores
- Brand: \`--pandora-violet-600\` (#7A1CB5)
- Surface dark: \`--pandora-violet-950\` (#0D0219)
- Accent verde: \`--pandora-green-400\` (#2DD4A0)
- Neutros: \`--pandora-ink-{0-900}\`

### Tipografia
- Display: Chakra Petch (títulos, eyebrows, labels)
- Texto: Sora (corpo, descrições)
- Mono: JetBrains Mono (timestamps, código)

### Componentes (classes CSS)
- \`.pda-side\` / \`.pda-main\` — layout
- \`.pda-topbar\` — barra superior das páginas
- \`.pda-content\` — área de conteúdo
- \`.pda-card\` — cards
- \`.pda-btn\` / \`.pda-btn-ghost\` — botões
- \`.pda-badge-{success|warning|danger|violet|green}\` — badges
- \`.pda-dot-{green|amber|gray}\` — dots de status
- \`.pda-chip\` — chip de contexto
- \`.pda-eyebrow\` — labels uppercase
- \`.pda-empty\` — empty states

---

## Roadmap (Plano de Tarefas)

Ver TodoWrite atualizado pelo Claude. Resumo do status:

- [x] Shell do app (sidebar, dashboard, design system)
- [x] Conectores (UI + tabela no banco)
- [x] Autenticação (Supabase Auth + middleware)
- [ ] Schema completo (clients, opportunities, proposals, contracts)
- [ ] Gmail OAuth real
- [ ] Tela de Clientes (perfil unificado)
- [ ] Tela de Oportunidades
- [ ] Telegram Bot
- [ ] Detector de oportunidades (AI)
- [ ] Propostas com AI
- [ ] Contratos com versionamento
- [ ] Financeiro
- [ ] Fathom
- [ ] Cal.com
- [ ] Asaas

---

## Outros Serviços no VPS

| Domínio | Serviço |
|---------|---------|
| docs.campello.me | Pandora Sales (propostas/contratos atuais via Caddy) |
| automate.campello.pro | N8N |
| chat.campello.me | Open WebUI |
| design.campello.me | Penpot |
| slides.campello.me | Presonton |
| lp.campello.me | Landing page |

Caddy config: \`/root/pandora-skills/deploy/docs-site/Caddyfile\`

---

## Notas e Decisões

- **N8N** existe no VPS mas o Pandora OS **não depende dele**. Todos os webhooks são API routes do próprio Next.js. N8N fica para automações pontuais quando fizer sentido.
- **Supabase** é o único banco. Vetores do WhatsApp (uazapi) já estão lá em base separada.
- **Telegram Bot** será o canal central de alertas — agente conversacional para Mario tirar dúvidas sobre clientes e receber notificações.
- **Atribuição de custo por projeto** ainda em aberto — definir critério (manual? por período? por tag?).

---

## Como Manter Este Documento

Sempre que houver mudança em:
- Arquitetura (nova lib, mudança de stack)
- Banco (nova tabela, migração)
- Infra (novo container, mudança no Caddy, novo domínio)
- Credenciais ou acessos
- Decisões importantes
- Status do roadmap

→ **Edite este arquivo no mesmo commit da mudança.**
