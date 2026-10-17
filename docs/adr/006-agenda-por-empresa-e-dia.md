# ADR-006: Agenda por empresa e por dia, com concorrência otimista

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

A primeira versão usava `AgendaDaUnidade` por dia. O negócio confirmou que **um profissional pode atender em duas unidades no mesmo dia**; uma agenda por unidade não impediria conflito de horário entre unidades.

## Decisão

Agregado `AgendaDaEmpresa` (empresa + dia), com número de versão. Conflitos de gravação simultânea são resolvidos por **nova tentativa automática** no serviço de aplicação.

## Consequências

Recepcionistas de unidades diferentes disputam o mesmo agregado, o que é aceitável no volume de um SPA. Se o volume crescer, pode-se migrar para uma restrição de exclusão no banco (ex.: exclusion constraint do PostgreSQL) sem mudar o restante do modelo.

## Alternativas descartadas

Agenda por unidade; restrição no banco; saga com agregados separados de profissional e sala.
