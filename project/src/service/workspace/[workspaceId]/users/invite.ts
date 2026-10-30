import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import {
  checkActor,
  emailSchema,
  roleInputSchema,
  type ActorError,
  type FoundRole,
} from "@/service/workspace/[workspaceId]/users/member-input";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const createInviteSchema = z.object(
  { email: emailSchema, roleId: roleInputSchema.shape.roleId },
  { error: "invalid_input" },
);
const tokenSchema = z.string().min(1);

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type FoundInvite = { id: string; admin: boolean };

export type CreateInviteError =
  | ActorError
  | "invalid_input"
  | "invalid_email"
  | "invalid_role"
  | "already_member"
  | "email_failed";

export type CreateInviteResult = { ok: true; inviteId: string } | { ok: false; error: CreateInviteError };

type CreateInviteDeps = {
  isAlreadyInWorkspace: (email: string) => Promise<boolean>;
  findRole: (roleId: string) => Promise<FoundRole | null>;
  insertInvite: (data: {
    workspaceId: string;
    email: string;
    roleId: string;
    tokenHash: string;
    expiresAt: Date;
  }) => Promise<{ id: string }>;
  deleteInvite: (inviteId: string) => Promise<void>;
  sendInvite: (data: { email: string; token: string }) => Promise<void>;
  now: () => Date;
};

export async function createInvite(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: CreateInviteDeps,
): Promise<CreateInviteResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };

  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<CreateInviteError>(parsed.error) };
  const { email } = parsed.data;

  const role = await deps.findRole(parsed.data.roleId);
  if (!role) return { ok: false, error: "invalid_role" };
  if (role.admin && !ctx.actor!.admin) return { ok: false, error: "forbidden" };

  if (await deps.isAlreadyInWorkspace(email)) return { ok: false, error: "already_member" };

  const token = randomBytes(32).toString("base64url");
  const invite = await deps.insertInvite({
    workspaceId: ctx.workspaceId,
    email,
    roleId: role.id,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(deps.now().getTime() + INVITE_TTL_MS),
  });

  try {
    await deps.sendInvite({ email, token });
  } catch {
    await deps.deleteInvite(invite.id);
    return { ok: false, error: "email_failed" };
  }

  return { ok: true, inviteId: invite.id };
}

export type AcceptInviteError = "unauthenticated" | "invalid_invite" | "invite_expired" | "email_mismatch";

export type AcceptInviteResult = { ok: true; workspaceId: string } | { ok: false; error: AcceptInviteError };

type AcceptInviteDeps = {
  findInviteByTokenHash: (
    tokenHash: string,
  ) => Promise<{ id: string; workspaceId: string; email: string; roleId: string; expiresAt: Date } | null>;
  createMember: (data: { workspaceId: string; userId: string; roleId: string }) => Promise<void>;
  deleteInvite: (inviteId: string) => Promise<void>;
  now: () => Date;
};

export async function acceptInvite(
  token: unknown,
  user: { id: string; email: string } | null,
  deps: AcceptInviteDeps,
): Promise<AcceptInviteResult> {
  if (!user) return { ok: false, error: "unauthenticated" };
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) return { ok: false, error: "invalid_invite" };

  const invite = await deps.findInviteByTokenHash(hashInviteToken(parsedToken.data));
  if (!invite) return { ok: false, error: "invalid_invite" };
  if (invite.expiresAt <= deps.now()) return { ok: false, error: "invite_expired" };
  if (invite.email !== user.email.trim().toLowerCase()) return { ok: false, error: "email_mismatch" };

  await deps.createMember({ workspaceId: invite.workspaceId, userId: user.id, roleId: invite.roleId });
  await deps.deleteInvite(invite.id);
  return { ok: true, workspaceId: invite.workspaceId };
}

function checkAdminInvite(invite: FoundInvite, toAdmin: boolean, actor: Actor) {
  return (invite.admin || toAdmin) && !actor.admin;
}

export type UpdateInviteError = ActorError | "invite_not_found" | "invalid_input" | "invalid_role";

export type UpdateInviteResult = { ok: true } | { ok: false; error: UpdateInviteError };

export async function updateInvite(
  input: unknown,
  inviteId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findInvite: (inviteId: string) => Promise<FoundInvite | null>;
    findRole: (roleId: string) => Promise<FoundRole | null>;
    update: (inviteId: string, data: { roleId: string }) => Promise<void>;
  },
): Promise<UpdateInviteResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!inviteId) return { ok: false, error: "invite_not_found" };

  const parsed = roleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<UpdateInviteError>(parsed.error) };
  const role = await deps.findRole(parsed.data.roleId);
  if (!role) return { ok: false, error: "invalid_role" };

  const invite = await deps.findInvite(inviteId);
  if (!invite) return { ok: false, error: "invite_not_found" };
  if (checkAdminInvite(invite, role.admin, ctx.actor!)) return { ok: false, error: "forbidden" };

  await deps.update(inviteId, { roleId: role.id });
  return { ok: true };
}

export type CancelInviteResult = { ok: true } | { ok: false; error: ActorError | "invite_not_found" };

export async function cancelInvite(
  inviteId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findInvite: (inviteId: string) => Promise<FoundInvite | null>;
    remove: (inviteId: string) => Promise<void>;
  },
): Promise<CancelInviteResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!inviteId) return { ok: false, error: "invite_not_found" };

  const invite = await deps.findInvite(inviteId);
  if (!invite) return { ok: false, error: "invite_not_found" };
  if (checkAdminInvite(invite, false, ctx.actor!)) return { ok: false, error: "forbidden" };

  await deps.remove(inviteId);
  return { ok: true };
}
