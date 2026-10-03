import { ListPageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return <ListPageSkeleton section action selects={2} columns={6} pagination />
}
