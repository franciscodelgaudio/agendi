import { ListPageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return <ListPageSkeleton section selects={3} columns={4} avatar />
}
