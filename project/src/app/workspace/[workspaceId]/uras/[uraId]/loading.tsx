import { Skeleton } from "@/components/ui/skeleton"
import { LoadingRegion } from "@/components/page-skeletons"

export default function Loading() {
  return (
    <LoadingRegion className="flex h-svh flex-col">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-8 w-60" />
        <Skeleton className="ml-auto h-8 w-40" />
      </div>
      <div className="flex flex-1">
        <div className="hidden w-52 flex-col gap-2 border-r p-3 md:flex">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
        <div className="flex-1" />
      </div>
    </LoadingRegion>
  )
}
