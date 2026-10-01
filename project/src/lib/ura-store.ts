import { isObjectIdOrHexString, Types } from "mongoose"
import { createBooking } from "@/lib/booking"
import { bookingLookups } from "@/lib/booking-store"
import { messagePreview } from "@/lib/messaging-inbox"
import { decryptChannelToken, messagingEnv } from "@/lib/messaging-config"
import { isReplyWindowOpen } from "@/lib/messaging-send"
import { insertMessage, touchConversation } from "@/lib/messaging-store"
import type { MessageType, MessagingPlatform } from "@/lib/messaging-types"
import { metaMessageBodies } from "@/lib/meta-message"
import { sendMetaMessage } from "@/lib/meta-graph"
import type { UraGraph } from "@/lib/ura-graph"
import { scheduleTimer } from "@/lib/ura-queue"
import type { RunnerConversation, RunnerDeps, RunnerSession, SessionEndReason } from "@/lib/ura-runner"
import { availableSlots } from "@/lib/ura-slots"
import type { TriggerUra } from "@/lib/ura-trigger"
import { memberAttendsStages } from "@/lib/unit-team"
import { toBrt } from "@/lib/ura-variables"
import type { Outgoing, WalkDeps } from "@/lib/ura-walk"
import { Booking } from "@/models/Booking"
import { Conversation } from "@/models/Conversation"
import { Message } from "@/models/Message"
import { MessagingChannel } from "@/models/MessagingChannel"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"
import { User } from "@/models/User"
import { Ura } from "@/models/Ura"
import { ACTIVE_SESSION_STATUSES, UraSession } from "@/models/UraSession"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"

// Implementações no banco das dependências de lib/ura-runner e lib/ura-walk.

const MAX_TRACE = 200
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_GUEST_NAME = 80
const MAX_GUEST_ROOM = 20

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

type SessionLean = {
  _id: Types.ObjectId
  uraId: Types.ObjectId
  conversationId: Types.ObjectId
  status: string
  currentNodeId?: string | null
  variables?: Record<string, string> | null
  version: number
}

function toRunnerSession(doc: SessionLean): RunnerSession {
  return {
    id: doc._id.toString(),
    uraId: doc.uraId.toString(),
    conversationId: doc.conversationId.toString(),
    status: doc.status as RunnerSession["status"],
    currentNodeId: doc.currentNodeId ?? null,
    variables: doc.variables ?? {},
    version: doc.version,
  }
}

// Termina as sessões ativas da conversa: atendente respondeu, conversa encerrada ou reinício manual.
export async function endConversationSessions(conversationId: string, reason: SessionEndReason = "cancelled") {
  await UraSession.updateMany(
    { conversationId, status: { $in: ACTIVE_SESSION_STATUSES } },
    { $set: { status: "ended", endReason: reason, endedAt: new Date(), timeoutAt: null, wakeAt: null }, $inc: { version: 1 } },
  )
}

async function loadConversation(conversationId: string): Promise<RunnerConversation | null> {
  if (!isObjectIdOrHexString(conversationId)) return null
  const conversation = await Conversation.findById(conversationId).lean()
  if (!conversation) return null
  const whatsapp = conversation.platform === "whatsapp"
  return {
    id: conversation._id.toString(),
    workspaceId: conversation.workspaceId.toString(),
    channelId: conversation.channelId.toString(),
    contactName: conversation.contactName ?? null,
    // No WhatsApp o wa_id é o telefone; o Instagram não expõe telefone.
    contactPhone: whatsapp ? conversation.contactExternalId : null,
    // Na fila depois de transferir (sem pessoa) também bloqueia a URA.
    assignedUserId: conversation.handedOff ? (conversation.assignedUserId?.toString() ?? "team") : null,
  }
}

type OutgoingRecord = { type: MessageType; text: string | null; mediaUrl: string | null; options?: { title: string; description: string | null }[] }

function outgoingRecord(outgoing: Outgoing): OutgoingRecord {
  switch (outgoing.kind) {
    case "text":
      return { type: "text", text: outgoing.text, mediaUrl: null }
    case "media":
      return { type: outgoing.mediaType, text: outgoing.caption, mediaUrl: outgoing.url }
    case "menu":
      return {
        type: "text",
        text: outgoing.text,
        mediaUrl: null,
        options: outgoing.options.map(({ title, description }) => ({ title, description })),
      }
  }
}

