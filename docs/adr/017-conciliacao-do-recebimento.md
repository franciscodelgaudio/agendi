# ADR-017: Conciliação do recebimento com estado de divergência

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O parceiro pode repassar um valor diferente do apurado.

## Decisão

Um recebimento diferente do apurado leva a liquidação ao estado **EmDivergencia**. Ela sai desse estado com um recebimento complementar que zere a diferença ou quando uma role autorizada **aceita a diferença**, com motivo. A diferença aceita fica registrada separadamente; a apuração não muda.

## Consequências

Nenhuma diferença passa despercebida e o fluxo não trava. O histórico mostra o que o contrato previa e o que foi pago. O Financeiro recebe um lançamento de ajuste quando a diferença é aceita.

## Alternativas descartadas

Aceitar automaticamente o valor do parceiro; bloquear a liquidação até resolver.
