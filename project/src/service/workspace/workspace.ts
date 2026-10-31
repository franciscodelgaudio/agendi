import { isHttpUrl } from "@/service/workspace/[workspaceId]/unit/unit";

const MAX_NAME_LENGTH = 80;

export type UpdateWorkspaceError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_image_url"
  | "workspace_not_found";

export type UpdateWorkspaceResult = { ok: true } | { ok: false; error: UpdateWorkspaceError };

export type CreateWorkspaceError = "invalid_input" | "invalid_name" | "name_too_long";

export type CreateWorkspaceResult = { ok: true; workspaceId: string } | { ok: false; error: CreateWorkspaceError };

export async function createWorkspace(
  input: unknown,
  userId: string,
  insert: (data: { name: string; userId: string }) => Promise<{ id: string }>,
): Promise<CreateWorkspaceResult> {
  const { name } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const { id } = await insert({ name: normalizedName, userId });
  return { ok: true, workspaceId: id };
}

export async function updateWorkspace(
  input: unknown,
  workspaceId: string | null | undefined,
  update: (workspaceId: string, data: { name: string; imageUrl: string | null }) => Promise<boolean>,
): Promise<UpdateWorkspaceResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const { name, imageUrl } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  if (imageUrl != null && typeof imageUrl !== "string") return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const normalizedImageUrl = imageUrl?.trim() || null;
  if (normalizedImageUrl && !isHttpUrl(normalizedImageUrl)) {
    return { ok: false, error: "invalid_image_url" };
  }

  const found = await update(workspaceId, { name: normalizedName, imageUrl: normalizedImageUrl });
  return found ? { ok: true } : { ok: false, error: "workspace_not_found" };
}
