import { Types, type PipelineStage } from "mongoose"
import {
  AI_COST_PAGE_SIZE,
  AI_USAGE_ACTION_LABELS,
  buildUsageRecord,
  previousCostRange,
  summarizeCosts,
  type AiUsageAction,
  type CostQuery,
  type CostRow,
  type DayRange,
} from "@/lib/ai-usage"
import { BRT_OFFSET_HOURS } from "@/lib/timezone"
import { AiUsage } from "@/models/AiUsage"
import { User } from "@/models/User"

type Usage = Parameters<typeof buildUsageRecord>[0]["usage"]

// Falha ao registrar não derruba a resposta da AgenIA.
export async function recordAiUsage(ctx: { workspaceId: string; userId: string }, action: AiUsageAction, rawModel: string, usage: Usage) {
  try {
    await AiUsage.create({ workspaceId: ctx.workspaceId, userId: ctx.userId, action, ...buildUsageRecord({ rawModel, usage }) })
  } catch (error) {
    console.error("Consumo de IA não registrado", error)
  }
}

const HOUR_MS = 60 * 60 * 1000

// Dias de Brasília -> intervalo em UTC.
function between({ startDate, endDate }: DayRange) {
  const start = new Date(new Date(`${startDate}T00:00:00Z`).getTime() + BRT_OFFSET_HOURS * HOUR_MS)
  const end = new Date(new Date(`${endDate}T00:00:00Z`).getTime() + (24 + BRT_OFFSET_HOURS) * HOUR_MS)
  return { $gte: start, $lt: end }
}

const GROUP_FIELDS = { action: "$action", model: "$model", user: { $toString: "$userId" } } as const

type Facet = { _id: string; count: number }
type EventRow = { _id: Types.ObjectId; createdAt: Date; action: AiUsageAction; model: string; userId: Types.ObjectId; totalTokens: number; costUsd: number | null }

// Tudo o que a tela de custos mostra, só do workspace.
export async function loadAiCosts(workspaceId: string, query: CostQuery) {
  const wid = new Types.ObjectId(workspaceId)
  const scoped: Record<string, unknown> = { workspaceId: wid }
  if (query.action.length) scoped.action = { $in: query.action }
  if (query.model.length) scoped.model = { $in: query.model }
  if (query.user.length) scoped.userId = { $in: query.user.map((id) => new Types.ObjectId(id)) }
  const range = { startDate: query.startDate, endDate: query.endDate }

  const [[result], [previous]] = await Promise.all([
    AiUsage.aggregate<{
      rows: CostRow[]
      actions: Facet[]
      models: Facet[]
      users: Facet[]
      events: EventRow[]
      count: { value: number }[]
    }>([
      { $match: { workspaceId: wid, createdAt: between(range) } },
      {
        $facet: {
          rows: [
            { $match: scoped },
            {
              $group: {
                _id: {
                  key: GROUP_FIELDS[query.groupBy],
                  day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "America/Sao_Paulo" } },
                },
                costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
                requests: { $sum: 1 },
                tokens: { $sum: "$totalTokens" },
                unpriced: { $sum: { $cond: [{ $eq: ["$costUsd", null] }, 1, 0] } },
              },
            },
            { $project: { _id: 0, key: "$_id.key", day: "$_id.day", costUsd: 1, requests: 1, tokens: 1, unpriced: 1 } },
          ],
          actions: [{ $group: { _id: "$action", count: { $sum: 1 } } }],
          models: [{ $group: { _id: "$model", count: { $sum: 1 } } }],
          users: [{ $group: { _id: { $toString: "$userId" }, count: { $sum: 1 } } }],
          events: [
            { $match: scoped },
            { $sort: { createdAt: -1 } },
            { $skip: (query.page - 1) * AI_COST_PAGE_SIZE },
            { $limit: AI_COST_PAGE_SIZE },
            { $project: { createdAt: 1, action: 1, model: 1, userId: 1, totalTokens: 1, costUsd: 1 } },
          ],
          count: [{ $match: scoped }, { $count: "value" }],
        },
      } as PipelineStage.Facet,
    ]),
    AiUsage.aggregate<{ costUsd: number }>([
      { $match: { ...scoped, createdAt: between(previousCostRange(range)) } },
      { $group: { _id: null, costUsd: { $sum: { $ifNull: ["$costUsd", 0] } } } },
    ]),
  ])

  const userIds = [...new Set([...result.users.map((u) => u._id), ...result.events.map((e) => e.userId.toString())])]
  const users = await User.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).select({ name: 1, email: 1 }).lean()
  const userName = new Map(users.map((u) => [u._id.toString(), u.name ?? u.email]))
  const nameOf = (id: string) => userName.get(id) ?? "Usuário removido"
  const actionLabel = (key: string) => AI_USAGE_ACTION_LABELS[key as AiUsageAction] ?? key
  const labelOf = query.groupBy === "action" ? actionLabel : query.groupBy === "user" ? nameOf : (key: string) => key
  const facet = (entries: Facet[], label: (key: string) => string) =>
    entries.map((e) => ({ value: e._id, label: label(e._id), count: e.count })).sort((a, b) => b.count - a.count)

  return {
    ...summarizeCosts({ rows: result.rows, range, granularity: query.granularity, labelOf }),
    previousCostUsd: previous?.costUsd ?? 0,
    facets: {
      action: facet(result.actions, actionLabel),
      model: facet(result.models, (key) => key),
      user: facet(result.users, nameOf),
    },
    events: {
      total: result.count[0]?.value ?? 0,
      rows: result.events.map((e) => ({
        id: e._id.toString(),
        createdAt: e.createdAt,
        action: actionLabel(e.action),
        model: e.model,
        user: nameOf(e.userId.toString()),
        tokens: e.totalTokens,
        costUsd: e.costUsd,
      })),
    },
  }
}

export type AiCosts = Awaited<ReturnType<typeof loadAiCosts>>
