# ADR-015: Classificação dos subdomínios

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Houve divergência: o negócio considerava core o que era mais usado (Atendimento) e o que tinha mais problemas (Estrutura Organizacional).

## Decisão

Critério de core = **diferenciação competitiva**. Core: Atendimento (confirmado pelo negócio), Liquidação com Parceiro, Remuneração. Supporting: Organização, Vendas, Estoque, Financeiro. Generic: Catálogo, Clientes, Cobrança, fiscal e acesso.

## Consequências

O esforço de modelagem tática completa vai para os três contextos core. Organização recebe modelagem cuidadosa, mas o objetivo é mantê-la pequena.

## Alternativas descartadas

Classificar por volume de uso ou por quantidade de problemas.
