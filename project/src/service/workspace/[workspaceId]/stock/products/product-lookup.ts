import { Types } from "mongoose"
import { summarizeProductUsage, type ProductUsageSummary } from "@/service/workspace/[workspaceId]/stock/products/product-usage"
import { objectIds } from "@/service/workspace/[workspaceId]/team/therapist-lookup"
import { Product } from "@/models/Product"
import { StockItem } from "@/models/StockItem"
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

// Resumo de uso dos produtos nos estoques pedidos (ou de um só): as vezes que acabaram nesses
// estoques e os atendimentos e agendamentos das unidades que os usam. Agendamento que virou
// atendimento já conta pelo atendimento, então só entram os que ainda não viraram. Quem chama
// já conferiu o acesso.
export async function findProductUsage(
  { holderIds, unitIds }: { holderIds: string[]; unitIds: string[] },
  productId?: string,
) {
  const units = { $in: unitIds.map((id) => new Types.ObjectId(id)) }
  const usage = await StockItem.aggregate<{ id: string; depletedAt: Date[]; uses: Date[] }>([
    {
      $match: {
        holderId: { $in: holderIds.map((id) => new Types.ObjectId(id)) },
        ...(productId && { productId: new Types.ObjectId(productId) }),
      },
    },
    // O mesmo produto em vários estoques (catálogo do workspace) conta junto.
    {
      $group: {
        _id: "$productId",
        depletedAt: { $push: { $ifNull: ["$depletedAt", []] } },
      },
    },
    {
      $lookup: {
        from: "appointments",
        localField: "_id",
        foreignField: "products.productId",
        as: "appointments",
        pipeline: [{ $match: { unitId: units } }, { $project: { _id: 0, at: "$performedAt" } }],
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "_id",
        foreignField: "products.productId",
        as: "bookings",
        pipeline: [
          { $match: { unitId: units, appointmentId: null } },
          { $project: { _id: 0, at: "$startsAt" } },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        depletedAt: { $reduce: { input: "$depletedAt", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } } },
        uses: { $concatArrays: ["$appointments.at", "$bookings.at"] },
      },
    },
  ])
  const now = new Date()
  const empty = summarizeProductUsage([], [], now)
  const byId = new Map(usage.map((u) => [u.id, summarizeProductUsage(u.uses, u.depletedAt, now)]))
  return (id: string): ProductUsageSummary => byId.get(id) ?? empty
}
