"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createPartner,
  deletePartner,
  updatePartner,
  type CreatePartnerError,
  type DeletePartnerError,
  type PartnerData,
  type UpdatePartnerError,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"
import { Partner } from "@/models/Partner"
import { Statement } from "@/models/Statement"
import { Unit } from "@/models/Unit"

type PartnerError = CreatePartnerError | UpdatePartnerError | DeletePartnerError

const errorMessages: Record<Exclude<PartnerError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome do parceiro.",
  name_too_long: "O nome pode ter no máximo 60 caracteres.",
  invalid_threshold_rule: "Escolha se o limite conta como \"acima de\" ou \"a partir de\".",
  invalid_tiers: "Cadastre de 1 a 10 faixas.",
  invalid_tier_threshold: "Informe o valor de cada limite, como 30.000,00.",
  invalid_tier_share: "Informe cada percentual entre 0% e 99,99%.",
  first_tier_not_zero: "A primeira faixa começa em R$ 0,00.",
  tiers_not_increasing: "Cada faixa precisa começar num valor maior que a anterior.",
  unit_not_found: "Unidade não encontrada neste workspace.",
  unit_has_partner: "Esta unidade já tem um parceiro.",
  partner_not_found: "Parceiro não encontrado. Recarregue a página.",
  partner_has_statements: "Este parceiro já tem fechamentos. Desvincule da unidade em vez de excluir.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type PartnerFormState = { error: string | null }

function messageOf(error: PartnerError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("partners.manage") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function workspaceFilter(workspaceId: string, id: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(id)) return null
  return { _id: new Types.ObjectId(id), workspaceId: new Types.ObjectId(workspaceId) }
}

function partnerInput(formData: FormData, unitId: string | null) {
  const thresholds = formData.getAll("tierThreshold")
  const shares = formData.getAll("tierShare")
  return {
    name: formData.get("name"),
    thresholdRule: formData.get("thresholdRule"),
    tiers: thresholds.map((threshold, index) => ({ threshold, share: shares[index] })),
    unitId,
  }
}

function partnerDoc(data: PartnerData) {
  return { ...data, unitId: data.unitId ? new Types.ObjectId(data.unitId) : null }
}

function unitExists(workspaceId: string) {
  return async (unitId: string) => {
    const filter = workspaceFilter(workspaceId, unitId)
    return !!filter && !!(await Unit.exists(filter))
  }
}

export async function createPartnerAction(
  workspaceId: string,
  unitId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await createPartner(partnerInput(formData, unitId), session, {
    unitExists: unitExists(session.workspaceId),
    insert: async ({ workspaceId: id, ...data }) => {
      const partner = await Partner.create({ ...partnerDoc(data), workspaceId: new Types.ObjectId(id) })
      return { id: partner._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updatePartnerAction(
  workspaceId: string,
  partnerId: string,
  unitId: string | null,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, partnerId)

  const result = await updatePartner(partnerInput(formData, unitId), filter && partnerId, session, {
    unitExists: unitExists(session.workspaceId),
    update: async (_id, data) => (await Partner.updateOne(filter!, { $set: partnerDoc(data) })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deletePartnerAction(workspaceId: string, partnerId: string): Promise<PartnerFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, partnerId)

  const result = await deletePartner(filter && partnerId, session, {
    hasStatements: async (id) => !!(await Statement.exists({ partnerId: new Types.ObjectId(id) })),
    remove: async () => (await Partner.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
