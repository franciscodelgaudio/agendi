"use client"

import { useActionState, useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import type { AppointmentActionState } from "@/lib/actions/appointment"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateTimeField } from "@/components/shared/date-time-field"
import { ProductPicker, withServiceProducts } from "@/components/workspace/[workspaceId]/shared/stock/product-picker"
import { currencyFormat, formatDuration } from "@/components/shared/service-format"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

type DiscountType = "percent" | "amount"

const discountTypeItems = [
  { value: "none", label: "Sem desconto" },
  { value: "percent", label: "Percentual (%)" },
  { value: "amount", label: "Valor (R$)" },
]

// Prévia do desconto em centavos; o servidor recalcula e valida.
function previewDiscountCents(totalCents: number, type: DiscountType | null, value: string) {
  const number = Number(value)
  if (!type || !value || !Number.isFinite(number) || number <= 0) return 0
  const cents = type === "percent" ? Math.round((totalCents * Math.min(number, 100)) / 100) : Math.round(number * 100)
  return Math.min(cents, totalCents)
}

// duration: minutos digitados; vazio até escolher o serviço, que preenche com a duração do cadastro.
type Row = { key: number; serviceId: string | null; therapistId: string | null; duration: string }

export type AppointmentFormValues = {
  // Na visão do workspace, a unidade é escolhida no formulário; no calendário de uma
  // unidade, vai num campo oculto para a action que lê a unidade do formulário.
  unitId?: string
  guestName: string
  room: string
  // "2026-09-24T14:30", no horário de Brasília.
  performedAt: string
  // null = ainda não escolhido (ex.: vindo de um agendamento sem serviço). Sem durationMinutes,
  // vale a do cadastro do serviço.
  items: { serviceId: string | null; therapistId: string | null; durationMinutes?: number }[]
  productIds?: string[]
  // value: percentual ("10") ou valor em reais ("50.00"), como no campo.
  discount?: { type: DiscountType; value: string; reason: string } | null
}

export type AppointmentOptions = {
  // Na visão do workspace, cada serviço traz a unidade e units lista as unidades;
  // na unidade, units fica ausente e todos os serviços são dela.
  // productIds: produtos padrão do serviço, pré-marcados ao escolhê-lo.
  services: {
    id: string
    unitId?: string
    name: string
    priceCents: number
    durationMinutes: number
    productIds: string[]
    // false: serviço sem profissional (ex.: hidromassagem), que não gera comissão.
    requiresTherapist: boolean
  }[]
  therapists: TherapistOption[]
  units?: { id: string; name: string }[]
}

