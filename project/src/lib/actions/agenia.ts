"use server"

import { isObjectIdOrHexString, Types } from "mongoose"
import { actionFormEntries, mergePatch, parseAgeniaAction, type AgeniaActionName } from "@/lib/agenia-actions"
import { createAppointmentAction, deleteAppointmentAction } from "@/lib/actions/appointment"
import { createBookingAction, deleteBookingAction, rescheduleBookingAction } from "@/lib/actions/booking"
import { createExpenseAction, deleteExpenseAction, setExpensePaidAction } from "@/lib/actions/expense"
import { inviteMemberAction, removeMemberAction, updateMemberAction } from "@/lib/actions/member"
import { sendReplyAction } from "@/lib/actions/messaging"
import { createProductAction, deleteProductAction, updateProductAction } from "@/lib/actions/product"
import { createServiceAction, deleteServiceAction, updateServiceAction } from "@/lib/actions/service"
import { createTicketAction } from "@/lib/actions/ticket"
import {
  closeConversationAction,
  deleteUraAction,
  setUraActiveAction,
  stopConversationUraAction,
  takeConversationAction,
} from "@/lib/actions/ura"
import { Product } from "@/models/Product"
import { productScopeMatch } from "@/lib/product-scope"
import { findUnitScope, unitQuantityOf } from "@/lib/stock-store"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

export type AgeniaActionResult = { ok: true } | { ok: false; error: string }

type Input = Record<string, unknown>

const empty = { error: null }

function form(name: AgeniaActionName, input: Input) {
  const data = new FormData()
  for (const [key, value] of actionFormEntries(name, input)) data.append(key, value)
  return data
}

async function unitInWorkspace(workspaceId: string, unitId: string) {
  return !!(await Unit.exists({ _id: unitId, workspaceId: new Types.ObjectId(workspaceId) }))
}

// Valores atuais no formato da ação, para a edição parcial não apagar o que a IA não mandou.
async function currentService(workspaceId: string, input: Input) {
  if (!(await unitInWorkspace(workspaceId, String(input.unitId)))) return null
  const service = await Service.findOne({ _id: String(input.serviceId), unitId: String(input.unitId) }).lean()
  return (
    service && {
      name: service.name,
      price: service.priceCents / 100,
      durationMinutes: service.durationMinutes,
      productIds: service.productIds.map(String),
    }
  )
}

async function currentProduct(workspaceId: string, input: Input) {
  if (!(await unitInWorkspace(workspaceId, String(input.unitId)))) return null
  const { stock, scope } = await findUnitScope(String(input.unitId))
  const product = await Product.findOne({ _id: String(input.productId), ...productScopeMatch(scope) }).lean()
  return (
    product && {
      name: product.name,
      // No estoque distribuído, a edição mexe só na parte da unidade.
      quantity: stock?.distributed ? unitQuantityOf(product.unitQuantities, String(input.unitId)) : product.quantity,
      cost: product.costCents / 100,
      notes: product.notes,
      rating: product.rating,
      avatarUrl: product.avatarUrl,
    }
  )
}

const done = (state: { error: string | null } | void): AgeniaActionResult =>
  state?.error ? { ok: false, error: state.error } : { ok: true }

// Roda uma ação que o usuário autorizou no card da AgenIA. As server actions de cada área
// conferem sessão, função e posse dos registros, como quando o formulário é usado.
export async function runAgeniaAction(workspaceId: string, name: string, rawInput: unknown): Promise<AgeniaActionResult> {
  if (!isObjectIdOrHexString(workspaceId)) return { ok: false, error: "Workspace não encontrado." }
  const parsed = parseAgeniaAction(name, rawInput)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error === "unknown_action" ? "Ação desconhecida." : "Dados da ação inválidos." }
  }
  const i = parsed.input
  const s = (key: string) => String(i[key])

  switch (parsed.name) {
    case "createService":
      return done(await createServiceAction(workspaceId, s("unitId"), empty, form("createService", i)))
    case "updateService": {
      const current = await currentService(workspaceId, i)
      if (!current) return { ok: false, error: "Serviço não encontrado." }
      const merged = mergePatch(current, i as Partial<typeof current>)
      return done(await updateServiceAction(workspaceId, s("unitId"), s("serviceId"), empty, form("updateService", merged)))
    }
    case "deleteService":
      return done(await deleteServiceAction(workspaceId, s("unitId"), s("serviceId")))
    case "createProduct":
      return done(await createProductAction(workspaceId, s("unitId"), empty, form("createProduct", i)))
    case "updateProduct": {
      const current = await currentProduct(workspaceId, i)
      if (!current) return { ok: false, error: "Produto não encontrado." }
      const merged = mergePatch(current, i as Partial<typeof current>)
      return done(await updateProductAction(workspaceId, s("unitId"), s("productId"), empty, form("updateProduct", merged)))
    }
    case "deleteProduct":
      return done(await deleteProductAction(workspaceId, s("unitId"), s("productId")))
    case "createBooking":
      return done(await createBookingAction(workspaceId, empty, form("createBooking", i)))
    case "rescheduleBooking":
      return done(await rescheduleBookingAction(workspaceId, s("bookingId"), { startsAt: s("startsAt"), endsAt: s("endsAt") }))
    case "deleteBooking":
      return done(await deleteBookingAction(workspaceId, s("bookingId")))
    case "createAppointment":
      return done(await createAppointmentAction(workspaceId, s("unitId"), empty, form("createAppointment", i)))
    case "deleteAppointment":
      return done(await deleteAppointmentAction(workspaceId, s("unitId"), s("appointmentId")))
    case "createExpense":
      return done(await createExpenseAction(workspaceId, s("unitId"), empty, form("createExpense", i)))
    case "setExpensePaid":
      return done(await setExpensePaidAction(workspaceId, s("unitId"), s("expenseId"), i.paid === true))
    case "deleteExpense":
      return done(await deleteExpenseAction(workspaceId, s("unitId"), s("expenseId"), i.scope === "following" ? "following" : "this"))
    case "inviteMember":
      return done(await inviteMemberAction(workspaceId, empty, form("inviteMember", i)))
    case "updateMember":
      return done(await updateMemberAction(workspaceId, s("memberId"), empty, form("updateMember", i)))
    case "removeMember":
      return done(await removeMemberAction(workspaceId, s("memberId")))
    case "setUraActive":
      return done(await setUraActiveAction(workspaceId, s("uraId"), i.active === true))
    case "deleteUra":
      return done(await deleteUraAction(workspaceId, s("uraId")))
    case "sendReply":
      return done(await sendReplyAction(workspaceId, s("conversationId"), empty, form("sendReply", i)))
    case "takeConversation":
      return done(await takeConversationAction(workspaceId, s("conversationId")))
    case "closeConversation":
      return done(await closeConversationAction(workspaceId, s("conversationId")))
    case "stopConversationUra":
      return done(await stopConversationUraAction(workspaceId, s("conversationId")))
    case "createTicket":
      return done(await createTicketAction(workspaceId, empty, form("createTicket", i)))
  }
}
