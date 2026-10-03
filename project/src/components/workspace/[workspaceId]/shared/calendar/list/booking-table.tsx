import { BedDoubleIcon, MapPinIcon, CheckIcon, ClockIcon, SettingsIcon, LeafIcon, UserIcon } from "lucide-react"
import { cn } from "cn"
import type { BookingListQuery, BookingRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list"
import { BookingActions } from "@/components/workspace/[workspaceId]/shared/calendar/booking-actions"
import type { BookingFormOptions } from "@/components/workspace/[workspaceId]/shared/calendar/booking-form"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { formatDuration } from "@/components/shared/service-format"
import { MissingTherapistIcon, TherapistAvatar } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = {
  bookings: BookingRow[]
  // Sem a página: ordenar volta para a primeira.
  query: Omit<BookingListQuery, "page">
  pathname: string
  workspaceId: string
  // Opções do formulário de edição; com units (visão do workspace), aparece a coluna Unidade.
  options: BookingFormOptions
  // Sem permissão, a coluna de ações não aparece.
  canManage: boolean
}

// As datas já vêm no horário de Brasília, então são formatadas em UTC para não deslocar.
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

function formatDay(dateTime: string) {
  return dayFormat.format(new Date(`${dateTime.slice(0, 10)}T00:00:00Z`))
}

function Head({ icon: Icon, label, className }: { icon: typeof ClockIcon; label: string; className?: string }) {
  return (
    <TableHead className={cn("px-4", className)}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}

export function BookingTable({ bookings, query, pathname, workspaceId, options, canManage }: Props) {
  const unitNames = options.units && new Map(options.units.map((unit) => [unit.id, unit.name]))
  const therapistsById = new Map(options.therapists.map((therapist) => [therapist.id, therapist]))
  const columns = 5 + (unitNames ? 1 : 0) + (canManage ? 1 : 0)
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-5xl:hidden" />
            <SortableHead field="startsAt" label="Horário" icon={ClockIcon} query={query} pathname={pathname} />
            {unitNames && <Head icon={MapPinIcon} label="Unidade" className="@max-4xl:hidden" />}
            <SortableHead field="guestName" label="Hóspede" icon={BedDoubleIcon} query={query} pathname={pathname} />
            <SortableHead
              field="therapistName"
              label="Profissional"
              icon={UserIcon}
              query={query}
              pathname={pathname}
              className="@max-2xl:hidden"
            />
            <Head icon={LeafIcon} label="Serviço" className="w-full @max-lg:hidden" />
            {canManage && (
              <TableHead className="w-0 px-4 text-right">
                <span className="inline-flex items-center gap-1">
                  <SettingsIcon className="size-4 text-muted-foreground" />
                  Ações
                </span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum agendamento encontrado.
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => {
              // Quem saiu do workspace não está nas opções: fica só com o nome copiado.
              const therapist = booking.therapistId ? therapistsById.get(booking.therapistId) : undefined
              return (
                <TableRow key={booking.id}>
                  <CodeCell id={booking.id} className="@max-5xl:hidden" />
                  <TableCell className="px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{formatDay(booking.startsAt)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        · {booking.startsAt.slice(11)}–{booking.endsAt.slice(11)}
                      </span>
                      {booking.appointmentId && (
                        <Tooltip>
                          <TooltipTrigger
                            render={<span aria-label="Atendido" className="inline-flex text-muted-foreground" />}
                          >
                            <CheckIcon className="size-4" />
                          </TooltipTrigger>
                          <TooltipContent>Atendido</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  {unitNames && <TableCell className="px-4 @max-4xl:hidden">{unitNames.get(booking.unitId) ?? "—"}</TableCell>}
                  <TableCell className="px-4">
                    {/* O quarto fica escondido no tooltip para a linha caber em uma altura só. */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="cursor-help font-medium underline decoration-muted-foreground/50 decoration-dotted underline-offset-4" />
                        }
                      >
                        {booking.guest.name}
                      </TooltipTrigger>
                      <TooltipContent>Quarto {booking.guest.room}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-4 @max-2xl:hidden">
                    {booking.therapistId ? (
                      <span className="flex items-center gap-2">
                        {therapist ? (
                          <TherapistAvatar therapist={therapist} className="size-6" />
                        ) : (
                          <MissingTherapistIcon className="size-6 shrink-0" />
                        )}
                        {booking.therapistName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem profissional</span>
                    )}
                  </TableCell>
                  {/* Ocupa o que sobra da linha e corta com reticências em vez de quebrar. */}
                  <TableCell className="max-w-0 truncate px-4 @max-lg:hidden">
                    {booking.service.serviceName}{" "}
                    <span className="text-muted-foreground">
                      · {formatDuration(booking.durationMinutes)} · {booking.treatmentRoom.roomName}
                    </span>
                  </TableCell>
                  {canManage && (
                    <TableCell className="px-4 text-right">
                      <BookingActions workspaceId={workspaceId} booking={booking} {...options} />
                    </TableCell>
                  )}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
