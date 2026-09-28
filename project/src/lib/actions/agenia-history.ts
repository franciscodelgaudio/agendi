"use server"

import { THREAD_MODES, type ThreadMode } from "@/lib/agenia-history"
import { deleteThread, forgetMemory, listMemories, listThreads, loadThreadMessages } from "@/lib/agenia-store"
import { canManageMembers } from "@/lib/member-role"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"

async function findActor(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return access ? { workspaceId, userId, role: access.role } : null
}

const OBJECT_ID = /^[0-9a-f]{24}$/i

export type AgeniaThreadItem = { key: string; title: string; lastMessageAt: Date }

// Conversas do próprio usuário com a AgenIA naquele escopo, das mais recentes para as antigas.
export async function listAgeniaThreadsAction(workspaceId: string, mode: ThreadMode, scopeId: string | null): Promise<AgeniaThreadItem[]> {
  const actor = await findActor(workspaceId)
  if (!actor || !THREAD_MODES.includes(mode) || (scopeId !== null && !OBJECT_ID.test(scopeId))) return []
  return listThreads(actor, mode, scopeId)
}

export async function loadAgeniaThreadAction(workspaceId: string, key: string): Promise<unknown[] | null> {
  const actor = await findActor(workspaceId)
  if (!actor || typeof key !== "string") return null
  return loadThreadMessages(actor, key)
}

export async function deleteAgeniaThreadAction(workspaceId: string, key: string): Promise<boolean> {
  const actor = await findActor(workspaceId)
  if (!actor || typeof key !== "string") return false
  return deleteThread(actor, key)
}

export type AgeniaMemoryItem = { id: string; content: string; createdAt: Date }

// A memória é do workspace e só o proprietário e administradores a veem e apagam.
export async function listAgeniaMemoriesAction(workspaceId: string): Promise<AgeniaMemoryItem[]> {
  const actor = await findActor(workspaceId)
  if (!actor || !canManageMembers(actor.role)) return []
  return listMemories(workspaceId)
}

export async function deleteAgeniaMemoryAction(workspaceId: string, memoryId: string): Promise<boolean> {
  const actor = await findActor(workspaceId)
  if (!actor || !canManageMembers(actor.role)) return false
  return (await forgetMemory(workspaceId, memoryId)).ok
}
