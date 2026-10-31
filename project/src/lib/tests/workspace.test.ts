import { describe, it, expect, vi } from "vitest";
import { createWorkspace, updateWorkspace } from "@/service/workspace/workspace";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";

describe("updateWorkspace", () => {
  function makeUpdate(found = true) {
    return vi.fn().mockResolvedValue(found);
  }

  it("salva nome e imagem do workspace", async () => {
    const update = makeUpdate();

    const result = await updateWorkspace(
      { name: "Spa Central", imageUrl: "https://cdn.example.com/logo.png" },
      WORKSPACE_ID,
      update,
    );

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, {
      name: "Spa Central",
      imageUrl: "https://cdn.example.com/logo.png",
    });
  });

  it("remove espaços das pontas do nome e da imagem", async () => {
    const update = makeUpdate();

    await updateWorkspace(
      { name: "  Spa Central  ", imageUrl: "  https://cdn.example.com/logo.png  " },
      WORKSPACE_ID,
      update,
    );

    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, {
      name: "Spa Central",
      imageUrl: "https://cdn.example.com/logo.png",
    });
  });

  it.each([undefined, null, "", "   "])("salva a imagem como null quando ela vem vazia (%j)", async (imageUrl) => {
    const update = makeUpdate();

    const result = await updateWorkspace({ name: "Spa Central", imageUrl }, WORKSPACE_ID, update);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, { name: "Spa Central", imageUrl: null });
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
    ["imagem não é string", { name: "Spa Central", imageUrl: 123 }, "invalid_input"],
    ["nome vazio", { name: "" }, "invalid_name"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
    ["imagem não é URL", { name: "Spa Central", imageUrl: "logo.png" }, "invalid_image_url"],
    ["imagem não é http(s)", { name: "Spa Central", imageUrl: "javascript:alert(1)" }, "invalid_image_url"],
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

describe("createWorkspace", () => {
  function makeInsert() {
    return vi.fn().mockResolvedValue({ id: WORKSPACE_ID });
  }

  it("cria o workspace com o nome sem espaços nas pontas para o usuário e devolve o id", async () => {
    const insert = makeInsert();

    const result = await createWorkspace({ name: "  Spa Central  " }, USER_ID, insert);

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID });
    expect(insert).toHaveBeenCalledWith({ name: "Spa Central", userId: USER_ID });
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    const insert = makeInsert();

    const result = await createWorkspace({ name: "a".repeat(80) }, USER_ID, insert);

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID });
  });

  it.each([
    ["nome ausente", {}, "invalid_input"],
    ["nome não é string", { name: 123 }, "invalid_input"],
    ["input nulo", null, "invalid_input"],
    ["nome vazio", { name: "" }, "invalid_name"],
    ["nome só com espaços", { name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { name: "a".repeat(81) }, "name_too_long"],
  ])("retorna erro sem criar quando %s", async (_label, input, error) => {
    const insert = makeInsert();

    const result = await createWorkspace(input, USER_ID, insert);

    expect(result).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });
});
