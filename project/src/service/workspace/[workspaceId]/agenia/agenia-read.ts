import { tool } from "ai"
import { isObjectIdOrHexString, Types } from "mongoose"
import { z } from "zod"
import { formatTranscript, type TranscriptMessage } from "@/service/workspace/[workspaceId]/agenia/agenia-conversation"
import { uraGraphIndex } from "@/service/workspace/[workspaceId]/uras/agenia-ura"
import { parsePerformedAt } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment"
import { cashFlowBuckets } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { groupLimitForMonth, nextMonth } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import type { WorkspaceContext } from "@/service/workspace/[workspaceId]/agenia/agenia-prompts"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { forgetMemory, listMemories, saveMemory } from "@/service/workspace/[workspaceId]/agenia/agenia-store"
import { groupLimitsOf, loadUnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { loadWallets } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"
import type { UraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph"
import { toBrt } from "@/service/workspace/[workspaceId]/uras/ura-variables"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Conversation } from "@/models/Conversation"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Message } from "@/models/Message"
import { MessagingChannel } from "@/models/MessagingChannel"
import { Product } from "@/models/Product"
import { productListPipeline } from "@/service/workspace/[workspaceId]/stock/products/product-list"
import { findUnitHolder } from "@/service/workspace/[workspaceId]/stock/stock-store"
import { Role } from "@/models/Role"
import { Service } from "@/models/Service"
import { Ticket } from "@/models/Ticket"
import { Unit } from "@/models/Unit"
import { Ura } from "@/models/Ura"
import { User } from "@/models/User"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 200
const TRANSCRIPT_LIMIT = 80

const objectId = z.string().regex(/^[0-9a-f]{24}$/i)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("AAAA-MM-DD")

const oid = (id: string) => new Types.ObjectId(id)
const reais = (cents: number | null | undefined) => (cents == null ? null : cents / 100)
// Date -> "AAAA-MM-DDTHH:mm" no horário de Brasília, o mesmo formato das ferramentas de ação.
const brtDateTime = (date: Date) => toBrt(date).toISOString().slice(0, 16)
export const brtToday = (now = new Date()) => toBrt(now).toISOString().slice(0, 10)

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]

// Intervalo [início do dia from, fim do dia to] em UTC.
function dayRange(from: string, to: string) {
  const start = parsePerformedAt(`${from}T00:00`)
  const end = parsePerformedAt(`${to}T00:00`)
  return start && end ? { start, end: new Date(end.getTime() + DAY_MS) } : null
}

export async function loadWorkspaceContext(
  workspaceId: string,
  user: { id: string; actor: Actor },
  page: string | null,
): Promise<WorkspaceContext> {
  const wid = oid(workspaceId)
  const [workspace, units, members, roles, channels, uras, me, memories] = await Promise.all([
    Workspace.findById(wid).select({ name: 1 }).lean(),
    Unit.find({ workspaceId: wid }).select({ name: 1, businessHours: 1, treatmentRooms: 1 }).sort({ name: 1 }).lean(),
    WorkspaceMember.find({ workspaceId: wid }).select({ email: 1, admin: 1, roleId: 1, userId: 1, units: 1 }).lean(),
    Role.find({ workspaceId: wid }).select({ name: 1, permissions: 1 }).sort({ name: 1 }).lean(),
    MessagingChannel.find({ workspaceId: wid }).select({ name: 1, platform: 1 }).lean(),
    Ura.find({ workspaceId: wid }).select({ name: 1, active: 1 }).lean(),
    User.findById(user.id).select({ name: 1, email: 1 }).lean(),
    listMemories(workspaceId),
  ])
  const userIds = members.map((m) => m.userId).filter((id) => id != null)
  const users = await User.find({ _id: { $in: userIds } }).select({ name: 1, email: 1 }).lean()
  const nameOf = new Map(users.map((u) => [u._id.toString(), u.name ?? u.email]))
  const roleName = new Map(roles.map((r) => [r._id.toString(), r.name]))
  const memberRole = (m: { admin?: boolean | null; roleId?: Types.ObjectId | null }) =>
    m.admin ? "administrador" : ((m.roleId && roleName.get(m.roleId.toString())) ?? "sem função")
  const myMember = members.find((m) => m.userId?.toString() === user.id)
  const now = new Date()

  return {
    workspace: workspace?.name ?? "",
    user: { name: me?.name ?? me?.email ?? "", role: myMember ? memberRole(myMember) : "sem função" },
    today: `${brtToday(now)} (${WEEKDAYS[toBrt(now).getUTCDay()]}), ${brtDateTime(now).slice(11)}`,
    page,
    units: units.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      opensAt: u.businessHours.opensAt,
      closesAt: u.businessHours.closesAt,
      rooms: u.treatmentRooms.map((r) => ({ id: r._id.toString(), name: r.name, beds: r.beds })),
    })),
    team: members.map((m) => ({
      userId: m.userId?.toString() ?? null,
      memberId: m._id.toString(),
      name: (m.userId && nameOf.get(m.userId.toString())) || m.email,
      role: memberRole(m),
      unitIds: m.units.map((link) => link.unitId.toString()),
    })),
    roles: roles.map((r) => ({ id: r._id.toString(), name: r.name, attends: r.permissions.includes("attends") })),
    channels: channels.map((c) => ({ id: c._id.toString(), name: c.name, platform: c.platform })),
    uras: uras.map((u) => ({ id: u._id.toString(), name: u.name, active: u.active })),
    memories: memories.map((m) => ({ id: m.id, content: m.content })),
    canRemember: can(user.actor, "agenia.use"),
  }
}

