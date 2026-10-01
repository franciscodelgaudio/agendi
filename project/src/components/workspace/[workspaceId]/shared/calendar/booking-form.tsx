"use client"

import { useActionState, useState } from "react"
import { CheckIcon, ClipboardCheckIcon, UserRoundIcon } from "lucide-react"
import type { BookingActionState } from "@/lib/actions/booking"
import { BOOKING_COLORS } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-colors"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateTimeField } from "@/components/shared/date-time-field"
import { ProductPicker, withServiceProducts } from "@/components/workspace/[workspaceId]/shared/stock/product-picker"
import { formatDuration } from "@/components/shared/service-format"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

export type BookingFormValues = {
  unitId: string | null
  therapistId: string | null
  guestName: string
  room: string
  // "2026-09-24T14:30", no horário de Brasília.
  startsAt: string
  durationMinutes: number
  serviceId: string | null
  treatmentRoomId: string | null
  productIds: string[]
  // null: a cor do profissional.
  color: string | null
}

export type BookingFormOptions = {
  // Ausente no calendário de uma unidade: a unidade vem de defaultValues e não é escolhida.
  units?: { id: string; name: string }[]
  therapists: TherapistOption[]
  // Cada serviço traz a unidade; o formulário só oferece os da unidade escolhida.
  // O preço só aparece quando o agendamento vira atendimento.
  // productIds: produtos padrão do serviço, pré-marcados ao escolhê-lo.
  services: {
    id: string
    unitId: string
    name: string
    priceCents: number
    durationMinutes: number
    productIds: string[]
  }[]
  // Salas de cada unidade; o formulário só oferece as da unidade escolhida.
  treatmentRooms: { id: string; unitId: string; name: string; beds: number }[]
}

type Props = BookingFormOptions & {
  mode: "create" | "edit"
  // popover: dentro do balão do calendário, que usa o título e a descrição do Popover.
  variant?: "sheet" | "popover"
  defaultValues: BookingFormValues
  action: (prev: BookingActionState, formData: FormData) => Promise<BookingActionState>
  onDone: () => void
  // Só na edição: botões de registrar atendimento e de excluir no rodapé.
  onConvert?: () => void
  onDelete?: () => void
}

const copy = {
  create: {
    title: "Novo agendamento",
    description: "Escolha o profissional, a unidade, o serviço, o hóspede e o horário.",
    submit: "Agendar",
    pending: "Agendando...",
  },
  edit: {
    title: "Editar agendamento",
    description: "Altere os dados do agendamento.",
    submit: "Salvar",
    pending: "Salvando...",
  },
}

// Unidade com uma sala só já vem com ela escolhida.
function onlyRoomId(rooms: BookingFormOptions["treatmentRooms"], unitId: string | null) {
  const unitRooms = rooms.filter((room) => room.unitId === unitId)
  return unitRooms.length === 1 ? unitRooms[0].id : null
}

