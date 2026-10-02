import { notFound } from "next/navigation"
import { parseCashFlowQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { loadWalletSummaryScreen } from "@/service/workspace/[workspaceId]/cash-flow/wallet-screen-store"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { CashFlowNav } from "@/components/workspace/[workspaceId]/shared/cash-flow/cash-flow-nav"
import { OpeningBalanceCard } from "@/components/workspace/[workspaceId]/shared/cash-flow/opening-balance-card"
import { ExpenseGroupsYearTable } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-groups-year-table"

// Saldo da carteira (com as despesas dela) e o planejado e pago dos grupos dela, mês a mês no ano.
// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function WalletSummaryPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]">) {
  const { workspaceId, walletId } = await params
  const now = new Date()
  const query = { ...parseCashFlowQuery(await searchParams, now), view: "year" as const }
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const data = await loadWalletSummaryScreen(workspaceId, user.id, walletId, query.date, now)
  if (!data) notFound()
  const { today, year, balance, overview } = data
  const shown = { from: `${year}-01-01`, to: `${year}-12-31` }
  const canManage = can(data.actor, "cash_flow.manage")

  return (
    <div className="flex flex-col gap-4">
      <OpeningBalanceCard openingBalance={balance?.openingBalance ?? null} balanceCents={balance?.balanceCents ?? null} />
      <CashFlowNav
        query={query}
        range={shown}
        isCurrent={shown.from <= today && today <= shown.to}
        today={today}
        pathname={`/workspace/${workspaceId}/cash-flow/wallets/${walletId}`}
        views={["year"]}
      />
      {overview.groups.length === 0 ? (
        <div className="border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum grupo de despesas na carteira. Crie em Planejamento os gastos que as unidades dela fazem em conjunto.
        </div>
      ) : (
        <ExpenseGroupsYearTable
          overview={overview}
          editing={canManage ? { workspaceId, owner: { walletId } } : null}
        />
      )}
    </div>
  )
}
