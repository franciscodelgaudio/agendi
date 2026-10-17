# Pendências (hotspots em aberto)

Perguntas que ainda precisam de resposta do negócio. Quando uma pendência é resolvida, mova-a para a seção **Resolvidas** com a resposta e o link da decisão.

## Em aberto

### Remuneração

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| R2 | Quais **indicadores** de meta o cliente usa? | Faturamento de serviços, faturamento de produtos e quantidade de atendimentos |
| R3 | Numa meta de unidade ou carteira, **como o bônus é dividido**? | O gestor escolhe na meta: igual entre os participantes ou proporcional à contribuição |

### Liquidação com Parceiro

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| L5 | Uma revisão do acordo pode **mudar a periodicidade** (ex.: de mensal para semanal)? A partir de quando? | Pode, só com `InicioDoProximoPeriodo`: a nova periodicidade começa no dia seguinte ao fim do período atual. Se esse dia não for início de período na nova periodicidade (ex.: não for segunda-feira), o primeiro período novo é mais curto, até alinhar com o calendário ([ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md)) |
| L6 | Uma liquidação **semanal que atravessa a virada do mês**: em qual mês do Financeiro entra a participação do parceiro? | É dividida entre os dois meses na proporção da receita de cada mês ([ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md)) |

### Financeiro

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| F1 | A composição de uma carteira pode mudar **no meio do mês** (uma unidade trocar de carteira no dia 15)? | Sim, com data escolhida pelo usuário (mesmo padrão dos acordos e planos); cada lançamento vai para a carteira da unidade **na data do fato**, e o rateio do mês usa a composição vigente no fechamento |
| F2 | O custo de um produto entra no resultado **na compra** ou **no consumo/venda**? | No consumo ou na venda; a compra gera só um título a pagar |
| F3 | O cliente precisa controlar **contas separadas** de dinheiro (banco, dinheiro físico, maquininha) dentro de uma carteira? | Não; um saldo de caixa por carteira e um para o Caixa |

### Estoque

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| E1 | Existe um **estoque central** (compras da matriz antes de distribuir)? | Pode existir: é um depósito sem unidades vinculadas, que transfere para os outros |
| E2 | Controlar também a **abertura de embalagens** (frasco aberto × fechado)? | Não por enquanto; o controle vem da ficha técnica, do inventário e da variação |
| E3 | A venda de produto **exige saldo**? | O usuário decide por depósito: bloquear ou permitir com alerta ([ADR-029](adr/029-politica-de-venda-sem-saldo-por-deposito.md)) |
| E4 | Num depósito **compartilhado por unidades de carteiras diferentes**, quem arca com perdas e ajustes de inventário? | Rateio entre as unidades na proporção do consumo teórico de cada uma desde o último inventário; sem consumo, vai para o Caixa. Depósito central sem unidades: Caixa |

### Vendas, Cobrança, Catálogo e Clientes

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| V1 | O SPA aceita **devolução** de produtos vendidos? | Sim, total ou parcial, por role autorizada, como evento compensatório ([ADR-034](adr/034-devolucao-como-evento-compensatorio.md)) |
| C2 | No espaço próprio, o cliente pode **pagar depois** ("pendurar")? Em quanto tempo vira inadimplente? | Pode; o prazo é configurado por unidade |
| C3 | ⚠️ **Conflito.** Num SPA de hotel, como fica o **cliente de fora** (sem quarto)? Em 17/10/2026 o negócio decidiu que o quarto é **obrigatório** em unidades com parceiro ([ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md)), mas o [ADR-031](adr/031-modalidade-de-cobranca-por-cobranca.md) diz que o cliente sem quarto paga na hora. Com o quarto obrigatório sem exceção, esse cliente não pode ser registrado sem inventar um quarto, e toda cobrança da unidade vira `ContaDoHospede` | **Nenhum: precisa de decisão.** Opções: (a) o quarto é obrigatório só para hóspedes; a recepção marca "cliente de fora", que dispensa o quarto e paga na hora (o ADR-031 continua valendo); (b) unidade com parceiro só atende hóspedes, e o ADR-031 é revisto. Até a resposta, o Atendimento exige o quarto e a Cobrança mantém a regra do ADR-031. Vale também decidir se a regra se aplica às vendas de produto |
| CL1 | O sistema vai guardar **ficha de anamnese** (contraindicações, alergias, gestação)? | Não no modelo atual. Se sim, é dado sensível pela LGPD e merece um conceito próprio com acesso restrito |
| CL2 | Cliente **sem CPF** (ex.: estrangeiro hospedado no hotel) pode ser cliente recorrente? | Não: é atendido como avulso ([ADR-040](adr/040-cpf-como-identidade-do-cliente.md)) |

### Atendimento (premissas a confirmar)

| # | Premissa |
|---|---|
| A2 | A política de cancelamento aplicada é a **vigente no agendamento** |
| A3 | **Reduzir a capacidade** de uma sala é recusado enquanto houver horário futuro com mais reservas que a nova capacidade; a tela mostra esses horários para a recepção remanejar ([ADR-036](adr/036-capacidade-da-sala.md)) |

## Resolvidas

