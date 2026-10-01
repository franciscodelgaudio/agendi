import { describe, it, expect, vi } from "vitest";
import { UNIT_PAGES, WORKSPACE_PAGES } from "@/lib/page-access";
import type { Actor } from "@/lib/permissions";
import { createRole, deleteRole, renameRole, updateRolePermissions } from "@/lib/role";

const ROLE_ID = "64b7f0c2a1b2c3d4e5f60731";
const OTHER_ROLE_ID = "64b7f0c2a1b2c3d4e5f60732";

const ADMIN: Actor = { admin: true };
// Gerenciar usuários não dá acesso às roles: só o administrador as define.
const MANAGER: Actor = { admin: false, permissions: ["users.manage"], pages: { workspace: ["users"], unit: [] } };

describe("createRole", () => {
  function makeDeps(overrides: Partial<Parameters<typeof createRole>[2]> = {}) {
    const deps = {
      isNameTaken: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue({ id: ROLE_ID }),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("cria a role sem permissões de ação e com todas as páginas liberadas", async () => {
    const deps = makeDeps();

    const result = await createRole({ name: "  Terapeuta  " }, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true, roleId: ROLE_ID });
    expect(deps.isNameTaken).toHaveBeenCalledWith("Terapeuta");
    expect(deps.create).toHaveBeenCalledWith({
      name: "Terapeuta",
      permissions: [],
      pages: { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] },
    });
  });

  it.each([
    [null, "workspace_not_found"],
    [MANAGER, "forbidden"],
  ] as const)("com o acesso %j retorna %s sem criar", async (actor, error) => {
    const deps = makeDeps();

    const result = await createRole({ name: "Terapeuta" }, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.create).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", {}, "invalid_input"],
    ["nome não é string", { name: 1 }, "invalid_input"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { name: "a".repeat(41) }, "name_too_long"],
    ["nome reservado do administrador", { name: " administrador " }, "name_taken"],
  ])("retorna erro sem criar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createRole(input, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("retorna name_taken sem criar quando já há role com o nome", async () => {
    const deps = makeDeps({ isNameTaken: vi.fn().mockResolvedValue(true) });

    const result = await createRole({ name: "Terapeuta" }, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "name_taken" });
    expect(deps.create).not.toHaveBeenCalled();
  });
});

