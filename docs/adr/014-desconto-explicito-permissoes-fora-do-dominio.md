# ADR-014: Desconto explícito no modelo; permissões fora do domínio

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O valor pode ser alterado na conclusão, sem limite, por quem tiver permissão. O desconto afeta a participação do parceiro e a comissão.

## Decisão

`Desconto` é um value object (valor ou percentual, motivo, quem concedeu) e `valorCobrado` é calculado. A verificação de role acontece no serviço de aplicação. Invariante única: valor cobrado não negativo.

## Consequências

Descontos são rastreáveis. O domínio não depende do mecanismo de autorização.

## Alternativas descartadas

Permitir editar o valor cobrado diretamente.
