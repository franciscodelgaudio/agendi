# ADR-039: Cada unidade mantém a sua própria Oferta do Serviço

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

O modelo tinha um `TipoDeServico` por empresa, com duração padrão e uma `TabelaDePreco` com padrão e exceções por unidade ([ADR-033](033-precos-com-padrao-e-excecao-por-unidade.md)). O sistema em produção cadastra o serviço **por unidade**, com preço, duração, salas e "exige profissional" próprios. O diagnóstico mostrou que juntar esses cadastros por nome é arriscado, porque esses campos diferem de uma unidade para outra. O negócio decidiu que cada unidade mantém a sua oferta.

## Decisão

- O **Tipo de Serviço** é da empresa: identidade comum e nome (ex.: "Massagem relaxante").
- Cada unidade tem uma **Oferta do Serviço** (`OfertaDoServico`, identificada por tipo de serviço + unidade), com **duração, salas permitidas, se exige profissional e preço com vigência** próprios.
- Uma unidade só agenda os tipos de serviço para os quais tem oferta ativa. Ao agendar, o Atendimento copia o preço da oferta da unidade (snapshot).

Para **serviços**, isso substitui o padrão "preço padrão + exceção por unidade". Para **produtos**, o [ADR-033](033-precos-com-padrao-e-excecao-por-unidade.md) continua valendo.

## Consequências

Tudo o que olha "o serviço" na empresa continua usando o `tipoServicoId`: comissão por tipo, ficha técnica, metas e relatórios consolidados. Ao contrário do que o ADR-033 previa, abrir uma unidade nova exige cadastrar as ofertas (é o que já acontece hoje).

As salas pertencem ao Atendimento: a oferta guarda só os IDs das salas permitidas, e o Catálogo consulta as salas da unidade pela API pública do Atendimento. Isso cria uma dependência do Catálogo em relação ao Atendimento, registrada no [Context Map](../02-context-map.md).

Migração: cada `Service` atual vira a oferta da sua unidade; os tipos de serviço são criados agrupando os nomes iguais dentro da empresa; nomes diferentes viram tipos diferentes.

## Alternativas descartadas

Padrão + exceção por unidade também para serviços (duração, salas e "exige profissional" variam por unidade, e salas não têm um padrão da empresa); catálogo inteiro por unidade, sem tipo comum (perderia comissão por tipo, ficha técnica e relatórios consolidados).
