"use client"

import { useActionState, useRef, useState, type ReactNode } from "react"
import { CheckIcon, ChevronDownIcon, UserRoundIcon } from "lucide-react"
import type { AppointmentActionState } from "@/lib/actions/appointment"
import { createCustomerAction } from "@/lib/actions/customer"
import { BOOKING_COLORS } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateTimeField } from "@/components/shared/date-time-field"
import { currencyFormat, formatDuration } from "@/components/shared/service-format"
import { CustomerPicker, type PickedCustomer } from "@/components/workspace/[workspaceId]/shared/calendar/customer-picker"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

export type AppointmentFormValues = {
  unitId: string | null
  workspaceMemberId: string | null
  customer: PickedCustomer | null
  startsAt: string
  durationMinutes: number
  serviceId: string | null
  stationId: string | null
  color: string | null
}

export type AppointmentFormOptions = {
  units?: { id: string; name: string }[]
  therapists: TherapistOption[]
  services: { id: string; unitId: string; name: string; durationMinutes: number; priceCents: number }[]
  stations: { id: string; unitId: string; name: string }[]
}

type Props = AppointmentFormOptions & {
  workspaceId: string
  mode: "create" | "edit"
  variant?: "sheet" | "popover"
  defaultValues: AppointmentFormValues
  action: (prev: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>
  onDone: () => void
  footer?: ReactNode
}

const copy = {
  create: {
    title: "Novo agendamento",
    description: "Serviço, horário, profissional e cliente.",
    submit: "Agendar",
    pending: "Agendando...",
  },
  edit: {
    title: "Editar agendamento",
    description: "Altere os dados do agendamento.",
    submit: "Salvar alterações",
    pending: "Salvando...",
  },
}

const MIN_DURATION = 5
const MAX_DURATION = 720

const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

function unitStations(stations: AppointmentFormOptions["stations"], unitId: string | null) {
  return stations.filter((station) => station.unitId === unitId)
}

function onlyStationId(stations: AppointmentFormOptions["stations"], unitId: string | null) {
  const options = unitStations(stations, unitId)
  return options.length === 1 ? options[0].id : null
}

function endTime(startsAt: string, minutes: number) {
  const start = new Date(`${startsAt}:00Z`)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + minutes * 60000).toISOString().slice(11, 16)
}

function serviceMeta(service: { durationMinutes: number; priceCents: number }) {
  return `${formatDuration(service.durationMinutes)} · ${currencyFormat.format(service.priceCents / 100)}`
}

