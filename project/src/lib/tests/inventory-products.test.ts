import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  INVENTORY_PRODUCT_PAGE_SIZE,
  inventoryProductsPipeline,
  parseInventoryProductsQuery,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/inventory-products";

const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";
const BASE = { q: "", sort: "name", dir: "asc", page: 1 } as const;

describe("parseInventoryProductsQuery", () => {
  it("sem parâmetros, ordena por nome crescente na página 1", () => {
    expect(parseInventoryProductsQuery({})).toEqual(BASE);
  });

  it("lê busca, ordenação e página", () => {
    expect(parseInventoryProductsQuery({ q: " óleo ", sort: "quantity", dir: "desc", page: "2" })).toEqual({
      q: "óleo",
      sort: "quantity",
      dir: "desc",
      page: 2,
    });
  });

  it("ignora valores inválidos", () => {
    expect(parseInventoryProductsQuery({ sort: "price", dir: "x", page: "-1" })).toEqual(BASE);
  });
});

describe("inventoryProductsPipeline", () => {
  const head = [
    { $match: { _id: new Types.ObjectId(INVENTORY_ID) } },
    { $unwind: "$products" },
    { $lookup: { from: "products", localField: "products.productId", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    {
      $project: {
        _id: 0,
        id: { $toString: "$product._id" },
        name: "$product.name",
        priceCents: "$product.priceCents",
        quantity: "$products.quantity",
      },
    },
  ];
  const paged = (skip: number) => [
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: INVENTORY_PRODUCT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("lista os produtos do inventário com a quantidade, por nome", () => {
    expect(inventoryProductsPipeline(INVENTORY_ID, BASE)).toEqual([
      ...head,
      { $sort: { name: 1, id: 1 } },
      ...paged(0),
    ]);
  });

  it("busca no nome do produto sem diferenciar acentos, ordena pela quantidade e pagina", () => {
    const stages = inventoryProductsPipeline(INVENTORY_ID, { q: "oleo", sort: "quantity", dir: "desc", page: 2 });
    const search = stages[head.length] as { $match: { name: { $regex: string; $options: string } } };

    expect(stages.slice(head.length + 1)).toEqual([{ $sort: { quantity: -1, id: 1 } }, ...paged(INVENTORY_PRODUCT_PAGE_SIZE)]);
    expect(new RegExp(search.$match.name.$regex, search.$match.name.$options).test("Óleo de amêndoas")).toBe(true);
  });
});
