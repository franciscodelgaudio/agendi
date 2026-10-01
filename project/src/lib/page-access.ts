import type { Actor } from "@/lib/permissions";

// Sem dependências de servidor: também é importado por componentes de cliente.
// Páginas do sistema (sidebar) e abas da unidade que cada role pode ver; o administrador
// sempre vê tudo. A ordem é a da navegação.
export const WORKSPACE_PAGES = ["home", "units", "calendar", "cash_flow", "team", "users"] as const;
export const UNIT_PAGES = ["overview", "services", "calendar", "appointments", "stock", "team", "cash_flow"] as const;

export type WorkspacePage = (typeof WORKSPACE_PAGES)[number];
export type UnitPage = (typeof UNIT_PAGES)[number];

// Segmento de cada página depois de /workspace/[id] e de /workspace/[id]/unit/[unitId].
export const WORKSPACE_PAGE_PATHS: Record<WorkspacePage, string> = {
  home: "",
  units: "/unit",
  calendar: "/calendar",
  cash_flow: "/cash-flow",
  team: "/team",
  users: "/users",
};
export const UNIT_PAGE_PATHS: Record<UnitPage, string> = {
  overview: "",
  services: "/services",
  calendar: "/calendar",
  appointments: "/appointments",
  stock: "/stock",
  team: "/team",
  cash_flow: "/cash-flow",
};

export type RolePages = { workspace: WorkspacePage[]; unit: UnitPage[] };

export function visiblePages(actor: Actor): RolePages {
  if (actor.admin) return { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] };
  return {
    workspace: WORKSPACE_PAGES.filter((page) => actor.pages.workspace.includes(page)),
    unit: UNIT_PAGES.filter((page) => actor.pages.unit.includes(page)),
  };
}
