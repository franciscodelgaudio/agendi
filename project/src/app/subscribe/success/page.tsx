import { redirect } from "next/navigation"
import { Types } from "mongoose"
import { AutoRefresh } from "@/components/auto-refresh"
import { Spinner } from "@/components/ui/spinner"
import { requireUser } from "@/lib/session"
import { Checkout } from "@/models/Checkout"

// completionUrl do checkout da AbacatePay. O acesso é liberado pelo webhook, que pode chegar
// alguns segundos depois do redirecionamento: a página recarrega até a cobrança constar como paga.
export default async function CheckoutDonePage({ searchParams }: PageProps<"/subscribe/success">) {
  const user = await requireUser()
  const { checkout: checkoutId } = await searchParams
  const checkout =
    typeof checkoutId === "string" && Types.ObjectId.isValid(checkoutId)
      ? await Checkout.findOne({ _id: checkoutId, userId: user.id }).select("status").lean()
      : null

  if (!checkout || checkout.status === "paid") redirect("/workspace")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <AutoRefresh intervalMs={4000} />
      <Spinner className="size-6" />
      <h1 className="text-xl font-semibold">Confirmando o pagamento</h1>
      <p className="text-sm text-muted-foreground">O acesso é liberado assim que a AbacatePay confirmar.</p>
    </div>
  )
}
