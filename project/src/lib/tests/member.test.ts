import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { acceptInvite, inviteMember, removeMember, updateMember } from "@/service/workspace/[workspaceId]/users/member";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";
const MEMBER_ID = "64b7f0c2a1b2c3d4e5f60721";
// Roles do workspace: o administrador é uma role fixa, criada com o workspace.
const ADMIN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60730";
const ROLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const UNKNOWN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60739";
const NOW = new Date("2026-09-24T12:00:00.000Z");
const IN_7_DAYS = new Date("2026-10-01T12:00:00.000Z");

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const ADMIN: Actor = { admin: true };
// Gerencia usuários, mas não é administrador: não mexe em administradores.
const MANAGER: Actor = { admin: false, permissions: ["users.manage"], pages: { workspace: ["users"], unit: [] } };
const STAFF: Actor = { admin: false, permissions: ["bookings.manage", "attends"], pages: { workspace: ["home"], unit: [] } };

// Roles que existem no workspace; qualquer outro id não é encontrado.
const ROLES: Record<string, { id: string; admin: boolean }> = {
  [ADMIN_ROLE_ID]: { id: ADMIN_ROLE_ID, admin: true },
  [ROLE_ID]: { id: ROLE_ID, admin: false },
};
const findRole = () => vi.fn(async (roleId: string) => ROLES[roleId] ?? null);

