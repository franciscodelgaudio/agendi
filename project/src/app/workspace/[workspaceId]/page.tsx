import { notFound } from "next/navigation"
import { Types } from "mongoose"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  PiggyBankIcon,
  LeafIcon,
  StoreIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react"
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
  summarizeTherapists,
  teamPayRates,
  type CashFlowView,
  type DayRange,
  type DayTotal,
  type ServiceTotal,
  type StaffCashFlowAmounts,
} from "@/lib/cash-flow"
import { dailyExpenseTotalsPipeline, type ExpenseDayTotal } from "@/lib/expense"
import { canManageMembers, type WorkspaceRole } from "@/lib/member"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { therapistOptionsStages } from "@/lib/therapist"
import { BRT_OFFSET_HOURS } from "@/lib/timezone"
import { teamCandidatesLookup, type TeamCandidate } from "@/lib/unit-team"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Expense } from "@/models/Expense"
import { Product } from "@/models/Product"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { CostCumulativeChart, CostPhysicalChart } from "@/components/cost-curve-chart"
import { CreateUnitSheet } from "@/components/create-unit-sheet"
import { timeFormat } from "@/components/service-format"
import type { TherapistOption } from "@/components/therapist-avatar"
import {
  CardEmpty,
  CardLink,
  LowStockList,
  money,
  plural,
  RankList,
  StatTile,
  TodaySchedule,
  type StockItem,
  type TodayBooking,
} from "@/components/unit-overview"
import { UnitsEmpty } from "@/components/units-empty"
import { PeriodRankCard, type RankPeriod } from "@/components/period-rank-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const DAY_MS = 24 * 60 * 60 * 1000
// Produtos com até esta quantidade aparecem como acabando.
const LOW_STOCK_QUANTITY = 2
const TOP_ITEMS = 5

// Um valor para cada período dos rankings: semana, mês e ano correntes.
function byPeriod<T>(value: (view: CashFlowView) => T): Record<CashFlowView, T> {
  return { week: value("week"), month: value("month"), year: value("year") }
}

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

