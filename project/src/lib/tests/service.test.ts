import { describe, it, expect, vi } from "vitest";
import { createService, deleteService, updateService } from "@/service/workspace/[workspaceId]/services/service";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const SERVICE_ID = "64b7f0c2a1b2c3d4e5f60731";

const MANAGER = actorWith("services.manage");
const VALID = { name: "  Massagem Candle  ", duration: " 60 ", price: "180,00" };
const SAVED = { name: "Massagem Candle", durationMinutes: 60, priceCents: 18_000 };

describe("createService", () => {
  function makeDeps() {
    return { insert: vi.fn().mockResolvedValue({ id: SERVICE_ID }) };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: MANAGER };

  it("cadastra o serviço no workspace com a duração em minutos e o preço em centavos", async () => {
    const deps = makeDeps();

    const result = await createService(VALID, ctx, deps);

    expect(result).toEqual({ ok: true, serviceId: SERVICE_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ...SAVED });
  });

  it("aceita duração de 5 minutos a 12 horas e preço zero", async () => {
    const deps = makeDeps();

    expect((await createService({ ...VALID, duration: "5", price: "0" }, ctx, deps)).ok).toBe(true);
    expect((await createService({ ...VALID, duration: "720" }, ctx, deps)).ok).toBe(true);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", { ...VALID, name: undefined }, "invalid_input"],
    ["nome vazio", { ...VALID, name: " " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...VALID, name: "a".repeat(81) }, "name_too_long"],
    ["duração abaixo de 5 minutos", { ...VALID, duration: "4" }, "invalid_duration"],
    ["duração acima de 12 horas", { ...VALID, duration: "721" }, "invalid_duration"],
    ["duração fracionada", { ...VALID, duration: "30.5" }, "invalid_duration"],
    ["preço inválido", { ...VALID, price: "abc" }, "invalid_price"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createService(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar serviços", STAFF, "forbidden"],
  ] as const)("%s, não cadastra", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createService(VALID, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateService", () => {
  function makeDeps(found = true) {
    return { update: vi.fn().mockResolvedValue(found) };
  }

  it("grava os dados normalizados", async () => {
    const deps = makeDeps();

    const result = await updateService(VALID, SERVICE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(SERVICE_ID, SAVED);
  });

  it.each([
    ["sem id", null, makeDeps()],
    ["serviço que não é do workspace", SERVICE_ID, makeDeps(false)],
  ])("%s devolve não encontrado", async (_label, serviceId, deps) => {
    const result = await updateService(VALID, serviceId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "service_not_found" });
  });

  it("sem a permissão de gerenciar serviços, não edita", async () => {
    const deps = makeDeps();

    const result = await updateService(VALID, SERVICE_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteService", () => {
  function makeDeps({ hasScheduled = false, found = true } = {}) {
    return {
      hasScheduled: vi.fn().mockResolvedValue(hasScheduled),
      remove: vi.fn().mockResolvedValue(found),
    };
  }

  it("exclui o serviço sem agendamentos por fazer", async () => {
    const deps = makeDeps();

    const result = await deleteService(SERVICE_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(SERVICE_ID);
  });

  it("não exclui o serviço que ainda tem agendamentos por fazer", async () => {
    const deps = makeDeps({ hasScheduled: true });

    const result = await deleteService(SERVICE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "service_in_use" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["serviço que não é do workspace", SERVICE_ID, makeDeps({ found: false })],
  ])("%s devolve não encontrado", async (_label, serviceId, deps) => {
    const result = await deleteService(serviceId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "service_not_found" });
  });

  it("sem a permissão de gerenciar serviços, não exclui", async () => {
    const deps = makeDeps();

    const result = await deleteService(SERVICE_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
