import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Blocos de carregamento que imitam as telas reais (mesmas medidas e espaçamentos), para a
// troca pelo conteúdo não mexer no layout. Usados pelos loading.tsx e fallbacks de Suspense.

// Região anunciada como "Carregando" para leitores de tela; os blocos em si ficam ocultos.
export function LoadingRegion({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">Carregando...</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  )
}

// Moldura das páginas do workspace; section = página dentro da unidade (a unidade já dá o espaço).
export function PageSkeleton({ section = false, children }: { section?: boolean; children: React.ReactNode }) {
  return (
    <LoadingRegion className={cn("flex flex-col gap-4", !section && "flex-1 p-4")}>{children}</LoadingRegion>
  )
}

// Título da página (h2) ou da seção da unidade (h3), com o botão de ação opcional.
export function HeadingSkeleton({ section = false, action = false }: { section?: boolean; action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Skeleton className={section ? "h-7 w-32" : "h-8 w-48"} />
      {action && <Skeleton className="h-9 w-28" />}
    </div>
  )
}

// Busca + selects de filtro.
export function FiltersSkeleton({ selects = 0 }: { selects?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full max-w-sm" />
      {Array.from({ length: selects }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full sm:w-44" />
      ))}
    </div>
  )
}

// Larguras variadas dão cara de texto real às linhas.
const CELL_WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-3/4", "w-1/3"]

// Tabela com cabeçalho e linhas; a primeira coluna ocupa o espaço livre, como nas listas.
export function TableSkeleton({
  columns = 4,
  rows = 8,
  avatar = false,
}: {
  columns?: number
  rows?: number
  // Primeira coluna com avatar (unidades, usuários, produtos...).
  avatar?: boolean
}) {
  const rest = Array.from({ length: columns - 1 }, (_, i) => i)
  return (
    <div className="@container border">
      <div className="flex h-10 items-center gap-6 border-b px-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex-1" />
        {rest.map((i) => (
          <Skeleton key={i} className={cn("h-4 w-16", i < columns - 2 && "@max-xl:hidden")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-12 items-center gap-6 border-b px-4 last:border-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {avatar && <Skeleton className="size-8 shrink-0 rounded-full" />}
            <Skeleton className={cn("h-4 max-w-64", CELL_WIDTHS[row % CELL_WIDTHS.length])} />
          </div>
          {rest.map((i) => (
            <Skeleton key={i} className={cn("h-4 w-16", i < columns - 2 && "@max-xl:hidden")} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Rodapé da paginação.
export function PaginationSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-40" />
    </div>
  )
}

// Página de lista padrão: título, filtros, tabela e paginação.
export function ListPageSkeleton({
  section = false,
  action = false,
  selects = 0,
  columns,
  avatar,
  pagination = false,
}: {
  section?: boolean
  action?: boolean
  selects?: number
  columns?: number
  avatar?: boolean
  pagination?: boolean
}) {
  return (
    <PageSkeleton section={section}>
      <HeadingSkeleton section={section} action={action} />
      <FiltersSkeleton selects={selects} />
      <TableSkeleton columns={columns} avatar={avatar} />
      {pagination && <PaginationSkeleton />}
    </PageSkeleton>
  )
}

function StatTileSkeleton() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-40" />
      </CardContent>
    </Card>
  )
}

function CardSkeleton({ className, contentClassName }: { className?: string; contentClassName: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className={contentClassName} />
      </CardContent>
    </Card>
  )
}

// Painel da visão geral (início do workspace e da unidade): indicadores, agenda, semana e rankings.
export function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton contentClassName="h-72 w-full" />
        <CardSkeleton contentClassName="h-72 w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} contentClassName="h-40 w-full" />
        ))}
      </div>
    </>
  )
}

// Calendário semanal: filtros, barra de navegação e a grade de horários.
export function CalendarSkeleton({ unitFilter = true }: { unitFilter?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {unitFilter && <Skeleton className="h-9 w-full sm:w-56" />}
          <Skeleton className="h-9 w-full sm:w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid h-[36rem] grid-cols-[3rem_repeat(7,1fr)] grid-rows-[2.5rem_1fr] overflow-hidden rounded-lg border">
        <div className="border-b" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center justify-center border-b border-l">
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
        <div className="flex flex-col gap-10 px-2 pt-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="relative border-l">
            {i % 2 === 0 && <Skeleton className="absolute inset-x-1 top-16 h-20" />}
            {i % 3 === 1 && <Skeleton className="absolute inset-x-1 top-56 h-14" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// Seletor Calendário/Lista ao lado do título.
export function CalendarHeadingSkeleton({ section = false }: { section?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Skeleton className={section ? "h-7 w-32" : "h-8 w-48"} />
      <Skeleton className="h-9 w-52" />
    </div>
  )
}

// Cabeçalho da unidade (avatar, nome e abas), enquanto o layout da unidade carrega.
export function UnitHeaderSkeleton() {
  return (
    <LoadingRegion className="contents">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-lg" />
        <Skeleton className="h-8 w-56" />
      </div>
      <TabsNavSkeleton widths={["w-24", "w-20", "w-24", "w-28", "w-20", "w-20", "w-16"]} />
    </LoadingRegion>
  )
}

// Abas sublinhadas (unidade, usuários), uma por largura de rótulo.
export function TabsNavSkeleton({ widths }: { widths: string[] }) {
  return (
    <div className="-mx-4 flex gap-1 px-4 pt-3 shadow-[inset_0_-1px_0_var(--border)]">
      {widths.map((width, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="size-4" />
          <Skeleton className={cn("h-4", width)} />
        </div>
      ))}
    </div>
  )
}

// Lista de conversas ao lado do painel vazio, enquanto a inbox carrega.
export function InboxSkeleton() {
  return (
    <LoadingRegion className="flex h-[calc(100svh-4rem)] min-h-0">
      <div className="flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0">
        <div className="flex h-12 shrink-0 items-center border-b px-4">
          <Skeleton className="h-5 w-24" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className={cn("h-4", CELL_WIDTHS[i % CELL_WIDTHS.length])} />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 md:block" />
    </LoadingRegion>
  )
}

const BUBBLES = [
  { outbound: false, width: "w-56" },
  { outbound: true, width: "w-40" },
  { outbound: false, width: "w-72" },
  { outbound: false, width: "w-32" },
  { outbound: true, width: "w-64" },
  { outbound: true, width: "w-44" },
]

// Conversa aberta: cabeçalho do contato, mensagens e a caixa de resposta.
export function ConversationSkeleton() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Skeleton className="size-8 rounded-full" />
        <div className="grid gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-4">
        {BUBBLES.map((bubble, i) => (
          <Skeleton
            key={i}
            className={cn("h-9 max-w-[80%] rounded-lg", bubble.width, bubble.outbound ? "self-end" : "self-start")}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-end gap-2 border-t p-3">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="size-9" />
      </div>
    </LoadingRegion>
  )
}
