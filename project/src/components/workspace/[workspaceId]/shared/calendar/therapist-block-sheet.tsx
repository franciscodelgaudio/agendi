"use client"

import { useActionState, useState, useTransition } from "react"
import { LockOpenIcon } from "lucide-react"
import {
  createTherapistBlockAction,
  deleteTherapistBlockAction,
  type TherapistBlockActionState,
} from "@/lib/actions/therapist-block"
import type { TherapistBlockRow } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/booking-list"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DayField } from "@/components/shared/day-field"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

type FormProps = {
  workspaceId: string
  therapists: TherapistOption[]
  // Profissional filtrado no calendário, se houver; o dia sugerido é "2026-09-24".
  defaultTherapistId: string | null
  defaultDay: string
  onDone: () => void
}

// Trava a agenda de um profissional: dias inteiros ou um período, em todas as unidades.
export function TherapistBlockForm({ workspaceId, therapists, defaultTherapistId, defaultDay, onDone }: FormProps) {
  const [therapistId, setTherapistId] = useState(defaultTherapistId)
  const [allDay, setAllDay] = useState(true)
  const [state, formAction, pending] = useActionState(
    async (prev: TherapistBlockActionState, formData: FormData) => {
      const next = await createTherapistBlockAction(workspaceId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Travar agenda</SheetTitle>
        <SheetDescription>
          O profissional fica indisponível no período, em todas as unidades: não dá para agendar com ele nem a URA
          oferece esses horários.
        </SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="block-therapist">Profissional</FieldLabel>
          <Select
            name="therapistId"
            items={therapists.map((therapist) => ({ value: therapist.id, label: therapist.name }))}
            value={therapistId}
            onValueChange={(value) => setTherapistId(value as string | null)}
            required
          >
            <SelectTrigger id="block-therapist" className="w-full">
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
        <Field orientation="horizontal">
          <Checkbox
            id="block-all-day"
            name="allDay"
            value="on"
            checked={allDay}
            onCheckedChange={(checked) => setAllDay(checked === true)}
          />
          <FieldLabel htmlFor="block-all-day">Dia inteiro</FieldLabel>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <DayField id="block-start-day" name="startDay" label="De" defaultValue={defaultDay} />
          {!allDay && (
            <Field>
              <FieldLabel htmlFor="block-start-time">Hora</FieldLabel>
              <Input id="block-start-time" name="startTime" type="time" step={60} defaultValue="09:00" required />
            </Field>
          )}
          <DayField id="block-end-day" name="endDay" label="Até" defaultValue={defaultDay} />
          {!allDay && (
            <Field>
              <FieldLabel htmlFor="block-end-time">Hora</FieldLabel>
              <Input id="block-end-time" name="endTime" type="time" step={60} defaultValue="18:00" required />
            </Field>
          )}
        </div>
        {allDay && <FieldDescription>O último dia também fica travado. No máximo 31 dias.</FieldDescription>}
        <Field>
          <FieldLabel htmlFor="block-reason">Motivo (opcional)</FieldLabel>
          <Input id="block-reason" name="reason" maxLength={120} placeholder="Folga, consulta médica..." />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Travando..." : "Travar agenda"}
        </Button>
      </SheetFooter>
    </form>
  )
}

// Os horários são de Brasília "de parede", então são formatados em UTC.
const blockDateFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// Trava aberta no calendário: os dados e, para quem gerencia, o botão de destravar.
export function TherapistBlockSummary({
  workspaceId,
  block,
  canManage,
  onDone,
}: {
  workspaceId: string
  block: TherapistBlockRow
  canManage: boolean
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleUnlock() {
    startTransition(async () => {
      const result = await deleteTherapistBlockAction(workspaceId, block.id)
      setError(result.error)
      if (!result.error) onDone()
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Agenda travada</SheetTitle>
        <SheetDescription>O profissional está indisponível neste período, em todas as unidades.</SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 text-sm">
        <dt className="text-muted-foreground">Profissional</dt>
        <dd>{block.therapistName}</dd>
        <dt className="text-muted-foreground">De</dt>
        <dd className="first-letter:uppercase">{blockDateFormat.format(new Date(`${block.startsAt}:00Z`))}</dd>
        <dt className="text-muted-foreground">Até</dt>
        <dd className="first-letter:uppercase">{blockDateFormat.format(new Date(`${block.endsAt}:00Z`))}</dd>
        <dt className="text-muted-foreground">Motivo</dt>
        <dd>{block.reason ?? "Não informado"}</dd>
      </dl>
      {error && <FieldError className="px-4 pt-4">{error}</FieldError>}
      {canManage && (
        <SheetFooter>
          <Button variant="outline" onClick={handleUnlock} loading={pending}>
            <LockOpenIcon />
            {pending ? "Destravando..." : "Destravar agenda"}
          </Button>
        </SheetFooter>
      )}
    </div>
  )
}
