import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

type Props = {
  // Os demais campos da query (busca, filtros, ordenação) são preservados nos links.
  query: Record<string, string>
  page: number
  pageSize: number
  total: number
  pathname: string
  // Plural do que está sendo listado, para a faixa ("1–20 de 45 agendamentos").
  itemLabel: string
}

// Primeira, última e as vizinhas da atual; null marca um salto (reticências).
function visiblePages(page: number, pages: number) {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]))
}

const disabledLink = { "aria-disabled": true, tabIndex: -1, className: "pointer-events-none opacity-50" }

// Anterior/próxima e páginas numeradas, com a faixa mostrada; some quando tudo cabe numa página.
export function ListPagination({ query, page, pageSize, total, pathname, itemLabel }: Props) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  function pageHref(target: number) {
    // A página 1 fica fora da URL, como os demais valores padrão.
    const params = new URLSearchParams(
      Object.entries({ ...query, page: target > 1 ? String(target) : "" }).filter(([, value]) => value),
    )
    return `${pathname}?${params}`
  }
  const firstRow = (page - 1) * pageSize + 1
  const lastRow = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {firstRow}–{lastRow} de {total} {itemLabel}
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={pageHref(Math.max(page - 1, 1))}
              replace
              {...(page > 1 ? {} : disabledLink)}
            />
          </PaginationItem>
          {visiblePages(page, pages).map((n, i) =>
            n === null ? (
              <PaginationItem key={`gap-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={n}>
                <PaginationLink href={pageHref(n)} replace isActive={n === page} className="tabular-nums">
                  {n}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href={pageHref(Math.min(page + 1, pages))}
              replace
              {...(page < pages ? {} : disabledLink)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
