import {
  CalendarHeadingSkeleton,
  FiltersSkeleton,
  PageSkeleton,
  PaginationSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <CalendarHeadingSkeleton />
      <FiltersSkeleton selects={4} />
      <TableSkeleton columns={6} />
      <PaginationSkeleton />
    </PageSkeleton>
  )
}
