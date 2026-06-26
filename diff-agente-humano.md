# Diff — Agente mais humano e referências forçadas

> Mudanças em 2026-06-03

---

## `src/app/api/proposals/ai-chat/route.ts`

### System prompt reescrito — persona "Pedro"
- Antes: "agente especialista em propostas comerciais" (robótico)
- Agora: **Pedro, consultor sênior de negócios** que trabalha com Mario há anos
- Tom: usa "eu", "nós", expressões coloquiais leves, valida entendimento
- **Regra dura**: NUNCA lista várias perguntas. SEMPRE **uma pergunta por mensagem**.

### Ritmo da conversa explicitado
1. Primeiro contato → pergunta de abertura
2. Diagnóstico → uma pergunta por vez sobre problema, dor, o que já tentaram
3. Validação → confirma entendimento antes de seguir
4. Sugestão de caminho → menciona propostas de referência naturalmente
5. Preenchimento de gaps → um dado por vez
6. Oferta de gerar → só propõe quando tem info suficiente

### Uso explícito das referências
Instrução para citar propostas anteriores de forma natural:
- "Numa proposta similar que fizemos para X, a gente estruturou assim..."
- "Pelo que vejo das nossas propostas de consultoria, o investimento médio gira em torno de..."

---

## `src/app/api/proposals/ai-generate/route.ts`

### System prompt melhorado
- Adicionada instrução explícita para **analisar as propostas de referência antes de escrever**
- Observe: tom, voz, valores, entregáveis, estrutura por tipo de serviço
- "Inspire-se no que funcionou. Não reinvente a roda."

---

## `src/app/(app)/propostas/nova/page.tsx`

### Mensagem inicial do agente
- Antes: "Olá! Sou o especialista em propostas..."
- Agora: "Opa! Sou o Pedro, consultor de negócios da Pandora... Me conta: qual é o desafio deles?"

### Mensagem após gerar proposta
- Antes: "Proposta gerada! Você pode revisar..."
- Agora: "Pronto! Montei a proposta com base no que a gente conversou. Dá uma olhada..."

### Header do chat
- Antes: "Especialista em Propostas"
- Agora: **"Pedro — Consultor de Negócios"**

### Loading state
- Antes: "Pensando…"
- Agora: "Só um segundo, organizando as ideias…"

### Botão de gerar
- Antes: "Gerar Proposta Completa"
- Agora: **"Bora montar a proposta?"**