const memoryErrors = {
  invalid_content: "Escreva o fato a guardar.",
  content_too_long: "O fato pode ter no máximo 300 caracteres.",
  memory_full: "A memória está cheia (50 fatos). Esqueça algum antes de guardar outro.",
}

// Memória do workspace: roda direto, sem card de autorização, porque não mexe nos dados do negócio.
export function buildMemoryTools(ctx: { workspaceId: string; userId: string }) {
  return {
    saveMemory: tool({
      description: "Guarda um fato durável sobre o negócio ou uma preferência de trabalho na memória do workspace.",
      inputSchema: z.object({ content: z.string().describe("Uma frase curta e autossuficiente.") }),
      execute: async ({ content }) => {
        const result = await saveMemory(content, ctx)
        return result.ok ? { ok: true, content, duplicate: !!result.duplicate } : { ok: false, reason: memoryErrors[result.error] }
      },
    }),
    forgetMemory: tool({
      description: "Apaga um fato da memória do workspace pelo id.",
      inputSchema: z.object({ memoryId: objectId }),
      execute: async ({ memoryId }) => {
        const result = await forgetMemory(ctx.workspaceId, memoryId)
        return result.ok ? { ok: true } : { ok: false, reason: "Fato não encontrado na memória." }
      },
    }),
  }
}

type ConversationRow = {
  _id: Types.ObjectId
  contactName: string | null
  contactExternalId: string
  platform: string
  status: string
  lastInboundAt: Date | null
  channel: string
  assigned: string | null
  ura: string | null
}

