# Catálogo

| | |
|---|---|
| **Classificação** | 🟢 Generic |
| **Subdomínio** | Catálogo |
| **Situação** | ✅ Modelagem definida (revista em 17/10/2026: oferta do serviço por unidade) |

## Propósito

Cadastrar o que a empresa oferece: **tipos de serviço**, a **oferta de cada serviço em cada unidade** e **produtos**, com seus preços. É próximo de um CRUD; o único cuidado de modelagem está no **histórico de preços** e nas **embalagens**.

## Modelo

![Modelo de Catálogo e Clientes](../diagramas/catalogo-clientes-modelo.drawio.svg)

> O diagrama ainda mostra o `TipoDeServico` com duração e `TabelaDePreco`, e não mostra a `OfertaDoServico`. O texto abaixo é a referência até o diagrama ser atualizado.

## Agregados

```
TipoDeServico (Aggregate Root)
  id, empresaId, nome                    identidade comum na empresa
  ativo: bool

  renomear(nome)
  desativar()

OfertaDoServico (Aggregate Root)         uma por tipo de serviço e unidade
  tipoServicoId, unidadeId
  duracao: Duracao
  salasPermitidas: SalaId[]              salas do Atendimento, só por ID
  exigeProfissional: bool                false: ex.: hidromassagem (ADR-037)
  precos: versões com vigência
  ativa: bool

  alterarPreco(preco, aPartirDe)
  precoEm(data)
  alterarDuracao(duracao)
  definirSalas(salaIds)
  desativar()

Produto (Aggregate Root)
  id, empresaId, nome
  unidadeBase: ml | g | unidade          imutável depois de criado
  embalagens: Embalagem[]                nome, fator (ex.: Frasco 1 L = 1.000 ml)
  vendavel: bool, insumo: bool
  precos: TabelaDePreco                  por embalagem vendável

TabelaDePreco (Value Object)             só para produtos
  padrao: versões com vigência
  excecoes: unidadeId → versões com vigência
```

**Oferta do serviço por unidade.** O **Tipo de Serviço** é da empresa: é a identidade comum ("Massagem relaxante") usada pela comissão por tipo, pela ficha técnica, pelas metas e pelos relatórios consolidados. **Cada unidade mantém a sua própria oferta** do serviço, com duração, salas permitidas, se exige profissional e preço próprios ([ADR-039](../adr/039-oferta-do-servico-por-unidade.md)). Um SPA dentro de hotel pode cobrar mais caro, usar outra sala e ter outra duração para o mesmo tipo de serviço.

**Preço de produto por unidade.** Para produtos continua valendo o padrão do [ADR-033](../adr/033-precos-com-padrao-e-excecao-por-unidade.md): um preço **padrão** com **exceções por unidade**.

## Regras

- Uma unidade só agenda os tipos de serviço para os quais tem **oferta ativa**. Um tipo de serviço desativado desativa as ofertas.
- As **salas permitidas** de uma oferta são salas **da mesma unidade**. O Catálogo guarda só os IDs e consulta as salas pela API pública do Atendimento.
- A **unidade base de um produto nunca muda**: trocar ml por g invalidaria todo o histórico do estoque. Para mudar, cria-se outro produto.
- O fator de uma embalagem é **maior que zero**; uma embalagem em uso não pode ter o fator alterado (cria-se outra).
- Preços têm **vigência**; alterações não afetam atendimentos e vendas já registrados, porque eles guardam o preço do momento.
- Tipos de serviço, ofertas e produtos são **desativados**, nunca apagados, porque o histórico os referencia.
- A **ficha técnica não fica aqui**: ela pertence ao Estoque ([ADR-027](../adr/027-ficha-tecnica-no-estoque.md)).

## Migração

Decisões tomadas ao comparar o modelo com o sistema em produção ([diagnóstico](../06-diagnostico-migracao.md#2-decisões-tomadas-após-o-diagnóstico)):

- **Serviços:** cada `Service` atual (cadastrado por unidade) vira a **oferta** da sua unidade. Os tipos de serviço são criados agrupando os nomes iguais dentro da empresa; nomes diferentes viram tipos diferentes.
- **Produtos:** os produtos existentes são migrados com unidade base **"unidade"**, porque a base não tem o tamanho de cada embalagem. Como a unidade base é imutável, quando o gestor quiser controlar em ml ou g ele **recadastra o produto** com a nova unidade base.

## Eventos publicados

`TipoDeServicoCadastrado` · `OfertaDoServicoDefinida` · `ProdutoCadastrado` · `EmbalagemDefinida` · `PrecoAlterado` · `ItemDesativado`

Consumidores: Atendimento (ofertas da unidade: duração, salas, exige profissional, preço), Vendas (produtos vendáveis, preço) e Estoque (unidade base, embalagens).
