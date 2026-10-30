import { Button, Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Textarea } from "agendi"
import { SendIcon, SparklesIcon } from "lucide-react"

export const Default = () => (
  <div className="w-80">
    <Field>
      <FieldLabel htmlFor="ta-notes">Observações do agendamento</FieldLabel>
      <Textarea id="ta-notes" placeholder="Preferências do cliente, alergias, recados para o profissional..." />
    </Field>
  </div>
)

export const WithValue = () => (
  <div className="w-80">
    <Field>
      <FieldLabel htmlFor="ta-service">Descrição do serviço</FieldLabel>
      <Textarea
        id="ta-service"
        defaultValue="Massagem relaxante com óleos essenciais e pedras quentes. Inclui escalda-pés e chá ao final da sessão."
      />
      <FieldDescription>Aparece para o cliente na página de agendamento.</FieldDescription>
    </Field>
  </div>
)

export const States = () => (
  <FieldGroup className="w-80 gap-4">
    <Field data-disabled="true">
      <FieldLabel htmlFor="ta-disabled">Motivo do cancelamento</FieldLabel>
      <Textarea id="ta-disabled" defaultValue="Cliente remarcou para a próxima semana." disabled />
    </Field>
    <Field data-invalid="true">
      <FieldLabel htmlFor="ta-invalid">Descrição do chamado</FieldLabel>
      <Textarea id="ta-invalid" aria-invalid="true" />
      <FieldError>Descreva o problema para abrir o chamado.</FieldError>
    </Field>
  </FieldGroup>
)

export const MessageComposer = () => (
  <div className="flex w-96 items-end gap-2 border bg-card p-3">
    <Button type="button" variant="outline" size="icon" aria-label="Sugerir resposta">
      <SparklesIcon />
    </Button>
    <Textarea
      aria-label="Mensagem"
      rows={1}
      className="max-h-40 min-h-9 resize-none"
      placeholder="Escreva uma mensagem..."
    />
    <Button type="button" size="icon" aria-label="Enviar">
      <SendIcon />
    </Button>
  </div>
)
