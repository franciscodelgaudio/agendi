import { describe, it, expect, vi } from "vitest";
import { createTherapistBlock, deleteTherapistBlock } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/therapist-block";

const BLOCK_ID = "64b7f0c2a1b2c3d4e5f60790";
const ANA_ID = "64b7f0c2a1b2c3d4e5f60751";
const ANA = { id: ANA_ID, name: "Ana" };

// Como chega do FormData: dias e horas no horário de Brasília; allDay "on" quando marcado.
const wholeDay = { therapistId: ANA_ID, startDay: "2026-09-24", endDay: "2026-09-24", allDay: "on", reason: "Folga" };
const partialDay = {
  therapistId: ANA_ID,
  startDay: "2026-09-24",
  endDay: "2026-09-24",
  allDay: null,
  startTime: "14:00",
  endTime: "16:30",
  reason: "",
};

function makeDeps({ therapist = ANA as typeof ANA | null, booked = false } = {}) {
  return {
    // Quem pode atender no workspace; null quando não pode.
    findTherapist: vi.fn(async (id: string) => (therapist?.id === id ? therapist : null)),
    // true quando o profissional tem algum agendamento que se sobrepõe ao intervalo.
    hasBookings: vi.fn(async () => booked),
    insert: vi.fn().mockResolvedValue({ id: BLOCK_ID }),
  };
}

describe("createTherapistBlock", () => {
  it("trava o dia inteiro, da meia-noite à meia-noite seguinte em Brasília", async () => {
    const deps = makeDeps();

    const result = await createTherapistBlock(wholeDay, deps);

    expect(result).toEqual({ ok: true, blockId: BLOCK_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      therapistName: "Ana",
      startsAt: new Date("2026-09-24T03:00:00.000Z"),
      endsAt: new Date("2026-09-25T03:00:00.000Z"),
      reason: "Folga",
    });
  });

  it("trava vários dias inteiros, com o último dia incluído (horários ignorados)", async () => {
    const deps = makeDeps();

    await createTherapistBlock({ ...wholeDay, endDay: "2026-09-26", startTime: "14:00", endTime: "15:00" }, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date("2026-09-24T03:00:00.000Z"),
        endsAt: new Date("2026-09-27T03:00:00.000Z"),
      }),
    );
  });

  it("trava só um período do dia, sem motivo (vazio vira null)", async () => {
    const deps = makeDeps();

    const result = await createTherapistBlock(partialDay, deps);

    expect(result).toEqual({ ok: true, blockId: BLOCK_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      therapistName: "Ana",
      startsAt: new Date("2026-09-24T17:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:30:00.000Z"),
      reason: null,
    });
  });

  it("trava um período que atravessa dias, do início no primeiro dia ao fim no último", async () => {
    const deps = makeDeps();

    await createTherapistBlock({ ...partialDay, endDay: "2026-09-25", startTime: "18:00", endTime: "10:00" }, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date("2026-09-24T21:00:00.000Z"),
        endsAt: new Date("2026-09-25T13:00:00.000Z"),
      }),
    );
  });

  it("aceita motivo ausente e remove espaços das pontas de ids, dias, horas e motivo", async () => {
    const deps = makeDeps();

    await createTherapistBlock(
      { therapistId: ` ${ANA_ID} `, startDay: " 2026-09-24 ", endDay: " 2026-09-24 ", startTime: " 14:00 ", endTime: " 16:30 " },
      deps,
    );
    await createTherapistBlock({ ...wholeDay, reason: "  Consulta médica  " }, deps);

    expect(deps.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ therapistId: ANA_ID, reason: null }));
    expect(deps.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ reason: "Consulta médica" }));
  });

  it("confere agendamentos do profissional no intervalo travado", async () => {
    const deps = makeDeps();

    await createTherapistBlock(partialDay, deps);

    expect(deps.hasBookings).toHaveBeenCalledWith({
      therapistId: ANA_ID,
      startsAt: new Date("2026-09-24T17:00:00.000Z"),
      endsAt: new Date("2026-09-24T19:30:00.000Z"),
    });
  });

  it("retorna therapist_has_bookings sem salvar quando já há agendamento no intervalo", async () => {
    const deps = makeDeps({ booked: true });

    const result = await createTherapistBlock(wholeDay, deps);

    expect(result).toEqual({ ok: false, error: "therapist_has_bookings" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna therapist_not_found sem checar agendamentos nem salvar quando o profissional não pode atender", async () => {
    const deps = makeDeps({ therapist: null });

    const result = await createTherapistBlock(wholeDay, deps);

    expect(result).toEqual({ ok: false, error: "therapist_not_found" });
    expect(deps.hasBookings).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("aceita 31 dias inteiros (limite)", async () => {
    const result = await createTherapistBlock({ ...wholeDay, startDay: "2026-10-01", endDay: "2026-10-31" }, makeDeps());

    expect(result).toEqual({ ok: true, blockId: BLOCK_ID });
  });

  it("aceita motivo com 120 caracteres (limite)", async () => {
    const result = await createTherapistBlock({ ...wholeDay, reason: "a".repeat(120) }, makeDeps());

    expect(result).toEqual({ ok: true, blockId: BLOCK_ID });
  });

  it.each([
    ["sem profissional", { ...wholeDay, therapistId: undefined }, "invalid_input"],
    ["dia que não é texto", { ...wholeDay, startDay: 20260924 }, "invalid_input"],
    ["motivo que não é texto", { ...wholeDay, reason: 1 }, "invalid_input"],
    ["profissional vazio", { ...wholeDay, therapistId: "  " }, "invalid_therapist"],
    ["dia inicial inválido", { ...wholeDay, startDay: "2026-02-30" }, "invalid_start"],
    ["hora inicial inválida", { ...partialDay, startTime: "25:00" }, "invalid_start"],
    ["hora inicial ausente fora do dia inteiro", { ...partialDay, startTime: undefined }, "invalid_start"],
    ["dia final inválido", { ...wholeDay, endDay: "24/09/2026" }, "invalid_end"],
    ["hora final inválida", { ...partialDay, endTime: "16h" }, "invalid_end"],
    ["dia final antes do inicial", { ...wholeDay, endDay: "2026-09-23" }, "invalid_block_period"],
    ["fim igual ao início", { ...partialDay, endTime: "14:00" }, "invalid_block_period"],
    ["fim antes do início no mesmo dia", { ...partialDay, endTime: "13:30" }, "invalid_block_period"],
    ["mais de 31 dias", { ...wholeDay, startDay: "2026-10-01", endDay: "2026-11-01" }, "block_too_long"],
    ["motivo com mais de 120 caracteres", { ...wholeDay, reason: "a".repeat(121) }, "reason_too_long"],
  ])("retorna erro sem buscar nem salvar: %s", async (_, input, error) => {
    const deps = makeDeps();

    const result = await createTherapistBlock(input, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findTherapist).not.toHaveBeenCalled();
    expect(deps.hasBookings).not.toHaveBeenCalled();
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("retorna invalid_input sem input", async () => {
    expect(await createTherapistBlock(null, makeDeps())).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("deleteTherapistBlock", () => {
  it("destrava a agenda pelo id do bloqueio", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteTherapistBlock(BLOCK_ID, remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(BLOCK_ID);
  });

  it("retorna block_not_found sem remover quando não há id", async () => {
    const remove = vi.fn();

    expect(await deleteTherapistBlock(null, remove)).toEqual({ ok: false, error: "block_not_found" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("retorna block_not_found quando o bloqueio não existe (ou não é do workspace)", async () => {
    const result = await deleteTherapistBlock(BLOCK_ID, vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "block_not_found" });
  });
});
