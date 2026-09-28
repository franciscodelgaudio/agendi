import { ListPageSkeleton } from "@/components/page-skeletons"

export default function Loading() {
  return <ListPageSkeleton selects={3} columns={5} avatar pagination />
}
