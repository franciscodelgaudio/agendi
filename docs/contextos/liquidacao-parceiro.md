# Liquidação com Parceiro

| | |
|---|---|
| **Classificação** | 🔴 Core |
| **Subdomínio** | Parcerias Comerciais |
| **Situação** | ✅ Modelagem tática definida (revista em 17/10/2026: períodos semanal, quinzenal e mensal; premissas a confirmar: L5, L6) |

## Propósito

Apurar quanto o **estabelecimento parceiro deve à unidade** em cada período, aplicando as regras do acordo, oferecer a **previsão** desse valor durante o período e **conciliar** o que o parceiro efetivamente pagou. É o problema real do cliente: o hotel recebe do hóspede e repassa ao SPA só no fim do período (no caso original, o mês), descontando a sua participação por faixas.

> Não confundir com **Remuneração** (o que a unidade paga ao profissional). Veja [ADR-009](../adr/009-dois-repasses-dois-contextos.md).

Unidades em **espaço próprio não têm acordo**: os eventos de cobrança delas são ignorados por este contexto.

O período da liquidação pode ser **semanal, quinzenal ou mensal**, conforme o acordo ([ADR-038](../adr/038-periodos-semanal-quinzenal-e-mensal.md)).

## Ciclo de vida da liquidação

![Estados da Liquidação](../diagramas/liquidacao-estados.drawio.svg)

## Modelo

![Modelo da Liquidação](../diagramas/liquidacao-modelo.drawio.svg)

> O diagrama do modelo ainda não mostra a periodicidade da versão do acordo nem o novo `Periodo` (periodicidade + início + fim). O texto abaixo é a referência até o diagrama ser atualizado.

## 1. Comandos e eventos

| Comando | Ator | Evento |
|---|---|---|
| Firmar Acordo (com periodicidade e tipo de faixa escolhidos) | Gestor | AcordoFirmado |
| Revisar Acordo (nova versão, com data de início escolhida) | Gestor | AcordoRevisado |
| Encerrar Acordo (a unidade deixa o parceiro) | Gestor | AcordoEncerrado |
| Aplicar Revisão | Política: *quando acordo revisado e houver liquidação aberta afetada* | RevisaoAplicada |
| Registrar Receita | Política: *quando serviço ou venda for cobrado* | ReceitaRegistrada |
| Registrar Inadimplência | Política: *quando a cobrança não for paga* | InadimplenciaRegistrada |
| Lançar Ajuste | Role autorizada | AjusteLancado |
| Fechar Liquidação | Gestor ou automático | LiquidacaoFechada |
| Reabrir Liquidação | Role autorizada | LiquidacaoReaberta |
| Registrar Recebimento | Financeiro | LiquidacaoRecebida ou DivergenciaIdentificada |
| Aceitar Diferença | Role autorizada | DivergenciaResolvida |

## 2. Invariantes

**No acordo**
- As versões do acordo de uma unidade **não têm vigências sobrepostas**. Ao revisar, a versão anterior termina no dia anterior ao início da nova.
- Toda versão tem uma **periodicidade**: `Semanal`, `Quinzenal` ou `Mensal`. Uma revisão que muda a periodicidade só começa no início de um novo período (premissa L5).
- Uma revisão **não pode começar num período com liquidação fechada**. Para isso, a liquidação precisa ser reaberta antes.
- As faixas começam em zero, são contíguas e não se sobrepõem. Os limites das faixas valem **por período**.
- Percentuais ficam entre 0% e 100%.

**Na liquidação**
- **Uma liquidação por unidade e por período** (da periodicidade do acordo).
- Os **trechos cobrem o período inteiro, sem sobreposição**. Toda receita pertence a exatamente um trecho, pela data.
- Só liquidações **abertas** aceitam receitas, ajustes e revisões. Para lançar num período fechado, a role autorizada precisa reabri-lo.
- **A mesma origem não é registrada duas vezes** (idempotência).
- Com "parceiro desconta", a inadimplência reduz a base. Com "parceiro assume", ela é ignorada.
- **Uma liquidação só termina Recebida quando a soma dos recebimentos é igual ao apurado** ou quando a diferença é aceita por uma role autorizada, com motivo.

## 3. Revisão do acordo (L1)

Quando revisa o acordo, **o usuário escolhe a partir de quando a nova versão vale**:

```
revisar(novaVersao, aPartirDe)
  aPartirDe = InicioDoProximoPeriodo        ← período atual inteiro na versão antiga
            | Data(d)                       ← nova versão vale a partir do dia d
```

