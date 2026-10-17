# Catálogo

| | |
|---|---|
| **Classificação** | 🟢 Generic |
| **Subdomínio** | Catálogo |
| **Situação** | ✅ Modelagem definida (com premissa a confirmar: K1) |

## Propósito

Cadastrar o que a empresa oferece: **tipos de serviço** e **produtos**, com seus preços. É próximo de um CRUD; o único cuidado de modelagem está no **histórico de preços** e nas **embalagens**.

## Modelo

![Modelo de Catálogo e Clientes](../diagramas/catalogo-clientes-modelo.drawio.svg)

## Agregados

```
TipoDeServico (Aggregate Root)
  id, empresaId, nome
  duracaoPadrao: Duracao
  precos: TabelaDePreco
  ativo: bool

  alterarPreco(preco, unidadeId?, aPartirDe)
  precoEm(unidadeId, data)
  desativar()

Produto (Aggregate Root)
  id, empresaId, nome
  unidadeBase: ml | g | unidade          imutável depois de criado
  embalagens: Embalagem[]                nome, fator (ex.: Frasco 1 L = 1.000 ml)
  vendavel: bool, insumo: bool
  precos: TabelaDePreco                  por embalagem vendável

TabelaDePreco (Value Object)
  padrao: versões com vigência
  excecoes: unidadeId → versões com vigência
```

**Preço por unidade (K1).** Seguindo o mesmo padrão das comissões, o preço tem um **padrão** e **exceções por unidade** ([ADR-033](../adr/033-precos-com-padrao-e-excecao-por-unidade.md)). Um SPA dentro de hotel pode cobrar mais caro que o espaço próprio pelo mesmo serviço.

## Regras

- A **unidade base de um produto nunca muda**: trocar ml por g invalidaria todo o histórico do estoque. Para mudar, cria-se outro produto.
- O fator de uma embalagem é **maior que zero**; uma embalagem em uso não pode ter o fator alterado (cria-se outra).
- Preços têm **vigência**; alterações não afetam atendimentos e vendas já registrados, porque eles guardam o preço do momento.
- Tipos de serviço e produtos são **desativados**, nunca apagados, porque o histórico os referencia.
- A **ficha técnica não fica aqui**: ela pertence ao Estoque ([ADR-027](../adr/027-ficha-tecnica-no-estoque.md)).

## Eventos publicados

`TipoDeServicoCadastrado` · `ProdutoCadastrado` · `EmbalagemDefinida` · `PrecoAlterado` · `ItemDesativado`

Consumidores: Atendimento (tipos, duração, preço), Vendas (produtos vendáveis, preço), Estoque (unidade base, embalagens).