describe("inviteMember", () => {
  function makeDeps(overrides: Partial<Parameters<typeof inviteMember>[2]> = {}) {
    const deps = {
      isAlreadyInWorkspace: vi.fn().mockResolvedValue(false),
      findRole: findRole(),
      createInvite: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      deleteInvite: vi.fn().mockResolvedValue(undefined),
      sendInvite: vi.fn().mockResolvedValue(undefined),
      now: () => NOW,
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("cria o convite com a role, envia o email com o token e retorna o id", async () => {
    const deps = makeDeps();

    const result = await inviteMember(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
    expect(deps.findRole).toHaveBeenCalledWith(ROLE_ID);
    expect(deps.sendInvite).toHaveBeenCalledWith({
      email: "maria@example.com",
      token: expect.any(String),
    });
    const { token } = deps.sendInvite.mock.calls[0][0];
    // Só o hash do token vai para o banco; o token em si só existe no email.
    expect(deps.createInvite).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      email: "maria@example.com",
      roleId: ROLE_ID,
      tokenHash: sha256(token),
      expiresAt: IN_7_DAYS,
    });
    expect(token).not.toBe(sha256(token));
  });

  it("administrador convida outro administrador pela role de administrador", async () => {
    const deps = makeDeps();

    const result = await inviteMember(
      { email: "maria@example.com", roleId: ADMIN_ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
    expect(deps.createInvite).toHaveBeenCalledWith(expect.objectContaining({ roleId: ADMIN_ROLE_ID }));
  });

  it("quem gerencia usuários convida para uma role comum", async () => {
    const result = await inviteMember(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: MANAGER },
      makeDeps(),
    );

    expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
  });

  it("gera um token diferente a cada convite, com pelo menos 32 caracteres", async () => {
    const deps = makeDeps();
    const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

    await inviteMember({ email: "a@example.com", roleId: ROLE_ID }, ctx, deps);
    await inviteMember({ email: "b@example.com", roleId: ROLE_ID }, ctx, deps);

    const [first, second] = deps.sendInvite.mock.calls.map(([data]) => data.token);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second);
  });

  it("normaliza o email (espaços e maiúsculas) antes de verificar e salvar", async () => {
    const deps = makeDeps();

    await inviteMember(
      { email: "  Maria@Example.COM  ", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(deps.isAlreadyInWorkspace).toHaveBeenCalledWith("maria@example.com");
    expect(deps.createInvite).toHaveBeenCalledWith(expect.objectContaining({ email: "maria@example.com" }));
    expect(deps.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ email: "maria@example.com" }));
  });

  it("retorna workspace_not_found sem fazer nada quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await inviteMember(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: null },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.isAlreadyInWorkspace).not.toHaveBeenCalled();
    expect(deps.createInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, ROLE_ID],
    ["gerencia usuários, mas convida para a role de administrador", MANAGER, ADMIN_ROLE_ID],
  ] as const)("retorna forbidden sem fazer nada quando quem convida %s", async (_label, actor, roleId) => {
    const deps = makeDeps();

    const result = await inviteMember({ email: "maria@example.com", roleId }, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.createInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["email ausente", { roleId: ROLE_ID }, "invalid_input"],
    ["email não é string", { email: 123, roleId: ROLE_ID }, "invalid_input"],
    ["email vazio", { email: "", roleId: ROLE_ID }, "invalid_email"],
    ["email sem @", { email: "maria.example.com", roleId: ROLE_ID }, "invalid_email"],
    ["email sem domínio", { email: "maria@", roleId: ROLE_ID }, "invalid_email"],
    ["role ausente", { email: "maria@example.com" }, "invalid_role"],
    ["role vazia", { email: "maria@example.com", roleId: "" }, "invalid_role"],
    ["role não é string", { email: "maria@example.com", roleId: 1 }, "invalid_role"],
  ])("retorna erro sem salvar nem enviar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await inviteMember(input, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.createInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("retorna invalid_role sem salvar quando a role não existe no workspace", async () => {
    const deps = makeDeps();

    const result = await inviteMember(
      { email: "maria@example.com", roleId: UNKNOWN_ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_role" });
    expect(deps.createInvite).not.toHaveBeenCalled();
  });

  it("retorna already_member sem salvar nem enviar quando o email já está no workspace", async () => {
    const deps = makeDeps({ isAlreadyInWorkspace: vi.fn().mockResolvedValue(true) });

    const result = await inviteMember(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "already_member" });
    expect(deps.createInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("apaga o convite e retorna email_failed quando o envio do email falha", async () => {
    const deps = makeDeps({ sendInvite: vi.fn().mockRejectedValue(new Error("resend down")) });

    const result = await inviteMember(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "email_failed" });
    expect(deps.deleteInvite).toHaveBeenCalledWith(MEMBER_ID);
  });
});

describe("acceptInvite", () => {
  const TOKEN = "a".repeat(43);
  const USER = { id: USER_ID, email: "maria@example.com" };

  function makeInvite(overrides = {}) {
    return {
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      email: "maria@example.com",
      expiresAt: IN_7_DAYS,
      ...overrides,
    };
  }

  function makeDeps(invite: ReturnType<typeof makeInvite> | null = makeInvite()) {
    return {
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite),
      markAccepted: vi.fn().mockResolvedValue(undefined),
      now: () => NOW,
    };
  }

  it("busca o convite pelo hash do token, vincula o usuário e retorna o workspace", async () => {
    const deps = makeDeps();

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID });
    expect(deps.findInviteByTokenHash).toHaveBeenCalledWith(sha256(TOKEN));
    expect(deps.markAccepted).toHaveBeenCalledWith(MEMBER_ID, USER_ID);
  });

  it("compara o email sem diferenciar maiúsculas", async () => {
    const result = await acceptInvite(TOKEN, { id: USER_ID, email: "Maria@Example.com" }, makeDeps());

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID });
  });

  it("retorna unauthenticated sem buscar o convite quando não há usuário", async () => {
    const deps = makeDeps();

    const result = await acceptInvite(TOKEN, null, deps);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(deps.findInviteByTokenHash).not.toHaveBeenCalled();
  });

  it.each([
    ["token vazio", ""],
    ["token não é string", 123],
    ["token ausente", undefined],
  ])("retorna invalid_invite sem buscar quando %s", async (_label, token) => {
    const deps = makeDeps();

    const result = await acceptInvite(token, USER, deps);

    expect(result).toEqual({ ok: false, error: "invalid_invite" });
    expect(deps.findInviteByTokenHash).not.toHaveBeenCalled();
  });

  it("retorna invalid_invite quando o token não corresponde a um convite pendente", async () => {
    const deps = makeDeps(null);

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: false, error: "invalid_invite" });
    expect(deps.markAccepted).not.toHaveBeenCalled();
  });

  it("retorna invite_expired sem aceitar quando o convite venceu", async () => {
    const deps = makeDeps(makeInvite({ expiresAt: NOW }));

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: false, error: "invite_expired" });
    expect(deps.markAccepted).not.toHaveBeenCalled();
  });

  it("retorna email_mismatch sem aceitar quando o usuário logado tem outro email", async () => {
    const deps = makeDeps();

    const result = await acceptInvite(TOKEN, { id: USER_ID, email: "joao@example.com" }, deps);

    expect(result).toEqual({ ok: false, error: "email_mismatch" });
    expect(deps.markAccepted).not.toHaveBeenCalled();
  });
});

// admin: o membro está hoje na role de administrador.
type FoundMember = { id: string; userId: string | null; admin: boolean } | null;