export function AppointmentForm({
  workspaceId,
  units,
  therapists,
  services,
  stations,
  mode,
  variant = "sheet",
  defaultValues,
  action,
  onDone,
  footer,
}: Props) {
  const [unitId, setUnitId] = useState(defaultValues.unitId)
  const [memberId, setMemberId] = useState(defaultValues.workspaceMemberId)
  const [serviceId, setServiceId] = useState(defaultValues.serviceId)
  const [stationId, setStationId] = useState(() => defaultValues.stationId ?? onlyStationId(stations, defaultValues.unitId))
  const [startsAt, setStartsAt] = useState(defaultValues.startsAt)
  const [duration, setDuration] = useState(String(defaultValues.durationMinutes))
  const [editingDuration, setEditingDuration] = useState(false)
  const [color, setColor] = useState(defaultValues.color ?? "")
  const [moreOpen, setMoreOpen] = useState(!!defaultValues.color)
  const savedCustomer = useRef<{ key: string; id: string } | null>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: AppointmentActionState, formData: FormData) => {
      if (formData.get("saveCustomer") === "on") {
        const name = String(formData.get("customerName") ?? "")
        const cellphone = String(formData.get("customerCellphone") ?? "")
        const observation = String(formData.get("customerObservation") ?? "")
        const key = `${name}|${cellphone}|${observation}`
        if (savedCustomer.current?.key !== key) {
          const customerData = new FormData()
          customerData.set("name", name)
          customerData.set("cellphone", cellphone)
          customerData.set("observation", observation)
          const created = await createCustomerAction(workspaceId, { error: null }, customerData)
          if (created.error || !created.customerId) return { error: created.error ?? "Não foi possível salvar o cliente." }
          savedCustomer.current = { key, id: created.customerId }
        }
        formData.set("customerKind", "registered")
        formData.set("customerId", savedCustomer.current.id)
      }
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  const Title = variant === "popover" ? PopoverTitle : SheetTitle
  const Description = variant === "popover" ? PopoverDescription : SheetDescription
  const unitServices = services.filter((service) => service.unitId === unitId)
  const service = services.find((option) => option.id === serviceId)
  const stationItems = unitStations(stations, unitId)
  const station = stationItems.find((option) => option.id === stationId)
  const unitTherapists = therapists.filter((therapist) => !unitId || !therapist.unitIds || therapist.unitIds.includes(unitId))
  const therapistIndex = therapists.findIndex((therapist) => therapist.id === memberId)
  const minutes = Number(duration)
  const validDuration = minutes >= MIN_DURATION && minutes <= MAX_DURATION
  const end = validDuration ? endTime(startsAt, minutes) : null
  const choosesUnit = !!units && mode === "create" && units.length > 1
  const waitingUnit = choosesUnit && !unitId
  const colorOptions = [
    {
      value: "",
      name: "Automática (cor da profissional)",
      swatch: therapistIndex >= 0 ? BOOKING_COLORS[therapistIndex % BOOKING_COLORS.length].value : "#64748b",
    },
    ...BOOKING_COLORS.map((option) => ({ ...option, swatch: option.value })),
  ]
  const summary = [
    end && `${dayFormat.format(new Date(`${startsAt.slice(0, 10)}T00:00:00Z`))} · ${startsAt.slice(11, 16)}–${end}`,
    station?.name,
    service && currencyFormat.format(service.priceCents / 100),
  ].filter(Boolean)

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <Title className="font-heading font-medium text-foreground">{copy[mode].title}</Title>
        <Description>{copy[mode].description}</Description>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {choosesUnit ? (
          <Field>
            <FieldLabel htmlFor="appointment-unit">Unidade</FieldLabel>
            <Select
              name="unitId"
              items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
              value={unitId}
              onValueChange={(value) => {
                const next = value as string | null
                setUnitId(next)
                setServiceId(null)
                setStationId(onlyStationId(stations, next))
                setMemberId(null)
              }}
              required
            >
              <SelectTrigger id="appointment-unit" className="w-full">
                <SelectValue placeholder="Escolha a unidade" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="unitId" value={unitId ?? ""} />
        )}

        <Field>
          <FieldLabel htmlFor="appointment-service">Serviço</FieldLabel>
          <Select
            name="serviceId"
            items={unitServices.map((option) => ({ value: option.id, label: option.name }))}
            value={serviceId}
            onValueChange={(value) => {
              const next = value as string | null
              setServiceId(next)
              const chosen = services.find((option) => option.id === next)
              if (chosen) setDuration(String(chosen.durationMinutes))
            }}
            disabled={waitingUnit}
            required
          >
            <SelectTrigger id="appointment-service" className="h-auto min-h-9 w-full py-1.5">
              {service ? (
                <span className="flex min-w-0 flex-col text-left leading-tight">
                  <span className="truncate">{service.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{serviceMeta(service)}</span>
                </span>
              ) : (
                <SelectValue placeholder={waitingUnit ? "Escolha a unidade primeiro" : "Escolha o serviço"} />
              )}
            </SelectTrigger>
            <SelectContent>
              {unitServices.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="truncate">{option.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{serviceMeta(option)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-2">
          <DateTimeField idPrefix="appointment" name="startsAt" defaultValue={defaultValues.startsAt} onChange={setStartsAt} />
          {editingDuration ? (
            <Field>
              <FieldLabel htmlFor="appointment-duration">Duração (minutos)</FieldLabel>
              <Input
                id="appointment-duration"
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min={MIN_DURATION}
                max={MAX_DURATION}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                required
              />
            </Field>
          ) : (
            <input type="hidden" name="durationMinutes" value={duration} />
          )}
          <p className="text-sm text-muted-foreground">
            {end ? `Termina às ${end} · ${formatDuration(minutes)}` : "Duração inválida"}
            {" · "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setEditingDuration((current) => !current)}
            >
              {editingDuration ? "pronto" : "alterar duração"}
            </button>
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="appointment-member">Profissional</FieldLabel>
          <Select
            name="workspaceMemberId"
            items={unitTherapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))}
            value={memberId}
            onValueChange={(value) => setMemberId(value as string | null)}
            disabled={waitingUnit}
            required
          >
            <SelectTrigger id="appointment-member" className="w-full">
              <TherapistSelectValue
                therapists={unitTherapists}
                placeholder={waitingUnit ? "Escolha a unidade primeiro" : "Escolha a profissional"}
              />
            </SelectTrigger>
            <SelectContent>
              {unitTherapists.map((therapist) => (
                <SelectItem key={therapist.id} value={therapist.id}>
                  <TherapistLabel therapist={therapist} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <CustomerPicker workspaceId={workspaceId} defaultValue={defaultValues.customer} />

        {stationItems.length > 1 ? (
          <Field>
            <FieldLabel id="appointment-station">Estação</FieldLabel>
            <div role="radiogroup" aria-labelledby="appointment-station" className="flex flex-wrap gap-2">
              {stationItems.map((option) => (
                <label key={option.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="stationId"
                    value={option.id}
                    checked={stationId === option.id}
                    onChange={() => setStationId(option.id)}
                    required
                    className="peer sr-only"
                  />
                  <span className="flex h-8 items-center border px-3 text-sm transition-colors peer-checked:border-primary peer-checked:bg-accent peer-checked:font-medium peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    {option.name}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        ) : (
          <input type="hidden" name="stationId" value={stationId ?? ""} />
        )}

        <div className="grid gap-3 border-t pt-3">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((current) => !current)}
            className="flex items-center gap-1 self-start text-sm font-medium"
          >
            Mais opções
            <ChevronDownIcon className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen ? (
            <Field>
              <FieldLabel id="appointment-color">Cor na agenda</FieldLabel>
              <div role="radiogroup" aria-labelledby="appointment-color" className="flex flex-wrap gap-2">
                {colorOptions.map((option) => (
                  <label key={option.value} title={option.name} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="color"
                      value={option.value}
                      checked={color === option.value}
                      onChange={() => setColor(option.value)}
                      aria-label={option.name}
                      className="peer sr-only"
                    />
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                      style={{ backgroundColor: option.swatch }}
                    >
                      {color === option.value ? <CheckIcon className="size-4" /> : !option.value && <UserRoundIcon className="size-3.5" />}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <input type="hidden" name="color" value={color} />
          )}
        </div>
      </FieldGroup>
      <SheetFooter className="border-t bg-muted/50">
        {summary.length > 0 && <p className="text-sm text-muted-foreground tabular-nums first-letter:uppercase">{summary.join(" · ")}</p>}
        <Button type="submit" loading={pending}>
          {pending ? copy[mode].pending : copy[mode].submit}
        </Button>
        {footer}
      </SheetFooter>
    </form>
  )
}
