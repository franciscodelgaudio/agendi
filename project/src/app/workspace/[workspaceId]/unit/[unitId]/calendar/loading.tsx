import { CalendarHeadingSkeleton, CalendarSkeleton, PageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return (
    <PageSkeleton section>
      <CalendarHeadingSkeleton section />
      <CalendarSkeleton unitFilter={false} />
    </PageSkeleton>
  )
}
