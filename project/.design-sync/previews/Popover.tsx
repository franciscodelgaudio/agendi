import {
  Button,
  Calendar,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "agendi"
import { CalendarIcon, ClockIcon, InfoIcon, MapPinIcon, UserIcon, WalletIcon } from "lucide-react"
import { ptBR } from "react-day-picker/locale"

export const WithHeader = () => (
  <Popover defaultOpen>
    <PopoverTrigger render={<Button variant="outline" />}>
      <WalletIcon data-icon="inline-start" />
      Limite planejado
    </PopoverTrigger>
    <PopoverContent align="start">
      <PopoverHeader>
        <PopoverTitle>Limite de despesas</PopoverTitle>
        <PopoverDescription>Valor máximo planejado para o grupo Insumos em outubro.</PopoverDescription>
      </PopoverHeader>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="limit">Limite mensal</FieldLabel>
          <Input id="limit" defaultValue="R$ 2.500,00" />
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <PopoverClose render={<Button variant="ghost" size="sm" />}>Cancelar</PopoverClose>
        <Button size="sm">Salvar</Button>
      </div>
    </PopoverContent>
  </Popover>
)

export const BookingDetails = () => (
  <Popover defaultOpen>
    <PopoverTrigger render={<Button variant="secondary" />}>
      14:00 · Mariana Souza
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80">
      <PopoverHeader>
        <PopoverTitle>Massagem relaxante</PopoverTitle>
        <PopoverDescription>Agendamento confirmado</PopoverDescription>
      </PopoverHeader>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2">
          <CalendarIcon className="size-4 text-muted-foreground" />
          Quinta, 30 de outubro
        </li>
        <li className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          14:00 – 15:00 (60 min)
        </li>
        <li className="flex items-center gap-2">
          <UserIcon className="size-4 text-muted-foreground" />
          Profissional: Carla Mendes
        </li>
        <li className="flex items-center gap-2">
          <MapPinIcon className="size-4 text-muted-foreground" />
          Unidade Jardins · Sala 2
        </li>
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          Reagendar
        </Button>
        <Button size="sm" className="flex-1">
          Registrar atendimento
        </Button>
      </div>
    </PopoverContent>
  </Popover>
)

export const SideRight = () => (
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">Comissão do profissional</span>
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Como a comissão é calculada" />}>
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle>Como é calculada</PopoverTitle>
          <PopoverDescription>
            30% do valor de cada serviço atendido, descontados os produtos usados no atendimento.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)

export const PeriodFilter = () => (
  <Popover defaultOpen>
    <PopoverTrigger render={<Button variant="outline" className="justify-start font-normal" aria-label="Filtrar por período" />}>
      <CalendarIcon data-icon="inline-start" />
      13 de out. – 17 de out. de 2026
    </PopoverTrigger>
    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
      <Calendar
        mode="range"
        locale={ptBR}
        defaultMonth={new Date(2026, 9, 1)}
        selected={{ from: new Date(2026, 9, 13), to: new Date(2026, 9, 17) }}
      />
    </PopoverContent>
  </Popover>
)
