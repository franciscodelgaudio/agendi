"use client"

import { useActionState, useState, type ReactNode } from "react"
import { CheckIcon, UserRoundIcon } from "lucide-react"
import type { AppointmentActionState } from "@/lib/actions/appointment"
import { BOOKING_COLORS } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateTimeField } from "@/components/shared/date-time-field"
import { formatDuration } from "@/components/shared/service-format"
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
  services: { id: string; name: string; durationMinutes: number; priceCents: number }[]
  stations: { id: string; unitId: string; name: string; active: boolean }[]
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
    description: "Escolha o cliente, o serviço, a profissional, a estação e o horário.",
    submit: "Agendar",
    pending: "Agendando...",
  },
  edit: { title: "Editar agendamento", description: "Altere os dados do agendamento.", submit: "Salvar", pending: "Salvando..." },
}

function unitStations(stations: AppointmentFormOptions["stations"], unitId: string | null) {
  return stations.filter((station) => station.unitId === unitId && station.active)
}

function onlyStationId(stations: AppointmentFormOptions["stations"], unitId: string | null) {
  const options = unitStations(stations, unitId)
  return options.length === 1 ? options[0].id : null
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
  const [duration, setDuration] = useState(String(defaultValues.durationMinutes))
  const [color, setColor] = useState(defaultValues.color ?? "")
  const [state, formAction, pending] = useActionState(
    async (prev: AppointmentActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  const Title = variant === "popover" ? PopoverTitle : SheetTitle
  const Description = variant === "popover" ? PopoverDescription : SheetDescription
  const serviceItems = services.map((service) => ({ value: service.id, label: service.name }))
  const stationItems = unitStations(stations, unitId).map((station) => ({ value: station.id, label: station.name }))
  const unitTherapists = therapists.filter((therapist) => !unitId || !therapist.unitIds || therapist.unitIds.includes(unitId))
  const therapistIndex = therapists.findIndex((therapist) => therapist.id === memberId)
  const colorOptions = [
    {
      value: "",
      name: "Automática (cor da profissional)",
      swatch: therapistIndex >= 0 ? BOOKING_COLORS[therapistIndex % BOOKING_COLORS.length].value : "#64748b",
    },
    ...BOOKING_COLORS.map((option) => ({ ...option, swatch: option.value })),
  ]

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <Title className="font-heading font-medium text-foreground">{copy[mode].title}</Title>
        <Description>{copy[mode].description}</Description>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <CustomerPicker workspaceId={workspaceId} defaultValue={defaultValues.customer} />
        {units && mode === "create" ? (
          <Field>
            <FieldLabel htmlFor="appointment-unit">Unidade</FieldLabel>
            <Select
              name="unitId"
              items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
              value={unitId}
              onValueChange={(value) => {
                const next = value as string | null
                setUnitId(next)
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
            items={serviceItems}
            value={serviceId}
            onValueChange={(value) => {
              const next = value as string | null
              setServiceId(next)
              const chosen = services.find((option) => option.id === next)
              if (chosen) setDuration(String(chosen.durationMinutes))
            }}
            required
          >
            <SelectTrigger id="appointment-service" className="w-full">
              <SelectValue placeholder="Escolha o serviço" />
            </SelectTrigger>
            <SelectContent>
              {serviceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="appointment-member">Profissional</FieldLabel>
          <Select
            name="workspaceMemberId"
            items={unitTherapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))}
            value={memberId}
            onValueChange={(value) => setMemberId(value as string | null)}
            disabled={!unitId}
            required
          >
            <SelectTrigger id="appointment-member" className="w-full">
              <TherapistSelectValue
                therapists={unitTherapists}
                placeholder={unitId ? "Escolha a profissional" : "Escolha a unidade primeiro"}
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
        <Field>
          <FieldLabel htmlFor="appointment-station">Estação</FieldLabel>
          <Select
            name="stationId"
            items={stationItems}
            value={stationId}
            onValueChange={(value) => setStationId(value as string | null)}
            disabled={!unitId}
            required
          >
            <SelectTrigger id="appointment-station" className="w-full">
              <SelectValue placeholder={unitId ? "Escolha a estação" : "Escolha a unidade primeiro"} />
            </SelectTrigger>
            <SelectContent>
              {stationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DateTimeField idPrefix="appointment" name="startsAt" defaultValue={defaultValues.startsAt} />
        <Field>
          <FieldLabel htmlFor="appointment-duration">Duração (minutos)</FieldLabel>
          <Input
            id="appointment-duration"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={720}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
          />
          {Number(duration) >= 5 && Number(duration) <= 720 && (
            <FieldDescription>{formatDuration(Number(duration))}</FieldDescription>
          )}
        </Field>
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
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? copy[mode].pending : copy[mode].submit}
        </Button>
        {footer}
      </SheetFooter>
    </form>
  )
}
