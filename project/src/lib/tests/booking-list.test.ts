import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  bookingListPipeline,
  bookingSearchPipeline,
  BOOKING_PAGE_SIZE,
  parseBookingListQuery,
  parseBookingRange,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";

// O calendário pede os dias visíveis: início incluído, fim excluído (dias de Brasília).
describe("parseBookingRange", () => {
  it("lê o intervalo sem filtros", () => {
    expect(parseBookingRange({ start: "2026-09-20", end: "2026-09-27" })).toEqual({
      start: "2026-09-20",
      end: "2026-09-27",
      unit: "",
      therapist: "",
    });
  });

  it("lê os filtros de unidade e profissional", () => {
    expect(parseBookingRange({ start: "2026-09-20", end: "2026-09-27", unit: UNIT_ID, therapist: ANA_ID })).toEqual({
      start: "2026-09-20",
      end: "2026-09-27",
      unit: UNIT_ID,
      therapist: ANA_ID,
    });
  });

  it("aceita um dia só e 42 dias (grade do mês, limite)", () => {
    expect(parseBookingRange({ start: "2026-09-24", end: "2026-09-25" })).not.toBeNull();
    expect(parseBookingRange({ start: "2026-08-30", end: "2026-10-11" })).not.toBeNull();
  });

  it.each([
    ["input nulo", null],
    ["início ausente", { end: "2026-09-27" }],
    ["fim não é string", { start: "2026-09-20", end: 20260927 }],
    ["início com formato errado", { start: "20/09/2026", end: "2026-09-27" }],
    ["fim que não existe", { start: "2026-02-01", end: "2026-02-30" }],
    ["fim igual ao início", { start: "2026-09-20", end: "2026-09-20" }],
    ["fim antes do início", { start: "2026-09-27", end: "2026-09-20" }],
    ["mais de 42 dias", { start: "2026-08-30", end: "2026-10-12" }],
  ])("retorna null quando %s", (_label, input) => {
    expect(parseBookingRange(input)).toBeNull();
  });

  it.each([
    ["texto", "centro"],
    ["id curto", "64b7f0c2a1b2"],
    ["não é string", 42],
    ["objeto de operador", { $ne: null }],
  ])("ignora filtros inválidos (%s)", (_label, value) => {
    expect(parseBookingRange({ start: "2026-09-20", end: "2026-09-27", unit: value, therapist: value })).toEqual(
      expect.objectContaining({ unit: "", therapist: "" }),
    );
  });
});

describe("bookingListPipeline", () => {
  const BASE = { start: "2026-09-20", end: "2026-09-27", unit: "", therapist: "" };

  // Entram os que se sobrepõem ao intervalo: 20/09 00:00 até 27/09 00:00 em Brasília.
  const OVERLAP = {
    startsAt: { $lt: new Date("2026-09-27T03:00:00.000Z") },
    endsAt: { $gt: new Date("2026-09-20T03:00:00.000Z") },
  };
  // Datas saem no horário de Brasília, no formato do formulário e do calendário.
  const PROJECT = {
    $project: {
      _id: 0,
      id: { $toString: "$_id" },
      unitId: { $toString: "$unitId" },
      therapistId: { $toString: "$therapistId" },
      therapistName: 1,
      guest: 1,
      startsAt: { $dateToString: { date: "$startsAt", format: "%Y-%m-%dT%H:%M", timezone: "-03:00" } },
      endsAt: { $dateToString: { date: "$endsAt", format: "%Y-%m-%dT%H:%M", timezone: "-03:00" } },
      durationMinutes: { $dateDiff: { startDate: "$startsAt", endDate: "$endsAt", unit: "minute" } },
      service: { serviceId: { $toString: "$service.serviceId" }, serviceName: "$service.serviceName" },
      treatmentRoom: { roomId: { $toString: "$treatmentRoom.roomId" }, roomName: "$treatmentRoom.roomName" },
      // Produtos escolhidos, para pré-marcar na edição e na conversão em atendimento.
      productIds: { $map: { input: "$products", as: "product", in: { $toString: "$$product.productId" } } },
      // Atendimento criado a partir do agendamento; null (ou ausente nos antigos) se ainda não virou.
      appointmentId: { $ifNull: [{ $toString: "$appointmentId" }, null] },
      // Cor escolhida para o calendário; null usa a cor do profissional.
      color: { $ifNull: ["$color", null] },
    },
  };
  const SORT = { $sort: { startsAt: 1, _id: 1 } };

  it("sem filtros, pega os que se sobrepõem ao intervalo, ordena por início e projeta", () => {
    expect(bookingListPipeline(BASE)).toEqual([{ $match: OVERLAP }, SORT, PROJECT]);
  });

  it("com filtros, restringe por unidade e profissional no mesmo $match", () => {
    expect(bookingListPipeline({ ...BASE, unit: UNIT_ID, therapist: ANA_ID })).toEqual([
      {
        $match: {
          ...OVERLAP,
          unitId: new Types.ObjectId(UNIT_ID),
          therapistId: new Types.ObjectId(ANA_ID),
        },
      },
      SORT,
      PROJECT,
    ]);
  });
});

