import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  INVENTORY_PAGE_SIZE,
  inventoryListPipeline,
  parseInventoryListQuery,
} from "@/service/workspace/[workspaceId]/stock/inventory-list";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const BASE = { q: "", unit: "", sort: "name", dir: "asc", page: 1 } as const;
const WORKSPACE_MATCH = { workspaceId: new Types.ObjectId(WORKSPACE_ID) };
const UNITS_LOOKUP = {
  $lookup: {
    from: "units",
    localField: "_id",
    foreignField: "inventoryId",
    as: "units",
    pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
  },
};
const ROW_PROJECT = {
  $project: {
    _id: 0,
    id: { $toString: "$_id" },
    name: 1,
    units: 1,
    productCount: { $size: { $filter: { input: "$products", cond: { $gt: ["$$this.quantity", 0] } } } },
    quantity: { $sum: "$products.quantity" },
  },
};
const TOTAL = { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } };

function facet(skip: number) {
  return { $facet: { rows: [{ $skip: skip }, { $limit: 20 }], total: [{ $count: "n" }] } };
}

describe("parseInventoryListQuery", () => {
  it("sem parâmetros, mostra todos os estoques por nome na página 1", () => {
    expect(parseInventoryListQuery({})).toEqual(BASE);
  });

  it("lê busca, filtro de unidade, ordenação e página válidos", () => {
    expect(
      parseInventoryListQuery({ q: " sala ", unit: "unlinked", sort: "quantity", dir: "desc", page: "3" }),
    ).toEqual({ q: "sala", unit: "unlinked", sort: "quantity", dir: "desc", page: 3 });
    expect(parseInventoryListQuery({ unit: "linked", sort: "products" })).toMatchObject({ unit: "linked", sort: "products" });
  });

  it("ignora filtro, ordenação, direção e página inválidos", () => {
    expect(parseInventoryListQuery({ unit: "all", sort: "price", dir: "up", page: "0" })).toEqual(BASE);
  });
});

describe("inventoryListPipeline", () => {
  it("mostra 20 estoques por página", () => {
    expect(INVENTORY_PAGE_SIZE).toBe(20);
  });

  it("sem filtros, lista os estoques do workspace por nome, com unidades, produtos com saldo, itens e total", () => {
    expect(inventoryListPipeline(WORKSPACE_ID, BASE)).toEqual([
      { $match: WORKSPACE_MATCH },
      UNITS_LOOKUP,
      ROW_PROJECT,
      { $sort: { name: 1, id: 1 } },
      facet(0),
      TOTAL,
    ]);
  });

  it("busca no nome, sem diferenciar acentos", () => {
    const stages = inventoryListPipeline(WORKSPACE_ID, { ...BASE, q: "deposito" });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(match).toEqual({ $match: { ...WORKSPACE_MATCH, name: { $regex: expect.any(String), $options: "i" } } });
    expect(new RegExp(match.$match.name.$regex, "i").test("Depósito Central")).toBe(true);
  });

  it.each([
    ["linked", { units: { $ne: [] } }],
    ["unlinked", { units: [] }],
  ] as const)("filtro de unidade %s vem depois de buscar as unidades", (unit, filter) => {
    expect(inventoryListPipeline(WORKSPACE_ID, { ...BASE, unit }).slice(0, 3)).toEqual([
      { $match: WORKSPACE_MATCH },
      UNITS_LOOKUP,
      { $match: filter },
    ]);
  });

  it.each([
    ["name", "asc", { name: 1, id: 1 }],
    ["products", "desc", { productCount: -1, id: 1 }],
    ["quantity", "asc", { quantity: 1, id: 1 }],
  ] as const)("ordena por %s %s", (sort, dir, expected) => {
    expect(inventoryListPipeline(WORKSPACE_ID, { ...BASE, sort, dir })).toContainEqual({ $sort: expected });
  });

  it("pula as páginas anteriores", () => {
    expect(inventoryListPipeline(WORKSPACE_ID, { ...BASE, page: 3 })).toContainEqual(facet(40));
  });
});
