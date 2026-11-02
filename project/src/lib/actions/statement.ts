"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  closeStatement,
  deleteStatement,
  payStatement,
  settleReceivable,
  type CloseStatementError,
  type DeleteStatementError,
  type PayStatementError,
  type SettleReceivableError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import {
  findPendingReceivable,
  findPendingReceivables,
  findStatementPaid,
  findStatementToPay,
  payStatementWith,
  removeUnpaidStatement,
  saveStatement,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"
import { Unit } from "@/models/Unit"

type StatementError = CloseStatementError | SettleReceivableError | PayStatementError | DeleteStatementError

const errorMessages: Record<Exclude<StatementError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome do fechamento.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_pass_on: "Informe um repasse entre 0,01% e 100%, como 70 ou 62,5.",
  invalid_paid_at: "Informe um dia de pagamento válido.",
  unit_not_found: "Unidade não encontrada neste workspace.",
  unit_without_wallet: "Esta unidade não tem carteira. Vincule uma carteira antes.",
  no_pending_receivables: "Não há recebíveis pendentes para fechar.",
  receivable_not_found: "Recebível não encontrado ou já fechado. Recarregue a página.",
  receivable_settled: "Algum recebível já entrou em outro fechamento. Recarregue a página.",
  statement_not_found: "Fechamento não encontrado. Recarregue a página.",
  statement_paid: "Este fechamento já foi pago.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type StatementFormState = { error: string | null }

function messageOf(error: StatementError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("cash_flow.manage") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function validId(id: string) {
  return isObjectIdOrHexString(id) ? id : null
}

export async function closeStatementAction(
  workspaceId: string,
  unitId: string,
  _prev: StatementFormState,
  formData: FormData,
): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await closeStatement(
    { name: formData.get("name"), passOn: formData.get("passOn"), paidAt: formData.get("paidAt") },
    validId(unitId),
    { ...session, now: new Date() },
    {
      findUnit: async (id) => {
        const unit = await Unit.findOne({ _id: id, workspaceId: new Types.ObjectId(session.workspaceId) })
          .select({ walletId: 1 })
          .lean()
        return unit ? { walletId: unit.walletId?.toString() ?? null } : null
      },
      findPending: findPendingReceivables,
      save: saveStatement,
    },
  )

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function settleReceivableAction(
  workspaceId: string,
  receivableId: string,
  _prev: StatementFormState,
  formData: FormData,
): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await settleReceivable(
    { passOn: formData.get("passOn"), paidAt: formData.get("paidAt") },
    validId(receivableId),
    { ...session, now: new Date() },
    {
      findPendingReceivable: (id) => findPendingReceivable(session.workspaceId, id),
      save: saveStatement,
    },
  )

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function payStatementAction(
  workspaceId: string,
  statementId: string,
  _prev: StatementFormState,
  formData: FormData,
): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await payStatement({ paidAt: formData.get("paidAt") }, validId(statementId), session, {
    findStatement: (id) => findStatementToPay(session.workspaceId, id),
    pay: (id, transaction) => payStatementWith(session.workspaceId, id, transaction),
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteStatementAction(workspaceId: string, statementId: string): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await deleteStatement(validId(statementId), session, {
    findStatement: (id) => findStatementPaid(session.workspaceId, id),
    remove: (id) => removeUnpaidStatement(session.workspaceId, id),
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
