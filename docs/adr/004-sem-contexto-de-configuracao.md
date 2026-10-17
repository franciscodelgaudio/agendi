# ADR-004: Não existe contexto de "Configuração Comercial"

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Um contexto central de configurações foi desenhado no primeiro context map. Ao separar domínio, subdomínios e contextos, verificou-se que ele não correspondia a nenhum subdomínio: era um lugar onde ficam configurações, sinal de modelagem guiada por telas.

## Decisão

Cada regra mora no contexto que a usa: acordo com parceiro na Liquidação; plano e metas na Remuneração; políticas de cancelamento no Atendimento; agrupamentos no Financeiro e no Estoque.

## Consequências

Quem altera uma regra mexe em um único contexto. As telas de configuração podem continuar agrupadas na interface, mas o modelo não.

## Alternativas descartadas

Contexto central de configuração.
