import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowBuckets,
  cashFlowFetchRange,
  dailyAppointmentTotalsPipeline,
  dailyBookingForecastPipeline,
  parseCashFlowQuery,
  summarizeCashFlow,
  summarizeTherapists,
  teamPayRates,
  type DayTotal,
} from "@/lib/cash-flow"
import { dailyExpenseTotalsPipeline, type ExpenseDayTotal } from "@/lib/expense"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import { openingBalanceRange, type OpeningBalance } from "@/lib/opening-balance"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Expense } from "@/models/Expense"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { CashFlowNav } from "@/components/cash-flow-nav"
import { OpeningBalanceCard } from "@/components/opening-balance-card"
import { CashFlowTable } from "@/components/cash-flow-table"
import { CashFlowTherapistsTable } from "@/components/cash-flow-therapists-table"

// Layout e página podem renderizar em paralelo, então a página refaz a verificação de acesso.
export default async function CashFlowPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  const query = parseCashFlowQuery(await searchParams, now)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "cash_flow", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace para garantir o acesso; a regra de repasse define quantos dias buscar.
  const [workspace] = await Workspace.aggregate<{
    id: string
    role: WorkspaceRole
    unit: { revenueShare: RevenueShare | null; openingBalance: OpeningBalance | null } | null
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
            $project: {
              _id: 0,
              revenueShare: { $ifNull: ["$revenueShare", null] },
              openingBalance: { $ifNull: ["$openingBalance", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, id: { $toString: "$_id" }, role: 1, unit: { $ifNull: [{ $first: "$unit" }, null] } } },
  ])
  if (!workspace?.unit) notFound()
  const { revenueShare, openingBalance } = workspace.unit
  const today = parseCashFlowQuery({}, now).date
  // Dias cujo líquido real soma no saldo em caixa de hoje.
  const balanceRange = openingBalance && openingBalanceRange(openingBalance, today)

  const buckets = cashFlowBuckets(query)
  const shown = { from: buckets[0].from, to: buckets.at(-1)!.to }
  const range = cashFlowFetchRange(buckets, revenueShare?.period ?? null)
  const unitMatch = { $match: { unitId: new Types.ObjectId(unitId) } }
  const [appointments, bookings, team, balanceAppointments, expenses, balanceExpenses] =
    await Promise.all([
      Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
      Booking.aggregate<DayTotal>([unitMatch, ...dailyBookingForecastPipeline(range, now)]),
      // Remuneração da equipe vinculada a esta unidade (o proprietário não tem).
      WorkspaceMember.find({
        workspaceId: workspace.id,
        role: { $in: ["massage_therapist", "receptionist"] },
        "units.unitId": unitId,
      })
        .select({ userId: 1, role: 1, units: 1 })
        .lean(),
      balanceRange
        ? Appointment.aggregate<DayTotal>([
            unitMatch,
            ...dailyAppointmentTotalsPipeline(cashFlowFetchRange([balanceRange], revenueShare?.period ?? null)),
          ])
        : [],
      Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(shown)]),
      balanceRange ? Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(balanceRange)]) : [],
    ])
  const { commissionRates, grossCommissionPercent, monthlySalaryCents } = teamPayRates(team, unitId)
  const staffCosts = { grossCommissionPercent, monthlySalaryCents, today }
  const summary = applyExpenses(
    applyStaffCosts(summarizeCashFlow(buckets, appointments, bookings, revenueShare, commissionRates), staffCosts),
    expenses,
  )
  const balanceCents = !openingBalance
    ? null
    : openingBalance.amountCents +
      (balanceRange
        ? applyExpenses(
            applyStaffCosts(
              summarizeCashFlow([balanceRange], balanceAppointments, [], revenueShare, commissionRates),
              staffCosts,
            ),
            balanceExpenses,
          ).total.real.netCents
        : 0)
  const therapistRows = summarizeTherapists(shown, appointments, bookings, commissionRates)
  const hasCommission = Object.keys(commissionRates).length > 0 || grossCommissionPercent > 0
  const hasSalary = monthlySalaryCents > 0
  const hasExpenses = expenses.length > 0

  const pathname = `/workspace/${workspaceId}/unit/${unitId}/cash-flow`

  return (
    <div className="flex flex-col gap-4">
      <OpeningBalanceCard
        workspaceId={workspaceId}
        unitId={unitId}
        openingBalance={openingBalance}
        balanceCents={balanceCents}
        canManage={canManageMembers(workspace.role)}
      />
      <CashFlowNav
        query={query}
        range={shown}
        isCurrent={shown.from <= today && today <= shown.to}
        today={today}
        pathname={pathname}
      />
      <CashFlowTable
        view={query.view}
        summary={summary}
        hasPartnerShare={!!revenueShare}
        hasCommission={hasCommission}
        hasSalary={hasSalary}
        hasExpenses={hasExpenses}
        today={today}
      />
      <h4 className="mt-4 font-semibold tracking-tight">Por massagista</h4>
      <CashFlowTherapistsTable therapists={therapistRows} />
    </div>
  )
}
