import type { Actor, Permission } from "@/lib/permissions";

// Acessos usados nos testes: o administrador pode tudo; os demais, só o que a role libera.
export const ADMIN: Actor = { admin: true };

export function actorWith(...permissions: Permission[]): Actor {
  return { admin: false, permissions, pages: { workspace: ["home"], unit: [] } };
}

// Role sem nenhuma permissão de ação.
export const STAFF: Actor = actorWith();
