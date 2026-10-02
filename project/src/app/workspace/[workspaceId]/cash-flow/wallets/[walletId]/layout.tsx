import { notFound } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser } from "@/service/(auth)/session"
import { loadWalletAccess } from "@/service/workspace/[workspaceId]/cash-flow/wallet-screen-store"
import Link from "@/components/shared/link"
import { CashFlowSubNav } from "@/components/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow-sub-nav"

const listFormat = new Intl.ListFormat("pt-BR")

// Título e abas do caixa da carteira (resumo, despesas e planejamento em conjunto das unidades
// dela); cada aba verifica o acesso por conta própria.
export default async function WalletCashFlowLayout({
  children,
  params,
}: LayoutProps<"/workspace/[workspaceId]/cash-flow/wallets/[walletId]">) {
  const { workspaceId, walletId } = await params
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "cash_flow" })
  const found = await loadWalletAccess(workspaceId, user.id, walletId)
  if (!found) notFound()
  const { wallet } = found

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="grid gap-1">
        <Link
          href={`/workspace/${workspaceId}/cash-flow`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&_svg]:size-4"
        >
          <ChevronLeftIcon />
          Caixa
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight">{wallet.name}</h2>
        <p className="text-sm text-muted-foreground">
          {wallet.units.length === 0
            ? "Carteira sem unidades."
            : `Despesas e planejamento em conjunto de ${listFormat.format(wallet.units.map((unit) => unit.name))}.`}
        </p>
      </div>
      <CashFlowSubNav base={`/workspace/${workspaceId}/cash-flow/wallets/${walletId}`} />
      {children}
    </div>
  )
}
