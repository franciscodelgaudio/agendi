import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, PasswordInput } from "agendi"

export const Default = () => (
  <div className="w-72">
    <Field>
      <FieldLabel htmlFor="pw-default">Senha</FieldLabel>
      <PasswordInput id="pw-default" placeholder="Digite sua senha" />
    </Field>
  </div>
)

export const WithValue = () => (
  <div className="w-72">
    <Field>
      <FieldLabel htmlFor="pw-value">Senha atual</FieldLabel>
      <PasswordInput id="pw-value" defaultValue="agendi2026" />
    </Field>
  </div>
)

export const NewPassword = () => (
  <FieldGroup className="w-72 gap-4">
    <Field>
      <FieldLabel htmlFor="pw-new">Nova senha</FieldLabel>
      <PasswordInput id="pw-new" defaultValue="Salao@2026" />
      <FieldDescription>Mínimo de 8 caracteres, com letras e números.</FieldDescription>
    </Field>
    <Field data-invalid="true">
      <FieldLabel htmlFor="pw-confirm">Confirmar senha</FieldLabel>
      <PasswordInput id="pw-confirm" defaultValue="Salao@202" aria-invalid="true" />
      <FieldError>As senhas não conferem.</FieldError>
    </Field>
  </FieldGroup>
)

export const Disabled = () => (
  <div className="w-72">
    <Field data-disabled="true">
      <FieldLabel htmlFor="pw-disabled">Senha</FieldLabel>
      <PasswordInput id="pw-disabled" defaultValue="agendi2026" disabled />
    </Field>
  </div>
)
