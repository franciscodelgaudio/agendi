import { notFound } from "next/navigation"
import { Types } from "mongoose"
import { CalendarCheckIcon, CalendarXIcon, PiggyBankIcon, LeafIcon, StoreIcon, TrendingUpIcon } from "lucide-react"
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
  type StaffCashFlowAmounts,
} from "@/lib/cash-flow"
import { dailyExpenseTotalsPipeline, type ExpenseDayTotal } from "@/lib/expense"
import { findTeamPayMembers, groupLimitsOf } from "@/lib/unit-cash-flow-store"
import { can, type Actor } from "@/lib/permissions"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { therapistOptionsStages } from "@/lib/therapist"
import { BRT_OFFSET_HOURS } from "@/lib/timezone"
import { teamCandidatesLookup, type TeamCandidate } from "@/lib/unit-team"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Expense } from "@/models/Expense"
import { ExpenseGroup } from "@/models/ExpenseGroup"
import { Workspace } from "@/models/Workspace"
import { CostCumulativeChart, CostPeriodChart } from "@/components/cost-curve-chart"
import { CreateUnitSheet } from "@/components/create-unit-sheet"
import { timeFormat } from "@/components/service-format"
import type { TherapistOption } from "@/components/therapist-avatar"
import { CardEmpty, CardLink, money, plural, RankList, StatTile, TodaySchedule, type TodayBooking } from "@/components/unit-overview"
import { UnitsEmpty } from "@/components/units-empty"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const DAY_MS = 24 * 60 * 60 * 1000
const TOP_ITEMS = 5

// Os dias são do calendário, então são formatados em UTC para não deslocar.
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
const todayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

function toDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

const ZERO: StaffCashFlowAmounts = { grossCents: 0, partnerShareCents: 0, commissionCents: 0, salaryCents: 0, netCents: 0 }

// Soma dos valores já calculados por unidade (cada uma com seu repasse, comissões e salários).
function sumAmounts(list: StaffCashFlowAmounts[]): StaffCashFlowAmounts {
  return list.reduce(
    (sum, amounts) => ({
      grossCents: sum.grossCents + amounts.grossCents,
      partnerShareCents: sum.partnerShareCents + amounts.partnerShareCents,
      commissionCents: sum.commissionCents + amounts.commissionCents,
      salaryCents: sum.salaryCents + amounts.salaryCents,
      netCents: sum.netCents + amounts.netCents,
    }),
    ZERO,
  )
}

type UnitInfo = {
  id: string
  name: string
  avatarUrl: string | null
  revenueShare: RevenueShare | null
}

