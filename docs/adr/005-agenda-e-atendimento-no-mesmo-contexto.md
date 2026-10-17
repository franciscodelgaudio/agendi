# ADR-005: Agenda e Atendimento num único bounded context

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Agenda e Atendimento foram inicialmente propostos como contextos separados.

## Decisão

Formam um único contexto, **Atendimento**, com dois agregados (`AgendaDaEmpresa` e `Atendimento`): pertencem ao mesmo subdomínio, são usados pelas mesmas pessoas e falam a mesma língua.

## Consequências

Menos integração entre contextos. Os dois agregados continuam com fronteiras de consistência separadas.

## Alternativas descartadas

Dois contextos integrados por eventos.
