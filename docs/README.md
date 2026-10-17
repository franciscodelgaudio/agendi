# Documentação de domínio (DDD): Sistema de Gestão de SPA

Documentação viva da modelagem do sistema com Domain-Driven Design. Ela evolui junto com as sessões de modelagem.

## Por onde começar

| Documento | Conteúdo |
|---|---|
| [Processo de modelagem](00-processo-de-modelagem.md) | O passo a passo de como chegamos ao modelo: perguntas, respostas, decisões e correções |
| [Visão geral](01-visao-geral.md) | Domínio, subdomínios, classificação (Core Domain Chart) e C4 nível 1 |
| [Context Map](02-context-map.md) | Os bounded contexts e como se relacionam |
| [Glossário](03-glossario.md) | Linguagem ubíqua por contexto |
| [Event Storming](04-event-storming.md) | Fluxo principal em post-its e a legenda de cores |
| [Pendências](05-pendencias.md) | Hotspots ainda em aberto |
| [Diagnóstico para a migração](06-diagnostico-migracao.md) | Código atual × modelo, decisões e plano de migração |
| [Fluxo: atendimento concluído](fluxos/atendimento-concluido.md) | Como um atendimento se propaga pelos contextos |
| [Decisões (ADRs)](adr/README.md) | Registro das decisões de arquitetura e modelagem |

## Contextos

| Contexto | Classificação | Situação da modelagem |
|---|---|---|
| [Organização](contextos/organizacao.md) | Supporting | ✅ Tática definida |
| [Atendimento](contextos/atendimento.md) | **Core** | ✅ Tática definida |
| [Liquidação com Parceiro](contextos/liquidacao-parceiro.md) | **Core** | ✅ Tática definida |
| [Remuneração](contextos/remuneracao.md) | **Core** | ✅ Tática definida |
| [Financeiro](contextos/financeiro.md) | Supporting | ✅ Tática definida |
| [Estoque](contextos/estoque.md) | Supporting | ✅ Tática definida |
| [Vendas](contextos/vendas.md) | Supporting | ✅ Tática definida |
| [Cobrança](contextos/cobranca.md) | Generic | ✅ Tática definida |
| [Catálogo](contextos/catalogo.md) | Generic | ✅ Tática definida |
| [Clientes](contextos/clientes.md) | Generic | ✅ Tática definida |

## Estrutura

```
docs/
├── README.md
├── 00-processo-de-modelagem.md
├── 01-visao-geral.md
├── 02-context-map.md
├── 03-glossario.md
├── 04-event-storming.md
├── 05-pendencias.md
├── 06-diagnostico-migracao.md
├── contextos/          um documento por bounded context
├── fluxos/             fluxos entre contextos
├── adr/                decisões (Architecture Decision Records)
└── diagramas/          arquivos .drawio.svg
    └── biblioteca/     biblioteca de formas para o draw.io
```

## Como editar os diagramas

Todos os diagramas estão em `diagramas/` no formato **`.drawio.svg`**: é uma imagem SVG que o Markdown exibe normalmente e, ao mesmo tempo, um diagrama editável (o draw.io guarda o diagrama dentro do próprio arquivo).

1. **Editar:** abra o arquivo no draw.io (aplicativo desktop ou app.diagrams.net) ou, no VS Code, com a extensão **Draw.io Integration**. Salve no mesmo arquivo, mantendo a extensão `.drawio.svg`.
2. **Diff legível no Git:** em *Arquivo → Propriedades*, deixe **"Comprimido"** desmarcado.
3. **Biblioteca de formas:** em *Arquivo → Abrir biblioteca*, escolha `diagramas/biblioteca/ddd-spa.xml`. Ela traz os post-its de Event Storming, as caixas de contexto (core, supporting, generic, externo), as relações do context map (PL, C/S, U/D, ACL) e os modelos de classe (Aggregate Root, Entity, Value Object).

> Os diagramas foram gerados com um layout inicial. Ao abrir no draw.io, sinta-se livre para reposicionar as formas: as conexões acompanham.

## Convenções

- **Cores:** vermelho = core, amarelo = supporting, verde = generic, rosa = sistema externo.
- **Nomes no código** seguem a linguagem ubíqua em português, sem acentos (`LiquidacaoDoPeriodo`).
- **Toda decisão relevante vira um ADR**, inclusive as que substituem outras.