// Página inicial: visão geral de todas as unidades do workspace.
export default async function WorkspacePage({ params }: PageProps<"/workspace/[workspaceId]">) {
  const { workspaceId } = await params
  const now = new Date()
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "home" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{
    id: string
    name: string
    actor: Actor
    units: UnitInfo[]
    therapists: TherapistOption[]
    team: TeamCandidate[]
  }>([
    ...access,
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "workspaceId",
        as: "units",
        pipeline: [
          { $sort: { name: 1, _id: 1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: 1,
              avatarUrl: { $ifNull: ["$avatarUrl", null] },
              revenueShare: { $ifNull: ["$revenueShare", null] },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    teamCandidatesLookup(),
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, actor: 1, units: 1, therapists: 1, team: 1 } },
  ])
  if (!workspace) notFound()
  const { units } = workspace
  const canManage = can(workspace.actor, "units.manage")
  const team = { candidates: workspace.team, canEdit: can(workspace.actor, "team.manage") }

  if (units.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-4">
        <UnitsEmpty workspaceId={workspace.id} canManage={canManage} team={team} />
      </div>
    )
  }

  // Mês corrente para os indicadores e o ranking de unidades; ano corrente para a curva de custos.
  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const yearBuckets = cashFlowBuckets({ view: "year", date: today })
  const month = { from: monthBuckets[0].from, to: monthBuckets.at(-1)!.to }
  const yearRange = { from: yearBuckets[0].from, to: yearBuckets.at(-1)!.to }
  const [year, monthNumber, day] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(year, monthNumber - 1, day, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)
  const unitIds = units.map((unit) => new Types.ObjectId(unit.id))

  // O repasse depende do faturamento de cada unidade, então o caixa é calculado unidade a
  // unidade (com o resto dos períodos de repasse das pontas) e só depois somado.
  const [perUnit, members, todayBookings] = await Promise.all([
    Promise.all(
      units.map(async (unit) => {
        const range = cashFlowFetchRange(yearBuckets, unit.revenueShare?.period ?? null)
        const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } }
        const [appointments, bookings, serviceAppointments, serviceBookings, expenses, groups] = await Promise.all([
          Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
          Booking.aggregate<DayTotal>([unitMatch, ...dailyBookingForecastPipeline(range, now)]),
          Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceAppointmentTotalsPipeline(month)]),
          Booking.aggregate<ServiceTotal>([unitMatch, ...serviceBookingForecastPipeline(month, now)]),
          Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(yearRange)]),
          ExpenseGroup.find({ unitId: new Types.ObjectId(unit.id) }).select({ monthlyLimitCents: 1, limitChanges: 1 }).lean(),
        ])
        return {
          unit,
          groupLimits: groups.map(groupLimitsOf),
          appointments,
          bookings,
          expenses,
          services: summarizeServices(serviceAppointments, serviceBookings),
        }
      }),
    ),
    // Remuneração da equipe em cada unidade (administradores não têm).
    findTeamPayMembers(workspace.id),
    Booking.find({ unitId: { $in: unitIds }, startsAt: { $gte: todayStart, $lt: todayEnd } })
      .sort({ startsAt: 1 })
      .select({ unitId: 1, startsAt: 1, endsAt: 1, guest: 1, service: 1, therapistId: 1, therapistName: 1, appointmentId: 1 })
      .lean(),
  ])

  const unitSummaries = perUnit.map(({ unit, appointments, bookings, expenses, services, groupLimits }) => {
    const { commissionRates, ...staffCosts } = teamPayRates(members, unit.id)
    const summarize = (buckets: DayRange[]) =>
      applyStaffCosts(summarizeCashFlow(buckets, appointments, bookings, unit.revenueShare, commissionRates), { ...staffCosts, today })
    const done = services.reduce((sum, service) => sum + service.real.count, 0)
    const all = services.reduce((sum, service) => sum + service.forecast.count, 0)
    return {
      unit,
      hasDeductions:
        !!unit.revenueShare ||
        Object.keys(commissionRates).length > 0 ||
        staffCosts.grossCommissionPercent > 0 ||
        staffCosts.salaries.length > 0,
      month: summarize(monthBuckets).total,
      year: { buckets: applyExpenses(summarize(yearBuckets), expenses).buckets, groups: groupLimits },
      services: { done, scheduled: all - done },
    }
  })

  const monthTotal = {
    real: sumAmounts(unitSummaries.map((summary) => summary.month.real)),
    forecast: sumAmounts(unitSummaries.map((summary) => summary.month.forecast)),
  }
  const curve = costCurve(unitSummaries.map((summary) => summary.year))
  const spentCents = curve.at(-1)?.spentCumulativeCents ?? 0
  const plannedCents = curve.at(-1)?.plannedCumulativeCents ?? 0
  const servicesDone = unitSummaries.reduce((sum, summary) => sum + summary.services.done, 0)
  const servicesScheduled = unitSummaries.reduce((sum, summary) => sum + summary.services.scheduled, 0)
  const hasDeductions = unitSummaries.some((summary) => summary.hasDeductions)
  const deductionsCents = monthTotal.real.partnerShareCents + monthTotal.real.commissionCents + monthTotal.real.salaryCents

  const unitRanking = [...unitSummaries].sort(
    (a, b) => b.month.forecast.grossCents - a.month.forecast.grossCents || a.unit.name.localeCompare(b.unit.name, "pt-BR"),
  )

  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))
  const schedule: TodayBooking[] = todayBookings.map((booking) => ({
    id: booking._id.toString(),
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    guest: booking.guest!,
    serviceName: booking.service.serviceName,
    therapistId: booking.therapistId.toString(),
    therapistName: booking.therapistName,
    attended: !!booking.appointmentId,
    unitName: units.length > 1 ? unitNames.get(booking.unitId.toString()) : undefined,
  }))
  const attendedToday = schedule.filter((booking) => booking.attended).length
  const nextBooking = schedule.find((booking) => !booking.attended && booking.startsAt > now)

  const base = `/workspace/${workspace.id}`
  const monthName = monthFormat.format(toDate(today))

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">{workspace.name}</h2>
          <span className="text-sm text-muted-foreground first-letter:uppercase">
            {todayFormat.format(toDate(today))} · {plural(units.length, "unidade", "unidades")}
          </span>
        </div>
        {canManage && <CreateUnitSheet workspaceId={workspace.id} team={team} />}
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
            <CardLink href={`${base}/calendar`}>Calendário</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            {schedule.length ? (
              <TodaySchedule bookings={schedule} therapists={workspace.therapists} now={now} />
            ) : (
              <CardEmpty icon={CalendarXIcon}>Nenhum agendamento hoje. Novos horários entram pelo calendário.</CardEmpty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custos em {yearRange.from.slice(0, 4)}</CardTitle>
            <CardDescription>
              {money(spentCents)} gastos de {money(plannedCents)} planejados
            </CardDescription>
            <CardLink href={`${base}/unit`}>Ver unidades</CardLink>
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

      <Card>
        <CardHeader>
          <CardTitle>Unidades</CardTitle>
          <CardDescription className="first-letter:uppercase">{monthName}, pelo previsto</CardDescription>
          <CardLink href={`${base}/unit`}>Todas</CardLink>
        </CardHeader>
        <CardContent className="flex-1">
          {unitRanking.length ? (
            <RankList
              avatar="square"
              items={unitRanking.slice(0, TOP_ITEMS).map(({ unit, month, services }) => ({
                id: unit.id,
                name: unit.name,
                image: unit.avatarUrl,
                href: `${base}/unit/${unit.id}`,
                real: { count: services.done, cents: month.real.grossCents },
                forecast: { count: services.done + services.scheduled, cents: month.forecast.grossCents },
              }))}
            />
          ) : (
            <CardEmpty icon={StoreIcon}>Nenhuma unidade.</CardEmpty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
