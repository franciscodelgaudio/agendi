"use server"

import { refresh } from "next/cache"
import { Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { setupUnit, type SetupUnitResult } from "@/service/workspace/[workspaceId]/unit/unit-setup"
import { saveUnitSetup } from "@/service/workspace/[workspaceId]/unit/unit-setup-store"
import { Inventory } from "@/models/Inventory"
import { Wallet } from "@/models/Wallet"
import { WorkspaceMember } from "@/models/WorkspaceMember"

type SetupStep = "wallet" | "inventory" | "services" | "partner" | "unit"

const stepMessages: Record<SetupStep, Record<string, string>> = {
  wallet: {
    invalid_input: "Escolha a carteira da unidade.",
    invalid_wallet: "Escolha a carteira da unidade.",
    invalid_wallet_name: "Informe o nome da carteira nova.",
    wallet_name_too_long: "O nome da carteira pode ter no máximo 40 caracteres.",
    invalid_opening_balance: "Informe um saldo inicial de até R$ 1.000.000,00.",
    invalid_opening_balance_date: "Informe o dia do saldo inicial.",
  },
  inventory: {
    invalid_input: "Escolha o estoque da unidade.",
    invalid_inventory: "Escolha o estoque da unidade.",
    invalid_inventory_name: "Informe o nome do estoque novo.",
    inventory_name_too_long: "O nome do estoque pode ter no máximo 40 caracteres.",
  },
  services: {
    no_services: "Cadastre pelo menos um serviço.",
    invalid_input: "Preencha nome, duração e preço de cada serviço.",
    invalid_name: "Informe o nome do serviço.",
    name_too_long: "O nome do serviço pode ter no máximo 80 caracteres.",
    invalid_duration: "Informe a duração em minutos, de 5 a 720.",
    invalid_price: "Informe um preço válido, como 180,00.",
  },
  partner: {
    invalid_input: "Preencha todos os campos do repasse.",
    invalid_name: "Informe o nome do parceiro.",
    name_too_long: "O nome do parceiro pode ter no máximo 60 caracteres.",
    invalid_threshold_rule: "Escolha se o limite conta como \"acima de\" ou \"a partir de\".",
    invalid_tiers: "Cadastre de 1 a 10 faixas.",
    invalid_tier_threshold: "Informe o valor de cada limite, como 10.000,00.",
    invalid_tier_share: "Informe cada percentual entre 0% e 99,99%.",
    first_tier_not_zero: "A primeira faixa começa em R$ 0,00.",
    tiers_not_increasing: "Cada faixa precisa começar num valor maior que a anterior.",
  },
  unit: {
    invalid_input: "Preencha todos os campos da unidade.",
    invalid_name: "Informe o nome da unidade.",
    name_too_long: "O nome pode ter no máximo 80 caracteres.",
    invalid_image_url: "Informe uma URL válida começando com http:// ou https://.",
    invalid_members: "Algum profissional escolhido não é deste workspace. Recarregue a página.",
    no_stations: "Cadastre pelo menos uma estação.",
    too_many_stations: "Cadastre no máximo 20 estações no total.",
    invalid_station_type: "Informe o tipo de cada estação.",
    station_type_too_long: "O tipo da estação pode ter no máximo 30 caracteres.",
    duplicate_station_type: "Cada tipo de estação só pode aparecer uma vez.",
    invalid_station_quantity: "Informe uma quantidade de estações a partir de 1.",
    invalid_business_hours: "Informe o horário de funcionamento.",
    invalid_business_hours_order: "O horário de fechamento deve ser depois da abertura.",
  },
}

export type UnitSetupState =
  | { ok: true; unitId: string }
  | { ok: false; error: string; step: SetupStep | null; index: number | null }

function failure(result: Exclude<SetupUnitResult, { ok: true }>): UnitSetupState {
  if (!("step" in result)) {
    const error =
      result.error === "forbidden"
        ? forbiddenMessage("units.manage")
        : "Workspace não encontrado ou sem permissão."
    return { ok: false, error, step: null, index: null }
  }
  const index = "index" in result ? result.index : null
  return { ok: false, error: stepMessages[result.step][result.error] ?? "Revise os dados desta etapa.", step: result.step, index }
}

export async function setupUnitAction(workspaceId: string, input: unknown): Promise<UnitSetupState> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sua sessão expirou. Entre novamente.", step: null, index: null }
  const access = await findWorkspaceAccess(workspaceId, userId)
  const ctx = { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }

  const result = await setupUnit(input, ctx, {
    membersExist: async (ids) =>
      (await WorkspaceMember.countDocuments({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        workspaceId: ctx.workspaceId,
      })) === ids.length,
    walletExists: async (id) => !!(await Wallet.exists({ _id: id, workspaceId: ctx.workspaceId })),
    inventoryExists: async (id) => !!(await Inventory.exists({ _id: id, workspaceId: ctx.workspaceId })),
    save: saveUnitSetup,
  })

  if (!result.ok) return failure(result)

  refresh()
  return { ok: true, unitId: result.unitId }
}
