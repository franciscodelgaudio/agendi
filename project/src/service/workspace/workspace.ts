import { isHttpUrl } from "@/service/workspace/[workspaceId]/unit/unit";

const MAX_NAME_LENGTH = 80;

export type UpdateWorkspaceError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_avatar_url"
  | "workspace_not_found";

export type UpdateWorkspaceResult = { ok: true } | { ok: false; error: UpdateWorkspaceError };

// avatarUrl vazia vira null; update devolve false quando o workspace não existe.
export async function updateWorkspace(
  input: unknown,
  workspaceId: string | null | undefined,
  update: (workspaceId: string, data: { name: string; avatarUrl: string | null }) => Promise<boolean>,
): Promise<UpdateWorkspaceResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const { name, avatarUrl } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  if (avatarUrl != null && typeof avatarUrl !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const normalizedAvatarUrl = avatarUrl?.trim() || null;
  if (normalizedAvatarUrl && !isHttpUrl(normalizedAvatarUrl)) {
    return { ok: false, error: "invalid_avatar_url" };
  }

  const found = await update(workspaceId, { name: normalizedName, avatarUrl: normalizedAvatarUrl });
  return found ? { ok: true } : { ok: false, error: "workspace_not_found" };
}
