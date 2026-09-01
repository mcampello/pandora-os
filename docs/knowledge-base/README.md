# Base de conhecimento Pandora

Esta pasta e a fonte versionada de conhecimento operacional da Pandora. Ela deve guardar processos, negociacoes, decisoes, portfolio de cursos e logs de trabalho dos agentes.

## Como usar

- Registre cada trabalho concluido em `operating-log/`.
- Registre cada negociacao relevante em `negotiations/`, usando o template em `templates/negotiation-record.md`.
- Registre processos recorrentes em `processes/`, usando `templates/process-record.md` quando um processo novo surgir.
- Registre decisoes de direcao em `decisions/`, incluindo dono, data, contexto e criterio de revisao.
- Registre informacoes de cursos e portfolio em `courses/`, separando fatos aprovados de hipoteses.

## Regras de governanca

- Tudo que orientar operacao, venda, entrega ou portfolio deve estar em markdown neste repositorio.
- Documentos devem indicar dono, status, ultima revisao e proxima revisao quando aplicavel.
- Promessas externas, precos, parcerias e mudancas de escopo dependem de aprovacao explicita de Mario antes de virarem compromisso.
- Fatos de cliente devem separar o que foi confirmado do que e inferencia ou proxima hipotese comercial.
- Atualizacoes devem ser pequenas, versionadas e revisaveis por diff.

## Estrutura

- `courses/`: portfolio, cursos existentes, lacunas e criterios de priorizacao.
- `decisions/`: decisoes executivas e seus criterios.
- `negotiations/`: oportunidades, historico de conversas, propostas e follow-ups.
- `operating-log/`: registro cronologico do trabalho feito no Paperclip.
- `processes/`: processos operacionais usados pela Pandora.
- `templates/`: modelos para manter registros consistentes.

## Rotina minima por heartbeat

1. Entender o issue e sua relacao com receita, entrega ou portfolio.
2. Fazer trabalho acionavel no repo ou no Paperclip.
3. Documentar o resultado em `operating-log/` quando o trabalho gerar conhecimento reutilizavel.
4. Atualizar documentos especificos afetados, como negociacao, processo, curso ou decisao.
5. Comentar no issue: status, o que mudou, o que resta e dono do proximo passo.
