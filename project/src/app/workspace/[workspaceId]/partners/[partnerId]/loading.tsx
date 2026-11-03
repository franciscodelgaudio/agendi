import { PageSkeleton, PaginationSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <TableSkeleton columns={4} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
