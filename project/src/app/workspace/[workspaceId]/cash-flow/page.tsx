import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { ListTotals } from "@/components/shared/list-totals"
import { CreateWalletSheet } from "@/components/workspace/[workspaceId]/cash-flow/wallet-sheets"
import { WalletList } from "@/components/workspace/[workspaceId]/cash-flow/wallet-list"
import { Wallet } from "@/models/Wallet"
import { PageHeader } from "@/components/shared/page-header"

export default async function CashFlowPage({ params }: PageProps<"/workspace/[workspaceId]/cash-flow">) {
  const { workspaceId } = await params
  const user = await requireUser()
  const { actor } = await requirePage(workspaceId, user.id, { workspace: "cash_flow" })

  const wallets = await Wallet.aggregate<WalletListItem>(walletListPipeline(workspaceId))
  const canManage = can(actor, "cash_flow.manage")
  const balanceCents = wallets.reduce((sum, wallet) => sum + wallet.balanceCents, 0)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <PageHeader title="Caixa" />
      <ListToolbar actions={canManage && <CreateWalletSheet workspaceId={workspaceId} />}>
        <ListTotals items={[{ label: "Saldo nas carteiras", cents: balanceCents }]} />
      </ListToolbar>
      <WalletList workspaceId={workspaceId} wallets={wallets} canManage={canManage} />
    </div>
  )
}
