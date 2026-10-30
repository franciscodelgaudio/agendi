import { Button, Spinner } from "agendi"
import { LogOutIcon } from "lucide-react"

export const InlineLoading = () => (
  <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
    <Spinner />
    Carregando agenda...
  </div>
)

export const Sizes = () => (
  <div className="flex items-center gap-6">
    <Spinner className="size-4" />
    <Spinner className="size-5 text-muted-foreground" />
    <Spinner className="size-6 text-primary" />
    <Spinner className="size-8 text-primary" />
  </div>
)

export const InButton = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button disabled>
      <Spinner data-icon="inline-start" />
      Salvando...
    </Button>
    <Button variant="outline" disabled>
      <Spinner data-icon="inline-start" />
      Saindo...
    </Button>
    <Button variant="ghost">
      <LogOutIcon data-icon="inline-start" />
      Sair
    </Button>
  </div>
)

// Tela de entrada do app, antes de existir moldura para os skeletons.
export const LoadingScreen = () => (
  <div role="status" className="flex h-48 w-72 flex-col items-center justify-center gap-6 border">
    <span className="text-2xl font-semibold tracking-tight">Agendi</span>
    <Spinner className="size-5 text-muted-foreground" aria-hidden />
  </div>
)
