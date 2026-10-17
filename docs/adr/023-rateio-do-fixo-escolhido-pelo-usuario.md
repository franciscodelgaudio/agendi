# ADR-023: Rateio do fixo mensal entre unidades escolhido pelo usuário

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Com comissões por unidade ([ADR-022](022-condicoes-de-comissao-por-unidade.md)), uma profissional pode atender em unidades de carteiras diferentes. O fixo mensal é um só e precisa ser lançado em alguma carteira. O negócio decidiu deixar a escolha com o usuário.

## Decisão

`RateioDoFixo` é um parâmetro da versão do plano, com três tipos: `UnidadePrincipal`, `PercentualPorUnidade` e `ProporcionalAProducao` (com unidade de fallback para meses sem produção). No fechamento, o fixo vira uma linha por unidade. A produção por unidade é acompanhada pela própria folha.

## Consequências

O custo do fixo aparece no resultado das carteiras de acordo com a política de cada empresa. A soma das linhas é sempre igual ao fixo, com a sobra de centavos indo para a unidade com a maior parte.

## Alternativas descartadas

Fixar uma única forma de rateio.
