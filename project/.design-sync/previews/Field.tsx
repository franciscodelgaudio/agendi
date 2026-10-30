import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
  PasswordInput,
  Textarea,
} from "agendi"

export const LoginForm = () => (
  <form className="w-80">
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" placeholder="voce@exemplo.com" />
      </Field>
      <Field>
        <div className="flex items-center">
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <a href="#" className="ml-auto text-sm underline-offset-4 hover:underline">
            Esqueceu sua senha?
          </a>
        </div>
        <PasswordInput id="password" defaultValue="segredo123" />
      </Field>
      <Field>
        <Button type="button">Entrar</Button>
      </Field>
      <FieldSeparator>Ou continue com</FieldSeparator>
      <Field>
        <Button type="button" variant="outline">
          Entrar com Google
        </Button>
        <FieldDescription className="text-center">
          Não tem uma conta? <a href="#">Cadastre-se</a>
        </FieldDescription>
      </Field>
    </FieldGroup>
  </form>
)

export const WithDescription = () => (
  <FieldGroup className="w-80">
    <Field>
      <FieldLabel htmlFor="service">Nome do serviço</FieldLabel>
      <Input id="service" defaultValue="Corte masculino" />
      <FieldDescription>Aparece para o cliente na página de agendamento.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor="notes">Observações</FieldLabel>
      <Textarea id="notes" placeholder="Preferências, alergias, recados para o profissional..." />
    </Field>
  </FieldGroup>
)

export const Invalid = () => (
  <FieldGroup className="w-80">
    <Field data-invalid="true">
      <FieldLabel htmlFor="phone">Telefone</FieldLabel>
      <Input id="phone" defaultValue="(11) 9999" aria-invalid="true" />
      <FieldError>Informe um telefone com DDD e 9 dígitos.</FieldError>
    </Field>
  </FieldGroup>
)

export const CheckboxSet = () => (
  <FieldSet className="w-80">
    <FieldLegend variant="label">Lembretes</FieldLegend>
    <FieldGroup className="gap-3">
      <Field orientation="horizontal">
        <Checkbox id="r-email" defaultChecked />
        <FieldContent>
          <FieldLabel htmlFor="r-email">Email de confirmação</FieldLabel>
          <FieldDescription>Enviado logo após o agendamento.</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="r-day" />
        <FieldLabel htmlFor="r-day">Lembrete um dia antes</FieldLabel>
      </Field>
    </FieldGroup>
  </FieldSet>
)
