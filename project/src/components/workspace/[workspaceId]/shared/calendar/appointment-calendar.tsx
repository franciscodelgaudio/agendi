"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import FullCalendar, {
  type CalendarRef,
  type EventChangeInfo,
  type EventInput,
  type EventSourceFuncInfo,
} from "@fullcalendar/react"
import monarchThemePlugin from "@fullcalendar/react/themes/monarch"
import dayGridPlugin from "@fullcalendar/react/daygrid"
import timeGridPlugin from "@fullcalendar/react/timegrid"
import interactionPlugin from "@fullcalendar/react/interaction"
import ptBrLocale from "@fullcalendar/react/locales/pt-br"
import "@fullcalendar/react/skeleton.css"
import "@fullcalendar/react/themes/monarch/theme.css"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
  updateAppointmentAction,
} from "@/lib/actions/appointment"
import { BOOKING_COLORS } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors"
import type { AppointmentRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment-list"
import { createRescheduleQueue, type RescheduleTimes } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/reschedule-queue"
import { BRT_OFFSET_HOURS } from "@/service/_shared/timezone"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Popover, PopoverClose, PopoverContent } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  AppointmentForm,
  type AppointmentFormOptions,
  type AppointmentFormValues,
} from "@/components/workspace/[workspaceId]/shared/calendar/appointment-form"
import {
  appointmentFormValues,
  DeleteAppointmentDialog,
  StatusButtons,
  STATUS_LABELS,
  type AppointmentPermissions,
} from "@/components/workspace/[workspaceId]/shared/calendar/appointment-actions"
import {
  MissingTherapistIcon,
  TherapistAvatar,
  TherapistLabel,
  TherapistSelectValue,
} from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

export type CalendarOptions = Required<AppointmentFormOptions>

type Props = CalendarOptions &
  AppointmentPermissions & {
    workspaceId: string
    unitId?: string
  }

const ALL = "all"
const HOUR_MS = 60 * 60 * 1000
const RETRY_MESSAGE = "Sem conexão. Tentando salvar de novo…"
const KEEPS_DRAFT = "data-keeps-draft"

function toWallTime(date: Date) {
  return date.toISOString().slice(0, 16)
}

function toDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function withTimes(appointment: AppointmentRow, times: RescheduleTimes): AppointmentRow {
  const durationMinutes = Math.round(
    (new Date(`${times.endsAt}:00Z`).getTime() - new Date(`${times.startsAt}:00Z`).getTime()) / 60000,
  )
  return { ...appointment, ...times, durationMinutes }
}

function brtNow() {
  return new Date(Date.now() - BRT_OFFSET_HOURS * HOUR_MS)
}

type SheetInput =
  | { mode: "edit"; appointment: AppointmentRow }
  | { mode: "view"; appointment: AppointmentRow }

type SheetState = SheetInput & { key: number }

type Draft = { values: AppointmentFormValues; key: number; fallbackAnchor: Element | null }

