import {
  FiltersSkeleton,
  HeadingSkeleton,
  PageSkeleton,
  PaginationSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton section>
      <HeadingSkeleton section action />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>
      <TableSkeleton columns={4} rows={5} />
      <div className="mt-4">
        <FiltersSkeleton selects={1} />
      </div>
      <TableSkeleton columns={6} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
