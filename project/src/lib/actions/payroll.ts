"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import {
  recordPayrollPayment,
  removePayrollPayment,
  type PayrollPaymentError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/team/payroll"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { PayrollPayment } from "@/models/PayrollPayment"
import { Unit } from "@/models/Unit"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const errorMessages: Record<PayrollPaymentError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Sua função não pode gerenciar o caixa.",
  member_not_found: "Pessoa não encontrada nesta unidade.",
  invalid_input: "Dados inválidos.",
  invalid_month: "Mês inválido.",
  invalid_date: "Informe um dia de pagamento válido.",
  invalid_amount: "Informe um salário ou uma comissão maior que zero.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type PayrollActionState = { error: string | null }

// Acesso ao workspace e o filtro de quem está vinculado à unidade; ids inválidos contam como não encontrados.
async function resolveTarget(workspaceId: string, unitId: string, memberId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  const valid = access && isObjectIdOrHexString(unitId) && isObjectIdOrHexString(memberId)
  const unitObjectId = valid ? new Types.ObjectId(unitId) : null
  const workspaceObjectId = valid ? new Types.ObjectId(access.id) : null
  return {
    userId,
    actor: access?.actor ?? null,
    key: valid ? { unitId: unitObjectId!, memberId: new Types.ObjectId(memberId) } : null,
    findMember: async () => {
      if (!valid || !(await Unit.exists({ _id: unitObjectId, workspaceId: workspaceObjectId }))) return null
      const member = await WorkspaceMember.findOne({
        _id: new Types.ObjectId(memberId),
        workspaceId: workspaceObjectId,
        "units.unitId": unitObjectId,
      })
        .select({ _id: 1 })
        .lean()
      return member && { id: member._id.toString() }
    },
    workspaceObjectId,
  }
}

// Grava a folha da pessoa no mês: com dia do pagamento, paga; sem, só ajusta o valor no caixa.
export async function recordPayrollPaymentAction(
  workspaceId: string,
  unitId: string,
  memberId: string,
  month: string,
  _prev: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const target = await resolveTarget(workspaceId, unitId, memberId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await recordPayrollPayment(
    { month, paidOn: formData.get("paidOn"), salary: formData.get("salary"), commission: formData.get("commission") },
    memberId,
    { actor: target.actor },
    {
      findMember: target.findMember,
      save: async (_id, payment) => {
        await PayrollPayment.updateOne(
          { ...target.key!, month: payment.month },
          {
            $set: { ...payment, workspaceId: target.workspaceObjectId },
            $setOnInsert: { createdBy: new Types.ObjectId(target.userId) },
          },
          { upsert: true },
        )
      },
    },
  )
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Exclui o registro do mês: o caixa volta a usar o valor calculado.
export async function removePayrollPaymentAction(
  workspaceId: string,
  unitId: string,
  memberId: string,
  month: string,
): Promise<PayrollActionState> {
  const target = await resolveTarget(workspaceId, unitId, memberId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await removePayrollPayment(month, memberId, { actor: target.actor }, {
    findMember: target.findMember,
    remove: async (_id, removedMonth) => {
      await PayrollPayment.deleteOne({ ...target.key!, month: removedMonth })
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
