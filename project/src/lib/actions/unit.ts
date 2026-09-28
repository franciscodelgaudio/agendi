"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { planUnitTeam, type PlanUnitTeamError, type UnitTeamPlan } from "@/lib/unit-team"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import type { TreatmentRoomInput } from "@/lib/treatment-room"
import {
  createUnit,
  deleteUnit,
  updateUnit,
  type CreateUnitError,
  type UpdateUnitError,
} from "@/lib/unit"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Unit } from "@/models/Unit"
import { Service } from "@/models/Service"
import { WorkspaceMember } from "@/models/WorkspaceMember"

const errorMessages: Record<CreateUnitError | UpdateUnitError | PlanUnitTeamError | "unauthenticated", string> = {
  invalid_input: "Informe o nome da unidade.",
  invalid_name: "Informe o nome da unidade.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_avatar_url: "Informe uma URL válida começando com http:// ou https://.",
  invalid_ownership: "Informe onde a unidade funciona.",
  invalid_period: "Escolha o período do faturamento.",
  too_many_tiers: "Cadastre no máximo 10 faixas.",
  invalid_tier_limit: "Os limites das faixas devem ser valores maiores que zero, em ordem crescente.",
  invalid_tier_percent: "Os percentuais devem estar entre 0 e 100, com até 2 casas decimais.",
  no_treatment_rooms: "Cadastre pelo menos uma sala.",
  too_many_treatment_rooms: "Cadastre no máximo 20 salas.",
  invalid_treatment_room_name: "Informe o nome de cada sala.",
  treatment_room_name_too_long: "O nome da sala pode ter no máximo 40 caracteres.",
  duplicate_treatment_room_name: "Cada sala precisa de um nome diferente.",
  invalid_treatment_room_beds: "Cada sala precisa ter de 1 a 10 macas.",
  invalid_business_hours: "Informe o horário de funcionamento.",
  invalid_business_hours_order: "O horário de fechamento deve ser depois da abertura.",
  treatment_room_in_use: "Uma sala removida ainda tem agendamentos. Mova ou exclua os agendamentos antes.",
  invalid_opening_balance: "Informe um saldo em caixa de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo em caixa.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  forbidden: "Sem permissão para alterar a equipe.",
  invalid_team: "Escolha só massagistas e recepcionistas deste workspace.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type CreateUnitState = { error: string | null }
export type UpdateUnitState = CreateUnitState
export type DeleteUnitState = CreateUnitState

// Acesso ao workspace se o usuário puder gerenciá-lo (dono ou administrador); senão undefined.
async function findManagedAccess(workspaceId: string, userId: string) {
  const access = await findWorkspaceAccess(workspaceId, userId)
  return access && canManageMembers(access.role) ? access : undefined
}

// Quem vincular e desvincular, conferido antes de gravar a unidade. unitId null = unidade nova.
async function planTeam(formData: FormData, workspaceId: string, role: WorkspaceRole, unitId: string | null) {
  const members = await WorkspaceMember.find({ workspaceId }).select({ role: 1, units: 1 }).lean()
  return planUnitTeam(
    formData.getAll("teamMemberId"),
    members.map((member) => ({
      id: member._id.toString(),
      role: member.role,
      linked: !!unitId && member.units.some((unit) => unit.unitId.equals(unitId)),
    })),
    role,
  )
}

// Quem entra começa sem remuneração, definida depois na Equipe; quem já estava fica como está.
async function applyTeam(workspaceId: string, unitId: string, { link, unlink }: Extract<UnitTeamPlan, { ok: true }>) {
  const unitObjectId = new Types.ObjectId(unitId)
  const ids = (list: string[]) => ({ _id: { $in: list.map((id) => new Types.ObjectId(id)) }, workspaceId })
  await Promise.all([
    link.length &&
      WorkspaceMember.updateMany(ids(link), {
        $push: { units: { unitId: unitObjectId, commissionPercent: null, salaryCents: null } },
      }),
    unlink.length && WorkspaceMember.updateMany(ids(unlink), { $pull: { units: { unitId: unitObjectId } } }),
  ])
}

// Sala nova ganha id aqui; a que já existia mantém o seu, e com ele os agendamentos.
function toTreatmentRoomDocs(rooms: TreatmentRoomInput[]) {
  return rooms.map(({ id, name, beds }) => ({ _id: new Types.ObjectId(id ?? undefined), name, beds }))
}

// A ordem dos campos no FormData forma as faixas (um limite para cada, menos a última) e as salas.
function unitInput(formData: FormData) {
  return {
    name: formData.get("name"),
    avatarUrl: formData.get("avatarUrl"),
    ownership: formData.get("ownership"),
    revenueShare: {
      period: formData.get("revenueSharePeriod"),
      limits: formData.getAll("tierLimit"),
      percents: formData.getAll("tierPercent"),
    },
    treatmentRooms: {
      ids: formData.getAll("treatmentRoomId"),
      names: formData.getAll("treatmentRoomName"),
      beds: formData.getAll("treatmentRoomBeds"),
    },
    businessHours: { opensAt: formData.get("opensAt"), closesAt: formData.get("closesAt") },
    openingBalance: { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
  }
}

// workspaceId vem via argumento do cliente; a posse é conferida aqui, no servidor.
export async function createUnitAction(
  workspaceId: string,
  _prev: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }

  const access = await findManagedAccess(workspaceId, userId)
  const team = access && (await planTeam(formData, access.id, access.role, null))
  if (team && !team.ok) return { error: errorMessages[team.error] }

  const result = await createUnit(
    unitInput(formData),
    access?.id,
    async (data) => {
      const unit = await Unit.create({ ...data, treatmentRooms: toTreatmentRoomDocs(data.treatmentRooms) })
      const id = unit._id.toString()
      if (team) await applyTeam(data.workspaceId, id, team)
      return { id }
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// Só repassa o unitId quando o usuário gerencia o workspace; a escrita ainda filtra
// por workspaceId para que uma unidade de outro workspace não seja encontrado.
// null = sessão expirada.
async function resolveUnitTarget(workspaceId: string, unitId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findManagedAccess(workspaceId, userId)
  return { ownedId: access?.id, role: access?.role, unitId: access && isObjectIdOrHexString(unitId) ? unitId : null }
}

export async function updateUnitAction(
  workspaceId: string,
  unitId: string,
  _prev: UpdateUnitState,
  formData: FormData,
): Promise<UpdateUnitState> {
  const target = await resolveUnitTarget(workspaceId, unitId)
  if (!target) return { error: errorMessages.unauthenticated }
  const team = target.ownedId && target.role && (await planTeam(formData, target.ownedId, target.role, target.unitId))
  if (team && !team.ok) return { error: errorMessages[team.error] }

  const result = await updateUnit(
    unitInput(formData),
    target.unitId,
    async (id, { name, avatarUrl, revenueShare, treatmentRooms, businessHours }) => {
      // Campos null saem do documento em vez de ficarem gravados como null.
      const $unset = { ...(!avatarUrl && { avatarUrl: 1 }), ...(!revenueShare && { revenueShare: 1 }) }
      const { matchedCount } = await Unit.updateOne(
        { _id: id, workspaceId: target.ownedId },
        {
          $set: {
            name,
            treatmentRooms: toTreatmentRoomDocs(treatmentRooms),
            businessHours,
            ...(avatarUrl && { avatarUrl }),
            ...(revenueShare && { revenueShare }),
          },
          ...(Object.keys($unset).length && { $unset }),
        },
      )
      if (matchedCount === 0) return false
      if (team) await applyTeam(target.ownedId!, id, team)
      return true
    },
    async (id, keptRoomIds) => {
      // Unidade de outro workspace não é consultada; a escrita depois devolve unit_not_found.
      if (!(await Unit.exists({ _id: id, workspaceId: target.ownedId }))) return false
      const inUse = await Booking.exists({
        unitId: id,
        endsAt: { $gt: new Date() },
        "treatmentRoom.roomId": { $nin: keptRoomIds.map((roomId) => new Types.ObjectId(roomId)) },
      })
      return inUse !== null
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteUnitAction(workspaceId: string, unitId: string): Promise<DeleteUnitState> {
  const target = await resolveUnitTarget(workspaceId, unitId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await deleteUnit(target.unitId, async (id) => {
    const { deletedCount } = await Unit.deleteOne({ _id: id, workspaceId: target.ownedId })
    if (deletedCount === 0) return false
    await Promise.all([
      Service.deleteMany({ unitId: id }),
      Appointment.deleteMany({ unitId: id }),
      WorkspaceMember.updateMany({ "units.unitId": id }, { $pull: { units: { unitId: id } } }),
    ])
    return true
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
