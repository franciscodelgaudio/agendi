import { Field, FieldDescription, FieldGroup, FieldLabel, Input } from "agendi"

export const Default = () => (
  <div className="w-72">
    <Field>
      <FieldLabel htmlFor="client-name">Nome do cliente</FieldLabel>
      <Input id="client-name" placeholder="Ex.: Mariana Souza" />
    </Field>
  </div>
)

export const Types = () => (
  <FieldGroup className="w-72 gap-4">
    <Field>
      <FieldLabel htmlFor="client-email">Email</FieldLabel>
      <Input id="client-email" type="email" defaultValue="mariana.souza@gmail.com" />
    </Field>
    <Field>
      <FieldLabel htmlFor="client-phone">Telefone</FieldLabel>
      <Input id="client-phone" type="tel" defaultValue="(11) 98765-4321" />
    </Field>
    <Field>
      <FieldLabel htmlFor="service-duration">Duração média (minutos)</FieldLabel>
      <Input id="service-duration" type="number" inputMode="numeric" defaultValue={45} />
      <FieldDescription>Usada para reservar o horário na agenda.</FieldDescription>
    </Field>
  </FieldGroup>
)

export const States = () => (
  <FieldGroup className="w-72 gap-4">
    <Field>
      <FieldLabel htmlFor="unit-placeholder">Placeholder</FieldLabel>
      <Input id="unit-placeholder" placeholder="Nome da unidade" />
    </Field>
    <Field>
      <FieldLabel htmlFor="unit-filled">Preenchido</FieldLabel>
      <Input id="unit-filled" defaultValue="Unidade Pinheiros" />
    </Field>
    <Field data-disabled="true">
      <FieldLabel htmlFor="unit-disabled">Desabilitado</FieldLabel>
      <Input id="unit-disabled" defaultValue="Plano Profissional" disabled />
    </Field>
    <Field data-invalid="true">
      <FieldLabel htmlFor="unit-invalid">Inválido</FieldLabel>
      <Input id="unit-invalid" defaultValue="mariana@" aria-invalid="true" />
    </Field>
  </FieldGroup>
)
