import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  PARTNER_PAGE_SIZE,
  parsePartnerListQuery,
  partnerListPipeline,
} from "@/service/workspace/[workspaceId]/partners/partner-list";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const BASE = { q: "", unit: "", page: 1 } as const;
const WORKSPACE_MATCH = { workspaceId: new Types.ObjectId(WORKSPACE_ID) };
const ROWS = [
  {
    $lookup: {
      from: "units",
      localField: "unitId",
      foreignField: "_id",
      as: "unit",
      pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
    },
  },
  {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      name: 1,
      imageUrl: { $ifNull: ["$imageUrl", null] },
      thresholdRule: 1,
      tiers: { $map: { input: "$tiers", in: { thresholdCents: "$$this.thresholdCents", shareBps: "$$this.shareBps" } } },
      unit: { $ifNull: [{ $first: "$unit" }, null] },
    },
  },
];
const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };

describe("parsePartnerListQuery", () => {
  it("sem parâmetros, mostra todos os parceiros na página 1", () => {
    expect(parsePartnerListQuery({})).toEqual(BASE);
  });

  it("lê busca, filtro de unidade e página válidos", () => {
    expect(parsePartnerListQuery({ q: " hotel ", unit: "linked", page: "2" })).toEqual({ q: "hotel", unit: "linked", page: 2 });
    expect(parsePartnerListQuery({ unit: "unlinked" }).unit).toBe("unlinked");
  });

  it("ignora filtro e página inválidos", () => {
    expect(parsePartnerListQuery({ unit: "all", page: "-1" })).toEqual(BASE);
  });
});

describe("partnerListPipeline", () => {
  it("mostra 20 parceiros por página", () => {
    expect(PARTNER_PAGE_SIZE).toBe(20);
  });

  it("sem filtros, lista os parceiros do workspace por nome, com a unidade de cada um e o total", () => {
    expect(partnerListPipeline(WORKSPACE_ID, BASE)).toEqual([
      { $match: WORKSPACE_MATCH },
      { $sort: { name: 1, _id: 1 } },
      { $facet: { rows: [{ $skip: 0 }, { $limit: 20 }, ...ROWS], total: [{ $count: "n" }] } },
      { $project: { rows: 1, total: TOTAL } },
    ]);
  });

  it("busca no nome, sem diferenciar acentos", () => {
    const stages = partnerListPipeline(WORKSPACE_ID, { ...BASE, q: "clinica" });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(match).toEqual({ $match: { ...WORKSPACE_MATCH, name: { $regex: expect.any(String), $options: "i" } } });
    expect(new RegExp(match.$match.name.$regex, "i").test("Clínica Bem Viver")).toBe(true);
  });

  it.each([
    ["linked", { $ne: null }],
    ["unlinked", null],
  ] as const)("filtro de unidade %s", (unit, unitId) => {
    expect(partnerListPipeline(WORKSPACE_ID, { ...BASE, unit })[0]).toEqual({ $match: { ...WORKSPACE_MATCH, unitId } });
  });

  it("pula as páginas anteriores", () => {
    const stages = partnerListPipeline(WORKSPACE_ID, { ...BASE, page: 3 });

    expect(stages[2]).toEqual({ $facet: { rows: [{ $skip: 40 }, { $limit: 20 }, ...ROWS], total: [{ $count: "n" }] } });
  });
});
