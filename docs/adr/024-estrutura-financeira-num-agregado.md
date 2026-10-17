# ADR-024: Composição das carteiras num único agregado por empresa

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

A regra "uma unidade pertence a exatamente uma carteira em cada data" envolve todas as carteiras ao mesmo tempo. Se cada carteira fosse um agregado, mover uma unidade alteraria dois agregados na mesma transação.

## Decisão

`EstruturaFinanceira` (uma por empresa) guarda todas as carteiras e suas composições versionadas. Os lançamentos, períodos e títulos ficam em agregados próprios.

## Consequências

A invariante é garantida num só lugar. Como a composição muda raramente, não há disputa por esse agregado.

## Alternativas descartadas

Um agregado por carteira com verificação por consulta; restrição no banco.
