import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "agendi"
import { CalendarIcon, CalendarPlusIcon, MessagesSquareIcon, PlusIcon, ReceiptIcon } from "lucide-react"

export const NoBookings = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CalendarIcon />
      </EmptyMedia>
      <EmptyTitle>Nenhum agendamento</EmptyTitle>
      <EmptyDescription>
        Agende escolhendo o profissional, a unidade, o serviço, o cliente e o horário.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button>
        <CalendarPlusIcon data-icon="inline-start" />
        Novo agendamento
      </Button>
    </EmptyContent>
  </Empty>
)

export const NoExpenses = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <ReceiptIcon />
      </EmptyMedia>
      <EmptyTitle>Nenhuma despesa neste mês</EmptyTitle>
      <EmptyDescription>
        Lance aluguel, produtos e contas da unidade para acompanhar o caixa. <a href="#">Ver planejamento</a>
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button variant="outline">
        <PlusIcon data-icon="inline-start" />
        Lançar despesa
      </Button>
    </EmptyContent>
  </Empty>
)

export const NoConversation = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <MessagesSquareIcon />
      </EmptyMedia>
      <EmptyTitle>Selecione uma conversa</EmptyTitle>
    </EmptyHeader>
  </Empty>
)