As duas opções resultam numa data de início explícita, que fica registrada na versão e aparece no extrato da liquidação: *"Acordo v2 vigente a partir de 15/03/2026"*. `InicioDoProximoPeriodo` é o início do próximo período da periodicidade vigente (a próxima segunda-feira, o dia 1 ou 16, ou o dia 1 do próximo mês).

Quando a revisão começa no meio de um período aberto, a liquidação passa a ter **dois trechos**, cada um com o snapshot da sua versão:

```
LiquidacaoDoPeriodo (Unidade SPA, mensal, 03/2026)
  ├─ Trecho 1: 01/03 a 14/03 → Acordo v1
  └─ Trecho 2: 15/03 a 31/03 → Acordo v2
```

**Como as faixas funcionam com dois trechos.** As faixas olham o **acumulado do período inteiro** ([ADR-016](../adr/016-revisao-do-acordo-com-data-escolhida.md), ajustado pelo [ADR-038](../adr/038-periodos-semanal-quinzenal-e-mensal.md)). A versão de cada trecho define só os percentuais aplicados às receitas daquele trecho. Assim, num acordo mensal, o limite de R$ 30.000 continua sendo mensal, como no contrato; num acordo semanal, o limite é semanal.

```
FaixasProgressivas, com trechos
  acumulado = 0
  para cada receita do período, em ordem de data:
    faixas = faixas da versão do trecho da receita
    distribui o valor nas faixas, a partir da posição "acumulado"
    acumulado += valor

FaixasPorPatamar, com trechos
  total = receita do período inteiro
  para cada trecho:
    faixa = faixa da versão do trecho onde o total termina
    participação += receita do trecho × faixa.percentual
```

Com um trecho só (o caso mais comum), os dois cálculos são exatamente os de antes.

## 4. Periodicidade (M5)

O produto já oferecia participação do parceiro semanal, quinzenal e mensal, e o negócio decidiu manter as três ([ADR-038](../adr/038-periodos-semanal-quinzenal-e-mensal.md)):

| Periodicidade | Período |
|---|---|
| `Semanal` | De segunda a domingo |
| `Quinzenal` | Dias 1 a 15, e dia 16 ao fim do mês |
| `Mensal` | O mês inteiro |

O `Periodo` deixou de ser (ano, mês): agora é a periodicidade com a data de início e de fim. A premissa L4 (as faixas olham o acumulado) vale para o **período escolhido**, não só para o mês. O sistema não converte limites de faixa entre periodicidades: quem muda de mensal para semanal revisa os limites.

O Financeiro continua mensal. Uma semana que atravessa a virada do mês tem a sua participação dividida entre os dois meses (premissa L6).

## 5. Escolha entre faixas progressivas e por patamar (M4)

Ao firmar ou revisar o acordo, **o usuário escolhe o tipo de faixa**, e a tela mostra **um exemplo numérico de cada um** com as faixas que ele digitou, para que a diferença fique clara antes de salvar:

```
Faixas: até R$ 30.000 → 30% | acima → 35%      Receita de exemplo: R$ 40.000

Progressivas:  30.000 × 30% + 10.000 × 35% = R$ 12.500
Por patamar:   40.000 × 35%                = R$ 14.000
```

Os dois tipos já existiam no modelo (`FaixasProgressivas` e `FaixasPorPatamar`); a decisão é de apresentação. O exemplo usa o mesmo `explicar(base)` da regra ([ADR-002](../adr/002-regras-tipadas-em-vez-de-formulas.md)).

## 6. Conciliação do recebimento (L2)

```
registrarRecebimento(valor, data)
  exige Fechada ou EmDivergencia
  adiciona Recebimento
  se soma dos recebimentos = valorAReceber → Recebida            (LiquidacaoRecebida)
  senão                                    → EmDivergencia        (DivergenciaIdentificada(diferenca))

aceitarDiferenca(motivo)                    [role autorizada]
  exige EmDivergencia
  registra a diferença aceita, com motivo e responsável
  → Recebida                                (DivergenciaResolvida)
```

- A diferença pode ser para menos (o hotel pagou menos) ou para mais.
- Se o gestor decide **cobrar o hotel**, a liquidação permanece *EmDivergencia* até chegar um **recebimento complementar** que zere a diferença.
- A diferença aceita **não altera a apuração**: ela fica registrada separadamente, para o histórico mostrar o que o contrato previa e o que de fato foi pago.

