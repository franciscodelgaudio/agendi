# ADR-037: Serviço sem profissional

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

Alguns serviços não têm profissional: o cliente usa a sala sozinho, como na hidromassagem. O sistema em produção já trata esse caso (`Service.requiresTherapist = false`, agendamento sem profissional). O modelo exigia um profissional em todo atendimento. O negócio decidiu manter o comportamento atual (M3).

## Decisão

A **Oferta do Serviço** na unidade ([ADR-039](039-oferta-do-servico-por-unidade.md)) diz se o serviço **exige profissional**. Quando exige, o item precisa ter profissional. Quando não exige, o item **não tem profissional** e a reserva **ocupa só a sala**, respeitando a capacidade ([ADR-036](036-capacidade-da-sala.md)).

Item sem profissional **não gera remuneração**: a Remuneração ignora esse item, e a consequência de cancelamento ou no-show tem base de remuneração zero para ele.

## Consequências

`profissionalId` passa a ser opcional no item, na reserva e nos eventos. Cobrança e Estoque tratam o item normalmente (ele é cobrado e baixa a ficha técnica), e a receita entra no faturamento da unidade. Metas por profissional não contam esses itens.

## Alternativas descartadas

Um profissional fictício "sem profissional" (poluiria a agenda, os relatórios e a folha); tratar esses serviços fora do Atendimento.
