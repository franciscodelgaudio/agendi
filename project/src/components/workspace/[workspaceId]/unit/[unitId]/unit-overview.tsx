import Link from "@/components/shared/link"
import { ArrowRightIcon, CalendarCheckIcon, CheckIcon, PackageCheckIcon, type LucideIcon } from "lucide-react"
import { currencyFormat, timeFormat } from "@/components/shared/service-format"
import { TherapistAvatar, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent } from "@/components/ui/card"
import { cn } from "@/service/_shared/utils"

export function money(cents: number) {
  return currencyFormat.format(cents / 100)
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

// Botão "ver mais" no canto do card, para a aba com os detalhes.
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <CardAction>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
        {children}
        <ArrowRightIcon />
      </Button>
    </CardAction>
  )
}

// Indicador do topo: rótulo com ícone, valor em destaque e uma linha de contexto.
// progress (0 a 1) mostra quanto do previsto já foi realizado.
export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: React.ReactNode
  progress?: number
}) {
  return (
    <Card size="sm">
      <CardContent className="gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
            <Icon />
          </span>
          <span className="font-medium">{label}</span>
        </div>
        <div className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {progress !== undefined && (
          <div className="h-1.5 overflow-hidden bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          </div>
        )}
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

export type TodayBooking = {
  id: string
  startsAt: Date
  endsAt: Date
  guest: { name: string; room: string }
  serviceName: string
  therapistId: string
  therapistName: string
  attended: boolean
  // Na visão do workspace, a unidade do agendamento.
  unitName?: string
}

function BookingStatus({ booking, now, isNext }: { booking: TodayBooking; now: Date; isNext: boolean }) {
  if (booking.attended) {
    return (
      <Badge variant="secondary">
        <CheckIcon />
        Atendido
      </Badge>
    )
  }
  if (booking.startsAt <= now && now < booking.endsAt) return <Badge>Em andamento</Badge>
  if (booking.endsAt <= now) return <Badge variant="outline">Aguardando registro</Badge>
  if (isNext) return <Badge variant="outline">Próximo</Badge>
  return null
}

const SCHEDULE_LIMIT = 4

// Resumo da agenda do dia: do agendamento em andamento em diante, até SCHEDULE_LIMIT.
export function TodaySchedule({
  bookings,
  therapists,
  now,
}: {
  bookings: TodayBooking[]
  therapists: TherapistOption[]
  now: Date
}) {
  const therapistsById = new Map(therapists.map((therapist) => [therapist.id, therapist]))
  const next = bookings.find((booking) => !booking.attended && booking.startsAt > now)
  const upcoming = bookings.filter((booking) => !booking.attended && booking.endsAt > now)
  const visible = upcoming.slice(0, SCHEDULE_LIMIT)
  const hidden = upcoming.length - visible.length
  if (!visible.length) return <CardEmpty icon={CalendarCheckIcon}>Nenhum outro agendamento hoje.</CardEmpty>
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col">
        {visible.map((booking, index) => {
          const done = booking.attended || booking.endsAt <= now
          const therapist = therapistsById.get(booking.therapistId) ?? { name: booking.therapistName, image: null }
          return (
            <li key={booking.id} className="relative flex gap-4 pb-4 last:pb-0">
              {index < visible.length - 1 && <span className="absolute top-3 bottom-0 left-[4.75rem] w-px bg-border" />}
              <div className="w-16 shrink-0 pt-0.5 text-right tabular-nums">
                <div className={cn("font-medium", done && "text-muted-foreground")}>{timeFormat.format(booking.startsAt)}</div>
                <div className="text-xs text-muted-foreground">{timeFormat.format(booking.endsAt)}</div>
              </div>
              <span
                className={cn(
                  "relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card",
                  done ? "bg-muted-foreground/40" : "bg-primary",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2">
                <div className="grid min-w-0">
                  <span className="truncate font-medium">{booking.guest.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {booking.unitName && `${booking.unitName} · `}Quarto {booking.guest.room} · {booking.serviceName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <BookingStatus booking={booking} now={now} isNext={booking === next} />
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TherapistAvatar therapist={therapist} className="size-6" />
                    <span className="max-w-28 truncate">{booking.therapistName}</span>
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <span className="pl-20 text-xs text-muted-foreground">+ {plural(hidden, "agendamento", "agendamentos")} mais tarde</span>
      )}
    </div>
  )
}

export type RankItem = {
  id: string
  name: string
  image?: string | null
  href?: string
  real: { count: number; cents: number }
  forecast: { count: number; cents: number }
}

// Ranking do mês com barra proporcional ao maior previsto; a parte sólida é o realizado.
// avatar: redondo para pessoas, quadrado para unidades.
export function RankList({ items, avatar }: { items: RankItem[]; avatar?: "round" | "square" }) {
  const max = Math.max(...items.map((item) => item.forecast.cents), 1)
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const scheduled = item.forecast.count - item.real.count
        return (
          <li key={item.id} className="flex items-center gap-3">
            {avatar === "round" && (
              <TherapistAvatar therapist={{ name: item.name, image: item.image ?? null }} className="size-8" />
            )}
            {avatar === "square" && (
              <Avatar className="size-8 rounded-md after:rounded-md">
                {item.image && <AvatarImage src={item.image} alt={item.name} className="rounded-md" />}
                <InitialFallback name={item.name} className="rounded-md" />
              </Avatar>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                {item.href ? (
                  <Link href={item.href} className="truncate font-medium hover:underline">
                    {item.name}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{item.name}</span>
                )}
                <span className="shrink-0 font-medium tabular-nums">{money(item.forecast.cents)}</span>
              </div>
              <div className="flex h-1.5 gap-0.5 overflow-hidden bg-muted">
                <div className="h-full bg-primary" style={{ width: `${(item.real.cents / max) * 100}%` }} />
                <div
                  className="h-full bg-primary/30"
                  style={{ width: `${((item.forecast.cents - item.real.cents) / max) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {plural(item.real.count, "realizado", "realizados")}
                {scheduled > 0 && ` · ${plural(scheduled, "agendado", "agendados")}`}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Mensagem curta para cards sem conteúdo.
export function CardEmpty({ icon: Icon = PackageCheckIcon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted [&_svg]:size-5">
        <Icon />
      </span>
      <p className="max-w-56 text-sm">{children}</p>
    </div>
  )
}
