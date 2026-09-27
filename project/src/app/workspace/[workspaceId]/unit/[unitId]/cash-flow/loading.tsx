import { PageSkeleton, TableSkeleton } from "@/components/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageSkeleton section>
      <Skeleton className="h-20" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>
      <TableSkeleton columns={5} rows={7} />
      <Skeleton className="mt-4 h-5 w-28" />
      <TableSkeleton columns={4} rows={3} />
      <Skeleton className="mt-4 h-5 w-32" />
      <TableSkeleton columns={4} rows={3} avatar />
    </PageSkeleton>
  )
}
