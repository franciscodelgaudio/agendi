# ADR-010: Livro de lançamentos imutáveis

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Dinheiro de várias unidades e carteiras exige rastreabilidade. Estoque também precisa explicar seu saldo.

## Decisão

Financeiro, Estoque e Liquidação registram **fatos imutáveis** (lançamentos, movimentações, receitas). Saldos são calculados. Correções entram como estornos ou ajustes.

## Consequências

Auditoria completa e reprocessamento possível. Consultas de saldo podem precisar de read models para desempenho.

## Alternativas descartadas

Saldos editáveis.
