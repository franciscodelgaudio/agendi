const MAX_NAME_LENGTH = 80;

export type UpdateProfileError = "unauthenticated" | "invalid_input" | "invalid_name" | "name_too_long";

export type UpdateProfileResult = { ok: true } | { ok: false; error: UpdateProfileError };

// O nome é da conta: muda em todos os workspaces da pessoa.
export async function updateProfile(
  input: unknown,
  userId: string | null,
  deps: { update: (userId: string, data: { name: string }) => Promise<void> },
): Promise<UpdateProfileResult> {
  if (!userId) return { ok: false, error: "unauthenticated" };

  const { name } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  await deps.update(userId, { name: normalizedName });
  return { ok: true };
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" }
  // workspaces: nomes dos workspaces que ficariam sem administrador.
  | { ok: false; error: "last_admin"; workspaces: string[] };

type DeleteAccountDeps = {
  // Workspaces em que o usuário é administrador ativo.
  listAdminWorkspaces: (userId: string) => Promise<{ id: string; name: string }[]>;
  // Administradores que já aceitaram o convite, contando o próprio usuário.
  countActiveAdmins: (workspaceId: string) => Promise<number>;
  // Apaga a conta e os vínculos dela com os workspaces.
  deleteUser: (userId: string) => Promise<void>;
};

// Nenhum workspace pode ficar sem administrador: quem é o único precisa passar o cargo antes.
export async function deleteAccount(userId: string | null, deps: DeleteAccountDeps): Promise<DeleteAccountResult> {
  if (!userId) return { ok: false, error: "unauthenticated" };

  const adminIn = await deps.listAdminWorkspaces(userId);
  const counts = await Promise.all(adminIn.map((workspace) => deps.countActiveAdmins(workspace.id)));
  const soleAdminOf = adminIn.filter((_, i) => counts[i] <= 1).map((workspace) => workspace.name);
  if (soleAdminOf.length > 0) return { ok: false, error: "last_admin", workspaces: soleAdminOf };

  await deps.deleteUser(userId);
  return { ok: true };
}
