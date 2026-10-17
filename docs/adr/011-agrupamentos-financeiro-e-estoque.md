# ADR-011: Caixa/Carteira e Estoque/Depósito como agrupamentos independentes

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Unidades compartilham resultado financeiro e estoque, mas não necessariamente do mesmo jeito. O negócio definiu que o Caixa é o total das carteiras e pediu um nome equivalente para o estoque.

## Decisão

Financeiro: **Caixa** (com lançamentos próprios) → **Carteira** (unidades com percentual e vigência). Estoque: **Estoque** (total) → **Depósito**. Os dois agrupamentos são independentes.

## Consequências

Duas unidades podem dividir estoque sem dividir resultado, e vice-versa. O consolidado financeiro é um read model.

## Alternativas descartadas

Um conceito genérico "Grupo de Unidades" para ambos.
