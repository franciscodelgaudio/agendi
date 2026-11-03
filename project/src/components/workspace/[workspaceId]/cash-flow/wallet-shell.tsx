import { ChevronLeftIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { CashFlowTabs } from "@/components/workspace/[workspaceId]/cash-flow/cash-flow-tabs"
import { Button } from "@/components/ui/button"

type Props = {
  workspaceId: string
  wallet: { id: string; name: string }
  partners: { name: string }[]
  actions?: React.ReactNode
  children: React.ReactNode
}

export function WalletShell({ workspaceId, wallet, partners, actions, children }: Props) {
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
            {partners.length > 0 && (
              <span className="truncate text-sm text-muted-foreground">
                Recebe por fechamento de {partners.map((partner) => partner.name).join(", ")}
              </span>
            )}
          </div>
        </div>
        {actions}
      </div>
      <CashFlowTabs base={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} showStatements={partners.length > 0} />
      {children}
    </div>
  )
}
