import { notFound } from "next/navigation"
import { isObjectIdOrHexString, Types } from "mongoose"
import { CalendarCheckIcon, CalendarXIcon, PiggyBankIcon, LeafIcon, PackageIcon, TrendingUpIcon } from "lucide-react"
import {
  cashFlowBuckets,
  dailyDoneTotalsPipeline,
  dailyScheduledForecastPipeline,
  parseCashFlowQuery,
  serviceDoneTotalsPipeline,
  serviceScheduledForecastPipeline,
  summarizeCashFlow,
  summarizeServices,
  type DayRange,
  type DayTotal,
  type ServiceTotal,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/cash-flow"
import { walletListPipeline, type WalletListItem } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { unitRefOptionsStages } from "@/service/workspace/[workspaceId]/unit/unit-form-store"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { Appointment } from "@/models/Appointment"
import { loadDayAppointments } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/calendar-options-store"
import { Wallet } from "@/models/Wallet"
import { Workspace } from "@/models/Workspace"
import { timeFormat } from "@/components/shared/service-format"
import type { TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { CardEmpty, CardLink, CardLinkButton, money, plural, StatTile, TodaySchedule, type TodayBooking } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-overview"
import { UnitInventorySheet, UnitWalletSheet, type RefOption } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-ref-sheets"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type UnitInventory = { id: string; name: string; productCount: number; quantity: number }

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

  // Parte do workspace para garantir o acesso.
  const [workspace] = await Workspace.aggregate<{
    id: string
    actor: Actor
    therapists: TherapistOption[]
    unit: { id: string; walletId: string | null; inventory: UnitInventory | null } | null
    wallets: RefOption[]
    inventories: RefOption[]
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
              from: "inventories",
              localField: "inventoryId",
              foreignField: "_id",
              as: "inventory",
              pipeline: [
                {
                  $project: {
                    _id: 0,
                    id: { $toString: "$_id" },
                    name: 1,
                    productCount: { $size: { $filter: { input: "$products", cond: { $gt: ["$$this.quantity", 0] } } } },
                    quantity: { $sum: "$products.quantity" },
                  },
                },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              walletId: { $ifNull: [{ $toString: "$walletId" }, null] },
              inventory: { $ifNull: [{ $first: "$inventory" }, null] },
            },
          },
        ],
      },
    },
    ...therapistOptionsStages(),
    ...unitRefOptionsStages(),
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        actor: 1,
        therapists: 1,
        wallets: 1,
        inventories: 1,
        unit: { $ifNull: [{ $first: "$unit" }, null] },
      },
    },
  ])
  if (!workspace?.unit) notFound()
  const canManage = can(workspace.actor, "units.manage")
  const refOptions = canManage
    ? { wallets: workspace.wallets, inventories: workspace.inventories }
    : { wallets: [], inventories: [] }
  const { inventory } = workspace.unit

  // Mês corrente para os indicadores; ano corrente para a curva de custos.
  const today = parseCashFlowQuery({}, now).date
  const monthBuckets = cashFlowBuckets({ view: "month", date: today })
  const month = { from: monthBuckets[0].from, to: monthBuckets.at(-1)!.to }
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number)
  const todayStart = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay, BRT_OFFSET_HOURS))
  const todayEnd = new Date(todayStart.getTime() + DAY_MS)

  const unitObjectId = new Types.ObjectId(unitId)
  const unitMatch = { $match: { unitId: unitObjectId } }
  const walletId = workspace.unit.walletId
  const [appointments, bookings, serviceAppointments, serviceBookings, todayBookings, [wallet]] = await Promise.all([
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyDoneTotalsPipeline(month)]),
    Appointment.aggregate<DayTotal>([unitMatch, ...dailyScheduledForecastPipeline(month, now)]),
    Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceDoneTotalsPipeline(month)]),
    Appointment.aggregate<ServiceTotal>([unitMatch, ...serviceScheduledForecastPipeline(month, now)]),
    loadDayAppointments([unitObjectId], todayStart, todayEnd),
    walletId && Types.ObjectId.isValid(walletId)
      ? Wallet.aggregate<WalletListItem>([{ $match: { _id: new Types.ObjectId(walletId) } }, ...walletListPipeline(workspaceId)])
      : Promise.resolve([] as WalletListItem[]),
  ])

  const summarize = (buckets: DayRange[]) => summarizeCashFlow(buckets, appointments, bookings)
  const monthTotal = summarize(monthBuckets).total
  const services = summarizeServices(serviceAppointments, serviceBookings)

  const servicesDone = services.reduce((sum, service) => sum + service.real.count, 0)
  const servicesScheduled = services.reduce((sum, service) => sum + service.forecast.count, 0) - servicesDone

  const schedule: TodayBooking[] = todayBookings
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
          label="Saldo da carteira"
          value={money(wallet?.balanceCents ?? 0)}
          detail={wallet ? wallet.name : "Sem carteira"}
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

        <div className="flex flex-col gap-4">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>{wallet ? wallet.name : "Carteira"}</CardTitle>
              <CardDescription>Entradas e saídas pagas da carteira da unidade</CardDescription>
              {(canManage || wallet) && (
                <CardAction className="flex gap-1">
                  {canManage && (
                    <UnitWalletSheet
                      workspaceId={workspaceId}
                      unitId={unitId}
                      options={refOptions.wallets}
                      currentId={wallet?.id ?? null}
                    />
                  )}
                  {wallet && (
                    <CardLinkButton href={`/workspace/${workspaceId}/cash-flow/wallets/${wallet.id}`}>Transações</CardLinkButton>
                  )}
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex-1">
              {wallet ? (
                <dl className="grid gap-3">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Entradas</dt>
                    <dd className="font-medium tabular-nums">{money(wallet.incomingCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Saídas</dt>
                    <dd className="font-medium tabular-nums">{money(wallet.expenseCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t pt-3">
                    <dt className="font-medium">Saldo</dt>
                    <dd className="font-semibold tabular-nums">{money(wallet.balanceCents)}</dd>
                  </div>
                </dl>
              ) : (
                <CardEmpty icon={PiggyBankIcon}>
                  Esta unidade não tem carteira. Sem ela, os atendimentos concluídos não entram no caixa.
                </CardEmpty>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{inventory ? inventory.name : "Estoque"}</CardTitle>
              <CardDescription>Produtos do inventário da unidade</CardDescription>
              {(canManage || inventory) && (
                <CardAction className="flex gap-1">
                  {canManage && (
                    <UnitInventorySheet
                      workspaceId={workspaceId}
                      unitId={unitId}
                      options={refOptions.inventories}
                      currentId={inventory?.id ?? null}
                    />
                  )}
                  {inventory && (
                    <CardLinkButton href={`/workspace/${workspaceId}/stock/${inventory.id}`}>Produtos</CardLinkButton>
                  )}
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {inventory ? (
                <dl className="grid gap-3">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Produtos em estoque</dt>
                    <dd className="font-medium tabular-nums">{inventory.productCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Unidades no total</dt>
                    <dd className="font-medium tabular-nums">{inventory.quantity}</dd>
                  </div>
                </dl>
              ) : (
                <CardEmpty icon={PackageIcon}>Esta unidade não tem estoque.</CardEmpty>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
