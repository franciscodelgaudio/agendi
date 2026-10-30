import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";

export const MAX_NAME_LENGTH = 80;

const profileSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
  },
  { error: "invalid_input" },
);

export type UpdateProfileError = "unauthenticated" | "invalid_input" | "invalid_name" | "name_too_long";

export type UpdateProfileResult = { ok: true } | { ok: false; error: UpdateProfileError };

export async function updateProfile(
  input: unknown,
  userId: string | null,
  deps: { update: (userId: string, data: { name: string }) => Promise<void> },
): Promise<UpdateProfileResult> {
  if (!userId) return { ok: false, error: "unauthenticated" };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<UpdateProfileError>(parsed.error) };

  await deps.update(userId, { name: parsed.data.name });
  return { ok: true };
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" }
  | { ok: false; error: "last_admin"; workspaces: string[] };

export async function deleteAccount(
  userId: string | null,
  deps: {
    listAdminWorkspaces: (userId: string) => Promise<{ id: string; name: string }[]>;
    countAdmins: (workspaceId: string) => Promise<number>;
    deleteUser: (userId: string) => Promise<void>;
  },
): Promise<DeleteAccountResult> {
  if (!userId) return { ok: false, error: "unauthenticated" };

  const adminIn = await deps.listAdminWorkspaces(userId);
  const counts = await Promise.all(adminIn.map((workspace) => deps.countAdmins(workspace.id)));
  const soleAdminOf = adminIn.filter((_, i) => counts[i] <= 1).map((workspace) => workspace.name);
  if (soleAdminOf.length > 0) return { ok: false, error: "last_admin", workspaces: soleAdminOf };

  await deps.deleteUser(userId);
  return { ok: true };
}
