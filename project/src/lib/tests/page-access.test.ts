import { describe, it, expect } from "vitest";
import { UNIT_PAGE_PATHS, UNIT_PAGES, WORKSPACE_PAGE_PATHS, WORKSPACE_PAGES, visiblePages } from "@/service/workspace/[workspaceId]/page-access";

const ALL = { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] };

describe("visiblePages", () => {
  it("administrador vê todas as páginas", () => {
    expect(visiblePages({ admin: true })).toEqual(ALL);
  });

  it("membro vê só as páginas liberadas na role, na ordem do catálogo", () => {
    const actor = {
      admin: false,
      permissions: [],
      pages: { workspace: ["users", "home", "calendar"], unit: ["appointments", "overview"] },
    } as const;

    expect(visiblePages(actor)).toEqual({
      workspace: ["home", "calendar", "users"],
      unit: ["overview", "appointments"],
    });
  });

  it("ignora páginas que não estão mais no catálogo", () => {
    const actor = {
      admin: false,
      permissions: [],
      pages: { workspace: ["home", "billing"], unit: ["reports", "stock", "cash_flow"] },
    } as const;

    expect(visiblePages(actor)).toEqual({ workspace: ["home"], unit: [] });
  });
});

describe("WORKSPACE_PAGES", () => {
  it("tem clientes do workspace, as carteiras em /cash-flow e os inventários em /stock", () => {
    expect(WORKSPACE_PAGES).toEqual(["home", "units", "calendar", "customers", "cash_flow", "stock", "users"]);
    expect(WORKSPACE_PAGE_PATHS.customers).toBe("/customers");
    expect(WORKSPACE_PAGE_PATHS.cash_flow).toBe("/cash-flow");
    expect(WORKSPACE_PAGE_PATHS.stock).toBe("/stock");
  });
});

describe("UNIT_PAGES", () => {
  it("a unidade tem a aba de serviços em /services e não tem abas de caixa nem estoque", () => {
    expect(UNIT_PAGES).toEqual(["overview", "calendar", "appointments", "services"]);
    expect(UNIT_PAGE_PATHS.services).toBe("/services");
  });
});
