import { describe, it, expect, vi } from "vitest";
import { checkAccess, checkUnitAccess } from "@/lib/access-check";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60741";

describe("checkAccess", () => {
  it("sem acesso ao workspace, retorna workspace_not_found", () => {
    expect(checkAccess(null, "appointments.manage")).toBe("workspace_not_found");
  });

  it("com acesso mas sem a permissão, retorna forbidden", () => {
    expect(checkAccess(STAFF, "appointments.manage")).toBe("forbidden");
    expect(checkAccess(actorWith("bookings.manage"), "appointments.manage")).toBe("forbidden");
  });

  it("com a permissão (ou administrador), retorna null", () => {
    expect(checkAccess(actorWith("appointments.manage"), "appointments.manage")).toBeNull();
    expect(checkAccess(ADMIN, "appointments.manage")).toBeNull();
  });
});

describe("checkUnitAccess", () => {
  const access = (actor = actorWith("appointments.manage")) => ({ id: WORKSPACE_ID, actor });

  it("unidade do workspace e com a permissão: retorna os ids", async () => {
    const unitExists = vi.fn().mockResolvedValue(true);

    const result = await checkUnitAccess(access(), UNIT_ID, "appointments.manage", unitExists);

    expect(result).toEqual({ ok: true, unit: { workspaceId: WORKSPACE_ID, unitId: UNIT_ID } });
    expect(unitExists).toHaveBeenCalledWith(WORKSPACE_ID, UNIT_ID);
  });

  it("sem acesso ao workspace: workspace_not_found, sem consultar a unidade", async () => {
    const unitExists = vi.fn().mockResolvedValue(true);

    const result = await checkUnitAccess(null, UNIT_ID, "appointments.manage", unitExists);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(unitExists).not.toHaveBeenCalled();
  });

  it("sem a permissão: forbidden, mesmo com unidade válida, sem consultar a unidade", async () => {
    const unitExists = vi.fn().mockResolvedValue(true);

    const result = await checkUnitAccess(access(STAFF), UNIT_ID, "appointments.manage", unitExists);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(unitExists).not.toHaveBeenCalled();
  });

  it("sem a permissão e com unidade inválida: forbidden tem prioridade", async () => {
    const result = await checkUnitAccess(access(STAFF), "", "appointments.manage", vi.fn());

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("id de unidade inválido: unit_not_found, sem consultar a unidade", async () => {
    const unitExists = vi.fn().mockResolvedValue(true);

    for (const unitId of ["", "abc", `${UNIT_ID}0`]) {
      const result = await checkUnitAccess(access(), unitId, "appointments.manage", unitExists);
      expect(result).toEqual({ ok: false, error: "unit_not_found" });
    }
    expect(unitExists).not.toHaveBeenCalled();
  });

  it("unidade que não é do workspace: unit_not_found", async () => {
    const result = await checkUnitAccess(access(), UNIT_ID, "appointments.manage", vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
  });

  it("administrador passa sem precisar da permissão na role", async () => {
    const result = await checkUnitAccess(access(ADMIN), UNIT_ID, "cash_flow.manage", vi.fn().mockResolvedValue(true));

    expect(result).toEqual({ ok: true, unit: { workspaceId: WORKSPACE_ID, unitId: UNIT_ID } });
  });
});
