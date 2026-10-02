"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { updateUnitMemberPay, type UpdateUnitMemberPayError } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/unit-member"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { Unit } from "@/models/Unit"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const errorMessages: Record<UpdateUnitMemberPayError | "unauthenticated", string> = {
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  forbidden: "Sua função não pode definir a remuneração da equipe.",
  member_not_found: "Usuário não encontrado nesta unidade.",
  invalid_input: "Dados inválidos.",
  invalid_commission: "Informe uma comissão entre 0% e 100%.",
  invalid_commission_base: "Escolha se a comissão é sobre os serviços da pessoa, sobre o bruto ou sobre o líquido da unidade.",
  invalid_salary: "Informe um salário mensal maior que zero.",
  invalid_bonus: "Cada bônus precisa de descrição (até 80 caracteres) e valor maior que zero.",
  invalid_start_date: "Data de início inválida.",
  invalid_pay_day: "Informe um dia de pagamento entre 1 e 31.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type UnitMemberFormState = { error: string | null }

// workspaceId e unitId vêm via argumento do cliente; o acesso é conferido aqui, no servidor.
export async function updateUnitMemberAction(
  workspaceId: string,
  unitId: string,
  memberId: string,
  _prev: UnitMemberFormState,
  formData: FormData,
): Promise<UnitMemberFormState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)

  // Membro e unidade precisam ser do workspace; ids inválidos contam como não encontrados.
  const valid = access && isObjectIdOrHexString(unitId) && isObjectIdOrHexString(memberId)
  const unitObjectId = valid ? new Types.ObjectId(unitId) : null
  // Só encontra quem está vinculado à unidade; o vínculo é feito no formulário da unidade.
  const filter = valid
    ? { _id: new Types.ObjectId(memberId), workspaceId: new Types.ObjectId(access.id), "units.unitId": unitObjectId }
    : null

  // Cada linha de bônus manda um par descrição/valor, na mesma ordem.
  const amounts = formData.getAll("bonusAmount")
  const bonuses = formData.getAll("bonusDescription").map((description, i) => ({ description, amount: amounts[i] }))

  const result = await updateUnitMemberPay(
    {
      startDate: formData.get("startDate"),
      payDay: formData.get("payDay"),
      commissionBase: formData.get("commissionBase"),
      commissionPercent: formData.get("commissionPercent"),
      salary: formData.get("salary"),
      bonuses,
    },
    memberId,
    { actor: access?.actor ?? null },
    {
      findMember: async () => {
        if (!filter || !(await Unit.exists({ _id: unitObjectId, workspaceId: filter.workspaceId }))) return null
        const member = await WorkspaceMember.findOne(filter).select({ _id: 1 }).lean()
        return member && { id: member._id.toString() }
      },
      update: async (_id, { startDate, payDay, commissionBase, commissionPercent, salaryCents, bonuses }) => {
        await WorkspaceMember.updateOne(filter!, {
          $set: {
            "units.$.startDate": startDate,
            "units.$.payDay": payDay,
            "units.$.commissionBase": commissionBase,
            "units.$.commissionPercent": commissionPercent,
            "units.$.salaryCents": salaryCents,
            "units.$.bonuses": bonuses,
          },
        })
      },
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
