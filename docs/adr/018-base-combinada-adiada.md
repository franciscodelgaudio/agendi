# ADR-018: Base de apuração combinada fica fora do modelo por enquanto

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Foi discutida uma base combinada, em que a faixa de serviços olharia o total do mês (serviços + produtos). Com faixas progressivas, há várias formas de repartir a participação, e o caso real usa base separada. A escolha de incluir ou não produtos já existe por meio da `regraProdutos`.

## Decisão

Implementar só a base **separada**: cada categoria aplica sua regra sobre a própria receita. O parâmetro `BaseDeApuracao` sai do modelo.

## Consequências

Modelo mais simples. Quando surgir a necessidade, ela será modelada como uma ideia própria, possivelmente um novo tipo de regra, sem alterar as existentes.

## Alternativas descartadas

Modelar agora a base combinada (proporcional, serviços primeiro ou serviços por último).
