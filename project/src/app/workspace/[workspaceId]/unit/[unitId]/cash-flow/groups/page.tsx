import { notFound, redirect } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { FolderIcon } from "lucide-react"
import { cashFlowBuckets, parseCashFlowQuery } from "@/lib/cash-flow"
import { CASH_FLOW_PAGE_SIZE, expenseGroupListPage, parseExpenseGroupListQuery } from "@/lib/cash-flow-list"
import { loadExpenseGroupIcons } from "@/lib/expense-group-icon-store"
import { expenseGroupTotalsPipeline, summarizeExpenseGroups, type ExpenseGroupTotal } from "@/lib/expense"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import { GroupLimitFilter } from "@/components/cash-flow-filters"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { CreateExpenseGroupSheet } from "@/components/expense-group-sheets"
import { ExpenseGroupsTable } from "@/components/expense-groups-table"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function ExpenseGroupsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  // O limite é mensal: no ano, vale 12 vezes. A visão semanal não se aplica aos grupos.
  const search = await searchParams
  const parsed = parseCashFlowQuery(search, now)
  const query = { ...parsed, view: parsed.view === "year" ? ("year" as const) : ("month" as const) }
  const months = query.view === "year" ? 12 : 1
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = parseExpenseGroupListQuery(search)
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
  const period = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const unitObjectId = new Types.ObjectId(unitId)
  const [groups, totals, icons] = await Promise.all([
    ExpenseGroup.find({ unitId: unitObjectId }).select({ name: 1, monthlyLimitCents: 1, iconId: 1 }).lean(),
    Expense.aggregate<ExpenseGroupTotal>([{ $match: { unitId: unitObjectId } }, ...expenseGroupTotalsPipeline(period)]),
    loadExpenseGroupIcons(),
  ])
  const iconsById = new Map(icons.map((icon) => [icon.id, icon]))
  const summary = summarizeExpenseGroups(
    groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      monthlyLimitCents: group.monthlyLimitCents ?? null,
      icon: (group.iconId && iconsById.get(group.iconId.toString())) || null,
    })),
    totals,
    months,
  )
  const today = parseCashFlowQuery({}, now).date
  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow/groups`
  const listQuery = { view: query.view, date: query.date, ...filters }
  const result = expenseGroupListPage(summary, { ...filters, page })
  // Página além da última (ex.: depois de excluir o último grupo dela) vai para a última.
  const pages = Math.ceil(result.total / CASH_FLOW_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...listQuery, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CashFlowNav
          query={query}
          range={period}
          isCurrent={period.from <= today && today <= period.to}
          today={today}
          pathname={pathname}
          views={["month", "year"]}
          preserve={filters}
        />
        {canManage && summary.length > 0 && <CreateExpenseGroupSheet workspaceId={workspaceId} unitId={unitId} icons={icons} />}
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
              <CreateExpenseGroupSheet workspaceId={workspaceId} unitId={unitId} icons={icons} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch query={listQuery} placeholder="Buscar grupo..." />
            <GroupLimitFilter query={listQuery} />
          </div>
          <ExpenseGroupsTable
            groups={result.rows}
            icons={icons}
            query={listQuery}
            pathname={pathname}
            workspaceId={workspaceId}
            unitId={unitId}
            canManage={canManage}
            limitLabel={months === 1 ? "Limite por mês" : "Limite no ano"}
          />
          <ListPagination
            query={listQuery}
            page={page}
            pageSize={CASH_FLOW_PAGE_SIZE}
            total={result.total}
            pathname={pathname}
            itemLabel="grupos"
          />
        </>
      )}
    </div>
  )
}
