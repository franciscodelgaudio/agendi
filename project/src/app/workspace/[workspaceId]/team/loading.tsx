import { ListPageSkeleton } from "@/components/shared/page-skeletons"

export default function Loading() {
  return <ListPageSkeleton selects={3} columns={5} avatar pagination />
}
