# ADR-031: Modalidade de cobrança decidida por cobrança

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Num SPA dentro de hotel, a maioria dos clientes são hóspedes, que pagam pela conta do quarto. Mas clientes de fora também podem ser atendidos e pagam na hora.

## Decisão

A modalidade (`NaHora` ou `ContaDoHospede`) é decidida para cada cobrança: `ContaDoHospede` quando a unidade tem acordo com parceiro e o cliente tem quarto informado; caso contrário, `NaHora`. A Cobrança mantém uma cópia local de quais unidades têm acordo.

## Consequências

Os dois tipos de cliente convivem na mesma unidade. A Liquidação recebe só as cobranças `ContaDoHospede`.

## Alternativas descartadas

Modalidade fixa por unidade.
