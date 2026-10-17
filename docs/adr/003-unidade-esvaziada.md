# ADR-003: Esvaziar a Unidade

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

No sistema antigo a `Unidade` era o modelo central de tudo. Quando o negócio real mostrou que não era assim, surgiram gambiarras. Era uma entidade-deus.

## Decisão

A Unidade fica só com identidade, empresa, nome, endereço e situação. Cada contexto guarda os vínculos e regras que lhe interessam (acordo com parceiro, carteira, depósito, salas, políticas), referenciando a unidade **por ID**.

## Consequências

Mudar uma regra de um contexto não afeta os outros. Os contextos mantêm cópia local do nome, atualizada por eventos. A refatoração usa a tabela de destino em [Organização](../contextos/organizacao.md) como checklist.

## Alternativas descartadas

Promover a Organização a core e manter a Unidade como centro.
