import { ChevronLeftIcon } from "lucide-react"
import type { WalletSettlement } from "@/service/workspace/[workspaceId]/cash-flow/wallet"
import Link from "@/components/shared/link"
import { CashFlowTabs } from "@/components/workspace/[workspaceId]/cash-flow/cash-flow-tabs"
import { SETTLEMENT_LABELS } from "@/components/workspace/[workspaceId]/cash-flow/settlement-labels"
import { Button } from "@/components/ui/button"

type Props = {
  workspaceId: string
  wallet: { id: string; name: string; settlement: WalletSettlement }
  actions?: React.ReactNode
  children: React.ReactNode
}

export function WalletShell({ workspaceId, wallet, actions, children }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label="Voltar ao caixa"
            render={<Link href={`/workspace/${workspaceId}/cash-flow`} />}
          >
            <ChevronLeftIcon />
          </Button>
          <div className="grid min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{wallet.name}</h2>
            <span className="text-sm text-muted-foreground">{SETTLEMENT_LABELS[wallet.settlement]}</span>
          </div>
        </div>
        {actions}
      </div>
      <CashFlowTabs base={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} />
      {children}
    </div>
  )
}