describe("renameRole", () => {
  function makeDeps(overrides: Partial<Parameters<typeof renameRole>[3]> = {}) {
    const deps = {
      findRole: vi.fn().mockResolvedValue({ id: ROLE_ID }),
      isNameTaken: vi.fn().mockResolvedValue(false),
      rename: vi.fn().mockResolvedValue(undefined),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("renomeia a role, ignorando ela mesma na checagem de nome repetido", async () => {
    const deps = makeDeps();

    const result = await renameRole({ name: " Terapeuta " }, ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.isNameTaken).toHaveBeenCalledWith("Terapeuta", ROLE_ID);
    expect(deps.rename).toHaveBeenCalledWith(ROLE_ID, "Terapeuta");
  });

  it.each([
    [null, "workspace_not_found"],
    [MANAGER, "forbidden"],
  ] as const)("com o acesso %j retorna %s sem renomear", async (actor, error) => {
    const deps = makeDeps();

    const result = await renameRole({ name: "Terapeuta" }, ROLE_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna role_not_found sem buscar quando não há roleId (%j)", async (roleId) => {
    const deps = makeDeps();

    const result = await renameRole({ name: "Terapeuta" }, roleId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "role_not_found" });
    expect(deps.findRole).not.toHaveBeenCalled();
  });

  it("retorna role_not_found quando a role não existe (ou não é do workspace)", async () => {
    const deps = makeDeps({ findRole: vi.fn().mockResolvedValue(null) });

    const result = await renameRole({ name: "Terapeuta" }, ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "role_not_found" });
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it.each([
    ["nome só com espaços", { name: " " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { name: "a".repeat(41) }, "name_too_long"],
    ["nome reservado do administrador", { name: "Administrador" }, "name_taken"],
  ])("retorna erro sem renomear quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await renameRole(input, ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it("retorna name_taken sem renomear quando outra role já tem o nome", async () => {
    const deps = makeDeps({ isNameTaken: vi.fn().mockResolvedValue(true) });

    const result = await renameRole({ name: "Recepcionista" }, ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "name_taken" });
    expect(deps.rename).not.toHaveBeenCalled();
  });
});

describe("deleteRole", () => {
  function makeDeps(overrides: Partial<Parameters<typeof deleteRole>[2]> = {}) {
    const deps = {
      countMembers: vi.fn().mockResolvedValue(0),
      remove: vi.fn().mockResolvedValue(true),
    };
    return { ...deps, ...overrides } as typeof deps;
  }

  it("exclui a role sem membros", async () => {
    const deps = makeDeps();

    const result = await deleteRole(ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.countMembers).toHaveBeenCalledWith(ROLE_ID);
    expect(deps.remove).toHaveBeenCalledWith(ROLE_ID);
  });

  it("retorna role_in_use sem excluir quando há membros ou convites na role", async () => {
    const deps = makeDeps({ countMembers: vi.fn().mockResolvedValue(2) });

    const result = await deleteRole(ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "role_in_use" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    [null, "workspace_not_found"],
    [MANAGER, "forbidden"],
  ] as const)("com o acesso %j retorna %s sem excluir", async (actor, error) => {
    const deps = makeDeps();

    const result = await deleteRole(ROLE_ID, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna role_not_found sem consultar quando não há roleId (%j)", async (roleId) => {
    const deps = makeDeps();

    const result = await deleteRole(roleId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "role_not_found" });
    expect(deps.countMembers).not.toHaveBeenCalled();
  });

  it("retorna role_not_found quando a role não existe (ou não é do workspace)", async () => {
    const deps = makeDeps({ remove: vi.fn().mockResolvedValue(false) });

    const result = await deleteRole(ROLE_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "role_not_found" });
  });
});

describe("updateRolePermissions", () => {
  const input = {
    [ROLE_ID]: {
      permissions: ["attends", "bookings.manage"],
      workspace: ["calendar", "home"],
      unit: ["appointments", "calendar"],
    },
    [OTHER_ROLE_ID]: { permissions: [], workspace: [...WORKSPACE_PAGES], unit: [] },
  };

  function makeDeps(roleIds = [ROLE_ID, OTHER_ROLE_ID]) {
    return {
      listRoleIds: vi.fn().mockResolvedValue(roleIds),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("salva permissões e páginas de cada role, na ordem dos catálogos", async () => {
    const deps = makeDeps();

    const result = await updateRolePermissions(input, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.save).toHaveBeenCalledWith({
      [ROLE_ID]: {
        permissions: ["bookings.manage", "attends"],
        pages: { workspace: ["home", "calendar"], unit: ["calendar", "appointments"] },
      },
      [OTHER_ROLE_ID]: { permissions: [], pages: { workspace: [...WORKSPACE_PAGES], unit: [] } },
    });
  });

  it("ignora itens repetidos", async () => {
    const deps = makeDeps([ROLE_ID]);

    await updateRolePermissions(
      { [ROLE_ID]: { permissions: ["attends", "attends"], workspace: ["home", "home"], unit: ["team", "team"] } },
      { actor: ADMIN },
      deps,
    );

    expect(deps.save).toHaveBeenCalledWith({
      [ROLE_ID]: { permissions: ["attends"], pages: { workspace: ["home"], unit: ["team"] } },
    });
  });

  it("sem roles no workspace, salva vazio", async () => {
    const deps = makeDeps([]);

    const result = await updateRolePermissions({}, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.save).toHaveBeenCalledWith({});
  });

  it.each([
    [null, "workspace_not_found"],
    [MANAGER, "forbidden"],
  ] as const)("com o acesso %j retorna %s sem salvar", async (actor, error) => {
    const deps = makeDeps();

    const result = await updateRolePermissions(input, { actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.save).not.toHaveBeenCalled();
  });

  const other = input[OTHER_ROLE_ID];
  it.each([
    ["input nulo", null],
    ["input não é objeto", "x"],
    ["role do workspace ausente", { [ROLE_ID]: input[ROLE_ID] }],
    ["role que não é do workspace", { ...input, "64b7f0c2a1b2c3d4e5f60799": other }],
    ["campo ausente", { ...input, [OTHER_ROLE_ID]: { workspace: ["home"], unit: [] } }],
    ["lista não é array", { ...input, [OTHER_ROLE_ID]: { ...other, unit: "team" } }],
    ["permissão desconhecida", { ...input, [OTHER_ROLE_ID]: { ...other, permissions: ["billing.manage"] } }],
    ["página desconhecida", { ...input, [OTHER_ROLE_ID]: { ...other, workspace: ["home", "billing"] } }],
    ["página de unidade no escopo do sistema", { ...input, [OTHER_ROLE_ID]: { ...other, workspace: ["home", "appointments"] } }],
    ["item que não é string", { ...input, [OTHER_ROLE_ID]: { ...other, workspace: ["home", 1] } }],
  ])("retorna invalid_input sem salvar quando %s", async (_label, value) => {
    const deps = makeDeps();

    const result = await updateRolePermissions(value, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("exige ao menos uma página do sistema liberada para cada role", async () => {
    const deps = makeDeps();

    const result = await updateRolePermissions(
      { ...input, [OTHER_ROLE_ID]: { ...other, workspace: [] } },
      { actor: ADMIN },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "no_workspace_page" });
    expect(deps.save).not.toHaveBeenCalled();
  });
});
