import { objectIds } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Product } from "@/models/Product"
import { Unit } from "@/models/Unit"

// Para server actions: dos ids pedidos, os produtos do catálogo do workspace da unidade.
export async function findUnitProducts(unitId: string, ids: string[]) {
  const unit = await Unit.findById(unitId).select({ workspaceId: 1 }).lean()
  if (!unit) return []
  const products = await Product.find({ _id: { $in: objectIds(ids) }, workspaceId: unit.workspaceId })
    .select({ name: 1 })
    .lean()
  return products.map((product) => ({ id: product._id.toString(), name: product.name }))
}
