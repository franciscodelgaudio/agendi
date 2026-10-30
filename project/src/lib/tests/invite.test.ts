import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { acceptInvite, cancelInvite, createInvite, updateInvite } from "@/service/workspace/[workspaceId]/users/invite";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";
const INVITE_ID = "64b7f0c2a1b2c3d4e5f60722";
const ADMIN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60730";
const ROLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const UNKNOWN_ROLE_ID = "64b7f0c2a1b2c3d4e5f60739";
const NOW = new Date("2026-09-24T12:00:00.000Z");
const IN_7_DAYS = new Date("2026-10-01T12:00:00.000Z");

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const ADMIN: Actor = { admin: true };
const MANAGER: Actor = { admin: false, permissions: ["users.manage"], pages: { workspace: ["users"], unit: [] } };
const STAFF: Actor = { admin: false, permissions: ["bookings.manage", "attends"], pages: { workspace: ["home"], unit: [] } };

const ROLES: Record<string, { id: string; admin: boolean }> = {
  [ADMIN_ROLE_ID]: { id: ADMIN_ROLE_ID, admin: true },
  [ROLE_ID]: { id: ROLE_ID, admin: false },
};
const findRole = () => vi.fn(async (roleId: string) => ROLES[roleId] ?? null);

type FoundInvite = { id: string; admin: boolean } | null;
const PENDING: FoundInvite = { id: INVITE_ID, admin: false };
const PENDING_ADMIN: FoundInvite = { id: INVITE_ID, admin: true };

