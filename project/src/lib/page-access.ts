import { canManageMembers, type WorkspaceRole } from "@/lib/member-role";

// Sem dependências de servidor: também é importado por componentes de cliente.
// Páginas do sistema (sidebar) e abas da unidade que o proprietário e administradores
// podem ocultar de massagistas e recepcionistas. A ordem é a da navegação.
export const WORKSPACE_PAGES = ["home", "units", "calendar", "cash_flow", "users"] as const;
export const UNIT_PAGES = ["overview", "services", "calendar", "appointments", "stock", "team", "cash_flow"] as const;
export const RESTRICTED_ROLES = ["massage_therapist", "receptionist"] as const;

export type WorkspacePage = (typeof WORKSPACE_PAGES)[number];
export type UnitPage = (typeof UNIT_PAGES)[number];
export type RestrictedRole = (typeof RESTRICTED_ROLES)[number];

// Segmento de cada página depois de /workspace/[id] e de /workspace/[id]/unit/[unitId].
export const WORKSPACE_PAGE_PATHS: Record<WorkspacePage, string> = {
  home: "",
  units: "/unit",
  calendar: "/calendar",
  cash_flow: "/cash-flow",
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

type RolePages<W = WorkspacePage, U = UnitPage> = { workspace: W[]; unit: U[] };

// Guarda só o que está oculto: sem configuração, tudo fica liberado.
export type HiddenPages = {
  readonly [R in RestrictedRole]?: { readonly workspace?: readonly string[]; readonly unit?: readonly string[] };
};

export function visiblePages(role: WorkspaceRole, hidden: HiddenPages | null | undefined): RolePages {
  const config = canManageMembers(role) ? undefined : hidden?.[role as RestrictedRole];
  return {
    workspace: WORKSPACE_PAGES.filter((page) => !config?.workspace?.includes(page)),
    unit: UNIT_PAGES.filter((page) => !config?.unit?.includes(page)),
  };
}

export type UpdatePageAccessError = "workspace_not_found" | "forbidden" | "invalid_input" | "no_workspace_page";

export type UpdatePageAccessResult = { ok: true } | { ok: false; error: UpdatePageAccessError };

// null quando não é uma lista de páginas do catálogo.
function parseVisible<P extends string>(value: unknown, catalog: readonly P[]): P[] | null {
  if (!Array.isArray(value) || !value.every((page) => catalog.includes(page))) return null;
  return value;
}

// input: páginas marcadas como visíveis, por função e escopo; save recebe as ocultas.
export async function updatePageAccess(
  input: unknown,
  ctx: { actorRole: WorkspaceRole | null },
  save: (hidden: Record<RestrictedRole, RolePages>) => Promise<void>,
): Promise<UpdatePageAccessResult> {
  if (!ctx.actorRole) return { ok: false, error: "workspace_not_found" };
  if (!canManageMembers(ctx.actorRole)) return { ok: false, error: "forbidden" };
  if (input == null || typeof input !== "object") return { ok: false, error: "invalid_input" };

  const hidden = {} as Record<RestrictedRole, RolePages>;
  for (const role of RESTRICTED_ROLES) {
    const entry = (input as Record<string, unknown>)[role];
    if (entry == null || typeof entry !== "object") return { ok: false, error: "invalid_input" };
    const { workspace, unit } = entry as Record<string, unknown>;
    const visibleWorkspace = parseVisible(workspace, WORKSPACE_PAGES);
    const visibleUnit = parseVisible(unit, UNIT_PAGES);
    if (!visibleWorkspace || !visibleUnit) return { ok: false, error: "invalid_input" };
    if (visibleWorkspace.length === 0) return { ok: false, error: "no_workspace_page" };
    hidden[role] = {
      workspace: WORKSPACE_PAGES.filter((page) => !visibleWorkspace.includes(page)),
      unit: UNIT_PAGES.filter((page) => !visibleUnit.includes(page)),
    };
  }

  await save(hidden);
  return { ok: true };
}
