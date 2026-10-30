import { issueCode } from "@/service/_shared/validation";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import {
  checkActor,
  roleInputSchema,
  type ActorError,
  type FoundRole,
} from "@/service/workspace/[workspaceId]/users/member-input";

type FoundMember = { id: string; admin: boolean };

async function checkAdminChange(
  member: FoundMember,
  toAdmin: boolean,
  actor: Actor,
  countAdmins: () => Promise<number>,
): Promise<"forbidden" | "last_admin" | null> {
  if ((member.admin || toAdmin) && !actor.admin) return "forbidden";
  if (member.admin && !toAdmin && (await countAdmins()) <= 1) return "last_admin";
  return null;
}

export type UpdateMemberError = ActorError | "member_not_found" | "invalid_input" | "invalid_role" | "last_admin";

export type UpdateMemberResult = { ok: true } | { ok: false; error: UpdateMemberError };

export async function updateMember(
  input: unknown,
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findMember: (memberId: string) => Promise<FoundMember | null>;
    findRole: (roleId: string) => Promise<FoundRole | null>;
    countAdmins: () => Promise<number>;
    update: (memberId: string, data: { roleId: string }) => Promise<void>;
  },
): Promise<UpdateMemberResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!memberId) return { ok: false, error: "member_not_found" };

  const parsed = roleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<UpdateMemberError>(parsed.error) };
  const role = await deps.findRole(parsed.data.roleId);
  if (!role) return { ok: false, error: "invalid_role" };

  const member = await deps.findMember(memberId);
  if (!member) return { ok: false, error: "member_not_found" };
  const adminError = await checkAdminChange(member, role.admin, ctx.actor!, deps.countAdmins);
  if (adminError) return { ok: false, error: adminError };

  await deps.update(memberId, { roleId: role.id });
  return { ok: true };
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: ActorError | "member_not_found" | "last_admin" };

export async function removeMember(
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    findMember: (memberId: string) => Promise<FoundMember | null>;
    countAdmins: () => Promise<number>;
    remove: (memberId: string) => Promise<void>;
  },
): Promise<RemoveMemberResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!memberId) return { ok: false, error: "member_not_found" };

  const member = await deps.findMember(memberId);
  if (!member) return { ok: false, error: "member_not_found" };
  const adminError = await checkAdminChange(member, false, ctx.actor!, deps.countAdmins);
  if (adminError) return { ok: false, error: adminError };

  await deps.remove(memberId);
  return { ok: true };
}