// Conversa do workspace com o que a AgenIA precisa saber dela; null se não existir.
export async function loadConversation(workspaceId: string, conversationId: string) {
  if (!isObjectIdOrHexString(conversationId)) return null
  const [row] = await Conversation.aggregate<ConversationRow>([
    { $match: { _id: oid(conversationId), workspaceId: oid(workspaceId) } },
    { $lookup: { from: "messaging_channels", localField: "channelId", foreignField: "_id", as: "channel" } },
    { $lookup: { from: "users", localField: "assignedUserId", foreignField: "_id", as: "assigned" } },
    {
      $lookup: {
        from: "ura_sessions",
        localField: "_id",
        foreignField: "conversationId",
        as: "session",
        pipeline: [
          { $match: { status: { $in: ["running", "waiting", "sleeping"] } } },
          { $lookup: { from: "uras", localField: "uraId", foreignField: "_id", as: "ura" } },
        ],
      },
    },
    {
      $project: {
        contactName: 1,
        contactExternalId: 1,
        platform: 1,
        status: { $ifNull: ["$status", "open"] },
        lastInboundAt: 1,
        channel: { $ifNull: [{ $first: "$channel.name" }, ""] },
        assigned: { $ifNull: [{ $first: "$assigned.name" }, { $first: "$assigned.email" }] },
        ura: { $first: { $first: "$session.ura.name" } },
      },
    },
  ])
  if (!row) return null

  const messages = await Message.aggregate<TranscriptMessage>([
    { $match: { conversationId: row._id } },
    { $sort: { sentAt: -1 } },
    { $limit: TRANSCRIPT_LIMIT },
    { $sort: { sentAt: 1 } },
    { $lookup: { from: "users", localField: "sentByUserId", foreignField: "_id", as: "user" } },
    { $lookup: { from: "uras", localField: "sentByUraId", foreignField: "_id", as: "ura" } },
    {
      $project: {
        _id: 0,
        direction: 1,
        type: 1,
        text: 1,
        sentAt: 1,
        userName: { $ifNull: [{ $first: "$user.name" }, null] },
        uraName: { $cond: [{ $ifNull: ["$sentByUraId", false] }, { $ifNull: [{ $first: "$ura.name" }, "URA"] }, null] },
        mediaUrl: { $ifNull: ["$mediaUrl", null] },
        options: { $ifNull: ["$options", null] },
      },
    },
  ])

  return {
    id: row._id.toString(),
    contact: row.contactName || row.contactExternalId,
    platform: row.platform,
    channel: row.channel,
    status: row.status,
    assigned: row.assigned ?? null,
    ura: row.ura ?? null,
    lastInboundAt: row.lastInboundAt,
    transcript: formatTranscript(messages),
  }
}

