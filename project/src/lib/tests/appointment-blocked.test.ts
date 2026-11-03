import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";
import {
  createAppointmentBlocked,
  deleteAppointmentBlocked,
  updateAppointmentBlocked,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-blocked";
import { blockedCalendarPipeline } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const BLOCKED_ID = "64b7f0c2a1b2c3d4e5f60790";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const BIA_ID = "64b7f0c2a1b2c3d4e5f60752";

const THERAPIST = actorWith("attends");
const BLOCKER = actorWith("schedule.block_others");
const SCHEDULER = actorWith("bookings.manage");

const VALID = {
  workspaceMemberId: ANA_ID,
  startsAt: "2026-09-24T12:00",
  durationMinutes: "60",
  reason: "  Almoço ",
};

function at(time: string) {
  return new Date(`2026-09-24T${time}:00.000-03:00`);
}

function makeLookups({ members = [ANA_ID, BIA_ID], busy = false } = {}) {
  return {
    findMember: vi.fn(async (id: string) => (members.includes(id) ? { id } : null)),
    hasAppointments: vi.fn(async () => busy),
  };
}

describe("createAppointmentBlocked", () => {
  function makeDeps(options?: Parameters<typeof makeLookups>[0]) {
    return { ...makeLookups(options), insert: vi.fn().mockResolvedValue({ id: BLOCKED_ID }) };
  }
  const ctx = { workspaceId: WORKSPACE_ID, unitId: UNIT_ID, actor: THERAPIST, actorMemberId: ANA_ID };

  it("a profissional bloqueia a própria agenda na unidade, com o motivo sem espaços", async () => {
    const deps = makeDeps();

    const result = await createAppointmentBlocked(VALID, ctx, deps);

    expect(result).toEqual({ ok: true, appointmentBlockedId: BLOCKED_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      unitId: UNIT_ID,
      workspaceMemberId: ANA_ID,
      startsAt: at("12:00"),
      endsAt: at("13:00"),
      durationMinutes: 60,
      reason: "Almoço",
    });
  });

  it("confere a profissional e os agendamentos dela no intervalo, na unidade do bloqueio", async () => {
    const deps = makeDeps();

    await createAppointmentBlocked(VALID, ctx, deps);

    expect(deps.findMember).toHaveBeenCalledWith(ANA_ID);
    expect(deps.hasAppointments).toHaveBeenCalledWith({
      workspaceMemberId: ANA_ID,
      startsAt: at("12:00"),
      endsAt: at("13:00"),
      unitId: UNIT_ID,
    });
  });

  it("sem unidade, bloqueia em todas as unidades", async () => {
    const deps = makeDeps();

    await createAppointmentBlocked(VALID, { ...ctx, unitId: null }, deps);

    expect(deps.hasAppointments).toHaveBeenCalledWith(expect.objectContaining({ unitId: null }));
    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ unitId: null }));
  });

  it.each([undefined, null, "", "   "])("sem motivo (%j) guarda null", async (reason) => {
    const deps = makeDeps();

    await createAppointmentBlocked({ ...VALID, reason }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it.each([
    ["com a permissão de bloquear a agenda de outros", BLOCKER],
    ["administrador", ADMIN],
  ])("%s bloqueia a agenda de outra profissional", async (_label, actor) => {
    const deps = makeDeps();

    const result = await createAppointmentBlocked({ ...VALID, workspaceMemberId: BIA_ID }, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: true, appointmentBlockedId: BLOCKED_ID });
    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ workspaceMemberId: BIA_ID }));
  });

  it("quem só realiza atendimentos não bloqueia a agenda de outra profissional", async () => {
    const deps = makeDeps();

    const result = await createAppointmentBlocked({ ...VALID, workspaceMemberId: BIA_ID }, ctx, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.findMember).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem realizar atendimentos nem bloquear a agenda de outros", STAFF, "forbidden"],
    ["só com a permissão de gerenciar agendamentos", SCHEDULER, "forbidden"],
  ] as const)("%s, não bloqueia", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createAppointmentBlocked(VALID, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["início ausente", { ...VALID, startsAt: undefined }, "invalid_input"],
    ["profissional vazia", { ...VALID, workspaceMemberId: " " }, "invalid_member"],
    ["início inválido", { ...VALID, startsAt: "amanhã" }, "invalid_starts_at"],
    ["duração vazia", { ...VALID, durationMinutes: "" }, "invalid_duration"],
    ["duração abaixo de 5 minutos", { ...VALID, durationMinutes: "4" }, "invalid_duration"],
    ["duração acima de 12 horas", { ...VALID, durationMinutes: "721" }, "invalid_duration"],
    ["motivo acima de 120 caracteres", { ...VALID, reason: "a".repeat(121) }, "reason_too_long"],
  ])("recusa %s sem consultar nem salvar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createAppointmentBlocked(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findMember).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["member_not_found", { members: [] }],
    ["member_busy", { busy: true }],
  ] as const)("retorna %s sem salvar", async (error, options) => {
    const deps = makeDeps(options);

    const result = await createAppointmentBlocked(VALID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateAppointmentBlocked", () => {
  type Found = { workspaceMemberId: string; unitId: string | null };

  function makeDeps({
    found = { workspaceMemberId: ANA_ID, unitId: UNIT_ID } as Found | null,
    updated = true,
    ...options
  }: Parameters<typeof makeLookups>[0] & { found?: Found | null; updated?: boolean } = {}) {
    return {
      ...makeLookups(options),
      findAppointmentBlocked: vi.fn().mockResolvedValue(found),
      update: vi.fn().mockResolvedValue(updated),
    };
  }
  const ctx = { actor: THERAPIST, actorMemberId: ANA_ID };

  it("grava o novo intervalo e motivo, conferindo conflitos na unidade do bloqueio", async () => {
    const deps = makeDeps({ found: { workspaceMemberId: ANA_ID, unitId: null } });

    const result = await updateAppointmentBlocked({ ...VALID, durationMinutes: "90" }, BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findAppointmentBlocked).toHaveBeenCalledWith(BLOCKED_ID);
    expect(deps.hasAppointments).toHaveBeenCalledWith({
      workspaceMemberId: ANA_ID,
      startsAt: at("12:00"),
      endsAt: at("13:30"),
      unitId: null,
    });
    expect(deps.update).toHaveBeenCalledWith(BLOCKED_ID, {
      workspaceMemberId: ANA_ID,
      startsAt: at("12:00"),
      endsAt: at("13:30"),
      durationMinutes: 90,
      reason: "Almoço",
    });
  });

  it("com a permissão de bloquear a agenda de outros, passa o bloqueio para outra profissional", async () => {
    const deps = makeDeps();

    const result = await updateAppointmentBlocked({ ...VALID, workspaceMemberId: BIA_ID }, BLOCKED_ID, { ...ctx, actor: BLOCKER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(BLOCKED_ID, expect.objectContaining({ workspaceMemberId: BIA_ID }));
  });

  it.each([
    ["edita o bloqueio de outra profissional", { found: { workspaceMemberId: BIA_ID, unitId: UNIT_ID } }, VALID],
    ["passa o próprio bloqueio para outra profissional", {}, { ...VALID, workspaceMemberId: BIA_ID }],
  ] as const)("quem só realiza atendimentos não %s", async (_label, options, input) => {
    const deps = makeDeps(options);

    const result = await updateAppointmentBlocked(input, BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", null, {}],
    ["bloqueio que não é do workspace", BLOCKED_ID, { found: null }],
    ["bloqueio que some antes de salvar", BLOCKED_ID, { updated: false }],
  ] as const)("%s devolve não encontrado", async (_label, blockedId, options) => {
    const result = await updateAppointmentBlocked(VALID, blockedId, ctx, makeDeps(options));

    expect(result).toEqual({ ok: false, error: "appointment_blocked_not_found" });
  });

  it.each([
    ["member_not_found", { members: [] }],
    ["member_busy", { busy: true }],
  ] as const)("retorna %s sem salvar", async (error, options) => {
    const deps = makeDeps(options);

    const result = await updateAppointmentBlocked(VALID, BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa duração inválida sem salvar", async () => {
    const deps = makeDeps();

    const result = await updateAppointmentBlocked({ ...VALID, durationMinutes: "721" }, BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_duration" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem realizar atendimentos nem bloquear a agenda de outros", STAFF, "forbidden"],
  ] as const)("%s, não edita", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await updateAppointmentBlocked(VALID, BLOCKED_ID, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findAppointmentBlocked).not.toHaveBeenCalled();
  });
});

describe("deleteAppointmentBlocked", () => {
  function makeDeps({
    found = { workspaceMemberId: ANA_ID, unitId: UNIT_ID } as { workspaceMemberId: string; unitId: string | null } | null,
    removed = true,
  } = {}) {
    return {
      findAppointmentBlocked: vi.fn().mockResolvedValue(found),
      remove: vi.fn().mockResolvedValue(removed),
    };
  }
  const ctx = { actor: THERAPIST, actorMemberId: ANA_ID };

  it("a profissional exclui o próprio bloqueio", async () => {
    const deps = makeDeps();

    const result = await deleteAppointmentBlocked(BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(BLOCKED_ID);
  });

  it("com a permissão de bloquear a agenda de outros, exclui o bloqueio de outra profissional", async () => {
    const deps = makeDeps({ found: { workspaceMemberId: BIA_ID, unitId: UNIT_ID } });

    expect(await deleteAppointmentBlocked(BLOCKED_ID, { ...ctx, actor: BLOCKER }, deps)).toEqual({ ok: true });
  });

  it("quem só realiza atendimentos não exclui o bloqueio de outra profissional", async () => {
    const deps = makeDeps({ found: { workspaceMemberId: BIA_ID, unitId: UNIT_ID } });

    const result = await deleteAppointmentBlocked(BLOCKED_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", null, {}],
    ["bloqueio que não é do workspace", BLOCKED_ID, { found: null }],
    ["bloqueio que some antes de excluir", BLOCKED_ID, { removed: false }],
  ] as const)("%s devolve não encontrado", async (_label, blockedId, options) => {
    const result = await deleteAppointmentBlocked(blockedId, ctx, makeDeps(options));

    expect(result).toEqual({ ok: false, error: "appointment_blocked_not_found" });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem realizar atendimentos nem bloquear a agenda de outros", STAFF, "forbidden"],
  ] as const)("%s, não exclui", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await deleteAppointmentBlocked(BLOCKED_ID, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});

describe("blockedCalendarPipeline", () => {
  const brt = (path: string) => ({ $dateToString: { date: path, format: "%Y-%m-%dT%H:%M", timezone: "-03:00" } });
  const view = [
    {
      $lookup: {
        from: "workspace_members",
        localField: "workspaceMemberId",
        foreignField: "_id",
        as: "member",
        pipeline: [
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $project: { _id: 0, name: { $ifNull: [{ $first: "$user.name" }, { $first: "$user.email" }] } } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        unitId: { $cond: [{ $eq: [{ $ifNull: ["$unitId", null] }, null] }, null, { $toString: "$unitId" }] },
        workspaceMemberId: { $toString: "$workspaceMemberId" },
        memberName: { $ifNull: [{ $first: "$member.name" }, null] },
        reason: { $ifNull: ["$reason", null] },
        startsAt: brt("$startsAt"),
        endsAt: brt("$endsAt"),
        durationMinutes: 1,
      },
    },
  ];

  it("traz os bloqueios que cruzam o intervalo, da unidade filtrada ou de todas, e da profissional filtrada", () => {
    expect(blockedCalendarPipeline({ start: "2026-09-21", end: "2026-09-28", unit: UNIT_ID, member: ANA_ID })).toEqual([
      {
        $match: {
          startsAt: { $lt: new Date("2026-09-28T03:00:00.000Z") },
          endsAt: { $gt: new Date("2026-09-21T03:00:00.000Z") },
          unitId: { $in: [new Types.ObjectId(UNIT_ID), null] },
          workspaceMemberId: new Types.ObjectId(ANA_ID),
        },
      },
      { $sort: { startsAt: 1, _id: 1 } },
      ...view,
    ]);
  });

  it("sem filtros, traz os bloqueios de todas as unidades e profissionais", () => {
    expect(blockedCalendarPipeline({ start: "2026-09-21", end: "2026-09-28", unit: "", member: "" })[0]).toEqual({
      $match: {
        startsAt: { $lt: new Date("2026-09-28T03:00:00.000Z") },
        endsAt: { $gt: new Date("2026-09-21T03:00:00.000Z") },
      },
    });
  });
});
