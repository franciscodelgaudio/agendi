import { Button } from "agendi"
import { CalendarPlusIcon, DownloadIcon, PlusIcon, Trash2Icon, MoreHorizontalIcon, ArrowRightIcon } from "lucide-react"

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>Novo agendamento</Button>
    <Button variant="outline">Exportar</Button>
    <Button variant="secondary">Ver agenda</Button>
    <Button variant="ghost">Cancelar</Button>
    <Button variant="destructive">Excluir cliente</Button>
    <Button variant="link">Esqueceu sua senha?</Button>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="xs">Extra pequeno</Button>
    <Button size="sm">Pequeno</Button>
    <Button>Padrão</Button>
    <Button size="lg">Grande</Button>
  </div>
)

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>
      <CalendarPlusIcon data-icon="inline-start" />
      Agendar horário
    </Button>
    <Button variant="outline">
      <DownloadIcon data-icon="inline-start" />
      Baixar PDF
    </Button>
    <Button variant="secondary">
      Continuar
      <ArrowRightIcon data-icon="inline-end" />
    </Button>
  </div>
)

export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="icon" aria-label="Adicionar">
      <PlusIcon />
    </Button>
    <Button size="icon-sm" variant="outline" aria-label="Mais ações">
      <MoreHorizontalIcon />
    </Button>
    <Button size="icon-sm" variant="ghost" aria-label="Excluir">
      <Trash2Icon />
    </Button>
  </div>
)

export const States = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button loading>Salvando</Button>
    <Button variant="outline" loading>
      Enviando convite
    </Button>
    <Button disabled>Indisponível</Button>
    <Button size="icon" variant="outline" loading aria-label="Carregando" />
  </div>
)
