# ADR-020: Meta e Acompanhamento da Meta como agregados separados, apurados antes da folha

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Metas podem ser individuais, por unidade ou por carteira, e o bônus de uma meta coletiva vai para várias folhas.

## Decisão

`Meta` guarda a definição (escopo, indicador, alvo, recompensa, distribuição). `AcompanhamentoDaMeta` (meta + período) recebe as contribuições e apura o resultado. No fechamento, as metas são apuradas primeiro e o bônus é adicionado às folhas de cada beneficiário; só então as folhas são fechadas.

## Consequências

Uma meta coletiva não obriga várias folhas a mudarem na mesma transação. O fechamento do período tem uma ordem obrigatória, orquestrada por um serviço de aplicação. Metas de carteira exigem uma cópia local dos vínculos de carteira.

## Alternativas descartadas

Calcular o bônus dentro de cada folha.