## 7. Agregados

### AcordoComParceiro (um por unidade)

```
AcordoComParceiro (Aggregate Root)
  unidadeId: UnidadeId
  parceiro: NomeDoParceiro
  versoes: VersaoDoAcordo[]

  revisar(novaVersao, aPartirDe)        vigência sobreposta → erro
  versoesVigentesEm(periodo)            uma ou mais versões

VersaoDoAcordo (Entity)
  vigencia: Vigencia                    inicio: Data, fim: Data?
  periodicidade: Semanal | Quinzenal | Mensal
  regraServicos: RegraDeParticipacao
  regraProdutos: RegraDeParticipacao    SemParticipacao quando o parceiro não participa de produtos
  inadimplencia: ParceiroAssume | ParceiroDesconta
```

Exemplo:

```
AcordoComParceiro (Hotel X → Unidade SPA)
  v1, vigente de 01/01/2026 a 14/03/2026, mensal
    ├─ Serviços → FaixasProgressivas [até 30.000: 30% | acima: 35%]
    ├─ Produtos → PercentualFixo 10%
    └─ Inadimplência → Parceiro assume
  v2, vigente desde 15/03/2026, mensal
    ├─ Serviços → FaixasProgressivas [até 30.000: 25% | acima: 30%]
    ├─ Produtos → SemParticipacao
    └─ Inadimplência → Parceiro assume
```

A escolha de **incluir ou não os produtos** na participação do parceiro é feita pela `regraProdutos`. A faixa de cada categoria considera só a receita daquela categoria (base separada). A base combinada ficou fora do modelo por enquanto ([ADR-018](../adr/018-base-combinada-adiada.md)).

### LiquidacaoDoPeriodo (uma por unidade e por período)

```
LiquidacaoDoPeriodo (Aggregate Root)
  unidadeId, periodo                    ← periodicidade + início + fim
  trechos: Trecho[]                     ← versão (snapshot) + intervalo de datas
  receitas: ReceitaRegistrada[]         ← origemId, categoria, valor, data, inadimplente
  ajustes: Ajuste[]                     ← valor, motivo, lancadoPor
  recebimentos: Recebimento[]           ← valor, data
  diferencaAceita: DiferencaAceita?     ← valor, motivo, aceitaPor
  situacao: Aberta | Fechada | EmDivergencia | Recebida
  apuracao: Apuracao?                   ← congelada no fechamento

  aplicarRevisao(versao, aPartirDe)     exige Aberta; divide o trecho afetado
  registrarReceita(origemId, categoria, valor, data)   exige Aberta; ignora origem repetida
  registrarInadimplencia(origemId)
  lancarAjuste(ajuste)                  exige Aberta
  previsao(): Apuracao
  fechar()                              exige Aberta → LiquidacaoFechada
  reabrir()                             exige Fechada
  registrarRecebimento(valor, data)     exige Fechada | EmDivergencia
  aceitarDiferenca(motivo)              exige EmDivergencia
```

`previsao()` e `fechar()` usam **o mesmo cálculo**; o fechamento só congela o resultado ([ADR-012](../adr/012-lucro-previsto-como-read-model.md)).

## 8. Value Objects

```
Periodicidade         Semanal | Quinzenal | Mensal
Periodo               periodicidade, inicio: Data, fim: Data
                      Periodo.queContem(periodicidade, data)
                      contem(data) · seguinte()
Vigencia              inicio: Data, fim: Data?
Trecho                versao: VersaoDoAcordo, de: Data, ate: Data
Faixa                 de: Dinheiro, ate: Dinheiro?, percentual: Percentual
DiferencaAceita       valor, motivo, aceitaPor
Apuracao              receitaServicos, receitaProdutos, participacaoParceiro,
                      ajustes, valorAReceber, valorRecebido, diferenca

RegraDeParticipacao   (tipos fechados, mesma interface — ADR-002)
  = PercentualFixo(percentual)
  | FaixasProgressivas(faixas)
  | FaixasPorPatamar(faixas)
  | SemParticipacao

  calcular(base): Dinheiro
  explicar(base): texto
```

## 9. Eventos

**Consome**

| Evento | Origem | Reação |
|---|---|---|
| ServicoCobrado, VendaCobrada | Cobrança | `registrarReceita` |
| CobrancaInadimplente | Cobrança | `registrarInadimplencia` |
| CobrancaEstornada | Cobrança | Receita negativa no período aberto (devoluções e estornos) |
| AcordoRevisado | Este contexto | `aplicarRevisao` na liquidação aberta afetada |

