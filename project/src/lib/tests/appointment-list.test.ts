import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  APPOINTMENT_PAGE_SIZE,
  appointmentSearchPipeline,
  parseAppointmentListQuery,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";

describe("parseAppointmentListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena pelos mais recentes primeiro", () => {
    expect(parseAppointmentListQuery({})).toEqual({
      q: "",
      sort: "performedAt",
      dir: "desc",
      unit: "",
      therapist: "",
      from: "",
      to: "",
      page: 1,
    });
  });

  it("lê busca, ordenação, direção e filtros válidos", () => {
    expect(
      parseAppointmentListQuery({
        q: "joão",
        sort: "totalCents",
        dir: "asc",
        unit: UNIT_ID,
        therapist: ANA_ID,
        from: "2026-09-01",
        to: "2026-09-30",
        page: "3",
      }),
    ).toEqual({
      q: "joão",
      sort: "totalCents",
      dir: "asc",
      unit: UNIT_ID,
      therapist: ANA_ID,
      from: "2026-09-01",
      to: "2026-09-30",
      page: 3,
    });
  });

  it("aceita ordenação por guestName", () => {
    expect(parseAppointmentListQuery({ sort: "guestName" }).sort).toBe("guestName");
  });

  it("ignora o dia antigo da URL", () => {
    expect(parseAppointmentListQuery({ date: "2026-09-20" })).not.toHaveProperty("date");
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseAppointmentListQuery({ q: "  204  " }).q).toBe("204");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(
      parseAppointmentListQuery({
        q: ["a", "b"],
        sort: ["guestName", "totalCents"],
        dir: ["asc", "desc"],
        unit: [UNIT_ID, ANA_ID],
        therapist: [ANA_ID, UNIT_ID],
        from: ["2026-09-01", "2026-08-01"],
        to: ["2026-09-30", "2026-08-31"],
        page: ["3", "5"],
      }),
    ).toEqual({
      q: "a",
      sort: "guestName",
      dir: "asc",
      unit: UNIT_ID,
      therapist: ANA_ID,
      from: "2026-09-01",
      to: "2026-09-30",
      page: 3,
    });
  });

  it.each([
    ["formato errado", "24/09/2026"],
    ["dia que não existe", "2026-02-30"],
    ["com hora", "2026-09-20T10:00"],
  ])("ignora o período quando a data tem %s", (_label, date) => {
    expect(parseAppointmentListQuery({ from: date, to: date })).toEqual(
      expect.objectContaining({ from: "", to: "" }),
    );
  });

  it.each([
    ["campo fora da lista", "unitId"],
    ["caminho do banco em vez da chave", "guest.name"],
    ["campo com operador", "$where"],
  ])("volta para horário quando o sort é %s", (_label, sort) => {
    expect(parseAppointmentListQuery({ sort }).sort).toBe("performedAt");
  });

  it.each([
    ["zero", "0"],
    ["negativa", "-2"],
    ["texto", "abc"],
    ["fracionária", "1.5"],
    ["com sufixo", "2abc"],
  ])("volta para a página 1 quando ela é %s", (_label, page) => {
    expect(parseAppointmentListQuery({ page }).page).toBe(1);
  });

  it("volta para decrescente quando a direção é inválida", () => {
    expect(parseAppointmentListQuery({ dir: "sideways" }).dir).toBe("desc");
  });

  it.each([
    ["texto", "centro"],
    ["id curto", "64b7f0c2a1b2"],
    ["id com caractere inválido", "64b7f0c2a1b2c3d4e5f6072z"],
    ["objeto de operador", "{ $ne: null }"],
  ])("ignora filtros inválidos (%s)", (_label, value) => {
    expect(parseAppointmentListQuery({ unit: value, therapist: value })).toEqual(
      expect.objectContaining({ unit: "", therapist: "" }),
    );
  });
});