export function BookingForm({
  units,
  therapists,
  services: allServices,
  treatmentRooms: allRooms,
  mode,
  variant = "sheet",
  defaultValues,
  action,
  onDone,
  onConvert,
  onDelete,
}: Props) {
  const [unitId, setUnitId] = useState(defaultValues.unitId)
  const [therapistId, setTherapistId] = useState(defaultValues.therapistId)
  const [serviceId, setServiceId] = useState(defaultValues.serviceId)
  const [treatmentRoomId, setTreatmentRoomId] = useState(
    () => defaultValues.treatmentRoomId ?? onlyRoomId(allRooms, defaultValues.unitId),
  )
  const [duration, setDuration] = useState(String(defaultValues.durationMinutes))
  const [productIds, setProductIds] = useState(defaultValues.productIds)
  const [color, setColor] = useState(defaultValues.color ?? "")
  const [state, formAction, pending] = useActionState(
    async (prev: BookingActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  const Title = variant === "popover" ? PopoverTitle : SheetTitle
  const Description = variant === "popover" ? PopoverDescription : SheetDescription
  const services = allServices.filter((service) => service.unitId === unitId)
  const serviceItems = services.map((service) => ({ value: service.id, label: service.name }))
  const roomItems = allRooms
    .filter((room) => room.unitId === unitId)
    .map((room) => ({ value: room.id, label: room.name, beds: room.beds }))
  // A opção automática mostra a cor que o profissional escolhido tem no calendário.
  const therapistIndex = therapists.findIndex((therapist) => therapist.id === therapistId)
  const colorOptions = [
    {
      value: "",
      name: "Automática (cor do profissional)",
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
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="booking-therapist">Profissional</FieldLabel>
          <Select
            name="therapistId"
            items={therapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))}
            value={therapistId}
            onValueChange={(value) => setTherapistId(value as string | null)}
            required
          >
            <SelectTrigger id="booking-therapist" className="w-full">
              <TherapistSelectValue therapists={therapists} placeholder="Escolha o profissional" />
            </SelectTrigger>
            <SelectContent>
              {therapists.map((therapist) => (
                <SelectItem key={therapist.id} value={therapist.id}>
                  <TherapistLabel therapist={therapist} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {units ? (
          <Field>
            <FieldLabel htmlFor="booking-unit">Unidade</FieldLabel>
            <Select
              name="unitId"
              items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
              value={unitId}
              onValueChange={(value) => {
                setUnitId(value as string | null)
                // Serviços, salas e produtos são de cada unidade, então trocar a unidade limpa os escolhidos.
                setServiceId(null)
                setTreatmentRoomId(onlyRoomId(allRooms, value as string | null))
                setProductIds([])
              }}
              required
            >
              <SelectTrigger id="booking-unit" className="w-full">
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
          <FieldLabel htmlFor="booking-treatment-room">Sala</FieldLabel>
          <Select
            name="treatmentRoomId"
            items={roomItems}
            value={treatmentRoomId}
            onValueChange={(value) => setTreatmentRoomId(value as string | null)}
            disabled={!unitId}
            required
          >
            <SelectTrigger id="booking-treatment-room" className="w-full">
              <SelectValue placeholder={unitId ? "Escolha a sala" : "Escolha a unidade primeiro"} />
            </SelectTrigger>
            <SelectContent>
              {roomItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                  <span className="text-muted-foreground">
                    {item.beds === 1 ? "1 maca" : `${item.beds} macas`}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="booking-guest-name">Hóspede</FieldLabel>
          <Input
            id="booking-guest-name"
            name="guestName"
            placeholder="João Silva"
            defaultValue={defaultValues.guestName}
            maxLength={80}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="booking-room">Quarto</FieldLabel>
          <Input
            id="booking-room"
            name="room"
            placeholder="204"
            defaultValue={defaultValues.room}
            maxLength={20}
            required
          />
        </Field>
        <DateTimeField idPrefix="booking" name="startsAt" defaultValue={defaultValues.startsAt} />
        <Field>
          <FieldLabel htmlFor="booking-service">Serviço</FieldLabel>
          <Select
            name="serviceId"
            items={serviceItems}
            value={serviceId}
            onValueChange={(value) => {
              const next = value as string | null
              setServiceId(next)
              // A duração do serviço vira a sugestão, e ainda pode ser ajustada.
              const service = services.find((option) => option.id === next)
              if (service) setDuration(String(service.durationMinutes))
              setProductIds((current) => withServiceProducts(current, service))
            }}
            disabled={!unitId}
            required
          >
            <SelectTrigger id="booking-service" className="w-full">
              <SelectValue placeholder={unitId ? "Escolha o serviço" : "Escolha a unidade primeiro"} />
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
          <FieldLabel htmlFor="booking-duration">Duração (minutos)</FieldLabel>
          <Input
            id="booking-duration"
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
          <FieldLabel id="booking-color">Cor na agenda</FieldLabel>
          <div role="radiogroup" aria-labelledby="booking-color" className="flex flex-wrap gap-2">
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
                  {color === option.value ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    !option.value && <UserRoundIcon className="size-3.5" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel>Produtos (opcional)</FieldLabel>
          <ProductPicker
            unitId={unitId}
            value={productIds}
            onChange={setProductIds}
          />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? copy[mode].pending : copy[mode].submit}
        </Button>
        {onConvert && (
          <Button type="button" variant="outline" onClick={onConvert} disabled={pending}>
            <ClipboardCheckIcon />
            Registrar atendimento
          </Button>
        )}
        {onDelete && (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
            Excluir
          </Button>
        )}
      </SheetFooter>
    </form>
  )
}
