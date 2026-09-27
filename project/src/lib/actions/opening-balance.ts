"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { canManageMembers } from "@/lib/member"
import { updateOpeningBalance, type UpdateOpeningBalanceResult } from "@/lib/opening-balance"
import { getSessionUserId } from "@/lib/session"
import { findWorkspaceAccess } from "@/lib/workspace-access"
import { Unit } from "@/models/Unit"

type ErrorCode = Extract<UpdateOpeningBalanceResult, { ok: false }>["error"] | "unauthenticated"

const errorMessages: Record<ErrorCode, string> = {
  invalid_input: "Informe o saldo em caixa.",
  invalid_opening_balance: "Informe um saldo em caixa de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo em caixa.",
  unit_not_found: "Unidade não encontrada ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type OpeningBalanceState = { error: string | null }

// Só dono ou administrador altera o saldo; a escrita filtra pelo workspace conferido.
export async function updateOpeningBalanceAction(
  workspaceId: string,
  unitId: string,
  _prev: OpeningBalanceState,
  formData: FormData,
): Promise<OpeningBalanceState> {
  const userId = await getSessionUserId()
  if (!userId) return { error: errorMessages.unauthenticated }
  const access = await findWorkspaceAccess(workspaceId, userId)
  const managed = access && canManageMembers(access.role) ? access : undefined

  const result = await updateOpeningBalance(
    { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
    managed && isObjectIdOrHexString(unitId) ? unitId : null,
    async (id, openingBalance) => {
      const { matchedCount } = await Unit.updateOne(
        { _id: id, workspaceId: managed!.id },
        openingBalance ? { $set: { openingBalance } } : { $unset: { openingBalance: 1 } },
      )
      return matchedCount > 0
    },
  )

  if (!result.ok) return { error: errorMessages[result.error] }

  refresh()
  return { error: null }
}
