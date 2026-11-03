import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  parseListPage,
  parseStatementListQuery,
  partnerPeriodsPipeline,
  pendingByDayPipeline,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list";

const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const PARTNER_ID = "64b7f0c2a1b2c3d4e5f60a00";
const UNIT_MATCH = { $match: { walletId: new Types.ObjectId(WALLET_ID), unitId: new Types.ObjectId(UNIT_ID) } };
const TOTAL = { $ifNull: [{ $first: "$total.n" }, 0] };
const WALLET_MATCH = { $match: { walletId: new Types.ObjectId(WALLET_ID) } };
const NOT_SETTLED = [
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
  {
    $lookup: {
      from: "transactions",
      localField: "_id",
      foreignField: "receivableId",
      as: "transactions",
      pipeline: [{ $project: { _id: 1 } }],
    },
  },
  { $match: { transactions: { $size: 0 } } },
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

  it("lista os recebíveis da unidade na carteira que não estão em nenhum fechamento nem foram recebidos direto, dos mais recentes, com a soma", () => {
    expect(pendingReceivablesPipeline(WALLET_ID, UNIT_ID, 2)).toEqual([
      UNIT_MATCH,
      ...NOT_SETTLED,
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
  const STATEMENT_ROWS = [
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
      $lookup: {
        from: "partners",
        localField: "partnerId",
        foreignField: "_id",
        as: "partner",
        pipeline: [{ $project: { _id: 0, name: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        createdAt: 1,
        from: 1,
        to: 1,
        grossCents: 1,
        shareBps: 1,
        count: { $size: "$receivableIds" },
        partnerName: { $ifNull: [{ $first: "$partner.name" }, null] },
        paidAt: { $ifNull: [{ $first: "$transaction.paidAt" }, null] },
        totalCents: { $ifNull: [{ $first: "$transaction.totalCents" }, null] },
      },
    },
  ];

  it("lista os fechamentos do parceiro, do período mais recente, com bruto e faixa gravados, nome do parceiro e pagamento", () => {
    expect(statementListPipeline({ partnerId: PARTNER_ID }, 2)).toEqual([
      { $match: { partnerId: new Types.ObjectId(PARTNER_ID) } },
      { $sort: { to: -1, _id: -1 } },
      {
        $facet: {
          rows: [{ $skip: 20 }, { $limit: 20 }, ...STATEMENT_ROWS],
          total: [{ $count: "n" }],
        },
      },
      { $project: { rows: 1, total: TOTAL } },
    ]);
  });

  it("na carteira, lista os fechamentos de todos os parceiros que entram nela", () => {
    expect(statementListPipeline({ walletId: WALLET_ID }, 1)).toEqual([
      WALLET_MATCH,
      { $sort: { to: -1, _id: -1 } },
      {
        $facet: {
          rows: [{ $skip: 0 }, { $limit: 20 }, ...STATEMENT_ROWS],
          total: [{ $count: "n" }],
        },
      },
      { $project: { rows: 1, total: TOTAL } },
    ]);
  });
});

describe("parseStatementListQuery", () => {
  it("sem parâmetros, mostra todos os repasses na página 1", () => {
    expect(parseStatementListQuery({})).toEqual({ q: "", check: "", page: 1 });
  });

  it("lê busca, conferência e página válidas", () => {
    expect(parseStatementListQuery({ q: " outubro ", check: "diff", page: "2" })).toEqual({ q: "outubro", check: "diff", page: 2 });
    expect(parseStatementListQuery({ check: "match" }).check).toBe("match");
  });

  it("ignora conferência e página inválidas", () => {
    expect(parseStatementListQuery({ check: "all", page: "0" })).toEqual({ q: "", check: "", page: 1 });
  });
});

describe("statementListPipeline com busca e conferência", () => {
  const PARTNER_MATCH = { partnerId: new Types.ObjectId(PARTNER_ID) };
  const SORT = { $sort: { to: -1, _id: -1 } };
  const RECEIVED_LOOKUP = {
    $lookup: {
      from: "transactions",
      localField: "transactionId",
      foreignField: "_id",
      as: "transaction",
      pipeline: [{ $project: { _id: 0, totalCents: 1 } }],
    },
  };
  const RECEIVED = { $first: "$transaction.totalCents" };
  const EXPECTED_NET = {
    $subtract: ["$grossCents", { $floor: { $add: [{ $divide: [{ $multiply: ["$grossCents", "$shareBps"] }, 10_000] }, 0.5] } }],
  };
  const unfiltered = statementListPipeline({ partnerId: PARTNER_ID }, 1);

  it("sem busca nem conferência, é a mesma lista de sempre", () => {
    expect(statementListPipeline({ partnerId: PARTNER_ID }, 1, { q: "", check: "" })).toEqual(unfiltered);
  });

  it("busca no nome do repasse, sem diferenciar acentos", () => {
    const stages = statementListPipeline({ partnerId: PARTNER_ID }, 1, { q: "marco", check: "" });
    const match = stages[0] as { $match: { name: { $regex: string; $options: string } } };

    expect(match).toEqual({ $match: { ...PARTNER_MATCH, name: { $regex: expect.any(String), $options: "i" } } });
    expect(new RegExp(match.$match.name.$regex, "i").test("Repasse de março de 2026")).toBe(true);
    expect(stages.slice(1)).toEqual(unfiltered.slice(1));
  });

  it("conferência que bateu: só os repasses em que o recebido é igual ao esperado (bruto menos a parte do parceiro, arredondada)", () => {
    const stages = statementListPipeline({ partnerId: PARTNER_ID }, 1, { q: "", check: "match" });

    expect(stages.slice(0, 4)).toEqual([
      { $match: PARTNER_MATCH },
      RECEIVED_LOOKUP,
      { $match: { $expr: { $eq: [RECEIVED, EXPECTED_NET] } } },
      SORT,
    ]);
    expect(stages.slice(4)).toEqual(unfiltered.slice(2));
  });

  it("conferência com diferença: só os repasses em que o recebido não bate com o esperado", () => {
    const stages = statementListPipeline({ partnerId: PARTNER_ID }, 1, { q: "", check: "diff" });

    expect(stages.slice(1, 3)).toEqual([RECEIVED_LOOKUP, { $match: { $expr: { $ne: [RECEIVED, EXPECTED_NET] } } }]);
  });
});

describe("partnerPeriodsPipeline", () => {
  it("lista os períodos dos fechamentos do parceiro em dias de Brasília, do mais antigo ao mais recente", () => {
    expect(partnerPeriodsPipeline(PARTNER_ID)).toEqual([
      { $match: { partnerId: new Types.ObjectId(PARTNER_ID) } },
      { $sort: { to: 1, _id: 1 } },
      {
        $project: {
          _id: 0,
          name: 1,
          from: { $dateToString: { format: "%Y-%m-%d", date: "$from", timezone: "-03:00" } },
          to: { $dateToString: { format: "%Y-%m-%d", date: "$to", timezone: "-03:00" } },
        },
      },
    ]);
  });
});

describe("escopo da carteira inteira", () => {
  it("pendentes de todas as unidades da carteira, com o nome da unidade de cada um", () => {
    expect(pendingReceivablesPipeline(WALLET_ID, null, 1)).toEqual([
      WALLET_MATCH,
      ...NOT_SETTLED,
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
});

describe("pendingByDayPipeline", () => {
  const BY_UNIT_AND_DAY = {
    $group: {
      _id: {
        unitId: "$unitId",
        day: { $dateToString: { format: "%Y-%m-%d", date: "$accruedAt", timezone: "-03:00" } },
      },
      count: { $sum: 1 },
      cents: { $sum: "$valueCents" },
    },
  };

  it("soma os pendentes da carteira por unidade e por dia de Brasília, com o nome da unidade, em ordem de dia", () => {
    expect(pendingByDayPipeline(WALLET_ID, null)).toEqual([
      WALLET_MATCH,
      ...NOT_SETTLED,
      BY_UNIT_AND_DAY,
      {
        $lookup: {
          from: "units",
          localField: "_id.unitId",
          foreignField: "_id",
          as: "unit",
          pipeline: [{ $project: { _id: 0, name: 1 } }],
        },
      },
      {
        $project: {
          _id: 0,
          unitId: { $toString: "$_id.unitId" },
          day: "$_id.day",
          count: 1,
          cents: 1,
          unitName: UNIT_NAME,
        },
      },
      { $sort: { day: 1, unitName: 1 } },
    ]);
  });

  it("numa unidade, soma só os pendentes dela por dia, sem buscar o nome", () => {
    expect(pendingByDayPipeline(WALLET_ID, UNIT_ID)).toEqual([
      UNIT_MATCH,
      ...NOT_SETTLED,
      BY_UNIT_AND_DAY,
      { $project: { _id: 0, unitId: { $toString: "$_id.unitId" }, day: "$_id.day", count: 1, cents: 1 } },
      { $sort: { day: 1 } },
    ]);
  });
});
