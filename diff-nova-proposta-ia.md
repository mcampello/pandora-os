# Diff — Nova Proposta com IA

> Mudanças feitas em 2026-06-03
> Geração de propostas com agente especialista (kimi-k2.6)

---

## Arquivos criados

### `src/app/(app)/propostas/nova/page.tsx`
Página de criação de proposta com IA. Layout estilo Claude:
- Seleção de cliente com dropdown buscável
- Chat interativo com agente especialista (painel esquerdo)
- Preview do markdown em tempo real (painel direito)
- Botão "Gerar Proposta Completa" após conversa mínima
- Salvamento direto após revisão

### `src/app/api/proposals/ai-chat/route.ts`
Endpoint POST para conversar com o agente:
- Modelo: `moonshotai/kimi-k2.6`
- Persona: especialista em propostas comerciais da Pandora Tech
- Busca automaticamente as 5 últimas propostas do banco como referência
- Aceita `clientInfo` e `references` no body

### `src/app/api/proposals/ai-generate/route.ts`
Endpoint POST para gerar proposta completa:
- Modelo: `moonshotai/kimi-k2.6`
- Persona: Mario Campello (sócio-fundador)
- Estrutura obrigatória: Objeto, Modelo, Entregáveis, Prazo, Investimento, Aceite, Não incluso, Premissas, Partes
- 3 perfis (A/B/C) adaptáveis ao contexto

---

## Arquivos modificados

### `src/app/(app)/propostas/page.tsx`
- Botão "Nova" → "Nova com IA" (com ícone Sparkles)
- Criação manual removida: agora redireciona para `/propostas/nova`
- Drawer mantido apenas para edição rápida de propostas existentes (`editing != null`)

### `src/app/(app)/propostas/[id]/page.tsx`
- Adicionado link "→ Contrato" quando status = accepted

### `src/app/api/proposals/route.ts`
- Campo `company_id` agora obrigatório no POST

### `src/app/api/proposals/generate/route.ts`
- Sistema melhorado com estrutura de 9 seções obrigatórias
- Adicionados 3 perfis comerciais (A/B/C)
- Atualizado para modelo Claude Sonnet 4.5

---

## Fluxo de uso

```
/propostas → clica "Nova com IA" → /propostas/nova
  → seleciona cliente → chat com especialista
    → "Gerar Proposta Completa" → preview preenchido
      → preenche título + empresa → Salvar → /propostas/:id
```
