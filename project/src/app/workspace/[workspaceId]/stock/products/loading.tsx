import { FiltersSkeleton, PageSkeleton, TableSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <FiltersSkeleton />
      <TableSkeleton columns={5} avatar />
    </PageSkeleton>
  )
}
