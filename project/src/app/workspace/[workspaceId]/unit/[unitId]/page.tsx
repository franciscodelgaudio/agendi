import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { CalendarCheckIcon, CalendarXIcon, PiggyBankIcon, LeafIcon, TrendingUpIcon } from "lucide-react"
import {
  applyExpenses,
  applyStaffCosts,
  cashFlowBuckets,
  cashFlowFetchRange,
  costCurve,
  dailyAppointmentTotalsPipeline,
  dailyBookingForecastPipeline,
  parseCashFlowQuery,
  serviceAppointmentTotalsPipeline,
  serviceBookingForecastPipeline,
  summarizeCashFlow,
  summarizeServices,
  teamPayRates,
  type DayRange,
  type DayTotal,
  type ServiceTotal,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { dailyExpenseTotalsPipeline, type ExpenseDayTotal } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/expenses/expense"
import { findTeamPayMembers, groupLimitsOf } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import { CostCumulativeChart, CostPeriodChart } from "@/components/workspace/[workspaceId]/shared/cash-flow/cost-curve-chart"
import { timeFormat } from "@/components/shared/service-format"
import type { TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { CardEmpty, CardLink, money, plural, StatTile, TodaySchedule, type TodayBooking } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-overview"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Os dias são do calendário, então são formatados em UTC para não deslocar.
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
const todayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

// Cabeçalho e navegação ficam no layout da unidade. Layout e página podem renderizar em
// paralelo, então a página refaz a verificação de acesso.
export default async function UnitOverviewPage({ params }: PageProps<"/workspace/[workspaceId]/unit/[unitId]">) {
  const { workspaceId, unitId } = await params
  const now = new Date()
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { unit: "overview", unitId })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access || !isObjectIdOrHexString(unitId)) notFound()

  // Parte do workspace para garantir o acesso; a regra de repasse define quantos dias buscar.
  const [workspace] = await Workspace.aggregate<{
    id: string
    therapists: TherapistOption[]
    unit: { revenueShare: RevenueShare | null; createdAt: Date } | null
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
          { $project: { _id: 0, revenueShare: { $ifNull: ["$revenueShare", null] }, createdAt: 1 } },
        ],
      },
    },
    ...therapistOptionsStages(),
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        therapists: 1,
        unit: { $ifNull: [{ $first: "$unit" }, null] },
      },
    },
  ])
  if (!workspace?.unit) notFound()
  const { revenueShare, createdAt } = workspace.unit

  // Mês corrente para os indicadores; ano corrente para a curva de custos, numa busca só com o
  // resto dos períodos de repasse das pontas.
  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const yearBuckets = cashFlowBuckets({ view: "year", date: today })
  const month = { from: monthBuckets[0].from, to: monthBuckets.at(-1)!.to }
  const year = { from: yearBuckets[0].from, to: yearBuckets.at(-1)!.to }
  const range = cashFlowFetchRange(yearBuckets, revenueShare?.period ?? null)
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)

  const unitObjectId = new Types.ObjectId(unitId)
  const unitMatch = { $match: { unitId: unitObjectId } }
  const [appointments, bookings, serviceAppointments, serviceBookings, team, todayBookings, expenses, groups] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
    Booking.aggregate<DayTotal>([unitMatch, ...dailyBookingForecastPipeline(range, now)]),
    Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceAppointmentTotalsPipeline(month)]),
    Booking.aggregate<ServiceTotal>([unitMatch, ...serviceBookingForecastPipeline(month, now)]),
    // Remuneração da equipe vinculada a esta unidade (administradores não têm).
    findTeamPayMembers(workspace.id, unitId),
    Booking.find({ unitId: unitObjectId, startsAt: { $gte: todayStart, $lt: todayEnd } })
      .sort({ startsAt: 1 })
      .select({ startsAt: 1, endsAt: 1, guest: 1, service: 1, therapistId: 1, therapistName: 1, appointmentId: 1 })
      .lean(),
    Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(year)]),
    ExpenseGroup.find({ unitId: unitObjectId }).select({ monthlyLimitCents: 1, limitChanges: 1 }).lean(),
  ])

  const { commissionRates, ...staffCosts } = teamPayRates(team, unitId)
  const summarize = (buckets: DayRange[]) =>
    applyStaffCosts(summarizeCashFlow(buckets, appointments, bookings, revenueShare, commissionRates), {
      ...staffCosts,
      today,
      since: parseCashFlowQuery({}, createdAt).date,
    })
  const monthTotal = summarize(monthBuckets).total
  const curve = costCurve([
    { buckets: applyExpenses(summarize(yearBuckets), expenses).buckets, groups: groups.map(groupLimitsOf) },
  ])
  const spentCents = curve.at(-1)?.spentCumulativeCents ?? 0
  const plannedCents = curve.at(-1)?.plannedCumulativeCents ?? 0
  const services = summarizeServices(serviceAppointments, serviceBookings)

  const servicesDone = services.reduce((sum, service) => sum + service.real.count, 0)
  const servicesScheduled = services.reduce((sum, service) => sum + service.forecast.count, 0) - servicesDone
  const hasDeductions =
    !!revenueShare ||
    Object.keys(commissionRates).length > 0 ||
    staffCosts.grossCommissionPercent > 0 ||
    staffCosts.netCommissionPercent > 0 ||
    staffCosts.salaries.length > 0
  const deductionsCents = monthTotal.real.partnerShareCents + monthTotal.real.commissionCents + monthTotal.real.salaryCents

  const schedule: TodayBooking[] = todayBookings.map((booking) => ({
    id: booking._id.toString(),
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    guest: booking.guest!,
    serviceName: booking.service.serviceName,
    therapistId: booking.therapistId?.toString() ?? null,
    therapistName: booking.therapistName ?? null,
    attended: !!booking.appointmentId,
  }))
  const attendedToday = schedule.filter((booking) => booking.attended).length
  const nextBooking = schedule.find((booking) => !booking.attended && booking.startsAt > now)

  const base = `/workspace/${workspaceId}/unit/${unitId}`
  const monthName = monthFormat.format(toDate(today))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Visão geral</h3>
        <span className="text-sm text-muted-foreground first-letter:uppercase">{todayFormat.format(toDate(today))}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={TrendingUpIcon}
          label={`Faturamento de ${monthName}`}
          value={money(monthTotal.real.grossCents)}
          progress={monthTotal.forecast.grossCents ? monthTotal.real.grossCents / monthTotal.forecast.grossCents : 0}
          detail={`de ${money(monthTotal.forecast.grossCents)} previstos`}
        />
        <StatTile
          icon={PiggyBankIcon}
          label="Líquido do mês"
          value={money(monthTotal.real.netCents)}
          detail={
            hasDeductions ? `${money(deductionsCents)} em repasse, comissões e salários` : "Sem repasse, comissões nem salários"
          }
        />
        <StatTile
          icon={LeafIcon}
          label="Serviços no mês"
          value={String(servicesDone)}
          detail={
            servicesScheduled
              ? `+ ${plural(servicesScheduled, "agendado", "agendados")} até o fim do mês`
              : "Nenhum outro agendado"
          }
        />
        <StatTile
          icon={CalendarCheckIcon}
          label="Hoje"
          value={plural(schedule.length, "agendamento", "agendamentos")}
          detail={
            nextBooking
              ? `Próximo às ${timeFormat.format(nextBooking.startsAt)} · ${attendedToday} atendidos`
              : schedule.length
                ? `${attendedToday} de ${schedule.length} atendidos`
                : "Dia livre"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoje</CardTitle>
            <CardDescription>
              {schedule.length
                ? `${plural(schedule.length, "agendamento", "agendamentos")}, ${attendedToday} ${attendedToday === 1 ? "atendido" : "atendidos"}`
                : "Nada agendado para hoje"}
            </CardDescription>
            <CardLink href={`${base}/calendar`}>Agenda</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            {schedule.length ? (
              <TodaySchedule bookings={schedule} therapists={workspace.therapists} now={now} />
            ) : (
              <CardEmpty icon={CalendarXIcon}>Nenhum agendamento hoje. Novos horários entram pela agenda.</CardEmpty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custos em {year.from.slice(0, 4)}</CardTitle>
            <CardDescription>
              {money(spentCents)} gastos de {money(plannedCents)} planejados
            </CardDescription>
            <CardLink href={`${base}/cash-flow`}>Caixa</CardLink>
          </CardHeader>
          <CardContent className="gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Custo fixo</span>
              <CostPeriodChart points={curve} view="year" />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Acumulado</span>
              <CostCumulativeChart points={curve} view="year" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
