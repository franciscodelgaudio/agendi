import { describe, it, expect } from "vitest";
import { UNIT_PAGES, WORKSPACE_PAGES, visiblePages } from "@/lib/page-access";

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
