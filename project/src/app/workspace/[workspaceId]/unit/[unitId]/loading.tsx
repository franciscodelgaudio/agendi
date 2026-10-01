import { HeadingSkeleton, OverviewSkeleton, PageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <HeadingSkeleton section />
      <OverviewSkeleton />
    </PageSkeleton>
  )
}
