"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
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
import Link from "@/components/link"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { convertBookingAction } from "@/lib/actions/appointment"
import {
  createBookingAction,
  deleteBookingAction,
  rescheduleBookingAction,
  updateBookingAction,
} from "@/lib/actions/booking"
import { BOOKING_COLORS } from "@/lib/booking-colors"
import type { BookingRow } from "@/lib/booking-list"
import { createRescheduleQueue, type RescheduleTimes } from "@/lib/reschedule-queue"
import { BRT_OFFSET_HOURS } from "@/lib/timezone"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Popover, PopoverClose, PopoverContent } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AppointmentForm } from "@/components/appointment-form"
import { BookingForm, type BookingFormOptions, type BookingFormValues } from "@/components/booking-form"
import { formatDuration } from "@/components/service-format"
import { TherapistAvatar, TherapistLabel, TherapistSelectValue } from "@/components/therapist-avatar"

export type BookingOptions = Required<BookingFormOptions>

// unitId: calendário de uma unidade (units traz só ela); sem filtro nem escolha de unidade.
type Props = BookingOptions & { workspaceId: string; canManage: boolean; unitId?: string }

const ALL = "all"
const HOUR_MS = 60 * 60 * 1000

// O calendário roda em UTC com os horários "de parede" de Brasília: a string
// "2026-09-24T14:30" vira um Date cujos campos UTC são 14:30, e volta igual.
function toWallTime(date: Date) {
  return date.toISOString().slice(0, 16)
}

function toDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function withTimes(booking: BookingRow, times: RescheduleTimes): BookingRow {
  const durationMinutes = Math.round(
    (new Date(`${times.endsAt}:00Z`).getTime() - new Date(`${times.startsAt}:00Z`).getTime()) / 60000,
  )
  return { ...booking, ...times, durationMinutes }
}

const RETRY_MESSAGE = "Sem conexão. Tentando salvar de novo…"

// Hora atual de Brasília no mesmo esquema, para o "hoje" e a linha de agora.
function brtNow() {
  return new Date(Date.now() - BRT_OFFSET_HOURS * HOUR_MS)
}

// convert: formulário de atendimento pré-preenchido; done: resumo do agendamento já atendido.
type SheetInput =
  | { mode: "edit"; values: BookingFormValues; booking: BookingRow }
  | { mode: "convert"; booking: BookingRow }
  | { mode: "done"; booking: BookingRow }

// key muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
type SheetState = SheetInput & { key: number }

// Agendamento novo: um rascunho fosco no calendário com o formulário num balão ao lado.
// fallbackAnchor: onde o balão abre enquanto o rascunho não aparece no calendário
// (o botão "Novo agendamento", quando o horário sugerido fica fora da faixa visível).
type Draft = { values: BookingFormValues; key: number; fallbackAnchor: Element | null }

// Quem pode ser clicado sem fechar o balão: o calendário (uma nova seleção troca o
// rascunho) e o botão de novo agendamento.
const KEEPS_DRAFT = "data-keeps-draft"

