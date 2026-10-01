"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage, type UnitAccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findManagedUnit } from "@/service/workspace/[workspaceId]/unit/[unitId]/unit-access"
import {
  createExpense,
  deleteExpense,
  setExpensePaid,
  setGroupLimitForMonth,
  setGroupLimitFrom,
  updateExpense,
  type CreateExpenseError,
  type ExpenseScope,
  type UpdateExpenseError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import {
  createExpenseGroup,
  deleteExpenseGroup,
  updateExpenseGroup,
  updateGroupMonthLimit,
  type CreateExpenseGroupError,
  type DeleteExpenseGroupResult,
  type UpdateExpenseGroupError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group"
import { expenseGroupIconExists } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon-store"
import { groupLimitsOf } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"

type GroupError =
  | CreateExpenseGroupError
  | UpdateExpenseGroupError
  | Extract<DeleteExpenseGroupResult, { ok: false }>["error"]

const groupErrorMessages: Record<GroupError | "workspace_not_found" | "unauthenticated", string> = {
  invalid_input: "Informe o nome do grupo.",
  invalid_name: "Informe o nome do grupo.",
  name_too_long: "O nome pode ter no máximo 40 caracteres.",
  invalid_monthly_limit: "Informe um limite maior que zero, de até R$ 1.000.000,00.",
  invalid_limit_month: "Escolha o mês a partir do qual o limite vale.",
  invalid_icon: "Escolha um ícone da lista.",
  duplicate_group_name: "Já existe um grupo com esse nome nesta unidade.",
  group_has_expenses: "Este grupo tem despesas lançadas. Exclua ou mova as despesas antes.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  group_not_found: "Grupo não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

const expenseErrorMessages: Record<
  CreateExpenseError | UpdateExpenseError | "workspace_not_found" | "unauthenticated",
  string
> = {
  invalid_input: "Preencha grupo, descrição, valor e dia.",
  invalid_description: "Informe a descrição da despesa.",
  description_too_long: "A descrição pode ter no máximo 80 caracteres.",
  invalid_amount: "Informe um valor maior que zero, de até R$ 1.000.000,00.",
  invalid_date: "Informe o dia da despesa.",
  invalid_count: "Informe de 2 a 60 meses.",
  group_not_found: "Escolha um grupo desta unidade.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  expense_not_found: "Despesa não encontrada ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ExpenseActionState = { error: string | null }

// Usuário e unidade se o usuário gerenciar o caixa dela; senão a mensagem de erro, tirada de messages.
async function resolveUnit(
  workspaceId: string,
  unitId: string,
  messages: Record<Exclude<UnitAccessError, "forbidden"> | "unauthenticated", string>,
): Promise<{ userId: string; unitId: string } | { error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: messages.unauthenticated }
  const access = await findManagedUnit(workspaceId, unitId, userId, "cash_flow.manage")
  if (!access.ok) return { error: access.error === "forbidden" ? forbiddenMessage("cash_flow.manage") : messages[access.error] }
  return { userId, unitId: access.unit.unitId }
}

// A escrita ainda filtra por unitId.
function ownedId(id: string) {
  return isObjectIdOrHexString(id) ? id : null
}

// Mesma regra do índice único: sem diferenciar maiúsculas nem acentos.
const PT_COLLATION = { locale: "pt", strength: 1 }

async function isGroupNameTaken(unitId: string, name: string, excludeId: string | null) {
  const filter = { unitId, name, ...(excludeId && { _id: { $ne: excludeId } }) }
  return !!(await ExpenseGroup.exists(filter).collation(PT_COLLATION))
}

async function groupExists(unitId: string, groupId: string) {
  return isObjectIdOrHexString(groupId) && !!(await ExpenseGroup.exists({ _id: groupId, unitId }))
}

// Filtro das despesas atingidas: esta, ou esta e as próximas da mesma série (despesa à vista
// só tem ela mesma). null quando a despesa não existe na unidade.
async function scopeFilter(unitId: string, expenseId: string, scope: ExpenseScope) {
  const expense = await Expense.findOne({ _id: expenseId, unitId }).select({ series: 1 }).lean()
  if (!expense) return null
  if (scope === "this" || !expense.series) return { _id: expense._id }
  return { unitId, "series.id": expense.series.id, "series.number": { $gte: expense.series.number } }
}

function groupInput(formData: FormData) {
  return {
    name: formData.get("name"),
    monthlyLimit: formData.get("monthlyLimit"),
    limitFrom: formData.get("limitFrom"),
    iconId: formData.get("iconId"),
  }
}

function expenseInput(formData: FormData) {
  return {
    groupId: formData.get("groupId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    paid: formData.get("paid"),
    repeat: formData.get("repeat"),
    count: formData.get("count"),
    scope: formData.get("scope"),
  }
}

// workspaceId e unitId vêm via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createExpenseGroupAction(
  workspaceId: string,
  unitId: string,
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, groupErrorMessages)
  if ("error" in target) return target

  const result = await createExpenseGroup(groupInput(formData), target.unitId, {
    insert: async (data) => ({ id: (await ExpenseGroup.create(data))._id.toString() }),
    isNameTaken: isGroupNameTaken,
    iconExists: expenseGroupIconExists,
  })
  if (!result.ok) return { error: groupErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function updateExpenseGroupAction(
  workspaceId: string,
  unitId: string,
  groupId: string,
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, groupErrorMessages)
  if ("error" in target) return target

  const result = await updateExpenseGroup(groupInput(formData), target.unitId, ownedId(groupId), {
    update: async (id, data, limit) => {
      const group = await ExpenseGroup.findOne({ _id: id, unitId: target.unitId }).select({ limitChanges: 1 }).lean()
      if (!group) return false
      const limitChanges = setGroupLimitFrom(groupLimitsOf(group).limitChanges, limit.month, limit.cents)
      const { matchedCount } = await ExpenseGroup.updateOne(
        { _id: id, unitId: target.unitId },
        { $set: { ...data, limitChanges } },
      )
      return matchedCount > 0
    },
    isNameTaken: isGroupNameTaken,
    iconExists: expenseGroupIconExists,
  })
  if (!result.ok) return { error: groupErrorMessages[result.error] }

  refresh()
  return { error: null }
}

// Limite de um mês só, editado na tabela mês a mês. limit vem como o do AmountInput ("150.00") ou vazio.
export async function updateGroupMonthLimitAction(
  workspaceId: string,
  unitId: string,
  groupId: string,
  month: string,
  limit: string,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, groupErrorMessages)
  if ("error" in target) return target

  const result = await updateGroupMonthLimit({ month, limit }, target.unitId, ownedId(groupId), {
    setMonthLimit: async (id, limitMonth, cents) => {
      const group = await ExpenseGroup.findOne({ _id: id, unitId: target.unitId })
        .select({ monthlyLimitCents: 1, limitChanges: 1 })
        .lean()
      if (!group) return false
      const limitChanges = setGroupLimitForMonth(groupLimitsOf(group), limitMonth, cents)
      const { matchedCount } = await ExpenseGroup.updateOne(
        { _id: id, unitId: target.unitId },
        { $set: { limitChanges } },
      )
      return matchedCount > 0
    },
  })
  if (!result.ok) return { error: groupErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteExpenseGroupAction(
  workspaceId: string,
  unitId: string,
  groupId: string,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, groupErrorMessages)
  if ("error" in target) return target

  const result = await deleteExpenseGroup(ownedId(groupId), {
    hasExpenses: async (id) => !!(await Expense.exists({ groupId: id, unitId: target.unitId })),
    remove: async (id) => (await ExpenseGroup.deleteOne({ _id: id, unitId: target.unitId })).deletedCount > 0,
  })
  if (!result.ok) return { error: groupErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function createExpenseAction(
  workspaceId: string,
  unitId: string,
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, expenseErrorMessages)
  if ("error" in target) return target

  const result = await createExpense(expenseInput(formData), target.unitId, {
    insert: async (entries) => {
      const docs = await Expense.insertMany(entries.map((entry) => ({ ...entry, createdBy: target.userId })))
      return docs.map((doc) => doc._id.toString())
    },
    groupExists,
    newSeriesId: () => new Types.ObjectId().toString(),
    now: new Date(),
  })
  if (!result.ok) return { error: expenseErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function updateExpenseAction(
  workspaceId: string,
  unitId: string,
  expenseId: string,
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, expenseErrorMessages)
  if ("error" in target) return target

  const result = await updateExpense(expenseInput(formData), target.unitId, ownedId(expenseId), {
    update: async (id, data, scope) => {
      const filter = await scopeFilter(target.unitId, id, scope)
      if (!filter) return false
      await Expense.updateMany(filter, { $set: data })
      return true
    },
    groupExists,
  })
  if (!result.ok) return { error: expenseErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function setExpensePaidAction(
  workspaceId: string,
  unitId: string,
  expenseId: string,
  paid: boolean,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, expenseErrorMessages)
  if ("error" in target) return target

  const result = await setExpensePaid(ownedId(expenseId), paid, {
    update: async (id, paidAt) => {
      const { matchedCount } = await Expense.updateOne({ _id: id, unitId: target.unitId }, { $set: { paidAt } })
      return matchedCount > 0
    },
    now: new Date(),
  })
  if (!result.ok) return { error: expenseErrorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteExpenseAction(
  workspaceId: string,
  unitId: string,
  expenseId: string,
  scope: ExpenseScope,
): Promise<ExpenseActionState> {
  const target = await resolveUnit(workspaceId, unitId, expenseErrorMessages)
  if ("error" in target) return target

  const result = await deleteExpense(ownedId(expenseId), scope, async (id, scope) => {
    const filter = await scopeFilter(target.unitId, id, scope)
    if (!filter) return false
    await Expense.deleteMany(filter)
    return true
  })
  if (!result.ok) return { error: expenseErrorMessages[result.error] }

  refresh()
  return { error: null }
}
