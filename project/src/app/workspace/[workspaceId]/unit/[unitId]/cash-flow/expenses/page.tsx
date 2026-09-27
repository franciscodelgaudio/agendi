import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { FolderIcon, ReceiptIcon } from "lucide-react"
import { cashFlowBuckets, parseCashFlowQuery } from "@/lib/cash-flow"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import Link from "@/components/link"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { CreateExpenseSheet } from "@/components/expense-sheets"
import { ExpensesTable } from "@/components/expenses-table"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ExpensesPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  const query = { ...parseCashFlowQuery(await searchParams, now), view: "month" as const }
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace para garantir o acesso à unidade.
  const [workspace] = await Workspace.aggregate<{ role: WorkspaceRole; hasUnit: boolean }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "unit",
        pipeline: [{ $match: { _id: new Types.ObjectId(unitId) } }, { $project: { _id: 1 } }],
      },
    },
    { $project: { _id: 0, role: 1, hasUnit: { $gt: [{ $size: "$unit" }, 0] } } },
  ])
  if (!workspace?.hasUnit) notFound()
  const canManage = canManageMembers(workspace.role)

  const buckets = cashFlowBuckets(query)
  const month = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unitObjectId = new Types.ObjectId(unitId)
  const [groupDocs, expenseDocs] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId }).sort({ name: 1 }).collation({ locale: "pt" }).select({ name: 1 }).lean(),
    Expense.find({ unitId: unitObjectId, date: { $gte: month.from, $lte: month.to } })
      .sort({ date: 1, createdAt: 1 })
      .select({ groupId: 1, description: 1, amountCents: 1, date: 1, paidAt: 1, series: 1 })
      .lean(),
  ])
  const groups = groupDocs.map((group) => ({ id: group._id.toString(), name: group.name }))
  const expenses = expenseDocs.map((expense) => ({
    id: expense._id.toString(),
    groupId: expense.groupId.toString(),
    description: expense.description,
    amountCents: expense.amountCents,
    date: expense.date,
    paid: !!expense.paidAt,
    series: expense.series
      ? {
          kind: expense.series.kind as "installments" | "recurring",
          number: expense.series.number,
          count: expense.series.count,
        }
      : null,
  }))
  const today = parseCashFlowQuery({}, now).date
  const isCurrent = month.from <= today && today <= month.to
  const base = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`
  const create = canManage && groups.length > 0 && (
    <CreateExpenseSheet
      workspaceId={workspaceId}
      unitId={unitId}
      groups={groups}
      defaultDate={isCurrent ? today : month.from}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CashFlowNav
          query={query}
          range={month}
          isCurrent={isCurrent}
          today={today}
          pathname={`${base}/expenses`}
          views={["month"]}
        />
        {expenses.length > 0 && create}
      </div>
      {groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>Cadastre um grupo antes de lançar despesas</EmptyTitle>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href={`${base}/groups`} />}>
                Ir para grupos
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : expenses.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma despesa neste mês</EmptyTitle>
          </EmptyHeader>
          {create && <EmptyContent>{create}</EmptyContent>}
        </Empty>
      ) : (
        <ExpensesTable
          expenses={expenses}
          groups={groups}
          workspaceId={workspaceId}
          unitId={unitId}
          canManage={canManage}
        />
      )}
    </div>
  )
}
