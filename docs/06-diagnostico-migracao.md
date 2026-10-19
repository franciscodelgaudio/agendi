# Diagnóstico para a migração: código atual × modelo DDD

Passo 7 do roteiro ([Processo de modelagem](00-processo-de-modelagem.md#etapa-0--ponto-de-partida)): comparar o modelo com o código e planejar a migração incremental. Este documento registra o que o código em `project/src` faz hoje, onde ele diverge de cada contexto e em que ordem vamos mudar.

> Levantamento feito em 17/10/2026, sobre o commit `9379601`. As referências `arquivo:linha` valem para esse commit. Caminhos relativos a `project/src`.

## Sumário

| Seção | Conteúdo |
|---|---|
| [1](#1-resumo) | Resumo |
| [2](#2-decisões-tomadas-após-o-diagnóstico) | Decisões tomadas após o diagnóstico |
| [3](#3-problemas-transversais) | Problemas transversais |
| [4](#4-arquitetura-atual) | Arquitetura atual |
| [5](#5-diagnóstico-por-contexto) | Diagnóstico por contexto |
| [6](#6-funcionalidades-fora-do-modelo) | Funcionalidades fora do modelo |
| [7](#7-arquitetura-alvo) | Arquitetura alvo |
| [8](#8-plano-de-migração-strangler-fig) | Plano de migração |
| [9](#9-pendências-da-migração) | Pendências da migração |

---

## 1. Resumo

O código é um **modelo anêmico guiado pelo banco**. Financeiro, Remuneração e Liquidação com Parceiro **não existem como fatos gravados**: são calculados na leitura a partir da coleção `appointments`, com as regras **atuais** (`Unit.revenueShare`, `WorkspaceMember.units[].commission*`). Por isso, mudar um percentual, editar um atendimento ou excluir uma unidade **reescreve o passado**. Isso contraria o centro do modelo: snapshot das regras ([ADR-008](adr/008-snapshot-das-regras-no-momento-do-fato.md)), lançamentos imutáveis ([ADR-010](adr/010-lancamentos-imutaveis.md)) e a separação entre resultado, títulos e caixa ([ADR-025](adr/025-resultado-titulos-e-caixa-separados.md)).

**O ponto a favor:** as regras em `service/` já estão separadas do I/O (funções recebem as dependências por parâmetro) e há ~1.250 casos de teste em `lib/tests/`. A migração pode ser incremental.

| Contexto | Situação no código | Tamanho da mudança |
|---|---|---|
| Organização | `Unit` e `WorkspaceMember` são entidades-deus | Médio |
| Clientes | Inexistente (só `guest {name, room}`) | Pequeno |
| Atendimento | `Booking` + `Appointment`, ciclo de vida implícito | **Grande** |
| Liquidação com Parceiro | `Unit.revenueShare` sem versão, só patamar | **Grande** |
| Remuneração | Plano dentro do `WorkspaceMember`, comissão recalculada na leitura | **Grande** |
| Financeiro | `Wallet`/`Expense`, saldo = resultado por competência | **Grande** |
| Estoque | PEPS, quantidade inteira, depósito implícito | Grande |
| Catálogo | `Service` por unidade, `Product` só com custo | Médio |
| Cobrança | Inexistente | Grande (novo) |
| Vendas | Inexistente | Médio (novo) |

---

## 2. Decisões tomadas após o diagnóstico

O diagnóstico mostrou pontos em que o uso real diverge das premissas do modelo. As respostas do negócio (17/10/2026):

| # | Divergência | Decisão | Impacto no modelo | Registro |
|---|---|---|---|---|
| M1 | Um `Appointment` tem até 20 itens, com profissionais diferentes; o modelo previa um serviço por atendimento | **Um atendimento pode ter mais de um serviço** | `ServicoPrevisto`/`ServicoRealizado` viram listas de itens; cada item reserva seu profissional e sala; o desconto é do atendimento e é rateado entre os itens; os eventos levam a lista de itens | [ADR-035](adr/035-atendimento-com-varios-servicos.md), [Atendimento](contextos/atendimento.md) |
| M2 | Salas com `beds` de 1 a 10; a premissa A1 dizia "um atendimento por vez" | **Uma sala pode ter mais de um atendimento simultâneo.** O termo é genérico (pode ser maca, cadeira etc.): **Capacidade da Sala** | A1 é falsa. A invariante da agenda passa a ser "ocupação da sala ≤ capacidade". No código, `beds` → `capacity` (com migração) | [ADR-036](adr/036-capacidade-da-sala.md), [Atendimento](contextos/atendimento.md) |
| M3 | Serviço sem profissional (`Service.requiresTherapist = false`, ex.: hidromassagem) | **Manter como o código funciona hoje** | A oferta do serviço diz se exige profissional; `profissionalId` opcional no item; a reserva ocupa só a sala; sem remuneração | [ADR-037](adr/037-servico-sem-profissional.md) |
| M4 | O código só calcula por patamar; o modelo prevê progressivas e patamar | **O usuário escolhe progressivo ou patamar, com um exemplo numérico na tela** | Já previsto no modelo (tipos `FaixasProgressivas` e `FaixasPorPatamar`). Falta no código: o tipo progressivo, a escolha e o exemplo | [Liquidação](contextos/liquidacao-parceiro.md#5-escolha-entre-faixas-progressivas-e-por-patamar-m4) (citado no ADR-038) |
| M5 | O produto tem período semanal e quinzenal na participação do parceiro; o modelo só mensal | **Manter semanal e quinzenal como no produto** | `Periodo` da Liquidação deixa de ser (ano, mês) e passa a ter `Semanal`, `Quinzenal` e `Mensal`. A premissa L4 vale para o período escolhido. Novas premissas L5 e L6 | [ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md), [Liquidação](contextos/liquidacao-parceiro.md) |
| M6 | `Service` é cadastrado por unidade, com preço, duração, salas e `requiresTherapist` próprios; o modelo tinha tipo por empresa com preço padrão + exceção | **Cada unidade mantém a sua própria Oferta do Serviço** | `TipoDeServico` (empresa: identidade e nome) + `OfertaDoServico` (unidade: duração, salas permitidas, exige profissional, preço). Para serviços, substitui em parte o ADR-033; para produtos, ele continua | [ADR-039](adr/039-oferta-do-servico-por-unidade.md), [Catálogo](contextos/catalogo.md) |
| M7 | O modelo identificava o cliente recorrente pelo telefone único | **A identidade é o CPF, único por empresa**; o cliente tem uma lista de telefones | CPF é dado pessoal comum (LGPD), não sensível. Nova premissa CL2 (cliente sem CPF) | [ADR-040](adr/040-cpf-como-identidade-do-cliente.md), [Clientes](contextos/clientes.md) |
| M8 | `guest.room` é obrigatório em todo atendimento, inclusive no espaço próprio | **Quarto opcional no espaço próprio e obrigatório em unidade com parceiro** | O quarto passa a ser do atendimento. **Conflita** com o ADR-031 (cliente de fora sem quarto paga na hora): virou a pendência C3 | [ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md), [Pendências](05-pendencias.md) |
| M9 | Produtos contados em "unidade", sem ml ou g (D6) | **Migrar com unidade base "unidade"**; o gestor recadastra em ml ou g quando quiser | Nenhum no modelo (a unidade base é imutável, então mudar significa recadastrar). Só decisão de migração | [Catálogo](contextos/catalogo.md#migração) |

Todas as decisões foram registradas conforme [Como alterar este sistema](00-processo-de-modelagem.md#como-alterar-este-sistema): ADR, documento do contexto, glossário, pendências e a [etapa 18](00-processo-de-modelagem.md#etapa-18--comparação-com-o-código-e-decisões-do-diagnóstico) do processo. **Faltam os diagramas**: `atendimento-modelo`, `atendimento-estados`, `catalogo-clientes-modelo`, `liquidacao-modelo`, `fluxo-atendimento-concluido` e `context-map` ainda mostram o modelo anterior.

---

## 3. Problemas transversais

Aparecem em vários contextos e explicam a maior parte das divergências.

| # | Problema | Onde | Contraria |
|---|---|---|---|
| T1 | **Regras aplicadas na leitura, sem snapshot.** Comissão, participação do parceiro e resultado são recalculados com as taxas atuais | `service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow.ts` (`partnerShareByDay` :294, `teamPayRates`, `staffPayByMember` :434-600), `unit-cash-flow-store.ts:128-190` | ADR-007, 008, 012 |
| T2 | **Fatos editáveis e apagáveis.** Atendimento (`updateAppointmentAction`, "Desfazer registro" com `deleteOne`), despesas (`updateMany`/`deleteMany`, inclusive "esta e as próximas"), `PayrollPayment`, `PartnerSharePayment` | `lib/actions/appointment.ts:132,177-237`, `lib/actions/expense.ts:294,305-372`, `lib/actions/payroll.ts:75,105` | ADR-010, 034 |
| T3 | **Exclusão destrutiva da unidade.** Apaga `Service`, **`Appointment`** e `StockItem`; esquece `Booking`, `Expense`, `PayrollPayment`, `PartnerSharePayment` (ficam órfãos) | `lib/actions/unit.ts:236-266` | ADR-003, 010 |
| T4 | **`Unit` entidade-deus.** Carrega `revenueShare` (Liquidação), `treatmentRooms` e `businessHours` (Atendimento). 17 arquivos importam o model e 21 fazem `$lookup from: "units"` | `models/Unit.ts` | ADR-003 |
| T5 | **`WorkspaceMember` entidade-deus.** Junta IAM (admin, role, convite), Profissional e Plano de Remuneração (`commissionBase`, `commissionPercent`, `salaryCents`, `bonuses`, `startDate`, `payDay`). Ser profissional depende da permissão `attends` | `models/WorkspaceMember.ts:21-50`, `team/therapist.ts:18`, `team/unit-team.ts:81` | ADR-003, 014 |
| T6 | **Sem eventos, outbox ou transações.** Nenhum `startSession`/`withTransaction`; escritas em várias coleções com `Promise.all`. O bullmq só atende as URAs | todo o projeto; `uras/ura-queue.ts` | ADR-007; "uma transação por agregado" |
| T7 | **Identidade do profissional dupla.** O atendimento usa `therapistId` = `User`; a folha usa `memberId` = `WorkspaceMember`. Convite pendente tem salário mas nunca comissão | `models/Appointment.ts:14`, `cash-flow.ts:570,620` | Organização |
| T8 | **Linguagem ubíqua.** "Repasse" na UI, export, tour e prompts da AgenIA; `guest`/hóspede; `therapist`; `Stock` = só o depósito compartilhado | `cash-flow-export.ts:97`, models | ADR-009, glossário |

---

## 4. Arquitetura atual

| Camada | Papel hoje | Observações |
|---|---|---|
| `models/` (29 schemas) | Dados, sem comportamento | Só `pre("validate")` em `Expense` e `ExpenseGroup`. Dependência invertida: models importam constantes de `service/` |
| `service/**` | Regras de negócio, espelhando as rotas | Funções puras com `deps` injetadas + `*-store.ts` (adaptadores Mongoose) + pipelines de agregação |
| `lib/actions/` (23, `"use server"`) | Controller e composition root | Autenticam, checam permissão, montam `deps`, traduzem erros. Parte da regra vaza para cá (cascatas em `unit.ts`, despesa em `product.ts`) |
| `app/**` | Páginas e rotas | 35 arquivos importam `@/models`; ~30 páginas fazem `find`/`aggregate` direto (read models espalhados) |
| `components/**` | UI | Não importam models; 47 chamam actions |

**Cadeias de chamada representativas**

- *Concluir atendimento*: `registerBookingAction` → `convertBooking` (`appointments/booking-convert.ts`) → `createAppointment` (valida e rateia desconto) → `Appointment.create` → `Booking.updateOne`. Sem transação (compensação manual se o vínculo falhar) e sem propagação: o resto é calculado na leitura.
- *Compra de estoque*: `registerPurchaseAction` → `Promise.all([recordStockPurchase` (upsert de `ExpenseGroup` + `Expense.create` paga), `recordMovement])`. Estoque → Financeiro síncrono, sem garantia.
- *Criar unidade*: `createUnitAction` → `Wallet.create` na mesma chamada (só se houver saldo inicial).

**Autorização.** Catálogo em `service/workspace/[workspaceId]/users/permissions/permissions.ts`; checagem na action, antes do caso de uso (alinhado ao [ADR-014](adr/014-desconto-explicito-permissoes-fora-do-dominio.md)). Falta granularidade: não há permissão de desconto, estorno, fechamento ou reabertura.

**Testes.** 75 arquivos em `lib/tests/`, todos sobre funções de `service/` com `deps` falsas; nenhum toca o Mongo. A cobertura de `lib/actions`, `models`, pipelines de agregação e cascatas é zero.

**Padrões já existentes que podem ser reaproveitados:** índice único parcial em `Message.externalMessageId` (idempotência de webhook); versão otimista em `UraSession` (`StaleSessionError`); compare-and-set em `billing.ts`; `jobId` determinístico e backoff em `ura-queue.ts`; scripts de migração idempotentes em `project/scripts/`.

---

## 5. Diagnóstico por contexto

Situações: **existe**, **parcial**, **divergente**, **inexistente**.

### 5.1 Organização

| Conceito | Hoje | Situação |
|---|---|---|
| Empresa | `models/Workspace.ts:16-27` (mistura tenant SaaS: `subscription`, `ageniaModel`) | divergente |
| Unidade: nome, empresa | `models/Unit.ts:40,46` | existe |
| Endereço | — | inexistente |
| Situação Ativa/Desativada | — (só exclusão física) | inexistente |
| Nome único na empresa | — (sem checagem nem índice) | inexistente |
| renomear/desativar/reativar | `updateUnit` genérico (`service/workspace/[workspaceId]/unit/unit.ts:124`) | divergente |
| Carteira própria em `UnidadeCriada` | `lib/actions/unit.ts:148-155`, só com saldo inicial | parcial |
| Depósito próprio | implícito (`holderId` = unidade) | divergente |
| Profissional + vínculo CLT/PJ/Terceirizado | `WorkspaceMember` + permissão `attends`; sem vínculo; exige login | divergente |

**Mudanças:** situação + desativação no lugar da exclusão; índice único `{workspaceId, name}` (collation pt, como `Role.ts:22`) após tratar duplicatas; comandos com intenção; tirar `revenueShare`, `treatmentRooms` e `businessHours` da `Unit` (mantendo o `_id` das salas, referenciado por `Booking.treatmentRoom.roomId` e `Service.treatmentRoomIds`); agregado `Profissional` com `userId` opcional e migração de `therapistId` → `profissionalId`.

### 5.2 Clientes

| Conceito | Hoje | Situação |
|---|---|---|
| Cliente Recorrente | — | inexistente |
| Cliente Avulso | `Booking.guest`, `Appointment.guest` (`{name, room}`, quarto obrigatório, sem telefone) | parcial |
| Contato do inbox | `models/Conversation.ts:12-13` (sem vínculo com cliente) | divergente |
| Consentimento / anonimização | — | inexistente |

`Lead` é lead da própria Agendi (landing), não cliente do SPA.

**Mudanças:** coleção de clientes com **CPF único por empresa** e lista de telefones ([ADR-040](adr/040-cpf-como-identidade-do-cliente.md)); `guest` → `ClienteDoAtendimento = Avulso | Recorrente`; o quarto sai do cliente e vai para o atendimento, opcional no espaço próprio e obrigatório em unidade com parceiro ([ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md); conflito C3). Sem CPF no histórico, não há como deduplicar: avulsos antigos ficam sem `clienteId`.

### 5.3 Atendimento (core)

| Conceito | Hoje | Situação |
|---|---|---|
| Atendimento Agendado | `models/Booking.ts:15-57`; "pendente" = `appointmentId == null` | parcial |
| Atendimento Concluído / Realizado | `models/Appointment.ts:42-56`, coleção separada, até 20 itens | divergente (itens agora aceitos, M1) |
| Concluir | `lib/actions/appointment.ts:241-312` + `booking-convert.ts:22-42`, sem transação | parcial |
| Atendimento sem agendamento | `createAppointmentAction` (:106-130) não checa disponibilidade | divergente |
| Cancelar | `deleteBookingAction` apaga o documento, sem filtrar `appointmentId: null` | inexistente |
| No-show | — | inexistente |
| Concluído como estado final | Só a UI bloqueia (commit `38fdd1c`); no servidor, `reschedule`/`correct`/`update` alteram e "Desfazer registro" apaga | divergente |
| AgendaDaEmpresa / concorrência | Consulta antes de gravar (`calendar/booking.ts:156-177`), sem lock nem versão | inexistente |
| Conflito de profissional entre unidades | `calendar/booking-store.ts:12-33` | existe, sem garantia atômica |
| Sala e capacidade | `Unit.treatmentRooms.beds`, `treatment-room.ts:64-79` | existe (alinhado a M2) |
| Bloqueio de agenda | `models/TherapistBlock.ts` | existe no código, falta no modelo |
| Preço de tabela no previsto | Booking não guarda preço; previsão usa o preço atual | inexistente |
| Desconto | `Appointment.ts:29-39`; falta `concedidoPor`; o rateio sobrescreve `items[].priceCents` | parcial |
| Política de cancelamento / consequência | — | inexistente |

**Mudanças:** unificar `Booking` + `Appointment` num agregado com `situacao`, previsto e realizado como listas de itens (M1), cliente, política congelada e `version`; `AgendaDaEmpresa` por dia com versão e nova tentativa; cancelamento e no-show como estados; `precoDeTabela` gravado; `Desconto` com `concedidoPor` e permissão própria; transação + outbox para `AtendimentoConcluido`. **Atenção:** `dailyBookingForecastPipeline` não filtra `appointmentId: null` e pode contar em dobro na previsão (não testado).

### 5.4 Liquidação com Parceiro (core)

| Conceito | Hoje | Situação |
|---|---|---|
| AcordoComParceiro | `Unit.revenueShare` (`models/Unit.ts:6-21,43`) | divergente |
| Versões e vigência | sobrescrita em `lib/actions/unit.ts:195-208`; encerrar = `$unset` | inexistente |
| Faixas por patamar | `calculatePartnerShareCents` (`unit/[unitId]/revenue-share.ts:80-83`) | existe (único cálculo) |
| Faixas progressivas | — (teste rejeita de propósito) | inexistente (M4) |
| Regra por categoria (serviços × produtos) | só serviços | inexistente |
| Período | semanal/quinzenal/mensal (`revenue-share.ts:7`) | existe (mantido, M5) |
| LiquidacaoDoPeriodo, trechos, fechamento | recalculado ao vivo | inexistente |
| Recebimento | `PartnerSharePayment` sem valor; desmarcar apaga | divergente |
| Conciliação / divergência | — | inexistente |

**Divergência importante:** hoje a participação é uma **despesa paga ao parceiro** (`expenses/expense.ts:385-425`). No modelo, o parceiro **deve à unidade** a receita menos a participação: é um **título a receber**. Numa unidade de hotel, o saldo atual fica inflado porque conta como recebido um dinheiro que só entra quando o hotel paga.

**Mudanças:** coleção de acordos com versões e regra tipada (`fixo | progressivo | patamar | sem`, com `calcular` e `explicar`); migração `revenueShare` → v1 desde `unit.createdAt` (uma faixa → fixo; várias → **patamar**, preservando os números atuais); tela com a escolha entre progressivo e patamar e um exemplo numérico (M4); liquidação gravada por período; recebimento com valor; inverter a visão financeira; base `net` da comissão deixa de chamar o cálculo de faixas diretamente.

### 5.5 Remuneração (core)

| Conceito | Hoje | Situação |
|---|---|---|
| Plano (um por profissional) | `WorkspaceMember.units[]` (um por vínculo membro × unidade) | divergente |
| Versões | só `startDate`, sobrescrito | inexistente |
| Fixo mensal + rateio | `salaryCents` por vínculo (N unidades = N salários) | divergente |
| Padrão + exceções por unidade | só valores por vínculo | parcial |
| Base ValorCobrado/PrecoDeTabela | `commissionBase` = `services`/`gross`/`net` (outro conceito) | divergente |
| Regra de inadimplência / retenção | — | inexistente |
| Snapshot | comissão recalculada com o % atual | inexistente |
| Bônus | `bonuses[]` mensais fixos | divergente |
| Meta / Acompanhamento | — | inexistente |
| Folha com linhas | `models/PayrollPayment.ts`: unidade × membro × mês, só totais | divergente |
| Fechamento, competência anterior | — | inexistente |
| Fixo pró-rata | `monthlyForDays` (`cash-flow.ts:577-590`) | parcial |

**Código morto:** `CommissionRule` (`source`, `deductRevenueShare`, `deductExpenseGroupIds`) em `team/unit-member.ts:33-39`, usado só por `payrollAmount`/`payrollReminders` (`team/payroll.ts:71-151`), que só aparecem em testes.

**Mudanças:** gravar `listPriceCents` por item do atendimento (pré-requisito para `PrecoDeTabela`); coleção de planos com versões (migração: fixo = soma dos salários e bônus; rateio percentual pelo peso de cada salário; % mais comum vira padrão); folha com linhas provisionadas e índice único por origem; fechamento, reabertura e permissões; metas por último.

### 5.6 Financeiro

| Conceito | Hoje | Situação |
|---|---|---|
| EstruturaFinanceira | `Wallet` soltas | inexistente |
| Composição (% + vigência) | `Wallet.units[].amountCents` = parte do saldo inicial | divergente |
| Caixa da empresa | — (`Expense` exige unidade ou carteira) | inexistente |
| Lançamento imutável + estorno | `Expense` editável e excluível | divergente |
| Categoria | `ExpenseGroup` com limite mensal (orçamento) | divergente |
| Receita | calculada de `Appointment.items.priceCents` | divergente |
| Título a pagar / a receber | `Expense.paidAt` liga/desliga; a receber não existe | parcial / inexistente |
| Movimento de caixa | — (o "real" usa `date`, não `paidAt`) | inexistente |
| Saldo | calculado, mas = saldo inicial + resultado por competência | parcial |
| Período e fechamento | — | inexistente |
| Rateio do resultado | — | inexistente |
| Custo de produto | compra vira despesa paga na hora (`stock/stock-purchase.ts:20-55`) | divergente (F2) |

**Mudanças:** agregados `EstruturaFinanceira`, `Lancamento` (origem idempotente, estorno), `Titulo`, `MovimentoDeCaixa`, `PeriodoFinanceiro`; conta `empresa | carteira`; carteira própria em toda unidade nova; reescrever os read models de saldo, resultado e consolidado. Migração: `openingBalance` → movimento de entrada; `expenses` → lançamento + título ou movimento; os percentuais das carteiras compartilhadas não existem e precisam de decisão. **Os saldos exibidos vão mudar** (deixam de contar receita ainda não recebida).

### 5.7 Estoque

| Conceito | Hoje | Situação |
|---|---|---|
| Depósito | `models/Stock.ts` só para compartilhados; unidade sozinha usa `holderId` = unidade | parcial |
| Vínculo com vigência | troca de depósito funde saldos (`lib/actions/stock.ts:64-107`) | divergente |
| Depósito central (sem unidades) | proibido e apagado quando fica vazio | divergente |
| Saldo | inteiro, `min: 0` | divergente |
| Custo | PEPS por lotes (`StockItem.ts:6-13`) | divergente (ADR-028) |
| Unidade base / embalagens | — | inexistente |
| Movimentação imutável com origem | sem `origem`; deletes mexem no saldo sem movimentação | parcial |
| Ficha técnica | `Service.productIds` sem quantidade | divergente |
| Baixa teórica no atendimento | — | inexistente |
| Inventário | ajuste avulso, só para baixo | divergente |
| Variação teórico × real | heurística "acabou" (`depletedAt`) | divergente |
| Transferência | entre unidades, uma movimentação só | parcial |

**Mudanças:** depósito explícito (migrar `stocks` e criar um por unidade sem depósito; reescrever `holderId` → `depositId`); item com `saldo` decimal, `custoMedio` e `versao`; movimentações com tipos completos e origem única; ficha técnica com quantidades (migração sem quantidade: exigirá revisão); inventário; compra gera título, custo no consumo. Converter "unidade" em ml/g exige o tamanho de cada produto, que a base não tem.

### 5.8 Catálogo

| Conceito | Hoje | Situação |
|---|---|---|
| Tipo de serviço por empresa | `models/Service.ts:16` por unidade | divergente |
| Oferta do serviço por unidade (duração, salas, exige profissional, preço) | `Service` por unidade, com esses campos; `priceCents` único, sem vigência | parcial (alinhado a M6) |
| Tabela de preço de produto (padrão + exceção, vigência) | — | inexistente |
| Produto: unidade base, embalagens, vendável, insumo | só `name`, `costCents` (sobrescrito a cada compra) | parcial |
| Desativar em vez de apagar | `deleteOne`/`deleteMany` | divergente |

**Mudanças:** cada `Service` atual vira a **oferta** da sua unidade, com preço versionado ([ADR-039](adr/039-oferta-do-servico-por-unidade.md)); os tipos de serviço da empresa são criados agrupando nomes iguais (nomes diferentes viram tipos diferentes), e o `serviceId` em atendimentos e agendamentos é remapeado para tipo + oferta. Não é preciso fundir durações, salas nem `requiresTherapist`, porque cada unidade mantém os seus. Produtos migram com unidade base "unidade" (M9).

### 5.9 Cobrança

Inexistente. `Checkout`, `/subscribe` e o webhook AbacatePay são a **assinatura SaaS da Agendi**, fora do domínio, e não devem ser reaproveitados como Cobrança (só como referência de padrão para o adaptador do gateway). A receita é reconhecida no registro do atendimento, que é editável. `guest.room` obrigatório impede distinguir `NaHora` de `ContaDoHospede` (com a decisão M8, o quarto continua obrigatório nas unidades com parceiro; veja o conflito C3). Nada registra pagamento do cliente, então não há inadimplência nem retenção de comissão.

**Mudanças:** agregado `Cobranca` com índice único por origem; `ModalidadeDaUnidade` alimentada pelo acordo; registrar pagamento, inadimplência (exige rotina agendada, que o projeto não tem) e estorno; permissões novas; portas `GatewayDePagamento` e `SistemaDoParceiro` com adaptador manual primeiro. Migração do histórico: decidir o status (marcar como paga com meio "legado" evita inadimplência retroativa em massa).

### 5.10 Vendas

Inexistente. `Appointment.products` é insumo (não cobrado, não baixa estoque). Não há preço de venda, produto vendável, devolução nem movimentação de saída por venda.

**Mudanças:** `sellable` e preço no produto; coleção de vendas com itens congelados e devoluções; tipos `venda`/`devolucao` na movimentação; política de venda sem saldo por depósito.

---

## 6. Funcionalidades fora do modelo

| Funcionalidade | Arquivos | Tratamento |
|---|---|---|
| AgenIA (chat, memória, threads) e custos de IA | `AgeniaMemory`, `AgeniaThread`, `AiUsage`, `agenia/*`, `lib/actions/agenia.ts` | Módulo genérico; as ferramentas chamam só a API pública dos contextos (hoje lê 16 coleções e escreve em `Service`/`Product`/`StockItem`) |
| Mensageria Meta | `Conversation`, `Message`, `MessagingChannel`, `inbox/*`, `channels/*` | Módulo com ACL para a Graph API |
| URAs | `Ura`, `UraSession`, `uras/*` | Módulo; agenda só pelo comando público do Atendimento |
| Tickets | `Ticket` | Suporte do SaaS |
| Lead / landing | `Lead`, `_shared/landing` | Aquisição do SaaS |
| Assinatura | `Checkout`, `Workspace.subscription`, `subscribe/*` | Módulo com ACL para o AbacatePay; tirar `subscription` de `Workspace` |
| Usuários, roles, convites | `User`, `Role`, parte de `WorkspaceMember` | Módulo de acesso (ADR-014) |
| Uploads, tutorial | `r2-storage.ts`, `tutorial.ts` | Infraestrutura compartilhada / conta |

---

## 7. Arquitetura alvo

Monólito modular por bounded context, compatível com o App Router.

```
src/
  app/            rotas em inglês (inalteradas); page.tsx e route.ts só chamam comandos e consultas
  components/     UI espelhando as rotas, textos em pt-BR
  contextos/
    <contexto>/
      dominio/          agregados, VOs, políticas, eventos (TS puro, sem mongoose nem next)
      aplicacao/        comandos, consultas, portas (repositórios)
      infraestrutura/   schemas Mongoose, repositórios, consumidores de eventos, ACL do legado
      interface/        server actions, mensagens de erro em pt-BR
      index.ts          API pública: comandos, consultas, contratos de eventos
  modulos/        acesso, assinatura, mensageria, uras, agenia, suporte, aquisicao
  compartilhado/  eventos (envelope, publicador, outbox), banco, dinheiro, tempo
```

- **Nomes:** domínio em português sem acento ([convenção](README.md#convenções)); rotas e query params em inglês; UI em pt-BR. As coleções Mongo existentes mantêm o nome durante a transição.
- **Fronteiras:** lint (`no-restricted-imports` ou `eslint-plugin-boundaries`) proibindo importar de outro contexto fora do `index.ts` e proibindo `mongoose`/`next` em `dominio/`.
- **Eventos, em três passos:**
  1. *In-process:* envelope `{id, tipo, versao, ocorridoEm, empresaId, agregadoId, dados}` e publicação síncrona após a escrita; idempotência por `{eventoId, consumidor}` ou por chave natural (ex.: origem única do lançamento).
  2. *Outbox no Mongo:* agregado e evento na mesma transação (exige replica set); relay iniciado em `instrumentation.ts` envia ao bullmq com `jobId = eventoId`. Sem `REDIS_URL`, despacho in-process, como as URAs.
  3. *Contratos versionados* no `index.ts` de cada contexto, com testes de contrato.

---

## 8. Plano de migração (Strangler Fig)

Cada passo segue a skill `tdd` do projeto: caracterizar, RED, aprovação, GREEN.

| Fase | O quê | Por quê |
|---|---|---|
| **0** | **Parar a perda de histórico:** desativar unidade em vez de excluir; proteger no servidor fatos que hoje podem ser apagados | Cada dia sem isso pode destruir dados de forma irrecuperável |
| ~~1~~ | ~~Rede de segurança com testes de integração (Mongo real) e *golden master*~~ **Descartada pelo negócio.** A proteção fica nos testes unitários e na caracterização por função exigida pela skill `tdd` | — |
| 2 | Base comum: envelope de eventos, regras de lint (o módulo de acesso fica para a fase 4, junto com o `Profissional`) | Pré-requisito de todos os contextos |
| 3 | Catálogo e Clientes | Genéricos, a montante, baixo risco |
| 4 | Organização: esvaziar `Unit` e `WorkspaceMember`, criar `Profissional` | Desbloqueia Atendimento, Remuneração e Liquidação |
| 5 | Atendimento: agregado novo, agenda versionada, `AtendimentoConcluido`; projeção legada mantém o caixa atual | Core; origem de todos os eventos |
| 6 | Cobrança, depois Financeiro | Fatos de receita e lançamentos imutáveis |
| 7 | Remuneração e Liquidação, validadas contra o golden master; desligar o cálculo na leitura | Core; dependem de 5 e 6 |
| 8 | Estoque, depois Vendas | Supporting; Vendas é quase só funcionalidade nova |
| 9 | Módulos genéricos passam a usar as APIs públicas | Fecha as fronteiras |

### Fase 0: o que foi feito

Escopo decidido com o negócio: a unidade desativada some da operação; a desativação é recusada se houver agendamentos por vir; o atendimento registrado ganha no servidor só a proteção que a tela já dava; despesas pagas ficam para a migração do Financeiro.

- **Unidade desativada em vez de excluída** (`Unit.deactivatedAt`; ausente = ativa, sem migração). Nada é apagado. A desativação é recusada com agendamento por vir ainda não registrado. Reativar remove a data.
- **Fora da operação:** `findManagedUnit` e as demais checagens de escrita ignoram unidade desativada; agenda, início, estoque, equipe, URAs e AgenIA só listam as ativas; a página da unidade desativada responde "não encontrada". Caixa, carteiras e exportações continuam contando o histórico.
- **Salário para na desativação:** o cálculo do caixa ganhou o corte `until` (o vínculo continua, mas não gera custo depois da data).
- **Agendamento registrado:** o servidor recusa arrastar (`rescheduleBooking`) e excluir (`deleteBooking`) com `booking_registered`. O formulário de correção, "Desfazer registro" e a edição do atendimento continuam até a decisão D1.
- **Tela de unidades:** "Excluir" virou "Desativar"; unidade desativada aparece com o selo "Desativada" e o botão "Reativar".

---

## 9. Pendências da migração

Além das premissas de negócio em [Pendências](05-pendencias.md) (R2/R3, L5/L6, F1–F3, E1–E4, C2, C3, V1, CL1/CL2, A2/A3):

| # | Pergunta |
|---|---|
| D1 | "Desfazer registro" e a correção de atendimento concluído são usados hoje. Viram evento corretivo, janela de correção ou saem do produto? |
| D2 | Comissão de gerente sobre o faturamento da unidade (`commissionBase` `gross`/`net`) não está no modelo. Novo tipo de regra, meta sem alvo ou sai do produto? |
| D3 | Bônus mensais fixos atuais: parte do fixo ou componente novo do plano? |
| D4 | Limite mensal por grupo de despesa (orçamento) e despesas recorrentes/parceladas: entram no modelo ou ficam fora do domínio? |
| D5 | Histórico: recalcular meses passados com as regras atuais ou adotar uma data de corte e congelar o passado? |
| D6 | Cadastros: carteiras compartilhadas sem percentual. *(Respondido em parte: produtos migram em "unidade", M9; serviços por unidade viram ofertas da unidade, M6.)* |
| D7 | Workspace = Empresa? Um workspace pode ter mais de um CNPJ? |
| D8 | O ambiente local e o de CI rodam Mongo em replica set (necessário para transações e outbox)? |
| D9 | Agendamentos passados nunca registrados: no-show, esquecimento ou cancelamento? Define o estado na migração |
| D10 | Profissional sem login: impacto em relatórios e comissão hoje ligados a `User` |

### Fase 2: o que foi feito

- **`src/compartilhado/eventos`:** envelope `EventoDeDominio` (`id`, `tipo`, `versao`, `ocorridoEm`, `empresaId`, `agregadoId`, `dados`) e publicador síncrono no mesmo processo. Os consumidores rodam um de cada vez; a falha de um vai para o log e não impede os outros. Sem outbox ainda: o efeito de um consumidor que falha se perde.
- **`src/contextos/barramento.ts`:** raiz de composição que inscreve os consumidores; o resto do sistema só chama `publicar`.
- **Primeiro evento:** a Organização publica `UnidadeCriada` (só id e nome). O Financeiro consome e cria a carteira própria da unidade com saldo zero no dia da criação, sem duplicar em evento repetido (ADR-026). O saldo informado no cadastro passa a ser gravado nessa carteira. Unidades antigas sem carteira continuam sem (exige migração).
- **Fronteiras no lint:** ninguém importa `@/contextos/<x>/...`, só o `index` do contexto; `dominio/` não importa `mongoose`, `next`, `react` nem o código legado (`@/models`, `@/lib`, `@/service`).

### Fase 3: andamento

- **3.1 Quarto opcional (feito):** obrigatório só em unidade dentro de parceiro, a não ser para cliente de fora (ADR-041); vale para agendamento, correção, atendimento, registro com um clique, URA e AgenIA.
- **3.2 Desativar produtos e serviços (feito):** `Product.deactivatedAt` e `Service.deactivatedAt`; nada é excluído. Serviço só desativa sem agendamentos por vir; produto só desativa sem saldo em nenhum estoque; "tirar do estoque" da unidade só com quantidade zero. Desativados saem da escolha (formulários, busca de produtos, estoques, URA, AgenIA) e continuam no histórico e na edição de registros antigos. Lacuna conhecida: o servidor ainda aceita um serviço desativado num agendamento novo vindo por id (só a URA recusa); fica para a 3.4. A unidade base do produto ficou para a fase do Estoque.
- **3.3 Clientes (feito):** contexto `src/contextos/clientes` (CPF único por empresa, até 5 telefones, e-mail e observações; coleção `customers`) com a página Clientes. Agendamento e atendimento escolhem entre cliente avulso e cadastrado (`guest.customerId`, com o nome do cadastro copiado); o registro com um clique mantém o cliente. Padrões adotados sem resposta do negócio: quem gerencia agendamentos gerencia clientes; consentimentos e anonimização (LGPD) ficam para quando a mensageria usar o cadastro; a URA e a AgenIA ainda agendam só cliente avulso.
- **3.4 Catálogo (feito em parte):** agendamento novo com serviço desativado é recusado (`service_inactive`); a edição aceita o serviço que o agendamento já tem. O **Tipo de Serviço da empresa** (ADR-039) fica adiado até o primeiro consumidor (ficha técnica no Estoque ou comissão por tipo na Remuneração): sem consumidor, seria uma coleção e uma migração sem ganho. Ainda aceito por id forjado: atendimento registrado direto (sem agendamento) com serviço desativado.

### Fase 4: andamento

- **4.1 Nome de unidade único na empresa (feito):** cadastrar ou renomear com o nome de outra unidade é recusado (`name_in_use`), sem diferenciar maiúsculas e contando as desativadas. A checagem é só no código: o índice único no banco depende de conferir antes se há nomes repetidos em produção.
- **Próximas, dependem de decisão do negócio:** salas e horário saem da Unidade para o Atendimento (`beds` → `capacity`, ADR-036); agregado Profissional separado do login (hoje os atendimentos apontam para o usuário).