describe("createInvite", () => {
  function makeDeps(overrides: Partial<Parameters<typeof createInvite>[2]> = {}) {
    const deps = {
      isAlreadyInWorkspace: vi.fn().mockResolvedValue(false),
      findRole: findRole(),
      insertInvite: vi.fn().mockResolvedValue({ id: INVITE_ID }),
      deleteInvite: vi.fn().mockResolvedValue(undefined),
      sendInvite: vi.fn().mockResolvedValue(undefined),
      now: () => NOW,
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("cria o convite com a role, envia o email com o token e retorna o id", async () => {
    const deps = makeDeps();

    const result = await createInvite(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true, inviteId: INVITE_ID });
    expect(deps.findRole).toHaveBeenCalledWith(ROLE_ID);
    expect(deps.sendInvite).toHaveBeenCalledWith({ email: "maria@example.com", token: expect.any(String) });
    const { token } = deps.sendInvite.mock.calls[0][0];
    expect(deps.insertInvite).toHaveBeenCalledWith({
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

    const result = await createInvite(
      { email: "maria@example.com", roleId: ADMIN_ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: true, inviteId: INVITE_ID });
    expect(deps.insertInvite).toHaveBeenCalledWith(expect.objectContaining({ roleId: ADMIN_ROLE_ID }));
  });

  it("quem gerencia usuários convida para uma role comum", async () => {
    const result = await createInvite(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: MANAGER },
      makeDeps(),
    );

    expect(result).toEqual({ ok: true, inviteId: INVITE_ID });
  });

  it("gera um token diferente a cada convite, com pelo menos 32 caracteres", async () => {
    const deps = makeDeps();
    const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

    await createInvite({ email: "a@example.com", roleId: ROLE_ID }, ctx, deps);
    await createInvite({ email: "b@example.com", roleId: ROLE_ID }, ctx, deps);

    const [first, second] = deps.sendInvite.mock.calls.map(([data]) => data.token);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second);
  });

  it("normaliza o email (espaços e maiúsculas) antes de verificar e salvar", async () => {
    const deps = makeDeps();

    await createInvite(
      { email: "  Maria@Example.COM  ", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(deps.isAlreadyInWorkspace).toHaveBeenCalledWith("maria@example.com");
    expect(deps.insertInvite).toHaveBeenCalledWith(expect.objectContaining({ email: "maria@example.com" }));
    expect(deps.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ email: "maria@example.com" }));
  });

  it("retorna workspace_not_found sem fazer nada quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await createInvite(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: null },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.isAlreadyInWorkspace).not.toHaveBeenCalled();
    expect(deps.insertInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, ROLE_ID],
    ["gerencia usuários, mas convida para a role de administrador", MANAGER, ADMIN_ROLE_ID],
  ] as const)("retorna forbidden sem fazer nada quando quem convida %s", async (_label, actor, roleId) => {
    const deps = makeDeps();

    const result = await createInvite({ email: "maria@example.com", roleId }, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.insertInvite).not.toHaveBeenCalled();
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

    const result = await createInvite(input, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insertInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("retorna invalid_role sem salvar quando a role não existe no workspace", async () => {
    const deps = makeDeps();

    const result = await createInvite(
      { email: "maria@example.com", roleId: UNKNOWN_ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_role" });
    expect(deps.insertInvite).not.toHaveBeenCalled();
  });

  it("retorna already_member sem salvar nem enviar quando o email já é de um membro ou convite", async () => {
    const deps = makeDeps({ isAlreadyInWorkspace: vi.fn().mockResolvedValue(true) });

    const result = await createInvite(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "already_member" });
    expect(deps.insertInvite).not.toHaveBeenCalled();
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("apaga o convite e retorna email_failed quando o envio do email falha", async () => {
    const deps = makeDeps({ sendInvite: vi.fn().mockRejectedValue(new Error("resend down")) });

    const result = await createInvite(
      { email: "maria@example.com", roleId: ROLE_ID },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "email_failed" });
    expect(deps.deleteInvite).toHaveBeenCalledWith(INVITE_ID);
  });
});

describe("acceptInvite", () => {
  const TOKEN = "a".repeat(43);
  const USER = { id: USER_ID, email: "maria@example.com" };

  function makeInvite(overrides = {}) {
    return {
      id: INVITE_ID,
      workspaceId: WORKSPACE_ID,
      email: "maria@example.com",
      roleId: ROLE_ID,
      expiresAt: IN_7_DAYS,
      ...overrides,
    };
  }

  function makeDeps(invite: ReturnType<typeof makeInvite> | null = makeInvite()) {
    return {
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite),
      createMember: vi.fn().mockResolvedValue(undefined),
      deleteInvite: vi.fn().mockResolvedValue(undefined),
      now: () => NOW,
    };
  }

  it("cria o membro com a role do convite, apaga o convite e retorna o workspace", async () => {
    const deps = makeDeps();

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID });
    expect(deps.findInviteByTokenHash).toHaveBeenCalledWith(sha256(TOKEN));
    expect(deps.createMember).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, userId: USER_ID, roleId: ROLE_ID });
    expect(deps.deleteInvite).toHaveBeenCalledWith(INVITE_ID);
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

  it("retorna invalid_invite quando o token não corresponde a um convite", async () => {
    const deps = makeDeps(null);

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: false, error: "invalid_invite" });
    expect(deps.createMember).not.toHaveBeenCalled();
  });

  it("retorna invite_expired sem aceitar quando o convite venceu", async () => {
    const deps = makeDeps(makeInvite({ expiresAt: NOW }));

    const result = await acceptInvite(TOKEN, USER, deps);

    expect(result).toEqual({ ok: false, error: "invite_expired" });
    expect(deps.createMember).not.toHaveBeenCalled();
    expect(deps.deleteInvite).not.toHaveBeenCalled();
  });

  it("retorna email_mismatch sem aceitar quando o usuário logado tem outro email", async () => {
    const deps = makeDeps();

    const result = await acceptInvite(TOKEN, { id: USER_ID, email: "joao@example.com" }, deps);

    expect(result).toEqual({ ok: false, error: "email_mismatch" });
    expect(deps.createMember).not.toHaveBeenCalled();
    expect(deps.deleteInvite).not.toHaveBeenCalled();
  });
});