export function AppointmentCalendar({
  workspaceId,
  canSchedule,
  canAttend,
  unitId,
  units,
  therapists,
  services,
  stations,
}: Props) {
  const calendarRef = useRef<CalendarRef>(null)
  const [unit, setUnit] = useState(unitId ?? "")
  const [member, setMember] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftEl, setDraftEl] = useState<HTMLElement | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const silentFetch = useRef(false)
  const mounted = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    mounted.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
    return () => {
      mounted.current = false
    }
  }, [])

  const permissions = { canSchedule, canAttend }
  const therapistsById = new Map(therapists.map((option) => [option.id, option]))
  const colors = new Map(therapists.map((option, i) => [option.id, BOOKING_COLORS[i % BOOKING_COLORS.length].value]))
  const canCreate = canSchedule && units.length > 0 && services.length > 0
  const options = { units: unitId ? undefined : units, therapists, services, stations }

  const busy = useRef(0)
  const changes = useRef(0)
  const idleWaiters = useRef<(() => void)[]>([])

  function whenIdle() {
    return busy.current ? new Promise<void>((resolve) => idleWaiters.current.push(resolve)) : Promise.resolve()
  }

  function hold() {
    busy.current += 1
  }

  function release() {
    busy.current -= 1
    if (busy.current > 0) return
    const waiters = idleWaiters.current
    idleWaiters.current = []
    for (const resolve of waiters) resolve()
  }

  const fetchEvents = useCallback(
    async (info: EventSourceFuncInfo): Promise<EventInput[]> => {
      const params = new URLSearchParams(
        Object.entries({ start: toDay(info.start), end: toDay(info.end), unit, member }).filter(([, v]) => v),
      )
      let appointments: AppointmentRow[]
      for (;;) {
        await whenIdle()
        const seen = changes.current
        const response = await fetch(`/api/workspace/${workspaceId}/appointments?${params}`)
        const result: { appointments: AppointmentRow[] } | { error: string } = await response.json()
        if ("error" in result) {
          setError(result.error)
          throw new Error(result.error)
        }
        await whenIdle()
        if (changes.current === seen) {
          appointments = result.appointments
          break
        }
      }
      return appointments.map((appointment) => ({
        id: appointment.id,
        title: `${appointment.customerName ?? "Cliente"} · ${appointment.name}`,
        start: appointment.startsAt,
        end: appointment.endsAt,
        color: appointment.color ?? colors.get(appointment.workspaceMemberId) ?? "#64748b",
        ...(appointment.status !== "scheduled" && { editable: false, className: "opacity-55" }),
        extendedProps: { appointment },
      }))
    },
    [workspaceId, unit, member, therapists],
  )

  function refetch() {
    calendarRef.current?.getApi().refetchEvents()
  }

  function openSheet(next: SheetInput) {
    setSheet({ ...next, key: (sheet?.key ?? 0) + 1 })
    setSheetOpen(true)
  }

  function closeAndRefetch() {
    setSheetOpen(false)
    refetch()
  }

  function openCreate(startsAt: string, durationMinutes: number, fallbackAnchor: Element | null = null) {
    setDraft({
      key: (draft?.key ?? 0) + 1,
      fallbackAnchor,
      values: {
        unitId: unit || (units.length === 1 ? units[0].id : null),
        workspaceMemberId: member || null,
        customer: null,
        startsAt,
        durationMinutes,
        serviceId: null,
        stationId: null,
        color: null,
      },
    })
  }

  const draftEvents = useMemo<EventInput[]>(() => {
    if (!draft) return []
    const start = new Date(`${draft.values.startsAt}:00Z`)
    return [
      {
        id: "draft",
        start,
        end: new Date(start.getTime() + draft.values.durationMinutes * 60000),
        display: "block",
        editable: false,
        color: "color-mix(in oklch, var(--primary) 30%, transparent)",
        contrastColor: "var(--foreground)",
        className: "shadow-lg ring-1 ring-primary/40 backdrop-blur-sm",
        extendedProps: { draft: true },
      },
    ]
  }, [draft])
  const eventSources = useMemo(() => [fetchEvents, draftEvents], [fetchEvents, draftEvents])
  const draftAnchor = draftEl ?? draft?.fallbackAnchor ?? null

  const [queue] = useState(() =>
    createRescheduleQueue({
      save: (id, times) => rescheduleAppointmentAction(workspaceId, id, times),
      revert: (id, times) => {
        const event = calendarRef.current?.getApi().getEventById(id)
        if (!event) return
        event.setDates(new Date(`${times.startsAt}:00Z`), new Date(`${times.endsAt}:00Z`))
        event.setExtendedProp("appointment", withTimes(event.extendedProps.appointment, times))
      },
      onError: (message) => {
        setError((current) => (current === RETRY_MESSAGE ? null : current))
        toast.error(message)
      },
      onRetry: () => setError(RETRY_MESSAGE),
      onSaved: () => setError((current) => (current === RETRY_MESSAGE ? null : current)),
      onIdle: () => {
        release()
        silentFetch.current = true
        refetch()
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 15000),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }),
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.pending()) e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [queue])

  function handleChange({ event, oldEvent }: EventChangeInfo) {
    setError(null)
    changes.current += 1
    const times = { startsAt: toWallTime(event.start!), endsAt: toWallTime(event.end!) }
    event.setExtendedProp("appointment", withTimes(event.extendedProps.appointment, times))
    if (!queue.pending()) hold()
    queue.push(event.id, { startsAt: toWallTime(oldEvent.start!), endsAt: toWallTime(oldEvent.end!) }, times)
  }

  function handleInteractionStop() {
    queueMicrotask(release)
  }

  const memberAvatar = (appointment: AppointmentRow, className: string) => {
    const option = therapistsById.get(appointment.workspaceMemberId)
    return option ? <TherapistAvatar therapist={option} className={className} /> : <MissingTherapistIcon className={className} />
  }

  const filterSelect = (
    label: string,
    allLabel: string,
    value: string,
    onChange: (value: string) => void,
    list: { id: string; name: string }[],
    withAvatar = false,
  ) => {
    const items = [{ value: ALL, label: allLabel }, ...list.map((item) => ({ value: item.id, label: item.name }))]
    return (
      <Select items={items} value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : (next as string))}>
        <SelectTrigger className="w-full sm:w-56" aria-label={label}>
          {withAvatar ? <TherapistSelectValue therapists={therapists} fallback={allLabel} /> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => {
            const option = withAvatar && therapistsById.get(item.value)
            return (
              <SelectItem key={item.value} value={item.value}>
                {option ? <TherapistLabel therapist={option} /> : item.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    )
  }

  const viewed = sheet && (sheet.mode === "edit" || sheet.mode === "view") ? sheet.appointment : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {!unitId && filterSelect("Filtrar por unidade", "Todas as unidades", unit, setUnit, units)}
          {filterSelect("Filtrar por profissional", "Todas as profissionais", member, setMember, therapists, true)}
        </div>
        {canCreate && (
          <Button
            {...{ [KEEPS_DRAFT]: "" }}
            onClick={(e) => {
              const start = new Date(Math.ceil(brtNow().getTime() / HOUR_MS) * HOUR_MS)
              calendarRef.current?.getApi().gotoDate(start)
              openCreate(toWallTime(start), 60, e.currentTarget)
            }}
          >
            <PlusIcon />
            Novo agendamento
          </Button>
        )}
      </div>

      {canSchedule && units.length === 0 && (
        <p className="text-sm text-muted-foreground">Cadastre uma unidade antes de criar agendamentos.</p>
      )}
      {canSchedule && units.length > 0 && services.length === 0 && (
        <p className="text-sm text-muted-foreground">Cadastre um serviço antes de criar agendamentos.</p>
      )}
      {error && <FieldError>{error}</FieldError>}

      <div className="booking-calendar" aria-busy={eventsLoading} {...{ [KEEPS_DRAFT]: "" }}>
        {hydrated && (
          <FullCalendar
            ref={calendarRef}
            plugins={[monarchThemePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={ptBrLocale}
            timeZone="UTC"
            now={brtNow}
            initialView="timeGridWeek"
            headerToolbar={{ start: "prev,next today", center: "title", end: "dayGridMonth,timeGridWeek,timeGridDay" }}
            height="auto"
            allDaySlot={false}
            scrollTime="08:00"
            slotDuration="01:00"
            snapDuration="00:30"
            slotMinHeight={48}
            slotHeaderInnerClass="text-xs!"
            nowIndicator
            dayMaxEvents
            eventSources={eventSources}
            loading={(isLoading) => {
              if (!isLoading) silentFetch.current = false
              else if (silentFetch.current) return
              if (mounted.current) queueMicrotask(() => setEventsLoading(isLoading))
            }}
            eventDidMount={({ event, el }) => {
              if (event.extendedProps.draft) setDraftEl(el)
            }}
            eventWillUnmount={({ event, el }) => {
              if (event.extendedProps.draft) setDraftEl((current) => (current === el ? null : current))
            }}
            datesSet={({ start, end }) => {
              if (!draft) return
              setDraft((current) =>
                current && current.values.startsAt >= toWallTime(start) && current.values.startsAt < toWallTime(end)
                  ? current
                  : null,
              )
            }}
            columnEventInnerClass={({ isShort }) => (isShort ? undefined : "h-full")}
            eventContent={({ event, timeText, view, isShort }) => {
              const appointment = event.extendedProps.appointment as AppointmentRow | undefined
              if (!appointment) {
                return (
                  <div className="overflow-hidden px-1.5 py-1 text-xs leading-snug">
                    {event.extendedProps.draft && <div className="truncate font-semibold">Novo agendamento</div>}
                    <div className="truncate tabular-nums">{timeText}</div>
                  </div>
                )
              }
              const customerName = (
                <span className="flex min-w-0 items-center gap-1 font-semibold">
                  {appointment.status === "done" && <CheckIcon className="size-3 shrink-0" aria-label="Concluído" />}
                  <span className="truncate">{appointment.customerName ?? "Cliente excluído"}</span>
                </span>
              )
              if (view.type.startsWith("dayGrid") || isShort) {
                return (
                  <div className="@container w-full min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-1 text-xs leading-tight">
                      {memberAvatar(appointment, "size-4 shrink-0 @max-[4.5rem]:hidden")}
                      <span className="shrink-0 tabular-nums opacity-85 @max-[7rem]:hidden">
                        {toWallTime(event.start!).slice(11)}
                      </span>
                      {customerName}
                    </div>
                  </div>
                )
              }
              return (
                <div className="@container h-full w-full min-w-0">
                  <div className="flex h-full min-w-0 flex-col flex-wrap gap-x-3 gap-y-0.5 overflow-hidden px-1.5 py-1 text-xs leading-snug">
                    <div className="flex w-full min-w-0 items-center gap-1.5">
                      {memberAvatar(appointment, "size-5 shrink-0 ring-1 ring-white/60 @max-[4.5rem]:hidden")}
                      {customerName}
                    </div>
                    <div className="w-full truncate tabular-nums opacity-85">
                      {timeText}
                      {appointment.stationName && <span className="@max-[8rem]:hidden"> · {appointment.stationName}</span>}
                    </div>
                    <div className="w-full truncate opacity-85 @max-[8rem]:hidden">
                      {appointment.name}
                      {appointment.memberName && <span className="@max-[12rem]:hidden"> · {appointment.memberName}</span>}
                    </div>
                  </div>
                </div>
              )
            }}
            selectable={canCreate}
            selectMirror
            select={(info) => {
              info.view.calendar.unselect()
              if (info.allDay) openCreate(`${toDay(info.start)}T09:00`, 60)
              else openCreate(toWallTime(info.start), Math.round((info.end.getTime() - info.start.getTime()) / 60000))
            }}
            editable={canSchedule}
            eventDragStart={hold}
            eventDragStop={handleInteractionStop}
            eventResizeStart={hold}
            eventResizeStop={handleInteractionStop}
            eventDrop={handleChange}
            eventResize={handleChange}
            eventClick={({ event }) => {
              const appointment = event.extendedProps.appointment as AppointmentRow | undefined
              if (!appointment || (!canSchedule && !canAttend)) return
              setDraft(null)
              const editable = appointment.status === "scheduled" && canSchedule
              openSheet({ mode: editable ? "edit" : "view", appointment })
            }}
          />
        )}
      </div>

      <Popover
        open={!!draft && !!draftAnchor}
        onOpenChange={(open, { reason, event }) => {
          if (open) return
          const target = event?.target
          if (reason === "outside-press" && target instanceof Element && target.closest(`[${KEEPS_DRAFT}]`)) return
          setDraft(null)
        }}
      >
        <PopoverContent
          anchor={draftAnchor}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="max-h-[min(36rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        >
          {draft && (
            <AppointmentForm
              key={draft.key}
              workspaceId={workspaceId}
              {...options}
              mode="create"
              variant="popover"
              defaultValues={draft.values}
              action={(prev, formData) => createAppointmentAction(workspaceId, prev, formData)}
              onDone={() => {
                setDraft(null)
                refetch()
              }}
            />
          )}
          <PopoverClose render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}>
            <XIcon />
            <span className="sr-only">Fechar</span>
          </PopoverClose>
        </PopoverContent>
      </Popover>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          {sheet?.mode === "edit" && (
            <AppointmentForm
              key={sheet.key}
              workspaceId={workspaceId}
              {...options}
              mode="edit"
              defaultValues={appointmentFormValues(sheet.appointment)}
              action={(prev, formData) => updateAppointmentAction(workspaceId, sheet.appointment.id, prev, formData)}
              onDone={closeAndRefetch}
              footer={
                <>
                  <StatusButtons
                    workspaceId={workspaceId}
                    appointment={sheet.appointment}
                    permissions={permissions}
                    onDone={closeAndRefetch}
                  />
                  <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                    Excluir
                  </Button>
                </>
              }
            />
          )}
          {sheet?.mode === "view" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <SheetHeader>
                <SheetTitle>{sheet.appointment.name}</SheetTitle>
                <SheetDescription>{STATUS_LABELS[sheet.appointment.status]}</SheetDescription>
              </SheetHeader>
              <dl className="grid gap-3 px-4 text-sm">
                {[
                  ["Cliente", sheet.appointment.customerName ?? "Cliente excluído"],
                  ["Profissional", sheet.appointment.memberName ?? "—"],
                  ["Estação", sheet.appointment.stationName ?? "—"],
                  ["Início", sheet.appointment.startsAt.replace("T", " às ")],
                  ["Duração", `${sheet.appointment.durationMinutes} min`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <SheetFooter>
                <StatusButtons
                  workspaceId={workspaceId}
                  appointment={sheet.appointment}
                  permissions={permissions}
                  onDone={closeAndRefetch}
                />
                {canSchedule && (
                  <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                    Excluir
                  </Button>
                )}
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {viewed && (
        <DeleteAppointmentDialog
          workspaceId={workspaceId}
          appointment={viewed}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDone={closeAndRefetch}
        />
      )}
    </div>
  )
}
