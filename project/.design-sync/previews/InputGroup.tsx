import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "agendi"
import { ArrowUpIcon, CopyIcon, MailIcon, SearchIcon, XIcon } from "lucide-react"

export const Search = () => (
  <div className="w-80">
    <InputGroup>
      <InputGroupInput placeholder="Buscar clientes..." aria-label="Buscar clientes" />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <InputGroupText>12 resultados</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

export const Currency = () => (
  <FieldGroup className="w-72 gap-4">
    <Field>
      <FieldLabel htmlFor="ig-price">Preço do serviço</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>R$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id="ig-price" inputMode="decimal" defaultValue="150,00" />
      </InputGroup>
    </Field>
    <Field>
      <FieldLabel htmlFor="ig-commission">Comissão do profissional</FieldLabel>
      <InputGroup>
        <InputGroupInput id="ig-commission" inputMode="decimal" defaultValue="40" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>%</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>Sobre o valor líquido do atendimento.</FieldDescription>
    </Field>
  </FieldGroup>
)

export const WithButton = () => (
  <div className="w-96">
    <Field>
      <FieldLabel htmlFor="ig-link">Link de agendamento</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>agendi.app/</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id="ig-link" defaultValue="studio-bella" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>
            <CopyIcon />
            Copiar
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  </div>
)

export const Invalid = () => (
  <div className="w-80">
    <Field data-invalid="true">
      <FieldLabel htmlFor="ig-email">Email do profissional</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <MailIcon />
        </InputGroupAddon>
        <InputGroupInput id="ig-email" defaultValue="carla.mendes@" aria-invalid="true" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Limpar">
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldError>Informe um email válido.</FieldError>
    </Field>
  </div>
)

export const WithTextarea = () => (
  <div className="w-96">
    <InputGroup>
      <InputGroupTextarea
        aria-label="Pergunte à AgenIA"
        placeholder="Pergunte à AgenIA: quais horários estão livres amanhã à tarde?"
      />
      <InputGroupAddon align="block-end">
        <InputGroupText className="text-xs">0/2000</InputGroupText>
        <InputGroupButton variant="default" size="icon-xs" className="ml-auto" aria-label="Enviar">
          <ArrowUpIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
