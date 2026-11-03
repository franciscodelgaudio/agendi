import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  transactionTotalsPipeline,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list";

const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const BASE = { q: "", type: "", sort: "paidAt", dir: "desc", page: 1 } as const;
const MONTH = { $addFields: { month: { $dateToString: { format: "%Y-%m", date: "$paidAt", timezone: "America/Sao_Paulo" } } } };

describe("parseTransactionListQuery", () => {
  it("sem parâmetros, mostra tudo pelo dia pago mais recente na página 1", () => {
    expect(parseTransactionListQuery({})).toEqual(BASE);
  });

  it("lê busca, filtros, ordenação e página válidos", () => {
    expect(
      parseTransactionListQuery({ q: " aluguel ", type: "expense", sort: "total", dir: "asc", page: "2" }),
    ).toEqual({ q: "aluguel", type: "expense", sort: "total", dir: "asc", page: 2 });
  });

  it("ignora valores inválidos", () => {
    expect(parseTransactionListQuery({ type: "transfer", status: "late", sort: "walletId", dir: "up", page: "0" })).toEqual(
      BASE,
    );
  });
});

describe("transactionListPipeline", () => {
  const walletMatch = { walletId: new Types.ObjectId(WALLET_ID) };
  const paged = (skip: number) => [
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: TRANSACTION_PAGE_SIZE },
          {
            $lookup: {
              from: "statements",
              localField: "_id",
              foreignField: "transactionId",
              as: "statements",
              pipeline: [{ $project: { _id: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              totalCents: 1,
              type: 1,
              paidAt: 1,
              month: 1,
              fromStatement: { $gt: [{ $size: "$statements" }, 0] },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("mostra 20 transações por página", () => {
    expect(TRANSACTION_PAGE_SIZE).toBe(20);
  });

  it("sem filtros, lista as transações da carteira por mês de Brasília e dia pago, do mais recente ao mais antigo", () => {
    expect(transactionListPipeline(WALLET_ID, BASE)).toEqual([
      { $match: walletMatch },
      MONTH,
      { $sort: { month: -1, paidAt: -1, _id: -1 } },
      ...paged(0),
    ]);
  });

  it("filtra por tipo e busca no nome, sem diferenciar acentos", () => {
    const stages = transactionListPipeline(WALLET_ID, { ...BASE, q: "joao", type: "incoming" });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(match).toEqual({
      $match: {
        ...walletMatch,
        type: "incoming",
        name: { $regex: expect.any(String), $options: "i" },
      },
    });
    expect(new RegExp(match.$match.name.$regex, "i").test("Atendimento · João")).toBe(true);
  });

  it("ordena pelo valor crescente dentro de cada mês, mantendo os meses do mais recente ao mais antigo, e pula as páginas anteriores", () => {
    expect(transactionListPipeline(WALLET_ID, { ...BASE, sort: "total", dir: "asc", page: 3 })).toEqual([
      { $match: walletMatch },
      MONTH,
      { $sort: { month: -1, totalCents: 1, _id: -1 } },
      ...paged(40),
    ]);
  });

  it("com unidade, lista só as transações da unidade dentro da carteira", () => {
    expect(transactionListPipeline(WALLET_ID, { ...BASE, type: "expense" }, UNIT_ID)[0]).toEqual({
      $match: { ...walletMatch, unitId: new Types.ObjectId(UNIT_ID), type: "expense" },
    });
  });
});

describe("transactionTotalsPipeline", () => {
  const paidSum = (type: string) => ({ $sum: { $cond: [{ $eq: ["$type", type] }, "$totalCents", 0] } });

  it("soma as entradas e saídas da unidade na carteira e o saldo", () => {
    expect(transactionTotalsPipeline(WALLET_ID, UNIT_ID)).toEqual([
      { $match: { walletId: new Types.ObjectId(WALLET_ID), unitId: new Types.ObjectId(UNIT_ID) } },
      { $group: { _id: null, incomingCents: paidSum("incoming"), expenseCents: paidSum("expense") } },
      {
        $project: {
          _id: 0,
          incomingCents: 1,
          expenseCents: 1,
          balanceCents: { $subtract: ["$incomingCents", "$expenseCents"] },
        },
      },
    ]);
  });
});
