import { describe, it, expect, vi } from "vitest";
import {
  AGENIA_MODELS,
  availableAgeniaModels,
  configuredProviders,
  resolveAgeniaModel,
  updateAgeniaModel,
} from "@/service/workspace/[workspaceId]/agenia/agenia-models";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("catálogo", () => {
  it("tem modelos do Gemini e do Groq, com id provedor:modelo", () => {
    expect(AGENIA_MODELS.some((m) => m.provider === "google")).toBe(true);
    expect(AGENIA_MODELS.some((m) => m.provider === "groq")).toBe(true);
    for (const m of AGENIA_MODELS) {
      expect(m.id).toBe(`${m.provider}:${m.model}`);
      expect(m.label.length).toBeGreaterThan(0);
    }
    expect(new Set(AGENIA_MODELS.map((m) => m.id)).size).toBe(AGENIA_MODELS.length);
  });

  it("o primeiro modelo é o Gemini Flash-Lite (padrão)", () => {
    expect(AGENIA_MODELS[0].id).toBe("google:gemini-flash-lite-latest");
  });
});

describe("configuredProviders", () => {
  it("lista só os provedores com chave definida", () => {
    expect(configuredProviders({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" })).toEqual(["google", "groq"]);
    expect(configuredProviders({ GROQ_API_KEY: "q" })).toEqual(["groq"]);
    expect(configuredProviders({ GEMINI_API_KEY: "", GROQ_API_KEY: "   " })).toEqual([]);
    expect(configuredProviders({})).toEqual([]);
  });
});

describe("availableAgeniaModels", () => {
  it("filtra o catálogo pelos provedores configurados, mantendo a ordem", () => {
    const groq = availableAgeniaModels(["groq"]);
    expect(groq.length).toBeGreaterThan(0);
    expect(groq.every((m) => m.provider === "groq")).toBe(true);
    expect(availableAgeniaModels(["google", "groq"])).toEqual(AGENIA_MODELS);
    expect(availableAgeniaModels([])).toEqual([]);
  });
});

describe("resolveAgeniaModel", () => {
  const groqModel = AGENIA_MODELS.find((m) => m.provider === "groq")!;

  it("usa o modelo salvo quando o provedor dele está configurado", () => {
    expect(resolveAgeniaModel(groqModel.id, ["google", "groq"])).toEqual(groqModel);
  });

  it("sem modelo salvo, usa o primeiro disponível", () => {
    expect(resolveAgeniaModel(null, ["google", "groq"])).toEqual(AGENIA_MODELS[0]);
    expect(resolveAgeniaModel(undefined, ["groq"])).toEqual(groqModel);
  });

  it("modelo salvo sem chave do provedor ou fora do catálogo cai no primeiro disponível", () => {
    expect(resolveAgeniaModel(groqModel.id, ["google"])).toEqual(AGENIA_MODELS[0]);
    expect(resolveAgeniaModel("google:modelo-x", ["google"])).toEqual(AGENIA_MODELS[0]);
  });

  it("sem nenhum provedor configurado devolve null", () => {
    expect(resolveAgeniaModel(AGENIA_MODELS[0].id, [])).toBeNull();
  });
});

describe("updateAgeniaModel", () => {
  const groqModel = AGENIA_MODELS.find((m) => m.provider === "groq")!;

  it("salva o modelo escolhido", async () => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await updateAgeniaModel(groqModel.id, WORKSPACE_ID, ["google", "groq"], update);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(WORKSPACE_ID, groqModel.id);
  });

  it.each([undefined, null, 42, "", "google:modelo-x"])("recusa modelo fora do catálogo (%j)", async (input) => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await updateAgeniaModel(input, WORKSPACE_ID, ["google", "groq"], update);

    expect(result).toEqual({ ok: false, error: "invalid_model" });
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa modelo de provedor sem chave configurada", async () => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await updateAgeniaModel(groqModel.id, WORKSPACE_ID, ["google"], update);

    expect(result).toEqual({ ok: false, error: "provider_not_configured" });
    expect(update).not.toHaveBeenCalled();
  });

  it("sem workspace (ou sem permissão) não salva", async () => {
    const update = vi.fn().mockResolvedValue(true);

    expect(await updateAgeniaModel(groqModel.id, null, ["groq"], update)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("workspace que não existe mais", async () => {
    const update = vi.fn().mockResolvedValue(false);

    expect(await updateAgeniaModel(groqModel.id, WORKSPACE_ID, ["groq"], update)).toEqual({ ok: false, error: "workspace_not_found" });
  });
});
