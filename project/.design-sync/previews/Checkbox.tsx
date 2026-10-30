import { Checkbox, Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, Label } from "agendi"

export const States = () => (
  <div className="flex flex-col gap-3">
    <Field orientation="horizontal">
      <Checkbox id="cb-off" />
      <FieldLabel htmlFor="cb-off" className="font-normal">
        Não marcado
      </FieldLabel>
    </Field>
    <Field orientation="horizontal">
      <Checkbox id="cb-on" defaultChecked />
      <FieldLabel htmlFor="cb-on" className="font-normal">
        Marcado
      </FieldLabel>
    </Field>
    <Field orientation="horizontal" data-disabled="true">
      <Checkbox id="cb-dis" disabled />
      <FieldLabel htmlFor="cb-dis" className="font-normal">
        Desabilitado
      </FieldLabel>
    </Field>
    <Field orientation="horizontal" data-disabled="true">
      <Checkbox id="cb-dis-on" defaultChecked disabled />
      <FieldLabel htmlFor="cb-dis-on" className="font-normal">
        Desabilitado e marcado
      </FieldLabel>
    </Field>
    <Field orientation="horizontal" data-invalid="true">
      <Checkbox id="cb-inv" aria-invalid="true" />
      <FieldLabel htmlFor="cb-inv" className="font-normal">
        Inválido
      </FieldLabel>
    </Field>
  </div>
)

export const WithDescription = () => (
  <div className="w-80">
    <Field>
      <Field orientation="horizontal">
        <Checkbox id="cb-therapist" defaultChecked />
        <FieldLabel htmlFor="cb-therapist" className="font-normal">
          Precisa de profissional
        </FieldLabel>
      </Field>
      <FieldDescription>
        Desmarque em serviços como hidromassagem: o agendamento não pede profissional e não gera comissão.
      </FieldDescription>
    </Field>
  </div>
)

const rooms = [
  { id: "sala-1", name: "Sala 1 · Massagem", checked: true },
  { id: "sala-2", name: "Sala 2 · Estética", checked: true },
  { id: "spa", name: "Spa · Hidromassagem", checked: false },
]

export const RoomList = () => (
  <FieldSet className="w-72">
    <FieldLegend variant="label">Espaços (opcional)</FieldLegend>
    <FieldGroup className="gap-2">
      {rooms.map((room) => (
        <Field key={room.id} orientation="horizontal">
          <Checkbox id={"cb-room-" + room.id} defaultChecked={room.checked} />
          <FieldLabel htmlFor={"cb-room-" + room.id} className="font-normal">
            {room.name}
          </FieldLabel>
        </Field>
      ))}
    </FieldGroup>
    <FieldDescription>Nenhum marcado: o serviço pode ser feito em qualquer espaço.</FieldDescription>
  </FieldSet>
)

export const InlineLabel = () => (
  <Label className="text-xs font-normal text-muted-foreground">
    <Checkbox defaultChecked />
    Sempre autorizar “Criar agendamento” nesta conversa
  </Label>
)
