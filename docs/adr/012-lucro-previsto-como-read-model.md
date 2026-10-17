# ADR-012: Lucro previsto é calculado, não gravado

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O cliente real precisa ver o lucro antes do repasse do hotel. Armazenar o lucro como dado próprio dessincroniza quando algo muda, e a participação por faixas só é definitiva no fim do mês.

## Decisão

O lucro previsto é um **read model**. A previsão da liquidação usa **o mesmo cálculo** do fechamento; o fechamento apenas congela o resultado.

## Consequências

O número previsto e o definitivo nunca divergem por diferença de lógica.

## Alternativas descartadas

Gravar o lucro previsto em cada atendimento.
