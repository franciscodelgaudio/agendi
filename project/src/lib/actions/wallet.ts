"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/lib/session"
import { can } from "@/lib/permissions"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import {
  createWallet,
  deleteWallet,
  updateWallet,
  type CreateWalletError,
  type UpdateWalletError,
  type WalletUnit,
} from "@/lib/wallet"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"

const errorMessages: Record<CreateWalletError | UpdateWalletError | "unauthenticated", string> = {
  invalid_input: "Informe o nome, o saldo e as unidades da carteira.",
  invalid_name: "Informe o nome da carteira.",
  name_too_long: "O nome pode ter no máximo 40 caracteres.",
  invalid_opening_balance: "Informe um saldo de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo.",
  no_units: "Escolha pelo menos uma unidade.",
  invalid_units: "Escolha só unidades deste workspace.",
  invalid_unit_amount: "Informe o valor de cada unidade, de até R$ 1.000.000,00.",
  distribution_exceeds_balance: "A soma dos valores das unidades passa do saldo da carteira.",
  unit_in_other_wallet: "Uma das unidades já está em outra carteira. Tire-a de lá antes.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  wallet_not_found: "Carteira não encontrada ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type WalletActionState = { error: string | null }

// Id do workspace se o usuário gerenciar o caixa nele; undefined sem permissão, null = sessão expirada.
async function resolveWorkspace(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access && can(access.actor, "cash_flow.manage") ? access.id : undefined }
}

// Unidades marcadas (unitId) com o valor de cada uma no campo unitAmount-<id>.
function walletInput(formData: FormData) {
  return {
    name: formData.get("name"),
    openingBalance: { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
    distributed: formData.get("distributed"),
    units: formData.getAll("unitId").map((unitId) => ({ unitId, amount: formData.get(`unitAmount-${unitId}`) })),
  }
}

function unitsExist(workspaceId: string, unitIds: string[]) {
  return Unit.countDocuments({ _id: { $in: unitIds }, workspaceId }).then((count) => count === unitIds.length)
}

async function unitsInOtherWallet(unitIds: string[], excludeId: string | null) {
  const filter = { "units.unitId": { $in: unitIds }, ...(excludeId && { _id: { $ne: excludeId } }) }
  return !!(await Wallet.exists(filter))
}

function toUnitDocs(units: WalletUnit[]) {
  return units.map(({ unitId, amountCents }) => ({ unitId: new Types.ObjectId(unitId), amountCents }))
}

export async function createWalletAction(
  workspaceId: string,
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const result = await createWallet(walletInput(formData), target.workspaceId, {
    unitsExist,
    unitsInOtherWallet,
    insert: async ({ units, ...data }) => {
      const wallet = await Wallet.create({ ...data, units: toUnitDocs(units) })
      return { id: wallet._id.toString() }
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

// A escrita filtra por workspaceId para que uma carteira de outro workspace não seja encontrada.
export async function updateWalletAction(
  workspaceId: string,
  walletId: string,
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(walletId) ? walletId : null
  const result = await updateWallet(walletInput(formData), target.workspaceId, id, {
    unitsExist,
    unitsInOtherWallet,
    update: async (walletId, { units, ...data }) => {
      const { matchedCount } = await Wallet.updateOne(
        { _id: walletId, workspaceId: target.workspaceId },
        { $set: { ...data, units: toUnitDocs(units) } },
      )
      return matchedCount > 0
    },
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}

export async function deleteWalletAction(workspaceId: string, walletId: string): Promise<WalletActionState> {
  const target = await resolveWorkspace(workspaceId)
  if (!target) return { error: errorMessages.unauthenticated }

  const id = target.workspaceId && isObjectIdOrHexString(walletId) ? walletId : null
  const result = await deleteWallet(id, async (walletId) => {
    const { deletedCount } = await Wallet.deleteOne({ _id: walletId, workspaceId: target.workspaceId })
    return deletedCount > 0
  })
  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
