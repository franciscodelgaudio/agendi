# ADR-026: Unidade nova ganha uma carteira própria automaticamente

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Todo lançamento de unidade precisa de uma carteira. Uma unidade recém-criada ainda não foi agrupada pelo gestor.

## Decisão

Quando chega `UnidadeCriada`, o Financeiro cria uma carteira com o nome da unidade e 100% de participação. O gestor pode reagrupar depois.

## Consequências

Nenhum lançamento fica sem carteira. O caso mais comum (uma carteira por unidade) não exige configuração.

## Alternativas descartadas

Exigir que o gestor escolha a carteira ao criar a unidade; aceitar lançamentos sem carteira.