describe("appointmentSearchPipeline", () => {
  const BASE = {
    q: "",
    sort: "performedAt",
    dir: "desc",
    unit: "",
    therapist: "",
    from: "",
    to: "",
    page: 1,
  } as const;

  // O total é calculado antes da ordenação para que seja possível ordenar por ele.
  const SET_TOTAL = { $set: { totalCents: { $sum: "$items.priceCents" } } };
  const SORT = { $sort: { performedAt: -1, _id: 1 } };
  // unitId, serviceId e therapistId vão junto para a coluna de unidade e o formulário de edição.
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      unitId: { $toString: "$unitId" },
      performedAt: 1,
      guest: 1,
      items: {
        $map: {
          input: "$items",
          as: "item",
          in: {
            serviceId: { $toString: "$$item.serviceId" },
            serviceName: "$$item.serviceName",
            priceCents: "$$item.priceCents",
            durationMinutes: "$$item.durationMinutes",
            therapistId: { $toString: "$$item.therapistId" },
            therapistName: "$$item.therapistName",
          },
        },
      },
      // Produtos escolhidos, para pré-marcar na edição.
      productIds: { $map: { input: "$products", as: "product", in: { $toString: "$$product.productId" } } },
      totalCents: 1,
    },
  };
  // Numa ida só: a página pedida, já projetada, e a quantidade de tudo que passou pela busca e
  // pelos filtros (para a paginação).
  const paged = (skip: number) => [
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: APPOINTMENT_PAGE_SIZE }, PROJECT],
        summary: [{ $count: "n" }],
      },
    },
    {
      $project: {
        rows: 1,
        total: { $ifNull: [{ $first: "$summary.n" }, 0] },
      },
    },
  ];

  it("mostra 20 atendimentos por página", () => {
    expect(APPOINTMENT_PAGE_SIZE).toBe(20);
  });

  it("sem busca nem filtros, pega todos, calcula o total, ordena (com _id de desempate) e pagina", () => {
    expect(appointmentSearchPipeline(BASE)).toEqual([SET_TOTAL, SORT, ...paged(0)]);
  });

  it.each([
    ["performedAt", "asc", { performedAt: 1, _id: 1 }],
    ["guestName", "asc", { "guest.name": 1, _id: 1 }],
    ["guestName", "desc", { "guest.name": -1, _id: 1 }],
    ["totalCents", "desc", { totalCents: -1, _id: 1 }],
  ] as const)("ordena por %s %s usando o campo do banco", (sort, dir, $sort) => {
    expect(appointmentSearchPipeline({ ...BASE, sort, dir })).toEqual([SET_TOTAL, { $sort }, ...paged(0)]);
  });

  it("com filtros, restringe pela unidade e pelo profissional de algum dos serviços num $match", () => {
    expect(appointmentSearchPipeline({ ...BASE, unit: UNIT_ID, therapist: ANA_ID })).toEqual([
      { $match: { unitId: new Types.ObjectId(UNIT_ID), "items.therapistId": new Types.ObjectId(ANA_ID) } },
      SET_TOTAL,
      SORT,
      ...paged(0),
    ]);
  });

  it("pula as páginas anteriores depois de filtrar e ordenar", () => {
    expect(appointmentSearchPipeline({ ...BASE, unit: UNIT_ID, page: 3 })).toEqual([
      { $match: { unitId: new Types.ObjectId(UNIT_ID) } },
      SET_TOTAL,
      SORT,
      ...paged(40),
    ]);
  });

  // Dias de Brasília, ambos incluídos: 01/09 00:00 até 30/09 23:59 = 03:00 UTC de 01/09 até 03:00 UTC de 01/10.
  it("com período, pega os realizados entre o início do primeiro dia e o fim do último", () => {
    expect(appointmentSearchPipeline({ ...BASE, from: "2026-09-01", to: "2026-09-30" })).toEqual([
      {
        $match: {
          performedAt: { $gte: new Date("2026-09-01T03:00:00.000Z"), $lt: new Date("2026-10-01T03:00:00.000Z") },
        },
      },
      SET_TOTAL,
      SORT,
      ...paged(0),
    ]);
  });

  it("período só com início ou só com fim fica aberto do outro lado", () => {
    expect(appointmentSearchPipeline({ ...BASE, from: "2026-09-24" })[0]).toEqual({
      $match: { performedAt: { $gte: new Date("2026-09-24T03:00:00.000Z") } },
    });
    expect(appointmentSearchPipeline({ ...BASE, to: "2026-09-24" })[0]).toEqual({
      $match: { performedAt: { $lt: new Date("2026-09-25T03:00:00.000Z") } },
    });
  });

  it("período e filtros entram no mesmo $match", () => {
    expect(
      appointmentSearchPipeline({ ...BASE, unit: UNIT_ID, therapist: ANA_ID, from: "2026-09-24", to: "2026-09-24" })[0],
    ).toEqual({
      $match: {
        performedAt: { $gte: new Date("2026-09-24T03:00:00.000Z"), $lt: new Date("2026-09-25T03:00:00.000Z") },
        unitId: new Types.ObjectId(UNIT_ID),
        "items.therapistId": new Types.ObjectId(ANA_ID),
      },
    });
  });

  it("com busca, filtra hóspede, quarto, profissional ou serviço sem diferenciar maiúsculas antes de ordenar", () => {
    const regex = { $regex: "joão", $options: "i" };
    expect(appointmentSearchPipeline({ ...BASE, q: "joão" })).toEqual([
      {
        $match: {
          $or: [
            { "guest.name": regex },
            { "guest.room": regex },
            { "items.therapistName": regex },
            { "items.serviceName": regex },
          ],
        },
      },
      SET_TOTAL,
      SORT,
      ...paged(0),
    ]);
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = appointmentSearchPipeline({ ...BASE, q: "a.b*(c)" });
    const regex = { $regex: "a\\.b\\*\\(c\\)", $options: "i" };

    expect(match).toEqual({
      $match: {
        $or: [
          { "guest.name": regex },
          { "guest.room": regex },
          { "items.therapistName": regex },
          { "items.serviceName": regex },
        ],
      },
    });
  });
});
