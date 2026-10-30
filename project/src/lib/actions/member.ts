"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { auth } from "@/auth"
import { sendInviteEmail } from "@/service/_shared/email"
import { getSessionUserId } from "@/service/(auth)/session"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  updateInvite,
  type AcceptInviteError,
  type CreateInviteError,
  type UpdateInviteError,
} from "@/service/workspace/[workspaceId]/users/invite"
import { removeMember, updateMember, type UpdateMemberError } from "@/service/workspace/[workspaceId]/users/member"
import {
  countAdmins,
  findWorkspaceRole,
  isAlreadyInWorkspace,
} from "@/service/workspace/[workspaceId]/users/member-store"
import { Invite } from "@/models/Invite"
import { User } from "@/models/User"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const MONGO_DUPLICATE_KEY = 11000

const errorMessages: Record<CreateInviteError | UpdateInviteError | UpdateMemberError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Sua função não pode fazer isso. Só administradores convidam, editam ou removem administradores.",
  invalid_input: "Preencha todos os campos.",
  invalid_email: "Informe um email válido.",
  invalid_role: "Escolha uma função.",
  last_admin: "O workspace precisa de ao menos um administrador.",
  already_member: "Este email já faz parte do workspace ou tem um convite pendente.",
  email_failed: "Não foi possível enviar o email de convite. Tente novamente.",
  member_not_found: "Usuário não encontrado neste workspace.",
  invite_not_found: "Convite não encontrado neste workspace.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type MemberFormState = { error: string | null }

function workspaceFilter(workspaceId: string, id: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(id)) return null
  return { _id: new Types.ObjectId(id), workspaceId: new Types.ObjectId(workspaceId) }
}

async function isAdminRole(workspaceId: string, roleId: Types.ObjectId) {
  return !!(await findWorkspaceRole(workspaceId, roleId.toString()))?.admin
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { userId, access }
}

export async function inviteMemberAction(
  workspaceId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const { access } = session
  const inviter = (await auth())?.user

  const result = await createInvite(
    { email: formData.get("email"), roleId: formData.get("roleId") },
    { workspaceId, actor: access?.actor ?? null },
    {
      isAlreadyInWorkspace: (email) => isAlreadyInWorkspace(workspaceId, email),
      findRole: (roleId) => findWorkspaceRole(workspaceId, roleId),
      insertInvite: async (data) => {
        const invite = await Invite.create(data)
        return { id: invite._id.toString() }
      },
      deleteInvite: async (id) => {
        await Invite.deleteOne({ _id: id })
      },
      sendInvite: ({ email, token }) =>
        sendInviteEmail({
          email,
          token,
          workspaceName: access!.name,
          inviterName: inviter?.name || inviter?.email || "Alguém",
        }),
      now: () => new Date(),
    },
  ).catch((e) => {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) {
      return { ok: false as const, error: "already_member" as const }
    }
    throw e
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function updateInviteAction(
  workspaceId: string,
  inviteId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, inviteId)

  const result = await updateInvite(
    { roleId: formData.get("roleId") },
    filter && inviteId,
    { actor: session.access?.actor ?? null },
    {
      findInvite: async () => {
        const invite = await Invite.findOne(filter!).select({ roleId: 1 }).lean()
        return invite && { id: inviteId, admin: await isAdminRole(workspaceId, invite.roleId) }
      },
      findRole: (roleId) => findWorkspaceRole(workspaceId, roleId),
      update: async (_id, { roleId }) => {
        await Invite.updateOne(filter!, { $set: { roleId } })
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function cancelInviteAction(workspaceId: string, inviteId: string): Promise<MemberFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, inviteId)

  const result = await cancelInvite(filter && inviteId, { actor: session.access?.actor ?? null }, {
    findInvite: async () => {
      const invite = await Invite.findOne(filter!).select({ roleId: 1 }).lean()
      return invite && { id: inviteId, admin: await isAdminRole(workspaceId, invite.roleId) }
    },
    remove: async () => {
      await Invite.deleteOne(filter!)
    },
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

async function findMember(workspaceId: string, filter: ReturnType<typeof workspaceFilter>) {
  const member = filter && (await WorkspaceMember.findOne(filter).select({ roleId: 1 }).lean())
  return member && { id: member._id.toString(), admin: await isAdminRole(workspaceId, member.roleId) }
}

export async function updateMemberAction(
  workspaceId: string,
  memberId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, memberId)

  const result = await updateMember(
    { roleId: formData.get("roleId") },
    filter && memberId,
    { actor: session.access?.actor ?? null },
    {
      findMember: () => findMember(workspaceId, filter),
      findRole: (roleId) => findWorkspaceRole(workspaceId, roleId),
      countAdmins: () => countAdmins(workspaceId),
      update: async (_id, { roleId }) => {
        await WorkspaceMember.updateOne(filter!, { $set: { roleId } })
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function removeMemberAction(workspaceId: string, memberId: string): Promise<MemberFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: errorMessages.unauthenticated }
  const filter = workspaceFilter(workspaceId, memberId)

  const result = await removeMember(filter && memberId, { actor: session.access?.actor ?? null }, {
    findMember: () => findMember(workspaceId, filter),
    countAdmins: () => countAdmins(workspaceId),
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
  if (!userId) return { error: acceptErrorMessages.unauthenticated }
  const user = await User.findById(userId).select("email").lean()

  const result = await acceptInvite(token, user && { id: userId, email: user.email }, {
    findInviteByTokenHash: async (tokenHash) => {
      const invite = await Invite.findOne({ tokenHash }).lean()
      return (
        invite && {
          id: invite._id.toString(),
          workspaceId: invite.workspaceId.toString(),
          email: invite.email,
          roleId: invite.roleId.toString(),
          expiresAt: invite.expiresAt,
        }
      )
    },
    createMember: async (data) => {
      await WorkspaceMember.create(data).catch((e) => {
        if ((e as { code?: unknown })?.code !== MONGO_DUPLICATE_KEY) throw e
      })
    },
    deleteInvite: async (id) => {
      await Invite.deleteOne({ _id: id })
    },
    now: () => new Date(),
  })

  if (!result.ok) return { error: acceptErrorMessages[result.error] }
  return { error: null, workspaceId: result.workspaceId }
}
