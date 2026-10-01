import { HeadingSkeleton, OverviewSkeleton, PageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <HeadingSkeleton action />
      <OverviewSkeleton />
    </PageSkeleton>
  )
}
