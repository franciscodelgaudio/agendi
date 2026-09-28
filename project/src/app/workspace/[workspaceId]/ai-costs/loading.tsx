import { HeadingSkeleton, PageSkeleton, TableSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton />
      <TableSkeleton columns={5} rows={5} />
    </PageSkeleton>
  )
}