// Salva a mensagem como pendente, envia pela Meta e marca como enviada ou com falha.
async function sendUraMessage(conversation: RunnerConversation, outgoing: Outgoing, uraId: string) {
  const doc = await Conversation.findById(conversation.id).select({ platform: 1, contactExternalId: 1, channelId: 1, lastInboundAt: 1 }).lean()
  if (!doc) return
  const channel = await MessagingChannel.findById(doc.channelId).select("+accessTokenEncrypted externalId").lean()
  const accessToken = channel ? decryptChannelToken(channel.accessTokenEncrypted) : null
  const platform = doc.platform as MessagingPlatform
  const now = new Date()
  const record = outgoingRecord(outgoing)

  const message = await insertMessage({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    direction: "outbound",
    externalMessageId: null,
    type: record.type,
    text: record.text,
    status: "pending",
    sentAt: now,
    sentByUraId: uraId,
    mediaUrl: record.mediaUrl,
    ...(record.options && { options: record.options }),
  })
  if (!message) return
  await touchConversation(conversation.id, { lastMessageAt: now, lastMessagePreview: messagePreview(record.type, record.text), inbound: false })

  const fail = (error: string | null) => Message.updateOne({ _id: message.id }, { $set: { status: "failed", error } })
  if (!channel || !accessToken) return void (await fail("Token do canal indisponível."))
  // Timers e pausas longas podem passar da janela de 24h da Meta.
  if (!isReplyWindowOpen(doc.lastInboundAt ?? null, now)) return void (await fail("Janela de 24h encerrada."))

  let externalMessageId: string | null = null
  for (const body of metaMessageBodies(platform, doc.contactExternalId, outgoing)) {
    const result = await sendMetaMessage({
      platform,
      channelExternalId: channel.externalId,
      accessToken,
      to: doc.contactExternalId,
      body,
      apiVersion: messagingEnv.graphApiVersion(),
    })
    if (!result.ok) return void (await fail(result.detail))
    externalMessageId ??= result.externalMessageId
  }
  await Message.updateOne({ _id: message.id, status: "pending" }, { $set: { status: "sent", externalMessageId } })
}

