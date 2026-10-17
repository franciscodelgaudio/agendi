# ADR-030: Estrutura de estoque no mesmo padrão da financeira

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Unidades compartilham depósitos, como compartilham carteiras, e a regra "uma unidade usa um único depósito em cada data" envolve todos os depósitos.

## Decisão

`EstruturaDeEstoque` (uma por empresa) guarda os depósitos e seus vínculos com vigência. Toda unidade nova ganha um depósito próprio. Um depósito pode ter várias unidades ou nenhuma (estoque central).

## Consequências

Mesmo padrão do Financeiro ([ADR-024](024-estrutura-financeira-num-agregado.md) e [ADR-026](026-unidade-nova-ganha-carteira-propria.md)), mais fácil de entender e de implementar. O estoque central não exige um conceito novo.

## Alternativas descartadas

Um agregado por depósito; um conceito separado de "estoque central".
