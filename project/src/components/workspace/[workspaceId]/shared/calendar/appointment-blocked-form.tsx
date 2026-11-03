"use client"

import { useActionState, useState, type ReactNode } from "react"
import type { AppointmentBlockedActionState } from "@/lib/actions/appointment-blocked"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DateTimeField } from "@/components/shared/date-time-field"
import { formatDuration } from "@/components/shared/service-format"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

export type AppointmentBlockedFormValues = {
  workspaceMemberId: string | null
  startsAt: string
  durationMinutes: number
  reason: string | null
}

type Props = {
  mode: "create" | "edit"
  variant?: "sheet" | "popover"
  unitId: string | null
  therapists: TherapistOption[]
  defaultValues: AppointmentBlockedFormValues
  action: (prev: AppointmentBlockedActionState, formData: FormData) => Promise<AppointmentBlockedActionState>
  onDone: () => void
  header?: ReactNode
  footer?: ReactNode
}

const copy = {
  create: { title: "Bloquear agenda", submit: "Bloquear", pending: "Bloqueando..." },
  edit: { title: "Editar bloqueio", submit: "Salvar alterações", pending: "Salvando..." },
}

const MIN_DURATION = 5
const MAX_DURATION = 720

const dayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

function endTime(startsAt: string, minutes: number) {
  const start = new Date(`${startsAt}:00Z`)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + minutes * 60000).toISOString().slice(11, 16)
}

export function AppointmentBlockedForm({
  mode,
  variant = "sheet",
  unitId,
  therapists,
  defaultValues,
  action,
  onDone,
  header,
  footer,
}: Props) {
  const [memberId, setMemberId] = useState(
    defaultValues.workspaceMemberId ?? (therapists.length === 1 ? therapists[0].id : null),
  )
  const [startsAt, setStartsAt] = useState(defaultValues.startsAt)
  const [duration, setDuration] = useState(String(defaultValues.durationMinutes))
  const [state, formAction, pending] = useActionState(
    async (prev: AppointmentBlockedActionState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  const Title = variant === "popover" ? PopoverTitle : SheetTitle
  const Description = variant === "popover" ? PopoverDescription : SheetDescription
  const minutes = Number(duration)
  const end = minutes >= MIN_DURATION && minutes <= MAX_DURATION ? endTime(startsAt, minutes) : null
  const summary = end && `${dayFormat.format(new Date(`${startsAt.slice(0, 10)}T00:00:00Z`))} · ${startsAt.slice(11, 16)}–${end}`

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        {header}
        <Title className="font-heading font-medium text-foreground">{copy[mode].title}</Title>
        <Description>
          {unitId ? "Ninguém consegue agendar a profissional nesse horário nesta unidade." : "Ninguém consegue agendar a profissional nesse horário em nenhuma unidade."}
        </Description>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <input type="hidden" name="unitId" value={unitId ?? ""} />

        <Field>
          <FieldLabel htmlFor="blocked-member">Profissional</FieldLabel>
          <Select
            name="workspaceMemberId"
            items={therapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))}
            value={memberId}
            onValueChange={(value) => setMemberId(value as string | null)}
            disabled={therapists.length === 1}
            required
          >
            <SelectTrigger id="blocked-member" className="w-full">
              <TherapistSelectValue therapists={therapists} placeholder="Escolha a profissional" />
            </SelectTrigger>
            <SelectContent>
              {therapists.map((therapist) => (
                <SelectItem key={therapist.id} value={therapist.id}>
                  <TherapistLabel therapist={therapist} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {therapists.length === 1 && <input type="hidden" name="workspaceMemberId" value={memberId ?? ""} />}
        </Field>

        <DateTimeField idPrefix="blocked" name="startsAt" defaultValue={defaultValues.startsAt} onChange={setStartsAt} />

        <Field>
          <FieldLabel htmlFor="blocked-duration">Duração (minutos)</FieldLabel>
          <Input
            id="blocked-duration"
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
          <p className="text-sm text-muted-foreground">
            {end ? `Termina às ${end} · ${formatDuration(minutes)}` : "Duração inválida"}
          </p>
        </Field>

        <Field>
          <FieldLabel htmlFor="blocked-reason">Motivo</FieldLabel>
          <Input
            id="blocked-reason"
            name="reason"
            placeholder="Opcional. Ex.: Almoço, Médico"
            defaultValue={defaultValues.reason ?? ""}
            maxLength={120}
          />
        </Field>
      </FieldGroup>
      <SheetFooter className="border-t bg-muted/50">
        {summary && <p className="text-sm text-muted-foreground tabular-nums first-letter:uppercase">{summary}</p>}
        <Button type="submit" loading={pending}>
          {pending ? copy[mode].pending : copy[mode].submit}
        </Button>
        {footer}
      </SheetFooter>
    </form>
  )
}
