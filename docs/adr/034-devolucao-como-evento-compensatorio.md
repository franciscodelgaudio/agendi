# ADR-034: Devolução como evento compensatório, não como alteração da venda

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Uma venda concluída já foi propagada para Cobrança, Remuneração, Estoque e Liquidação. Alterá-la exigiria desfazer efeitos em todos.

## Decisão

Venda concluída é imutável. Correções são feitas por `devolver(itens, motivo)`, que publica `VendaDevolvida`; cada consumidor aplica a compensação (estorno da cobrança, comissão negativa, retorno ao estoque).

## Consequências

O histórico fica completo e cada contexto continua dono das próprias regras. Devoluções parciais e múltiplas são possíveis.

## Alternativas descartadas

Editar ou cancelar a venda concluída.
