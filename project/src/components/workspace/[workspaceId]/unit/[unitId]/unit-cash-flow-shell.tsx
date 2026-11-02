import { PiggyBankIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import type { UnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import Link from "@/components/shared/link"
import { CashFlowTabs } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow-tabs"
import { UnitWalletSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-ref-sheets"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export const SETTLEMENT_LABELS = {
  immediate: "Recebe na hora",
  statement: "Recebe por fechamento",
} as const

type Props = {
  workspaceId: string
  unitId: string
  data: UnitCashFlow
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function UnitCashFlowShell({ workspaceId, unitId, data: { actor, wallet, wallets }, actions, children }: Props) {
  const canManageUnit = can(actor, "units.manage")
  const walletSheet = canManageUnit && (
    <UnitWalletSheet workspaceId={workspaceId} unitId={unitId} options={wallets} currentId={wallet?.id ?? null} />
  )

  if (!wallet) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold tracking-tight">Caixa</h3>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PiggyBankIcon />
            </EmptyMedia>
            <EmptyTitle>Esta unidade não tem carteira</EmptyTitle>
            <EmptyDescription>
              {canManageUnit
                ? "Vincule uma carteira para lançar as transações da unidade. Sem ela, os atendimentos concluídos não geram recebíveis."
                : "Sem carteira, os atendimentos concluídos não geram recebíveis."}
            </EmptyDescription>
          </EmptyHeader>
          {walletSheet && <EmptyContent>{walletSheet}</EmptyContent>}
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">Caixa</h3>
          <span className="truncate text-sm text-muted-foreground">
            Carteira{" "}
            <Link href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} className="font-medium text-foreground hover:underline">
              {wallet.name}
            </Link>{" "}
            · {SETTLEMENT_LABELS[wallet.settlement]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {walletSheet}
          {actions}
        </div>
      </div>
      <CashFlowTabs base={`/workspace/${workspaceId}/unit/${unitId}/cash-flow`} />
      {children}
    </div>
  )
}
