import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { PiggyBankIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { unitRefOptionsStages } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
import {
  parseTransactionListQuery,
  TRANSACTION_PAGE_SIZE,
  transactionListPipeline,
  transactionTotalsPipeline,
  type TransactionListPage,
  type TransactionTotals,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction-list"
import Link from "@/components/shared/link"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { ListTotals } from "@/components/shared/list-totals"
import { QuerySelect } from "@/components/shared/query-select"
import { CreateTransactionSheet } from "@/components/workspace/[workspaceId]/cash-flow/transaction-sheets"
import { TransactionTable } from "@/components/workspace/[workspaceId]/cash-flow/transaction-table"
import { UnitWalletSheet, type RefOption } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-ref-sheets"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Transaction } from "@/models/Transaction"
import { Workspace } from "@/models/Workspace"

const NO_TOTALS: TransactionTotals = { incomingCents: 0, expenseCents: 0, balanceCents: 0 }

export default async function UnitCashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const query = parseTransactionListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  const [workspace] = await Workspace.aggregate<{
    actor: Actor
    unit: { wallet: RefOption | null } | null
    wallets: RefOption[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [
          { $match: { _id: new Types.ObjectId(unitId) } },
          {
            $lookup: {
              from: "wallets",
              localField: "walletId",
              foreignField: "_id",
              as: "wallet",
              pipeline: [{ $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
            },
          },
          { $project: { _id: 0, wallet: { $ifNull: [{ $first: "$wallet" }, null] } } },
        ],
      },
    },
    ...unitRefOptionsStages(),
    { $project: { _id: 0, actor: 1, wallets: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { wallet } = workspace.unit
  const canManageUnit = can(workspace.actor, "units.manage")
  const canManage = can(workspace.actor, "cash_flow.manage")
  const walletSheet = canManageUnit && (
    <UnitWalletSheet workspaceId={workspaceId} unitId={unitId} options={workspace.wallets} currentId={wallet?.id ?? null} />
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
                ? "Vincule uma carteira para lançar as transações da unidade. Sem ela, os atendimentos concluídos não entram no caixa."
                : "Sem carteira, os atendimentos concluídos não entram no caixa."}
            </EmptyDescription>
          </EmptyHeader>
          {walletSheet && <EmptyContent>{walletSheet}</EmptyContent>}
        </Empty>
      </div>
    )
  }

  const [[totals = NO_TOTALS], [result]] = await Promise.all([
    Transaction.aggregate<TransactionTotals>(transactionTotalsPipeline(wallet.id, unitId)),
    Transaction.aggregate<TransactionListPage>(transactionListPipeline(wallet.id, query, unitId)),
  ])

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const listQuery = { q: query.q, type: query.type, status: query.status, sort: query.sort, dir: query.dir }
  const pages = Math.ceil(result.total / TRANSACTION_PAGE_SIZE)
  if (pages > 0 && query.page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">Caixa</h3>
          <span className="truncate text-sm text-muted-foreground">
            Transações desta unidade na carteira{" "}
            <Link href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`} className="font-medium text-foreground hover:underline">
              {wallet.name}
            </Link>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {walletSheet}
          {canManage && <CreateTransactionSheet workspaceId={workspaceId} unitId={unitId} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch query={listQuery} placeholder="Buscar transação..." />
        <QuerySelect
          query={listQuery}
          field="type"
          label="Tipo"
          items={[
            { value: "all", label: "Entradas e saídas" },
            { value: "incoming", label: "Entradas" },
            { value: "expense", label: "Saídas" },
          ]}
        />
        <QuerySelect
          query={listQuery}
          field="status"
          label="Situação"
          items={[
            { value: "all", label: "Pagas e pendentes" },
            { value: "paid", label: "Pagas" },
            { value: "pending", label: "Pendentes" },
          ]}
        />
        <ListTotals
          items={[
            { label: "Entradas", cents: totals.incomingCents },
            { label: "Saídas", cents: totals.expenseCents },
            { label: "Saldo", cents: totals.balanceCents },
          ]}
        />
      </div>
      <TransactionTable
        workspaceId={workspaceId}
        transactions={result.rows}
        query={listQuery}
        pathname={pathname}
        canManage={canManage}
      />
      <ListPagination
        query={listQuery}
        page={query.page}
        pageSize={TRANSACTION_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="transações"
      />
    </div>
  )
}