// Ferramentas de consulta: rodam direto no servidor, sempre filtradas pelo workspace.
export function buildReadTools(workspaceId: string) {
  const wid = oid(workspaceId)
  const ownUnit = async (unitId: string) => !!(await Unit.exists({ _id: unitId, workspaceId: wid }))
  const unitIds = () => Unit.find({ workspaceId: wid }).distinct("_id")
  const noUnit = { ok: false, reason: "Unidade não encontrada neste workspace." }

  return {
    listServices: tool({
      description:
        "Lista os serviços de uma unidade com preço (reais), duração, produtos usados, se precisa de profissional " +
        "(requiresTherapist false: agende sem profissional) e os espaços permitidos (vazio: qualquer espaço).",
      inputSchema: z.object({ unitId: objectId }),
      execute: async ({ unitId }) => {
        if (!(await ownUnit(unitId))) return noUnit
        const services = await Service.find({ unitId }).sort({ name: 1 }).lean()
        return services.map((s) => ({
          id: s._id.toString(),
          name: s.name,
          price: reais(s.priceCents),
          durationMinutes: s.durationMinutes,
          productIds: s.productIds.map(String),
          requiresTherapist: s.requiresTherapist ?? true,
          treatmentRoomIds: (s.treatmentRoomIds ?? []).map(String),
        }))
      },
    }),

    listProducts: tool({
      description: "Lista os produtos do estoque de uma unidade (quantidade, custo unitário em reais, avaliação).",
      inputSchema: z.object({ unitId: objectId, search: z.string().optional().describe("Parte do nome.") }),
      execute: async ({ unitId, search }) => {
        if (!(await ownUnit(unitId))) return noUnit
        // Os do estoque da unidade: num estoque compartilhado, o de todas as unidades dele.
        const { holderId } = await findUnitHolder(unitId)
        const products = await Product.aggregate<{
          id: string
          name: string
          quantity: number
          costCents: number
          notes: string | null
          rating: number | null
          avatarUrl: string | null
        }>([
          { $match: { workspaceId: wid } },
          ...productListPipeline({ q: search?.trim() ?? "", sort: "name", dir: "asc" }, holderId),
          { $limit: MAX_ROWS },
        ])
        return products.map((p) => ({
          id: p.id,
          name: p.name,
          quantity: p.quantity,
          cost: reais(p.costCents),
          notes: p.notes,
          rating: p.rating,
          avatarUrl: p.avatarUrl,
        }))
      },
    }),

    listBookings: tool({
      description: "Lista os agendamentos da agenda entre dois dias (inclusive), de todas as unidades ou de uma.",
      inputSchema: z.object({ from: day, to: day, unitId: objectId.optional() }),
      execute: async ({ from, to, unitId }) => {
        const range = dayRange(from, to)
        if (!range) return { ok: false, reason: "Datas inválidas." }
        if (unitId && !(await ownUnit(unitId))) return noUnit
        const bookings = await Booking.find({
          unitId: unitId ? oid(unitId) : { $in: await unitIds() },
          startsAt: { $gte: range.start, $lt: range.end },
        })
          .sort({ startsAt: 1 })
          .limit(MAX_ROWS)
          .lean()
        return bookings.map((b) => ({
          id: b._id.toString(),
          unitId: b.unitId.toString(),
          startsAt: brtDateTime(b.startsAt),
          endsAt: brtDateTime(b.endsAt),
          guest: b.guest,
          therapist: b.therapistId ? { id: b.therapistId.toString(), name: b.therapistName } : null,
          service: { id: b.service.serviceId.toString(), name: b.service.serviceName },
          treatmentRoom: { id: b.treatmentRoom.roomId.toString(), name: b.treatmentRoom.roomName },
          products: b.products.map((p) => p.productName),
          registeredAsAppointment: !!b.appointmentId,
        }))
      },
    }),

    listAppointments: tool({
      description: "Lista os atendimentos realizados numa unidade entre dois dias (inclusive), com serviços, valores e profissionais.",
      inputSchema: z.object({ unitId: objectId, from: day, to: day }),
      execute: async ({ unitId, from, to }) => {
        const range = dayRange(from, to)
        if (!range) return { ok: false, reason: "Datas inválidas." }
        if (!(await ownUnit(unitId))) return noUnit
        const appointments = await Appointment.find({ unitId, performedAt: { $gte: range.start, $lt: range.end } })
          .sort({ performedAt: 1 })
          .limit(MAX_ROWS)
          .lean()
        return appointments.map((a) => ({
          id: a._id.toString(),
          performedAt: brtDateTime(a.performedAt),
          guest: a.guest,
          items: a.items.map((i) => ({ service: i.serviceName, price: reais(i.priceCents), therapist: i.therapistName })),
          products: a.products.map((p) => p.productName),
        }))
      },
    }),

    listExpenses: tool({
      description:
        "Lista os grupos de despesa de uma unidade, com o limite de cada mês do período (AAAA-MM; null = sem limite), e as despesas lançadas entre dois dias (inclusive).",
      inputSchema: z.object({ unitId: objectId, from: day, to: day }),
      execute: async ({ unitId, from, to }) => {
        if (!(await ownUnit(unitId))) return noUnit
        const [groups, expenses] = await Promise.all([
          ExpenseGroup.find({ unitId }).sort({ name: 1 }).lean(),
          Expense.find({ unitId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).limit(MAX_ROWS).lean(),
        ])
        // Meses do período, do primeiro ao último.
        const months: string[] = []
        for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) months.push(month)
        return {
          groups: groups.map((g) => ({
            id: g._id.toString(),
            name: g.name,
            monthlyLimits: Object.fromEntries(
              months.map((month) => [month, reais(groupLimitForMonth(groupLimitsOf(g), month))]),
            ),
          })),
          expenses: expenses.map((e) => ({
            id: e._id.toString(),
            groupId: e.groupId.toString(),
            description: e.description,
            amount: reais(e.amountCents),
            date: e.date,
            paid: !!e.paidAt,
            series: e.series ? `${e.series.kind} ${e.series.number}/${e.series.count}` : null,
          })),
        }
      },
    }),

    getCashFlow: tool({
      description:
        "Resumo do caixa de uma unidade no período (semana, mês ou ano que contém a data): bruto, repasse ao parceiro, comissões, salários, despesas e líquido, realizado e previsto, além do saldo em caixa de hoje e da carteira (conta) da unidade, que pode ser compartilhada com outras unidades. Valores em reais.",
      inputSchema: z.object({
        unitId: objectId,
        view: z.enum(["week", "month", "year"]).default("month"),
        date: day.optional().describe("Um dia do período; padrão hoje."),
      }),
      execute: async ({ unitId, view, date }) => {
        const unit = await Unit.findOne({ _id: unitId, workspaceId: wid }).select({ revenueShare: 1, createdAt: 1 }).lean()
        if (!unit) return noUnit
        const today = brtToday()
        const buckets = cashFlowBuckets({ view, date: date ?? today })
        const [data, [wallet]] = await Promise.all([
          loadUnitCashFlow(
            workspaceId,
            { id: unitId, revenueShare: (unit.revenueShare ?? null) as RevenueShare | null, createdAt: unit.createdAt },
            buckets,
            today,
          ),
          loadWallets(workspaceId, today, unitId),
        ])
        const walletUnit = wallet?.units.find((u) => u.id === unitId)
        const amounts = (a: Record<string, number>) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k.replace(/Cents$/, ""), v / 100]))
        return {
          period: { from: buckets[0].from, to: buckets.at(-1)!.to },
          real: amounts(data.summary.total.real),
          forecast: amounts(data.summary.total.forecast),
          // Saldo da unidade; na carteira compartilhada só existe o da carteira (sharedWith).
          balanceToday: reais(walletUnit?.balanceCents),
          wallet: wallet
            ? {
                name: wallet.name,
                balance: reais(wallet.balanceCents),
                sharedWith: wallet.units.filter((u) => u.id !== unitId).map((u) => u.name),
              }
            : null,
          expensesByGroup: data.groups.map((g) => ({ name: g.name, paid: reais(g.paidCents) })),
        }
      },
    }),

    listConversations: tool({
      description: "Lista as conversas mais recentes (WhatsApp/Instagram), com prévia da última mensagem e não lidas.",
      inputSchema: z.object({
        status: z.enum(["open", "closed"]).optional(),
        search: z.string().optional().describe("Parte do nome ou do número do contato."),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ status, search, limit }) => {
        const escaped = search?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const conversations = await Conversation.find({
          workspaceId: wid,
          ...(status === "closed" ? { status: "closed" } : status === "open" ? { status: { $ne: "closed" } } : {}),
          ...(escaped ? { $or: [{ contactName: { $regex: escaped, $options: "i" } }, { contactExternalId: { $regex: escaped } }] } : {}),
        })
          .sort({ lastMessageAt: -1 })
          .limit(limit)
          .lean()
        return conversations.map((c) => ({
          id: c._id.toString(),
          contact: c.contactName || c.contactExternalId,
          platform: c.platform,
          status: c.status ?? "open",
          lastMessageAt: c.lastMessageAt ? brtDateTime(c.lastMessageAt) : null,
          preview: c.lastMessagePreview,
          unread: c.unreadCount,
          withTeam: c.handedOff,
        }))
      },
    }),

    readConversation: tool({
      description: "Lê o estado e o histórico recente de uma conversa.",
      inputSchema: z.object({ conversationId: objectId }),
      execute: async ({ conversationId }) =>
        (await loadConversation(workspaceId, conversationId)) ?? { ok: false, reason: "Conversa não encontrada." },
    }),

    readUra: tool({
      description: "Mostra o fluxo de uma URA: gatilho e o índice dos nós com as ligações.",
      inputSchema: z.object({ uraId: objectId }),
      execute: async ({ uraId }) => {
        const ura = await Ura.findOne({ _id: uraId, workspaceId: wid }).lean()
        if (!ura) return { ok: false, reason: "URA não encontrada." }
        return { name: ura.name, active: ura.active, index: uraGraphIndex({ nodes: ura.nodes, edges: ura.edges } as UraGraph) }
      },
    }),

    listTickets: tool({
      description: "Lista os tickets de suporte abertos pelo workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const tickets = await Ticket.find({ workspaceId: wid }).sort({ createdAt: -1 }).limit(50).lean()
        return tickets.map((t) => ({ id: t._id.toString(), type: t.type, title: t.title, status: t.status }))
      },
    }),
  }
}
