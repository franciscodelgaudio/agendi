"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import type { StationInput } from "@/service/workspace/[workspaceId]/unit/[unitId]/station"
import {
  createUnit,
  deleteUnit,
  updateUnit,
  type CreateUnitError,
  type UpdateUnitError,
} from "@/service/workspace/[workspaceId]/unit/unit"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { StockItem } from "@/models/StockItem"
import { Stock } from "@/models/Stock"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { Service } from "@/models/Service"

const errorMessages: Record<Exclude<CreateUnitError | UpdateUnitError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos da unidade.",
  invalid_name: "Informe o nome da unidade.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_image_url: "Informe uma URL válida começando com http:// ou https://.",
  invalid_members: "Algum membro escolhido não é deste workspace. Recarregue a página.",
  no_stations: "Cadastre pelo menos uma estação.",
  too_many_stations: "Cadastre no máximo 20 estações.",
  invalid_station_name: "Informe o nome de cada estação.",
  station_name_too_long: "O nome da estação pode ter no máximo 40 caracteres.",
  duplicate_station_name: "Cada estação precisa de um nome diferente.",
  invalid_business_hours: "Informe o horário de funcionamento.",
  invalid_business_hours_order: "O horário de fechamento deve ser depois da abertura.",
  station_in_use: "Uma estação removida ainda tem agendamentos. Desative-a ou mova os agendamentos antes.",
  invalid_opening_balance: "Informe um saldo em caixa de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo em caixa.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type UnitFormState = { error: string | null }

function messageOf(error: CreateUnitError | UpdateUnitError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("units.manage") : errorMessages[error]
}

function toStationDocs(stations: StationInput[]) {
  return stations.map(({ id, name, active }) => ({ _id: new Types.ObjectId(id ?? undefined), name, active }))
}

function toObjectIds(ids: string[]) {
  return ids.map((id) => new Types.ObjectId(id))
}

function unitInput(formData: FormData) {
  return {
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    stations: {
      ids: formData.getAll("stationId"),
      names: formData.getAll("stationName"),
      active: formData.getAll("stationActive"),
    },
    businessHours: { opensAt: formData.get("opensAt"), closesAt: formData.get("closesAt") },
    workspaceMemberIds: formData.getAll("workspaceMemberId"),
    openingBalance: { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
  }
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function membersChecker(workspaceId: string) {
  return async (ids: string[]) =>
    (await WorkspaceMember.countDocuments({ _id: { $in: toObjectIds(ids) }, workspaceId })) === ids.length
}

function unitFilter(workspaceId: string, unitId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(unitId)) return null
  return { _id: new Types.ObjectId(unitId), workspaceId: new Types.ObjectId(workspaceId) }
}

export async function createUnitAction(
  workspaceId: string,
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await createUnit(unitInput(formData), session, {
    membersExist: membersChecker(session.workspaceId),
    insert: async ({ openingBalance, stations, workspaceMemberIds, ...data }) => {
      const unit = await Unit.create({
        ...data,
        stations: toStationDocs(stations),
        workspaceMemberIds: toObjectIds(workspaceMemberIds),
      })
      if (openingBalance) {
        await Wallet.create({
          name: unit.name.slice(0, 40),
          openingBalance,
          units: [{ unitId: unit._id, amountCents: null }],
          workspaceId: data.workspaceId,
        })
      }
      return { id: unit._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateUnitAction(
  workspaceId: string,
  unitId: string,
  _prev: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = unitFilter(session.workspaceId, unitId)

  const result = await updateUnit(unitInput(formData), filter && unitId, session, {
    membersExist: membersChecker(session.workspaceId),
    hasBookingsInRemovedStations: async (id, keptStationIds) => {
      if (!(await Unit.exists(filter!))) return false
      const inUse = await Booking.exists({
        unitId: id,
        endsAt: { $gt: new Date() },
        "station.stationId": { $nin: toObjectIds(keptStationIds) },
      })
      return inUse !== null
    },
    update: async (id, { stations, workspaceMemberIds, ...data }) => {
      const { matchedCount } = await Unit.updateOne(filter!, {
        $set: { ...data, stations: toStationDocs(stations), workspaceMemberIds: toObjectIds(workspaceMemberIds) },
      })
      if (matchedCount === 0) return false
      const keptStationIds = toObjectIds(stations.flatMap((station) => (station.id ? [station.id] : [])))
      await Service.updateMany({ unitId: id }, { $pull: { stationIds: { $nin: keptStationIds } } })
      return true
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteUnitAction(workspaceId: string, unitId: string): Promise<UnitFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = unitFilter(session.workspaceId, unitId)

  const result = await deleteUnit(filter && unitId, session, {
    remove: async (id) => {
      const { deletedCount } = await Unit.deleteOne(filter!)
      if (deletedCount === 0) return false
      const unitObjectId = new Types.ObjectId(id)
      await Promise.all([
        Service.deleteMany({ unitId: id }),
        Appointment.deleteMany({ unitId: id }),
        Wallet.updateMany({ "units.unitId": id }, { $pull: { units: { unitId: id } } }),
        StockItem.deleteMany({ holderId: unitObjectId }),
        Stock.updateMany({ "units.unitId": unitObjectId }, { $pull: { units: { unitId: unitObjectId } } }),
      ])
      const orphaned = await Stock.find({ workspaceId: session.workspaceId, units: { $size: 0 } }).select({ _id: 1 }).lean()
      if (orphaned.length > 0) {
        const ids = orphaned.map((stock) => stock._id)
        await Promise.all([StockItem.deleteMany({ holderId: { $in: ids } }), Stock.deleteMany({ _id: { $in: ids } })])
      }
      return true
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
