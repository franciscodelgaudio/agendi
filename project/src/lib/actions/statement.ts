"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  closeStatement,
  deleteStatement,
  settleReceivable,
  type CloseStatementError,
  type DeleteStatementError,
  type SettleReceivableError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import {
  findPartnerToClose,
  findPendingReceivable,
  findPendingReceivables,
  removeStatement,
  saveReceivableTransaction,
  saveStatement,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"

type StatementError = CloseStatementError | SettleReceivableError | DeleteStatementError

const errorMessages: Record<Exclude<StatementError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome do repasse.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_paid_at: "Informe um dia de recebimento válido.",
  invalid_received: "Informe o valor recebido.",
  invalid_period: "Escolha como definir o período.",
  invalid_period_start: "Informe um dia de início válido.",
  invalid_period_end: "Informe um dia de fim válido.",
  period_reversed: "O início do período deve ser antes do fim.",
  partner_not_found: "Parceiro não encontrado neste workspace.",
  partner_without_unit: "Este parceiro não está vinculado a nenhuma unidade.",
  unit_without_wallet: "A unidade deste parceiro não tem carteira. Vincule uma carteira antes.",
  no_pending_receivables: "Não há atendimentos pendentes no período.",
  receivable_not_found: "Recebível não encontrado ou já recebido. Recarregue a página.",
  receivable_has_partner: "Este atendimento é recebido pelo parceiro e entra no próximo repasse.",
  receivable_settled: "Algum atendimento já foi recebido ou entrou em outro repasse. Recarregue a página.",
  statement_not_found: "Repasse não encontrado. Recarregue a página.",
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
  partnerId: string,
  _prev: StatementFormState,
  formData: FormData,
): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await closeStatement(
    {
      name: formData.get("name"),
      paidAt: formData.get("paidAt"),
      received: formData.get("received"),
      period: formData.get("period"),
      from: formData.get("from"),
      to: formData.get("to"),
    },
    validId(partnerId),
    session,
    {
      findPartner: (id) => findPartnerToClose(session.workspaceId, id),
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

  const result = await settleReceivable({ paidAt: formData.get("paidAt") }, validId(receivableId), session, {
    findPendingReceivable: (id) => findPendingReceivable(session.workspaceId, id),
    save: saveReceivableTransaction,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteStatementAction(workspaceId: string, statementId: string): Promise<StatementFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await deleteStatement(validId(statementId), session, {
    remove: (id) => removeStatement(session.workspaceId, id),
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
