# Decisões (ADRs)

Formato: Architecture Decision Record (Michael Nygard). Uma decisão por arquivo; decisões substituídas não são apagadas, são marcadas como *Substituída* (ou *Substituída em parte*, quando só um trecho deixa de valer).

| # | Decisão | Status |
|---|---|---|
| 001 | [Resolver o problema real e modelar explicitamente as variações conhecidas](001-problema-real-com-variacoes-explicitas.md) | Aceita |
| 002 | [Regras de cálculo como tipos fechados, não fórmulas livres](002-regras-tipadas-em-vez-de-formulas.md) | Aceita |
| 003 | [Esvaziar a Unidade](003-unidade-esvaziada.md) | Aceita |
| 004 | [Não existe contexto de "Configuração Comercial"](004-sem-contexto-de-configuracao.md) | Aceita |
| 005 | [Agenda e Atendimento num único bounded context](005-agenda-e-atendimento-no-mesmo-contexto.md) | Aceita |
| 006 | [Agenda por empresa e por dia, com concorrência otimista](006-agenda-por-empresa-e-dia.md) | Aceita |
| 007 | [Eventos carregam as consequências já calculadas](007-eventos-com-consequencias-calculadas.md) | Aceita |
| 008 | [Regras congeladas (snapshot) no momento do fato](008-snapshot-das-regras-no-momento-do-fato.md) | Aceita |
| 009 | ["Repasse" eram dois conceitos: Liquidação com Parceiro e Remuneração](009-dois-repasses-dois-contextos.md) | Aceita |
| 010 | [Livro de lançamentos imutáveis](010-lancamentos-imutaveis.md) | Aceita |
| 011 | [Caixa/Carteira e Estoque/Depósito como agrupamentos independentes](011-agrupamentos-financeiro-e-estoque.md) | Aceita |
| 012 | [Lucro previsto é calculado, não gravado](012-lucro-previsto-como-read-model.md) | Aceita |
| 013 | [Consumo de insumos por ficha técnica e inventário](013-consumo-teorico-e-inventario.md) | Aceita |
| 014 | [Desconto explícito no modelo; permissões fora do domínio](014-desconto-explicito-permissoes-fora-do-dominio.md) | Aceita |
| 015 | [Classificação dos subdomínios](015-classificacao-dos-subdominios.md) | Aceita |
| 016 | [Revisão do acordo com data de início escolhida pelo usuário](016-revisao-do-acordo-com-data-escolhida.md) | Substituída em parte por [ADR-038](038-periodos-semanal-quinzenal-e-mensal.md) (faixas olham o período, não só o mês) |
| 017 | [Conciliação do recebimento com estado de divergência](017-conciliacao-do-recebimento.md) | Aceita |
| 018 | [Base de apuração combinada fica fora do modelo por enquanto](018-base-combinada-adiada.md) | Aceita |
| 019 | [Base da comissão configurável no plano](019-base-da-comissao-configuravel.md) | Aceita |
| 020 | [Meta e Acompanhamento da Meta como agregados separados, apurados antes da folha](020-metas-com-acompanhamento-separado.md) | Aceita |
| 021 | [Fato que chega após o fechamento entra na próxima folha](021-fato-tardio-entra-na-proxima-folha.md) | Aceita |
| 022 | [Condições de comissão por unidade, com padrão e exceções](022-condicoes-de-comissao-por-unidade.md) | Aceita |
| 023 | [Rateio do fixo mensal entre unidades escolhido pelo usuário](023-rateio-do-fixo-escolhido-pelo-usuario.md) | Aceita |
| 024 | [Composição das carteiras num único agregado por empresa](024-estrutura-financeira-num-agregado.md) | Aceita |
| 025 | [Resultado, títulos e caixa como registros separados](025-resultado-titulos-e-caixa-separados.md) | Aceita |
| 026 | [Unidade nova ganha uma carteira própria automaticamente](026-unidade-nova-ganha-carteira-propria.md) | Aceita |
| 027 | [Ficha técnica pertence ao Estoque](027-ficha-tecnica-no-estoque.md) | Aceita |
| 028 | [Custo dos produtos pelo custo médio ponderado](028-custo-medio-ponderado.md) | Aceita |
| 029 | [Venda sem saldo: política configurável por depósito](029-politica-de-venda-sem-saldo-por-deposito.md) | Aceita |
| 030 | [Estrutura de estoque no mesmo padrão da financeira](030-estrutura-de-estoque-espelha-a-financeira.md) | Aceita |
| 031 | [Modalidade de cobrança decidida por cobrança](031-modalidade-de-cobranca-por-cobranca.md) | Aceita |
| 032 | [Receita reconhecida quando a cobrança é criada](032-receita-reconhecida-na-cobranca.md) | Aceita |
| 033 | [Preços com padrão e exceções por unidade](033-precos-com-padrao-e-excecao-por-unidade.md) | Substituída em parte por [ADR-039](039-oferta-do-servico-por-unidade.md) (serviços); vale para produtos |
| 034 | [Devolução como evento compensatório, não como alteração da venda](034-devolucao-como-evento-compensatorio.md) | Aceita |
| 035 | [Um atendimento pode ter mais de um serviço](035-atendimento-com-varios-servicos.md) | Aceita |
| 036 | [Capacidade da Sala](036-capacidade-da-sala.md) | Aceita |
| 037 | [Serviço sem profissional](037-servico-sem-profissional.md) | Aceita |
| 038 | [Liquidação com períodos semanal, quinzenal e mensal](038-periodos-semanal-quinzenal-e-mensal.md) | Aceita |
| 039 | [Cada unidade mantém a sua própria Oferta do Serviço](039-oferta-do-servico-por-unidade.md) | Aceita |
| 040 | [CPF como identidade do cliente recorrente](040-cpf-como-identidade-do-cliente.md) | Aceita |
| 041 | [Quarto obrigatório só em unidade com parceiro](041-quarto-obrigatorio-so-com-parceiro.md) | Aceita (conflito com o ADR-031 em aberto: pendência C3) |

## Modelo para novas decisões

```markdown
# ADR-NNN: Título

- **Status:** Proposta | Aceita | Substituída por ADR-XXX | Substituída em parte por ADR-XXX
- **Data:** AAAA-MM-DD (as decisões até o ADR-034 usam só AAAA-MM)

## Contexto
## Decisão
## Consequências
## Alternativas descartadas
```
