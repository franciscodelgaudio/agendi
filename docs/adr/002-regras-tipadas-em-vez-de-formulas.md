# ADR-002: Regras de cálculo como tipos fechados, não fórmulas livres

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Foi proposto que o usuário escrevesse fórmulas para as regras de participação e remuneração, evitando várias regras no código.

## Decisão

Regras são **tipos fechados com parâmetros** (`PercentualFixo`, `FaixasProgressivas`, `FaixasPorPatamar`, `SemParticipacao`), todos com a mesma interface `calcular(base)` e `explicar(base)`. O usuário escolhe o tipo e preenche um formulário validado.

## Consequências

O sistema entende a regra: explica o cálculo, mostra quanto falta para mudar de faixa e simula cenários. Erros de digitação viram erros de validação, não cálculos errados silenciosos. Não é preciso um interpretador de fórmulas. Se surgir a necessidade, `RegraPorFormula` pode ser mais um tipo.

## Alternativas descartadas

Fórmulas configuráveis pelo usuário.
