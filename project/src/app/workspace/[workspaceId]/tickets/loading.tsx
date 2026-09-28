import { HeadingSkeleton, PageSkeleton, TableSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton action />
      <TableSkeleton columns={4} rows={3} />
    </PageSkeleton>
  )
}
