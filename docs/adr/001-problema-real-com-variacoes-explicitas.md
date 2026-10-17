# ADR-001: Resolver o problema real e modelar explicitamente as variações conhecidas

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O sistema nasce de um cliente real (SPA dentro de hotel), mas deve ser vendido a outros modelos de negócio. Havia dois riscos: fixar as regras do cliente no código (cada novo cliente vira um `if`) ou generalizar para qualquer negócio (configurações abertas, abstrações erradas).

## Decisão

Resolver o caso real com profundidade. Cada ponto onde o negócio varia vira um **conceito explícito do domínio**: uma política com um **conjunto fechado de tipos**. Implementam-se os tipos que o cliente real usa e os que já se sabe que o mercado usa. Generalizar só com dois ou três casos concretos.

## Consequências

Novos clientes com regras novas exigem um novo tipo, sem reescrever o modelo. As interfaces já comportam os casos futuros (metas, rateio desigual, base combinada), mas a implementação entra quando um cliente precisar.

## Alternativas descartadas

Modelar só o caso real; motor de regras genérico.
