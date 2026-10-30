import { describe, it, expect, vi } from "vitest";
import { deleteAccount, updateProfile } from "@/service/account/account";

const USER_ID = "64b7f0c2a1b2c3d4e5f60719";
const SPA = { id: "64b7f0c2a1b2c3d4e5f60801", name: "Spa Centro" };
const STUDIO = { id: "64b7f0c2a1b2c3d4e5f60802", name: "Studio Zen" };

describe("updateProfile", () => {
  function makeDeps() {
    return { update: vi.fn().mockResolvedValue(undefined) };
  }

  it("salva o nome sem os espaços das pontas", async () => {
    const deps = makeDeps();

    const result = await updateProfile({ name: "  Maria Souza  " }, USER_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(USER_ID, { name: "Maria Souza" });
  });

  it("aceita nome com 80 caracteres", async () => {
    const deps = makeDeps();

    const result = await updateProfile({ name: "a".repeat(80) }, USER_ID, deps);

    expect(result).toEqual({ ok: true });
  });

  it("retorna unauthenticated sem salvar quando não há usuário logado", async () => {
    const deps = makeDeps();

    const result = await updateProfile({ name: "Maria" }, null, deps);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", {}, "invalid_input"],
    ["nome não é string", { name: 123 }, "invalid_input"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateProfile(input, USER_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  // adminIn: workspaces em que o usuário é administrador ativo.
  // activeAdmins: administradores ativos de cada workspace, contando o próprio usuário.
  function makeDeps(adminIn: { id: string; name: string }[] = [], activeAdmins: Record<string, number> = {}) {
    return {
      listAdminWorkspaces: vi.fn().mockResolvedValue(adminIn),
      countActiveAdmins: vi.fn(async (workspaceId: string) => activeAdmins[workspaceId] ?? 1),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("apaga a conta de quem não é administrador de nenhum workspace", async () => {
    const deps = makeDeps();

    const result = await deleteAccount(USER_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.listAdminWorkspaces).toHaveBeenCalledWith(USER_ID);
    expect(deps.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("apaga a conta quando todo workspace que ele administra tem outro administrador ativo", async () => {
    const deps = makeDeps([SPA, STUDIO], { [SPA.id]: 2, [STUDIO.id]: 3 });

    const result = await deleteAccount(USER_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.countActiveAdmins).toHaveBeenCalledWith(SPA.id);
    expect(deps.countActiveAdmins).toHaveBeenCalledWith(STUDIO.id);
    expect(deps.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("retorna last_admin com os workspaces em que ele é o único administrador, sem apagar", async () => {
    const deps = makeDeps([SPA, STUDIO], { [SPA.id]: 1, [STUDIO.id]: 2 });

    const result = await deleteAccount(USER_ID, deps);

    expect(result).toEqual({ ok: false, error: "last_admin", workspaces: ["Spa Centro"] });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("retorna unauthenticated sem buscar nem apagar quando não há usuário logado", async () => {
    const deps = makeDeps();

    const result = await deleteAccount(null, deps);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(deps.listAdminWorkspaces).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
