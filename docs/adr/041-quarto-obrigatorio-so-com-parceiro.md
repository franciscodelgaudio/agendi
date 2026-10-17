# ADR-041: Quarto obrigatório só em unidade com parceiro

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

No sistema em produção, o quarto do hóspede é obrigatório em todo atendimento, inclusive no espaço próprio, onde não faz sentido. No modelo, o quarto era opcional e ficava no cliente avulso; a Cobrança usa `ContaDoHospede` quando a unidade tem acordo com parceiro **e** o cliente tem quarto informado, e o cliente sem quarto paga na hora ([ADR-031](031-modalidade-de-cobranca-por-cobranca.md), pendência C1).

## Decisão

O negócio decidiu que o quarto é:

- **opcional** em unidade de espaço próprio;
- **obrigatório** em unidade que funciona dentro de um parceiro (com acordo com parceiro vigente).

O quarto é um dado **do atendimento**, não do cadastro do cliente, porque muda a cada hospedagem. Para aplicar a regra, o Atendimento mantém uma cópia local de quais unidades têm acordo, atualizada por `AcordoFirmado` e `AcordoEncerrado` (como a Cobrança já faz).

## Consequências

**Conflito em aberto com o ADR-031.** Com o quarto obrigatório, todo atendimento numa unidade com parceiro teria quarto e seria cobrado na conta do hóspede. O cliente de fora, que o ADR-031 manda pagar na hora, não tem quarto e não poderia ser registrado sem inventar um. Esse conflito não foi resolvido aqui: virou a pendência **C3**, para o negócio confirmar. Até a resposta, o ADR-031 continua valendo para a Cobrança.

A decisão foi tomada para atendimentos; nas vendas de produto, o quarto continua opcional até a resposta de C3. No espaço próprio, informar o quarto não muda a cobrança (sem acordo, é sempre `NaHora`).

## Alternativas descartadas

Quarto sempre obrigatório (como hoje); quarto sempre opcional (só o ADR-031).
