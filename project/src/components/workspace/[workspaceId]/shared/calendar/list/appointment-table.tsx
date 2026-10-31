import { ClockIcon, ContactIcon, LeafIcon, MapPinIcon, UserIcon } from "lucide-react"
import { cn } from "cn"
import type { AppointmentListQuery, AppointmentRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import {
  AppointmentRowActions,
  STATUS_LABELS,
  type AppointmentPermissions,
} from "@/components/workspace/[workspaceId]/shared/calendar/appointment-actions"
import type { AppointmentFormOptions } from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"
import { SortableHead } from "@/components/shared/sortable-head"
import { formatDuration } from "@/components/shared/service-format"
import { MissingTherapistIcon, TherapistAvatar } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Props = {
  appointments: AppointmentRow[]
  query: Omit<AppointmentListQuery, "page"> & Record<string, string>
  pathname: string
  workspaceId: string
  options: AppointmentFormOptions
  permissions: AppointmentPermissions
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

function formatDay(dateTime: string) {
  return dayFormat.format(new Date(`${dateTime.slice(0, 10)}T00:00:00Z`))
}

const STATUS_VARIANTS = { scheduled: "outline", done: "default", cancelled: "secondary" } as const

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

export function AppointmentTable({ appointments, query, pathname, workspaceId, options, permissions }: Props) {
  const unitNames = options.units && new Map(options.units.map((unit) => [unit.id, unit.name]))
  const therapistsById = new Map(options.therapists.map((therapist) => [therapist.id, therapist]))
  const manages = permissions.canSchedule || permissions.canAttend
  const columns = 5 + (unitNames ? 1 : 0) + (manages ? 1 : 0)

  return (
    <div className="@container border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead field="startsAt" label="Quando" icon={ClockIcon} query={query} pathname={pathname} />
            <SortableHead field="customer" label="Cliente" icon={ContactIcon} query={query} pathname={pathname} className="w-full" />
            <SortableHead field="name" label="Serviço" icon={LeafIcon} query={query} pathname={pathname} className="@max-2xl:hidden" />
            <Head icon={UserIcon} label="Profissional" className="@max-3xl:hidden" />
            {unitNames && <Head icon={MapPinIcon} label="Unidade" className="@max-4xl:hidden" />}
            <TableHead className="px-4 @max-md:hidden">Status</TableHead>
            {manages && <TableHead className="w-0 px-4" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum agendamento encontrado.
              </TableCell>
            </TableRow>
          )}
          {appointments.map((appointment) => {
            const therapist = therapistsById.get(appointment.workspaceMemberId)
            return (
              <TableRow key={appointment.id} className={cn(appointment.status === "cancelled" && "text-muted-foreground")}>
                <TableCell className="px-4 whitespace-nowrap">
                  <div className="first-letter:uppercase">{formatDay(appointment.startsAt)}</div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {appointment.startsAt.slice(11)} · {formatDuration(appointment.durationMinutes)}
                  </div>
                </TableCell>
                <TableCell className="max-w-0 px-4">
                  <div className="truncate font-medium">{appointment.customerName ?? "Cliente excluído"}</div>
                  <div className="truncate text-sm text-muted-foreground @2xl:hidden">{appointment.name}</div>
                </TableCell>
                <TableCell className="px-4 whitespace-nowrap @max-2xl:hidden">
                  <div>{appointment.name}</div>
                  {appointment.stationName && <div className="text-sm text-muted-foreground">{appointment.stationName}</div>}
                </TableCell>
                <TableCell className="px-4 whitespace-nowrap @max-3xl:hidden">
                  <span className="inline-flex items-center gap-2">
                    {therapist ? (
                      <TherapistAvatar therapist={therapist} className="size-6" />
                    ) : (
                      <MissingTherapistIcon className="size-6" />
                    )}
                    {appointment.memberName ?? "—"}
                  </span>
                </TableCell>
                {unitNames && (
                  <TableCell className="px-4 whitespace-nowrap @max-4xl:hidden">{unitNames.get(appointment.unitId) ?? "—"}</TableCell>
                )}
                <TableCell className="px-4 @max-md:hidden">
                  <Badge variant={STATUS_VARIANTS[appointment.status]}>{STATUS_LABELS[appointment.status]}</Badge>
                </TableCell>
                {manages && (
                  <TableCell className="px-4 text-right">
                    <AppointmentRowActions
                      workspaceId={workspaceId}
                      appointment={appointment}
                      permissions={permissions}
                      options={options}
                    />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
