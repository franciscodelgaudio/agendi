import { FiltersSkeleton, PageSkeleton, PaginationSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton section>
      <Skeleton className="h-8 w-24" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="grid gap-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-1.5 border p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <FiltersSkeleton selects={2} />
      <TableSkeleton columns={5} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