| Pergunta | Resposta | Decisão |
|---|---|---|
| M1. Um atendimento pode ter mais de um serviço? | Sim; cada item reserva o seu profissional e a sua sala, e o desconto é rateado entre os itens | [ADR-035](adr/035-atendimento-com-varios-servicos.md) |
| A1. Cada sala atende um atendimento por vez? | **Não** (a premissa era falsa): a sala comporta até a sua **capacidade** | [ADR-036](adr/036-capacidade-da-sala.md) |
| M3. Existe serviço sem profissional? | Sim, como no sistema atual: a oferta diz se exige profissional; sem profissional, a reserva ocupa só a sala e não há remuneração | [ADR-037](adr/037-servico-sem-profissional.md) |
| M5. A liquidação pode ser semanal ou quinzenal? | Sim: semanal, quinzenal e mensal | [ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md) |
| L4 (revista). Com períodos semanal e quinzenal, as faixas olham o quê? | O acumulado do **período** do acordo, não só do mês | [ADR-038](adr/038-periodos-semanal-quinzenal-e-mensal.md) |
| K1. O mesmo serviço pode ter preços diferentes por unidade? | Sim: cada unidade mantém a sua oferta do serviço, com preço próprio. Para produtos, preço padrão com exceções por unidade | [ADR-039](adr/039-oferta-do-servico-por-unidade.md), [ADR-033](adr/033-precos-com-padrao-e-excecao-por-unidade.md) |
| Como identificar o cliente recorrente? | Pelo CPF, único na empresa; o telefone não serve, porque um cliente pode ter vários | [ADR-040](adr/040-cpf-como-identidade-do-cliente.md) |
| O quarto é obrigatório? | Opcional no espaço próprio; obrigatório em unidade com parceiro (gerou o conflito C3) | [ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md) |
| C1. Num SPA de hotel, cliente sem quarto paga na hora? | **Superada** pela decisão do quarto obrigatório em unidade com parceiro; o caso do cliente de fora virou o conflito C3 | [ADR-041](adr/041-quarto-obrigatorio-so-com-parceiro.md), [ADR-031](adr/031-modalidade-de-cobranca-por-cobranca.md) |
| L4. Com dois trechos, as faixas olham o mês inteiro? | Sim | [ADR-016](adr/016-revisao-do-acordo-com-data-escolhida.md) |
| R1. Comissão sobre valor cobrado ou preço de tabela? | Configurável no plano (padrão: valor cobrado) | [ADR-019](adr/019-base-da-comissao-configuravel.md) |
| R6. Em qual carteira entra o fixo de quem atende em várias unidades? | O usuário escolhe: unidade principal, percentual por unidade ou proporcional à produção | [ADR-023](adr/023-rateio-do-fixo-escolhido-pelo-usuario.md) |
| R5. Comissões diferentes por unidade? | Sim | [ADR-022](adr/022-condicoes-de-comissao-por-unidade.md) |
| R4. Onde fica a regra de inadimplência do profissional? | No plano de remuneração | [Remuneração](contextos/remuneracao.md) |
| L1. Revisão do acordo no meio do mês? | O usuário escolhe: próximo mês ou a partir de uma data, deixando claro quando vale | [ADR-016](adr/016-revisao-do-acordo-com-data-escolhida.md) |
| L2. Parceiro pagou diferente do apurado? | Diferença vira pendência de conciliação | [ADR-017](adr/017-conciliacao-do-recebimento.md) |
| L3. Base combinada com faixas progressivas? | Fica para depois; será modelada como outra ideia | [ADR-018](adr/018-base-combinada-adiada.md) |
| O profissional atende em duas unidades no mesmo dia? | Sim | [ADR-006](adr/006-agenda-por-empresa-e-dia.md) |
| Quem altera o valor na conclusão? Há limite de desconto? | Permissões por role; sem limite | [ADR-014](adr/014-desconto-explicito-permissoes-fora-do-dominio.md) |
| Cliente avulso ou recorrente? | Ambos | [Atendimento](contextos/atendimento.md), [Clientes](contextos/clientes.md) |
| Faixas progressivas ou por patamar? | Ambas. O usuário escolhe na tela do acordo, que mostra um exemplo numérico de cada (M4, 17/10/2026) | [Liquidação](contextos/liquidacao-parceiro.md) |
| Faixa separada ou combinada? | Caso real: separada; combinada adiada | [ADR-018](adr/018-base-combinada-adiada.md) |
| O parceiro participa da venda de produtos? | O usuário decide | [Liquidação](contextos/liquidacao-parceiro.md) |
| O parceiro paga mesmo se o hóspede não pagar? | Caso real: sim; configurável para descontar | [Liquidação](contextos/liquidacao-parceiro.md) |
| Caixa e carteira são a mesma coisa? | Não; Caixa é o nível acima | [ADR-011](adr/011-agrupamentos-financeiro-e-estoque.md) |
| Rateio entre unidades ou pessoas? | Entre unidades | [Financeiro](contextos/financeiro.md) |
| O Caixa tem lançamentos próprios? | Sim | [Financeiro](contextos/financeiro.md) |
| Despesas comuns vão para onde? | Para a carteira | [Financeiro](contextos/financeiro.md) |
| Metas: escopo? | Profissional, unidade e carteira | [Remuneração](contextos/remuneracao.md) |
| Ajuste após fechamento? | Uma role decide o período | [Liquidação](contextos/liquidacao-parceiro.md) |
