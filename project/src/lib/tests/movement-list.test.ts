import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  MOVEMENT_PAGE_SIZE,
  movementListPipeline,
  parseMovementListQuery,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/movement-list";

const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60900";
const BASE = { q: "", type: "", page: 1 } as const;

describe("parseMovementListQuery", () => {
  it("sem parâmetros, mostra entradas e saídas na página 1", () => {
    expect(parseMovementListQuery({})).toEqual(BASE);
  });

  it("lê busca, tipo e página", () => {
    expect(parseMovementListQuery({ q: " compra ", type: "in", page: "3" })).toEqual({ q: "compra", type: "in", page: 3 });
  });

  it("ignora tipo e página inválidos", () => {
    expect(parseMovementListQuery({ type: "transfer", page: "abc" })).toEqual(BASE);
  });
});

describe("movementListPipeline", () => {
  const inventoryMatch = { inventoryId: new Types.ObjectId(INVENTORY_ID) };
  const tail = (skip: number) => [
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: MOVEMENT_PAGE_SIZE },
          { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              type: 1,
              quantity: 1,
              productName: { $ifNull: [{ $first: "$product.name" }, null] },
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("lista os movimentos do inventário do mais recente para o mais antigo", () => {
    expect(movementListPipeline(INVENTORY_ID, BASE)).toEqual([{ $match: inventoryMatch }, ...tail(0)]);
  });

  it("filtra pelo tipo, busca no nome do movimento e pula as páginas anteriores", () => {
    const stages = movementListPipeline(INVENTORY_ID, { q: "compra", type: "out", page: 2 });

    expect(stages).toEqual([
      { $match: { ...inventoryMatch, type: "out", name: { $regex: expect.any(String), $options: "i" } } },
      ...tail(MOVEMENT_PAGE_SIZE),
    ]);
  });
});
