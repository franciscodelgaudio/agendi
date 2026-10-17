# ADR-038: Liquidação com períodos semanal, quinzenal e mensal

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

O modelo da Liquidação com Parceiro só tinha período mensal (`Periodo = ano, mês`), e as faixas olhavam o acumulado do mês ([ADR-016](016-revisao-do-acordo-com-data-escolhida.md), premissa L4). O produto em produção já oferece participação do parceiro **semanal, quinzenal e mensal**, porque os acordos com hotéis variam. O negócio decidiu manter as três opções (M5).

Na mesma conversa, o negócio decidiu que, na tela do acordo, **o usuário escolhe entre faixas progressivas e faixas por patamar**, vendo **um exemplo numérico de cada** (M4). O modelo já tinha os dois tipos; a decisão é de apresentação e fica registrada aqui, sem ADR próprio.

## Decisão

Cada versão do acordo tem uma **Periodicidade**:

- `Semanal`: de segunda a domingo, como no sistema atual;
- `Quinzenal`: dias 1 a 15 e dia 16 ao fim do mês;
- `Mensal`: o mês inteiro.

O `Periodo` deixa de ser (ano, mês) e passa a ser periodicidade + início + fim. Existe **uma liquidação por unidade e por período**. As faixas olham o **acumulado do período** (a premissa L4 vale para o período escolhido, não só para o mês), e os limites das faixas valem por período. `InicioDoProximoPeriodo` passa a significar o início do próximo período da periodicidade vigente. Os trechos funcionam do mesmo jeito dentro de qualquer período.

## Consequências

Substitui em parte o ADR-016: onde ele diz "mês inteiro", leia-se "período do acordo". Com periodicidade mensal, nada muda. O sistema não converte limites de faixa entre periodicidades: quem muda de mensal para semanal revisa os limites. Ficaram como premissas a confirmar a revisão que muda a periodicidade (L5) e a semana que atravessa a virada do mês no Financeiro, que continua mensal (L6).

## Alternativas descartadas

Só período mensal (tiraria uma opção que os clientes já usam); período livre, com datas escolhidas a cada liquidação (abriria casos sem regra clara para as faixas).
