# ADR-028: Custo dos produtos pelo custo médio ponderado

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O Financeiro precisa do custo de cada consumo, venda e perda. Os produtos são comprados várias vezes, a preços diferentes, e consumidos em frações.

## Decisão

Cada item de estoque (depósito + produto) mantém um **custo médio ponderado**, recalculado a cada entrada. Saídas usam o custo médio do momento. Se o saldo estiver negativo ou zerado, a entrada define o novo custo sozinha.

## Consequências

Cálculo simples, compatível com consumo fracionado e com saldo negativo temporário.

## Alternativas descartadas

PEPS (primeiro a entrar, primeiro a sair), que exigiria controle por lote; custo da última compra.
