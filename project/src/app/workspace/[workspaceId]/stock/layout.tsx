import { StockNav } from "@/components/stock-nav"

// Título e abas do estoque (quantidades e catálogo de produtos); cada aba verifica o acesso por
// conta própria.
export default async function StockLayout({ children, params }: LayoutProps<"/workspace/[workspaceId]/stock">) {
  const { workspaceId } = await params

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-2xl font-semibold tracking-tight">Estoque</h2>
      <StockNav workspaceId={workspaceId} />
      {children}
    </div>
  )
}
