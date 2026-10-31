import { notFound } from "next/navigation"
import { Types } from "mongoose"
import { CalendarCheckIcon, CalendarXIcon, PiggyBankIcon, LeafIcon, StoreIcon, TrendingUpIcon, WalletIcon } from "lucide-react"
import {
  cashFlowBuckets,
  dailyDoneTotalsPipeline,
  dailyScheduledForecastPipeline,
  parseCashFlowQuery,
  serviceDoneTotalsPipeline,
  serviceScheduledForecastPipeline,
  summarizeCashFlow,
  summarizeServices,
  type CashFlowAmounts,
  type DayRange,
  type DayTotal,
  type ServiceTotal,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { Appointment } from "@/models/Appointment"
import { loadDayAppointments } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { Wallet } from "@/models/Wallet"
import { Workspace } from "@/models/Workspace"
import Link from "@/components/shared/link"
import { CreateUnitSheet } from "@/components/workspace/[workspaceId]/unit/create-unit-sheet"
import { timeFormat } from "@/components/shared/service-format"
import type { TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { CardEmpty, CardLink, money, plural, RankList, StatTile, TodaySchedule, type TodayBooking } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-overview"
import { UnitsEmpty } from "@/components/workspace/[workspaceId]/unit/units-empty"
import { loadUnitFormOptions } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
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

const ZERO: CashFlowAmounts = { grossCents: 0, netCents: 0 }

function sumAmounts(list: CashFlowAmounts[]): CashFlowAmounts {
  return list.reduce(
    (sum, amounts) => ({ grossCents: sum.grossCents + amounts.grossCents, netCents: sum.netCents + amounts.netCents }),
    ZERO,
  )
}

type UnitInfo = {
  id: string
  name: string
  imageUrl: string | null
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
              imageUrl: { $ifNull: ["$imageUrl", null] },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, actor: 1, units: 1, therapists: 1 } },
  ])
  if (!workspace) notFound()
  const { units } = workspace
  const canManage = can(workspace.actor, "units.manage")
  const options = canManage ? await loadUnitFormOptions(workspace.id) : { members: [], wallets: [], inventories: [] }

  if (units.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-4">
        <UnitsEmpty workspaceId={workspace.id} canManage={canManage} options={options} />
      </div>
    )
  }

  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const month = { from: monthBuckets[0].from, to: monthBuckets.at(-1)!.to }
  const [year, monthNumber, day] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(year, monthNumber - 1, day, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)
  const unitIds = units.map((unit) => new Types.ObjectId(unit.id))

  const [perUnit, todayBookings, wallets] = await Promise.all([
    Promise.all(
      units.map(async (unit) => {
        const unitMatch = { $match: { unitId: new Types.ObjectId(unit.id) } }
        const [appointments, bookings, serviceAppointments, serviceBookings] = await Promise.all([
          Appointment.aggregate<DayTotal>([unitMatch, ...dailyDoneTotalsPipeline(month)]),
          Appointment.aggregate<DayTotal>([unitMatch, ...dailyScheduledForecastPipeline(month, now)]),
          Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceDoneTotalsPipeline(month)]),
          Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceScheduledForecastPipeline(month, now)]),
        ])
        return {
          unit,
          appointments,
          bookings,
          services: summarizeServices(serviceAppointments, serviceBookings),
        }
      }),
    ),
    loadDayAppointments(unitIds, todayStart, todayEnd),
    Wallet.aggregate<WalletListItem>(walletListPipeline(workspace.id)),
  ])

  const unitSummaries = perUnit.map(({ unit, appointments, bookings, services }) => {
    const summarize = (buckets: DayRange[]) => summarizeCashFlow(buckets, appointments, bookings)
    const done = services.reduce((sum, service) => sum + service.real.count, 0)
    const all = services.reduce((sum, service) => sum + service.forecast.count, 0)
    return {
      unit,
      month: summarize(monthBuckets).total,
      services: { done, scheduled: all - done },
    }
  })

  const monthTotal = {
    real: sumAmounts(unitSummaries.map((summary) => summary.month.real)),
    forecast: sumAmounts(unitSummaries.map((summary) => summary.month.forecast)),
  }
  const balanceCents = wallets.reduce((sum, wallet) => sum + wallet.balanceCents, 0)
  const servicesDone = unitSummaries.reduce((sum, summary) => sum + summary.services.done, 0)
  const servicesScheduled = unitSummaries.reduce((sum, summary) => sum + summary.services.scheduled, 0)

  const unitRanking = [...unitSummaries].sort(
    (a, b) => b.month.forecast.grossCents - a.month.forecast.grossCents || a.unit.name.localeCompare(b.unit.name, "pt-BR"),
  )

  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))
  const schedule: TodayBooking[] = todayBookings.map((booking) => ({
    ...booking,
    unitName: units.length > 1 ? unitNames.get(booking.unitId) : undefined,
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
        {canManage && <CreateUnitSheet workspaceId={workspace.id} options={options} />}
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
          label="Saldo nas carteiras"
          value={money(balanceCents)}
          detail={wallets.length ? plural(wallets.length, "carteira", "carteiras") : "Nenhuma carteira"}
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
            <CardTitle>Carteiras</CardTitle>
            <CardDescription>{money(balanceCents)} no total</CardDescription>
            <CardLink href={`${base}/cash-flow`}>Caixa</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            {wallets.length ? (
              <ul className="flex flex-col gap-3">
                {wallets.map((wallet) => (
                  <li key={wallet.id} className="flex items-center justify-between gap-3">
                    <Link href={`${base}/cash-flow/wallets/${wallet.id}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                      <WalletIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{wallet.name}</span>
                    </Link>
                    <span className="shrink-0 font-medium tabular-nums">{money(wallet.balanceCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <CardEmpty icon={WalletIcon}>Nenhuma carteira. Elas são criadas junto com as unidades.</CardEmpty>
            )}
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
                image: unit.imageUrl,
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
