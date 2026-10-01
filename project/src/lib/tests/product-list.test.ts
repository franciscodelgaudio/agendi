import { describe, it, expect } from "vitest";
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

describe("productListPipeline", () => {
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      unitId: { $toString: "$unitId" },
      stockId: { $toString: "$stockId" },
      unitQuantities: {
        $map: {
          input: { $ifNull: ["$unitQuantities", []] },
          in: { unitId: { $toString: "$$this.unitId" }, quantity: "$$this.quantity" },
        },
      },
      name: 1,
      quantity: 1,
      costCents: 1,
      notes: { $ifNull: ["$notes", null] },
      rating: { $ifNull: ["$rating", null] },
      avatarUrl: { $ifNull: ["$avatarUrl", null] },
    },
  };

  it("sem busca, só ordena (com _id de desempate) e projeta", () => {
    expect(productListPipeline({ q: "", sort: "name", dir: "asc" })).toEqual([
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it.each([
    ["quantity", "asc", { quantity: 1, _id: 1 }],
    ["costCents", "desc", { costCents: -1, _id: 1 }],
    ["rating", "desc", { rating: -1, _id: 1 }],
  ] as const)("ordena por %s %s", (sort, dir, $sort) => {
    expect(productListPipeline({ q: "", sort, dir })).toEqual([{ $sort }, PROJECT]);
  });

  it("com busca, filtra o nome sem diferenciar maiúsculas antes de ordenar", () => {
    expect(productListPipeline({ q: "óleo", sort: "name", dir: "asc" })).toEqual([
      { $match: { name: { $regex: "óleo", $options: "i" } } },
      { $sort: { name: 1, _id: 1 } },
      PROJECT,
    ]);
  });

  it("projeta o id da unidade do produto, para listar produtos de várias unidades", () => {
    const [project] = productListPipeline({ q: "", sort: "name", dir: "asc" }).slice(-1);

    expect(project).toMatchObject({ $project: { unitId: { $toString: "$unitId" } } });
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = productListPipeline({ q: "a.b*(c)", sort: "name", dir: "asc" });

    expect(match).toEqual({ $match: { name: { $regex: "a\\.b\\*\\(c\\)", $options: "i" } } });
  });
});
