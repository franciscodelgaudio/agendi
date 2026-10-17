# ADR-019: Base da comissão configurável no plano

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Não estava definido se a comissão do profissional incide sobre o valor cobrado (com desconto) ou sobre o preço de tabela. Como em outras regras do sistema, o negócio prefere deixar o usuário decidir.

## Decisão

`baseDaComissao: ValorCobrado | PrecoDeTabela` é um parâmetro da versão do plano, com padrão `ValorCobrado`. Em cancelamento e no-show, a base é sempre a `baseDeRemuneracao` calculada pelo Atendimento.

## Consequências

Cada empresa decide se o desconto é dividido com o profissional. O evento `AtendimentoConcluido` precisa trazer os dois valores, o que já acontece.

## Alternativas descartadas

Fixar uma das duas bases.
