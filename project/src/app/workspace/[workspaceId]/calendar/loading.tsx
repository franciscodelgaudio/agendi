import { CalendarHeadingSkeleton, CalendarSkeleton, PageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <CalendarHeadingSkeleton />
      <CalendarSkeleton />
    </PageSkeleton>
  )
}
