import { describe, it, expect, vi } from "vitest";
import {
  createAppointment,
  deleteAppointment,
  parsePerformedAt,
  rescheduleAppointment,
  setAppointmentStatus,
  updateAppointment,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const APPOINTMENT_ID = "64b7f0c2a1b2c3d4e5f60740";
const SERVICE_ID = "64b7f0c2a1b2c3d4e5f60731";
const CUSTOMER_ID = "64b7f0c2a1b2c3d4e5f60741";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const STATION_ID = "64b7f0c2a1b2c3d4e5f60781";

const SCHEDULER = actorWith("bookings.manage");
const ATTENDANT = actorWith("appointments.manage");

const SERVICE = { id: SERVICE_ID, name: "Massagem Candle", durationMinutes: 60, priceCents: 18_000 };
const CUSTOMER = { id: CUSTOMER_ID, name: "João Silva" };
const ANA = { id: ANA_ID, name: "Ana" };
const STATION = { id: STATION_ID, name: "Sala 1", active: true };

const VALID = {
  serviceId: SERVICE_ID,
  customerId: CUSTOMER_ID,
  workspaceMemberId: ANA_ID,
  stationId: STATION_ID,
  startsAt: "2026-09-24T14:30",
  durationMinutes: "",
  color: "",
};

function at(time: string) {
  return new Date(`2026-09-24T${time}:00.000-03:00`);
}

function makeLookups({
  service = SERVICE as typeof SERVICE | null,
  customer = CUSTOMER as typeof CUSTOMER | null,
  member = ANA as typeof ANA | null,
  station = STATION as typeof STATION | null,
  busy = false,
  stationAppointments = [] as readonly { startsAt: Date; endsAt: Date }[],
} = {}) {
  return {
    findService: vi.fn(async (id: string) => (service?.id === id ? service : null)),
    findCustomer: vi.fn(async (id: string) => (customer?.id === id ? customer : null)),
    findMember: vi.fn(async (id: string) => (member?.id === id ? member : null)),
    findStation: vi.fn(async (id: string) => (station?.id === id ? station : null)),
    hasConflict: vi.fn(async () => busy),
    findStationAppointments: vi.fn(async () => stationAppointments),
  };
}

describe("parsePerformedAt", () => {
  it("lê o horário de Brasília e devolve em UTC", () => {
    expect(parsePerformedAt("2026-09-24T14:30")).toEqual(new Date("2026-09-24T17:30:00.000Z"));
  });

  it.each(["2026-02-30T10:00", "2026-09-24T24:00", "24/09/2026 14:30", ""])("recusa %j", (value) => {
    expect(parsePerformedAt(value)).toBeNull();
  });
});

describe("createAppointment", () => {
  function makeDeps(options?: Parameters<typeof makeLookups>[0]) {
    return { ...makeLookups(options), insert: vi.fn().mockResolvedValue({ id: APPOINTMENT_ID }) };
  }
  const ctx = { workspaceId: WORKSPACE_ID, unitId: UNIT_ID, actor: SCHEDULER };

  it("agenda com o nome e a duração do serviço, terminando no fim da duração", async () => {
    const deps = makeDeps();

    const result = await createAppointment(VALID, ctx, deps);

    expect(result).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      unitId: UNIT_ID,
      serviceId: SERVICE_ID,
      customerId: CUSTOMER_ID,
      workspaceMemberId: ANA_ID,
      stationId: STATION_ID,
      name: "Massagem Candle",
      durationMinutes: 60,
      startsAt: at("14:30"),
      endsAt: at("15:30"),
      status: "scheduled",
      color: null,
    });
  });

  it("usa a duração informada no lugar da do serviço, e a cor escolhida", async () => {
    const deps = makeDeps();

    await createAppointment({ ...VALID, durationMinutes: "45", color: "#7c3aed" }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 45, endsAt: at("15:15"), color: "#7c3aed" }),
    );
  });

  it("confere conflito da profissional e a estação no intervalo do agendamento", async () => {
    const deps = makeDeps();

    await createAppointment(VALID, ctx, deps);

    const interval = { workspaceMemberId: ANA_ID, startsAt: at("14:30"), endsAt: at("15:30") };
    expect(deps.hasConflict).toHaveBeenCalledWith(interval);
    expect(deps.findStationAppointments).toHaveBeenCalledWith({ stationId: STATION_ID, startsAt: at("14:30"), endsAt: at("15:30") });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["serviço ausente", { ...VALID, serviceId: undefined }, "invalid_input"],
    ["serviço vazio", { ...VALID, serviceId: " " }, "invalid_service"],
    ["cliente vazio", { ...VALID, customerId: "" }, "invalid_customer"],
    ["profissional vazia", { ...VALID, workspaceMemberId: "" }, "invalid_member"],
    ["estação vazia", { ...VALID, stationId: "" }, "invalid_station"],
    ["início inválido", { ...VALID, startsAt: "amanhã" }, "invalid_starts_at"],
    ["duração abaixo de 5 minutos", { ...VALID, durationMinutes: "4" }, "invalid_duration"],
    ["duração acima de 12 horas", { ...VALID, durationMinutes: "721" }, "invalid_duration"],
    ["cor fora da paleta", { ...VALID, color: "#123456" }, "invalid_color"],
  ])("recusa %s sem consultar nem salvar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createAppointment(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findService).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["service_not_found", { service: null }],
    ["customer_not_found", { customer: null }],
    ["member_not_found", { member: null }],
    ["station_not_found", { station: null }],
    ["station_inactive", { station: { ...STATION, active: false } }],
    ["member_busy", { busy: true }],
    ["station_busy", { stationAppointments: [{ startsAt: at("15:00"), endsAt: at("16:00") }] }],
  ] as const)("retorna %s sem salvar", async (error, options) => {
    const deps = makeDeps(options);

    const result = await createAppointment(VALID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("agendamentos colados antes e depois não ocupam a estação", async () => {
    const deps = makeDeps({
      stationAppointments: [
        { startsAt: at("13:30"), endsAt: at("14:30") },
        { startsAt: at("15:30"), endsAt: at("16:30") },
      ],
    });

    expect(await createAppointment(VALID, ctx, deps)).toEqual({ ok: true, appointmentId: APPOINTMENT_ID });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar agendamentos", STAFF, "forbidden"],
  ] as const)("%s, não agenda", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createAppointment(VALID, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateAppointment", () => {
  function makeDeps({ status = "scheduled" as string | null, updated = true, ...options }: Parameters<typeof makeLookups>[0] & { status?: string | null; updated?: boolean } = {}) {
    return {
      ...makeLookups(options),
      findAppointment: vi.fn().mockResolvedValue(status ? { status } : null),
      update: vi.fn().mockResolvedValue(updated),
    };
  }
  const ctx = { actor: ADMIN };

  it("grava os dados, ignorando o próprio agendamento nos conflitos", async () => {
    const deps = makeDeps();

    const result = await updateAppointment(VALID, APPOINTMENT_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.hasConflict).toHaveBeenCalledWith({
      workspaceMemberId: ANA_ID,
      startsAt: at("14:30"),
      endsAt: at("15:30"),
      excludeId: APPOINTMENT_ID,
    });
    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, {
      serviceId: SERVICE_ID,
      customerId: CUSTOMER_ID,
      workspaceMemberId: ANA_ID,
      stationId: STATION_ID,
      name: "Massagem Candle",
      durationMinutes: 60,
      startsAt: at("14:30"),
      endsAt: at("15:30"),
      color: null,
    });
  });

  it.each(["done", "cancelled"])("não edita o agendamento %s", async (status) => {
    const deps = makeDeps({ status });

    const result = await updateAppointment(VALID, APPOINTMENT_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "appointment_not_scheduled" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", null, {}],
    ["agendamento que não é do workspace", APPOINTMENT_ID, { status: null }],
    ["agendamento que some antes de salvar", APPOINTMENT_ID, { updated: false }],
  ] as const)("%s devolve não encontrado", async (_label, appointmentId, options) => {
    const result = await updateAppointment(VALID, appointmentId, ctx, makeDeps(options));

    expect(result).toEqual({ ok: false, error: "appointment_not_found" });
  });

  it("sem a permissão de gerenciar agendamentos, não edita", async () => {
    const deps = makeDeps();

    const result = await updateAppointment(VALID, APPOINTMENT_ID, { actor: ATTENDANT }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("rescheduleAppointment", () => {
  const times = { startsAt: "2026-09-24T15:00", endsAt: "2026-09-24T16:30" };
  type Found = { status: string; workspaceMemberId: string; station: { id: string; active: boolean } | null };

  function makeDeps({
    found = { status: "scheduled", workspaceMemberId: ANA_ID, station: { id: STATION_ID, active: true } } as Found | null,
    busy = false,
    stationAppointments = [] as readonly { startsAt: Date; endsAt: Date }[],
    updated = true,
  } = {}) {
    return {
      findAppointment: vi.fn().mockResolvedValue(found),
      hasConflict: vi.fn().mockResolvedValue(busy),
      findStationAppointments: vi.fn().mockResolvedValue(stationAppointments),
      update: vi.fn().mockResolvedValue(updated),
    };
  }

  it("move e redimensiona, com a duração nova", async () => {
    const deps = makeDeps();

    const result = await rescheduleAppointment(times, APPOINTMENT_ID, { actor: SCHEDULER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findStationAppointments).toHaveBeenCalledWith({
      stationId: STATION_ID,
      startsAt: at("15:00"),
      endsAt: at("16:30"),
      excludeId: APPOINTMENT_ID,
    });
    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, { startsAt: at("15:00"), endsAt: at("16:30"), durationMinutes: 90 });
  });

  it.each([
    ["fim antes do início", { ...times, endsAt: "2026-09-24T14:00" }, "invalid_duration"],
    ["início inválido", { ...times, startsAt: "x" }, "invalid_starts_at"],
    ["input nulo", null, "invalid_input"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    expect(await rescheduleAppointment(input, APPOINTMENT_ID, { actor: SCHEDULER }, deps)).toEqual({ ok: false, error });
    expect(deps.findAppointment).not.toHaveBeenCalled();
  });

  it.each([
    ["appointment_not_scheduled", { found: { status: "done", workspaceMemberId: ANA_ID, station: { id: STATION_ID, active: true } } }],
    ["station_not_found", { found: { status: "scheduled", workspaceMemberId: ANA_ID, station: null } }],
    ["station_inactive", { found: { status: "scheduled", workspaceMemberId: ANA_ID, station: { id: STATION_ID, active: false } } }],
    ["member_busy", { busy: true }],
    ["station_busy", { stationAppointments: [{ startsAt: at("16:00"), endsAt: at("17:00") }] }],
    ["appointment_not_found", { found: null }],
  ] as const)("retorna %s sem salvar", async (error, options) => {
    const deps = makeDeps(options);

    const result = await rescheduleAppointment(times, APPOINTMENT_ID, { actor: SCHEDULER }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("setAppointmentStatus", () => {
  function makeDeps({ status = "scheduled" as string | null, price = 18_000 as number | null, updated = true } = {}) {
    return {
      findAppointment: vi.fn().mockResolvedValue(status ? { status, serviceId: SERVICE_ID } : null),
      findServicePrice: vi.fn().mockResolvedValue(price),
      update: vi.fn().mockResolvedValue(updated),
      recordIncome: vi.fn().mockResolvedValue(undefined),
      removeIncome: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("concluir gera a entrada com o preço atual do serviço", async () => {
    const deps = makeDeps();

    const result = await setAppointmentStatus({ status: "done" }, APPOINTMENT_ID, { actor: ATTENDANT }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, "done");
    expect(deps.findServicePrice).toHaveBeenCalledWith(SERVICE_ID);
    expect(deps.recordIncome).toHaveBeenCalledWith(APPOINTMENT_ID, 18_000);
  });

  it.each([
    ["serviço excluído", null],
    ["serviço de graça", 0],
  ])("concluir com %s não gera entrada", async (_label, price) => {
    const deps = makeDeps({ price });

    expect(await setAppointmentStatus({ status: "done" }, APPOINTMENT_ID, { actor: ADMIN }, deps)).toEqual({ ok: true });
    expect(deps.recordIncome).not.toHaveBeenCalled();
  });

  it.each(["scheduled", "cancelled"])("sair de concluído para %s apaga a entrada", async (status) => {
    const deps = makeDeps({ status: "done" });

    await setAppointmentStatus({ status }, APPOINTMENT_ID, { actor: ADMIN }, deps);

    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, status);
    expect(deps.removeIncome).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(deps.recordIncome).not.toHaveBeenCalled();
  });

  it("cancelar um agendado não mexe no caixa", async () => {
    const deps = makeDeps();

    await setAppointmentStatus({ status: "cancelled" }, APPOINTMENT_ID, { actor: SCHEDULER }, deps);

    expect(deps.update).toHaveBeenCalledWith(APPOINTMENT_ID, "cancelled");
    expect(deps.recordIncome).not.toHaveBeenCalled();
    expect(deps.removeIncome).not.toHaveBeenCalled();
  });

  it("o mesmo status não grava nada", async () => {
    const deps = makeDeps({ status: "done" });

    expect(await setAppointmentStatus({ status: "done" }, APPOINTMENT_ID, { actor: ADMIN }, deps)).toEqual({ ok: true });
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.recordIncome).not.toHaveBeenCalled();
  });

  it.each([
    ["concluir sem a permissão de atendimentos", { status: "done" }, "scheduled", SCHEDULER],
    ["desfazer o concluído sem a permissão de atendimentos", { status: "scheduled" }, "done", SCHEDULER],
    ["cancelar sem a permissão de agendamentos", { status: "cancelled" }, "scheduled", ATTENDANT],
  ] as const)("recusa %s", async (_label, input, status, actor) => {
    const deps = makeDeps({ status });

    expect(await setAppointmentStatus(input, APPOINTMENT_ID, { actor }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["status desconhecido", { status: "no_show" }, makeDeps(), "invalid_status"],
    ["sem id", { status: "done" }, makeDeps(), "appointment_not_found"],
    ["agendamento que não é do workspace", { status: "done" }, makeDeps({ status: null }), "appointment_not_found"],
    ["agendamento que some antes de salvar", { status: "done" }, makeDeps({ updated: false }), "appointment_not_found"],
  ] as const)("%s", async (label, input, deps, error) => {
    const result = await setAppointmentStatus(input, label === "sem id" ? "" : APPOINTMENT_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.recordIncome).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não muda", async () => {
    const deps = makeDeps();

    expect(await setAppointmentStatus({ status: "done" }, APPOINTMENT_ID, { actor: null }, deps)).toEqual({
      ok: false,
      error: "workspace_not_found",
    });
  });
});

describe("deleteAppointment", () => {
  function makeDeps(found = true) {
    return { remove: vi.fn().mockResolvedValue(found), removeIncome: vi.fn().mockResolvedValue(undefined) };
  }

  it("exclui o agendamento e a entrada dele no caixa, se houver", async () => {
    const deps = makeDeps();

    const result = await deleteAppointment(APPOINTMENT_ID, { actor: SCHEDULER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(deps.removeIncome).toHaveBeenCalledWith(APPOINTMENT_ID);
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["agendamento que não é do workspace", APPOINTMENT_ID, makeDeps(false)],
  ])("%s devolve não encontrado sem mexer no caixa", async (_label, appointmentId, deps) => {
    expect(await deleteAppointment(appointmentId, { actor: ADMIN }, deps)).toEqual({ ok: false, error: "appointment_not_found" });
    expect(deps.removeIncome).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar agendamentos, não exclui", async () => {
    const deps = makeDeps();

    expect(await deleteAppointment(APPOINTMENT_ID, { actor: STAFF }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
