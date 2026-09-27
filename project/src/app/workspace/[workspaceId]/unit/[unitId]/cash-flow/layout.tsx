import { CashFlowSubNav } from "@/components/cash-flow-sub-nav"

// Título e abas do caixa (resumo, despesas e grupos); cada aba verifica o acesso por conta própria.
export default async function CashFlowLayout({
  children,
  params,
}: LayoutProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold tracking-tight">Caixa</h3>
      <CashFlowSubNav base={`/workspace/${workspaceId}/unit/${unitId}/cash-flow`} />
      {children}
    </div>
  )
}
