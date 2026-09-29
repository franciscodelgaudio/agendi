import { Types } from "mongoose"
import { auth } from "@/auth"
import { createPlanCharge } from "@/lib/abacatepay"
import { startCheckout } from "@/lib/billing"
import { Checkout } from "@/models/Checkout"
import { Workspace } from "@/models/Workspace"

// "Assinar agora" da landing e da tela de planos: /assinar?plano=[&workspace=].
// Sem sessão, o proxy manda para o login com callbackUrl e o usuário volta para cá.
// É GET porque vem de um link; cada clique cria uma cobrança pendente nova.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = (await auth())?.user
  const userId = user?.id && Types.ObjectId.isValid(user.id) ? user.id : null

  const result = await startCheckout(
    {
      plan: url.searchParams.get("plano"),
      workspaceId: url.searchParams.get("workspace"),
    },
    { userId, email: user?.email ?? "", name: user?.name ?? "" },
    {
      ownsWorkspace: async (workspaceId, ownerId) =>
        Types.ObjectId.isValid(workspaceId) && !!(await Workspace.exists({ _id: workspaceId, userId: ownerId })),
      insertCheckout: async (data) => {
        const checkout = await Checkout.create(data)
        return { id: checkout._id.toString() }
      },
      createCharge: createPlanCharge,
      attachCharge: async (checkoutId, chargeId) => {
        await Checkout.updateOne({ _id: checkoutId }, { $set: { chargeId } })
      },
    },
  )

  if (result.ok) return Response.redirect(result.url, 303)
  if (result.error === "unauthenticated") {
    const login = new URL("/login", url)
    login.searchParams.set("callbackUrl", `${url.pathname}${url.search}`)
    return Response.redirect(login, 303)
  }
  return Response.redirect(new URL("/#planos", url), 303)
}
