import { z } from "zod";
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const emailSchema = z
  .string({ error: "invalid_input" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "invalid_email" }));

export const roleInputSchema = z.object(
  { roleId: z.string({ error: "invalid_role" }).min(1, { error: "invalid_role" }) },
  { error: "invalid_input" },
);

export type FoundRole = { id: string; admin: boolean };

export type ActorError = "workspace_not_found" | "forbidden";

export function checkActor(actor: Actor | null): ActorError | null {
  if (!actor) return "workspace_not_found";
  return can(actor, "users.manage") ? null : "forbidden";
}
