import { PiggyBankIcon } from "lucide-react"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import type { UnitCashFlow } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import { PageHeader } from "@/components/shared/page-header"
import { UnitPartnerSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-partner-sheet"
import { UnitWalletSheet } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-ref-sheets"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

type Props = {
  workspaceId: string
  unitId: string
  data: UnitCashFlow
  children?: React.ReactNode
}

export function UnitCashFlowShell({
  workspaceId,
  unitId,
  data: { actor, wallet, wallets, partner, unlinkedPartners },
  children,
}: Props) {
  const canManageUnit = can(actor, "units.manage")
  const walletSheet = canManageUnit && (
    <UnitWalletSheet workspaceId={workspaceId} unitId={unitId} options={wallets} currentId={wallet?.id ?? null} standalone />
  )

  if (!wallet) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Caixa" />
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Caixa"
        actions={
          <>
            {walletSheet}
            {can(actor, "partners.manage") && (
              <UnitPartnerSheet workspaceId={workspaceId} unitId={unitId} partner={partner} unlinked={unlinkedPartners} />
            )}
          </>
        }
      />
      {children}
    </div>
  )
}