export function BookingCalendar({ workspaceId, canManage, unitId, units, therapists, services }: Props) {
  const calendarRef = useRef<CalendarRef>(null)
  const [unit, setUnit] = useState(unitId ?? "")
  const [therapist, setTherapist] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftEl, setDraftEl] = useState<HTMLElement | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  // A primeira busca começa junto com o calendário, então ele já nasce carregando.
  const [eventsLoading, setEventsLoading] = useState(true)
  // A busca que confirma arrastes já salvos não esmaece o calendário.
  const silentFetch = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const therapistsById = new Map(therapists.map((option) => [option.id, option]))
  // Uma cor por massagista, na ordem da lista (o proprietário primeiro).
  const colors = new Map(therapists.map((option, i) => [option.id, BOOKING_COLORS[i % BOOKING_COLORS.length].value]))
  // O proprietário sempre está entre as massagistas, então basta haver uma unidade.
  const canCreate = canManage && units.length > 0
  const options = { units: unitId ? undefined : units, therapists, services }

  // Cada busca recria os ids internos dos eventos, e ao soltar um arraste o FullCalendar grava
  // a cópia do evento feita no início dele. Uma busca que chegasse no meio deixaria as duas
  // versões no calendário (o agendamento duplicado), então a resposta espera arrastes e
  // remarcações acabarem e, se algo mudou nesse meio-tempo, busca de novo.
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

  // Uma nova função a cada troca de filtro faz o calendário buscar de novo.
  const fetchEvents = useCallback(
    async (info: EventSourceFuncInfo): Promise<EventInput[]> => {
      // O FullCalendar também busca no render do servidor; lá não há sessão do navegador
      // nem URL base, então a busca fica para o cliente.
      if (typeof window === "undefined") return []
      const params = new URLSearchParams(
        Object.entries({ start: toDay(info.start), end: toDay(info.end), unit, therapist }).filter(([, v]) => v),
      )
      let bookings: BookingRow[]
      for (;;) {
        await whenIdle()
        const seen = changes.current
        const response = await fetch(`/api/workspace/${workspaceId}/bookings?${params}`)
        const result: { bookings: BookingRow[] } | { error: string } = await response.json()
        if ("error" in result) {
          setError(result.error)
          throw new Error(result.error)
        }
        await whenIdle()
        if (changes.current === seen) {
          bookings = result.bookings
          break
        }
      }
      return bookings.map((booking) => ({
        id: booking.id,
        title: `${booking.guest.name} · Quarto ${booking.guest.room}`,
        start: booking.startsAt,
        end: booking.endsAt,
        // A cor escolhida no agendamento vale mais que a da massagista.
        color: booking.color ?? colors.get(booking.therapistId) ?? "#64748b",
        // Já atendido: fica no calendário como histórico, esmaecido e sem arrastar.
        ...(booking.appointmentId && { editable: false, className: "opacity-55" }),
        extendedProps: { booking },
      }))
    },
    // colors deriva de therapists, que só muda com um novo render do servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, unit, therapist, therapists],
  )

  function refetch() {
    calendarRef.current?.getApi().refetchEvents()
  }

  function openSheet(next: SheetInput) {
    setSheet({ ...next, key: (sheet?.key ?? 0) + 1 })
    setSheetOpen(true)
  }

  function openCreate(startsAt: string, durationMinutes: number, fallbackAnchor: Element | null = null) {
    setDraft({
      key: (draft?.key ?? 0) + 1,
      fallbackAnchor,
      values: {
        unitId: unit || (units.length === 1 ? units[0].id : null),
        therapistId: therapist || null,
        guestName: "",
        room: "",
        startsAt,
        durationMinutes,
        serviceId: null,
        productIds: [],
        color: null,
      },
    })
  }

  // O rascunho entra como uma segunda fonte de eventos; a busca dos agendamentos não se repete.
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

  // Arrastes salvos em fila, na ordem feita; enquanto ela anda, as buscas esperam.
  const [queue] = useState(() =>
    createRescheduleQueue({
      save: (id, times) => rescheduleBookingAction(workspaceId, id, times),
      revert: (id, times) => {
        const event = calendarRef.current?.getApi().getEventById(id)
        if (!event) return
        event.setDates(new Date(`${times.startsAt}:00Z`), new Date(`${times.endsAt}:00Z`))
        event.setExtendedProp("booking", withTimes(event.extendedProps.booking, times))
      },
      onError: setError,
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

  // Fechar a página com arraste ainda não salvo pede confirmação.
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
    // O agendamento do evento acompanha o arraste, para o formulário abrir com o horário novo.
    event.setExtendedProp("booking", withTimes(event.extendedProps.booking, times))
    if (!queue.pending()) hold()
    queue.push(event.id, { startsAt: toWallTime(oldEvent.start!), endsAt: toWallTime(oldEvent.end!) }, times)
  }

  // O fim do arraste vem antes do eventDrop/eventResize, que são disparados em seguida no mesmo
  // tique; liberar só no próximo deixa a remarcação segurar as buscas antes disso.
  function handleInteractionStop() {
    queueMicrotask(release)
  }

  function handleDelete(booking: BookingRow) {
    startDelete(async () => {
      const result = await deleteBookingAction(workspaceId, booking.id)
      setDeleteError(result.error)
      if (!result.error) {
        setDeleteOpen(false)
        setSheetOpen(false)
        refetch()
      }
    })
  }

  // Nos eventos, o avatar vem da lista de massagistas; quem saiu do workspace fica só com o nome.
  const therapistAvatar = (booking: BookingRow, className: string) => {
    const option = therapistsById.get(booking.therapistId)
    return option && <TherapistAvatar therapist={option} className={className} />
  }

  const filterSelect = (
    label: string,
    allLabel: string,
    value: string,
    onChange: (value: string) => void,
    list: { id: string; name: string }[],
    // Filtro de massagista: o valor e as opções mostram o avatar.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {!unitId && filterSelect("Filtrar por unidade", "Todas as unidades", unit, setUnit, units)}
          {filterSelect("Filtrar por massagista", "Todas as massagistas", therapist, setTherapist, therapists, true)}
        </div>
        {canCreate && (
          <Button
            {...{ [KEEPS_DRAFT]: "" }}
            onClick={(e) => {
              const start = new Date(Math.ceil(brtNow().getTime() / HOUR_MS) * HOUR_MS)
              // Leva o calendário até o horário sugerido para o rascunho aparecer.
              calendarRef.current?.getApi().gotoDate(start)
              openCreate(toWallTime(start), 60, e.currentTarget)
            }}
          >
            <PlusIcon />
            Novo agendamento
          </Button>
        )}
      </div>

      {canManage && !canCreate && (
        <p className="text-sm text-muted-foreground">Cadastre uma unidade antes de criar agendamentos.</p>
      )}
      {error && <FieldError>{error}</FieldError>}

      <div className="booking-calendar" aria-busy={eventsLoading} {...{ [KEEPS_DRAFT]: "" }}>
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
          slotMinTime="06:00"
          slotMaxTime="24:00"
          scrollTime="08:00"
          // Uma faixa por hora, como no Google Agenda; arrastar e selecionar continuam de 30 em 30 min.
          slotDuration="01:00"
          snapDuration="00:30"
          slotMinHeight={48}
          nowIndicator
          dayMaxEvents
          eventSources={eventSources}
          // O FullCalendar avisa do carregamento no meio do próprio render; o estado muda logo depois dele.
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
          // Mudou o período à vista: o rascunho só fica se ainda estiver nele. O FullCalendar dispara
          // isto já ao ser criado, durante o render e antes de este componente montar, então sem
          // rascunho não há o que atualizar.
          datesSet={({ start, end }) => {
            if (!draft) return
            setDraft((current) =>
              current && current.values.startsAt >= toWallTime(start) && current.values.startsAt < toWallTime(end)
                ? current
                : null,
            )
          }}
          // Altura definida no miolo do evento, para o conteúdo esconder as linhas que não cabem inteiras.
          columnEventInnerClass={({ isShort }) => (isShort ? undefined : "h-full")}
          eventContent={({ event, timeText, view, isShort }) => {
            // O evento-espelho da seleção (selectMirror) não tem agendamento associado.
            const booking = event.extendedProps.booking as BookingRow | undefined
            if (!booking) {
              return (
                <div className="overflow-hidden px-1.5 py-1 text-xs leading-snug">
                  {event.extendedProps.draft && <div className="truncate font-semibold">Novo agendamento</div>}
                  <div className="truncate tabular-nums">{timeText}</div>
                </div>
              )
            }
            const guestName = (
              <span className="flex min-w-0 items-center gap-1 font-semibold">
                {booking.appointmentId && <CheckIcon className="size-3 shrink-0" aria-label="Atendido" />}
                <span className="truncate">{booking.guest.name}</span>
              </span>
            )
            // No mês e em eventos curtos cabe uma linha só: hora e hóspede. Estreito (vários
            // agendamentos no mesmo horário), sai a hora e depois o avatar, e fica só o hóspede.
            if (view.type.startsWith("dayGrid") || isShort) {
              return (
                <div className="@container w-full min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-1 text-xs leading-tight">
                    {therapistAvatar(booking, "size-4 shrink-0 @max-[4.5rem]:hidden")}
                    <span className="shrink-0 tabular-nums opacity-85 @max-[7rem]:hidden">
                      {toWallTime(event.start!).slice(11)}
                    </span>
                    {guestName}
                  </div>
                </div>
              )
            }
            // Cada linha trunca sozinha. A coluna quebra (flex-wrap) e cada linha ocupa a largura toda:
            // a linha que não cabe inteira na altura vai para uma coluna fora da vista, em vez de aparecer cortada.
            // O gap-x maior que o padding impede que o começo dessa coluna apareça no padding da direita.
            // Na largura, o que é pouco útil cortado sai de propósito: o nome da massagista (o avatar e
            // a cor já dizem quem é), depois quarto e serviço, e por fim o avatar.
            return (
              <div className="@container h-full w-full min-w-0">
                <div className="flex h-full min-w-0 flex-col flex-wrap gap-x-3 gap-y-0.5 overflow-hidden px-1.5 py-1 text-xs leading-snug">
                  <div className="flex w-full min-w-0 items-center gap-1.5">
                    {therapistAvatar(booking, "size-5 shrink-0 ring-1 ring-white/60 @max-[4.5rem]:hidden")}
                    {guestName}
                  </div>
                  <div className="w-full truncate tabular-nums opacity-85">
                    {timeText}
                    <span className="@max-[8rem]:hidden"> · Quarto {booking.guest.room}</span>
                  </div>
                  <div className="w-full truncate opacity-85 @max-[8rem]:hidden">
                    {booking.service.serviceName}
                    <span className="@max-[12rem]:hidden"> · {booking.therapistName}</span>
                  </div>
                </div>
              </div>
            )
          }}
          selectable={canCreate}
          selectMirror
          select={(info) => {
            info.view.calendar.unselect()
            // No mês a seleção é do dia inteiro: sugere 9h com 1 hora.
            if (info.allDay) openCreate(`${toDay(info.start)}T09:00`, 60)
            else openCreate(toWallTime(info.start), Math.round((info.end.getTime() - info.start.getTime()) / 60000))
          }}
          editable={canManage}
          eventDragStart={hold}
          eventDragStop={handleInteractionStop}
          eventResizeStart={hold}
          eventResizeStop={handleInteractionStop}
          eventDrop={handleChange}
          eventResize={handleChange}
          eventClick={({ event }) => {
            if (!canManage) return
            const booking = event.extendedProps.booking as BookingRow | undefined
            if (!booking) return
            setDraft(null)
            setDeleteError(null)
            if (booking.appointmentId) return openSheet({ mode: "done", booking })
            openSheet({
              mode: "edit",
              booking,
              values: {
                unitId: booking.unitId,
                therapistId: booking.therapistId,
                guestName: booking.guest.name,
                room: booking.guest.room,
                startsAt: booking.startsAt,
                durationMinutes: booking.durationMinutes,
                serviceId: booking.service.serviceId,
                productIds: booking.productIds,
                color: booking.color,
              },
            })
          }}
        />
      </div>

      {/* Sem fundo: o calendário continua à vista, com o rascunho ao lado do balão. */}
      <Popover
        open={!!draft && !!draftAnchor}
        onOpenChange={(open, { reason, event }) => {
          if (open) return
          // O clique que cria outra seleção chega depois dela; quem troca o rascunho é o select.
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
          className="max-h-[min(32rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        >
          {draft && (
            <BookingForm
              key={draft.key}
              {...options}
              mode="create"
              variant="popover"
              defaultValues={draft.values}
              action={(prev, formData) => createBookingAction(workspaceId, prev, formData)}
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
            <BookingForm
              key={sheet.key}
              {...options}
              mode="edit"
              defaultValues={sheet.values}
              action={(prev, formData) => updateBookingAction(workspaceId, sheet.booking.id, prev, formData)}
              onDone={() => {
                setSheetOpen(false)
                refetch()
              }}
              onConvert={() => openSheet({ mode: "convert", booking: sheet.booking })}
              onDelete={() => setDeleteOpen(true)}
            />
          )}
          {sheet?.mode === "convert" && (
            <AppointmentForm
              key={sheet.key}
              {...options}
              mode="create"
              defaultValues={{
                unitId: sheet.booking.unitId,
                guestName: sheet.booking.guest.name,
                room: sheet.booking.guest.room,
                performedAt: sheet.booking.startsAt,
                items: [{ serviceId: sheet.booking.service.serviceId, therapistId: sheet.booking.therapistId }],
                productIds: sheet.booking.productIds,
              }}
              action={(prev, formData) => convertBookingAction(workspaceId, sheet.booking.id, prev, formData)}
              onDone={() => {
                setSheetOpen(false)
                refetch()
              }}
            />
          )}
          {sheet?.mode === "done" && <DoneSummary workspaceId={workspaceId} booking={sheet.booking} />}
        </SheetContent>
      </Sheet>

      {sheet?.mode === "edit" && (
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(next) => {
            if (!next) setDeleteError(null)
            setDeleteOpen(next)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
              <AlertDialogDescription>
                O agendamento de <strong>{sheet.booking.guest.name}</strong> (quarto {sheet.booking.guest.room}) será
                excluído permanentemente. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && <FieldError>{deleteError}</FieldError>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" onClick={() => handleDelete(sheet.booking)} loading={deleting}>
                {deleting ? "Excluindo..." : "Excluir"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

// A data do agendamento é um horário de Brasília "de parede", então é formatada em UTC.
const doneDateFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// Agendamento que já virou atendimento: só leitura, com atalho para Atendimentos filtrado pelo dia
// na unidade do agendamento.
function DoneSummary({ workspaceId, booking }: { workspaceId: string; booking: BookingRow }) {
  const date = booking.startsAt.slice(0, 10)
  return (
    <div className="flex flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Atendimento registrado</SheetTitle>
        <SheetDescription>
          Este agendamento já virou atendimento. Para alterar valores e serviços, edite o atendimento. Se ele for
          excluído, o agendamento volta a ser editável.
        </SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 text-sm">
        <dt className="text-muted-foreground">Hóspede</dt>
        <dd>
          {booking.guest.name} · Quarto {booking.guest.room}
        </dd>
        <dt className="text-muted-foreground">Massagista</dt>
        <dd>{booking.therapistName}</dd>
        <dt className="text-muted-foreground">Horário</dt>
        <dd className="first-letter:uppercase">
          {doneDateFormat.format(new Date(`${booking.startsAt}:00Z`))} · {formatDuration(booking.durationMinutes)}
        </dd>
        <dt className="text-muted-foreground">Serviço agendado</dt>
        <dd>{booking.service.serviceName}</dd>
      </dl>
      <SheetFooter>
        <Button
          nativeButton={false}
          render={
            <Link
              href={
                `/workspace/${workspaceId}/unit/${booking.unitId}/appointments?${new URLSearchParams({ from: date, to: date })}`
              }
            />
          }
        >
          Ver em Atendimentos
        </Button>
      </SheetFooter>
    </div>
  )
}
