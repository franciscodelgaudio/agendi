"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createProduct,
  deleteProduct,
  updateProduct,
  type DeleteProductError,
  type UpdateProductError,
} from "@/service/workspace/[workspaceId]/stock/products/product"
import { Inventory } from "@/models/Inventory"
import { Product } from "@/models/Product"

const errorMessages: Record<Exclude<UpdateProductError | DeleteProductError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha o nome e o preço.",
  invalid_name: "Informe o nome do produto.",
  name_too_long: "O nome pode ter no máximo 80 caracteres.",
  invalid_price: "Informe um preço válido, como 45,90.",
  product_not_found: "Produto não encontrado neste workspace.",
  product_in_stock: "Este produto ainda tem quantidade em algum inventário. Dê saída antes de excluir.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ProductFormState = { error: string | null }

function messageOf(error: UpdateProductError | DeleteProductError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("stock.manage") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function productFilter(workspaceId: string, productId: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(productId)) return null
  return { _id: new Types.ObjectId(productId), workspaceId: new Types.ObjectId(workspaceId) }
}

function productInput(formData: FormData) {
  return { name: formData.get("name"), price: formData.get("price") }
}

export async function createProductAction(
  workspaceId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await createProduct(productInput(formData), session, {
    insert: async (data) => {
      const product = await Product.create(data)
      return { id: product._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateProductAction(
  workspaceId: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = productFilter(session.workspaceId, productId)

  const result = await updateProduct(productInput(formData), filter && productId, session, {
    update: async (_id, data) => (await Product.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteProductAction(workspaceId: string, productId: string): Promise<ProductFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = productFilter(session.workspaceId, productId)

  const result = await deleteProduct(filter && productId, session, {
    inStock: async () =>
      !!(await Inventory.exists({
        workspaceId: filter!.workspaceId,
        products: { $elemMatch: { productId: filter!._id, quantity: { $gt: 0 } } },
      })),
    remove: async () => {
      const { deletedCount } = await Product.deleteOne(filter!)
      if (deletedCount === 0) return false
      await Inventory.updateMany({ workspaceId: filter!.workspaceId }, { $pull: { products: { productId: filter!._id } } })
      return true
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
