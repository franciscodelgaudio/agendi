import { describe, it, expect, vi } from "vitest";
import { createChannel, deleteChannel, updateChannel } from "@/service/workspace/[workspaceId]/channels/messaging-channel";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const CHANNEL_ID = "64b7f0c2a1b2c3d4e5f60790";

// Encriptação falsa e previsível: o teste só confere que o token passa por ela antes de salvar.
const encrypt = (token: string) => `enc(${token})`;

const validInput = {
  platform: "whatsapp",
  name: "WhatsApp Centro",
  externalId: "106540352242922",
  accessToken: "EAAGm0PX4ZCpsBA",
};

describe("createChannel", () => {
  function makeDeps() {
    return {
      isExternalIdTaken: vi.fn().mockResolvedValue(false),
      insert: vi.fn().mockResolvedValue({ id: CHANNEL_ID }),
      encrypt: vi.fn(encrypt),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN } as const;

  it("cria o canal no workspace com o token encriptado e retorna o id", async () => {
    const deps = makeDeps();

    const result = await createChannel(validInput, ctx, deps);

    expect(result).toEqual({ ok: true, channelId: CHANNEL_ID });
    expect(deps.isExternalIdTaken).toHaveBeenCalledWith("whatsapp", "106540352242922");
    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      platform: "whatsapp",
      name: "WhatsApp Centro",
      externalId: "106540352242922",
      accessTokenEncrypted: "enc(EAAGm0PX4ZCpsBA)",
    });
  });

  it("aceita canal do Instagram", async () => {
    const deps = makeDeps();

    await createChannel({ ...validInput, platform: "instagram", externalId: "17841400000000001" }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", externalId: "17841400000000001" }),
    );
  });

  it("remove espaços das pontas de nome, id e token", async () => {
    const deps = makeDeps();

    await createChannel(
      { ...validInput, name: "  WhatsApp Centro ", externalId: " 106540352242922 ", accessToken: " EAAGm0PX4ZCpsBA\n" },
      ctx,
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "WhatsApp Centro",
        externalId: "106540352242922",
        accessTokenEncrypted: "enc(EAAGm0PX4ZCpsBA)",
      }),
    );
  });

  it("aceita nome com exatamente 60 caracteres", async () => {
    const result = await createChannel({ ...validInput, name: "a".repeat(60) }, ctx, makeDeps());

    expect(result).toEqual({ ok: true, channelId: CHANNEL_ID });
  });

  it("role com permissão de gerenciar canais também pode criar", async () => {
    const result = await createChannel(validInput, { ...ctx, actor: actorWith("channels.manage") }, makeDeps());

    expect(result).toEqual({ ok: true, channelId: CHANNEL_ID });
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["role que só usa as Conversas", actorWith("inbox.use"), "forbidden"],
    ["role sem permissões", STAFF, "forbidden"],
  ] as const)("recusa quando o autor é %s", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createChannel(validInput, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["token ausente (null do FormData)", { ...validInput, accessToken: null }, "invalid_input"],
    ["nome não é string", { ...validInput, name: 1 }, "invalid_input"],
    ["plataforma desconhecida", { ...validInput, platform: "telegram" }, "invalid_platform"],
    ["plataforma ausente", { ...validInput, platform: null }, "invalid_platform"],
    ["nome vazio", { ...validInput, name: "  " }, "invalid_name"],
    ["nome com mais de 60 caracteres", { ...validInput, name: "a".repeat(61) }, "name_too_long"],
    ["id vazio", { ...validInput, externalId: "" }, "invalid_external_id"],
    ["id com letras", { ...validInput, externalId: "10654abc" }, "invalid_external_id"],
    ["id com menos de 5 dígitos", { ...validInput, externalId: "1234" }, "invalid_external_id"],
    ["id com mais de 32 dígitos", { ...validInput, externalId: "1".repeat(33) }, "invalid_external_id"],
    ["token vazio", { ...validInput, accessToken: "   " }, "invalid_access_token"],
    ["token com espaço no meio", { ...validInput, accessToken: "EAAG m0PX" }, "invalid_access_token"],
    ["token com mais de 2048 caracteres", { ...validInput, accessToken: "a".repeat(2049) }, "invalid_access_token"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createChannel(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa quando o número ou a conta já está conectado a algum workspace", async () => {
    const deps = makeDeps();
    deps.isExternalIdTaken.mockResolvedValue(true);

    const result = await createChannel(validInput, ctx, deps);

    expect(result).toEqual({ ok: false, error: "external_id_taken" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateChannel", () => {
  function makeDeps() {
    return { update: vi.fn().mockResolvedValue(true), encrypt: vi.fn(encrypt) };
  }
  const ctx = { actor: ADMIN, channelId: CHANNEL_ID } as const;

  it("atualiza o nome e troca o token, encriptado", async () => {
    const deps = makeDeps();

    const result = await updateChannel({ name: " Novo nome ", accessToken: " NOVO_TOKEN " }, ctx, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(CHANNEL_ID, {
      name: "Novo nome",
      accessTokenEncrypted: "enc(NOVO_TOKEN)",
    });
  });

  it("mantém o token atual quando o campo vem vazio", async () => {
    const deps = makeDeps();

    await updateChannel({ name: "Novo nome", accessToken: "" }, ctx, deps);

    expect(deps.update).toHaveBeenCalledWith(CHANNEL_ID, { name: "Novo nome" });
    expect(deps.encrypt).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["role que só usa as Conversas", actorWith("inbox.use"), "forbidden"],
  ] as const)("recusa quando o autor é %s", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await updateChannel({ name: "X", accessToken: "" }, { ...ctx, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["token ausente (null do FormData)", { name: "X", accessToken: null }, "invalid_input"],
    ["nome vazio", { name: "", accessToken: "" }, "invalid_name"],
    ["nome com mais de 60 caracteres", { name: "a".repeat(61), accessToken: "" }, "name_too_long"],
    ["token com espaço no meio", { name: "X", accessToken: "EAAG m0PX" }, "invalid_access_token"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateChannel(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna channel_not_found sem salvar quando não há channelId (%j)", async (channelId) => {
    const deps = makeDeps();

    const result = await updateChannel({ name: "X", accessToken: "" }, { ...ctx, channelId }, deps);

    expect(result).toEqual({ ok: false, error: "channel_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("retorna channel_not_found quando o canal não existe no workspace", async () => {
    const deps = makeDeps();
    deps.update.mockResolvedValue(false);

    expect(await updateChannel({ name: "X", accessToken: "" }, ctx, deps)).toEqual({
      ok: false,
      error: "channel_not_found",
    });
  });
});

describe("deleteChannel", () => {
  const ctx = { actor: ADMIN, channelId: CHANNEL_ID } as const;

  it("remove o canal", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    expect(await deleteChannel(ctx, remove)).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(CHANNEL_ID);
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["role que só usa as Conversas", actorWith("inbox.use"), "forbidden"],
  ] as const)("recusa quando o autor é %s", async (_label, actor, error) => {
    const remove = vi.fn().mockResolvedValue(true);

    expect(await deleteChannel({ ...ctx, actor }, remove)).toEqual({ ok: false, error });
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("retorna channel_not_found quando não há channelId (%j)", async (channelId) => {
    const remove = vi.fn().mockResolvedValue(true);

    expect(await deleteChannel({ ...ctx, channelId }, remove)).toEqual({ ok: false, error: "channel_not_found" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("retorna channel_not_found quando o canal não existe no workspace", async () => {
    const remove = vi.fn().mockResolvedValue(false);

    expect(await deleteChannel(ctx, remove)).toEqual({ ok: false, error: "channel_not_found" });
  });
});
