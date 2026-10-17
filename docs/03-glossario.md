# Glossário (linguagem ubíqua)

Termos do negócio e seu significado **dentro de cada contexto**. Quando um termo muda de sentido entre contextos, isso está indicado: é justamente o sinal de uma fronteira.

## Termos que mudam de sentido entre contextos

| Termo | Sentido | Onde |
|---|---|---|
| **Profissional** (massagista) | Pessoa cadastrada, com tipo de vínculo | Organização |
| | Recurso com horários (quem atende) | Atendimento |
| | Beneficiária de remuneração (quem recebe) | Remuneração |
| **Serviço** | Tipo de serviço com duração e preço de tabela | Catálogo |
| | Serviço previsto e serviço realizado, com valor cobrado | Atendimento |
| | Receita da categoria "serviços" | Liquidação com Parceiro |
| **Repasse** | ⚠️ Termo **abandonado** por ter dois sentidos. Use **Liquidação com Parceiro** (o parceiro paga a unidade) ou **Remuneração** (a unidade paga o profissional) | — |
| **Estoque** | O total de todos os depósitos da empresa | Estoque |

## Organização

| Termo | Definição |
|---|---|
| Empresa | Pessoa jurídica dona das unidades |
| Unidade | Local onde os serviços são prestados (espaço próprio ou dentro de um parceiro). Só identidade, endereço e situação |
| Profissional | Pessoa que presta os serviços; vínculo CLT, PJ ou terceirizado |

## Atendimento

| Termo | Definição |
|---|---|
| Agenda da Empresa | Todas as reservas de horário da empresa em um dia; garante que profissional e sala não tenham horários sobrepostos |
| Reserva | Ocupação de um intervalo por um profissional e uma sala para um atendimento |
| Sala | Espaço físico de uma unidade onde o atendimento acontece |
| Atendimento | Um serviço agendado para um cliente, com ciclo de vida (Agendado, Concluído, Cancelado, NoShow) |
| Serviço Previsto | O que foi agendado: tipo, profissional, sala, horário e preço de tabela |
| Serviço Realizado | O que de fato aconteceu; pode diferir do previsto |
| Desconto | Redução do valor na conclusão, com motivo e quem concedeu |
| Valor Cobrado | Preço de tabela menos desconto; nunca negativo |
| Cliente Avulso | Cliente sem cadastro (nome, telefone, quarto) |
| Cliente Recorrente | Cliente cadastrado no contexto Clientes |
| No-show | O cliente não compareceu ao atendimento agendado |
| Política de Cancelamento | Regras de cobrança e de remuneração para cancelamento tardio e no-show; congelada no agendamento |
| Consequência do Desfecho | Valor a cobrar e base de remuneração resultantes de um cancelamento ou no-show |

## Liquidação com Parceiro

| Termo | Definição |
|---|---|
| Parceiro | Estabelecimento (ex.: hotel) dentro do qual uma unidade opera |
| Acordo com Parceiro | Contrato da unidade com o parceiro, com versões e vigências |
| Regra de Participação | Como se calcula a parte do parceiro: percentual fixo, faixas progressivas, faixas por patamar ou sem participação |
| Faixas Progressivas | Cada parte da receita paga o percentual da faixa em que cai |
| Faixas por Patamar | A faixa em que o total termina define o percentual aplicado sobre tudo |
| Trecho | Parte de um período coberta por uma única versão do acordo; surge quando o acordo é revisado no meio do mês |
| Liquidação do Período | Apuração mensal do que o parceiro deve à unidade |
| Previsão | Valor a receber calculado com o que existe até o momento, pela mesma lógica do fechamento |
| Fechamento | Congela a apuração do período |
| Recebimento | Valor efetivamente pago pelo parceiro; pode haver mais de um por liquidação |
| Divergência | Diferença entre o apurado e o recebido; resolvida por recebimento complementar ou por aceite com motivo |
| Ajuste | Lançamento de correção; após o fechamento, uma role autorizada decide o período |

## Remuneração

| Termo | Definição |
|---|---|
| Plano de Remuneração | Define quanto um profissional recebe; tem versões com vigência por data |
| Fixo Mensal | Salário (CLT) ou valor fixo de contrato (PJ); proporcional aos dias de cada versão no mês |
| Regra de Comissão | Percentual, valor fixo por item ou tabela por tipo de serviço |
| Condições de Comissão | Comissões de serviço e produto, base da comissão e regra de inadimplência; o plano tem um padrão e pode ter exceções por unidade |
| Base da Comissão | Valor cobrado (com desconto) ou preço de tabela |
| Rateio do Fixo | Como o fixo mensal é dividido entre as unidades: unidade principal, percentual por unidade ou proporcional à produção |
| Produção | Valor cobrado dos atendimentos e vendas de uma profissional numa unidade, no mês |
| Retenção | Linha da folha suspensa porque o cliente não pagou, quando o plano é "só recebe quando pago" |
| Acompanhamento da Meta | Medição de uma meta num período; recebe contribuições e apura o resultado |
| Competência Anterior | Marca de uma linha que pertence a um período já fechado e entrou na folha seguinte |
| Meta | Alvo de um indicador num período, para um escopo (Profissional, Unidade ou Carteira), com uma recompensa |
| Folha do Profissional | Consolidação mensal do que um profissional tem a receber |

