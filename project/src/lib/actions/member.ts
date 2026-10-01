"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { auth } from "@/auth"
import { sendInviteEmail } from "@/lib/email"
import {
  acceptInvite,
  inviteMember,
  removeMember,
  updateMember,
  type AcceptInviteError,
  type InviteMemberError,
  type UpdateMemberError,
} from "@/lib/member"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Role } from "@/models/Role"
import { User } from "@/models/User"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const MONGO_DUPLICATE_KEY = 11000

const errorMessages: Record<InviteMemberError | UpdateMemberError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Sua função não pode fazer isso. Só administradores convidam, editam ou removem administradores.",
  invalid_input: "Preencha todos os campos.",
  invalid_email: "Informe um email válido.",
  invalid_role: "Escolha uma função.",
  last_admin: "O workspace precisa de ao menos um administrador ativo.",
  already_member: "Este email já faz parte do workspace ou tem um convite pendente.",
  email_failed: "Não foi possível enviar o email de convite. Tente novamente.",
  member_not_found: "Usuário não encontrado neste workspace.",
  invalid_name: "Informe o nome.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type MemberFormState = { error: string | null }

// Role escolhida no formulário, se for do workspace.
async function roleExists(workspaceId: string, roleId: string) {
  return isObjectIdOrHexString(roleId) && !!(await Role.exists({ _id: roleId, workspaceId }))
}

// Administradores que já aceitaram o convite.
function countActiveAdmins(workspaceId: string) {
  return WorkspaceMember.countDocuments({ workspaceId, admin: true, userId: { $ne: null } })
}

async function findMember(filter: ReturnType<typeof memberFilter>) {
  const member = await WorkspaceMember.findOne(filter!).select({ userId: 1, admin: 1 }).lean()
  return member && { id: member._id.toString(), userId: member.userId?.toString() ?? null, admin: !!member.admin }
}

// Só encontra o membro se ele for do workspace; id inválido vira null.
function memberFilter(workspaceId: string, memberId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(memberId)) return null
  return { _id: new Types.ObjectId(memberId), workspaceId: new Types.ObjectId(workspaceId) }
}

// workspaceId vem via argumento do cliente; o acesso é conferido aqui, no servidor.
export async function inviteMemberAction(
  workspaceId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await auth()
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)

  const result = await inviteMember(
    { email: formData.get("email"), role: formData.get("role") },
    { workspaceId, actor: access?.actor ?? null },
    {
      isAlreadyInWorkspace: async (email) => !!(await WorkspaceMember.exists({ workspaceId, email })),
      roleExists: (roleId) => roleExists(workspaceId, roleId),
      createInvite: async (data) => {
        const invite = await WorkspaceMember.create(data)
        return { id: invite._id.toString() }
      },
      deleteInvite: async (id) => {
        await WorkspaceMember.deleteOne({ _id: id })
      },
      // Só é chamado depois da checagem de acesso, então access existe aqui.
      sendInvite: ({ email, token }) =>
        sendInviteEmail({
          email,
          token,
          workspaceName: access!.name,
          inviterName: session?.user?.name || session?.user?.email || "Alguém",
        }),
      now: () => new Date(),
    },
  ).catch((e) => {
    // Dois convites simultâneos para o mesmo email: o índice único barra o segundo.
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) {
      return { ok: false as const, error: "already_member" as const }
    }
    throw e
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function updateMemberAction(
  workspaceId: string,
  memberId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)
  const filter = memberFilter(workspaceId, memberId)

  let linkedUserId: string | null = null
  const result = await updateMember(
    { name: formData.get("name"), role: formData.get("role") },
    filter && memberId,
    { actor: access?.actor ?? null },
    {
      findMember: async () => {
        const member = await findMember(filter)
        linkedUserId = member?.userId ?? null
        return member
      },
      roleExists: (roleId) => roleExists(workspaceId, roleId),
      countActiveAdmins: () => countActiveAdmins(workspaceId),
      update: async (_id, { admin, roleId, name }) => {
        await WorkspaceMember.updateOne(filter!, { $set: { admin, roleId } })
        // O nome é da conta: muda em todos os workspaces da pessoa.
        if (name && linkedUserId) await User.updateOne({ _id: linkedUserId }, { $set: { name } })
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function removeMemberAction(workspaceId: string, memberId: string): Promise<MemberFormState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)
  const filter = memberFilter(workspaceId, memberId)

  const result = await removeMember(filter && memberId, { actor: access?.actor ?? null }, {
    findMember: () => findMember(filter),
    countActiveAdmins: () => countActiveAdmins(workspaceId),
    remove: async () => {
      await WorkspaceMember.deleteOne(filter!)
    },
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

const acceptErrorMessages: Record<AcceptInviteError, string> = {
  unauthenticated: "Sua sessão expirou. Entre novamente.",
  invalid_invite: "Este convite não existe ou já foi usado.",
  invite_expired: "Este convite expirou. Peça um novo convite a quem convidou você.",
  email_mismatch: "Este convite foi enviado para outro email. Entre com a conta do email convidado.",
}

export type AcceptInviteState = { error: string | null; workspaceId?: string }

export async function acceptInviteAction(token: string): Promise<AcceptInviteState> {
  const userId = await getSessionUserId()
  // O email vem do banco, não do JWT, para refletir a conta atual.
  const user = userId ? await User.findById(userId).select("email").lean() : null

  const result = await acceptInvite(token, user && { id: userId!, email: user.email }, {
    findInviteByTokenHash: async (tokenHash) => {
      const invite = await WorkspaceMember.findOne({ tokenHash, userId: null }).lean()
      return (
        invite && {
          id: invite._id.toString(),
          workspaceId: invite.workspaceId.toString(),
          email: invite.email,
          expiresAt: invite.expiresAt!,
        }
      )
    },
    markAccepted: async (id, acceptedBy) => {
      await WorkspaceMember.updateOne(
        { _id: id, userId: null },
        { $set: { userId: acceptedBy, acceptedAt: new Date() }, $unset: { tokenHash: 1, expiresAt: 1 } },
      )
    },
    now: () => new Date(),
  })

  if (!result.ok) return { error: acceptErrorMessages[result.error] }
  return { error: null, workspaceId: result.workspaceId }
}
