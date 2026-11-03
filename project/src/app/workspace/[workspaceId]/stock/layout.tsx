import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadStockUnit } from "@/service/workspace/[workspaceId]/stock/stock-unit-store"
import { StockNav } from "@/components/workspace/[workspaceId]/stock/stock-nav"
import { PageHeader } from "@/components/shared/page-header"

export default async function StockLayout({ children, params }: LayoutProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "stock" })
  const unit = await loadStockUnit(workspaceId)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title="Estoque" />
      <StockNav workspaceId={workspaceId} unit={unit && { inventoryId: unit.inventoryId }} />
      {children}
    </div>
  )
}
