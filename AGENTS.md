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
| AI (LLMs)      | OpenRouter — modelo default: `anthropic/claude-sonnet-4.5` (helper em `src/lib/ai.ts`) |

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
- Senha: \`***REMOVED***\` (temporária — trocar)

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
│   │       ├── clientes/    # Contatos (lista, perfil, novo)
│   │       ├── oportunidades/page.tsx
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

---


## Design System
## Schema do Banco

### `auth.users` (Supabase Auth)
Usuário admin: `mario@campello.me`. Identity em `auth.identities` (provider: email).

### `contacts` — pessoas/entidades
Identidade unificada que liga email, WhatsApp e reuniões.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | PK |
| name | text | obrigatório |
| email, phone, company, role, linkedin_url, website | text | |
| source | text | whatsapp / email / fathom / calcom / manual / indication |
| tags | text[] | |
| notes | text | |
| ai_summary | text | resumo do contato gerado por AI |
| ai_summary_updated_at | timestamptz | |

### `clients` — relacionamento comercial
Um contact pode virar client quando há contrato.

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid | |
| contact_id | uuid | FK contacts |
| company_name | text | nome de exibição |
| status | text | prospect / active / paused / former |
| monthly_fee | numeric | R$/mês |
| dedication_hours | int | horas/mês |
| contract_start, contract_end | date | |
| renewal_auto | bool | default true |

### `opportunities` — oportunidades detectadas
| Coluna | Tipo | Notas |
|--------|------|-------|
| contact_id | uuid | FK contacts |
| channel | text | whatsapp / email / calcom / manual / group |
| confidence | text | very_high / high / medium / low |
| title, description, raw_content, source_url | text | |
| status | text | new / qualified / dismissed / converted |
| detected_at, qualified_at | timestamptz | |
| converted_to_client_id | uuid | FK clients |

### `proposals` — propostas (versionadas)
Múltiplas versões agrupadas por `proposal_group_id` (mesma proposta, versões diferentes).

| Coluna | Tipo | Notas |
|--------|------|-------|
| client_id | uuid | FK clients |
| proposal_group_id | uuid | agrupa versões |
| version | int | |
| title, content_md | text | markdown |
| value | numeric | |
| status | text | draft / sent / viewed / accepted / rejected / expired |
| viewer_url | text | URL pública (docs.campello.me) |
| sent_at, viewed_at, responded_at | timestamptz | |

### `contracts` — contratos (versionados)
Idem propostas. `contract_group_id` agrupa versões. Suporta diff visual entre versões.

| Coluna | Tipo | Notas |
|--------|------|-------|
| client_id | uuid | FK clients |
| contract_group_id, version | uuid, int | |
| title, content_md | text | |
| value | numeric | |
| status | text | draft / in_review / signed / active / ended / cancelled |
| starts_at, ends_at | date | |
| signed_at | timestamptz | |
| signature_provider, signature_external_id | text | clicksign / d4sign etc |

### `interactions` — log unificado por contato
Eventos vindos de qualquer canal.

| Coluna | Tipo | Notas |
|--------|------|-------|
| contact_id | uuid | FK contacts |
| channel | text | email / whatsapp / fathom / calcom / manual |
| type | text | message_in / message_out / meeting / email_in / email_out / booking / note |
| subject, summary, content | text | |
| external_id, external_url | text | id/link na fonte |
| metadata | jsonb | dados específicos do canal |
| occurred_at | timestamptz | quando aconteceu |

### `connectors` — conexões com serviços externos
(ver início deste arquivo)

### Triggers
`update_updated_at()` aplicado em todas as tabelas com `updated_at`.

### RLS
Todas as tabelas com Row Level Security ativo. Política única por enquanto: `authenticated` tem full access (1 usuário admin).

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
- [x] Tela de Clientes (perfil unificado)
- [x] Tela de Oportunidades (kanban + lista, API GET/PATCH)
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

- **Mensagens de WhatsApp** são inseridas no Supabase pelo **N8N** na tabela vetorial `public.documents`. **Não duplicar essa ingestão**. A conexão do Pandora OS com a uazapi (`pandora.uazapi.com`) é exclusivamente para **enviar** mensagens a partir do sistema. Para ler conversas, consulte `public.documents` (e `groups`, `participants`, `group_participants`).

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
