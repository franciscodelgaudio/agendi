import { UNIT_PAGES, WORKSPACE_PAGES, type RolePages } from "@/service/workspace/[workspaceId]/page-access";
import { PERMISSIONS, type Actor, type Permission } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 40;
// Nome do papel fixo; uma role com o mesmo nome confundiria a lista de usuários.
const ADMIN_NAME = "administrador";

export type RoleSettings = { permissions: Permission[]; pages: RolePages };

type ActorError = "workspace_not_found" | "forbidden";
type NameError = "invalid_input" | "invalid_name" | "name_too_long" | "name_taken";

// Só o administrador define roles: quem gerencia usuários não pode ampliar o próprio acesso.
function checkActor(actor: Actor | null): ActorError | null {
  if (!actor) return "workspace_not_found";
  return actor.admin ? null : "forbidden";
}

function parseName(input: unknown): { name: string } | { error: NameError } {
  const name = (input as Record<string, unknown> | null)?.name;
  if (typeof name !== "string") return { error: "invalid_input" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "invalid_name" };
  if (trimmed.length > MAX_NAME_LENGTH) return { error: "name_too_long" };
  if (trimmed.toLowerCase() === ADMIN_NAME) return { error: "name_taken" };
  return { name: trimmed };
}

export type CreateRoleResult = { ok: true; roleId: string } | { ok: false; error: ActorError | NameError };

export async function createRole(
  input: unknown,
  ctx: { actor: Actor | null },
  deps: {
    isNameTaken: (name: string) => Promise<boolean>;
    create: (data: { name: string } & RoleSettings) => Promise<{ id: string }>;
  },
): Promise<CreateRoleResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  const parsed = parseName(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  if (await deps.isNameTaken(parsed.name)) return { ok: false, error: "name_taken" };

  // Começa vendo tudo e sem poder alterar nada; o administrador ajusta na matriz.
  const role = await deps.create({
    name: parsed.name,
    permissions: [],
    pages: { workspace: [...WORKSPACE_PAGES], unit: [...UNIT_PAGES] },
  });
  return { ok: true, roleId: role.id };
}

export type RenameRoleResult = { ok: true } | { ok: false; error: ActorError | NameError | "role_not_found" };

export async function renameRole(
  input: unknown,
  roleId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    // null quando a role não existe (ou não é do workspace).
    findRole: (roleId: string) => Promise<{ id: string } | null>;
    isNameTaken: (name: string, exceptRoleId: string) => Promise<boolean>;
    rename: (roleId: string, name: string) => Promise<void>;
  },
): Promise<RenameRoleResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!roleId) return { ok: false, error: "role_not_found" };
  const parsed = parseName(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  if (!(await deps.findRole(roleId))) return { ok: false, error: "role_not_found" };
  if (await deps.isNameTaken(parsed.name, roleId)) return { ok: false, error: "name_taken" };

  await deps.rename(roleId, parsed.name);
  return { ok: true };
}

export type DeleteRoleResult = { ok: true } | { ok: false; error: ActorError | "role_not_found" | "role_in_use" };

export async function deleteRole(
  roleId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    // Membros e convites pendentes com a role.
    countMembers: (roleId: string) => Promise<number>;
    // false quando a role não existe (ou não é do workspace).
    remove: (roleId: string) => Promise<boolean>;
  },
): Promise<DeleteRoleResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!roleId) return { ok: false, error: "role_not_found" };
  if ((await deps.countMembers(roleId)) > 0) return { ok: false, error: "role_in_use" };

  return (await deps.remove(roleId)) ? { ok: true } : { ok: false, error: "role_not_found" };
}

export type UpdateRolePermissionsError = ActorError | "invalid_input" | "no_workspace_page";

export type UpdateRolePermissionsResult = { ok: true } | { ok: false; error: UpdateRolePermissionsError };

// Itens do catálogo, sem repetição e na ordem dele; null se algum não for do catálogo.
function parseList<T extends string>(value: unknown, catalog: readonly T[]): T[] | null {
  if (!Array.isArray(value) || !value.every((item) => catalog.includes(item))) return null;
  return catalog.filter((item) => value.includes(item));
}

// input: por id de role, as permissões e as páginas marcadas na matriz. Precisa trazer
// todas as roles do workspace, e só elas.
export async function updateRolePermissions(
  input: unknown,
  ctx: { actor: Actor | null },
  deps: {
    listRoleIds: () => Promise<string[]>;
    save: (settings: Record<string, RoleSettings>) => Promise<void>;
  },
): Promise<UpdateRolePermissionsResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (input == null || typeof input !== "object") return { ok: false, error: "invalid_input" };

  const roleIds = await deps.listRoleIds();
  const entries = input as Record<string, unknown>;
  if (Object.keys(entries).some((id) => !roleIds.includes(id))) return { ok: false, error: "invalid_input" };

  const settings: Record<string, RoleSettings> = {};
  for (const roleId of roleIds) {
    const entry = entries[roleId];
    if (entry == null || typeof entry !== "object") return { ok: false, error: "invalid_input" };
    const { permissions, workspace, unit } = entry as Record<string, unknown>;
    const parsedPermissions = parseList(permissions, PERMISSIONS);
    const parsedWorkspace = parseList(workspace, WORKSPACE_PAGES);
    const parsedUnit = parseList(unit, UNIT_PAGES);
    if (!parsedPermissions || !parsedWorkspace || !parsedUnit) return { ok: false, error: "invalid_input" };
    if (parsedWorkspace.length === 0) return { ok: false, error: "no_workspace_page" };
    settings[roleId] = { permissions: parsedPermissions, pages: { workspace: parsedWorkspace, unit: parsedUnit } };
  }

  await deps.save(settings);
  return { ok: true };
}
