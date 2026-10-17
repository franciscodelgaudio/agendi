# ADR-008: Regras congeladas (snapshot) no momento do fato

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Regras de comissão, políticas e preços mudam com o tempo. O negócio definiu que vale a regra vigente quando o fato aconteceu.

## Decisão

Atendimentos, vendas, linhas de folha e liquidações guardam uma cópia das regras e preços aplicados. Toda regra tem **vigência**.

## Consequências

Mudar uma regra não altera o passado; o histórico é reproduzível. Mais dados duplicados, de forma intencional.

## Alternativas descartadas

Consultar sempre a regra atual.
