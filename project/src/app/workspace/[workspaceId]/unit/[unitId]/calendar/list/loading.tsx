import {
  CalendarHeadingSkeleton,
  FiltersSkeleton,
  PageSkeleton,
  PaginationSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <CalendarHeadingSkeleton section />
      <FiltersSkeleton selects={3} />
      <TableSkeleton columns={6} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