type Props = AppointmentOptions & {
  mode: "create" | "edit"
  // Sem itens, o formulário começa com uma linha vazia.
  defaultValues: Omit<AppointmentFormValues, "items"> & { items?: AppointmentFormValues["items"] }
  action: (prev: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>
  onDone: () => void
}

const copy = {
  create: {
    title: "Registrar atendimento",
    description: "Informe o hóspede e os serviços prestados. O valor vem do cadastro do serviço.",
    submit: "Registrar",
    pending: "Registrando...",
  },
  edit: {
    title: "Editar atendimento",
    description: "Altere os dados do atendimento. Os valores são atualizados conforme o cadastro atual dos serviços.",
    submit: "Salvar",
    pending: "Salvando...",
  },
}

export function AppointmentForm({
  services: allServices,
  therapists,
  units,
  mode,
  defaultValues,
  action,
  onDone,
}: Props) {
  const [unitId, setUnitId] = useState<string | null>(defaultValues.unitId ?? null)
  const services = units ? allServices.filter((service) => service.unitId === unitId) : allServices
  const [productIds, setProductIds] = useState(defaultValues.productIds ?? [])
  const [discountType, setDiscountType] = useState<DiscountType | null>(defaultValues.discount?.type ?? null)
  const [discountValue, setDiscountValue] = useState(defaultValues.discount?.value ?? "")
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValues.items?.length
      ? defaultValues.items.map(({ serviceId, therapistId, durationMinutes }, key) => ({
          key,
          serviceId,
          therapistId,
          duration: String(
            durationMinutes ?? allServices.find((service) => service.id === serviceId)?.durationMinutes ?? "",
          ),
        }))
      : [{ key: 0, serviceId: null, therapistId: null, duration: "" }],
  )
  const [state, formAction, pending] = useActionState(
    async (prev: AppointmentActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  const servicesById = new Map(services.map((service) => [service.id, service]))
  const serviceItems = services.map((service) => ({ value: service.id, label: service.name }))
  const therapistItems = therapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))
  const subtotalCents = rows.reduce((sum, row) => sum + (servicesById.get(row.serviceId ?? "")?.priceCents ?? 0), 0)
  const discountCents = previewDiscountCents(subtotalCents, discountType, discountValue)

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{copy[mode].title}</SheetTitle>
        <SheetDescription>{copy[mode].description}</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {!units && unitId && <input type="hidden" name="unitId" value={unitId} />}
        {units && (
          <Field>
            <FieldLabel htmlFor="appointment-unit">Unidade</FieldLabel>
            <Select
              name="unitId"
              items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
              value={unitId}
              onValueChange={(value) => {
                setUnitId(value as string | null)
                // Serviços e produtos são de cada unidade, então trocar a unidade limpa os escolhidos.
                setRows((current) => current.map((row) => ({ ...row, serviceId: null, duration: "" })))
                setProductIds([])
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
        )}
        <Field>
          <FieldLabel htmlFor="appointment-guest-name">Hóspede</FieldLabel>
          <Input
            id="appointment-guest-name"
            name="guestName"
            placeholder="João Silva"
            defaultValue={defaultValues.guestName}
            maxLength={80}
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="appointment-room">Quarto</FieldLabel>
          <Input
            id="appointment-room"
            name="room"
            placeholder="204"
            defaultValue={defaultValues.room}
            maxLength={20}
            required
          />
        </Field>
        <DateTimeField idPrefix="appointment" name="performedAt" defaultValue={defaultValues.performedAt} />

        <FieldSeparator>Serviços</FieldSeparator>

        {rows.map((row, index) => {
          const service = servicesById.get(row.serviceId ?? "")
          return (
            <div key={row.key} className="grid gap-2 border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Serviço {index + 1}</span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover serviço ${index + 1}`}
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              {/* A ordem dos campos no FormData forma os trios serviço/profissional/duração. */}
              <Select
                name="serviceId"
                items={serviceItems}
                value={row.serviceId}
                onValueChange={(value) => {
                  const next = servicesById.get(value as string)
                  updateRow(row.key, {
                    serviceId: value as string | null,
                    ...(next && { duration: String(next.durationMinutes) }),
                  })
                  setProductIds((current) => withServiceProducts(current, next))
                }}
                disabled={units && !unitId}
                required
              >
                <SelectTrigger className="w-full" aria-label={`Serviço ${index + 1}`}>
                  <SelectValue
                    placeholder={
                      units && !unitId
                        ? "Escolha a unidade primeiro"
                        : services.length
                          ? "Escolha o serviço"
                          : "Nenhum serviço nesta unidade"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {services.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name} · {currencyFormat.format(option.priceCents / 100)} ·{" "}
                      {formatDuration(option.durationMinutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {service && !service.requiresTherapist ? (
                // Mantém a posição na lista de profissionais; o servidor ignora o profissional deste serviço.
                <input type="hidden" name="therapistId" value="" />
              ) : (
                <Select
                  name="therapistId"
                  items={therapistItems}
                  value={row.therapistId}
                  onValueChange={(value) => updateRow(row.key, { therapistId: value as string | null })}
                  required
                >
                  <SelectTrigger className="w-full" aria-label={`Profissional do serviço ${index + 1}`}>
                    <TherapistSelectValue therapists={therapists} placeholder="Escolha o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {therapists.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <TherapistLabel therapist={option} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2">
                <Input
                  name="durationMinutes"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={720}
                  step={1}
                  value={row.duration}
                  onChange={(e) => updateRow(row.key, { duration: e.target.value })}
                  aria-label={`Duração do serviço ${index + 1} (minutos)`}
                  className="w-24"
                  required
                />
                <span className="text-xs text-muted-foreground">
                  min
                  {Number(row.duration) >= 5 && Number(row.duration) <= 720 && ` · ${formatDuration(Number(row.duration))}`}
                  {service && ` · ${currencyFormat.format(service.priceCents / 100)}`}
                </span>
              </div>
            </div>
          )
        })}

        {rows.length < 20 && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: Math.max(...current.map((r) => r.key)) + 1, serviceId: null, therapistId: null, duration: "" },
              ])
            }
          >
            <PlusIcon />
            Adicionar serviço
          </Button>
        )}

        <FieldSeparator>Produtos</FieldSeparator>
        <ProductPicker
          // Na unidade, a unidade vem da URL.
          unitId={units ? unitId : undefined}
          value={productIds}
          onChange={setProductIds}
        />

        <FieldSeparator>Desconto</FieldSeparator>
        <input type="hidden" name="discountType" value={discountType ?? ""} />
        <div className="flex gap-2">
          <Select
            items={discountTypeItems}
            value={discountType ?? "none"}
            onValueChange={(value) => {
              setDiscountType(value === "percent" || value === "amount" ? value : null)
              setDiscountValue("")
            }}
          >
            <SelectTrigger className="flex-1" aria-label="Tipo de desconto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {discountTypeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {discountType && (
            <Input
              name="discountValue"
              type="number"
              inputMode="decimal"
              min={0.01}
              max={discountType === "percent" ? 100 : undefined}
              step={0.01}
              placeholder={discountType === "percent" ? "10" : "50,00"}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              aria-label={discountType === "percent" ? "Desconto (%)" : "Desconto (R$)"}
              className="w-28"
              required
            />
          )}
        </div>
        {discountType && (
          <Field>
            <FieldLabel htmlFor="appointment-discount-reason">Motivo (opcional)</FieldLabel>
            <Input
              id="appointment-discount-reason"
              name="discountReason"
              placeholder="Cliente fiel, cortesia..."
              defaultValue={defaultValues.discount?.reason}
              maxLength={120}
            />
          </Field>
        )}

        {discountCents > 0 && (
          <div className="grid gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{currencyFormat.format(subtotalCents / 100)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums">−{currencyFormat.format(discountCents / 100)}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{currencyFormat.format((subtotalCents - discountCents) / 100)}</span>
        </div>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? copy[mode].pending : copy[mode].submit}
        </Button>
      </SheetFooter>
    </form>
  )
}
