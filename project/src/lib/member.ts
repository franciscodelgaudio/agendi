import { createHash, randomBytes } from "node:crypto";
import { can, type Actor } from "@/lib/permissions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 80;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type ActorError = "workspace_not_found" | "forbidden";

// Sem acesso = 404; com acesso sem permissão = forbidden.
function checkActor(actor: Actor | null): ActorError | null {
  if (!actor) return "workspace_not_found";
  return can(actor, "users.manage") ? null : "forbidden";
}

// "admin" ou o id de uma role do workspace (roleExists confirma); null quando inválido.
async function parseRole(value: unknown, roleExists: (roleId: string) => Promise<boolean>) {
  if (value === "admin") return { admin: true, roleId: null };
  if (typeof value !== "string" || !value || !(await roleExists(value))) return null;
  return { admin: false, roleId: value };
}

type FoundMember = { id: string; userId: string | null; admin: boolean };

// Só um administrador mexe em administradores (inclusive para promover alguém); e sempre
// sobra ao menos um administrador que já aceitou o convite.
async function checkAdminChange(
  member: FoundMember,
  admin: boolean,
  actor: Actor,
  countActiveAdmins: () => Promise<number>,
): Promise<"forbidden" | "last_admin" | null> {
  if ((member.admin || admin) && !actor.admin) return "forbidden";
  if (member.admin && !admin && member.userId && (await countActiveAdmins()) <= 1) return "last_admin";
  return null;
}

export type InviteMemberError =
  | ActorError
  | "invalid_input"
  | "invalid_email"
  | "invalid_role"
  | "already_member"
  | "email_failed";

export type InviteMemberResult =
  | { ok: true; memberId: string }
  | { ok: false; error: InviteMemberError };

type InviteMemberDeps = {
  // true se o email já é de um membro ou de um convite pendente.
  isAlreadyInWorkspace: (email: string) => Promise<boolean>;
  roleExists: (roleId: string) => Promise<boolean>;
  createInvite: (data: {
    workspaceId: string;
    email: string;
    admin: boolean;
    roleId: string | null;
    tokenHash: string;
    expiresAt: Date;
  }) => Promise<{ id: string }>;
  deleteInvite: (inviteId: string) => Promise<void>;
  sendInvite: (data: { email: string; token: string }) => Promise<void>;
  now: () => Date;
};

export async function inviteMember(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: InviteMemberDeps,
): Promise<InviteMemberResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };

  const { email, role } = (input ?? {}) as Record<string, unknown>;
  if (typeof email !== "string") return { ok: false, error: "invalid_input" };

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) return { ok: false, error: "invalid_email" };
  const parsedRole = await parseRole(role, deps.roleExists);
  if (!parsedRole) return { ok: false, error: "invalid_role" };
  if (parsedRole.admin && !ctx.actor!.admin) return { ok: false, error: "forbidden" };

  if (await deps.isAlreadyInWorkspace(normalizedEmail)) return { ok: false, error: "already_member" };

  // Só o hash vai para o banco; o token em si só existe no link do email.
  const token = randomBytes(32).toString("base64url");
  const invite = await deps.createInvite({
    workspaceId: ctx.workspaceId,
    email: normalizedEmail,
    ...parsedRole,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(deps.now().getTime() + INVITE_TTL_MS),
  });

  try {
    await deps.sendInvite({ email: normalizedEmail, token });
  } catch {
    await deps.deleteInvite(invite.id);
    return { ok: false, error: "email_failed" };
  }

  return { ok: true, memberId: invite.id };
}

export type AcceptInviteError = "unauthenticated" | "invalid_invite" | "invite_expired" | "email_mismatch";

export type AcceptInviteResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: AcceptInviteError };

type AcceptInviteDeps = {
  // Só convites pendentes (ainda não aceitos).
  findInviteByTokenHash: (
    tokenHash: string,
  ) => Promise<{ id: string; workspaceId: string; email: string; expiresAt: Date } | null>;
  markAccepted: (inviteId: string, userId: string) => Promise<void>;
  now: () => Date;
};

// O token prova posse do email (o cadastro com senha não verifica email), e o
// email do usuário logado precisa ser o do convite.
export async function acceptInvite(
  token: unknown,
  user: { id: string; email: string } | null,
  deps: AcceptInviteDeps,
): Promise<AcceptInviteResult> {
  if (!user) return { ok: false, error: "unauthenticated" };
  if (typeof token !== "string" || !token) return { ok: false, error: "invalid_invite" };

  const invite = await deps.findInviteByTokenHash(hashInviteToken(token));
  if (!invite) return { ok: false, error: "invalid_invite" };
  if (invite.expiresAt <= deps.now()) return { ok: false, error: "invite_expired" };
  if (invite.email !== user.email.trim().toLowerCase()) return { ok: false, error: "email_mismatch" };

  await deps.markAccepted(invite.id, user.id);
  return { ok: true, workspaceId: invite.workspaceId };
}

export type UpdateMemberError =
  | ActorError
  | "member_not_found"
  | "invalid_input"
  | "invalid_role"
  | "invalid_name"
  | "name_too_long"
  | "last_admin";

export type UpdateMemberResult = { ok: true } | { ok: false; error: UpdateMemberError };

type UpdateMemberDeps = {
  // null quando o membro não existe (ou não é do workspace); userId null = convite pendente.
  findMember: (memberId: string) => Promise<FoundMember | null>;
  roleExists: (roleId: string) => Promise<boolean>;
  // Administradores que já aceitaram o convite.
  countActiveAdmins: () => Promise<number>;
  // name só vem quando há conta vinculada; ele é da conta, não do workspace.
  update: (memberId: string, data: { admin: boolean; roleId: string | null; name?: string }) => Promise<void>;
};

export async function updateMember(
  input: unknown,
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: UpdateMemberDeps,
): Promise<UpdateMemberResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!memberId) return { ok: false, error: "member_not_found" };

  if (input == null || typeof input !== "object") return { ok: false, error: "invalid_input" };
  const { name, role } = input as Record<string, unknown>;
  const parsedRole = await parseRole(role, deps.roleExists);
  if (!parsedRole) return { ok: false, error: "invalid_role" };

  const member = await deps.findMember(memberId);
  if (!member) return { ok: false, error: "member_not_found" };
  const adminError = await checkAdminChange(member, parsedRole.admin, ctx.actor!, deps.countActiveAdmins);
  if (adminError) return { ok: false, error: adminError };

  if (!member.userId) {
    await deps.update(memberId, parsedRole);
    return { ok: true };
  }

  if (typeof name !== "string") return { ok: false, error: "invalid_input" };
  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  await deps.update(memberId, { name: normalizedName, ...parsedRole });
  return { ok: true };
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: ActorError | "member_not_found" | "last_admin" };

export async function removeMember(
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    // null quando o membro não existe (ou não é do workspace).
    findMember: (memberId: string) => Promise<FoundMember | null>;
    countActiveAdmins: () => Promise<number>;
    remove: (memberId: string) => Promise<void>;
  },
): Promise<RemoveMemberResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!memberId) return { ok: false, error: "member_not_found" };

  const member = await deps.findMember(memberId);
  if (!member) return { ok: false, error: "member_not_found" };
  // Remover vale como deixar de ser administrador.
  const adminError = await checkAdminChange(member, false, ctx.actor!, deps.countActiveAdmins);
  if (adminError) return { ok: false, error: adminError };

  await deps.remove(memberId);
  return { ok: true };
}
