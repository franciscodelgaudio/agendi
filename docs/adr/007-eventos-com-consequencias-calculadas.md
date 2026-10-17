# ADR-007: Eventos carregam as consequências já calculadas

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Cancelamento e no-show têm regras configuráveis de cobrança e de remuneração. Se cada consumidor recalculasse, as regras se espalhariam por vários contextos.

## Decisão

O Atendimento aplica a `PoliticaDeCancelamento` e publica `valorACobrar` e `baseDeRemuneracao` nos eventos. Cobrança e Remuneração usam os valores sem conhecer a regra.

## Consequências

Cada regra mora num só lugar. Os eventos ficam um pouco maiores e passam a ser um contrato que precisa ser versionado com cuidado.

## Alternativas descartadas

Publicar só o fato e deixar cada consumidor aplicar a política.
