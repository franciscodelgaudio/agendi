# Pendências (hotspots em aberto)

Perguntas que ainda precisam de resposta do negócio. Quando uma pendência é resolvida, mova-a para a seção **Resolvidas** com a resposta e o link da decisão.

## Em aberto

### Remuneração

| # | Pergunta | Padrão adotado no modelo |
|---|---|---|
| R2 | Quais **indicadores** de meta o cliente usa? | Faturamento de serviços, faturamento de produtos e quantidade de atendimentos |
| R3 | Numa meta de unidade ou carteira, **como o bônus é dividido**? | O gestor escolhe na meta: igual entre os participantes ou proporcional à contribuição |

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
| C1 | Num SPA de hotel, cliente **sem quarto** paga na hora? | Sim: `ContaDoHospede` só com acordo **e** quarto informado ([ADR-031](adr/031-modalidade-de-cobranca-por-cobranca.md)) |
| C2 | No espaço próprio, o cliente pode **pagar depois** ("pendurar")? Em quanto tempo vira inadimplente? | Pode; o prazo é configurado por unidade |
| K1 | O mesmo serviço pode ter **preços diferentes por unidade**? | Sim: preço padrão com exceções por unidade ([ADR-033](adr/033-precos-com-padrao-e-excecao-por-unidade.md)) |
| CL1 | O sistema vai guardar **ficha de anamnese** (contraindicações, alergias, gestação)? | Não no modelo atual. Se sim, é dado sensível pela LGPD e merece um conceito próprio com acesso restrito |

### Atendimento (premissas a confirmar)

| # | Premissa |
|---|---|
| A1 | Cada sala atende **um atendimento por vez** |
| A2 | A política de cancelamento aplicada é a **vigente no agendamento** |

## Resolvidas

| Pergunta | Resposta | Decisão |
|---|---|---|
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
| Faixas progressivas ou por patamar? | Ambas | [Liquidação](contextos/liquidacao-parceiro.md) |
| Faixa separada ou combinada? | Caso real: separada; combinada adiada | [ADR-018](adr/018-base-combinada-adiada.md) |
| O parceiro participa da venda de produtos? | O usuário decide | [Liquidação](contextos/liquidacao-parceiro.md) |
| O parceiro paga mesmo se o hóspede não pagar? | Caso real: sim; configurável para descontar | [Liquidação](contextos/liquidacao-parceiro.md) |
| Caixa e carteira são a mesma coisa? | Não; Caixa é o nível acima | [ADR-011](adr/011-agrupamentos-financeiro-e-estoque.md) |
| Rateio entre unidades ou pessoas? | Entre unidades | [Financeiro](contextos/financeiro.md) |
| O Caixa tem lançamentos próprios? | Sim | [Financeiro](contextos/financeiro.md) |
| Despesas comuns vão para onde? | Para a carteira | [Financeiro](contextos/financeiro.md) |
| Metas: escopo? | Profissional, unidade e carteira | [Remuneração](contextos/remuneracao.md) |
| Ajuste após fechamento? | Uma role decide o período | [Liquidação](contextos/liquidacao-parceiro.md) |
