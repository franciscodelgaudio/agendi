import { describe, it, expect } from "vitest";
import { can, PERMISSIONS, type Actor, type Permission } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const ADMIN: Actor = { admin: true };
const member = (permissions: Permission[]): Actor => ({
  admin: false,
  permissions,
  pages: { workspace: ["home"], unit: [] },
});

describe("can", () => {
  it.each(PERMISSIONS)("administrador tem %s", (permission) => {
    expect(can(ADMIN, permission)).toBe(true);
  });

  it("membro tem só as permissões da própria role", () => {
    const actor = member(["bookings.manage", "attends"]);

    expect(can(actor, "bookings.manage")).toBe(true);
    expect(can(actor, "attends")).toBe(true);
    expect(can(actor, "users.manage")).toBe(false);
    expect(can(actor, "inbox.use")).toBe(false);
  });

  it("membro sem permissões não pode nada", () => {
    const actor = member([]);

    for (const permission of PERMISSIONS) expect(can(actor, permission)).toBe(false);
  });

  it("sem acesso ao workspace não pode nada", () => {
    for (const permission of PERMISSIONS) expect(can(null, permission)).toBe(false);
  });
});

describe("PERMISSIONS", () => {
  it("cobre as áreas de gestão, as Conversas e quem realiza atendimentos", () => {
    expect(PERMISSIONS).toEqual([
      "units.manage",
      "services.manage",
      "bookings.manage",
      "appointments.manage",
      "stock.manage",
      "stock.transfer",
      "cash_flow.manage",
      "team.manage",
      "users.manage",
      "inbox.use",
      "channels.manage",
      "uras.manage",
      "agenia.use",
      "workspace.manage",
      "attends",
    ]);
  });
});
