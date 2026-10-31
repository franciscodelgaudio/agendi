import { LoadingRegion } from "@/components/shared/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-full flex-[1_1_220px] flex-col gap-3 border p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    </LoadingRegion>
  )
}
