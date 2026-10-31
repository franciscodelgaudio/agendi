"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createInventory,
  deleteInventory,
  updateInventory,
  type DeleteInventoryError,
  type UpdateInventoryError,
} from "@/service/workspace/[workspaceId]/stock/inventory"
import {
  registerMovement,
  transferProduct,
  type RegisterMovementError,
  type TransferProductError,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/stock-movement"
import {
  applyMovement,
  applyTransfer,
  currentQuantity,
  InsufficientStockError,
  inventoryExists,
  productExists,
} from "@/service/workspace/[workspaceId]/stock/[inventoryId]/inventory-store"
import { Inventory } from "@/models/Inventory"
import { StockMovement } from "@/models/StockMovement"
import { Unit } from "@/models/Unit"

type InventoryError = UpdateInventoryError | DeleteInventoryError | RegisterMovementError | TransferProductError

const errorMessages: Record<Exclude<InventoryError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome do inventário.",
  name_too_long: "O nome ficou longo demais.",
  invalid_type: "Escolha entrada ou saída.",
  invalid_quantity: "Informe uma quantidade inteira de 1 a 1.000.000.",
  product_not_found: "Produto não encontrado neste workspace.",
  inventory_not_found: "Inventário não encontrado neste workspace.",
  inventory_in_use: "Alguma unidade ainda usa este inventário. Troque o inventário dela antes.",
  insufficient_stock: "Não há essa quantidade do produto no inventário.",
  same_inventory: "Escolha outro inventário de destino.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type InventoryFormState = { error: string | null }

function messageOf(error: InventoryError | "unauthenticated", permission: "stock.manage" | "stock.transfer" = "stock.manage") {
  return error === "forbidden" ? forbiddenMessage(permission) : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function inventoryFilter(workspaceId: string, inventoryId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(inventoryId)) return null
  return { _id: new Types.ObjectId(inventoryId), workspaceId: new Types.ObjectId(workspaceId) }
}

function stockLookups(workspaceId: string) {
  return {
    productExists: (productId: string) => productExists(workspaceId, productId),
    currentQuantity: (inventoryId: string, productId: string) => currentQuantity(workspaceId, inventoryId, productId),
  }
}

export async function createInventoryAction(
  workspaceId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await createInventory({ name: formData.get("name") }, session, {
    insert: async (data) => {
      const inventory = await Inventory.create(data)
      return { id: inventory._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateInventoryAction(
  workspaceId: string,
  inventoryId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = inventoryFilter(session.workspaceId, inventoryId)

  const result = await updateInventory({ name: formData.get("name") }, filter && inventoryId, session, {
    update: async (_id, data) => (await Inventory.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteInventoryAction(workspaceId: string, inventoryId: string): Promise<InventoryFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = inventoryFilter(session.workspaceId, inventoryId)

  const result = await deleteInventory(filter && inventoryId, session, {
    hasUnits: async () => !!(await Unit.exists({ inventoryId: filter!._id })),
    remove: async () => {
      const { deletedCount } = await Inventory.deleteOne(filter!)
      if (deletedCount === 0) return false
      await StockMovement.deleteMany({ inventoryId: filter!._id })
      return true
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function registerMovementAction(
  workspaceId: string,
  inventoryId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await registerMovement(
    {
      name: formData.get("name"),
      type: formData.get("type"),
      quantity: formData.get("quantity"),
      productId: formData.get("productId"),
    },
    inventoryId,
    session,
    { ...stockLookups(session.workspaceId), apply: applyMovement },
  ).catch((error) => {
    if (error instanceof InsufficientStockError) return { ok: false as const, error: "insufficient_stock" as const }
    throw error
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function transferProductAction(
  workspaceId: string,
  inventoryId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated", "stock.transfer") }

  const result = await transferProduct(
    {
      productId: formData.get("productId"),
      quantity: formData.get("quantity"),
      toInventoryId: formData.get("toInventoryId"),
    },
    inventoryId,
    session,
    {
      ...stockLookups(session.workspaceId),
      inventoryExists: (id) => inventoryExists(session.workspaceId, id),
      applyTransfer,
    },
  ).catch((error) => {
    if (error instanceof InsufficientStockError) return { ok: false as const, error: "insufficient_stock" as const }
    throw error
  })

  if (!result.ok) return { error: messageOf(result.error, "stock.transfer") }

  refresh()
  return { error: null }
}
