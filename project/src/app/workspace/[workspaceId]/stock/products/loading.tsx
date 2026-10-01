import { FiltersSkeleton, PageSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <FiltersSkeleton />
      <TableSkeleton columns={5} avatar />
    </PageSkeleton>
  )
}
