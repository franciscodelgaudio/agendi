import { PageSkeleton, PaginationSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <TableSkeleton columns={3} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
