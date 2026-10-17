# ADR-021: Fato que chega após o fechamento entra na próxima folha

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Um atendimento pode ser concluído ou corrigido depois que a folha do mês foi fechada. O negócio já havia definido que uma role decide se o valor fica no mês original ou vai para o seguinte.

## Decisão

Por padrão, a linha entra na **próxima folha aberta**, marcada como *competência anterior*. A role autorizada pode, em vez disso, reabrir a folha original.

## Consequências

O fluxo não trava e o histórico mostra a competência de cada valor.

## Alternativas descartadas

Rejeitar o fato; reabrir a folha automaticamente.
