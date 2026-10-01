// Sem dependências de servidor: também é importado por componentes de cliente.
// Permissões que o administrador marca para cada role na tela de Permissões. A ordem é a da
// tela. "attends" = realiza atendimentos: aparece como terapeuta e ganha comissão sobre os
// próprios serviços.
export const PERMISSIONS = [
  "units.manage",
  "services.manage",
  "bookings.manage",
  "appointments.manage",
  "stock.manage",
  "cash_flow.manage",
  "team.manage",
  "users.manage",
  "inbox.use",
  "channels.manage",
  "uras.manage",
  "agenia.use",
  "workspace.manage",
  "attends",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Acesso do usuário no workspace. O administrador é fixo e pode tudo; os demais têm o que
// a própria role libera (páginas como estão salvas, filtradas pelo catálogo ao usar).
export type Actor =
  | { admin: true }
  | {
      admin: false;
      permissions: readonly Permission[];
      pages: { readonly workspace: readonly string[]; readonly unit: readonly string[] };
    };

export function can(actor: Actor | null, permission: Permission) {
  if (!actor) return false;
  return actor.admin || actor.permissions.includes(permission);
}

// Nome do papel fixo na interface.
export const ADMIN_ROLE_NAME = "Administrador";
