import { describe, it, expect, vi } from "vitest";
import { removeMember, updateMember } from "@/service/workspace/[workspaceId]/users/member";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";
const ADMIN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60730";
const ROLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const UNKNOWN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60739";

const ADMIN: Actor = { admin: true };
const MANAGER: Actor = { admin: false, permissions: ["users.manage"], pages: { workspace: ["users"], unit: [] } };
const STAFF: Actor = { admin: false, permissions: ["bookings.manage", "attends"], pages: { workspace: ["home"], unit: [] } };

const ROLES: Record<string, { id: string; admin: boolean }> = {
  [ADMIN_ROLE_ID]: { id: ADMIN_ROLE_ID, admin: true },
  [ROLE_ID]: { id: ROLE_ID, admin: false },
};

type FoundMember = { id: string; admin: boolean } | null;
const MEMBER: FoundMember = { id: MEMBER_ID, admin: false };
const ADMIN_MEMBER: FoundMember = { id: MEMBER_ID, admin: true };

describe("updateMember", () => {
  function makeDeps(member: FoundMember = MEMBER, overrides: Partial<Parameters<typeof updateMember>[3]> = {}) {
    const deps = {
      findMember: vi.fn().mockResolvedValue(member),
      findRole: vi.fn(async (roleId: string) => ROLES[roleId] ?? null),
      countAdmins: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockResolvedValue(undefined),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("troca a role do membro", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.findRole).toHaveBeenCalledWith(ROLE_ID);
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("não altera o nome: o nome é da conta e só o próprio usuário edita", async () => {
    const deps = makeDeps();

    const result = await updateMember({ name: "Outro Nome", roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("administrador promove um membro à role de administrador", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ADMIN_ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ADMIN_ROLE_ID });
  });

  it("administrador tira outro administrador do cargo quando resta mais um", async () => {
    const deps = makeDeps(ADMIN_MEMBER);

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("retorna last_admin sem salvar ao tirar o cargo do único administrador", async () => {
    const deps = makeDeps(ADMIN_MEMBER, { countAdmins: vi.fn().mockResolvedValue(1) });

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "last_admin" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("mantém o único administrador na role de administrador", async () => {
    const deps = makeDeps(ADMIN_MEMBER, { countAdmins: vi.fn().mockResolvedValue(1) });

    const result = await updateMember({ roleId: ADMIN_ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
  });

  it("retorna workspace_not_found sem buscar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, MEMBER, ROLE_ID],
    ["gerencia usuários, mas promove a administrador", MANAGER, MEMBER, ADMIN_ROLE_ID],
    ["gerencia usuários, mas edita um administrador", MANAGER, ADMIN_MEMBER, ROLE_ID],
  ] as const)("retorna forbidden sem salvar quando quem edita %s", async (_label, actor, member, roleId) => {
    const deps = makeDeps(member);

    const result = await updateMember({ roleId }, MEMBER_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna member_not_found sem buscar quando não há memberId (%j)", async (memberId) => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ROLE_ID }, memberId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("retorna member_not_found quando o membro não existe (ou não é do workspace)", async () => {
    const deps = makeDeps(null);

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna invalid_role sem salvar quando a role não existe no workspace", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: UNKNOWN_ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_role" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["role ausente", {}, "invalid_role"],
    ["role vazia", { roleId: "" }, "invalid_role"],
    ["role não é string", { roleId: 1 }, "invalid_role"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateMember(input, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("removeMember", () => {
  function makeDeps(member: FoundMember = MEMBER, overrides: Partial<Parameters<typeof removeMember>[2]> = {}) {
    const deps = {
      findMember: vi.fn().mockResolvedValue(member),
      countAdmins: vi.fn().mockResolvedValue(2),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("remove o membro do workspace", async () => {
    const deps = makeDeps();

    const result = await removeMember(MEMBER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("administrador remove outro administrador quando resta mais um", async () => {
    const deps = makeDeps(ADMIN_MEMBER);

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("retorna last_admin sem remover o único administrador", async () => {
    const deps = makeDeps(ADMIN_MEMBER, { countAdmins: vi.fn().mockResolvedValue(1) });

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "last_admin" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("retorna workspace_not_found sem remover quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await removeMember(MEMBER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, MEMBER],
    ["gerencia usuários, mas remove um administrador", MANAGER, ADMIN_MEMBER],
  ] as const)("retorna forbidden sem remover quando quem remove %s", async (_label, actor, member) => {
    const deps = makeDeps(member);

    const result = await removeMember(MEMBER_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna member_not_found sem buscar quando não há memberId (%j)", async (memberId) => {
    const deps = makeDeps();

    const result = await removeMember(memberId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
  });

  it("retorna member_not_found quando o membro não existe (ou não é do workspace)", async () => {
    const deps = makeDeps(null);

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
