import { describe, it, expect, vi } from "vitest";
import { UNIT_PAGES, WORKSPACE_PAGES, updatePageAccess, visiblePages } from "@/lib/page-access";

const ALL = { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] };

describe("visiblePages", () => {
  const hidden = {
    massage_therapist: { workspace: ["users", "units"], unit: ["cash_flow", "stock"] },
    receptionist: { workspace: ["home"], unit: ["team"] },
  } as const;

  it.each(["owner", "admin"] as const)("%s vê todas as páginas, mesmo com restrições salvas", (role) => {
    expect(visiblePages(role, hidden)).toEqual(ALL);
  });

  it.each(["massage_therapist", "receptionist"] as const)("%s sem configuração vê todas as páginas", (role) => {
    expect(visiblePages(role, null)).toEqual(ALL);
    expect(visiblePages(role, undefined)).toEqual(ALL);
    expect(visiblePages(role, {})).toEqual(ALL);
  });

  it("tira as páginas ocultas da função, mantendo a ordem do catálogo", () => {
    expect(visiblePages("massage_therapist", hidden)).toEqual({
      workspace: ["home", "calendar"],
      unit: ["overview", "services", "calendar", "appointments", "team"],
    });
  });

  it("aplica só a configuração da própria função", () => {
    expect(visiblePages("receptionist", hidden)).toEqual({
      workspace: ["units", "calendar", "users"],
      unit: ["overview", "services", "calendar", "appointments", "stock", "cash_flow"],
    });
  });

  it("aceita configuração parcial (só um dos escopos salvo)", () => {
    expect(visiblePages("receptionist", { receptionist: { unit: ["overview"] } })).toEqual({
      workspace: [...WORKSPACE_PAGES],
      unit: ["services", "calendar", "appointments", "stock", "team", "cash_flow"],
    });
  });
});

describe("updatePageAccess", () => {
  // Input = páginas marcadas como visíveis; o que vai para o banco = as ocultas.
  const input = {
    massage_therapist: { workspace: ["home", "calendar"], unit: ["calendar", "appointments"] },
    receptionist: { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] },
  };

  it.each(["owner", "admin"] as const)("%s salva as páginas ocultas de cada função", async (actorRole) => {
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await updatePageAccess(input, { actorRole }, save);

    expect(result).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({
      massage_therapist: {
        workspace: ["units", "users"],
        unit: ["overview", "services", "stock", "team", "cash_flow"],
      },
      receptionist: { workspace: [], unit: [] },
    });
  });

  it("ignora páginas repetidas", async () => {
    const save = vi.fn().mockResolvedValue(undefined);

    await updatePageAccess(
      {
        massage_therapist: { workspace: ["home", "home", ...WORKSPACE_PAGES], unit: [] },
        receptionist: { workspace: ["units", "units"], unit: ["team", "team"] },
      },
      { actorRole: "owner" },
      save,
    );

    expect(save).toHaveBeenCalledWith({
      massage_therapist: { workspace: [], unit: [...UNIT_PAGES] },
      receptionist: {
        workspace: ["home", "calendar", "users"],
        unit: ["overview", "services", "calendar", "appointments", "stock", "cash_flow"],
      },
    });
  });

  it("permite ocultar todas as abas da unidade", async () => {
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await updatePageAccess(
      { ...input, receptionist: { workspace: ["home"], unit: [] } },
      { actorRole: "owner" },
      save,
    );

    expect(result).toEqual({ ok: true });
    expect(save.mock.calls[0][0].receptionist.unit).toEqual([...UNIT_PAGES]);
  });

  it.each([
    [null, "workspace_not_found"],
    ["massage_therapist", "forbidden"],
    ["receptionist", "forbidden"],
  ] as const)("com a função %s retorna %s sem salvar", async (actorRole, error) => {
    const save = vi.fn();

    const result = await updatePageAccess(input, { actorRole }, save);

    expect(result).toEqual({ ok: false, error });
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["input nulo", null],
    ["input não é objeto", "x"],
    ["função ausente", { massage_therapist: input.massage_therapist }],
    ["escopo ausente", { ...input, receptionist: { workspace: ["home"] } }],
    ["lista não é array", { ...input, receptionist: { workspace: "home", unit: [] } }],
    ["página desconhecida", { ...input, receptionist: { workspace: ["home", "billing"], unit: [] } }],
    ["página de unidade no escopo do sistema", { ...input, receptionist: { workspace: ["home", "stock"], unit: [] } }],
    ["item que não é string", { ...input, receptionist: { workspace: ["home", 1], unit: [] } }],
  ])("retorna invalid_input sem salvar quando %s", async (_label, value) => {
    const save = vi.fn();

    const result = await updatePageAccess(value, { actorRole: "owner" }, save);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(save).not.toHaveBeenCalled();
  });

  it("exige ao menos uma página do sistema liberada para cada função", async () => {
    const save = vi.fn();

    const result = await updatePageAccess(
      { ...input, massage_therapist: { workspace: [], unit: [...UNIT_PAGES] } },
      { actorRole: "owner" },
      save,
    );

    expect(result).toEqual({ ok: false, error: "no_workspace_page" });
    expect(save).not.toHaveBeenCalled();
  });
});
