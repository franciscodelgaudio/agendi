import mongoose, { Types } from "mongoose"
import { connectDB } from "@/service/_shared/database/mongoose"
import { insertWallet } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import type { UnitSetupPlan } from "@/service/workspace/[workspaceId]/unit/unit-setup"
import { Inventory } from "@/models/Inventory"
import { Partner } from "@/models/Partner"
import { Service } from "@/models/Service"
import { Unit } from "@/models/Unit"

export async function saveUnitSetup({ workspaceId, wallet, inventory, services, partner, unit }: UnitSetupPlan) {
  await connectDB()
  const session = await mongoose.startSession()
  let unitId = ""
  try {
    await session.withTransaction(async () => {
      const walletId = "id" in wallet ? wallet.id : (await insertWallet({ workspaceId, ...wallet }, session)).id
      const inventoryId = !inventory
        ? null
        : "id" in inventory
          ? new Types.ObjectId(inventory.id)
          : (await Inventory.create([{ workspaceId, name: inventory.name }], { session }))[0]._id
      const [created] = await Unit.create(
        [
          {
            ...unit,
            stations: unit.stations.map(({ type, number }) => ({ _id: new Types.ObjectId(), type, number })),
            workspaceMemberIds: unit.workspaceMemberIds.map((id) => new Types.ObjectId(id)),
            walletId: new Types.ObjectId(walletId),
            inventoryId,
            workspaceId,
          },
        ],
        { session },
      )
      await Service.create(
        services.map((service) => ({ ...service, unitId: created._id, workspaceId })),
        { session, ordered: true },
      )
      if (partner) await Partner.create([{ ...partner, unitId: created._id, workspaceId }], { session })
      unitId = created._id.toString()
    })
  } finally {
    await session.endSession()
  }
  return { id: unitId }
}
