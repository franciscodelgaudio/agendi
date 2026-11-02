import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseListPage,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list";

const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_MATCH = { $match: { walletId: new Types.ObjectId(WALLET_ID), unitId: new Types.ObjectId(UNIT_ID) } };
const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };

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
