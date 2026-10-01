import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { parseProductListQuery, productListPipeline } from "@/lib/product-list";

describe("parseProductListQuery", () => {
  it("usa busca vazia e ordenação por nome crescente quando não há parâmetros", () => {
    expect(parseProductListQuery({})).toEqual({ q: "", sort: "name", dir: "asc" });
  });

  it.each(["name", "quantity", "costCents", "rating"])("aceita ordenação por %s", (sort) => {
    expect(parseProductListQuery({ sort }).sort).toBe(sort);
  });

  it("lê busca e direção, removendo espaços das pontas da busca", () => {
    expect(parseProductListQuery({ q: "  óleo  ", sort: "quantity", dir: "desc" })).toEqual({
      q: "óleo",
      sort: "quantity",
      dir: "desc",
    });
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(parseProductListQuery({ q: ["a", "b"], sort: ["rating", "name"], dir: ["desc", "asc"] })).toEqual({
      q: "a",
      sort: "rating",
      dir: "desc",
    });
  });

  it.each([
    ["campo fora da lista", { sort: "unitId" }],
    ["campo não ordenável", { sort: "notes" }],
    ["campo com operador", { sort: "$where" }],
  ])("volta para nome quando o sort é %s", (_label, params) => {
    expect(parseProductListQuery(params).sort).toBe("name");
  });

  it("volta para crescente quando a direção é inválida", () => {
    expect(parseProductListQuery({ dir: "sideways" }).dir).toBe("asc");
  });
});

const HOLDER_ID = "64b7f0c2a1b2c3d4e5f60790";

// Etapas sobre os produtos do catálogo, com a quantidade dos itens de estoque. Com o estoque
// (holderId: da unidade ou o compartilhado), só os produtos que estão nele, com a quantidade
// de lá; sem, todos do catálogo, com a soma de todos os estoques.
describe("productListPipeline", () => {
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      name: 1,
      quantity: 1,
      valueCents: 1,
      nextUnitCostCents: 1,
      costCents: 1,
      notes: { $ifNull: ["$notes", null] },
      rating: { $ifNull: ["$rating", null] },
      avatarUrl: { $ifNull: ["$avatarUrl", null] },
    },
  };
  const ALL_ITEMS = {
    $lookup: { from: "stock_items", localField: "_id", foreignField: "productId", as: "items", pipeline: [] },
  };
  const HOLDER_ITEMS = [
    {
      $lookup: {
        from: "stock_items",
        localField: "_id",
        foreignField: "productId",
        as: "items",
        pipeline: [{ $match: { holderId: new Types.ObjectId(HOLDER_ID) } }],
      },
    },
    { $match: { items: { $ne: [] } } },
  ];
  // Valor: soma de quantidade × preço de cada lote de cada item. Próximo a sair: o custo do
  // lote mais antigo, só com um estoque (com vários, não há um próximo).
  const VALUE = {
    $sum: {
      $map: {
        input: "$items",
        as: "item",
        in: {
          $sum: {
            $map: {
              input: { $ifNull: ["$$item.lots", []] },
              as: "lot",
              in: { $multiply: ["$$lot.quantity", "$$lot.unitCostCents"] },
            },
          },
        },
      },
    },
  };
  const NEXT_COST = {
    $ifNull: [{ $getField: { field: "unitCostCents", input: { $first: { $first: "$items.lots" } } } }, null],
  };
  const QUANTITY = { $addFields: { quantity: { $sum: "$items.quantity" }, valueCents: VALUE, nextUnitCostCents: null } };
  const HOLDER_QUANTITY = {
    $addFields: { quantity: { $sum: "$items.quantity" }, valueCents: VALUE, nextUnitCostCents: NEXT_COST },
  };

  it("sem estoque, traz o catálogo com a soma (quantidade e valor) de todos os estoques, ordena (com _id de desempate) e projeta", () => {
    expect(productListPipeline({ q: "", sort: "name", dir: "asc" })).toEqual([
      ALL_ITEMS,
      QUANTITY,
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("com o estoque, só os produtos que estão nele, com a quantidade, o valor e o próximo a sair de lá", () => {
    expect(productListPipeline({ q: "", sort: "name", dir: "asc" }, HOLDER_ID)).toEqual([
      ...HOLDER_ITEMS,
      HOLDER_QUANTITY,
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it.each([
    ["quantity", "asc", { quantity: 1, _id: 1 }],
    ["costCents", "desc", { costCents: -1, _id: 1 }],
    ["rating", "desc", { rating: -1, _id: 1 }],
  ] as const)("ordena por %s %s, depois de calcular a quantidade", (sort, dir, $sort) => {
    expect(productListPipeline({ q: "", sort, dir })).toEqual([ALL_ITEMS, QUANTITY, { $sort }, PROJECT]);
  });

  it("com busca, filtra o nome sem diferenciar maiúsculas antes de tudo", () => {
    expect(productListPipeline({ q: "óleo", sort: "name", dir: "asc" }, HOLDER_ID)).toEqual([
      { $match: { name: { $regex: "óleo", $options: "i" } } },
      ...HOLDER_ITEMS,
      HOLDER_QUANTITY,
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = productListPipeline({ q: "a.b*(c)", sort: "name", dir: "asc" });

    expect(match).toEqual({ $match: { name: { $regex: "a\\.b\\*\\(c\\)", $options: "i" } } });
  });
});
