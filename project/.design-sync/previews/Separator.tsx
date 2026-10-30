import { Separator } from "agendi"

export const Horizontal = () => (
  <div className="flex w-72 flex-col gap-4">
    <div className="grid gap-1">
      <span className="text-sm font-medium">Spa Central · Unidade Pinheiros</span>
      <span className="text-sm text-muted-foreground">Rua dos Pinheiros, 1200 · São Paulo</span>
    </div>
    <Separator />
    <div className="grid gap-2 text-sm">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Profissionais</span>
        <span className="tabular-nums">6</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Salas</span>
        <span className="tabular-nums">4</span>
      </div>
    </div>
  </div>
)

export const Vertical = () => (
  <div className="flex h-5 items-center gap-4 text-sm">
    <span className="font-medium">Agenda</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">Lista</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">Semana</span>
    <Separator orientation="vertical" />
    <span className="text-muted-foreground">Mês</span>
  </div>
)

export const BookingSummary = () => (
  <div className="flex w-80 flex-col gap-3 border p-4 text-sm">
    <span className="font-medium">Resumo do agendamento</span>
    <Separator />
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">Massagem relaxante · 60 min</span>
      <span className="shrink-0 tabular-nums">R$ 180,00</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">Esfoliação corporal</span>
      <span className="shrink-0 tabular-nums">R$ 90,00</span>
    </div>
    <Separator />
    <div className="flex justify-between font-medium">
      <span>Total</span>
      <span className="tabular-nums">R$ 270,00</span>
    </div>
  </div>
)
