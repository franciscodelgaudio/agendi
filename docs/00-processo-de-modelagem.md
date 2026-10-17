# Processo de modelagem: o passo a passo até o modelo atual

Este documento registra **como** chegamos ao modelo, na ordem em que as coisas aconteceram: as perguntas feitas, as respostas do negócio, as decisões tomadas e as correções de rumo. Os outros documentos mostram **o resultado**; este mostra **o caminho**, para que qualquer pessoa entenda por que o modelo é como é.

> Documento vivo. Cada nova etapa da modelagem é acrescentada ao final.

## Sumário

| Etapa | Assunto | Resultado principal |
|---|---|---|
| [0](#etapa-0--ponto-de-partida) | Ponto de partida | Roteiro de DDD para um sistema existente |
| [1](#etapa-1--entender-a-técnica-de-event-storming) | Entender o Event Storming | Técnica, níveis e legenda de cores |
| [2](#etapa-2--primeiro-event-storming-do-fluxo-principal) | Primeiro Event Storming | Fluxo do atendimento convertido em eventos |
| [3](#etapa-3--hotspots-rodada-1) | Hotspots, rodada 1 | Variações do negócio descobertas |
| [4](#etapa-4--problema-real-ou-modelo-genérico) | Problema real × genérico | Estratégia de generalização e os dois "repasses" |
| [5](#etapa-5--hotspots-rodada-2-faixas-carteiras-e-estoque) | Hotspots, rodada 2 | Faixas, Carteira, Estoque fracionado |
| [6](#etapa-6--hotspots-rodada-3-hierarquia-e-rateio) | Hotspots, rodada 3 | Caixa × Carteira, Estoque × Depósito, rateio |
| [7](#etapa-7--fórmulas-ou-regras-tipadas) | Fórmulas × regras tipadas | Regras como tipos fechados |
| [8](#etapa-8--domínio-subdomínios-e-a-correção-de-nível) | Domínio e subdomínios | Correção: subdomínio ≠ bounded context |
| [9](#etapa-9--revisão-da-classificação) | Revisão da classificação | Atendimento core; Unidade era entidade-deus |
| [10](#etapa-10--lista-final-de-bounded-contexts) | Lista final de contextos | 10 contextos e o context map |
| [11](#etapa-11--modelagem-tática) | Modelagem tática | Organização, Atendimento, Liquidação |
| [12](#etapa-12--documentação) | Documentação | Este pacote (draw.io + Markdown) |
| [13](#etapa-13--fechamento-da-liquidação-com-parceiro) | Fechamento da Liquidação | Revisão com data escolhida, conciliação, base combinada adiada |
| [14](#etapa-14--modelagem-tática-da-remuneração) | Remuneração | Plano com versões, metas separadas, folha mensal |
| [15](#etapa-15--modelagem-tática-do-financeiro) | Financeiro | Resultado, títulos e caixa separados |
| [16](#etapa-16--modelagem-tática-do-estoque) | Estoque | Custo médio, ficha técnica no Estoque, variação por depósito |
| [17](#etapa-17--vendas-e-contextos-genéricos) | Vendas e genéricos | Devolução compensatória, modalidade por cobrança, preços por unidade |
| [18](#etapa-18--comparação-com-o-código-e-decisões-do-diagnóstico) | Comparação com o código | Atendimento com vários serviços, capacidade da sala, oferta por unidade, períodos da liquidação, CPF, quarto |
| [—](#lições-do-processo) | Lições do processo | O que vale repetir nos próximos contextos |
| [—](#base-teórica) | Base teórica | As fontes de cada técnica e como se relacionam com o DDD |
| [—](#como-replicar-o-método) | Como replicar o método | Roteiro, padrões reutilizáveis e como alterar este sistema |

---

## Etapa 0 — Ponto de partida

**Situação.** O sistema já estava parcialmente construído e apresentava falhas de modelagem. O objetivo era remodelá-lo com DDD sem começar do zero.

**O que fizemos.** Definimos um roteiro de DDD adaptado a sistemas existentes:

| Passo | Atividade |
|---|---|
| 0 | Diagnosticar o modelo atual (modelo anêmico, entidades-deus, modelo guiado pelo banco, termos ambíguos, transações enormes, acoplamento circular) |
| 1 | Entender o domínio com **Event Storming**, olhando para o negócio e não para o código |
| 2 | Construir a **linguagem ubíqua** (glossário) |
| 3 | Classificar os **subdomínios** (core, supporting, generic) |
| 4 | Definir os **bounded contexts** e o **context map** |
| 5 | **Modelagem tática** em cada contexto (agregados, entidades, value objects, eventos) |
| 6 | Arquitetura que proteja o domínio (hexagonal / clean) |
| 7 | **Migração incremental** (testes de caracterização, Strangler Fig, Anti-Corruption Layer) |

**Princípio adotado.** Entender o negócio primeiro, comparar com o código depois. As divergências entre os dois são as falhas de modelagem.

---

## Etapa 1 — Entender a técnica de Event Storming

**Pergunta.** Como funciona o Event Storming?

**O que definimos.**
- Começar pelos **eventos** (fatos no passado), não por entidades ou tabelas.
- Três níveis: **Big Picture** (negócio inteiro, descobre fronteiras), **Process Level** (um processo em detalhe) e **Design Level** (agregados e invariantes).
- Legenda de cores (veja [Event Storming](04-event-storming.md)): evento laranja, comando azul, ator amarelo, política lilás, read model verde, sistema externo rosa, hotspot vermelho, agregado amarelo grande.
- A gramática do Design Level: `Ator → vê Read Model → executa Comando → no Agregado → gera Evento → dispara Política → novo Comando`.
- Para achar agregados: *"para aceitar ou rejeitar este comando, quais dados e regras preciso verificar ao mesmo tempo?"*

---

## Etapa 2 — Primeiro Event Storming do fluxo principal

**Entrada do negócio.** O fluxo descrito:

1. Um hóspede pede uma massagem no SPA.
2. A recepcionista agenda o hóspede com uma massagista.
3. O sistema verifica se a massagista e o espaço estão disponíveis.
4. A recepcionista registra o atendimento quando é finalizado.
5. O sistema registra o serviço feito e o valor.
6. O sistema registra o valor como lucro previsto, porque o repasse acontece num momento específico do mês.
7. O lucro tem o repasse da massagista.

**O que fizemos.** Convertemos o fluxo na gramática do Event Storming (Massagem Solicitada → Sessão Agendada → Atendimento Concluído → políticas de cobrança e de repasse → fechamento do período).

**Descobertas.**
- O passo 3 **não é um evento**: "verificar disponibilidade" é uma **invariante** do comando *Agendar*. Isso indicou onde fica a fronteira de um agregado.
- Os passos 5 e 6 nascem do **mesmo fato** (*Atendimento Concluído*), que dispara **duas políticas independentes**: cobrança e repasse. Provavelmente o código antigo fazia tudo numa só transação.
- O **"lucro previsto"** provavelmente não deveria ser gravado como dado próprio, e sim calculado (read model). Guardar lucro como campo é uma falha comum: o número dessincroniza quando algo muda.
- Primeiros contextos candidatos: Agenda, Atendimento, Cobrança, Repasse, Resultado.
- Primeiros sinais de **termos com dois sentidos**: *Massagista* (recurso de agenda × beneficiária de pagamento) e *Serviço* (tipo de massagem × serviço realizado).

---

## Etapa 3 — Hotspots, rodada 1

Levantamos oito perguntas. As respostas do negócio:

| # | Pergunta | Resposta | Consequência no modelo |
|---|---|---|---|
| 1 | O que é "lucro previsto"? | Existem **dois tipos de relação**: unidade dentro de estabelecimento parceiro (repasse no fim do mês) e unidade com espaço próprio (lucro quando o cliente paga). Uma mesma empresa pode ter unidades nos dois modelos. | A **modalidade é da Unidade**, não da Empresa, e tem vigência |
| 2 | Como o repasse é calculado? | Precisa suportar percentual, fixo, **salário + comissão e bônus**. A regra antiga vale para atendimentos antigos. | **Snapshot** das regras no momento do fato |
| 3 | Como o hóspede paga? | Todas as opções: na hora (espaço próprio) ou via parceiro. A massagista pode **receber ou não** se o cliente não pagar. | Política de inadimplência configurável |
| 4 | Cancelamento e no-show? | O usuário define se cobra e se a massagista recebe. | Política de cancelamento configurável |
| 5 | Atendimento diferente do agendado? | Pode ser diferente. | Separar **previsto** de **realizado** |
| 6 | Agendamento concorrente? | Pode, desde que em espaços ou unidades diferentes. | Invariante de disponibilidade por recurso |
| 7 | Vínculo da massagista? | Própria, podendo ser PJ; modelar também terceirizada. | Tipo de vínculo no cadastro do profissional |
| 8 | Ajustes após o fechamento? | Uma **role específica** decide se fica no mês ou vai para o seguinte. | Comando restrito por permissão |

---

## Etapa 4 — Problema real ou modelo genérico?

**Pergunta do negócio.** Modelar só o problema do cliente real ou já generalizar para vender a outros modelos de negócio?

**Decisão.** Resolver o problema real com profundidade e modelar **explicitamente apenas as variações já conhecidas**, cada uma como uma **política com um conjunto fechado de tipos**. Generalizar quando houver dois ou três casos concretos (o que já acontecia em quase todos os eixos). Veja [ADR-001](adr/001-problema-real-com-variacoes-explicitas.md).

**Eixos de variação identificados:** modalidade da unidade, remuneração do profissional, cliente que não pagou, cancelamento/no-show, competência de ajustes.

**Descoberta importante: existiam dois "repasses".** A palavra *repasse* era usada para dois fluxos de dinheiro opostos:

| Fluxo | Novo nome | Natureza |
|---|---|---|
| Parceiro → SPA | **Liquidação com Parceiro** | Dinheiro **a receber** |
| SPA → Profissional | **Remuneração do Profissional** | Dinheiro **a pagar** |

Veja [ADR-009](adr/009-dois-repasses-dois-contextos.md).

**Armadilhas registradas:** motor de regras com fórmulas livres; enum com `if` espalhado; entidade cheia de campos opcionais; multi-tenant e configurações avançadas antes da hora.

**Novos hotspots:** quem assume o risco quando o hóspede não paga na modalidade parceiro; se o hotel desconta algo antes de repassar; se salário e bônus são calculados pelo sistema.

---

## Etapa 5 — Hotspots, rodada 2: faixas, carteiras e estoque

| Pergunta | Resposta |
|---|---|
| Na modalidade parceiro, quem assume a inadimplência? | No caso real o hotel paga mesmo assim, mas deve existir a opção de **descontar**. |
| O hotel desconta algo antes de repassar? | Sim, com **faixas**: por exemplo, até R$ 30.000 o hotel fica com 30%; acima, 35%. |
| Salário e bônus são calculados pelo sistema? | Sim, num **caixa**. |
| (informação nova) | O caixa tem **carteiras**: contas compartilhadas entre unidades, que dividem lucro e prejuízo. Uma unidade também pode ter carteira própria. |
| (informação nova) | O **estoque** segue o mesmo padrão (compartilhado entre unidades). É preciso controlar **venda de produtos** e **consumo fracionado** (um frasco de 1 L, ~30 ml por atendimento, sem certeza da quantidade). |

**Decisões.**
- **Liquidação:** como a faixa depende do total do mês, a participação do parceiro só é definitiva no **fechamento**. Durante o mês existe uma **previsão** que usa o mesmo cálculo. Modelamos `AcordoComParceiro` (com vigência) e `LiquidacaoDoPeriodo`.
- **Carteira:** um **livro de lançamentos imutáveis**; saldo sempre calculado; correções por estorno/ajuste; cada lançamento guarda a unidade de origem. Veja [ADR-010](adr/010-lancamentos-imutaveis.md).
- **Estoque:** controle na **unidade base** (ml, g, unidade) com **embalagens**; consumo por **ficha técnica** (baixa teórica) corrigido por **inventário**; indicador **teórico × real**; baixa teórica **nunca bloqueia** o atendimento; venda pode exigir saldo. Veja [ADR-013](adr/013-consumo-teorico-e-inventario.md).
- **Carteira e estoque são agrupamentos independentes** (duas unidades podem dividir estoque sem dividir resultado). Veja [ADR-011](adr/011-agrupamentos-financeiro-e-estoque.md).

---

## Etapa 6 — Hotspots, rodada 3: hierarquia e rateio

| Pergunta | Resposta | Decisão |
|---|---|---|
| Faixas progressivas ou por patamar? | **Ambas** | Dois tipos de regra |
| O parceiro participa da venda de produtos? | **O usuário decide** | Uma regra por **categoria de receita** no acordo |
| O profissional ganha comissão em produtos? | **Pode ganhar** | Plano de remuneração com **componentes**; a venda registra o profissional responsável (opcional) |
| "Caixa" e "carteira" são a mesma coisa? | **Não.** Caixa é o total das carteiras; falta um nome para dividir o estoque | **Caixa / Carteira** e **Estoque / Depósito** |
| A carteira pode ratear de forma desigual? | **Sim** | Vínculos com percentual; soma = 100% por vigência |

---

## Etapa 7 — Fórmulas ou regras tipadas?

**Pergunta do negócio.** Não seria mais simples deixar o usuário escrever fórmulas?

**Decisão.** Não, por três motivos: quem escreve é o dono do SPA (erro silencioso com dinheiro); fórmula é caixa-preta para o sistema (não dá para explicar o cálculo, mostrar "quanto falta para mudar de faixa" nem simular); e o código não fica mais simples, só muda de lugar (seria preciso um interpretador seguro). As regras são **tipos fechados** com a mesma interface (`calcular`, `explicar`). Fórmula pode virar um tipo a mais no futuro, sem mudar o modelo. Veja [ADR-002](adr/002-regras-tipadas-em-vez-de-formulas.md).

**Respostas desta rodada.**

| Pergunta | Resposta | Decisão |
|---|---|---|
| A faixa de serviços olha só os serviços ou o total? | No caso real, **separada**; tratar também a combinada | Parâmetro `BaseDeApuracao: Separada \| Combinada` |
| O rateio da carteira é entre unidades ou pessoas? | **Entre unidades** | Financeiro fica em gestão e resultado, sem distribuição a pessoas |
| Despesas comuns (aluguel) vão para onde? | **Para a carteira** | Lançamentos sem unidade de origem |
| O Caixa tem lançamentos próprios? | **Sim** | Caixa vira **agregado**; o consolidado é read model |
| Metas: individuais, por unidade ou por carteira? Com base em quê? | **Os três escopos, com base nos três** | `Meta` com escopo, indicador, alvo e recompensa |

Neste ponto o negócio sinalizou que a modelagem estava ficando complexa demais, e seguimos para a próxima etapa do DDD.

---

## Etapa 8 — Domínio, subdomínios e a correção de nível

**Erro cometido.** Começamos a "classificar subdomínios" usando uma lista que, na verdade, era de **bounded contexts**, sem ter definido o domínio nem os subdomínios. O negócio apontou o problema.

**Correção: os três níveis.**

| Nível | Espaço | O que é |
|---|---|---|
| Domínio | Problema | A área de negócio inteira (uma só) |
| Subdomínios | Problema | Partes naturais do negócio; existem independentemente do software (**descobertos**) |
| Bounded contexts | Solução | Fronteiras do modelo no software (**projetadas**) |

**Domínio:** gestão de negócios de bem-estar (SPA). Subdomínios identificados por três critérios: capacidades do negócio, quem se importa e eventos-pivô do Event Storming. Veja [Visão geral](01-visao-geral.md).

**Correção que isso revelou.** A "Configuração Comercial", que tínhamos desenhado como contexto central, **não correspondia a nenhum subdomínio**: era um "lugar onde ficam as configurações", sinal de modelagem guiada por telas. Ela foi removida e cada regra passou a morar no contexto que a usa. Veja [ADR-004](adr/004-sem-contexto-de-configuracao.md).

---

## Etapa 9 — Revisão da classificação

**Contestação do negócio.** A Operação de Atendimento é core "sem sombra de dúvidas" (o mais usado), e a Estrutura Organizacional também (onde mais havia problemas).

**Critério esclarecido.** Core é **onde o negócio se diferencia da concorrência**, não o mais usado nem o mais problemático.

| Critério | O que indica |
|---|---|
| Mais usado | Importância operacional |
| Mais problemático | Complexidade ou modelagem errada |
| Diferencial competitivo | **Core** |

**Resultado.**
- **Atendimento: Core.** O negócio confirmou que o diferencial está também no atendimento (parceiro × espaço próprio, previsto × realizado, políticas configuráveis).
- **Organização: Supporting**, e não generic como havia sido proposto. O negócio confirmou a hipótese levantada: a **Unidade era o modelo central de tudo**, e quando o negócio real mostrou que não era assim, vieram as gambiarras. A solução é **esvaziar a Unidade**, não promovê-la. Veja [ADR-003](adr/003-unidade-esvaziada.md) e [ADR-015](adr/015-classificacao-dos-subdominios.md).

---

## Etapa 10 — Lista final de bounded contexts

Consolidamos a lista (que estava espalhada por várias respostas) e o [context map](02-context-map.md):

1. Organização · 2. Atendimento · 3. Vendas · 4. Cobrança · 5. Liquidação com Parceiro · 6. Remuneração · 7. Financeiro · 8. Estoque · 9. Catálogo · 10. Clientes

**Mudanças nesta etapa.**
- **Agenda e Atendimento viraram um único contexto**, com dois agregados: mesmo subdomínio, mesmas pessoas, mesma linguagem. Veja [ADR-005](adr/005-agenda-e-atendimento-no-mesmo-contexto.md).
- **Clientes** entrou como contexto próprio (etapa 11) porque o cadastro de clientes recorrentes é usado por Atendimento, Vendas e Cobrança.

---

## Etapa 11 — Modelagem tática

**Método aplicado em cada contexto.**

1. Listar comandos e eventos
2. Listar invariantes
3. Agrupar invariantes em agregados
4. Separar entidades e value objects
5. Definir eventos publicados (o contrato)
6. Definir repositórios e serviços de aplicação
7. Escrever testes de domínio para cada invariante

### 11.1 Organização (primeiro, para esvaziar a Unidade)

Fizemos o exercício de perguntar, para cada coisa que a Unidade carregava, **qual contexto realmente precisa disso**. Acordo com parceiro foi para Liquidação; carteira e rateio para Financeiro; depósito para Estoque; salas para Atendimento; comissões para Remuneração; políticas de cancelamento para Atendimento. A Unidade ficou com nome, endereço e situação. Veja [Organização](contextos/organizacao.md).

### 11.2 Atendimento (core)

Primeira versão: `AgendaDaUnidade` (por dia) e `Atendimento` (ciclo de vida). Pendências levantadas e respostas:

| Pendência | Resposta | Mudança |
|---|---|---|
| O profissional atende em duas unidades no mesmo dia? | **Sim**; usar agenda por empresa e por dia | `AgendaDaUnidade` → **`AgendaDaEmpresa`**, com concorrência otimista ([ADR-006](adr/006-agenda-por-empresa-e-dia.md)) |
| Quem pode alterar o valor na conclusão? | Permissões por role; desconto **sem limite** | `Desconto` como value object explícito; permissão fora do domínio ([ADR-014](adr/014-desconto-explicito-permissoes-fora-do-dominio.md)) |
| Cliente avulso ou recorrente? | **Ambos** | `ClienteDoAtendimento = Avulso \| Recorrente`; novo contexto **Clientes** |

Decisão de desenho central: **os eventos carregam as consequências já calculadas** (valor a cobrar, base de remuneração), para que nenhuma regra de cancelamento vaze para outros contextos. Veja [ADR-007](adr/007-eventos-com-consequencias-calculadas.md) e [Atendimento](contextos/atendimento.md).

### 11.3 Liquidação com Parceiro (core, rascunho)

`AcordoComParceiro` (versões com vigência) e `LiquidacaoDoPeriodo` (receitas, ajustes, previsão e fechamento com o mesmo cálculo). Ficaram três pendências do contexto (L1 a L3), resolvidas na [etapa 13](#etapa-13--fechamento-da-liquidação-com-parceiro). Veja [Liquidação com Parceiro](contextos/liquidacao-parceiro.md).

---

## Etapa 12 — Documentação

**Decisão.** Diagramas no **draw.io**, salvos como `.drawio.svg` (imagem que o Markdown exibe e que continua editável no draw.io), e o restante em **Markdown**, no repositório. Padrões usados: Core Domain Chart, Context Map, Bounded Context Canvas, Event Storming, C4, UML (classes, estados, sequência) e ADRs. A documentação evolui junto com a conversa de modelagem.

---

## Etapa 13 — Fechamento da Liquidação com Parceiro

As três pendências do rascunho foram respondidas.

| # | Pergunta | Opções apresentadas | Resposta do negócio |
|---|---|---|---|
| L1 | O acordo pode ser revisado no meio do mês? | (a) só no mês seguinte; (b) dividir o mês em dois trechos | **O usuário decide.** Na opção (b), deve ficar claro a partir de quando a nova regra vale |
| L2 | O parceiro pagou um valor diferente do apurado | (a) pendência de conciliação; (b) aceitar automaticamente; (c) bloquear | **(a)** |
| L3 | Como aplicar faixas progressivas com base combinada? | proporcional; serviços primeiro; serviços por último; deixar para depois | **Deixar para depois.** O negócio lembrou que a escolha de incluir produtos já existe e vai modelar a base combinada como outra ideia |

**Mudanças no modelo.**
- A `Vigencia` da versão do acordo passou de mês para **data**. `revisar(novaVersao, aPartirDe)` recebe `InicioDoProximoPeriodo` ou uma data.
- A liquidação passou a ter **trechos** (versão + intervalo). Para manter o limite das faixas mensal, as faixas olham o **acumulado do mês** e cada trecho define só os percentuais. Isso ficou como premissa a confirmar (L4). Veja [ADR-016](adr/016-revisao-do-acordo-com-data-escolhida.md).
- Novo estado **EmDivergencia**, recebimentos múltiplos e `aceitarDiferenca(motivo)`. Veja [ADR-017](adr/017-conciliacao-do-recebimento.md).
- O parâmetro `BaseDeApuracao` **saiu do modelo**. Veja [ADR-018](adr/018-base-combinada-adiada.md).

Com isso, a Liquidação com Parceiro passou de rascunho para **modelagem tática definida**. Veja [Liquidação com Parceiro](contextos/liquidacao-parceiro.md).

A premissa L4 (com dois trechos, as faixas olham o acumulado do mês inteiro) foi confirmada pelo negócio em seguida.

---

## Etapa 14 — Modelagem tática da Remuneração

Aplicamos os sete passos ao terceiro contexto core. As perguntas em aberto foram tratadas assim:

| # | Pergunta | Como entrou no modelo |
|---|---|---|
| R1 | Comissão sobre valor cobrado ou preço de tabela? | Seguindo o padrão do negócio de deixar o usuário decidir, virou parâmetro do plano (`baseDaComissao`), com padrão "valor cobrado" ([ADR-019](adr/019-base-da-comissao-configuravel.md)) |
| R4 | Onde fica a regra "recebe ou não se o cliente não pagar"? | No plano; a linha da folha é retida e liberada conforme a cobrança |
| R2, R3 | Indicadores de meta e divisão do bônus coletivo | Modelados com padrões, a confirmar |
| R5 | Comissão diferente por unidade? | Levantada nesta etapa. O negócio confirmou que **sim**: o plano passou a ter condições padrão e exceções por unidade, e toda linha da folha registra a unidade ([ADR-022](adr/022-condicoes-de-comissao-por-unidade.md)). Isso gerou a pergunta R6, sobre a carteira do fixo mensal |
| R6 | Em qual carteira entra o fixo mensal de quem atende em várias unidades? | O usuário escolhe entre unidade principal, percentual por unidade ou proporcional à produção ([ADR-023](adr/023-rateio-do-fixo-escolhido-pelo-usuario.md)) |

**Decisões principais.**
- O plano reutiliza o padrão de **versões com data de início escolhida**, criado para o acordo com parceiro. O fixo mensal é **proporcional aos dias** de cada versão.
- **Meta** (definição) e **Acompanhamento da Meta** (medição) são agregados separados, e as metas são **apuradas antes** de fechar as folhas ([ADR-020](adr/020-metas-com-acompanhamento-separado.md)).
- Fatos que chegam com a folha fechada entram na **próxima folha**, como competência anterior ([ADR-021](adr/021-fato-tardio-entra-na-proxima-folha.md)).

Veja [Remuneração](contextos/remuneracao.md).

---

## Etapa 15 — Modelagem tática do Financeiro

Primeiro contexto supporting depois dos três core. A estrutura (Caixa, Carteiras, rateio, lançamentos imutáveis) já vinha das etapas 5 a 7; aqui ela virou agregados.

**Descoberta principal.** O "lançamento" que imaginávamos misturava duas coisas: **resultado** (quanto se ganhou no mês) e **dinheiro** (quanto entrou). É a mesma diferença que o cliente real vive: lucro em março, dinheiro do hotel em abril. O modelo separou três registros: **Lançamento**, **Título** e **Movimento de Caixa** ([ADR-025](adr/025-resultado-titulos-e-caixa-separados.md)).

**Outras decisões.**
- A composição das carteiras ficou num agregado por empresa, para garantir que uma unidade esteja numa única carteira ([ADR-024](adr/024-estrutura-financeira-num-agregado.md)).
- Toda unidade nova ganha uma carteira própria ([ADR-026](adr/026-unidade-nova-ganha-carteira-propria.md)).
- Ao ligar Liquidação e Financeiro, apareceu uma lacuna: o Financeiro precisava saber de **cada** pagamento do hotel, não só do final. A Liquidação passou a publicar `RecebimentoRegistrado`.
- Pagamentos nunca são recusados (o dinheiro já se moveu); diferenças são resolvidas por abatimento ou acréscimo com lançamento de ajuste.

**Premissas a confirmar:** F1 (carteira mudando no meio do mês), F2 (quando o custo do produto entra no resultado) e F3 (contas separadas de dinheiro). Veja [Financeiro](contextos/financeiro.md).

---

## Etapa 16 — Modelagem tática do Estoque

O consumo fracionado e o inventário já tinham sido desenhados na etapa 5. Aqui eles viraram agregados.

**Decisões.**
- A estrutura de estoque segue o **mesmo padrão da financeira**: um agregado por empresa, um depósito próprio para cada unidade nova, e o estoque central como um depósito sem unidades ([ADR-030](adr/030-estrutura-de-estoque-espelha-a-financeira.md)).
- A **ficha técnica saiu do Catálogo** e foi para o Estoque, porque estimar consumo é uma regra de estoque ([ADR-027](adr/027-ficha-tecnica-no-estoque.md)).
- Para entregar custos ao Financeiro, o estoque usa **custo médio ponderado** ([ADR-028](adr/028-custo-medio-ponderado.md)).
- O que fazer com venda sem saldo ficou **a critério do usuário**, por depósito ([ADR-029](adr/029-politica-de-venda-sem-saldo-por-deposito.md)).

**Correção.** Na etapa 5 havíamos dito que a variação teórico × real poderia ser vista por profissional. Ao modelar, ficou claro que isso não é possível: ninguém mede quanto cada massagista usou. O real é medido por depósito e produto; por profissional, só o teórico.

**Premissas a confirmar:** E1 a E4, incluindo a nova E4 (quem arca com perdas num depósito compartilhado por carteiras diferentes). Veja [Estoque](contextos/estoque.md).

---

## Etapa 17 — Vendas e contextos genéricos

Fechamos os quatro contextos restantes. **Vendas** recebeu os sete passos completos; **Cobrança**, **Catálogo** e **Clientes**, por serem genéricos, receberam um modelo mais enxuto.

**Decisões.**
- **Vendas:** venda concluída é imutável; correções são **devoluções**, que cada contexto compensa à sua maneira ([ADR-034](adr/034-devolucao-como-evento-compensatorio.md)).
- **Cobrança:** a modalidade (`NaHora` ou `ContaDoHospede`) é decidida **por cobrança**, porque um SPA de hotel também atende clientes de fora ([ADR-031](adr/031-modalidade-de-cobranca-por-cobranca.md)). A receita entra no resultado quando a cobrança é criada ([ADR-032](adr/032-receita-reconhecida-na-cobranca.md)). Gateway e sistema do hotel ficam atrás de uma ACL, com um adaptador manual para hotéis sem integração.
- **Catálogo:** preços seguem o padrão "padrão + exceções por unidade" já usado nas comissões ([ADR-033](adr/033-precos-com-padrao-e-excecao-por-unidade.md)). A unidade base de um produto nunca muda.
- **Clientes:** consentimento e anonimização para a LGPD. Ficou registrado um alerta: se o SPA quiser guardar **ficha de anamnese**, ela é dado de saúde e precisa de um tratamento próprio (CL1).

**Lacunas encontradas ao ligar os contextos.** A Liquidação passou a publicar `AcordoEncerrado` e a consumir `CobrancaEstornada`; Remuneração e Financeiro passaram a reagir a `CobrancaRecuperada` e às devoluções.

Com esta etapa, **todos os dez contextos têm modelagem tática definida**. O que resta são as premissas a confirmar em [Pendências](05-pendencias.md) e o passo 7 do roteiro: a **migração** do sistema atual.

---

## Etapa 18 — Comparação com o código e decisões do diagnóstico

**Situação.** Com o modelo completo, começamos o passo 7 do roteiro: comparar o modelo com o código em produção, contexto por contexto, e planejar a migração. O resultado está no [Diagnóstico para a migração](06-diagnostico-migracao.md). Seguindo o princípio da etapa 0 (negócio primeiro, código depois), as divergências não foram corrigidas automaticamente a favor do modelo: cada uma virou uma pergunta ao negócio, porque às vezes quem estava certo era o código.

**O que o código mostrou.** Em vários pontos, o uso real era mais rico que as premissas do modelo:

| # | O que o código faz | O que o modelo dizia | Resposta do negócio (17/10/2026) |
|---|---|---|---|
| M1 | Um atendimento tem até 20 itens, cada um com o seu profissional | Um serviço por atendimento | **Mais de um serviço por atendimento.** Previsto e realizado viram listas de itens; cada item reserva o seu profissional e a sua sala; o desconto é do atendimento e é rateado entre os itens ([ADR-035](adr/035-atendimento-com-varios-servicos.md)) |
| M2 | Salas comportam de 1 a 10 atendimentos ao mesmo tempo | Premissa A1: um atendimento por vez | **A sala tem uma capacidade.** O negócio pediu um termo genérico ("maca" não serve: pode ser cadeira, banheira): **Capacidade da Sala**. A1 era falsa ([ADR-036](adr/036-capacidade-da-sala.md)) |
| M3 | Serviço sem profissional (hidromassagem) | Todo atendimento tem profissional | **Manter como hoje.** A oferta diz se exige profissional; sem profissional, a reserva ocupa só a sala e não há remuneração ([ADR-037](adr/037-servico-sem-profissional.md)) |
| M4 | Só faixas por patamar | Progressivas e por patamar | **O usuário escolhe**, com um exemplo numérico de cada na tela. O modelo já previa os dois tipos |
| M5 | Participação do parceiro semanal, quinzenal ou mensal | Só mensal | **Manter os três.** O período deixa de ser (ano, mês), e as faixas olham o acumulado do período ([ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md)) |
| M6 | Serviço cadastrado por unidade, com preço, duração, salas e "exige profissional" próprios | Tipo por empresa com preço padrão + exceção por unidade | **Cada unidade mantém a sua Oferta do Serviço**; o Tipo de Serviço é a identidade comum da empresa ([ADR-039](adr/039-oferta-do-servico-por-unidade.md)) |
| M7 | Não há cadastro de cliente | Cliente identificado pelo telefone | **A identidade é o CPF**, único por empresa; o cliente tem vários telefones ([ADR-040](adr/040-cpf-como-identidade-do-cliente.md)) |
| M8 | Quarto obrigatório em todo atendimento | Quarto opcional | **Opcional no espaço próprio, obrigatório em unidade com parceiro** ([ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md)) |
| M9 | Produtos contados em "unidade" | Unidade base em ml, g ou unidade | **Migrar como "unidade"**; o gestor recadastra em ml ou g quando quiser |

**Mudanças no modelo.**
- **Atendimento:** itens no previsto, no realizado e nos eventos; nova invariante da agenda (ocupação da sala ≤ capacidade); `profissionalId` opcional; o quarto saiu do cliente e foi para o atendimento. Remuneração, Estoque e Cobrança passaram a tratar o evento item a item (a Cobrança continua com uma cobrança pelo total).
- **Catálogo:** `TipoDeServico` ficou só com identidade e nome; nasceu o agregado `OfertaDoServico`. O ADR-033 passou a valer só para produtos.
- **Liquidação com Parceiro:** periodicidade na versão do acordo e `Periodo` com início e fim. O ADR-016 foi substituído em parte: onde dizia "mês inteiro", vale "período do acordo".
- **Clientes:** CPF como identidade, lista de telefones; o CPF é dado pessoal comum pela LGPD, não sensível.

**Conflito encontrado.** A decisão do quarto (M8) não se concilia com o [ADR-031](adr/031-modalidade-de-cobranca-por-cobranca.md): se o quarto é obrigatório em unidade com parceiro, o cliente de fora, que pela regra da Cobrança paga na hora, não tem como ser registrado. Em vez de escolher uma saída sozinhos, registramos a decisão como tomada e abrimos a pendência **C3** com as opções para o negócio.

**Novas perguntas.** A3 (reduzir a capacidade de uma sala com reservas futuras), L5 (revisão que muda a periodicidade), L6 (semana que atravessa a virada do mês no Financeiro) e CL2 (cliente sem CPF). A1, C1 e K1 foram para as resolvidas. Veja [Pendências](05-pendencias.md).

**Lição.** A comparação com o código também valida o modelo. Aqui, o código tinha razão em vários pontos: o modelo tinha simplificado demais (um serviço por atendimento, uma pessoa por sala, só mês). O diagnóstico não serve só para achar falhas no código, mas também premissas erradas no modelo.

---

## Lições do processo

1. **Negócio primeiro, código depois.** As falhas aparecem na comparação.
2. **Os hotspots são o trabalho.** Cada rodada de perguntas mudou o modelo mais do que qualquer diagrama.
3. **Desconfie de palavras repetidas.** *Repasse*, *Massagista*, *Serviço* e *Caixa* tinham mais de um sentido; cada um revelou uma fronteira.
4. **Generalize com casos concretos**, como tipos fechados, nunca como configuração aberta.
5. **Não pule níveis.** Domínio → subdomínios → contextos. Pular gerou a "Configuração Comercial".
6. **Core é diferencial**, não uso nem dor.
7. **Entidade-deus se resolve esvaziando**, não promovendo.
8. **Registre o porquê** (ADRs) no momento da decisão.

---

## Base teórica

Esta seção reúne as referências por trás de cada técnica usada nas etapas acima e explica como cada uma se encaixa no DDD. Serve para estudar o método e aplicá-lo em outros sistemas.

> **Sobre as fontes.** A **fonte primária** deste modelo foi o conhecimento do negócio: as respostas dadas a cada rodada de hotspots, a partir do caso real do cliente. As obras abaixo são as referências das **técnicas** aplicadas sobre esse conhecimento; nenhum documento externo foi consultado durante as sessões. É exatamente o que Evans chama de *knowledge crunching*: a técnica organiza, mas o conteúdo vem de quem conhece o domínio.

### Mapa: etapa → técnica → fonte

| Etapa | Técnica aplicada | Fonte principal | Papel no DDD |
|---|---|---|---|
| 0 | Roteiro de DDD para sistema existente; diagnóstico (modelo anêmico, entidade-deus) | Evans (2003); Fowler, *Anemic Domain Model* | Ponto de partida: o modelo deve refletir o negócio, e o código atual é comparado a ele |
| 1–2 | Event Storming (Big Picture, Process e Design Level) | Brandolini, *Introducing EventStorming* | Descoberta colaborativa do domínio; revela eventos, comandos, políticas e agregados |
| 3, 5–7 | Rodadas de hotspots; linguagem ubíqua; glossário | Brandolini (hotspots); Evans, cap. 2 | Transformar dúvidas em conhecimento explícito e fixar o vocabulário do negócio |
| 4 | Generalizar só com casos concretos; variações como tipos fechados | Fowler, *Refactoring* (regra de três); Evans, cap. 12 (*Strategy/Policy*) | Evitar abstração prematura; tornar as regras do negócio conceitos explícitos |
| 7 | Regras tipadas em vez de fórmulas | Evans, cap. 10 (*Intention-Revealing Interfaces*) e cap. 12 | O modelo "entende" a regra: valida, explica e simula |
| 8 | Domínio, subdomínios e bounded contexts | Evans, parte IV; Vernon (2013), cap. 2; Khononov (2021), cap. 1–3 | Separar o espaço do problema (descoberto) do espaço da solução (projetado) |
| 9 | Classificação core / supporting / generic | Evans, cap. 15 (*Distillation*); Khononov (2021); DDD Crew, *Core Domain Charts* | Decidir onde investir o esforço de modelagem |
| 10 | Context Map e padrões de relacionamento | Evans, cap. 14; DDD Crew, *Context Mapping*; Context Mapper | Explicitar dependências e traduções entre modelos |
| 11–17 | Agregados, entidades, value objects, repositórios, serviços, eventos | Evans, parte II; Evans, *DDD Reference* (eventos de domínio); Vernon (2011), *Effective Aggregate Design* | O núcleo tático: proteger invariantes com fronteiras de consistência pequenas |
| 11–17 | Canvas por agregado e por contexto | DDD Crew, *Aggregate Design Canvas* e *Bounded Context Canvas* | Checklist para não esquecer invariantes, eventos e concorrência |
| 13–14 | Versões com vigência por data; snapshot das regras | Fowler, *Temporal Patterns* (*Temporal Property*, *Effectivity*) | Modelar regras que mudam no tempo sem alterar o passado |
| 15 | Lançamentos imutáveis, contas, títulos e baixas | Fowler, *Analysis Patterns*, cap. 6 (*Inventory and Accounting*); Helland, *Immutability Changes Everything* | Dinheiro e estoque como fatos imutáveis; saldo sempre calculado |
| 15–17 | Regime de competência × caixa; custo médio ponderado | CPC 00 (Estrutura Conceitual); CPC 16 (Estoques) | Regras contábeis brasileiras que o modelo financeiro e de estoque respeitam |
| 11–17 | Idempotência no consumo de eventos | Hohpe e Woolf, *Enterprise Integration Patterns* (*Idempotent Receiver*) | Eventos podem chegar repetidos; cada agregado ignora origens já processadas |
| 11–17 | Consistência eventual entre agregados; fechamentos orquestrados | Vernon (2013), cap. 8 e 10; Garcia-Molina e Salem, *Sagas* | Uma transação altera um agregado; o resto reage a eventos |
| 11, 15 | Concorrência otimista (versão, contador) | Fowler, *Patterns of Enterprise Application Architecture* (*Optimistic Offline Lock*) | Garantir invariantes com disputa sem travar o sistema |
| 10, 17 | Anti-Corruption Layer com portas e adaptadores | Evans, cap. 14 (ACL); Cockburn, *Hexagonal Architecture* | Isolar gateway e PMS do hotel para que conceitos externos não contaminem o modelo |
| 12 | Documentação: C4, ADR, docs-as-code, draw.io | Brown, *C4 Model*; Nygard, *Documenting Architecture Decisions* | Registrar o modelo e, principalmente, o porquê das decisões |
| 17 | Consentimento, anonimização, dado sensível | Lei 13.709/2018 (LGPD) | Restrição legal que molda o contexto Clientes |
| 18 (passo 7) | Diagnóstico código × modelo; testes de caracterização; Strangler Fig | Fowler, *Anemic Domain Model*; Feathers (2004); Fowler, *Strangler Fig Application* | Validar o modelo contra o uso real e migrar o sistema existente sem reescrever tudo de uma vez |

### As fontes e como cada uma se relaciona com o DDD

#### Fundamentos

**Eric Evans — *Domain-Driven Design: Tackling Complexity in the Heart of Software* (Addison-Wesley, 2003).**
O livro que define o DDD. A parte I trata de linguagem ubíqua e *knowledge crunching*; a parte II traz os blocos táticos (entidades, value objects, agregados, repositórios, serviços); a parte III fala de refatorar em direção a um modelo mais profundo; a parte IV é o design estratégico (bounded contexts, context map, destilação do core domain). *Neste projeto:* é a base de todas as etapas. Os capítulos mais usados foram o 2 (linguagem), o 5 e o 6 (blocos táticos), o 14 (context map) e o 15 (core domain).

**Eric Evans — *Domain-Driven Design Reference* (2015).** [domainlanguage.com/ddd/reference](https://www.domainlanguage.com/ddd/reference/)
Resumo oficial e gratuito dos padrões, com acréscimos posteriores ao livro, como **Domain Events**. *Neste projeto:* referência para os eventos publicados por cada contexto. É o material mais rápido para consulta.

**Vaughn Vernon — *Implementing Domain-Driven Design* (Addison-Wesley, 2013).**
Leva o DDD para a implementação: subdomínios × contextos (cap. 2), context maps (cap. 3), arquitetura (cap. 4), eventos de domínio (cap. 8), agregados (cap. 10). *Neste projeto:* base da correção da etapa 8 (subdomínio ≠ bounded context) e da regra "um agregado por transação; o resto por eventos".

**Vaughn Vernon — *Domain-Driven Design Distilled* (Addison-Wesley, 2016).**
Versão curta e didática do DDD, boa para apresentar o método a outras pessoas da equipe.

**Vlad Khononov — *Learning Domain-Driven Design* (O'Reilly, 2021).**
Explica com clareza a classificação core / supporting / generic e como ela decide o tipo de modelagem (modelo rico × CRUD × comprar pronto). *Neste projeto:* base da etapa 9, em que "mais usado" e "mais problemático" foram separados de "diferencial competitivo".

#### Descoberta do domínio

**Alberto Brandolini — *Introducing EventStorming* (Leanpub).** [eventstorming.com](https://www.eventstorming.com/)
Criador da técnica. Define os níveis (Big Picture, Process, Design), a gramática de post-its e o uso dos **hotspots**. *Neste projeto:* etapas 1 e 2 e o método de rodadas de perguntas que conduziu toda a modelagem. Relação com o DDD: é a ferramenta mais usada hoje para chegar à linguagem ubíqua e aos bounded contexts.

#### Design estratégico

**DDD Crew — repositórios abertos de ferramentas de DDD.** [github.com/ddd-crew](https://www.github.com/ddd-crew)
Comunidade que mantém os modelos gratuitos usados aqui: **Core Domain Charts** (gráfico diferenciação × complexidade), **Context Mapping** (notação de relacionamentos), **Bounded Context Canvas** e **Aggregate Design Canvas**. Também há versões prontas no Miro ([template de DDD estratégico](https://miro.com/templates/strategic-domain-driven-design-template/), [Bounded Context Canvas](https://miro.com/miroverse/the-bounded-context-canvas)). *Neste projeto:* o Core Domain Chart da visão geral e o checklist usado em cada contexto.

**Context Mapper.** [contextmapper.org](https://contextmapper.org/)
Linguagem e ferramenta para descrever context maps em texto e gerar diagramas. Alternativa ao draw.io quando se quer validar a notação automaticamente.

#### Design tático

**Vaughn Vernon — *Effective Aggregate Design* (ensaio em 3 partes, 2011).** [dddcommunity.org/library/vernon_2011](https://www.dddcommunity.org/library/vernon_2011/)
As quatro regras de agregados: modelar invariantes verdadeiras dentro da fronteira; manter agregados pequenos; referenciar outros agregados por ID; usar consistência eventual fora da fronteira. *Neste projeto:* aplicadas em todos os contextos. Exemplos: `Lancamento` como agregado próprio (para não carregar o mês inteiro), `EstruturaFinanceira` agrupando as carteiras (porque a invariante envolve todas) e `Meta` separada de `AcompanhamentoDaMeta`.

**Martin Fowler — *Temporal Patterns*.** [martinfowler.com/eaaDev/timeNarrative.html](https://martinfowler.com/eaaDev/timeNarrative.html) · [Temporal Property](https://martinfowler.com/eaaDev/TemporalProperty.html)
Padrões para valores que mudam no tempo. *Neste projeto:* origem das **versões com vigência** (acordos, planos, fichas técnicas, preços, composições) e da regra "o fato usa a versão vigente na sua data". Relação com o DDD: dá forma tática à invariante "mudar a regra não muda o passado".

**Martin Fowler — *Analysis Patterns: Reusable Object Models* (Addison-Wesley, 1996), cap. 6 (*Inventory and Accounting*).**
Padrões de contas, lançamentos e transações. *Neste projeto:* base do Financeiro (lançamentos imutáveis, estorno em vez de edição, saldo calculado) e das movimentações do Estoque.

**Pat Helland — *Immutability Changes Everything* (CIDR, 2015).**
Argumenta que registrar fatos imutáveis ("contadores não usam borracha") simplifica sistemas distribuídos. *Neste projeto:* reforça o ADR-010 e a decisão de nunca editar lançamentos, movimentações ou vendas concluídas.

**Martin Fowler — *Patterns of Enterprise Application Architecture* (Addison-Wesley, 2002).**
Entre outros, o padrão *Optimistic Offline Lock*. *Neste projeto:* concorrência otimista na `AgendaDaEmpresa`, no `ItemDeEstoque` e no contador do `PeriodoFinanceiro`.

#### Integração entre contextos

**Gregor Hohpe e Bobby Woolf — *Enterprise Integration Patterns* (Addison-Wesley, 2003).** [Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html)
Catálogo de padrões de mensageria. *Neste projeto:* a regra "a mesma origem não é processada duas vezes", presente em todos os consumidores de eventos.

**Hector Garcia-Molina e Kenneth Salem — *Sagas* (ACM SIGMOD, 1987).**
Origem do conceito de processos longos feitos de passos locais com compensação. *Neste projeto:* transferências entre depósitos, fechamento do período de remuneração (metas → bônus → fixo → folhas) e devoluções como compensação ([ADR-034](adr/034-devolucao-como-evento-compensatorio.md)).

**Alistair Cockburn — *Hexagonal Architecture* (2005); Cockburn e Garrido de Paz, *Hexagonal Architecture Explained* (2024).**
Ports and Adapters: o domínio define interfaces (portas) e a infraestrutura as implementa (adaptadores). *Neste projeto:* as portas `GatewayDePagamento` e `SistemaDoParceiro` da Cobrança, incluindo o adaptador manual. Relação com o DDD: é a forma mais comum de implementar uma Anti-Corruption Layer e de manter o domínio livre de framework.

#### Documentação

**Simon Brown — *The C4 Model*.** [c4model.com](https://c4model.com/)
Quatro níveis de diagrama de arquitetura (contexto, containers, componentes, código). *Neste projeto:* C4 nível 1 na visão geral. Relação com o DDD: o nível 2 é onde os bounded contexts viram módulos ou serviços.

**Michael Nygard — *Documenting Architecture Decisions* (2011).** [cognitect.com/blog](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) · [adr.github.io](https://adr.github.io/)
Formato dos ADRs (contexto, decisão, consequências). *Neste projeto:* os 34 ADRs. Relação com o DDD: o modelo muda a cada rodada de conhecimento, e o ADR guarda o porquê de cada forma que ele assumiu.

**draw.io.** [drawio.com](https://www.drawio.com/)
Ferramenta de diagramas usada no formato `.drawio.svg`, que é imagem e fonte editável ao mesmo tempo.

#### Legislação e normas

**Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD).** [planalto.gov.br](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
*Neste projeto:* consentimento por finalidade, anonimização e o alerta sobre dados de saúde (CL1) no contexto Clientes.

**Comitê de Pronunciamentos Contábeis — CPC 00 (Estrutura Conceitual) e CPC 16 (Estoques).**
O CPC 00 fundamenta o **regime de competência** (receita e despesa no mês em que ocorrem, não no mês do pagamento); o CPC 16 admite o **custo médio ponderado** para avaliar estoques. *Neste projeto:* ADR-025, ADR-028 e ADR-032. Vale validar com o contador do cliente.

#### Migração (passo 7, em andamento: etapa 18)

**Michael Feathers — *Working Effectively with Legacy Code* (Prentice Hall, 2004).**
Testes de caracterização: registrar o comportamento atual antes de mudar o código.

**Martin Fowler — *Strangler Fig Application*.** [martinfowler.com/bliki/StranglerFigApplication.html](https://martinfowler.com/bliki/StranglerFigApplication.html)
Substituir o sistema aos poucos, com o novo crescendo ao lado do antigo. Relação com o DDD: cada bounded context é uma unidade natural de substituição, protegida do legado por uma ACL.

**Martin Fowler — *Anemic Domain Model*.** [martinfowler.com/bliki/AnemicDomainModel.html](https://martinfowler.com/bliki/AnemicDomainModel.html)
Descreve o sintoma mais comum em sistemas existentes: entidades só com dados e regras espalhadas em serviços. Útil no diagnóstico inicial.

### Por onde estudar

1. *DDD Reference* (Evans) e *DDD Distilled* (Vernon): visão geral rápida.
2. *Learning Domain-Driven Design* (Khononov): estratégico, com exemplos atuais.
3. *Introducing EventStorming* (Brandolini): para conduzir os workshops.
4. *Effective Aggregate Design* (Vernon): antes de modelar qualquer agregado.
5. *Domain-Driven Design* (Evans): o aprofundamento, especialmente as partes III e IV.

---

## Como replicar o método

### Roteiro para um sistema novo ou existente

| # | Passo | Entrada | Perguntas que guiam | Artefato | Fonte |
|---|---|---|---|---|---|
| 1 | Diagnóstico | Código e queixas atuais | Onde as regras estão espalhadas? Que classe todo mundo usa? Onde surgem gambiarras? | Lista de sintomas | Evans; Fowler (*Anemic*) |
| 2 | Big Picture | Especialistas do negócio | O que acontece, em ordem? Onde ninguém concorda? | Linha do tempo de eventos e hotspots | Brandolini |
| 3 | Rodadas de hotspots | Hotspots abertos | O que muda de um cliente para outro? O que acontece quando dá errado? | Respostas registradas no processo | Brandolini; Evans (*knowledge crunching*) |
| 4 | Linguagem ubíqua | Termos usados | Alguma palavra tem dois sentidos? | Glossário por contexto | Evans, cap. 2 |
| 5 | Domínio e subdomínios | Capacidades do negócio | Quem se importa com isso? Onde o processo muda de fase? | Lista de subdomínios | Vernon, cap. 2; Khononov |
| 6 | Classificação | Subdomínios | Isso diferencia o negócio da concorrência? | Core Domain Chart | Evans, cap. 15; DDD Crew |
| 7 | Bounded contexts e context map | Subdomínios e glossário | Onde cada termo tem um sentido só? Quem depende de quem? | Context map | Evans, cap. 14; DDD Crew |
| 8 | Modelagem tática (7 passos por contexto) | Um contexto, começando pelo core | Que regras nunca podem ser violadas? O que precisa ser verdadeiro ao mesmo tempo? | Documento do contexto e diagramas | Evans, parte II; Vernon (2011) |
| 9 | Registro das decisões | Cada escolha não óbvia | Por que assim? O que foi descartado? | ADR | Nygard |
| 10 | Migração | Modelo e código | Como garantir que nada quebrou? Por qual contexto começar? | Plano de migração | Feathers; Fowler (*Strangler Fig*) |

Os **sete passos táticos** usados em cada contexto: (1) comandos e eventos; (2) invariantes; (3) agregados a partir das invariantes; (4) entidades e value objects; (5) eventos publicados; (6) repositórios e serviços de aplicação; (7) testes de domínio com números.

### Padrões que surgiram neste projeto e podem ser reutilizados

Estes padrões apareceram mais de uma vez aqui e tendem a se repetir em outros sistemas de gestão:

| Padrão | Quando usar | Onde foi aplicado | Fonte |
|---|---|---|---|
| **Variação como tipo fechado** com `calcular` e `explicar` | O negócio tem várias formas conhecidas de calcular algo | Participação do parceiro, comissões, rateio do fixo | Evans (*Policy*); [ADR-002](adr/002-regras-tipadas-em-vez-de-formulas.md) |
| **"O usuário decide" como parâmetro tipado** | Clientes diferentes querem regras diferentes | Base da comissão, revisão de acordo, venda sem saldo, rateio do fixo | [ADR-001](adr/001-problema-real-com-variacoes-explicitas.md) |
| **Versões com data de início escolhida** | Regras que mudam no tempo | Acordos, planos, fichas, preços, carteiras | Fowler (*Temporal Property*); [ADR-016](adr/016-revisao-do-acordo-com-data-escolhida.md) |
| **Snapshot da regra no fato** | O passado não pode mudar quando a regra muda | Atendimento, venda, linhas da folha, liquidação | [ADR-008](adr/008-snapshot-das-regras-no-momento-do-fato.md) |
| **Padrão + exceções por unidade** | A mesma regra varia por local | Comissões, preços de produtos (serviços: oferta por unidade, [ADR-039](adr/039-oferta-do-servico-por-unidade.md)) | [ADR-022](adr/022-condicoes-de-comissao-por-unidade.md), [ADR-033](adr/033-precos-com-padrao-e-excecao-por-unidade.md) |
| **Estrutura por empresa** para invariantes de agrupamento | "Cada X pertence a um único Y" | Carteiras, depósitos | [ADR-024](adr/024-estrutura-financeira-num-agregado.md), [ADR-030](adr/030-estrutura-de-estoque-espelha-a-financeira.md) |
| **Definição × acompanhamento** | Uma regra estável medida continuamente | Meta / AcompanhamentoDaMeta | [ADR-020](adr/020-metas-com-acompanhamento-separado.md) |
| **Previsão com o mesmo cálculo do fechamento** | É preciso ver o resultado antes do fim do período | Liquidação, lucro previsto | [ADR-012](adr/012-lucro-previsto-como-read-model.md) |
| **Fatos imutáveis + compensação** | Dinheiro, estoque, qualquer coisa auditável | Lançamentos, movimentações, devoluções | Fowler (*Analysis Patterns*); Helland |
| **Fato tardio vai para o próximo período** | Períodos fecham, mas fatos atrasam | Folha, períodos financeiros | [ADR-021](adr/021-fato-tardio-entra-na-proxima-folha.md) |
| **Evento com consequência já calculada** | Uma regra afeta vários contextos | Cancelamento e no-show | [ADR-007](adr/007-eventos-com-consequencias-calculadas.md) |
| **Esvaziar a entidade-deus** | Uma classe é "o centro de tudo" | Unidade | [ADR-003](adr/003-unidade-esvaziada.md) |
| **Resultado × título × caixa** | Há diferença entre ganhar e receber | Financeiro | [ADR-025](adr/025-resultado-titulos-e-caixa-separados.md) |

### Como alterar este sistema

Quando surgir uma regra nova ou uma mudança no negócio:

1. **Comece pelo hotspot.** Escreva a pergunta e as opções com um exemplo numérico, como foi feito em todas as etapas.
2. **Procure no glossário.** O termo novo já existe? Tem o mesmo sentido? Se não, pode ser um contexto novo ou uma fronteira mal traçada.
3. **Encontre o contexto dono da regra.** Regras moram no contexto que as usa ([ADR-004](adr/004-sem-contexto-de-configuracao.md)). Se a mudança exige alterar vários contextos ao mesmo tempo, revise o context map.
4. **Verifique os padrões existentes.** A mudança cabe num padrão da tabela acima, como um novo tipo fechado ou uma nova exceção por unidade?
5. **Revise as invariantes do agregado** e escreva os testes com números antes do código.
6. **Atualize o contrato dos eventos** se outros contextos forem afetados, mantendo compatibilidade com quem já consome.
7. **Registre um ADR.** Se a decisão substituir outra, marque a antiga como *Substituída*.
8. **Atualize a documentação:** o documento do contexto, o glossário, as pendências e uma nova etapa neste processo.
