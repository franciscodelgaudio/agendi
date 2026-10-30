import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from "agendi"
import { PlusIcon } from "lucide-react"

export const CreateService = () => (
  <Sheet defaultOpen>
    <SheetTrigger render={<Button />}>
      <PlusIcon data-icon="inline-start" />
      Cadastrar serviço
    </SheetTrigger>
    <SheetContent>
      <form className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>Cadastrar serviço</SheetTitle>
          <SheetDescription>Adicione um serviço prestado nesta unidade.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
          <Field>
            <FieldLabel htmlFor="svc-name">Nome</FieldLabel>
            <Input id="svc-name" defaultValue="Massagem Candle" />
          </Field>
          <Field>
            <FieldLabel htmlFor="svc-price">Valor</FieldLabel>
            <Input id="svc-price" defaultValue="R$ 350,00" />
          </Field>
          <Field>
            <FieldLabel htmlFor="svc-duration">Duração média (minutos)</FieldLabel>
            <Input id="svc-duration" type="number" defaultValue="60" />
          </Field>
          <Field>
            <Field orientation="horizontal">
              <Checkbox id="svc-therapist" defaultChecked />
              <FieldLabel htmlFor="svc-therapist" className="font-normal">
                Precisa de profissional
              </FieldLabel>
            </Field>
            <FieldDescription>
              Desmarque em serviços como hidromassagem: o agendamento não pede profissional e não gera comissão.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button type="button">Cadastrar</Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
)

export const SideLeft = () => (
  <Sheet defaultOpen>
    <SheetContent side="left">
      <SheetHeader>
        <SheetTitle>Unidade Jardins</SheetTitle>
        <SheetDescription>Rua Oscar Freire, 1200 · São Paulo</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4">
        {[
          { label: "Agendamentos hoje", value: "18" },
          { label: "Profissionais ativos", value: "6" },
          { label: "Faturamento do mês", value: "R$ 42.180,00" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b pb-3">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <SheetFooter>
        <Button variant="outline">Ver unidade</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)

export const SideBottom = () => (
  <Sheet defaultOpen>
    <SheetContent side="bottom">
      <SheetHeader>
        <SheetTitle>Observação do atendimento</SheetTitle>
        <SheetDescription>Visível só para a equipe da unidade.</SheetDescription>
      </SheetHeader>
      <div className="px-4">
        <Textarea defaultValue="Cliente prefere pressão leve e óleo sem fragrância." />
      </div>
      <SheetFooter className="flex-row justify-end">
        <SheetClose render={<Button variant="outline" />}>Cancelar</SheetClose>
        <Button>Salvar observação</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
