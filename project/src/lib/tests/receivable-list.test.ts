import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseListPage,
  pendingByUnitPipeline,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list";

const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_MATCH = { $match: { walletId: new Types.ObjectId(WALLET_ID), unitId: new Types.ObjectId(UNIT_ID) } };
const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };
const WALLET_MATCH = { $match: { walletId: new Types.ObjectId(WALLET_ID) } };
const NOT_IN_STATEMENT = [
  {
    $lookup: {
      from: "statements",
      localField: "_id",
      foreignField: "receivableIds",
      as: "statements",
      pipeline: [{ $project: { _id: 1 } }],
    },
  },
  { $match: { statements: { $size: 0 } } },
];
const UNIT_LOOKUP = {
  $lookup: {
    from: "units",
    localField: "unitId",
    foreignField: "_id",
    as: "unit",
    pipeline: [{ $project: { _id: 0, name: 1 } }],
  },
};
const UNIT_NAME = { $ifNull: [{ $first: "$unit.name" }, null] };

describe("parseListPage", () => {
  it.each([
    [{}, 1],
    [{ page: "3" }, 3],
    [{ page: ["2", "5"] }, 2],
    [{ page: "0" }, 1],
    [{ page: "-1" }, 1],
    [{ page: "abc" }, 1],
  ])("%j vira a página %i", (params, page) => {
    expect(parseListPage(params)).toBe(page);
  });
});

describe("pendingReceivablesPipeline", () => {
  it("mostra 20 por página", () => {
    expect(RECEIVABLE_PAGE_SIZE).toBe(20);
  });

  it("lista os recebíveis da unidade na carteira que não estão em nenhum bloco, dos mais recentes, com a soma", () => {
    expect(pendingReceivablesPipeline(WALLET_ID, UNIT_ID, 2)).toEqual([
      UNIT_MATCH,
      {
        $lookup: {
          from: "statements",
          localField: "_id",
          foreignField: "receivableIds",
          as: "statements",
          pipeline: [{ $project: { _id: 1 } }],
        },
      },
      { $match: { statements: { $size: 0 } } },
      { $sort: { accruedAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: 20 },
            { $limit: 20 },
            { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1 } },
          ],
          total: [{ $count: "n" }],
          sum: [{ $group: { _id: null, cents: { $sum: "$valueCents" } } }],
        },
      },
      { $project: { rows: 1, total: TOTAL, totalCents: { $ifNull: [{ $first: "$sum.cents" }, 0] } } },
    ]);
  });
});

describe("statementListPipeline", () => {
  it("lista os blocos da unidade na carteira, dos fechados por último, com bruto, período e pagamento", () => {
    expect(statementListPipeline(WALLET_ID, UNIT_ID, 1)).toEqual([
      UNIT_MATCH,
      { $sort: { closedAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: 0 },
            { $limit: 20 },
            {
              $lookup: {
                from: "receivables",
                localField: "receivableIds",
                foreignField: "_id",
                as: "receivables",
                pipeline: [{ $project: { _id: 0, valueCents: 1, accruedAt: 1 } }],
              },
            },
            {
              $lookup: {
                from: "transactions",
                localField: "transactionId",
                foreignField: "_id",
                as: "transaction",
                pipeline: [{ $project: { _id: 0, totalCents: 1, paidAt: 1 } }],
              },
            },
            {
              $project: {
                _id: 0,
                id: { $toString: "$_id" },
                name: 1,
                closedAt: 1,
                passOnBps: 1,
                count: { $size: "$receivables" },
                grossCents: { $sum: "$receivables.valueCents" },
                from: { $min: "$receivables.accruedAt" },
                to: { $max: "$receivables.accruedAt" },
                paidAt: { $ifNull: [{ $first: "$transaction.paidAt" }, null] },
                totalCents: { $ifNull: [{ $first: "$transaction.totalCents" }, null] },
              },
            },
          ],
          total: [{ $count: "n" }],
        },
      },
      { $project: { rows: 1, total: TOTAL } },
    ]);
  });
});

describe("escopo da carteira inteira", () => {
  it("pendentes de todas as unidades da carteira, com o nome da unidade de cada um", () => {
    expect(pendingReceivablesPipeline(WALLET_ID, null, 1)).toEqual([
      WALLET_MATCH,
      ...NOT_IN_STATEMENT,
      { $sort: { accruedAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: 0 },
            { $limit: 20 },
            UNIT_LOOKUP,
            {
              $project: { _id: 0, id: { $toString: "$_id" }, name: 1, valueCents: 1, accruedAt: 1, unitName: UNIT_NAME },
            },
          ],
          total: [{ $count: "n" }],
          sum: [{ $group: { _id: null, cents: { $sum: "$valueCents" } } }],
        },
      },
      { $project: { rows: 1, total: TOTAL, totalCents: { $ifNull: [{ $first: "$sum.cents" }, 0] } } },
    ]);
  });

  it("fechamentos de todas as unidades da carteira, com o nome da unidade (null quando juntou todas)", () => {
    const stages = statementListPipeline(WALLET_ID, null, 1);
    const facet = stages[2] as unknown as { $facet: { rows: Record<string, unknown>[] } };
    const project = facet.$facet.rows.at(-1) as { $project: Record<string, unknown> };

    expect(stages[0]).toEqual(WALLET_MATCH);
    expect(facet.$facet.rows).toContainEqual(UNIT_LOOKUP);
    expect(project.$project.unitName).toEqual(UNIT_NAME);
  });

  it("na unidade, os fechamentos não trazem o nome da unidade", () => {
    const stages = statementListPipeline(WALLET_ID, UNIT_ID, 1);
    const facet = stages[2] as unknown as { $facet: { rows: Record<string, unknown>[] } };

    expect(facet.$facet.rows).not.toContainEqual(UNIT_LOOKUP);
  });
});

describe("pendingByUnitPipeline", () => {
  it("soma os pendentes da carteira por unidade, em ordem de nome", () => {
    expect(pendingByUnitPipeline(WALLET_ID)).toEqual([
      WALLET_MATCH,
      ...NOT_IN_STATEMENT,
      { $group: { _id: "$unitId", count: { $sum: 1 }, cents: { $sum: "$valueCents" } } },
      {
        $lookup: {
          from: "units",
          localField: "_id",
          foreignField: "_id",
          as: "unit",
          pipeline: [{ $project: { _id: 0, name: 1 } }],
        },
      },
      { $project: { _id: 0, unitId: { $toString: "$_id" }, unitName: UNIT_NAME, count: 1, cents: 1 } },
      { $sort: { unitName: 1 } },
    ]);
  });
});
