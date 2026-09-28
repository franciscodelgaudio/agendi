import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { signIn } from "@/auth"
import { LoginForm } from "@/components/login-form"

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Email ou senha inválidos.",
  OAuthAccountNotLinked:
    "Este email já está cadastrado com outro método de login.",
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { callbackUrl, error } = await searchParams
  const redirectTo = typeof callbackUrl === "string" ? callbackUrl : "/workspace"
  const errorMessage =
    typeof error === "string"
      ? (errorMessages[error] ?? "Não foi possível entrar. Tente novamente.")
      : null

  async function loginWithGoogle() {
    "use server"
    await signIn("google", { redirectTo })
  }

  async function loginWithCredentials(formData: FormData) {
    "use server"
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo,
      })
    } catch (e) {
      if (e instanceof AuthError) {
        const params = new URLSearchParams({ error: e.type, callbackUrl: redirectTo })
        redirect(`/login?${params}`)
      }
      // O signIn de sucesso lança o NEXT_REDIRECT, que precisa subir.
      throw e
    }
  }

  return (
    <LoginForm
      credentialsAction={loginWithCredentials}
      googleAction={loginWithGoogle}
      error={errorMessage}
      signupHref={typeof callbackUrl === "string" ? `/signup?${new URLSearchParams({ callbackUrl })}` : "/signup"}
    />
  )
}