describe("updateInvite", () => {
  function makeDeps(invite: FoundInvite = PENDING) {
    return {
      findInvite: vi.fn().mockResolvedValue(invite),
      findRole: findRole(),
      update: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("troca a role do convite", async () => {
    const deps = makeDeps();

    const result = await updateInvite({ roleId: ROLE_ID }, INVITE_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findInvite).toHaveBeenCalledWith(INVITE_ID);
    expect(deps.update).toHaveBeenCalledWith(INVITE_ID, { roleId: ROLE_ID });
  });

  it("administrador muda um convite para a role de administrador", async () => {
    const deps = makeDeps();

    const result = await updateInvite({ roleId: ADMIN_ROLE_ID }, INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(INVITE_ID, { roleId: ADMIN_ROLE_ID });
  });

  it("administrador tira um convite da role de administrador", async () => {
    const deps = makeDeps(PENDING_ADMIN);

    const result = await updateInvite({ roleId: ROLE_ID }, INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(INVITE_ID, { roleId: ROLE_ID });
  });

  it("retorna workspace_not_found sem buscar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await updateInvite({ roleId: ROLE_ID }, INVITE_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.findInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, PENDING, ROLE_ID],
    ["gerencia usuários, mas muda para a role de administrador", MANAGER, PENDING, ADMIN_ROLE_ID],
    ["gerencia usuários, mas edita um convite de administrador", MANAGER, PENDING_ADMIN, ROLE_ID],
  ] as const)("retorna forbidden sem salvar quando quem edita %s", async (_label, actor, invite, roleId) => {
    const deps = makeDeps(invite);

    const result = await updateInvite({ roleId }, INVITE_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna invite_not_found sem buscar quando não há inviteId (%j)", async (inviteId) => {
    const deps = makeDeps();

    const result = await updateInvite({ roleId: ROLE_ID }, inviteId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invite_not_found" });
    expect(deps.findInvite).not.toHaveBeenCalled();
  });

  it("retorna invite_not_found quando o convite não existe (ou não é do workspace)", async () => {
    const deps = makeDeps(null);

    const result = await updateInvite({ roleId: ROLE_ID }, INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invite_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna invalid_role sem salvar quando a role não existe no workspace", async () => {
    const deps = makeDeps();

    const result = await updateInvite({ roleId: UNKNOWN_ROLE_ID }, INVITE_ID, { actor: ADMIN }, deps);

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

    const result = await updateInvite(input, INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("cancelInvite", () => {
  function makeDeps(invite: FoundInvite = PENDING) {
    return {
      findInvite: vi.fn().mockResolvedValue(invite),
      remove: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("apaga o convite", async () => {
    const deps = makeDeps();

    const result = await cancelInvite(INVITE_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.findInvite).toHaveBeenCalledWith(INVITE_ID);
    expect(deps.remove).toHaveBeenCalledWith(INVITE_ID);
  });

  it("administrador cancela um convite de administrador", async () => {
    const deps = makeDeps(PENDING_ADMIN);

    const result = await cancelInvite(INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(INVITE_ID);
  });

  it("retorna workspace_not_found sem apagar quando o usuário não tem acesso", async () => {
    const deps = makeDeps();

    const result = await cancelInvite(INVITE_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem permissão de gerenciar usuários", STAFF, PENDING],
    ["gerencia usuários, mas cancela um convite de administrador", MANAGER, PENDING_ADMIN],
  ] as const)("retorna forbidden sem apagar quando quem cancela %s", async (_label, actor, invite) => {
    const deps = makeDeps(invite);

    const result = await cancelInvite(INVITE_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna invite_not_found sem buscar quando não há inviteId (%j)", async (inviteId) => {
    const deps = makeDeps();

    const result = await cancelInvite(inviteId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invite_not_found" });
    expect(deps.findInvite).not.toHaveBeenCalled();
  });

  it("retorna invite_not_found quando o convite não existe (ou não é do workspace)", async () => {
    const deps = makeDeps(null);

    const result = await cancelInvite(INVITE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invite_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
