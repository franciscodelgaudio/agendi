import { describe, it, expect, vi } from "vitest";
import { updateWorkspace } from "@/lib/workspace";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("updateWorkspace", () => {
  function makeUpdate(found = true) {
    return vi.fn().mockResolvedValue(found);
  }

  it("salva nome e imagem do workspace", async () => {
    const update = makeUpdate();

    const result = await updateWorkspace(
      { name: "Spa Central", avatarUrl: "https://cdn.example.com/logo.png" },
      WORKSPACE_ID,
      update,
    );

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, {
      name: "Spa Central",
      avatarUrl: "https://cdn.example.com/logo.png",
    });
  });

  it("remove espaços das pontas do nome e da imagem", async () => {
    const update = makeUpdate();

    await updateWorkspace(
      { name: "  Spa Central  ", avatarUrl: "  https://cdn.example.com/logo.png  " },
      WORKSPACE_ID,
      update,
    );

    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, {
      name: "Spa Central",
      avatarUrl: "https://cdn.example.com/logo.png",
    });
  });

  it.each([undefined, null, "", "   "])("salva a imagem como null quando ela vem vazia (%j)", async (avatarUrl) => {
    const update = makeUpdate();

    const result = await updateWorkspace({ name: "Spa Central", avatarUrl }, WORKSPACE_ID, update);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, { name: "Spa Central", avatarUrl: null });
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    const update = makeUpdate();

    const result = await updateWorkspace({ name: "a".repeat(80) }, WORKSPACE_ID, update);

    expect(result).toEqual({ ok: true });
  });

  it.each([
    ["nome ausente", {}, "invalid_input"],
    ["nome não é string", { name: 123 }, "invalid_input"],
    ["input nulo", null, "invalid_input"],
    ["imagem não é string", { name: "Spa Central", avatarUrl: 123 }, "invalid_input"],
    ["nome vazio", { name: "" }, "invalid_name"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
    ["imagem não é URL", { name: "Spa Central", avatarUrl: "logo.png" }, "invalid_avatar_url"],
    ["imagem não é http(s)", { name: "Spa Central", avatarUrl: "javascript:alert(1)" }, "invalid_avatar_url"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const update = makeUpdate();

    const result = await updateWorkspace(input, WORKSPACE_ID, update);

    expect(result).toEqual({ ok: false, error });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna workspace_not_found sem salvar quando não há workspaceId (%j)",
    async (workspaceId) => {
      const update = makeUpdate();

      const result = await updateWorkspace({ name: "Spa Central" }, workspaceId, update);

      expect(result).toEqual({ ok: false, error: "workspace_not_found" });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("retorna workspace_not_found quando o workspace não é encontrado ao salvar", async () => {
    const update = makeUpdate(false);

    const result = await updateWorkspace({ name: "Spa Central" }, WORKSPACE_ID, update);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
  });
});
