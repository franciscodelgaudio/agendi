"use server"

import { getSessionUserId } from "@/service/(auth)/session"
import { User } from "@/models/User"

// Concluir ou sair do tutorial conta igual: ele não abre mais sozinho, mas segue no menu do usuário.
export async function completeTutorialAction() {
  const userId = await getSessionUserId()
  if (!userId) return
  await User.updateOne({ _id: userId, tutorialCompletedAt: { $exists: false } }, { $set: { tutorialCompletedAt: new Date() } })
}
