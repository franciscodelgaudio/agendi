import { StockNav } from "@/components/workspace/[workspaceId]/stock/stock-nav"
import { PageHeader } from "@/components/shared/page-header"

export default async function StockLayout({ children, params }: LayoutProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title="Estoque" />
      <StockNav workspaceId={workspaceId} />
      {children}
    </div>
  )
}