**Publica**

```
LiquidacaoFechada          unidadeId, periodo, receitaBruta, participacaoParceiro, valorAReceber
RecebimentoRegistrado      unidadeId, periodo, valor, data                 ← a cada pagamento do parceiro
AcordoFirmado / AcordoEncerrado   unidadeId, data                       → Cobrança (modalidade), Atendimento (quarto obrigatório)
DivergenciaIdentificada    unidadeId, periodo, valorAReceber, valorRecebido, diferenca
DivergenciaResolvida       unidadeId, periodo, diferencaAceita, motivo
LiquidacaoRecebida         unidadeId, periodo, valorRecebido
```

O **Financeiro** lança a participação e cria o título a receber no fechamento, registra a entrada de caixa a cada `RecebimentoRegistrado` e, quando houver diferença aceita, faz o abatimento ou acréscimo no título com um lançamento de ajuste. O read model de **Resultado** consulta `previsao()` e mostra as liquidações em divergência.

## 10. Repositórios e serviços de aplicação

```
Repositórios
  AcordoComParceiroRepository    porUnidade(unidadeId)
  LiquidacaoRepository           porUnidadeEPeriodo(unidadeId, periodo)

Serviços de aplicação
  FirmarAcordo
  RevisarAcordo          valida o aPartirDe escolhido pelo usuário → revisa
  RegistrarReceita       período que contém a data, pela periodicidade vigente → busca ou abre a liquidação → registra
  LancarAjuste           verifica role → lança
  FecharLiquidacao
  ReabrirLiquidacao      verifica role → reabre
  RegistrarRecebimento
  AceitarDiferenca       verifica role → aceita
  ConsultarPrevisao
  ExemploDasFaixas       mostra o cálculo progressivo e por patamar para uma receita de exemplo (M4)
```

## 11. Testes de domínio

**Cálculo**
- Faixas progressivas [até 30.000: 30% | acima: 35%], receita de R$ 40.000 → **R$ 12.500**.
- Faixas por patamar, mesma receita → **R$ 14.000**.
- Serviços R$ 25.000 + produtos R$ 8.000 → a faixa de serviços olha só os R$ 25.000 (30%).
- Produtos com `SemParticipacao` não geram participação do parceiro.

**Periodicidade**
- Semanal: uma receita de sábado, 17/10/2026, pertence ao período de segunda, 12/10, a domingo, 18/10.
- Quinzenal: receitas de 10/03 e de 20/03 caem em liquidações diferentes (01/03 a 15/03 e 16/03 a 31/03).
- Semanal com faixas progressivas [até 7.000: 30% | acima: 35%] e R$ 10.000 na semana → 7.000 × 30% + 3.000 × 35% = **R$ 3.150**. A receita da semana anterior não entra no acumulado.
- Quinzenal: revisão com `InicioDoProximoPeriodo` feita em 10/03 começa a valer em 16/03.

**Revisão no meio do mês** (acordo mensal; v1: 30%/35%; v2 a partir do dia 15: 25%/30%; R$ 20.000 antes do dia 15 e R$ 20.000 depois)
- Progressivas: 20.000 × 30% + 10.000 × 25% + 10.000 × 30% = **R$ 11.500**.
- Por patamar: o total de 40.000 está na faixa de cima → 20.000 × 35% + 20.000 × 30% = **R$ 13.000**.
- Revisão com `InicioDoProximoPeriodo` mantém um único trecho no período atual.
- Revisão com data num período fechado gera erro.

**Conciliação**
- Recebimento igual ao apurado leva a liquidação para *Recebida*.
- Recebimento menor gera *EmDivergencia* com a diferença correta.
- Recebimento complementar que zera a diferença leva a *Recebida*.
- `aceitarDiferenca` sem motivo gera erro.

**Gerais**
- Registrar receita numa liquidação fechada gera erro.
- O mesmo `origemId` registrado duas vezes conta uma vez.
- Com "parceiro assume", a inadimplência não altera o valor a receber.

## Pendências

L5 (revisão que muda a periodicidade) e L6 (semana que atravessa a virada do mês) em [Pendências](../05-pendencias.md). A premissa L4 (faixas olham o acumulado quando há dois trechos) foi confirmada e, com o [ADR-038](../adr/038-periodos-semanal-quinzenal-e-mensal.md), vale para o período do acordo.
