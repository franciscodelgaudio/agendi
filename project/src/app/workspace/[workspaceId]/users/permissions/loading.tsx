import { PageSkeleton, TableSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <TableSkeleton columns={3} rows={15} />
    </PageSkeleton>
  )
}
