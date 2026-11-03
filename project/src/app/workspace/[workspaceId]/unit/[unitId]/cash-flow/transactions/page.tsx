import { redirect } from "next/navigation"

export default async function UnitTransactionsPage({
  params,
  searchParams,
}: PageProps<"/workspace/[workspaceId]/unit/[unitId]/cash-flow/transactions">) {
  const { workspaceId, unitId } = await params
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  )
  redirect(`/workspace/${workspaceId}/unit/${unitId}/cash-flow${query.size ? `?${query}` : ""}`)
}
