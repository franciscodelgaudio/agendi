import { PageHeader } from "@/components/shared/page-header"
import { CashFlowTabs } from "@/components/workspace/[workspaceId]/cash-flow/cash-flow-tabs"

type Props = {
  workspaceId: string
  wallet: { id: string; name: string }
  partners: { name: string }[]
  children: React.ReactNode
}

export function WalletShell({ workspaceId, wallet, partners, children }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title={wallet.name} back={{ href: `/workspace/${workspaceId}/cash-flow`, label: "Voltar ao caixa" }} />
      <CashFlowTabs base={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} showStatements={partners.length > 0} />
      {children}
    </div>
  )
}
