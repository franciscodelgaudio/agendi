# ADR-035: Um atendimento pode ter mais de um serviço

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

O modelo previa um serviço por atendimento (`ServicoPrevisto` e `ServicoRealizado`). Ao comparar com o sistema em produção ([diagnóstico, M1](../06-diagnostico-migracao.md#2-decisões-tomadas-após-o-diagnóstico)), vimos que um atendimento registra até 20 itens, cada um com o seu profissional: por exemplo, uma massagem e uma esfoliação na mesma visita, com profissionais diferentes. O negócio confirmou que isso é uso real.

## Decisão

O atendimento passa a ter uma **lista de itens**: `previsto: ItemPrevisto[]` e `realizado: ItemRealizado[]`, com pelo menos um item. Cada item tem tipo de serviço, profissional (opcional, [ADR-037](037-servico-sem-profissional.md)), sala, intervalo e preço de tabela, e **reserva o seu próprio profissional e a sua própria sala** na `AgendaDaEmpresa`. O agendamento reserva **todos os itens ou nenhum**.

O **desconto continua sendo do atendimento** e é **rateado entre os itens** na proporção do preço de tabela de cada um. Os centavos que sobram do arredondamento vão para o item com o maior resto (empate: o item que vem antes), como o sistema já faz. A soma dos descontos rateados é sempre igual ao desconto.

Os eventos (`AtendimentoConcluido`, `AtendimentoCancelado`, `NoShowRegistrado`) passam a levar a **lista de itens**, com os valores de cada item e os totais. A consequência de cancelamento e no-show é calculada **por item** e somada.

## Consequências

A Cobrança continua com **uma cobrança por atendimento**, pelo total. A Remuneração gera uma linha por item que tenha profissional (a origem passa a ser atendimento + item). O Estoque baixa a ficha técnica de cada item. O limite de 20 itens é da aplicação, não do domínio. O evento `AtendimentoConcluido` ainda não foi implementado, então mudar o contrato agora não quebra nenhum consumidor.

## Alternativas descartadas

Um atendimento por serviço, agrupados numa "visita" (o desconto e a cobrança ficariam espalhados); desconto informado item por item (a recepção trabalha com o desconto no total).
