import { describe, it, expect } from "vitest";
import { UNIT_PAGES, WORKSPACE_PAGE_PATHS, WORKSPACE_PAGES, visiblePages } from "@/service/workspace/[workspaceId]/page-access";

const ALL = { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] };

describe("visiblePages", () => {
  it("administrador vê todas as páginas", () => {
    expect(visiblePages({ admin: true })).toEqual(ALL);
  });

  it("membro vê só as páginas liberadas na role, na ordem do catálogo", () => {
    const actor = {
      admin: false,
      permissions: [],
      pages: { workspace: ["users", "home", "calendar"], unit: ["stock", "overview"] },
    } as const;

    expect(visiblePages(actor)).toEqual({
      workspace: ["home", "calendar", "users"],
      unit: ["overview", "stock"],
    });
  });

  it("ignora páginas que não estão mais no catálogo", () => {
    const actor = { admin: false, permissions: [], pages: { workspace: ["home", "billing"], unit: ["reports"] } } as const;

    expect(visiblePages(actor)).toEqual({ workspace: ["home"], unit: [] });
  });
});

describe("WORKSPACE_PAGES", () => {
  it("tem o estoque de todas as unidades depois da equipe, em /stock", () => {
    expect(WORKSPACE_PAGES).toEqual(["home", "units", "calendar", "cash_flow", "team", "stock", "users"]);
    expect(WORKSPACE_PAGE_PATHS.stock).toBe("/stock");
  });
});
