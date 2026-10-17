# ADR-025: Resultado, títulos e caixa como registros separados

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

O cliente real tem lucro em março e recebe o dinheiro em abril. Um único registro de "lançamento" misturaria resultado (competência) com dinheiro (caixa).

## Decisão

Três registros imutáveis ou com histórico: **Lançamento** (receita ou despesa por competência), **Título** (a receber ou a pagar, com baixas) e **Movimento de Caixa** (entrada ou saída real). Baixas são **pagamentos** (geram movimento) ou **abatimentos** (exigem lançamento de ajuste). Pagamentos nunca são recusados; excessos levam o título a *ComDivergencia*.

## Consequências

O sistema responde separadamente quanto se ganhou, quanto falta receber ou pagar e quanto dinheiro se moveu. A Liquidação passa a publicar `RecebimentoRegistrado` a cada pagamento do parceiro.

## Alternativas descartadas

Um único livro de lançamentos com status previsto/realizado; contabilidade completa por partidas dobradas (excessiva para o subdomínio supporting).
