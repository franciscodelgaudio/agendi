import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "agendi"
import { CircleDollarSignIcon, ClockIcon, LeafIcon, UserIcon, UsersIcon } from "lucide-react"

const BOOKINGS = [
  { day: "qui., 29 de out.", time: "09:00–10:00", client: "Mariana Souza", pro: "Camila Rocha", service: "Massagem relaxante", extra: "60 min · Sala 2", price: "R$ 180,00", status: "Atendido" },
  { day: "qui., 29 de out.", time: "10:30–11:20", client: "Rafael Lima", pro: "Bruno Martins", service: "Drenagem linfática", extra: "50 min · Sala 1", price: "R$ 150,00", status: "Atendido" },
  { day: "qui., 29 de out.", time: "14:00–14:45", client: "Juliana Alves", pro: "Camila Rocha", service: "Limpeza de pele profunda com extração e máscara calmante", extra: "45 min · Sala 3", price: "R$ 220,00", status: "Confirmado" },
  { day: "sex., 30 de out.", time: "08:30–09:30", client: "Pedro Henrique Oliveira", pro: "Ana Beatriz", service: "Reflexologia podal", extra: "60 min · Sala 2", price: "R$ 140,00", status: "Pendente" },
  { day: "sex., 30 de out.", time: "11:00–12:30", client: "Fernanda Costa", pro: "Bruno Martins", service: "Day spa completo", extra: "90 min · Sala 1", price: "R$ 390,00", status: "Confirmado" },
]

function Head({ icon: Icon, label, className }: { icon: typeof ClockIcon; label: string; className?: string }) {
  return (
    <TableHead className={`px-4 ${className ?? ""}`}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}

export const Bookings = () => (
  <div className="border">
    <Table>
      <TableHeader>
        <TableRow>
          <Head icon={ClockIcon} label="Horário" />
          <Head icon={UsersIcon} label="Cliente" />
          <Head icon={UserIcon} label="Profissional" className="@max-4xl:hidden" />
          <Head icon={LeafIcon} label="Serviço" className="w-full @max-lg:hidden" />
          <Head icon={CircleDollarSignIcon} label="Valor" className="text-right" />
          <TableHead className="px-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {BOOKINGS.map((b) => (
          <TableRow key={b.client}>
            <TableCell className="px-4">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{b.day}</span>
                <span className="text-muted-foreground tabular-nums">· {b.time}</span>
              </span>
            </TableCell>
            <TableCell className="px-4 font-medium">{b.client}</TableCell>
            <TableCell className="px-4 @max-4xl:hidden">{b.pro}</TableCell>
            <TableCell className="max-w-0 truncate px-4 @max-lg:hidden">
              {b.service} <span className="text-muted-foreground">· {b.extra}</span>
            </TableCell>
            <TableCell className="px-4 text-right tabular-nums">{b.price}</TableCell>
            <TableCell className="px-4">
              <Badge variant={b.status === "Atendido" ? "secondary" : "outline"}>{b.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

const PERIODS = [
  { label: "01/10 a 04/10", gross: "R$ 3.240,00", commission: "−R$ 486,00", expenses: "−R$ 920,00", net: "R$ 1.834,00" },
  { label: "05/10 a 11/10", gross: "R$ 5.910,00", commission: "−R$ 886,50", expenses: "−R$ 1.310,00", net: "R$ 3.713,50" },
  { label: "12/10 a 18/10", gross: "R$ 4.780,00", commission: "−R$ 717,00", expenses: "−R$ 640,00", net: "R$ 3.423,00" },
  { label: "19/10 a 25/10", gross: "R$ 6.120,00", commission: "−R$ 918,00", expenses: "−R$ 1.150,00", net: "R$ 4.052,00" },
  { label: "26/10 a 31/10", gross: "R$ 2.380,00", commission: "−R$ 357,00", expenses: "R$ 0,00", net: "R$ 2.023,00", current: true },
]

export const CashFlow = () => (
  <div className="border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-4">Período</TableHead>
          <TableHead className="px-4 text-right">Bruto</TableHead>
          <TableHead className="px-4 text-right @max-2xl:hidden">Comissão</TableHead>
          <TableHead className="px-4 text-right @max-2xl:hidden">Despesas</TableHead>
          <TableHead className="px-4 text-right">Líquido</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {PERIODS.map((p) => (
          <TableRow key={p.label} className={p.current ? "bg-muted/50" : undefined}>
            <TableCell className="px-4">
              {p.label}
              {p.current && <span className="ml-2 text-xs text-muted-foreground">(atual)</span>}
            </TableCell>
            <TableCell className="px-4 text-right tabular-nums">{p.gross}</TableCell>
            <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-2xl:hidden">{p.commission}</TableCell>
            <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-2xl:hidden">{p.expenses}</TableCell>
            <TableCell className="px-4 text-right font-medium tabular-nums">{p.net}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="px-4 font-semibold">Total</TableCell>
          <TableCell className="px-4 text-right tabular-nums">R$ 22.430,00</TableCell>
          <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-2xl:hidden">−R$ 3.364,50</TableCell>
          <TableCell className="px-4 text-right text-muted-foreground tabular-nums @max-2xl:hidden">−R$ 4.020,00</TableCell>
          <TableCell className="px-4 text-right font-medium tabular-nums">R$ 15.045,50</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  </div>
)

export const NoResults = () => (
  <div className="border">
    <Table>
      <TableHeader>
        <TableRow>
          <Head icon={ClockIcon} label="Horário" />
          <Head icon={UsersIcon} label="Cliente" />
          <Head icon={UserIcon} label="Profissional" />
          <Head icon={LeafIcon} label="Serviço" className="w-full" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={4} className="h-24 px-4 text-center text-muted-foreground">
            Nenhum agendamento encontrado.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
)
