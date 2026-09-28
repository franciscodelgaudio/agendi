import { Types } from "mongoose"
import { addMemory, removeMemory, saveThread, type ThreadMode } from "@/lib/agenia-history"
import { AgeniaMemory } from "@/models/AgeniaMemory"
import { AgeniaThread } from "@/models/AgeniaThread"

type Ctx = { workspaceId: string; userId: string }

const oid = (id: string) => new Types.ObjectId(id)

async function findThread(key: string) {
  const thread = await AgeniaThread.findOne({ key }).select({ workspaceId: 1, userId: 1, mode: 1, scopeId: 1 }).lean()
  return (
    thread && {
      workspaceId: thread.workspaceId.toString(),
      userId: thread.userId.toString(),
      mode: thread.mode as ThreadMode,
      scopeId: thread.scopeId?.toString() ?? null,
    }
  )
}

// A chave é de outro usuário (ou workspace): a conversa não pode continuar com ela.
export async function isThreadTaken(key: string, ctx: Ctx) {
  const thread = await findThread(key)
  return !!thread && (thread.userId !== ctx.userId || thread.workspaceId !== ctx.workspaceId)
}

export function persistThread(input: { key: unknown; mode: unknown; scopeId: unknown; messages: unknown }, ctx: Ctx) {
  return saveThread(input, ctx, {
    find: findThread,
    upsert: async (key, data) => {
      await AgeniaThread.updateOne(
        { key },
        {
          $set: {
            ...data,
            workspaceId: oid(data.workspaceId),
            userId: oid(data.userId),
            scopeId: data.scopeId ? oid(data.scopeId) : null,
          },
        },
        { upsert: true },
      )
    },
    now: () => new Date(),
  })
}

export async function listThreads(ctx: Ctx, mode: ThreadMode, scopeId: string | null, limit = 30) {
  const threads = await AgeniaThread.find({
    workspaceId: oid(ctx.workspaceId),
    userId: oid(ctx.userId),
    mode,
    scopeId: scopeId ? oid(scopeId) : null,
  })
    .select({ key: 1, title: 1, lastMessageAt: 1 })
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean()
  return threads.map((t) => ({ key: t.key, title: t.title, lastMessageAt: t.lastMessageAt }))
}

export async function loadThreadMessages(ctx: Ctx, key: string) {
  const thread = await AgeniaThread.findOne({ key, workspaceId: oid(ctx.workspaceId), userId: oid(ctx.userId) })
    .select({ messages: 1 })
    .lean()
  return thread ? (thread.messages as unknown[]) : null
}

export async function deleteThread(ctx: Ctx, key: string) {
  const { deletedCount } = await AgeniaThread.deleteOne({ key, workspaceId: oid(ctx.workspaceId), userId: oid(ctx.userId) })
  return deletedCount > 0
}

export async function listMemories(workspaceId: string) {
  const memories = await AgeniaMemory.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 }).lean()
  return memories.map((m) => ({ id: m._id.toString(), content: m.content, createdAt: m.createdAt }))
}

export function saveMemory(content: unknown, ctx: Ctx) {
  return addMemory(content, ctx, {
    list: () => listMemories(ctx.workspaceId),
    insert: async (fact) => {
      const memory = await AgeniaMemory.create({ workspaceId: ctx.workspaceId, content: fact, createdBy: ctx.userId })
      return { id: memory._id.toString() }
    },
  })
}

export function forgetMemory(workspaceId: string, memoryId: string) {
  return removeMemory(memoryId, async (id) => {
    const { deletedCount } = await AgeniaMemory.deleteOne({ _id: id, workspaceId: oid(workspaceId) })
    return deletedCount > 0
  })
}
