import { describe, it, expect, vi } from "vitest";
import { createUra, deleteUra, saveUra, setUraActive } from "@/lib/ura";

const URA_ID = "64b7f0c2a1b2c3d4e5f60792";

const graph = {
  nodes: [
    { id: "start", type: "start", position: { x: 0, y: 0 }, data: {} },
    { id: "oi", type: "sendMessage", position: { x: 0, y: 120 }, data: { text: "Olá!" } },
  ],
  edges: [{ id: "e1", source: "start", target: "oi", sourceHandle: "default" }],
};

describe("createUra", () => {
  it("cria a URA inativa, com o nome limpo e só o nó de início", async () => {
    const insert = vi.fn().mockResolvedValue({ id: URA_ID });

    const result = await createUra({ name: "  Boas-vindas  " }, { actorRole: "admin" }, insert);

    expect(result).toEqual({ ok: true, uraId: URA_ID });
    expect(insert).toHaveBeenCalledWith({
      name: "Boas-vindas",
      active: false,
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, data: { trigger: "new_conversation", keywords: [], channelIds: [] } },
      ],
      edges: [],
    });
  });

  it("o proprietário também pode criar", async () => {
    const insert = vi.fn().mockResolvedValue({ id: URA_ID });
    expect(await createUra({ name: "X" }, { actorRole: "owner" }, insert)).toEqual({ ok: true, uraId: URA_ID });
  });

  it.each([
    [{ name: "" }, "invalid_name"],
    [{ name: "   " }, "invalid_name"],
    [{ name: "x".repeat(61) }, "name_too_long"],
    [{}, "invalid_input"],
    [null, "invalid_input"],
  ])("recusa %j com %s", async (input, error) => {
    const insert = vi.fn();
    expect(await createUra(input, { actorRole: "admin" }, insert)).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });

  it("recusa quem não gerencia o workspace e quem não tem acesso", async () => {
    const insert = vi.fn();
    expect(await createUra({ name: "X" }, { actorRole: "receptionist" }, insert)).toEqual({ ok: false, error: "forbidden" });
    expect(await createUra({ name: "X" }, { actorRole: "massage_therapist" }, insert)).toEqual({ ok: false, error: "forbidden" });
    expect(await createUra({ name: "X" }, { actorRole: null }, insert)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("saveUra", () => {
  it("valida e salva nome e fluxo normalizados", async () => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await saveUra({ name: " Agendamento ", graph }, { actorRole: "admin", uraId: URA_ID }, update);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(URA_ID, {
      name: "Agendamento",
      nodes: [
        graph.nodes[0] && { ...graph.nodes[0], data: { trigger: "new_conversation", keywords: [], channelIds: [] } },
        { ...graph.nodes[1], data: { text: "Olá!" } },
      ],
      edges: graph.edges,
    });
  });

  it("repassa os erros do fluxo", async () => {
    const update = vi.fn();
    const noStart = { nodes: [graph.nodes[1]], edges: [] };
    expect(await saveUra({ name: "X", graph: noStart }, { actorRole: "admin", uraId: URA_ID }, update)).toEqual({
      ok: false,
      error: "missing_start",
    });
    expect(await saveUra({ name: "X", graph: "x" }, { actorRole: "admin", uraId: URA_ID }, update)).toEqual({
      ok: false,
      error: "invalid_graph",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("recusa nome inválido, falta de permissão e URA inexistente", async () => {
    const update = vi.fn().mockResolvedValue(false);
    expect(await saveUra({ name: "", graph }, { actorRole: "admin", uraId: URA_ID }, update)).toEqual({ ok: false, error: "invalid_name" });
    expect(await saveUra({ name: "X", graph }, { actorRole: "receptionist", uraId: URA_ID }, update)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await saveUra({ name: "X", graph }, { actorRole: "admin", uraId: null }, update)).toEqual({ ok: false, error: "ura_not_found" });
    expect(await saveUra({ name: "X", graph }, { actorRole: "admin", uraId: URA_ID }, update)).toEqual({ ok: false, error: "ura_not_found" });
  });
});

describe("setUraActive", () => {
  it("ativa e desativa", async () => {
    const update = vi.fn().mockResolvedValue(true);
    expect(await setUraActive(true, { actorRole: "owner", uraId: URA_ID }, update)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(URA_ID, true);
  });

  it("recusa sem permissão ou URA inexistente", async () => {
    const update = vi.fn().mockResolvedValue(false);
    expect(await setUraActive(true, { actorRole: "receptionist", uraId: URA_ID }, update)).toEqual({ ok: false, error: "forbidden" });
    expect(await setUraActive(true, { actorRole: "admin", uraId: URA_ID }, update)).toEqual({ ok: false, error: "ura_not_found" });
  });
});

describe("deleteUra", () => {
  it("exclui a URA", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    expect(await deleteUra({ actorRole: "admin", uraId: URA_ID }, remove)).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(URA_ID);
  });

  it("recusa sem permissão ou URA inexistente", async () => {
    const remove = vi.fn().mockResolvedValue(false);
    expect(await deleteUra({ actorRole: "massage_therapist", uraId: URA_ID }, remove)).toEqual({ ok: false, error: "forbidden" });
    expect(await deleteUra({ actorRole: "admin", uraId: null }, remove)).toEqual({ ok: false, error: "ura_not_found" });
    expect(await deleteUra({ actorRole: "admin", uraId: URA_ID }, remove)).toEqual({ ok: false, error: "ura_not_found" });
  });
});
