# ADR-016: Revisão do acordo com data de início escolhida pelo usuário

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Um parceiro pode mudar as regras do acordo no meio do mês. Foi proposto que toda revisão valesse só a partir do mês seguinte, mas o negócio decidiu deixar a escolha com o usuário.

## Decisão

Ao revisar, o usuário escolhe `InicioDoProximoPeriodo` ou uma data específica. A data de início fica explícita na versão. Uma revisão no meio de um período aberto divide a liquidação em **trechos**, cada um com o snapshot da sua versão. As faixas olham o **acumulado do mês inteiro**; a versão do trecho define os percentuais aplicados às receitas daquele trecho.

## Consequências

O limite das faixas continua mensal, como no contrato. Com um trecho só, o cálculo é idêntico ao anterior. Revisões em período fechado exigem reabrir a liquidação. A forma de aplicar faixas em dois trechos foi confirmada pelo negócio.

## Alternativas descartadas

Revisão sempre no mês seguinte; faixas reiniciadas em cada trecho.
