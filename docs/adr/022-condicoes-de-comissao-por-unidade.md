# ADR-022: Condições de comissão por unidade, com padrão e exceções

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Uma profissional pode atender em mais de uma unidade, e o negócio confirmou que as comissões podem ser diferentes em cada uma (por exemplo, no hotel e no espaço próprio). A regra de inadimplência também tende a variar, porque no hotel o parceiro costuma pagar mesmo quando o hóspede não paga.

## Decisão

Cada versão do plano tem **condições padrão** e **exceções por unidade**. As condições (comissão de serviços, comissão de produtos, base da comissão e regra de inadimplência) são um value object, `CondicoesDeComissao`. O fixo mensal continua sendo um só por profissional, lançado por padrão na **unidade principal** definida no plano. Toda linha da folha registra a unidade de origem.

## Consequências

Continua existindo um único plano e uma única folha por profissional, como ela percebe a própria remuneração. Incluir a profissional numa unidade nova não exige alterar o plano. O Financeiro recebe os totais por unidade e lança cada valor na carteira certa.

## Alternativas descartadas

Um plano por profissional e unidade (duplicaria o fixo e as metas individuais); um tipo de regra `PorUnidade` aninhado em cada comissão (espalharia a unidade por várias regras e não cobriria a inadimplência).
