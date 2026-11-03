import { FiltersSkeleton, PageSkeleton, PaginationSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <FiltersSkeleton selects={1} action />
      <TableSkeleton columns={4} avatar />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
