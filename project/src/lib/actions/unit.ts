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
  type InventoryRef,
  type UpdateUnitError,
  type WalletRef,
} from "@/service/workspace/[workspaceId]/unit/unit"
import { insertWallet } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import { Appointment } from "@/models/Appointment"
import { Inventory } from "@/models/Inventory"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"
import { WorkspaceMember } from "@/models/WorkspaceMember"

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
  invalid_opening_balance: "Informe um saldo inicial de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo inicial.",
  invalid_wallet: "Escolha a carteira da unidade.",
  invalid_wallet_name: "Informe o nome da carteira nova.",
  wallet_name_too_long: "O nome da carteira pode ter no máximo 40 caracteres.",
  invalid_inventory: "Escolha o inventário da unidade.",
  invalid_inventory_name: "Informe o nome do inventário novo.",
  inventory_name_too_long: "O nome do inventário pode ter no máximo 40 caracteres.",
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
    walletId: formData.get("walletId"),
    walletName: formData.get("walletName"),
    openingBalance: { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
    inventoryId: formData.get("inventoryId"),
    inventoryName: formData.get("inventoryName"),
  }
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function refsChecker(workspaceId: string) {
  return {
    membersExist: async (ids: string[]) =>
      (await WorkspaceMember.countDocuments({ _id: { $in: toObjectIds(ids) }, workspaceId })) === ids.length,
    walletExists: async (id: string) => !!(await Wallet.exists({ _id: id, workspaceId })),
    inventoryExists: async (id: string) => !!(await Inventory.exists({ _id: id, workspaceId })),
  }
}

async function resolveWallet(workspaceId: string, wallet: WalletRef) {
  if ("id" in wallet) return new Types.ObjectId(wallet.id)
  return new Types.ObjectId((await insertWallet({ workspaceId, ...wallet })).id)
}

async function resolveInventory(workspaceId: string, inventory: InventoryRef) {
  if ("id" in inventory) return new Types.ObjectId(inventory.id)
  return (await Inventory.create({ workspaceId, name: inventory.name }))._id
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
    ...refsChecker(session.workspaceId),
    insert: async ({ stations, workspaceMemberIds, wallet, inventory, ...data }) => {
      const unit = await Unit.create({
        ...data,
        stations: toStationDocs(stations),
        workspaceMemberIds: toObjectIds(workspaceMemberIds),
        walletId: await resolveWallet(data.workspaceId, wallet),
        inventoryId: await resolveInventory(data.workspaceId, inventory),
      })
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
    ...refsChecker(session.workspaceId),
    hasBookingsInRemovedStations: async (id, keptStationIds) => {
      if (!(await Unit.exists(filter!))) return false
      const inUse = await Appointment.exists({
        unitId: id,
        status: "scheduled",
        endsAt: { $gt: new Date() },
        stationId: { $nin: toObjectIds(keptStationIds) },
      })
      return inUse !== null
    },
    update: async (id, { stations, workspaceMemberIds, wallet, inventory, ...data }) => {
      if (!(await Unit.exists(filter!))) return false
      const { matchedCount } = await Unit.updateOne(filter!, {
        $set: {
          ...data,
          stations: toStationDocs(stations),
          workspaceMemberIds: toObjectIds(workspaceMemberIds),
          walletId: await resolveWallet(session.workspaceId, wallet),
          inventoryId: await resolveInventory(session.workspaceId, inventory),
        },
      })
      return matchedCount > 0
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
      await Appointment.deleteMany({ unitId: id })
      return true
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