## Financeiro

| Termo | Definição |
|---|---|
| Caixa | Nível financeiro da empresa: tem lançamentos próprios (despesas da empresa que não pertencem a nenhuma carteira) |
| Carteira | Conta financeira de uma ou mais unidades, que dividem resultado; pode ter rateio desigual |
| Lançamento | Fato financeiro imutável; correções são novos lançamentos (estorno, ajuste) |
| Rateio | Divisão do resultado da carteira entre as unidades (para gestão, não para pessoas) |
| Consolidado | Visão total: Caixa + todas as carteiras (read model) |
| Estrutura Financeira | Conjunto das carteiras de uma empresa e da composição de cada uma |
| Composição | Unidades de uma carteira e seus percentuais, com vigência |
| Competência | Mês ao qual uma receita ou despesa pertence, independentemente de quando o dinheiro se move |
| Período Financeiro | Um mês de uma conta (Caixa ou carteira); aberto ou fechado |
| Título | O que alguém deve à empresa (a receber) ou a empresa deve a alguém (a pagar) |
| Baixa | Redução de um título: pagamento (com dinheiro) ou abatimento (diferença aceita, sem dinheiro) |
| Movimento de Caixa | Entrada ou saída real de dinheiro numa conta |
| Estorno | Lançamento oposto que anula outro, mantendo o histórico |
| Lucro Previsto | Resultado estimado antes da liquidação com o parceiro (read model) |

## Estoque

| Termo | Definição |
|---|---|
| Estoque | O total de todos os depósitos |
| Depósito | Divisão do estoque, compartilhada por uma ou mais unidades |
| Item de Estoque | Saldo de um produto em um depósito |
| Unidade Base | Unidade de medida em que o produto é controlado (ml, g, unidade) |
| Embalagem | Forma de compra ou venda (ex.: Frasco 1 L = 1.000 ml) |
| Ficha Técnica | Consumo estimado de insumos por tipo de serviço |
| Consumo Estimado (baixa teórica) | Saída de estoque calculada pela ficha técnica na conclusão do atendimento |
| Inventário | Contagem real; gera ajuste com a diferença |
| Variação de Consumo | Diferença entre consumo real e teórico entre dois inventários; medida por depósito e produto |
| Depósito Central | Depósito sem unidades vinculadas, que recebe compras e transfere para os demais |
| Movimentação | Registro imutável de entrada ou saída de um item (compra, consumo estimado, venda, perda, ajuste, transferência) |
| Custo Médio | Custo por unidade base de um item, recalculado a cada entrada |
| Política de Venda | Regra do depósito para venda sem saldo: bloquear ou permitir com alerta |

## Vendas

| Termo | Definição |
|---|---|
| Venda | Venda de produtos a um cliente, com profissional responsável opcional |
| Devolução | Retorno total ou parcial de itens de uma venda concluída; não altera a venda, gera compensações |

## Cobrança

| Termo | Definição |
|---|---|
| Cobrança | Valor devido por um atendimento, desfecho (cancelamento ou no-show) ou venda |
| Na Hora | Modalidade em que o cliente paga na recepção |
| Conta do Hóspede | Modalidade em que o valor é lançado na conta do quarto e o parceiro recebe do hóspede |
| Inadimplente | Cobrança não paga no prazo, ou informada como não paga pelo parceiro |
| Recuperação | Pagamento de uma cobrança que estava inadimplente |
| Estorno | Anulação total ou parcial de uma cobrança paga |

## Catálogo

| Termo | Definição |
|---|---|
| Tipo de Serviço | Serviço oferecido (ex.: massagem relaxante), com duração padrão e preço |
| Produto | Item vendável e/ou usado como insumo, com unidade base e embalagens |
| Tabela de Preço | Preços com vigência: padrão e exceções por unidade |

## Clientes

| Termo | Definição |
|---|---|
| Cliente Recorrente | Cliente cadastrado, identificado pelo telefone dentro da empresa |
| Consentimento | Autorização do cliente para uma finalidade (ex.: lembretes, promoções) |
| Anonimização | Remoção dos dados pessoais do cliente, mantendo os registros sem identificá-lo |
