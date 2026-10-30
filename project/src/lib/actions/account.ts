"use server"

import { refresh } from "next/cache"
import { Types } from "mongoose"
import { signOut } from "@/auth"
import client from "@/service/_shared/database/mongodb"
import { getSessionUserId } from "@/service/(auth)/session"
import { deleteAccount, updateProfile, type UpdateProfileError } from "@/service/account/account"
import { countAdmins, listAdminWorkspaces } from "@/service/workspace/[workspaceId]/users/member-store"
import { User } from "@/models/User"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const profileErrorMessages: Record<UpdateProfileError, string> = {
  unauthenticated: "Sua sessão expirou. Entre novamente.",
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
}

export type AccountFormState = { error: string | null }

export async function updateProfileAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: profileErrorMessages.unauthenticated }

  const result = await updateProfile({ name: formData.get("name") }, userId, {
    update: async (id, { name }) => {
      await User.updateOne({ _id: id }, { $set: { name } })
    },
  })

  if (!result.ok) return { error: profileErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteAccountAction(): Promise<AccountFormState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: profileErrorMessages.unauthenticated }

  const result = await deleteAccount(userId, {
    listAdminWorkspaces,
    countAdmins,
    deleteUser: async (id) => {
      const _id = new Types.ObjectId(id)
      await WorkspaceMember.deleteMany({ userId: _id })
      await client.db().collection("accounts").deleteMany({ userId: _id })
      await User.deleteOne({ _id })
    },
  })

  if (!result.ok) {
    if (result.error === "unauthenticated") return { error: profileErrorMessages.unauthenticated }
    return {
      error: `Você é o único administrador de ${result.workspaces.join(", ")}. Passe o cargo para outra pessoa antes de excluir a conta.`,
    }
  }

  await signOut({ redirectTo: "/login" })
  return { error: null }
}
