import { Types } from "mongoose"
import { BoxesIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import Link from "@/components/shared/link"
import { CreateInventorySheet, InventoryActions } from "@/components/workspace/[workspaceId]/stock/inventory-sheets"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Inventory } from "@/models/Inventory"

type InventoryRow = {
  id: string
  name: string
  units: { id: string; name: string }[]
  productCount: number
  quantity: number
}

export default async function InventoriesPage({ params }: PageProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "stock" })
  const canManage = can(actor, "stock.manage")

  const inventories = await Inventory.aggregate<InventoryRow>([
    { $match: { workspaceId: new Types.ObjectId(workspaceId) } },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "inventoryId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        units: 1,
        productCount: { $size: { $filter: { input: "$products", cond: { $gt: ["$$this.quantity", 0] } } } },
        quantity: { $sum: "$products.quantity" },
      },
    },
    { $sort: { name: 1, id: 1 } },
  ])

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <CreateInventorySheet workspaceId={workspaceId} />
        </div>
      )}
      <div className="@container border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full px-4">Inventário</TableHead>
              <TableHead className="px-4 @max-3xl:hidden">Unidades</TableHead>
              <TableHead className="px-4 text-right @max-md:hidden">Produtos</TableHead>
              <TableHead className="px-4 text-right">Itens</TableHead>
              {canManage && <TableHead className="w-0 px-4" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventories.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum inventário cadastrado.
                </TableCell>
              </TableRow>
            )}
            {inventories.map((inventory) => (
              <TableRow key={inventory.id}>
                <TableCell className="max-w-0 px-4 font-medium">
                  <Link href={`/workspace/${workspaceId}/stock/${inventory.id}`} className="flex items-center gap-2 hover:underline">
                    <BoxesIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{inventory.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="px-4 @max-3xl:hidden">
                  <div className="flex gap-1">
                    {inventory.units.length === 0 ? (
                      <span className="text-muted-foreground">Sem unidades</span>
                    ) : (
                      inventory.units.map((unit) => (
                        <Badge key={unit.id} variant="secondary">
                          {unit.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums @max-md:hidden">{inventory.productCount}</TableCell>
                <TableCell className="px-4 text-right tabular-nums">{inventory.quantity}</TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <InventoryActions workspaceId={workspaceId} inventory={inventory} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
