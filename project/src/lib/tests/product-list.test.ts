import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseProductListQuery,
  PRODUCT_PAGE_SIZE,
  productListPipeline,
} from "@/service/workspace/[workspaceId]/stock/products/product-list";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const BASE = { q: "", sort: "name", dir: "asc", page: 1 } as const;

describe("parseProductListQuery", () => {
  it("sem parâmetros, ordena por nome crescente na página 1", () => {
    expect(parseProductListQuery({})).toEqual(BASE);
  });

  it.each(["name", "price", "quantity"])("aceita ordenação por %s", (sort) => {
    expect(parseProductListQuery({ sort }).sort).toBe(sort);
  });

  it("lê busca, direção e página, usando o primeiro valor repetido", () => {
    expect(parseProductListQuery({ q: ["  óleo  ", "x"], dir: "desc", page: "4" })).toEqual({
      ...BASE,
      q: "óleo",
      dir: "desc",
      page: 4,
    });
  });

  it("ignora valores inválidos", () => {
    expect(parseProductListQuery({ sort: "$where", dir: "up", page: "1.5" })).toEqual(BASE);
  });
});

describe("productListPipeline", () => {
  const workspaceMatch = { workspaceId: new Types.ObjectId(WORKSPACE_ID) };
  const tail = (sort: Record<string, number>, skip: number) => [
    {
      $lookup: {
        from: "inventories",
        localField: "_id",
        foreignField: "products.productId",
        as: "inventories",
        pipeline: [{ $project: { _id: 0, products: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        priceCents: 1,
        quantity: {
          $sum: {
            $map: {
              input: "$inventories",
              as: "inventory",
              in: {
                $sum: {
                  $map: {
                    input: { $filter: { input: "$$inventory.products", cond: { $eq: ["$$this.productId", "$_id"] } } },
                    in: "$$this.quantity",
                  },
                },
              },
            },
          },
        },
      },
    },
    { $sort: { ...sort, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: PRODUCT_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("lista o catálogo do workspace com a quantidade somada de todos os inventários", () => {
    expect(productListPipeline(WORKSPACE_ID, BASE)).toEqual([{ $match: workspaceMatch }, ...tail({ name: 1 }, 0)]);
  });

  it("busca no nome sem diferenciar acentos, ordena pelo preço decrescente e pagina", () => {
    const stages = productListPipeline(WORKSPACE_ID, { q: "oleo", sort: "price", dir: "desc", page: 2 });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(stages.slice(1)).toEqual(tail({ priceCents: -1 }, PRODUCT_PAGE_SIZE));
    expect(new RegExp(match.$match.name.$regex, match.$match.name.$options).test("Óleo de amêndoas")).toBe(true);
  });

  it("ordena pela quantidade em estoque", () => {
    expect(productListPipeline(WORKSPACE_ID, { ...BASE, sort: "quantity" }).at(-3)).toEqual({ $sort: { quantity: 1, id: 1 } });
  });
});
