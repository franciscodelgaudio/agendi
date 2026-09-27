import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { FolderIcon } from "lucide-react"
import { cashFlowBuckets, parseCashFlowQuery } from "@/lib/cash-flow"
import { expenseGroupTotalsPipeline, summarizeExpenseGroups, type ExpenseGroupTotal } from "@/lib/expense"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { CreateExpenseGroupSheet } from "@/components/expense-group-sheets"
import { ExpenseGroupsTable } from "@/components/expense-groups-table"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ExpenseGroupsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  // O limite é mensal, então a aba sempre mostra um mês.
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
  const [groups, totals] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId }).select({ name: 1, monthlyLimitCents: 1 }).lean(),
    Expense.aggregate<ExpenseGroupTotal>([{ $match: { unitId: unitObjectId } }, ...expenseGroupTotalsPipeline(month)]),
  ])
  const summary = summarizeExpenseGroups(
    groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      monthlyLimitCents: group.monthlyLimitCents ?? null,
    })),
    totals,
  )
  const today = parseCashFlowQuery({}, now).date

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CashFlowNav
          query={query}
          range={month}
          isCurrent={month.from <= today && today <= month.to}
          today={today}
          pathname={`/workspace/${workspaceId}/unit/${unitId}/cash-flow/groups`}
          views={["month"]}
        />
        {canManage && summary.length > 0 && <CreateExpenseGroupSheet workspaceId={workspaceId} unitId={unitId} />}
      </div>
      {summary.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum grupo de despesas</EmptyTitle>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <CreateExpenseGroupSheet workspaceId={workspaceId} unitId={unitId} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ExpenseGroupsTable groups={summary} workspaceId={workspaceId} unitId={unitId} canManage={canManage} />
      )}
    </div>
  )
}