describe("updateMember", () => {
  const ACTIVE = { id: MEMBER_ID, userId: USER_ID, admin: false };
  const ACTIVE_ADMIN = { ...ACTIVE, admin: true };

  function makeDeps(member: FoundMember = ACTIVE, overrides: Partial<Parameters<typeof updateMember>[3]> = {}) {
    const deps = {
      findMember: vi.fn().mockResolvedValue(member),
      findRole: findRole(),
      countActiveAdmins: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockResolvedValue(undefined),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("troca a role de um membro que já aceitou", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.findRole).toHaveBeenCalledWith(ROLE_ID);
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("troca a role de um convite pendente (ainda sem conta vinculada)", async () => {
    const deps = makeDeps({ ...ACTIVE, userId: null });

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
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
    const deps = makeDeps(ACTIVE_ADMIN);

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("retorna last_admin sem salvar ao tirar o cargo do único administrador ativo", async () => {
    const deps = makeDeps(ACTIVE_ADMIN, { countActiveAdmins: vi.fn().mockResolvedValue(1) });

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "last_admin" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("mantém o único administrador ativo na role de administrador", async () => {
    const deps = makeDeps(ACTIVE_ADMIN, { countActiveAdmins: vi.fn().mockResolvedValue(1) });

    const result = await updateMember({ roleId: ADMIN_ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
  });

  it("convite pendente de administrador não conta como último administrador", async () => {
    const deps = makeDeps({ ...ACTIVE_ADMIN, userId: null }, { countActiveAdmins: vi.fn().mockResolvedValue(1) });

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(MEMBER_ID, { roleId: ROLE_ID });
  });

  it("retorna workspace_not_found sem buscar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await updateMember({ roleId: ROLE_ID }, MEMBER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.findMember).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, ACTIVE, ROLE_ID],
    ["gerencia usuários, mas promove a administrador", MANAGER, ACTIVE, ADMIN_ROLE_ID],
    ["gerencia usuários, mas edita um administrador", MANAGER, ACTIVE_ADMIN, ROLE_ID],
  ] as const)("retorna forbidden sem salvar quando quem edita %s", async (_label, actor, member, roleId) => {
    const deps = makeDeps(member);

    const result = await updateMember({ roleId }, MEMBER_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna member_not_found sem buscar quando não há memberId (%j)",
    async (memberId) => {
      const deps = makeDeps();

      const result = await updateMember({ roleId: ROLE_ID }, memberId, { actor: ADMIN }, deps);

      expect(result).toEqual({ ok: false, error: "member_not_found" });
      expect(deps.findMember).not.toHaveBeenCalled();
    },
  );

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
  const ACTIVE = { id: MEMBER_ID, userId: USER_ID, admin: false };
  const ACTIVE_ADMIN = { ...ACTIVE, admin: true };

  function makeDeps(member: FoundMember = ACTIVE, overrides: Partial<Parameters<typeof removeMember>[2]> = {}) {
    const deps = {
      findMember: vi.fn().mockResolvedValue(member),
      countActiveAdmins: vi.fn().mockResolvedValue(2),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("remove o membro (ou convite) do workspace", async () => {
    const deps = makeDeps();

    const result = await removeMember(MEMBER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findMember).toHaveBeenCalledWith(MEMBER_ID);
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("administrador remove outro administrador quando resta mais um", async () => {
    const deps = makeDeps(ACTIVE_ADMIN);

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("retorna last_admin sem remover o único administrador ativo", async () => {
    const deps = makeDeps(ACTIVE_ADMIN, { countActiveAdmins: vi.fn().mockResolvedValue(1) });

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "last_admin" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("remove convite pendente de administrador mesmo com um só administrador ativo", async () => {
    const deps = makeDeps({ ...ACTIVE_ADMIN, userId: null }, { countActiveAdmins: vi.fn().mockResolvedValue(1) });

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
  });

  it("retorna workspace_not_found sem remover quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await removeMember(MEMBER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, ACTIVE],
    ["gerencia usuários, mas remove um administrador", MANAGER, ACTIVE_ADMIN],
  ] as const)("retorna forbidden sem remover quando quem remove %s", async (_label, actor, member) => {
    const deps = makeDeps(member);

    const result = await removeMember(MEMBER_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna member_not_found sem buscar quando não há memberId (%j)",
    async (memberId) => {
      const deps = makeDeps();

      const result = await removeMember(memberId, { actor: ADMIN }, deps);

      expect(result).toEqual({ ok: false, error: "member_not_found" });
      expect(deps.findMember).not.toHaveBeenCalled();
    },
  );

  it("retorna member_not_found quando o membro não existe (ou não é do workspace)", async () => {
    const deps = makeDeps(null);

    const result = await removeMember(MEMBER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "member_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
