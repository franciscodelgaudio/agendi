import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseServiceListQuery,
  SERVICE_PAGE_SIZE,
  serviceListPipeline,
} from "@/service/workspace/[workspaceId]/services/service-list";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const BASE = { q: "", sort: "name", dir: "asc", page: 1 } as const;

describe("parseServiceListQuery", () => {
  it("sem parâmetros, ordena por nome crescente na página 1", () => {
    expect(parseServiceListQuery({})).toEqual(BASE);
  });

  it.each(["name", "price", "duration"])("aceita ordenação por %s", (sort) => {
    expect(parseServiceListQuery({ sort }).sort).toBe(sort);
  });

  it("lê busca, direção e página e ignora valores inválidos", () => {
    expect(parseServiceListQuery({ q: " candle ", dir: "desc", page: "2" })).toEqual({ ...BASE, q: "candle", dir: "desc", page: 2 });
    expect(parseServiceListQuery({ sort: "avatarUrl", dir: "x", page: "0" })).toEqual(BASE);
  });
});

describe("serviceListPipeline", () => {
  const workspaceMatch = { workspaceId: new Types.ObjectId(WORKSPACE_ID) };
  const tail = (sort: Record<string, number>, skip: number) => [
    { $sort: { ...sort, _id: 1 } },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: SERVICE_PAGE_SIZE },
          { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, durationMinutes: 1, priceCents: 1 } },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("lista os serviços do workspace por nome", () => {
    expect(serviceListPipeline(WORKSPACE_ID, BASE)).toEqual([{ $match: workspaceMatch }, ...tail({ name: 1 }, 0)]);
  });

  it("busca no nome sem diferenciar acentos, ordena pela duração decrescente e pagina", () => {
    const stages = serviceListPipeline(WORKSPACE_ID, { q: "facial", sort: "duration", dir: "desc", page: 2 });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(stages.slice(1)).toEqual(tail({ durationMinutes: -1 }, SERVICE_PAGE_SIZE));
    expect(new RegExp(match.$match.name.$regex, match.$match.name.$options).test("Limpeza Fácial")).toBe(true);
  });

  it("ordena pelo preço", () => {
    expect(serviceListPipeline(WORKSPACE_ID, { ...BASE, sort: "price" })[1]).toEqual({ $sort: { priceCents: 1, _id: 1 } });
  });
});
