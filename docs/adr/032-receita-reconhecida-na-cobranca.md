# ADR-032: Receita reconhecida quando a cobrança é criada

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Era preciso definir quando a receita de um serviço entra no resultado: quando o serviço é cobrado ou quando o dinheiro chega.

## Decisão

`ServicoCobrado` e `VendaCobrada` são publicados na criação da cobrança, e o Financeiro lança a receita nesse momento (competência). Pagamento gera só entrada de caixa; inadimplência gera perda; recuperação estorna a perda.

## Consequências

O resultado do mês reflete os serviços prestados, coerente com a separação entre resultado e caixa ([ADR-025](025-resultado-titulos-e-caixa-separados.md)).

## Alternativas descartadas

Reconhecer a receita só no pagamento (regime de caixa).
