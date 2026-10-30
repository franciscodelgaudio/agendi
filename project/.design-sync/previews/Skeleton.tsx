import { Card, CardContent, Skeleton } from "agendi"

const CELL_WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-3/4"]

// Linhas de lista com avatar, como o TableSkeleton das páginas de unidades e usuários.
export const ListRows = () => (
  <div className="w-80 border">
    <div className="flex h-10 items-center gap-6 border-b px-4">
      <Skeleton className="h-4 w-24" />
      <div className="flex-1" />
      <Skeleton className="h-4 w-16" />
    </div>
    {CELL_WIDTHS.map((width) => (
      <div key={width} className="flex h-12 items-center gap-6 border-b px-4 last:border-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className={`h-4 max-w-64 ${width}`} />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
)

// Indicador da tela inicial (faturamento, serviços...) enquanto carrega.
export const StatTile = () => (
  <Card size="sm" className="w-64">
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

// Cabeçalho de página com botão de ação e filtros.
export const PageHeading = () => (
  <div className="flex w-80 flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-28" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="h-9 flex-1" />
      <Skeleton className="h-9 w-24" />
    </div>
  </div>
)