type UnitInfo = { id: string; name: string; avatarUrl: string | null; revenueShare: RevenueShare | null }

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
    role: WorkspaceRole
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
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, role: 1, units: 1, therapists: 1, team: 1 } },
  ])
  if (!workspace) notFound()
  const { units } = workspace
  const canManage = canManageMembers(workspace.role)
  const team = { candidates: workspace.team, canLinkTherapists: workspace.role === "owner" }

  if (units.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-4">
        <UnitsEmpty workspaceId={workspace.id} canManage={canManage} team={team} />
      </div>
    )
  }

  // Mês corrente para os indicadores e rankings; ano corrente para a curva de custos; semana,
  // mês e ano para o ranking das massagistas.
  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const weekBuckets = cashFlowBuckets({ view: "week", date: today })
  const yearBuckets = cashFlowBuckets({ view: "year", date: today })
  const periods = byPeriod((view): DayRange => {
    const buckets = cashFlowBuckets({ view, date: today })
    return { from: buckets[0].from, to: buckets.at(-1)!.to }
  })
  const month = periods.month
  const [year, monthNumber, day] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(year, monthNumber - 1, day, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)
  const unitIds = units.map((unit) => new Types.ObjectId(unit.id))

  // O repasse depende do faturamento de cada unidade, então o caixa é calculado unidade a
  // unidade (com o resto dos períodos de repasse das pontas) e só depois somado.
  const [perUnit, members, todayBookings, lowStock, productCount] = await Promise.all([
    Promise.all(
      units.map(async (unit) => {
        const period = unit.revenueShare?.period ?? null
        const yearRange = cashFlowFetchRange(yearBuckets, period)
        const weekRange = cashFlowFetchRange(weekBuckets, period)
        const range = {
          from: yearRange.from < weekRange.from ? yearRange.from : weekRange.from,
          to: yearRange.to > weekRange.to ? yearRange.to : weekRange.to,
        }
        const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } }
        const [appointments, bookings, serviceAppointments, serviceBookings, expenses] = await Promise.all([
          Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
          Booking.aggregate<DayTotal>([unitMatch, ...dailyBookingForecastPipeline(range, now)]),
          Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceAppointmentTotalsPipeline(month)]),
          Booking.aggregate<ServiceTotal>([unitMatch, ...serviceBookingForecastPipeline(month, now)]),
          Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(periods.year)]),
        ])
        return {
          unit,
          appointments,
          bookings,
          expenses,
          services: summarizeServices(serviceAppointments, serviceBookings),
        }
      }),
    ),
    // Remuneração da equipe em cada unidade (o proprietário não tem).
    WorkspaceMember.find({ workspaceId: workspace.id, role: { $in: ["massage_therapist", "receptionist"] } })
      .select({ userId: 1, role: 1, units: 1 })
      .lean(),
    Booking.find({ unitId: { $in: unitIds }, startsAt: { $gte: todayStart, $lt: todayEnd } })
      .sort({ startsAt: 1 })
      .select({ unitId: 1, startsAt: 1, endsAt: 1, guest: 1, service: 1, therapistId: 1, therapistName: 1, appointmentId: 1 })
      .lean(),
    Product.find({ unitId: { $in: unitIds }, quantity: { $lte: LOW_STOCK_QUANTITY } })
      .sort({ quantity: 1, name: 1 })
      .select({ unitId: 1, name: 1, quantity: 1, avatarUrl: 1 })
      .lean(),
    Product.countDocuments({ unitId: { $in: unitIds } }),
  ])

  const unitSummaries = perUnit.map(({ unit, appointments, bookings, expenses, services }) => {
    const { commissionRates, ...staffCosts } = teamPayRates(members, unit.id)
    const summarize = (buckets: DayRange[]) =>
      applyStaffCosts(summarizeCashFlow(buckets, appointments, bookings, unit.revenueShare, commissionRates), {
        ...staffCosts,
        today,
      })
    const done = services.reduce((sum, service) => sum + service.real.count, 0)
    const all = services.reduce((sum, service) => sum + service.forecast.count, 0)
    return {
      unit,
      hasDeductions:
        !!unit.revenueShare ||
        Object.keys(commissionRates).length > 0 ||
        staffCosts.grossCommissionPercent > 0 ||
        staffCosts.monthlySalaryCents > 0,
      month: summarize(monthBuckets).total,
      year: applyExpenses(summarize(yearBuckets), expenses).buckets,
      services: { done, scheduled: all - done },
    }
  })

  const monthTotal = {
    real: sumAmounts(unitSummaries.map((summary) => summary.month.real)),
    forecast: sumAmounts(unitSummaries.map((summary) => summary.month.forecast)),
  }
  const curve = costCurve(
    unitSummaries.map((summary) => summary.year),
    today,
  )
  const spentCents = curve.findLast((point) => point.spentCumulativeCents !== null)?.spentCumulativeCents ?? 0
  const plannedCents = curve.at(-1)?.plannedCumulativeCents ?? 0
  const servicesDone = unitSummaries.reduce((sum, summary) => sum + summary.services.done, 0)
  const servicesScheduled = unitSummaries.reduce((sum, summary) => sum + summary.services.scheduled, 0)
  const hasDeductions = unitSummaries.some((summary) => summary.hasDeductions)
  const deductionsCents =
    monthTotal.real.partnerShareCents + monthTotal.real.commissionCents + monthTotal.real.salaryCents

  // Massagistas somando todas as unidades em que atenderam; só os valores brutos são usados.
  const allAppointments = perUnit.flatMap((unit) => unit.appointments)
  const allBookings = perUnit.flatMap((unit) => unit.bookings)
  const therapistImages = new Map(workspace.therapists.map((therapist) => [therapist.id, therapist.image]))
  const unitRanking = [...unitSummaries].sort(
    (a, b) =>
      b.month.forecast.grossCents - a.month.forecast.grossCents || a.unit.name.localeCompare(b.unit.name, "pt-BR"),
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
  const stock: (StockItem & { unitId: string })[] = lowStock.map((product) => ({
    id: product._id.toString(),
    unitId: product.unitId.toString(),
    name: product.name,
    quantity: product.quantity,
    avatarUrl: product.avatarUrl ?? null,
    unitName: units.length > 1 ? unitNames.get(product.unitId.toString()) : undefined,
  }))
  const stockUnit = new Map(stock.map((product) => [product.id, product.unitId]))

  const base = `/workspace/${workspace.id}`
  const monthName = monthFormat.format(toDate(today))
  const periodLabels: Record<CashFlowView, string> = { week: "Esta semana", month: monthName, year: today.slice(0, 4) }
  const periodNouns: Record<CashFlowView, string> = { week: "nesta semana", month: "neste mês", year: "neste ano" }
  const therapistPeriods = byPeriod(
    (view): RankPeriod => ({
      label: periodLabels[view],
      items: summarizeTherapists(periods[view], allAppointments, allBookings, {})
        .slice(0, TOP_ITEMS)
        .map((therapist) => ({
          id: therapist.therapistId,
          name: therapist.therapistName,
          image: therapistImages.get(therapist.therapistId) ?? null,
          real: therapist.real,
          forecast: therapist.forecast,
        })),
      empty: <CardEmpty icon={UsersIcon}>Ninguém atendeu nem tem agendamentos {periodNouns[view]}.</CardEmpty>,
    }),
  )

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
          detail={hasDeductions ? `${money(deductionsCents)} em repasse, comissões e salários` : "Sem repasse, comissões nem salários"}
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
            <CardTitle>Custos em {periods.year.from.slice(0, 4)}</CardTitle>
            <CardDescription>
              {money(spentCents)} gastos de {money(plannedCents)} planejados
            </CardDescription>
            <CardLink href={`${base}/unit`}>Ver unidades</CardLink>
          </CardHeader>
          <CardContent className="gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Físico</span>
              <CostPhysicalChart points={curve} view="year" />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Acumulado</span>
              <CostCumulativeChart points={curve} view="year" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

        <PeriodRankCard
          title="Massagistas"
          avatar="round"
          action={<CardLink href={`${base}/users`}>Usuários</CardLink>}
          periods={therapistPeriods}
        />

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Estoque acabando</CardTitle>
            <CardDescription>
              {productCount
                ? `${plural(stock.length, "produto", "produtos")} com até ${LOW_STOCK_QUANTITY} unidades, de ${productCount}`
                : "Nenhum produto cadastrado"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {stock.length ? (
              <LowStockList
                products={stock.slice(0, TOP_ITEMS)}
                href={(product) => `${base}/unit/${stockUnit.get(product.id)}/stock/${product.id}`}
              />
            ) : (
              <CardEmpty>
                {productCount
                  ? "Estoque em dia: nenhum produto acabando."
                  : "Cadastre produtos no estoque de cada unidade."}
              </CardEmpty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
