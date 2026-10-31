import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list";

const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const BASE = { q: "", type: "", status: "", sort: "paidAt", dir: "desc", page: 1 } as const;

describe("parseTransactionListQuery", () => {
  it("sem parâmetros, mostra tudo pelo dia pago mais recente na página 1", () => {
    expect(parseTransactionListQuery({})).toEqual(BASE);
  });

  it("lê busca, filtros, ordenação e página válidos", () => {
    expect(
      parseTransactionListQuery({ q: " aluguel ", type: "expense", status: "pending", sort: "total", dir: "asc", page: "2" }),
    ).toEqual({ q: "aluguel", type: "expense", status: "pending", sort: "total", dir: "asc", page: 2 });
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
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              totalCents: 1,
              type: 1,
              paidAt: 1,
              fromAppointment: { $ne: [{ $ifNull: ["$appointmentId", null] }, null] },
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

  it("sem filtros, lista as transações da carteira pelo dia pago mais recente", () => {
    expect(transactionListPipeline(WALLET_ID, BASE)).toEqual([
      { $match: walletMatch },
      { $sort: { paidAt: -1, _id: -1 } },
      ...paged(0),
    ]);
  });

  it("filtra por tipo e situação e busca no nome, sem diferenciar acentos", () => {
    const stages = transactionListPipeline(WALLET_ID, { ...BASE, q: "joao", type: "incoming", status: "paid" });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(match).toEqual({
      $match: {
        ...walletMatch,
        type: "incoming",
        paidAt: { $ne: null },
        name: { $regex: expect.any(String), $options: "i" },
      },
    });
    expect(new RegExp(match.$match.name.$regex, "i").test("Atendimento · João")).toBe(true);
  });

  it("pendentes são as sem dia de pagamento", () => {
    expect(transactionListPipeline(WALLET_ID, { ...BASE, status: "pending" })[0]).toEqual({
      $match: { ...walletMatch, paidAt: null },
    });
  });

  it("ordena pelo valor crescente e pula as páginas anteriores", () => {
    expect(transactionListPipeline(WALLET_ID, { ...BASE, sort: "total", dir: "asc", page: 3 })).toEqual([
      { $match: walletMatch },
      { $sort: { totalCents: 1, _id: -1 } },
      ...paged(40),
    ]);
  });
});