// Lista com todos os agendamentos: busca, ordenação e filtros vêm da URL.
describe("parseBookingListQuery", () => {
  it("sem parâmetros, não tem busca nem filtros e ordena pelos mais recentes primeiro", () => {
    expect(parseBookingListQuery({})).toEqual({
      q: "",
      sort: "startsAt",
      dir: "desc",
      unit: "",
      therapist: "",
      status: "",
      from: "",
      to: "",
      page: 1,
    });
  });

  it("lê busca, ordenação, direção e filtros válidos", () => {
    expect(
      parseBookingListQuery({
        q: "joão",
        sort: "therapistName",
        dir: "asc",
        unit: UNIT_ID,
        therapist: ANA_ID,
        status: "pending",
        from: "2026-09-01",
        to: "2026-09-30",
        page: "3",
      }),
    ).toEqual({
      q: "joão",
      sort: "therapistName",
      dir: "asc",
      unit: UNIT_ID,
      therapist: ANA_ID,
      status: "pending",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 3,
    });
  });

  it("aceita ordenação por guestName e status done", () => {
    expect(parseBookingListQuery({ sort: "guestName", status: "done" })).toEqual(
      expect.objectContaining({ sort: "guestName", status: "done" }),
    );
  });

  it("ignora a data antiga da URL", () => {
    expect(parseBookingListQuery({ date: "2026-09-20" })).not.toHaveProperty("date");
  });

  it("remove espaços das pontas da busca", () => {
    expect(parseBookingListQuery({ q: "  204  " }).q).toBe("204");
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(
      parseBookingListQuery({
        q: ["a", "b"],
        sort: ["guestName", "startsAt"],
        dir: ["asc", "desc"],
        unit: [UNIT_ID, ANA_ID],
        therapist: [ANA_ID, UNIT_ID],
        status: ["done", "pending"],
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
      status: "done",
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
    expect(parseBookingListQuery({ from: date, to: date })).toEqual(expect.objectContaining({ from: "", to: "" }));
  });

  it.each([
    ["campo fora da lista", "unitId"],
    ["caminho do banco em vez da chave", "guest.name"],
    ["campo com operador", "$where"],
  ])("volta para início quando o sort é %s", (_label, sort) => {
    expect(parseBookingListQuery({ sort }).sort).toBe("startsAt");
  });

  it.each([
    ["zero", "0"],
    ["negativa", "-2"],
    ["texto", "abc"],
    ["fracionária", "1.5"],
    ["com sufixo", "2abc"],
  ])("volta para a página 1 quando ela é %s", (_label, page) => {
    expect(parseBookingListQuery({ page }).page).toBe(1);
  });

  it("volta para decrescente quando a direção é inválida", () => {
    expect(parseBookingListQuery({ dir: "sideways" }).dir).toBe("desc");
  });

  it.each([
    ["texto", "centro"],
    ["id curto", "64b7f0c2a1b2"],
  ])("ignora filtros inválidos (%s)", (_label, value) => {
    expect(parseBookingListQuery({ unit: value, therapist: value, status: value })).toEqual(
      expect.objectContaining({ unit: "", therapist: "", status: "" }),
    );
  });
});

describe("bookingSearchPipeline", () => {
  const BASE = {
    q: "",
    sort: "startsAt",
    dir: "desc",
    unit: "",
    therapist: "",
    status: "",
    from: "",
    to: "",
    page: 1,
  } as const;

  // Mesmo formato de linha do calendário, para reaproveitar o formulário de edição.
  const PROJECT = bookingListPipeline({ start: "2026-09-24", end: "2026-09-25", unit: "", therapist: "" }).at(-1);
  const SORT = { $sort: { startsAt: -1, _id: 1 } };
  // Numa ida só: a página pedida, já projetada, e o total filtrado para a paginação.
  const paged = (skip: number) => [
    { $facet: { rows: [{ $skip: skip }, { $limit: BOOKING_PAGE_SIZE }, PROJECT], total: [{ $count: "n" }] } },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];

  it("mostra 20 agendamentos por página", () => {
    expect(BOOKING_PAGE_SIZE).toBe(20);
  });

  it("sem busca nem filtros, pega todos os agendamentos, ordena (com _id de desempate) e projeta", () => {
    expect(bookingSearchPipeline(BASE)).toEqual([SORT, ...paged(0)]);
  });

  it.each([
    ["startsAt", "asc", { startsAt: 1, _id: 1 }],
    ["guestName", "asc", { "guest.name": 1, _id: 1 }],
    ["guestName", "desc", { "guest.name": -1, _id: 1 }],
    ["therapistName", "asc", { therapistName: 1, _id: 1 }],
  ] as const)("ordena por %s %s usando o campo do banco", (sort, dir, $sort) => {
    expect(bookingSearchPipeline({ ...BASE, sort, dir })).toEqual([{ $sort }, ...paged(0)]);
  });

  it("com filtros, restringe por unidade e profissional num $match", () => {
    expect(bookingSearchPipeline({ ...BASE, unit: UNIT_ID, therapist: ANA_ID })).toEqual([
      { $match: { unitId: new Types.ObjectId(UNIT_ID), therapistId: new Types.ObjectId(ANA_ID) } },
      SORT,
      ...paged(0),
    ]);
  });

  it("status pending pega os que ainda não viraram atendimento (null ou ausente)", () => {
    expect(bookingSearchPipeline({ ...BASE, status: "pending" })).toEqual([
      { $match: { appointmentId: null } },
      SORT,
      ...paged(0),
    ]);
  });

  it("status done pega os que já viraram atendimento", () => {
    expect(bookingSearchPipeline({ ...BASE, status: "done" })).toEqual([
      { $match: { appointmentId: { $ne: null } } },
      SORT,
      ...paged(0),
    ]);
  });

  it("pula as páginas anteriores depois de filtrar e ordenar", () => {
    expect(bookingSearchPipeline({ ...BASE, therapist: ANA_ID, page: 3 })).toEqual([
      { $match: { therapistId: new Types.ObjectId(ANA_ID) } },
      SORT,
      ...paged(40),
    ]);
  });

  // Dias de Brasília, ambos incluídos: 01/09 00:00 até 30/09 23:59 = 03:00 UTC de 01/09 até 03:00 UTC de 01/10.
  it("com período, pega os que começam entre o início do primeiro dia e o fim do último", () => {
    expect(bookingSearchPipeline({ ...BASE, from: "2026-09-01", to: "2026-09-30" })).toEqual([
      {
        $match: {
          startsAt: { $gte: new Date("2026-09-01T03:00:00.000Z"), $lt: new Date("2026-10-01T03:00:00.000Z") },
        },
      },
      SORT,
      ...paged(0),
    ]);
  });

  it("período só com início ou só com fim fica aberto do outro lado", () => {
    expect(bookingSearchPipeline({ ...BASE, from: "2026-09-24" })[0]).toEqual({
      $match: { startsAt: { $gte: new Date("2026-09-24T03:00:00.000Z") } },
    });
    expect(bookingSearchPipeline({ ...BASE, to: "2026-09-24" })[0]).toEqual({
      $match: { startsAt: { $lt: new Date("2026-09-25T03:00:00.000Z") } },
    });
  });

  it("período e filtros entram no mesmo $match", () => {
    expect(
      bookingSearchPipeline({ ...BASE, unit: UNIT_ID, status: "pending", from: "2026-09-24", to: "2026-09-24" })[0],
    ).toEqual({
      $match: {
        startsAt: { $gte: new Date("2026-09-24T03:00:00.000Z"), $lt: new Date("2026-09-25T03:00:00.000Z") },
        unitId: new Types.ObjectId(UNIT_ID),
        appointmentId: null,
      },
    });
  });

  it("com busca, filtra hóspede, quarto, profissional ou serviço sem diferenciar maiúsculas antes de ordenar", () => {
    const regex = { $regex: "joão", $options: "i" };
    expect(bookingSearchPipeline({ ...BASE, q: "joão" })).toEqual([
      {
        $match: {
          $or: [
            { "guest.name": regex },
            { "guest.room": regex },
            { therapistName: regex },
            { "service.serviceName": regex },
          ],
        },
      },
      SORT,
      ...paged(0),
    ]);
  });

  it("escapa caracteres especiais de regex da busca", () => {
    const [match] = bookingSearchPipeline({ ...BASE, q: "a.b*(c)" });
    const regex = { $regex: "a\\.b\\*\\(c\\)", $options: "i" };

    expect(match).toEqual({
      $match: {
        $or: [
          { "guest.name": regex },
          { "guest.room": regex },
          { therapistName: regex },
          { "service.serviceName": regex },
        ],
      },
    });
  });
});
