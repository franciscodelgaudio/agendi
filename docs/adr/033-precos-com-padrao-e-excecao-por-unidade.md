# ADR-033: Preços com padrão e exceções por unidade

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O mesmo serviço pode ter preços diferentes em unidades diferentes (no hotel e no espaço próprio).

## Decisão

`TabelaDePreco` tem versões padrão e versões por unidade, todas com vigência. O preço usado é o da unidade, se houver, ou o padrão.

## Consequências

Mesmo padrão das condições de comissão ([ADR-022](022-condicoes-de-comissao-por-unidade.md)). Abrir uma unidade nova não exige cadastrar preços.

## Alternativas descartadas

Um catálogo por unidade; preço único por empresa.
