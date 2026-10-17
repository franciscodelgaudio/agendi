# ADR-029: Venda sem saldo: política configurável por depósito

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O consumo estimado nunca bloqueia o atendimento, mas a venda é uma saída exata. Alguns negócios querem impedir vender o que o sistema diz não ter; outros preferem vender e corrigir no inventário.

## Decisão

Cada depósito tem uma `politicaDeVenda`: `Bloquear` ou `PermitirComAlerta`. Com `Bloquear`, o Vendas consulta a disponibilidade antes de concluir a venda, e o Estoque recusa a saída se não houver saldo.

## Consequências

O usuário decide. A verificação na venda usa uma consulta ao saldo, então duas vendas simultâneas do último item podem passar; o Estoque emite `SaldoNegativoDetectado` nesse caso.

## Alternativas descartadas

Sempre bloquear; nunca bloquear.
