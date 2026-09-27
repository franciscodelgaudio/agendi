import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  PiggyBankIcon,
  LeafIcon,
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
} from "@/lib/cash-flow"
import { dailyExpenseTotalsPipeline, type ExpenseDayTotal } from "@/lib/expense"
import type { RevenueShare } from "@/lib/revenue-share"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { therapistOptionsStages } from "@/lib/therapist"
import { BRT_OFFSET_HOURS } from "@/lib/timezone"
import { Appointment } from "@/models/Appointment"
import { Booking } from "@/models/Booking"
import { Expense } from "@/models/Expense"
import { Product } from "@/models/Product"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { CostCumulativeChart, CostPhysicalChart } from "@/components/cost-curve-chart"
import { timeFormat } from "@/components/service-format"
import type { TherapistOption } from "@/components/therapist-avatar"
import {
  CardEmpty,
  CardLink,
  LowStockList,
  money,
  plural,
  StatTile,
  TodaySchedule,
  type StockItem,
  type TodayBooking,
} from "@/components/unit-overview"
import { PeriodRankCard, type RankPeriod } from "@/components/period-rank-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Produtos com até esta quantidade aparecem como acabando.
const LOW_STOCK_QUANTITY = 2
const TOP_ITEMS = 5
const PERIOD_VIEWS: CashFlowView[] = ["week", "month", "year"]

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
    unit: { revenueShare: RevenueShare | null } | null
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
          { $project: { _id: 0, revenueShare: { $ifNull: ["$revenueShare", null] } } },
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
  const { revenueShare } = workspace.unit

  // Mês corrente para os indicadores; ano corrente para a curva de custos; semana, mês e ano
  // para os rankings. Uma busca só cobre todos, com o resto dos períodos de repasse das pontas.
  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const weekBuckets = cashFlowBuckets({ view: "week", date: today })
  const yearBuckets = cashFlowBuckets({ view: "year", date: today })
  const periods = byPeriod((view): DayRange => {
    const buckets = cashFlowBuckets({ view, date: today })
    return { from: buckets[0].from, to: buckets.at(-1)!.to }
  })
  const fetchRanges = [weekBuckets, yearBuckets].map((buckets) =>
    cashFlowFetchRange(buckets, revenueShare?.period ?? null),
  )
  const range = {
    from: fetchRanges.reduce((from, next) => (next.from < from ? next.from : from), fetchRanges[0].from),
    to: fetchRanges.reduce((to, next) => (next.to > to ? next.to : to), fetchRanges[0].to),
  }
  const [year, monthNumber, day] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(year, monthNumber - 1, day, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)

  const unitObjectId = new Types.ObjectId(unitId)
  const unitMatch = { $match: { unitId: unitObjectId } }
  const [appointments, bookings, serviceSummaries, team, todayBookings, lowStock, productCount, expenses] =
    await Promise.all([
      Appointment.aggregate<DayTotal>([unitMatch, ...dailyAppointmentTotalsPipeline(range)]),
      Booking.aggregate<DayTotal>([unitMatch, ...dailyBookingForecastPipeline(range, now)]),
      Promise.all(
        PERIOD_VIEWS.map(async (view) => {
          const [serviceAppointments, serviceBookings] = await Promise.all([
            Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceAppointmentTotalsPipeline(periods[view])]),
            Booking.aggregate<ServiceTotal>([unitMatch, ...serviceBookingForecastPipeline(periods[view], now)]),
          ])
          return summarizeServices(serviceAppointments, serviceBookings)
        }),
      ),
      // Remuneração da equipe vinculada a esta unidade (o proprietário não tem).
      WorkspaceMember.find({
        workspaceId: workspace.id,
        role: { $in: ["massage_therapist", "receptionist"] },
        "units.unitId": unitId,
      })
        .select({ userId: 1, role: 1, units: 1 })
        .lean(),
      Booking.find({ unitId: unitObjectId, startsAt: { $gte: todayStart, $lt: todayEnd } })
        .sort({ startsAt: 1 })
        .select({ startsAt: 1, endsAt: 1, guest: 1, service: 1, therapistId: 1, therapistName: 1, appointmentId: 1 })
        .lean(),
      Product.find({ unitId: unitObjectId, quantity: { $lte: LOW_STOCK_QUANTITY } })
        .sort({ quantity: 1, name: 1 })
        .select({ name: 1, quantity: 1, avatarUrl: 1 })
        .lean(),
      Product.countDocuments({ unitId: unitObjectId }),
      Expense.aggregate<ExpenseDayTotal>([unitMatch, ...dailyExpenseTotalsPipeline(periods.year)]),
    ])

  const { commissionRates, ...staffCosts } = teamPayRates(team, unitId)
  const summarize = (buckets: DayRange[]) =>
    applyStaffCosts(summarizeCashFlow(buckets, appointments, bookings, revenueShare, commissionRates), {
      ...staffCosts,
      today,
    })
  const monthTotal = summarize(monthBuckets).total
  const curve = costCurve([applyExpenses(summarize(yearBuckets), expenses).buckets], today)
  const spentCents = curve.findLast((point) => point.spentCumulativeCents !== null)?.spentCumulativeCents ?? 0
  const plannedCents = curve.at(-1)?.plannedCumulativeCents ?? 0
  const servicesByPeriod = byPeriod((view) => serviceSummaries[PERIOD_VIEWS.indexOf(view)])
  const services = servicesByPeriod.month
  const therapistImages = new Map(workspace.therapists.map((therapist) => [therapist.id, therapist.image]))

  const servicesDone = services.reduce((sum, service) => sum + service.real.count, 0)
  const servicesScheduled = services.reduce((sum, service) => sum + service.forecast.count, 0) - servicesDone
  const hasDeductions =
    !!revenueShare ||
    Object.keys(commissionRates).length > 0 ||
    staffCosts.grossCommissionPercent > 0 ||
    staffCosts.monthlySalaryCents > 0
  const deductionsCents =
    monthTotal.real.partnerShareCents + monthTotal.real.commissionCents + monthTotal.real.salaryCents

  const schedule: TodayBooking[] = todayBookings.map((booking) => ({
    id: booking._id.toString(),
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    guest: booking.guest!,
    serviceName: booking.service.serviceName,
    therapistId: booking.therapistId.toString(),
    therapistName: booking.therapistName,
    attended: !!booking.appointmentId,
  }))
  const attendedToday = schedule.filter((booking) => booking.attended).length
  const nextBooking = schedule.find((booking) => !booking.attended && booking.startsAt > now)
  const stock: StockItem[] = lowStock.map((product) => ({
    id: product._id.toString(),
    name: product.name,
    quantity: product.quantity,
    avatarUrl: product.avatarUrl ?? null,
  }))

  const base = `/workspace/${workspaceId}/unit/${unitId}`
  const monthName = monthFormat.format(toDate(today))
  const periodLabels: Record<CashFlowView, string> = { week: "Esta semana", month: monthName, year: today.slice(0, 4) }
  const periodNouns: Record<CashFlowView, string> = { week: "nesta semana", month: "neste mês", year: "neste ano" }
  const servicePeriods = byPeriod(
    (view): RankPeriod => ({
      label: periodLabels[view],
      items: servicesByPeriod[view].slice(0, TOP_ITEMS).map((service) => ({
        id: service.serviceId,
        name: service.serviceName,
        real: service.real,
        forecast: service.forecast,
      })),
      empty: <CardEmpty icon={LeafIcon}>Nenhum serviço realizado ou agendado {periodNouns[view]}.</CardEmpty>,
    }),
  )
  const therapistPeriods = byPeriod(
    (view): RankPeriod => ({
      label: periodLabels[view],
      items: summarizeTherapists(periods[view], appointments, bookings, commissionRates)
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
            hasDeductions
              ? `${money(deductionsCents)} em repasse, comissões e salários`
              : "Sem repasse, comissões nem salários"
          }
        />
        <StatTile
          icon={LeafIcon}
          label="Serviços no mês"
          value={String(servicesDone)}
          detail={servicesScheduled ? `+ ${plural(servicesScheduled, "agendado", "agendados")} até o fim do mês` : "Nenhum outro agendado"}
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
            <CardLink href={`${base}/cash-flow?view=year`}>Caixa</CardLink>
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
        <PeriodRankCard
          title="Serviços em destaque"
          action={<CardLink href={`${base}/services`}>Serviços</CardLink>}
          periods={servicePeriods}
        />

        <PeriodRankCard
          title="Massagistas"
          avatar="round"
          action={<CardLink href={`${base}/team`}>Equipe</CardLink>}
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
            <CardLink href={`${base}/stock`}>Estoque</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            {stock.length ? (
              <LowStockList products={stock.slice(0, TOP_ITEMS)} href={(product) => `${base}/stock/${product.id}`} />
            ) : (
              <CardEmpty>
                {productCount ? "Estoque em dia: nenhum produto acabando." : "Cadastre produtos na aba Estoque."}
              </CardEmpty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
