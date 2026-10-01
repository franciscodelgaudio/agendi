import { BanknoteIcon, BedDoubleIcon, MapPinIcon, ClockIcon, SettingsIcon, LeafIcon, UserIcon } from "lucide-react"
import { cn } from "cn"
import { AppointmentActions } from "@/components/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-actions"
import type { AppointmentOptions } from "@/components/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-form"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { TherapistAvatar, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"
import { currencyFormat, formatDuration, timeFormat } from "@/components/shared/service-format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppointmentListQuery } from "@/service/workspace/[workspaceId]/unit/[unitId]/appointments/appointment-list"

export type AppointmentRow = {
  id: string
  unitId: string
  performedAt: Date
  guest: { name: string; room: string }
  items: {
    serviceId: string
    serviceName: string
    priceCents: number
    durationMinutes: number
    therapistId: string
    therapistName: string
  }[]
  productIds: string[]
  totalCents: number
}

type Props = {
  appointments: AppointmentRow[]
  // Sem a página: ordenar volta para a primeira.
  query: Omit<AppointmentListQuery, "page">
  pathname: string
  workspaceId: string
  // Opções do formulário de edição; com units (visão do workspace), aparece a coluna Unidade.
  options: AppointmentOptions
  // Sem permissão, a coluna de ações (editar/excluir) não aparece.
  canManage: boolean
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
})

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

// Mostra só o primeiro item; os demais ficam no tooltip do "+N" para a linha não quebrar.
function FirstWithMore<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const [first, ...rest] = items
  if (!first) return "—"
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex min-w-0 items-center gap-2 truncate">{render(first)}</span>
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="shrink-0 cursor-help rounded-sm bg-muted px-1.5 text-xs font-medium text-muted-foreground" />
            }
          >
            +{rest.length}
          </TooltipTrigger>
          <TooltipContent className="max-w-none">
            <ul className="grid gap-1">
              {rest.map((item, index) => (
                <li key={index} className="flex items-center gap-2">
                  {render(item)}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}

function ServiceLine({ item }: { item: AppointmentRow["items"][number] }) {
  return (
    <span className="truncate">
      {item.serviceName}{" "}
      <span className="text-muted-foreground">· {formatDuration(item.durationMinutes)}</span>
    </span>
  )
}

// Profissionais distintos do atendimento, na ordem dos serviços.
function appointmentTherapists(items: AppointmentRow["items"]) {
  const seen = new Map<string, string>()
  for (const item of items) if (!seen.has(item.therapistId)) seen.set(item.therapistId, item.therapistName)
  return [...seen].map(([id, name]) => ({ id, name }))
}

function TherapistLine({
  therapist,
  therapistsById,
}: {
  therapist: { id: string; name: string }
  therapistsById: Map<string, TherapistOption>
}) {
  // Quem saiu do workspace não está nas opções: fica só com o nome copiado.
  const option = therapistsById.get(therapist.id)
  return (
    <>
      {option && <TherapistAvatar therapist={option} className="size-6" />}
      <span className="truncate">{therapist.name}</span>
    </>
  )
}

export function AppointmentTable({ appointments, query, pathname, workspaceId, options, canManage }: Props) {
  const unitNames = options.units && new Map(options.units.map((unit) => [unit.id, unit.name]))
  const therapistsById = new Map(options.therapists.map((therapist) => [therapist.id, therapist]))
  const columns = 6 + (unitNames ? 1 : 0) + (canManage ? 1 : 0)
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-5xl:hidden" />
            <SortableHead field="performedAt" label="Horário" icon={ClockIcon} query={query} pathname={pathname} />
            {unitNames && <Head icon={MapPinIcon} label="Unidade" className="@max-4xl:hidden" />}
            <SortableHead field="guestName" label="Hóspede" icon={BedDoubleIcon} query={query} pathname={pathname} />
            <Head icon={UserIcon} label="Profissional" className="@max-2xl:hidden" />
            <Head icon={LeafIcon} label="Serviços" className="w-full @max-lg:hidden" />
            <SortableHead
              field="totalCents"
              label="Total"
              icon={BanknoteIcon}
              query={query}
              pathname={pathname}
              className="@max-2xl:hidden"
            />
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
          {appointments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum atendimento encontrado.
              </TableCell>
            </TableRow>
          ) : (
            appointments.map((appointment) => (
              <TableRow key={appointment.id}>
                <CodeCell id={appointment.id} className="@max-5xl:hidden" />
                <TableCell className="px-4">
                  <span className="font-medium">{dayFormat.format(appointment.performedAt)}</span>{" "}
                  <span className="text-muted-foreground tabular-nums">
                    · {timeFormat.format(appointment.performedAt)}
                  </span>
                </TableCell>
                {unitNames && (
                  <TableCell className="px-4 @max-4xl:hidden">{unitNames.get(appointment.unitId) ?? "—"}</TableCell>
                )}
                <TableCell className="px-4">
                  {/* O quarto fica escondido no tooltip para a linha caber em uma altura só. */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="cursor-help font-medium underline decoration-muted-foreground/50 decoration-dotted underline-offset-4" />
                      }
                    >
                      {appointment.guest.name}
                    </TooltipTrigger>
                    <TooltipContent>Quarto {appointment.guest.room}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="px-4 @max-2xl:hidden">
                  <FirstWithMore
                    items={appointmentTherapists(appointment.items)}
                    render={(therapist) => <TherapistLine therapist={therapist} therapistsById={therapistsById} />}
                  />
                </TableCell>
                {/* Ocupa o que sobra da linha e corta com reticências em vez de quebrar. */}
                <TableCell className="max-w-0 px-4 @max-lg:hidden">
                  <FirstWithMore items={appointment.items} render={(item) => <ServiceLine item={item} />} />
                </TableCell>
                <TableCell className="px-4 font-medium tabular-nums @max-2xl:hidden">
                  {currencyFormat.format(appointment.totalCents / 100)}
                </TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <AppointmentActions
                      workspaceId={workspaceId}
                      appointment={appointment}
                      {...options}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
