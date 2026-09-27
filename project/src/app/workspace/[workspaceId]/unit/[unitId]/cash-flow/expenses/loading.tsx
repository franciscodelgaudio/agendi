import { PageSkeleton, TableSkeleton } from "@/components/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <TableSkeleton columns={5} rows={6} />
    </PageSkeleton>
  )
}
