# ADR-036: Capacidade da Sala

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

O modelo partia da premissa A1: *cada sala atende um atendimento por vez*. O sistema em produção mostra salas que comportam de 1 a 10 atendimentos ao mesmo tempo (`beds`), como uma sala com duas macas ou uma área de hidromassagem para quatro pessoas. O negócio confirmou (M2) e pediu um termo genérico: o lugar pode ser uma maca, uma cadeira, uma banheira.

## Decisão

Toda sala tem uma **Capacidade da Sala**: quantos atendimentos ela comporta ao mesmo tempo (número inteiro, no mínimo 1). Cada item reservado na sala ocupa um lugar.

Nova invariante da `AgendaDaEmpresa`: **em nenhum momento do intervalo a ocupação da sala passa da sua capacidade**. A ocupação é o maior número de reservas simultâneas no intervalo; uma reserva que só encosta no início ou no fim não conta. A capacidade é lida da `Sala` no momento da reserva. No código, `beds` passa a se chamar `capacity` (com migração).

## Consequências

A premissa A1 era falsa e sai das pendências. Uma sala com capacidade 1 se comporta exatamente como no modelo anterior. A redução da capacidade de uma sala com reservas futuras acima do novo limite ficou como premissa a confirmar (A3). O termo "maca" não entra na linguagem do modelo.

## Alternativas descartadas

Cadastrar cada maca ou cadeira como um recurso separado (obrigaria a recepção a escolher o lugar, o que o negócio não controla); manter "um atendimento por vez".