// Quem atende na unidade: membros ligados a ela cuja role realiza atendimentos, por nome, e
// os administradores (que não são ligados às unidades) por último.
async function unitTherapists(workspaceId: string, unitId: string) {
  const members = await WorkspaceMember.aggregate<{ userId: Types.ObjectId; admin?: boolean }>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId), userId: { $ne: null } } },
    ...memberAttendsStages(),
    { $match: { $or: [{ admin: true }, { attends: true, "units.unitId": new Types.ObjectId(unitId) }] } },
    { $project: { _id: 0, userId: 1, admin: 1 } },
  ])
  const adminIds = new Set(members.filter((member) => member.admin).map((member) => member.userId.toString()))
  const users = await User.find({ _id: { $in: members.map((member) => member.userId) } })
    .select({ name: 1, email: 1 })
    .lean()
  const named = users
    .map((user) => ({ id: user._id.toString(), name: user.name ?? user.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  return [...named.filter((user) => !adminIds.has(user.id)), ...named.filter((user) => adminIds.has(user.id))]
}

// "2026-09-29T09:00" em Brasília, formato do formulário que lib/booking espera.
const brtLocal = (date: Date) => toBrt(date).toISOString().slice(0, 16)

export function uraWalkDeps(workspaceId: string): WalkDeps {
  const unitOf = (unitId: string) =>
    isObjectIdOrHexString(unitId) ? Unit.findOne({ _id: unitId, workspaceId }).lean() : Promise.resolve(null)

  return {
    listServices: async (unitId) => {
      if (!(await unitOf(unitId))) return []
      const services = await Service.find({ unitId }).sort({ name: 1 }).lean()
      return services.map((service) => ({
        id: service._id.toString(),
        name: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
      }))
    },

    findSlots: async ({ unitId, durationMinutes, from, days }) => {
      const unit = await unitOf(unitId)
      if (!unit) return []
      const therapists = await unitTherapists(workspaceId, unitId)
      const unitIds = await Unit.find({ workspaceId }).distinct("_id")
      const until = new Date(from.getTime() + (days + 1) * DAY_MS)
      const bookings = await Booking.find({
        startsAt: { $lt: until },
        endsAt: { $gt: from },
        $or: [{ unitId: unit._id }, { unitId: { $in: unitIds }, therapistId: { $in: therapists.map((t) => t.id) } }],
      })
        .select({ therapistId: 1, "treatmentRoom.roomId": 1, startsAt: 1, endsAt: 1 })
        .lean()
      return availableSlots({
        from,
        days,
        durationMinutes,
        businessHours: unit.businessHours,
        therapists,
        rooms: unit.treatmentRooms.map((room) => ({ id: room._id.toString(), name: room.name, beds: room.beds })),
        bookings: bookings.map((booking) => ({
          therapistId: booking.therapistId.toString(),
          roomId: booking.treatmentRoom.roomId.toString(),
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        })),
      })
    },

    // Passa pelas mesmas validações do agendamento feito na tela (conflito, sala cheia).
    createBooking: async ({ unitId, serviceId, therapistId, roomId, startsAt, guestName, guestRoom }) => {
      const [unit, service, workspace] = await Promise.all([
        unitOf(unitId),
        isObjectIdOrHexString(serviceId) ? Service.findOne({ _id: serviceId, unitId }).lean() : null,
        Workspace.findById(workspaceId).select({ userId: 1 }).lean(),
      ])
      if (!unit || !service || !workspace) return { ok: false }
      const unitIds = await Unit.find({ workspaceId }).distinct("_id")
      const result = await createBooking(
        {
          therapistId,
          guestName: guestName.slice(0, MAX_GUEST_NAME) || "Cliente",
          room: guestRoom.slice(0, MAX_GUEST_ROOM) || "-",
          startsAt: brtLocal(startsAt),
          durationMinutes: String(service.durationMinutes),
          serviceId,
          treatmentRoomId: roomId,
          productIds: service.productIds.map((id) => id.toString()),
          color: null,
        },
        unitId,
        {
          ...bookingLookups({ workspaceId, unitId }, unitIds),
          // Agendamento feito pela URA fica em nome de quem criou o workspace.
          insert: async (data) => {
            const booking = await Booking.create({ ...data, createdBy: workspace.userId })
            return { id: booking._id.toString() }
          },
        },
      )
      return result.ok ? { ok: true, bookingId: result.bookingId } : { ok: false }
    },
  }
}

export function uraRunnerDeps(): RunnerDeps {
  return {
    now: () => new Date(),
    loadConversation,
    findActiveSession: async (conversationId) => {
      const doc = await UraSession.findOne({ conversationId, status: { $in: ACTIVE_SESSION_STATUSES } }).lean()
      return doc ? toRunnerSession(doc as SessionLean) : null
    },
    loadSession: async (sessionId) => {
      if (!isObjectIdOrHexString(sessionId)) return null
      const doc = await UraSession.findById(sessionId).lean()
      return doc ? toRunnerSession(doc as SessionLean) : null
    },
    listUras: async (workspaceId): Promise<TriggerUra[]> => {
      const uras = await Ura.find({ workspaceId, active: true }).sort({ createdAt: 1 }).select({ nodes: 1 }).lean()
      return uras.flatMap((ura) => {
        const start = ura.nodes.find((node) => node.type === "start")
        return start ? [{ id: ura._id.toString(), active: true, start: start.data as TriggerUra["start"] }] : []
      })
    },
    loadGraph: async (uraId) => {
      const ura = await Ura.findById(uraId).select({ active: 1, nodes: 1, edges: 1 }).lean()
      return ura ? { active: ura.active, graph: { nodes: ura.nodes, edges: ura.edges } as unknown as UraGraph } : null
    },
    createSession: async ({ workspaceId, uraId, conversationId, variables }) => {
      try {
        const doc = await UraSession.create({ workspaceId, uraId, conversationId, variables, status: "running" })
        return toRunnerSession(doc.toObject() as SessionLean)
      } catch (error) {
        if (isDuplicateKey(error)) return null
        throw error
      }
    },
    saveSession: async (sessionId, expectedVersion, update) => {
      const { trace, ...fields } = update
      const { matchedCount } = await UraSession.updateOne(
        { _id: sessionId, version: expectedVersion, status: { $in: ACTIVE_SESSION_STATUSES } },
        {
          $set: { ...fields, ...(update.status === "ended" && { endedAt: new Date() }) },
          $inc: { version: 1 },
          $push: { trace: { $each: trace, $slice: -MAX_TRACE } },
        },
      )
      return matchedCount > 0
    },
    send: sendUraMessage,
    schedule: scheduleTimer,
    closeConversation: async (conversationId) => {
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { status: "closed", assignedUserId: null, handedOff: false, unreadCount: 0 } },
      )
    },
    assignConversation: async (conversationId, userId) => {
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { handedOff: true, assignedUserId: userId && new Types.ObjectId(userId) } },
      )
    },
    walkDeps: uraWalkDeps,
  }
}
