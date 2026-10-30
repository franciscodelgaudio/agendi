import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "agendi"

export const TodaySchedule = () => (
  <Card className="w-96">
    <CardHeader>
      <CardTitle>Agenda de hoje</CardTitle>
      <CardDescription>4 agendamentos · 2 confirmados</CardDescription>
      <CardAction>
        <Button variant="link" size="sm">
          Agenda
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      {[
        { time: "09:00", client: "Mariana Souza", service: "Corte feminino", status: "Confirmado" },
        { time: "10:30", client: "Rafael Lima", service: "Barba e bigode", status: "Confirmado" },
        { time: "14:00", client: "Juliana Alves", service: "Coloração", status: "Pendente" },
      ].map((b) => (
        <div key={b.time} className="flex items-center gap-3">
          <span className="w-12 font-mono text-xs text-muted-foreground tabular-nums">{b.time}</span>
          <div className="flex flex-1 flex-col">
            <span className="font-medium">{b.client}</span>
            <span className="text-xs text-muted-foreground">{b.service}</span>
          </div>
          <Badge variant={b.status === "Confirmado" ? "secondary" : "outline"}>{b.status}</Badge>
        </div>
      ))}
    </CardContent>
  </Card>
)

export const Stat = () => (
  <Card size="sm" className="w-64">
    <CardHeader>
      <CardTitle>Faturamento do mês</CardTitle>
      <CardDescription>Outubro de 2026</CardDescription>
    </CardHeader>
    <CardContent className="gap-1">
      <span className="text-2xl font-semibold tabular-nums">R$ 18.430,00</span>
      <span className="text-xs text-muted-foreground">+12% em relação a setembro</span>
    </CardContent>
  </Card>
)

export const WithFooter = () => (
  <Card className="w-96">
    <CardHeader className="border-b">
      <CardTitle>Plano Profissional</CardTitle>
      <CardDescription>Até 5 profissionais e agendamento online ilimitado.</CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>Lembretes automáticos por email</li>
        <li>Relatórios de caixa e despesas</li>
        <li>Página de agendamento personalizada</li>
      </ul>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <span className="text-lg font-semibold tabular-nums">R$ 89/mês</span>
      <Button>Assinar</Button>
    </CardFooter>
  </Card>
)
