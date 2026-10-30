import { Badge } from "agendi"
import { CheckIcon, ClockIcon, CircleAlertIcon, ArrowUpRightIcon, BadgeCheckIcon } from "lucide-react"

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Administrador</Badge>
    <Badge variant="secondary">Recepcionista</Badge>
    <Badge variant="outline">Convite pendente</Badge>
    <Badge variant="destructive">Cancelado</Badge>
    <Badge variant="ghost">Rascunho</Badge>
    <Badge variant="link">Ver detalhes</Badge>
  </div>
)

export const BookingStatus = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Em andamento</Badge>
    <Badge variant="secondary">Confirmado</Badge>
    <Badge variant="outline">Próximo</Badge>
    <Badge variant="outline">Aguardando registro</Badge>
    <Badge variant="destructive">Não compareceu</Badge>
  </div>
)

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>
      <CheckIcon data-icon="inline-start" />
      Paga
    </Badge>
    <Badge variant="outline">
      <ClockIcon data-icon="inline-start" />
      Pendente
    </Badge>
    <Badge variant="secondary">
      <BadgeCheckIcon data-icon="inline-start" />
      Verificado
    </Badge>
    <Badge variant="destructive">
      <CircleAlertIcon data-icon="inline-start" />
      Vencida
    </Badge>
    <Badge variant="outline" render={<a href="#" />}>
      Abrir chamado
      <ArrowUpRightIcon data-icon="inline-end" />
    </Badge>
  </div>
)

export const InContext = () => (
  <div className="flex w-80 flex-col gap-3 text-sm">
    {[
      { name: "Ana Paula Ribeiro", role: "Administrador", variant: "default" as const },
      { name: "Bruno Carvalho", role: "Massoterapeuta", variant: "secondary" as const },
      { name: "Camila Duarte", role: "Sem função", variant: "outline" as const },
    ].map((p) => (
      <div key={p.name} className="flex items-center justify-between gap-2">
        <span className="font-medium">{p.name}</span>
        <Badge variant={p.variant}>{p.role}</Badge>
      </div>
    ))}
  </div>
)
